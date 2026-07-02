// Reduced-motion non-motion cue helpers for the design system.
//
// Requirement 9.2: While reduced motion is expressed, every state change that
// would otherwise rely on motion must be conveyed through at least one
// non-motion cue (a change in text, color, or icon) perceivable without
// animation.
//
// Requirement 9.3: Where the dashboard uses motion to indicate a loading or
// processing state, an equivalent static or text indicator must identify that
// state when reduced motion is expressed.
//
// This module models a state change as a pair of before/after cue descriptors
// carrying four channels (text, color, icon, motion) and provides a pure
// resolver that, under reduced motion, guarantees a non-motion cue distinguishes
// the two states. This is kept distinct from `status-cue.ts` (status non-color
// cues, Property 2) which addresses color-independence rather than
// motion-independence.

/** The cue channels that can convey a state to the user. */
export interface StateCues {
  /**
   * Semantic state identifier (e.g. "idle", "loading", "success", "error").
   * Two distinct states have distinct identifiers.
   */
  state: string;
  /** Visible text/label conveying the state. */
  text: string;
  /** Color token/value conveying the state. */
  color: string;
  /** Icon identifier conveying the state. */
  icon: string;
  /**
   * Motion/animation identifier conveying the state (e.g. "spinner", "pulse").
   * An empty string means no motion is used.
   */
  motion: string;
}

/** A transition from one state to another. */
export interface StateChange {
  before: StateCues;
  after: StateCues;
}

/** The channels that remain perceivable without animation. */
export const NON_MOTION_CHANNELS = ["text", "color", "icon"] as const;

/**
 * Whether a state change relies on motion to communicate the transition, i.e.
 * the motion channel changes between the two states or the target state carries
 * motion (a spinner/pulse loading indicator). These are the changes that
 * Requirement 9.2/9.3 must preserve without animation.
 */
export function reliesOnMotion(before: StateCues, after: StateCues): boolean {
  return before.motion !== after.motion || after.motion !== "";
}

/**
 * Whether at least one non-motion channel (text, color, or icon) distinguishes
 * the two states. This is the cue that survives when animation is removed.
 */
export function hasNonMotionCue(before: StateCues, after: StateCues): boolean {
  return NON_MOTION_CHANNELS.some(
    (channel) => before[channel] !== after[channel],
  );
}

/**
 * Canonical, non-empty text label derived from a semantic state identifier.
 * Distinct states yield distinct labels, so deriving text from both endpoints
 * guarantees a perceivable textual difference.
 */
export function labelForState(state: string): string {
  return `status:${state}`;
}

/**
 * Resolve a state change for presentation under the current motion preference.
 *
 * When reduced motion is NOT expressed, the change is returned unchanged.
 *
 * When reduced motion IS expressed and the change already carries a non-motion
 * cue, it is returned unchanged. Otherwise a text cue is derived from each
 * state's semantic identifier so that the transition is conveyed by a change in
 * text, perceivable without any animation. Because two distinct states have
 * distinct identifiers, the derived text differs between before and after.
 */
export function conveyStateChange(
  change: StateChange,
  reducedMotion: boolean,
): StateChange {
  if (!reducedMotion) return change;
  if (hasNonMotionCue(change.before, change.after)) return change;

  return {
    before: { ...change.before, text: labelForState(change.before.state) },
    after: { ...change.after, text: labelForState(change.after.state) },
  };
}
