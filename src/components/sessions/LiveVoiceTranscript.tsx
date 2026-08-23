import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Radio } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  VOICE_LIVE_EVENT,
  isVoiceLiveTurn,
  voiceLiveChannelName,
  type VoiceLiveTurn,
} from "@/lib/voice-live";

interface LiveVoiceTranscriptProps {
  /** ElevenLabs conversation id; the channel is keyed off it. */
  conversationId: string;
}

/**
 * Turn-by-turn view of a voice call that is still in progress.
 *
 * The rest of the dashboard listens to `postgres_changes`; this is the one place
 * that uses a `broadcast` channel, because during a call there is no row to
 * watch yet -- see src/lib/voice-live.ts for why these turns are never
 * persisted. Everything here disappears on unmount by design.
 */
export default function LiveVoiceTranscript({
  conversationId,
}: LiveVoiceTranscriptProps) {
  const { t } = useTranslation();
  const [turns, setTurns] = useState<VoiceLiveTurn[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTurns([]);
    const channel = supabase
      .channel(voiceLiveChannelName(conversationId))
      .on("broadcast", { event: VOICE_LIVE_EVENT }, ({ payload }) => {
        if (!isVoiceLiveTurn(payload)) return;
        setTurns((previous) => [...previous, payload]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [turns.length]);

  return (
    <div className="mx-6 mt-4 rounded-lg border border-border bg-muted/30">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <Radio className="h-3.5 w-3.5 text-destructive animate-pulse" />
        <span className="text-xs font-medium">{t("sessions.live.title")}</span>
        <span className="text-[10px] text-muted-foreground ms-auto">
          {t("sessions.live.disclaimer")}
        </span>
      </div>

      <div className="max-h-40 overflow-y-auto px-4 py-3 space-y-2 custom-scrollbar">
        {turns.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("sessions.live.waiting")}
          </p>
        ) : (
          turns.map((turn, index) => (
            <div
              key={`${turn.at}-${index}`}
              className={cn(
                "text-xs leading-relaxed",
                turn.source === "user"
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
            >
              <span className="font-medium me-1.5">
                {turn.source === "user"
                  ? t("sessions.live.caller")
                  : t("sessions.live.agent")}
              </span>
              {turn.message}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
