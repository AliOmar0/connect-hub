import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConversationProvider, useConversation } from "@elevenlabs/react";

import { Button } from "@/components/ui/button";
import { BACKEND_URL, apiFetch } from "@/lib/config";

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

  const conversation = useConversation({
    onError: (message) => setError(message),
  });

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
