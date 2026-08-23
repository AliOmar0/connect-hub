import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AudioLines, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { BACKEND_URL } from "@/lib/config";
import { ChatVoicePlayer } from "./ChatVoicePlayer";

interface CallRecordingPlayerProps {
  sessionId: string;
}

/**
 * Playback for a finished voice call.
 *
 * The backend proxies the audio from ElevenLabs rather than storing a copy
 * (whatsapp-support-backend/app/api/v1/voice_agent.py::call_recording), and that
 * route is staff-only, so the audio cannot simply be handed to `<audio src>` --
 * an element source carries no Authorization header. It is fetched as a blob
 * instead and played from an object URL.
 *
 * Fetched on demand rather than on mount: every play costs an ElevenLabs API
 * call, and most sessions are opened to read the transcript, not to listen.
 */
export default function CallRecordingPlayer({
  sessionId,
}: CallRecordingPlayerProps) {
  const { t } = useTranslation();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  // A different session means a different recording; drop the old blob rather
  // than leaving it playing under a new conversation's header.
  useEffect(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setObjectUrl(null);
    setError(null);
  }, [sessionId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetch(
        `${BACKEND_URL}/api/v1/voice-agent/recording/${sessionId}`,
        {
          headers: session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {},
        },
      );
      if (response.status === 404) {
        setError(t("sessions.recording.unavailable"));
        return;
      }
      if (!response.ok) {
        setError(t("sessions.recording.loadFailed"));
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      objectUrlRef.current = url;
      setObjectUrl(url);
    } catch {
      setError(t("sessions.recording.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [sessionId, t]);

  return (
    <div className="mx-6 mt-4 flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
      <AudioLines className="h-4 w-4 text-primary shrink-0" />
      <span className="text-xs font-medium">
        {t("sessions.recording.title")}
      </span>

      <div className="ms-auto">
        {objectUrl ? (
          <ChatVoicePlayer url={objectUrl} />
        ) : error ? (
          <span className="text-xs text-muted-foreground">{error}</span>
        ) : (
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading && <Loader2 className="h-3 w-3 me-1.5 animate-spin" />}
            {t("sessions.recording.play")}
          </Button>
        )}
      </div>
    </div>
  );
}
