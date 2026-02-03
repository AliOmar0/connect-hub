import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    // 1. Webhook Verification (GET)
    if (req.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "whatsapp";

      if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("Webhook verified successfully!");
        return new Response(challenge, { status: 200 });
      } else {
        return new Response("Forbidden", { status: 403 });
      }
    }

    // 2. Incoming Messages (POST) or Outbound Action
    if (req.method === "POST") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let payload: any;
      const bodyText = await req.text();
      try {
        payload = JSON.parse(bodyText);
        console.log("DEBUG: Received POST payload:", JSON.stringify(payload));
      } catch (e) {
        console.error(
          "DEBUG: Failed to parse JSON payload. Raw body:",
          bodyText,
        );
        return new Response("Invalid JSON", { status: 400 });
      }

      // Supabase Client
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // --- OUTBOUND MESSAGE HANDLING ---
      if (payload.action === "send_message") {
        const { sessionId, content, dbMessageId } = payload;
        if (!sessionId || !content)
          throw new Error("sessionId and content required");

        // 1. Get Session & Customer Info
        const { data: session, error: sessError } = await supabase
          .from("sessions")
          .select("*, customer:customers(*)")
          .eq("id", sessionId)
          .single();

        if (sessError || !session) throw new Error("Session not found");

        // 2. Get API Config
        const { data: config, error: confError } = await supabase
          .from("api_configurations")
          .select("*")
          .eq("channel", "whatsapp")
          .single();

        if (confError || !config)
          throw new Error("WhatsApp configuration not found");
        if (!config.access_token_encrypted || !config.phone_number_id)
          throw new Error("WhatsApp not fully configured");

        const accessToken = config.access_token_encrypted;
        const phoneId = config.phone_number_id;

        // 3. Send to WhatsApp Graph API
        const whatsappUrl = `https://graph.facebook.com/v22.0/${phoneId}/messages`;

        console.log(
          `Sending WhatsApp message to ${session.customer.phone}: ${content}`,
        );

        const response = await fetch(whatsappUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: session.customer.phone,
            text: { body: content },
            type: "text",
          }),
        });

        const responseData = await response.json();

        if (!response.ok) {
          console.error("WhatsApp API Error:", responseData);
          throw new Error(
            `WhatsApp API Error: ${JSON.stringify(responseData)}`,
          );
        }

        const wamid = responseData.messages?.[0]?.id;

        // Update the message in our DB with the WhatsApp Message ID
        if (wamid && dbMessageId) {
          await supabase
            .from("messages")
            .update({ external_message_id: wamid, status: "sent" })
            .eq("id", dbMessageId);
        }

        return new Response(
          JSON.stringify({ success: true, data: responseData }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      // Process WhatsApp Payload (Standard Structure)
      if (payload.object === "whatsapp_business_account") {
        const changes = payload.entry?.[0]?.changes?.[0];

        if (changes?.value?.messages?.[0]) {
          const message = changes.value.messages[0];
          const contact = changes.value.contacts?.[0];
          const metadata = changes.value.metadata;

          const from = message.from; // Phone number
          const name = contact?.profile?.name || from;
          const text =
            message.text?.body ||
            message.button?.text ||
            message.interactive?.button_reply?.title ||
            "";
          const messageId = message.id;

          console.log(`NEW MESSAGE FROM ${from}: ${text}`);

          // 0. Verify this message is for us (Check metadata.phone_number_id against api_configurations)
          if (metadata?.phone_number_id) {
            const { data: config } = await supabase
              .from("api_configurations")
              .select("phone_number_id")
              .eq("channel", "whatsapp")
              .eq("phone_number_id", metadata.phone_number_id)
              .maybeSingle();

            // Optional: You could reject here if config is missing, to enforce using the table.
            // For now we just log it.
            if (!config) {
              console.warn(
                `Received webhook for unknown phone_number_id: ${metadata.phone_number_id}`,
              );
            }
          }

          // 1. Find or Create Customer
          const { data: customer, error: customerError } = await supabase
            .from("customers")
            .select("id")
            .eq("phone", from)
            .maybeSingle();

          let customerId;

          if (!customer) {
            const { data: newCustomer, error: createError } = await supabase
              .from("customers")
              .insert({
                phone: from,
                name: name,
                preferred_channel: "whatsapp",
                channel_identifier: from,
              })
              .select()
              .single();

            if (createError) throw createError;
            customerId = newCustomer.id;
          } else {
            customerId = customer.id;
          }

          // 2. Find Active Session
          const { data: session } = await supabase
            .from("sessions")
            .select("id")
            .eq("customer_id", customerId)
            .eq("status", "active")
            .maybeSingle();

          let sessionId = session?.id;

          // 3. Create Session if none exists
          if (!sessionId) {
            const { data: newSession, error: sessionError } = await supabase
              .from("sessions")
              .insert({
                customer_id: customerId,
                channel: "whatsapp",
                status: "waiting",
                started_at: new Date().toISOString(),
              })
              .select()
              .single();

            if (sessionError) throw sessionError;
            sessionId = newSession.id;
          }

          // 4. Insert Message
          const { error: msgError } = await supabase.from("messages").insert({
            session_id: sessionId,
            direction: "inbound",
            content: text,
            channel: "whatsapp",
            external_message_id: messageId,
            sent_at: new Date(Number(message.timestamp) * 1000).toISOString(),
          });

          if (msgError) throw msgError;

          return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        }

        // 2. Handle Message Status Updates (Delivered, Read, Failed)
        if (changes?.value?.statuses?.[0]) {
          const statuses = changes.value.statuses;

          for (const status of statuses) {
            const messageId = status.id;
            const statusState = status.status; // sent, delivered, read, failed
            const timestamp = new Date(
              Number(status.timestamp) * 1000,
            ).toISOString();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const updateData: any = {
              status: statusState,
              updated_at: new Date().toISOString(),
            };

            if (statusState === "delivered") {
              updateData.delivered_at = timestamp;
            } else if (statusState === "read") {
              updateData.read_at = timestamp;
              updateData.delivered_at = updateData.delivered_at || timestamp; // Ensure delivered is set if read
            } else if (statusState === "failed") {
              updateData.failure_reason =
                status.errors?.[0]?.message || "Unknown error";
            }

            console.log(`Updating message ${messageId} to ${statusState}`);

            const { error: updateError } = await supabase
              .from("messages")
              .update(updateData)
              .eq("external_message_id", messageId);

            if (updateError) {
              console.error(
                `Error updating message status for ${messageId}:`,
                updateError,
              );
            }
          }

          return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        }
      }

      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    return new Response("Method not allowed", { status: 405 });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
