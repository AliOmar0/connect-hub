// Feature: ui-ux-redesign, Property 5
//
// Property 5: Heading structure is well-formed per page.
// For any Page, exactly one top-level heading is rendered and subordinate
// heading levels descend in sequence without skipping a level.
//
// The property is quantified over generated heading-level arrays (the outline a
// page renders, in DOM/reading order) against the pure validator that decides
// well-formedness. Constructively well-formed outlines are always accepted;
// each way of breaking a rule (no h1, a second h1, an outline not starting at
// h1, or a skipped descent) is always rejected.
//
// Validates: Requirements 5.2

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  validateHeadingStructure,
  isWellFormedHeadingStructure,
  MAX_LEVEL,
  TOP_LEVEL,
} from "./heading-structure";

/**
 * Generate a constructively well-formed heading outline:
 *   - starts at the single top-level heading (h1),
 *   - every subsequent heading is between h2 and (prev + 1), which guarantees
 *     no second h1 (stays >= 2) and no skipped descent (never > prev + 1),
 *   - clamped to the maximum heading level (h6).
 */
const wellFormedOutlineArb: fc.Arbitrary<number[]> = fc
  .array(fc.integer({ min: 0, max: 6 }), { minLength: 0, maxLength: 25 })
  .map((steps) => {
    const levels: number[] = [TOP_LEVEL];
    for (const step of steps) {
      const prev = levels[levels.length - 1];
      // Deepest allowed next level: one deeper than prev, capped at MAX_LEVEL.
      const deepest = Math.min(prev + 1, MAX_LEVEL);
      // Map the raw step into the inclusive range [2, deepest] so we never
      // reintroduce a top-level heading and never skip a level going deeper.
      const span = deepest - 2 + 1; // number of choices in [2, deepest]
      const next = 2 + (step % span);
      levels.push(next);
    }
    return levels;
  });

/** An arbitrary array of raw heading levels (may or may not be well-formed). */
const arbitraryOutlineArb: fc.Arbitrary<number[]> = fc.array(
  fc.integer({ min: 1, max: MAX_LEVEL }),
  { minLength: 1, maxLength: 25 },
);

describe("Property 5: Heading structure is well-formed per page", () => {
  it("accepts every constructively well-formed outline", () => {
    fc.assert(
      fc.property(wellFormedOutlineArb, (levels) => {
        expect(isWellFormedHeadingStructure(levels)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("requires exactly one top-level heading: rejects a second h1", () => {
    fc.assert(
      fc.property(
        wellFormedOutlineArb,
        // Position (after index 0) at which to inject a spurious second h1.
        fc.integer({ min: 0, max: 24 }),
        (levels, rawPos) => {
          const pos = 1 + (rawPos % levels.length); // 1..length (inclusive tail)
          const mutated = [...levels];
          mutated.splice(Math.min(pos, mutated.length), 0, TOP_LEVEL);
          const result = validateHeadingStructure(mutated);
          expect(result.valid).toBe(false);
          expect(result.violation).toBe("multiple-top-level");
        },
      ),
      { numRuns: 200 },
    );
  });

  it("requires the outline to begin at the top level", () => {
    fc.assert(
      fc.property(
        // A first heading that is deeper than h1 (h2..h6) means no h1 at all.
        fc.integer({ min: 2, max: MAX_LEVEL }),
        fc.array(fc.integer({ min: 2, max: MAX_LEVEL }), { maxLength: 20 }),
        (first, rest) => {
          const levels = [first, ...rest];
          const result = validateHeadingStructure(levels);
          expect(result.valid).toBe(false);
          // No level-1 heading exists anywhere, so it fails the top-level check.
          expect(result.violation).toBe("missing-top-level");
        },
      ),
      { numRuns: 200 },
    );
  });

  it("rejects any descent that skips a heading level", () => {
    fc.assert(
      fc.property(
        wellFormedOutlineArb,
        fc.integer({ min: 0, max: 24 }),
        fc.integer({ min: 2, max: 4 }),
        (levels, rawIdx, jump) => {
          // Pick a position and force a jump of >= 2 deeper than its
          // predecessor, which is the definition of a skipped level.
          const idx = 1 + (rawIdx % levels.length);
          const mutated = [...levels];
          const insertAt = Math.min(idx, mutated.length);
          const prev = mutated[insertAt - 1];
          const skipped = prev + jump; // >= prev + 2
          fc.pre(skipped <= MAX_LEVEL); // stay a valid heading level
          mutated.splice(insertAt, 0, skipped);
          const result = validateHeadingStructure(mutated);
          expect(result.valid).toBe(false);
          expect(result.violation).toBe("skipped-level");
        },
      ),
      { numRuns: 200 },
    );
  });

  it("rejects an empty outline (no heading rendered)", () => {
    expect(validateHeadingStructure([])).toEqual({
      valid: false,
      violation: "empty",
    });
  });

  it("agrees with an independent reference over arbitrary outlines", () => {
    // Independent re-statement of the rule, used as an oracle.
    const referenceIsWellFormed = (levels: number[]): boolean => {
      if (levels.length === 0) return false;
      if (levels.filter((l) => l === TOP_LEVEL).length !== 1) return false;
      if (levels[0] !== TOP_LEVEL) return false;
      return levels.every((l, i) => i === 0 || l <= levels[i - 1] + 1);
    };

    fc.assert(
      fc.property(arbitraryOutlineArb, (levels) => {
        expect(isWellFormedHeadingStructure(levels)).toBe(
          referenceIsWellFormed(levels),
        );
      }),
      { numRuns: 300 },
    );
  });
});
