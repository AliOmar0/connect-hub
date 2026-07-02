// Pure heading-structure helpers for accessible document outline
// (Requirement 5.2; Property 5).
//
// This module is intentionally framework-free: it models the sequence of
// heading levels a Page renders (in DOM/reading order) and decides whether that
// outline is well-formed. A rendered page can extract its heading levels from
// the DOM (h1..h6 → 1..6) and feed them here; the property test quantifies the
// rule over generated heading-level arrays without needing a DOM.
//
// A well-formed heading outline (Property 5) is one where:
//   1. At least one heading is rendered.
//   2. The first heading is the single top-level heading (level 1).
//   3. There is exactly one top-level (level-1) heading on the page.
//   4. Subordinate levels descend in sequence without skipping: moving to a
//      deeper heading only ever increases the level by one at a time. Returning
//      to a shallower section may jump up by any amount (h4 → h2 is fine).

/** A heading level, 1 (h1) through 6 (h6). */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** The minimum (top-level) and maximum HTML heading levels. */
export const TOP_LEVEL: HeadingLevel = 1;
export const MAX_LEVEL: HeadingLevel = 6;

/** Why a heading outline was rejected, or `null` when it is well-formed. */
export type HeadingViolation =
  | "empty" // no heading rendered at all
  | "missing-top-level" // no level-1 heading present
  | "multiple-top-level" // more than one level-1 heading
  | "top-level-not-first" // the outline does not start at the top level
  | "out-of-range" // a level outside 1..6
  | "skipped-level"; // a descent that jumps more than one level deeper

export interface HeadingStructureResult {
  /** True when the outline satisfies every rule of Property 5. */
  valid: boolean;
  /** The first violation found, or `null` when {@link valid} is true. */
  violation: HeadingViolation | null;
}

/** Whether `n` is a valid HTML heading level (an integer in 1..6). */
export function isHeadingLevel(n: number): n is HeadingLevel {
  return Number.isInteger(n) && n >= TOP_LEVEL && n <= MAX_LEVEL;
}

/**
 * Validate a page's heading outline, given the heading levels in DOM/reading
 * order. Returns the first rule violated (or `null` when well-formed) so both
 * callers and tests can reason about *why* an outline is rejected.
 */
export function validateHeadingStructure(
  levels: readonly number[],
): HeadingStructureResult {
  if (!Array.isArray(levels) || levels.length === 0) {
    return { valid: false, violation: "empty" };
  }

  // Every level must be a real heading level (1..6).
  for (const level of levels) {
    if (!isHeadingLevel(level)) {
      return { valid: false, violation: "out-of-range" };
    }
  }

  // Exactly one top-level (h1) heading must be present...
  const topLevelCount = levels.filter((l) => l === TOP_LEVEL).length;
  if (topLevelCount === 0) {
    return { valid: false, violation: "missing-top-level" };
  }
  if (topLevelCount > 1) {
    return { valid: false, violation: "multiple-top-level" };
  }

  // ...and it must be the first heading rendered.
  if (levels[0] !== TOP_LEVEL) {
    return { valid: false, violation: "top-level-not-first" };
  }

  // Subordinate levels descend one step at a time (no skipped levels). Going
  // back up to a shallower section may jump by any amount.
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1] + 1) {
      return { valid: false, violation: "skipped-level" };
    }
  }

  return { valid: true, violation: null };
}

/**
 * Convenience predicate: is the page's heading outline well-formed per
 * Property 5? Used by callers and tests to assert Requirement 5.2.
 */
export function isWellFormedHeadingStructure(
  levels: readonly number[],
): boolean {
  return validateHeadingStructure(levels).valid;
}
