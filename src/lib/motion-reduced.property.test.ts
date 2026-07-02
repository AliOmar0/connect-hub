// Feature: ui-ux-redesign, Property 17
//
// Property 17: Reduced-motion disables non-essential motion.
//
// For any element carrying a non-essential animation or transition, when
// reduced motion is expressed — including when the preference cannot be read
// and the reduced default applies — the effective motion duration resolves to
// 0 milliseconds. This targets the `resolveMotionDuration` /
// `resolveMotionDurationMs` helpers in src/lib/motion.ts.
//
// Validates: Requirements 9.1, 9.5

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  resolveMotionDuration,
  resolveMotionDurationMs,
  MOTION_DURATIONS,
  type MotionToken,
} from "./motion";

// Any of the bounded, named motion-duration tokens carried by a non-essential
// transition.
const motionTokenArb: fc.Arbitrary<MotionToken> = fc.constantFrom(
  ...(Object.keys(MOTION_DURATIONS) as MotionToken[]),
);

// The ways "reduced motion is expressed" can arrive at the helper. Both an
// explicit reduced preference and an unreadable preference (where the reduced
// default applies upstream in `useReducedMotion`) surface as reducedMotion=true.
const reducedExpressionArb = fc
  .constantFrom("explicit-reduced", "unreadable-defaults-reduced")
  .map(() => true as const);

describe("Property 17: reduced-motion disables non-essential motion", () => {
  it("resolves every non-essential motion duration to 0ms when reduced motion is expressed", () => {
    fc.assert(
      fc.property(
        motionTokenArb,
        reducedExpressionArb,
        (token, reducedMotion) => {
          // Numeric resolution collapses to exactly 0ms — no motion remains.
          expect(resolveMotionDuration(token, reducedMotion)).toBe(0);

          // CSS-ready resolution mirrors the numeric result as "0ms".
          expect(resolveMotionDurationMs(token, reducedMotion)).toBe("0ms");
        },
      ),
      { numRuns: 200 },
    );
  });

  it("sanity: without reduced motion the same token retains its bounded, non-zero duration (100-500ms)", () => {
    fc.assert(
      fc.property(motionTokenArb, (token) => {
        const ms = resolveMotionDuration(token, false);
        expect(ms).toBe(MOTION_DURATIONS[token]);
        expect(ms).toBeGreaterThanOrEqual(100);
        expect(ms).toBeLessThanOrEqual(500);
        expect(resolveMotionDurationMs(token, false)).toBe(`${ms}ms`);
      }),
      { numRuns: 100 },
    );
  });
});
