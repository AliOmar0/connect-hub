// Persist Twilio voice-call activity into Supabase so calls show up live in the
// dashboard (Active Sessions panel + Sessions page + Analytics), exactly like
// WhatsApp/web sessions. Uses the service-role key to bypass RLS for these
// server-side writes.
//
// Data written:
//   customers  - one row per caller phone (reused on repeat calls)
//   sessions   - one row per call (channel='voice'); status active -> escalated/completed
//   calls      - one row per call (direction inbound, phone number, duration)
//   messages   - inbound (caller speech) + outbound (AI reply) per turn
//
// The CallSid -> {sessionId, customerId, callId} mapping is cached in the same
// Redis session used for the call so every turn/webhook reuses one session row.
import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger.js";
import { getSession, saveSession } from "./redis.js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let admin = null;
if (supabaseUrl && serviceKey) {
  admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
} else {
  logger.warn(
    "SUPABASE_SERVICE_ROLE_KEY not set - voice calls will not be shown in the dashboard.",
  );
}

export function isCallSessionConfigured() {
  return !!admin;
}

// A human-friendly display name for an unknown caller.
function callerName(phone) {
  if (!phone) return "Phone Caller";
  // Browser Twilio Client identities come through as e.g. "client:pib_agent".
  if (phone.startsWith("client:")) return `Web Caller (${phone.slice(7)})`;
  return `Caller ${phone}`;
}

async function findOrCreateCustomer(phone) {
  if (!admin) return null;
  try {
    if (phone) {
      const { data: existing } = await admin
        .from("customers")
        .select("id")
        .eq("phone", phone)
        .limit(1)
        .maybeSingle();
      if (existing?.id) return existing.id;
    }
    const { data, error } = await admin
      .from("customers")
      .insert({
        name: callerName(phone),
        phone: phone || null,
        preferred_channel: "voice",
        channel_identifier: phone || null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  } catch (e) {
    logger.error({ err: e.message }, "callSessions.findOrCreateCustomer failed");
    return null;
  }
}

// Ensure a Supabase session (+ call) row exists for this CallSid; cache the ids
// on the Redis call session so subsequent turns reuse the same rows.
async function ensureSession(callSid, phone) {
  const session = (await getSession(callSid)) || {};
  if (session.voiceMeta?.sessionId) return session.voiceMeta;

  const customerId = await findOrCreateCustomer(phone);
  const nowIso = new Date().toISOString();

  const { data: sess, error: sessErr } = await admin
    .from("sessions")
    .insert({
      customer_id: customerId,
      channel: "voice",
      status: "active",
      started_at: nowIso,
    })
    .select("id")
    .single();
  if (sessErr) {
    logger.error({ err: sessErr.message }, "callSessions.createSession failed");
    return null;
  }

  let callId = null;
  const { data: call, error: callErr } = await admin
    .from("calls")
    .insert({
      session_id: sess.id,
      customer_id: customerId,
      direction: "inbound",
      phone_number: phone || null,
      status: "in-progress",
      started_at: nowIso,
    })
    .select("id")
    .maybeSingle();
  if (callErr) {
    logger.warn({ err: callErr.message }, "callSessions.createCall failed");
  } else {
    callId = call?.id || null;
  }

  const meta = { sessionId: sess.id, customerId, callId, startedAt: nowIso };
  await saveSession(callSid, { ...session, voiceMeta: meta });
  return meta;
}

function durationSince(startedAt) {
  const start = startedAt ? new Date(startedAt).getTime() : Date.now();
  return Math.max(1, Math.floor((Date.now() - start) / 1000));
}

// Called when a call is answered so it appears immediately as "active".
export async function startCall({ callSid, phone }) {
  if (!admin || !callSid) return;
  try {
    await ensureSession(callSid, phone);
  } catch (e) {
    logger.error({ err: e.message }, "callSessions.startCall failed");
  }
}

// Called for each conversational turn: stores the caller speech + AI reply and
// flips the session to "escalated" when the policy handed off to an agent.
export async function recordCallTurn({
  callSid,
  phone,
  userText,
  aiText,
  escalated = false,
}) {
  if (!admin || !callSid) return;
  try {
    const meta = await ensureSession(callSid, phone);
    if (!meta?.sessionId) return;

    const base = Date.now();
    const rows = [];
    if (userText) {
      rows.push({
        session_id: meta.sessionId,
        direction: "inbound",
        content: userText,
        channel: "voice",
        sent_at: new Date(base).toISOString(),
      });
    }
    if (aiText) {
      rows.push({
        session_id: meta.sessionId,
        direction: "outbound",
        content: aiText,
        channel: "voice",
        // +1ms so the reply always sorts after the question.
        sent_at: new Date(base + 1).toISOString(),
      });
    }
    if (rows.length) {
      const { error } = await admin.from("messages").insert(rows);
      if (error) logger.warn({ err: error.message }, "callSessions.insertMessages failed");
    }

    await admin
      .from("sessions")
      .update({
        status: escalated ? "escalated" : "active",
        duration_seconds: durationSince(meta.startedAt),
        updated_at: new Date().toISOString(),
      })
      .eq("id", meta.sessionId);
  } catch (e) {
    logger.error({ err: e.message }, "callSessions.recordCallTurn failed");
  }
}

// Called from the Twilio status callback when the call ends.
export async function endCall({ callSid }) {
  if (!admin || !callSid) return;
  try {
    const session = (await getSession(callSid)) || {};
    const meta = session.voiceMeta;
    if (!meta?.sessionId) return;

    const duration = durationSince(meta.startedAt);
    const nowIso = new Date().toISOString();

    // Never downgrade an escalation back to "completed".
    const { data: cur } = await admin
      .from("sessions")
      .select("status")
      .eq("id", meta.sessionId)
      .maybeSingle();
    const finalStatus = cur?.status === "escalated" ? "escalated" : "completed";

    await admin
      .from("sessions")
      .update({
        status: finalStatus,
        ended_at: nowIso,
        duration_seconds: duration,
      })
      .eq("id", meta.sessionId);

    if (meta.callId) {
      await admin
        .from("calls")
        .update({
          status: "completed",
          ended_at: nowIso,
          duration_seconds: duration,
        })
        .eq("id", meta.callId);
    }
  } catch (e) {
    logger.error({ err: e.message }, "callSessions.endCall failed");
  }
}
