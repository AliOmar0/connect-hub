// Feature: ui-ux-redesign, Property 8
//
// Property 8: Adjacent small targets are separated.
// For any two adjacent interactive controls that each have a touch target
// smaller than 44px in some dimension, there are at least 8 CSS pixels of
// spacing between their hit areas and the hit areas do not overlap.
//
// Validates: Requirements 6.2

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  MIN_ADJACENT_GAP_PX,
  TOUCH_TARGET_MIN_PX,
  isSmallTarget,
  meetsAdjacentSeparation,
} from "./touch-target";

// A single control's activation-area dimensions in CSS pixels. The range spans
// both sub-44px "small" targets and >=44px full-size targets so the generator
// exercises every combination of small/large adjacency.
const dimensionArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 88 });

const controlArb = fc.record({
  width: dimensionArb,
  height: dimensionArb,
});

// Separation between two adjacent hit areas in CSS pixels. Negative values model
// overlapping hit areas; the range straddles the 8px threshold in both
// directions so the boundary is thoroughly probed.
const gapArb: fc.Arbitrary<number> = fc.integer({ min: -20, max: 40 });

describe("Property 8: Adjacent small targets are separated", () => {
  it("requires >=8px non-overlapping spacing exactly when both adjacent targets are small", () => {
    fc.assert(
      fc.property(controlArb, controlArb, gapArb, (a, b, gapPx) => {
        const aSmall = isSmallTarget(a.width, a.height);
        const bSmall = isSmallTarget(b.width, b.height);
        const separated = meetsAdjacentSeparation(gapPx, aSmall, bSmall);

        // isSmallTarget is exactly "smaller than 44px in some dimension".
        expect(aSmall).toBe(
          a.width < TOUCH_TARGET_MIN_PX || a.height < TOUCH_TARGET_MIN_PX,
        );
        expect(bSmall).toBe(
          b.width < TOUCH_TARGET_MIN_PX || b.height < TOUCH_TARGET_MIN_PX,
        );

        if (aSmall && bSmall) {
          // The separation rule holds iff there are at least 8 CSS px between
          // the two hit areas. This simultaneously guarantees the hit areas do
          // not overlap, since 8 > 0.
          expect(separated).toBe(gapPx >= MIN_ADJACENT_GAP_PX);

          if (separated) {
            expect(gapPx).toBeGreaterThanOrEqual(MIN_ADJACENT_GAP_PX);
            // Non-overlap invariant: an accepted separation is strictly
            // positive, so the hit areas never overlap.
            expect(gapPx).toBeGreaterThan(0);
          } else {
            expect(gapPx).toBeLessThan(MIN_ADJACENT_GAP_PX);
          }
        } else {
          // When at least one control already meets the 44px minimum, the
          // adjacent-separation rule imposes no spacing constraint.
          expect(separated).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});
