// Motion-duration resolution helpers for the design system.
//
// The design system defines a bounded, named set of motion-duration tokens
// (Requirement 9.4) spanning 100-500ms. These mirror the CSS custom properties
// declared in `src/index.css` (`--motion-fast`, `--motion-base`, `--motion-slow`).
//
// Under reduced motion (Requirement 9.1 / 9.5) every non-essential transition
// must resolve to 0ms so that no motion-based transition exceeds 0ms in duration.

export type MotionToken = "fast" | "base" | "slow";

// Bounded set of motion-duration tokens, in milliseconds. Every value lies
// within the 100-500ms range required by the design system.
export const MOTION_DURATIONS: Record<MotionToken, number> = {
  fast: 120,
  base: 240,
  slow: 400,
};

// The CSS custom property name backing each motion token, kept in sync with
// the token definitions in `src/index.css`.
export const MOTION_TOKEN_VARS: Record<MotionToken, string> = {
  fast: "--motion-fast",
  base: "--motion-base",
  slow: "--motion-slow",
};

/**
 * Resolve a transition duration in milliseconds for a motion token.
 *
 * @param token          The named motion-duration token.
 * @param reducedMotion  Whether reduced motion is active (defaults to reduced
 *                       behavior when the preference cannot be read upstream).
 * @returns 0 when reduced motion is active, otherwise the bounded token value.
 */
export function resolveMotionDuration(
  token: MotionToken,
  reducedMotion: boolean,
): number {
  if (reducedMotion) return 0;
  return MOTION_DURATIONS[token];
}

/**
 * Resolve a transition duration as a CSS-ready string (e.g. "240ms" or "0ms").
 *
 * @param token          The named motion-duration token.
 * @param reducedMotion  Whether reduced motion is active.
 */
export function resolveMotionDurationMs(
  token: MotionToken,
  reducedMotion: boolean,
): string {
  return `${resolveMotionDuration(token, reducedMotion)}ms`;
}
