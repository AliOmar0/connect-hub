// Feature: ui-ux-redesign, Property 18
//
// Property 18: Reduced-motion preserves a non-motion cue for every state change.
//
// For any state change that would otherwise rely on motion (including
// loading/processing indicators), when reduced motion is expressed the change is
// conveyed by at least one non-motion cue (a change in text, color, or icon)
// perceivable without animation. This targets the `conveyStateChange` resolver
// in src/lib/motion-cue.ts.
//
// Validates: Requirements 9.2, 9.3

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  conveyStateChange,
  hasNonMotionCue,
  reliesOnMotion,
  type StateCues,
  type StateChange,
} from "./motion-cue";

// A short pool of distinct semantic state identifiers. Distinct states are the
// premise of a "state change"; loading/processing states are included so the
// property covers Requirement 9.3.
const stateArb = fc.constantFrom(
  "idle",
  "loading",
  "processing",
  "success",
  "error",
  "selected",
);

// Motion identifiers, including "" (no motion) and animation-only indicators
// such as a spinner or pulse used for loading/processing feedback.
const motionArb = fc.constantFrom("", "spinner", "pulse", "slide", "fade");

// A cue descriptor for a single state. Non-motion channels are drawn from small
// pools so that colliding values (no non-motion cue) occur frequently, which is
// exactly the adversarial case the resolver must repair.
const cuesArb: fc.Arbitrary<StateCues> = fc.record({
  state: stateArb,
  text: fc.constantFrom("", "A", "B", "C"),
  color: fc.constantFrom("neutral", "green", "red", "amber"),
  icon: fc.constantFrom("none", "check", "cross", "clock"),
  motion: motionArb,
});

// A state change that (a) is a genuine change (distinct semantic states) and
// (b) would otherwise rely on motion to convey the transition.
const motionStateChangeArb: fc.Arbitrary<StateChange> = fc
  .record({ before: cuesArb, after: cuesArb })
  .filter(
    ({ before, after }) =>
      before.state !== after.state && reliesOnMotion(before, after),
  );

describe("Property 18: reduced-motion preserves a non-motion cue for every state change", () => {
  it("guarantees at least one non-motion cue distinguishes the states under reduced motion", () => {
    fc.assert(
      fc.property(motionStateChangeArb, (change) => {
        const resolved = conveyStateChange(change, /* reducedMotion */ true);

        // The transition is conveyed by a change in text, color, or icon —
        // perceivable without any animation.
        expect(hasNonMotionCue(resolved.before, resolved.after)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("preserves an already-present non-motion cue unchanged under reduced motion", () => {
    // When a non-motion cue already distinguishes the states, the resolver must
    // not alter the descriptors.
    const changeWithCueArb = motionStateChangeArb.filter(({ before, after }) =>
      hasNonMotionCue(before, after),
    );

    fc.assert(
      fc.property(changeWithCueArb, (change) => {
        const resolved = conveyStateChange(change, true);
        expect(resolved).toEqual(change);
      }),
      { numRuns: 100 },
    );
  });

  it("sanity: without reduced motion the descriptor is returned unchanged", () => {
    fc.assert(
      fc.property(motionStateChangeArb, (change) => {
        expect(conveyStateChange(change, false)).toEqual(change);
      }),
      { numRuns: 100 },
    );
  });
});
