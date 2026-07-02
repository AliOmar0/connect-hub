// Feature: ui-ux-redesign, Property 1
//
// Property 1: WCAG contrast holds for all foreground/background pairings.
// For any text or meaningful graphical element rendered in a non-disabled
// state, in either the light or dark Theme, the luminance contrast ratio
// against its adjacent background is at least 4.5:1 for normal text, at least
// 3:1 for large text, and at least 3:1 for meaningful graphical elements and
// focus indicators.
//
// Validates: Requirements 2.7, 3.1, 3.2, 3.3, 3.4, 3.6, 3.7, 3.9, 4.2, 12.4, 17.2
//
// This is a single fast-check property-based test (>= 100 iterations) that
// targets the `meetsContrast` helper in src/lib/contrast.ts. It generates
// foreground/background color pairs, computes the expected contrast ratio with
// an INDEPENDENT reference implementation of the WCAG 2.1 formula, and asserts
// that `meetsContrast` agrees with the correct AA/AAA threshold for the given
// size class and conformance level.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  meetsContrast,
  type RGB,
  type ContrastSizeClass,
  type ContrastLevel,
} from "./contrast";

// --- Independent reference implementation of the WCAG 2.1 contrast math. ---
// Deliberately written separately from src/lib/contrast.ts so the property
// validates the production math rather than re-using it.

function refRelativeLuminance({ r, g, b }: RGB): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function refContrastRatio(fg: RGB, bg: RGB): number {
  const l1 = refRelativeLuminance(fg);
  const l2 = refRelativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function refThreshold(
  sizeClass: ContrastSizeClass,
  level: ContrastLevel,
): number {
  if (sizeClass === "graphical") return 3;
  if (level === "AAA") return sizeClass === "large" ? 4.5 : 7;
  return sizeClass === "large" ? 3 : 4.5;
}

// --- Generators ---

const byteArb = fc.integer({ min: 0, max: 255 });
const rgbArb: fc.Arbitrary<RGB> = fc.record({
  r: byteArb,
  g: byteArb,
  b: byteArb,
});

const sizeClassArb = fc.constantFrom<ContrastSizeClass>(
  "normal",
  "large",
  "graphical",
);
const levelArb = fc.constantFrom<ContrastLevel>("AA", "AAA");

// Light- and dark-theme anchors: pairing arbitrary foregrounds against a
// near-white or near-black background exercises both themes explicitly, in
// addition to the fully-random pairs below.
const themeBgArb = fc.oneof(
  fc.constant<RGB>({ r: 255, g: 255, b: 255 }), // light theme surface
  fc.constant<RGB>({ r: 18, g: 18, b: 18 }), // dark theme surface
  rgbArb, // arbitrary adjacent background
);

describe("Property 1: WCAG contrast holds for all foreground/background pairings", () => {
  it("meetsContrast agrees with the WCAG threshold for every fg/bg pair, size class, and level", () => {
    fc.assert(
      fc.property(
        rgbArb,
        themeBgArb,
        sizeClassArb,
        levelArb,
        (fg, bg, sizeClass, level) => {
          const ratio = refContrastRatio(fg, bg);
          const threshold = refThreshold(sizeClass, level);
          const expected = ratio >= threshold;

          // meetsContrast must match the independently-computed verdict for
          // both RGB inputs and the equivalent hex-string inputs.
          expect(meetsContrast(fg, bg, sizeClass, level)).toBe(expected);

          const toHex = ({ r, g, b }: RGB) =>
            "#" +
            [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");

          expect(meetsContrast(toHex(fg), toHex(bg), sizeClass, level)).toBe(
            expected,
          );
        },
      ),
      { numRuns: 300 },
    );
  });
});
