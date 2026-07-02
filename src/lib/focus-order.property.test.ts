// Feature: ui-ux-redesign, Property 39
//
// Property 39: Focus order follows reading order.
// For any Page region, the keyboard focus (tab) order follows the logical
// reading order of the active Direction in both LTR and RTL. Reading order is
// DOM source order — NOT the visual x-position, which mirrors under RTL — so
// the tab order is identical in LTR and RTL: Direction never reorders focus.
//
// Validates: Requirements 4.3

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  tabbableControls,
  traversalFrom,
  type Direction,
  type FocusableControl,
} from "./focus-order";

const directionArb: fc.Arbitrary<Direction> = fc.constantFrom("ltr", "rtl");

// An element in a page region, described by its DOM/source position and its
// on-screen horizontal position. `visualX` is deliberately reverse-correlated
// with `domIndex` so that ordering by visual position would DISAGREE with
// reading order — the whole point of the property.
interface RegionElement {
  id: string;
  /** Position in DOM/reading (source) order. */
  domIndex: number;
  /** On-screen x-position; flips under RTL. */
  visualX: number;
  disabled?: boolean;
}

// A region laid out in DOM/source order 0..n-1. Under LTR the visual x-position
// increases with DOM order; under RTL it decreases — but reading order is DOM
// order in BOTH cases.
const regionArb: fc.Arbitrary<RegionElement[]> = fc
  .array(fc.boolean(), { maxLength: 20 })
  .map((disabledFlags) => {
    const n = disabledFlags.length;
    return disabledFlags.map((disabled, i) => ({
      id: `el-${i}`,
      domIndex: i,
      visualX: (n - 1 - i) * 10, // reverse-correlated with DOM order
      disabled,
    }));
  });

/**
 * Map a page region to focusable controls for a given Direction, the way a
 * correct caller must: the logical reading-order position is the DOM source
 * order (NOT the visual x-position) in both LTR and RTL.
 */
function buildControls(
  region: RegionElement[],
  _direction: Direction,
): FocusableControl[] {
  // Reading order == DOM source order, independent of Direction.
  return region.map((el) => ({
    id: el.id,
    order: el.domIndex,
    disabled: el.disabled,
  }));
}

describe("Property 39: Focus order follows reading order", () => {
  it("tab order equals DOM reading order and is identical in LTR and RTL", () => {
    fc.assert(
      fc.property(regionArb, directionArb, (region, direction) => {
        // Expected reading order = DOM source order, enabled controls only.
        const expected = region
          .filter((el) => !el.disabled)
          .sort((a, b) => a.domIndex - b.domIndex)
          .map((el) => el.id);

        // Focus order for the active direction follows reading order.
        const order = tabbableControls(buildControls(region, direction)).map(
          (c) => c.id,
        );
        expect(order).toEqual(expected);

        // Direction never reorders focus: LTR and RTL yield the same sequence,
        // even though the visual x-positions are mirrored.
        const ltr = tabbableControls(buildControls(region, "ltr")).map(
          (c) => c.id,
        );
        const rtl = tabbableControls(buildControls(region, "rtl")).map(
          (c) => c.id,
        );
        expect(rtl).toEqual(ltr);
        expect(rtl).toEqual(expected);
      }),
      { numRuns: 200 },
    );
  });

  it("sequential Tab traversal visits controls in reading order for both directions", () => {
    // Region with at least two enabled controls so a traversal exists.
    const nonEmptyRegionArb = regionArb
      .map((region) => region.map((el) => ({ ...el, disabled: false })))
      .filter((region) => region.length >= 2);

    fc.assert(
      fc.property(nonEmptyRegionArb, (region) => {
        const readingOrder = region
          .slice()
          .sort((a, b) => a.domIndex - b.domIndex)
          .map((el) => el.id);

        const first = readingOrder[0];
        // The controls visited after the first, following Tab, are the rest of
        // the reading order — identical whether the layout is LTR or RTL.
        const expectedRest = readingOrder.slice(1);

        const ltrTraversal = traversalFrom(buildControls(region, "ltr"), first);
        const rtlTraversal = traversalFrom(buildControls(region, "rtl"), first);

        expect(ltrTraversal).toEqual(expectedRest);
        expect(rtlTraversal).toEqual(expectedRest);
      }),
      { numRuns: 200 },
    );
  });
});
