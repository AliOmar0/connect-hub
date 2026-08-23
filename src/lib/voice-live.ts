/**
 * Shared contract for the live voice-call transcript.
 *
 * While an ElevenLabs call is running there is nothing in the database to watch:
 * the transcript only lands once the post-call webhook fires
 * (whatsapp-support-backend/app/api/v1/voice_agent.py::post_call_webhook). So the
 * caller's own browser broadcasts each turn on a Supabase Realtime channel and
 * the dashboard listens in.
 *
 * These turns are DELIBERATELY not written to `messages`. Persisting them would
 * mean exposing a write endpoint to an anonymous page, and the same reasoning
 * applies to this channel: anyone who knows a conversation id can publish to it,
 * so the dashboard pane is a live, unverified view and nothing more. The
 * ElevenLabs-signed post-call webhook remains the record of truth.
 *
 * Both sides import the channel name from here so a rename cannot desync them.
 */

export const VOICE_LIVE_EVENT = "turn";

export function voiceLiveChannelName(conversationId: string): string {
  return `voice-live:${conversationId}`;
}

export interface VoiceLiveTurn {
  /** "user" = the caller, "ai" = the agent. Mirrors @elevenlabs/react's source. */
  source: "user" | "ai";
  message: string;
  /** ISO timestamp, set by the broadcasting client. */
  at: string;
}

export function isVoiceLiveTurn(value: unknown): value is VoiceLiveTurn {
  if (!value || typeof value !== "object") return false;
  const turn = value as Partial<VoiceLiveTurn>;
  return (
    (turn.source === "user" || turn.source === "ai") &&
    typeof turn.message === "string" &&
    typeof turn.at === "string"
  );
}
