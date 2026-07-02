// Feature: ui-ux-redesign, Property 19
//
// Property 19: Transitions reference bounded motion-duration tokens.
// For any transition on a Shared_Component, its duration references a
// motion-duration token whose value lies within the bounded 100-500ms named
// set (--motion-fast=120ms, --motion-base=240ms, --motion-slow=400ms).
//
// Validates: Requirements 9.4
//
// This is a single fast-check property-based test (>= 100 iterations) that
// targets the bounded motion-duration token set in src/lib/motion.ts
// (MOTION_DURATIONS). It generates arbitrary transitions referencing any named
// motion token and asserts that the resolved (non-reduced) duration always
// references a known token whose value lies within the 100-500ms bounds.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  MOTION_DURATIONS,
  MOTION_TOKEN_VARS,
  resolveMotionDuration,
  type MotionToken,
} from "./motion";

// Independent statement of the bounded named set required by Requirement 9.4.
const LOWER_BOUND_MS = 100;
const UPPER_BOUND_MS = 500;
const NAMED_SET: Record<MotionToken, number> = {
  fast: 120,
  base: 240,
  slow: 400,
};

// Generator over the named motion tokens that any Shared_Component transition
// may reference.
const tokenArb = fc.constantFrom<MotionToken>("fast", "base", "slow");

describe("Property 19: Transitions reference bounded motion-duration tokens", () => {
  it("resolves every transition token to a bounded value within the 100-500ms named set", () => {
    fc.assert(
      fc.property(tokenArb, (token) => {
        // A transition on a Shared_Component references a motion-duration
        // token; resolve it under normal (non-reduced) motion.
        const duration = resolveMotionDuration(token, false);

        // The token must be backed by a known CSS custom property.
        expect(MOTION_TOKEN_VARS[token]).toBeDefined();

        // The resolved value must be exactly the named token value...
        expect(duration).toBe(MOTION_DURATIONS[token]);
        expect(duration).toBe(NAMED_SET[token]);

        // ...and that value must lie within the bounded 100-500ms range.
        expect(duration).toBeGreaterThanOrEqual(LOWER_BOUND_MS);
        expect(duration).toBeLessThanOrEqual(UPPER_BOUND_MS);
      }),
      { numRuns: 200 },
    );
  });
});
