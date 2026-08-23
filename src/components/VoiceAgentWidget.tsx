import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { BACKEND_URL, apiFetch } from "@/lib/config";
import {
  VOICE_LIVE_EVENT,
  voiceLiveChannelName,
  type VoiceLiveTurn,
} from "@/lib/voice-live";

/**
 * Mints a short-lived signed URL from our backend (which holds the
 * ELEVENLABS_API_KEY server-side) rather than embedding any ElevenLabs
 * credential in the browser bundle. See
 * whatsapp-support-backend/app/api/v1/voice_agent.py::signed_url.
 */
async function fetchSignedUrl(): Promise<string> {
  const response = await apiFetch(
    `${BACKEND_URL}/api/v1/voice-agent/signed-url`,
  );
  if (!response.ok) {
    throw new Error(`signed-url request failed with status ${response.status}`);
  }
  const data = await response.json();
  if (!data.signed_url) {
    throw new Error("Backend did not return a signed_url");
  }
  return data.signed_url as string;
}

function VoiceAgentCallControl() {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [turns, setTurns] = useState<VoiceLiveTurn[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const closeChannel = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  const conversation = useConversation({
    onError: (message) => setError(message),
    onConnect: ({ conversationId }) => {
      setTurns([]);
      // The dashboard has nothing to watch until the post-call webhook fires, so
      // the caller's own browser relays each turn as it happens. See
      // src/lib/voice-live.ts for why these are broadcast and never persisted.
      if (!conversationId) return;
      closeChannel();
      channelRef.current = supabase
        .channel(voiceLiveChannelName(conversationId))
        .subscribe();
    },
    onMessage: ({ role, message }) => {
      if (!message) return;
      const turn: VoiceLiveTurn = {
        // `role` is the supported field; the payload's `source` is deprecated.
        source: role === "user" ? "user" : "ai",
        message,
        at: new Date().toISOString(),
      };
      setTurns((previous) => [...previous, turn]);
      // Best-effort: a dropped turn costs the staff view one line, and must
      // never take down the call the customer is actually on.
      channelRef.current
        ?.send({ type: "broadcast", event: VOICE_LIVE_EVENT, payload: turn })
        ?.catch?.(() => undefined);
    },
    onDisconnect: () => {
      closeChannel();
    },
  });

  useEffect(() => closeChannel, [closeChannel]);

  const handleStart = useCallback(async () => {
    setError(null);
    setStarting(true);
    try {
      // Ask for mic permission up front so a denial surfaces as a clear
      // message here, rather than as an opaque connection failure later.
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const signedUrl = await fetchSignedUrl();
      conversation.startSession({ signedUrl });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("supportPage.startFailed"),
      );
    } finally {
      setStarting(false);
    }
  }, [conversation, t]);

  const handleEnd = useCallback(() => {
    conversation.endSession();
  }, [conversation]);

  const isActive =
    conversation.status === "connected" || conversation.status === "connecting";

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t(`supportPage.status.${conversation.status}`)}
      </p>

      {isActive ? (
        <Button onClick={handleEnd} variant="destructive">
          {t("supportPage.endCall")}
        </Button>
      ) : (
        <Button onClick={handleStart} disabled={starting}>
          {starting ? t("supportPage.connecting") : t("supportPage.startCall")}
        </Button>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {turns.length > 0 && (
        <div
          className="w-full max-w-md max-h-56 overflow-y-auto rounded-lg border border-border bg-muted/30 px-4 py-3 space-y-2"
          aria-live="polite"
        >
          {turns.map((turn, index) => (
            <p
              key={`${turn.at}-${index}`}
              className={
                turn.source === "user"
                  ? "text-xs text-foreground"
                  : "text-xs text-muted-foreground"
              }
            >
              <span className="font-medium me-1.5">
                {turn.source === "user"
                  ? t("supportPage.transcript.you")
                  : t("supportPage.transcript.agent")}
              </span>
              {turn.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Self-contained voice-call widget for the ElevenLabs Conversational Agent.
 * Wrap-free to drop into any page: `<VoiceAgentWidget />`.
 */
export default function VoiceAgentWidget() {
  return (
    <ConversationProvider>
      <VoiceAgentCallControl />
    </ConversationProvider>
  );
}
