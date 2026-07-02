// Feature: ui-ux-redesign, Property 31
//
// Property 31: Spacing scale steps are integer multiples of the base unit.
//
// For any step in the spacing scale (--space-1 … --space-12), its value is an
// integer multiple of the single base unit (--space-unit = 4px) declared in
// src/index.css. This is verified as a property over the full scale: a random
// step is drawn on each of >=100 iterations and checked against the base unit.
//
// Validates: Requirements 1.5

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fc from "fast-check";

// Resolve src/index.css relative to this test file (src/lib/spacing.test.ts).
const cssPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../index.css",
);
const css = readFileSync(cssPath, "utf8");

/**
 * Convert a CSS length token value (rem or px) into CSS pixels.
 * Returns null when the value is not a plain rem/px length.
 */
function toPixels(value: string): number | null {
  const trimmed = value.trim();
  const remMatch = /^(-?\d*\.?\d+)rem$/.exec(trimmed);
  if (remMatch) return parseFloat(remMatch[1]) * 16; // 1rem = 16px (root default)
  const pxMatch = /^(-?\d*\.?\d+)px$/.exec(trimmed);
  if (pxMatch) return parseFloat(pxMatch[1]);
  return null;
}

/**
 * Parse the spacing scale from index.css: the base unit (--space-unit) and the
 * numbered steps (--space-1 … --space-N), preserving order. Only the first
 * (`:root`) declaration of each token is taken.
 */
function parseSpacingScale(source: string): {
  baseUnitPx: number;
  steps: { name: string; px: number }[];
} {
  const tokenRe = /(--space(?:-unit|-\d+))\s*:\s*([^;]+);/g;
  const seen = new Set<string>();
  let baseUnitPx = NaN;
  const steps: { name: string; px: number }[] = [];

  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(source)) !== null) {
    const name = match[1];
    if (seen.has(name)) continue; // keep only the first (root/light) definition
    seen.add(name);

    const px = toPixels(match[2]);
    expect(px, `token ${name} should be a parseable length`).not.toBeNull();

    if (name === "--space-unit") {
      baseUnitPx = px as number;
    } else {
      steps.push({ name, px: px as number });
    }
  }

  return { baseUnitPx, steps };
}

const { baseUnitPx, steps } = parseSpacingScale(css);

describe("spacing scale (Property 31)", () => {
  it("declares a 4px base unit and a full numbered scale", () => {
    expect(baseUnitPx).toBe(4);
    // --space-1 … --space-12 per the design (Requirement 1.5).
    expect(steps.length).toBeGreaterThanOrEqual(12);
  });

  it("every spacing step is an integer multiple of the base unit", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: steps.length - 1 }), (i) => {
        const step = steps[i];
        const multiple = step.px / baseUnitPx;
        // Integer multiple: the ratio rounds to a whole number with no remainder
        // (allowing for binary floating-point error from rem→px conversion).
        const rounded = Math.round(multiple);
        expect(
          Math.abs(multiple - rounded),
          `${step.name} (${step.px}px) is not an integer multiple of ${baseUnitPx}px`,
        ).toBeLessThan(1e-9);
        expect(rounded).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 100 },
    );
  });
});
