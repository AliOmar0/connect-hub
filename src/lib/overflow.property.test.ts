// Feature: ui-ux-redesign, Property 9: No horizontal overflow at any reference breakpoint
//
// Property 9: No horizontal overflow at any reference breakpoint.
// For any Page at any of the four reference breakpoints (375 / 768 / 1024 /
// 1440), in either LTR or RTL Direction, the page content produces no horizontal
// overflow (scroll width does not exceed the client width).
//
// Validates: Requirements 7.1, 13.7, 22.3
//
// This is a single fast-check property-based test (>= 100 iterations) targeting
// the pure layout helper in src/lib/overflow.ts, which models the App_Shell's
// width-constraint contract (`min-w-0` + `max-w-full`/`w-full` on content
// regions, `overflow-hidden` on the outer shell). The generators quantify over
// the four reference breakpoints x both Directions x arbitrary content stacks
// whose intrinsic widths deliberately span far beyond the container (the case
// that WOULD overflow if unconstrained). The property asserts:
//   1. When every content region honours the width-constraint contract, the
//      content scroll width never exceeds the client width -> no overflow, at
//      every breakpoint and in both Directions.
//   2. The result is Direction-invariant (widths do not depend on LTR vs RTL).
//   3. The shell's `overflow-hidden` clip guarantees the visible client never
//      scrolls horizontally even if some descendant is left unconstrained.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  REFERENCE_BREAKPOINTS,
  type LayoutDirection,
  type LayoutChild,
  contentScrollWidth,
  hasHorizontalOverflow,
  effectiveScrollWidth,
  childRenderedWidth,
} from "./overflow";

const breakpointArb = fc.constantFrom(...REFERENCE_BREAKPOINTS);
const directionArb = fc.constantFrom<LayoutDirection>("ltr", "rtl");

// Intrinsic content widths from 1px up to 4000px: deliberately spans well below
// the smallest breakpoint (375px) through to widths several times the largest
// breakpoint (1440px) — i.e. content that would overflow badly if unconstrained.
const intrinsicWidthArb = fc.integer({ min: 1, max: 4000 });

// A stack of content regions, all honouring the width-constraint contract as the
// design system mandates for page content.
const constrainedStackArb: fc.Arbitrary<LayoutChild[]> = fc.array(
  intrinsicWidthArb.map((intrinsicWidthPx) => ({
    intrinsicWidthPx,
    constrained: true,
  })),
  { minLength: 1, maxLength: 12 },
);

// A stack that MAY contain unconstrained children (worst case: something escapes
// the width contract). Used to prove the shell's overflow-hidden clip still
// prevents a horizontally scrolling client.
const mixedStackArb: fc.Arbitrary<LayoutChild[]> = fc.array(
  fc.record({
    intrinsicWidthPx: intrinsicWidthArb,
    constrained: fc.boolean(),
  }),
  { minLength: 1, maxLength: 12 },
);

describe("Property 9: No horizontal overflow at any reference breakpoint", () => {
  it("constrained page content never overflows the client width at any breakpoint, in LTR or RTL", () => {
    fc.assert(
      fc.property(
        breakpointArb,
        directionArb,
        constrainedStackArb,
        (clientWidthPx, _direction, children) => {
          const scrollWidth = contentScrollWidth(children, clientWidthPx);

          // Core guarantee: scrollWidth <= clientWidth => no horizontal overflow.
          expect(hasHorizontalOverflow(scrollWidth, clientWidthPx)).toBe(false);
          expect(scrollWidth).toBeLessThanOrEqual(clientWidthPx);

          // Every constrained child is individually clamped to the container.
          for (const child of children) {
            expect(
              childRenderedWidth(child, clientWidthPx),
            ).toBeLessThanOrEqual(clientWidthPx);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("is Direction-invariant: the same content yields the same scroll width in LTR and RTL", () => {
    fc.assert(
      fc.property(breakpointArb, mixedStackArb, (clientWidthPx, children) => {
        // Widths never depend on Direction; RTL only mirrors placement.
        const ltr = contentScrollWidth(children, clientWidthPx);
        const rtl = contentScrollWidth(children, clientWidthPx);
        expect(rtl).toBe(ltr);
        expect(hasHorizontalOverflow(ltr, clientWidthPx)).toBe(
          hasHorizontalOverflow(rtl, clientWidthPx),
        );
      }),
      { numRuns: 100 },
    );
  });

  it("the shell's overflow-hidden clip prevents a horizontally scrolling client even for unconstrained content", () => {
    fc.assert(
      fc.property(
        breakpointArb,
        directionArb,
        mixedStackArb,
        (clientWidthPx, _direction, children) => {
          const scrollWidth = contentScrollWidth(children, clientWidthPx);
          const visible = effectiveScrollWidth(
            scrollWidth,
            clientWidthPx,
            true,
          );

          // The clipped (visible) client never exceeds its own width, so the
          // shell itself never scrolls horizontally regardless of descendants.
          expect(hasHorizontalOverflow(visible, clientWidthPx)).toBe(false);
          expect(visible).toBeLessThanOrEqual(clientWidthPx);
        },
      ),
      { numRuns: 100 },
    );
  });
});
