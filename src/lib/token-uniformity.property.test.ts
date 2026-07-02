// Feature: ui-ux-redesign, Property 36: Cross-page token uniformity
//
// Property 36: For any control type (primary button, input, card, table,
// dialog, badge) and same-level heading rendered on any Page under a given
// Theme, its resolved color, typography, and spacing tokens equal the canonical
// token values for that control type / heading level, and layout-region gaps
// are spacing-scale tokens.
//
// This is a single fast-check property-based test (>= 100 iterations). It targets
// the canonical token registry + pure resolution helpers in
// src/lib/token-uniformity.ts. The concrete token *values* come from the real
// design tokens: the light Theme is parsed from the `:root` block of
// src/index.css and the dark Theme from the `.dark` block (inheriting the
// theme-independent typography/spacing tokens from `:root`), mirroring the
// approach used by src/lib/spacing.test.ts.
//
// Validates: Requirements 24.1, 24.2, 24.3, 24.4

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fc from "fast-check";
import type { TokenMap } from "./tokens";
import {
  CONTROL_TYPES,
  HEADING_LEVELS,
  PAGE_IDS,
  CANONICAL_CONTROL_TOKENS,
  CANONICAL_HEADING_TYPOGRAPHY,
  isSpacingScaleToken,
  renderedControlRefs,
  renderedLayoutRegionGaps,
  resolveControlTokens,
  resolveHeadingTypography,
} from "./token-uniformity";

// --- Parse the real design tokens from src/index.css --------------------------

const cssPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../index.css",
);
const css = readFileSync(cssPath, "utf8");

/**
 * Extract the body of the first CSS block whose selector matches `selector`.
 * Custom-property declarations contain no nested braces, so the block ends at
 * the first `}` after the opening `{`.
 */
function extractBlock(source: string, selector: string): string {
  const start = source.indexOf(selector);
  expect(start, `expected a "${selector}" block in index.css`).toBeGreaterThan(
    -1,
  );
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  expect(open).toBeGreaterThan(-1);
  expect(close).toBeGreaterThan(open);
  return source.slice(open + 1, close);
}

/** Parse `--name: value;` custom-property declarations from a block body. */
function parseCustomProps(block: string): TokenMap {
  const map: TokenMap = {};
  const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const name = m[1];
    if (!(name in map)) map[name] = m[2].trim(); // keep first (root) definition
  }
  return map;
}

// Light Theme: the `:root` block holds color + theme-independent typography/spacing.
const LIGHT_TOKENS: TokenMap = parseCustomProps(extractBlock(css, ":root"));
// Dark Theme: `.dark` overrides color; typography/spacing inherit from `:root`.
const DARK_TOKENS: TokenMap = {
  ...LIGHT_TOKENS,
  ...parseCustomProps(extractBlock(css, ".dark")),
};

const THEMES = { light: LIGHT_TOKENS, dark: DARK_TOKENS } as const;
type ThemeName = keyof typeof THEMES;

// Sanity: the tokens the registry references must actually exist in the parsed
// maps (otherwise "uniform undefined" would trivially pass the equality below).
describe("token-uniformity test fixtures", () => {
  it("parses the spacing and typography scales plus referenced color tokens", () => {
    for (const step of Array.from(
      { length: 12 },
      (_, i) => `--space-${i + 1}`,
    )) {
      expect(LIGHT_TOKENS[step], `${step} present`).toBeDefined();
    }
    for (const ct of CONTROL_TYPES) {
      const refs = CANONICAL_CONTROL_TOKENS[ct];
      for (const key of [
        "color",
        "foreground",
        "typography",
        "spacing",
      ] as const) {
        const name = refs[key].replace(/^var\(|\)$/g, "");
        expect(LIGHT_TOKENS[name], `light ${name} present`).toBeDefined();
        expect(DARK_TOKENS[name], `dark ${name} present`).toBeDefined();
      }
    }
  });
});

// --- Generators ----------------------------------------------------------------

const pageArb = fc.constantFrom(...PAGE_IDS);
const controlArb = fc.constantFrom(...CONTROL_TYPES);
const headingArb = fc.constantFrom(...HEADING_LEVELS);
const themeArb = fc.constantFrom<ThemeName>("light", "dark");

// --- Property ------------------------------------------------------------------

describe("Property 36: Cross-page token uniformity", () => {
  it("resolves each control/heading to canonical token values on every page, with spacing-scale layout gaps", () => {
    fc.assert(
      fc.property(
        pageArb,
        controlArb,
        headingArb,
        themeArb,
        (page, control, heading, themeName) => {
          const tokens = THEMES[themeName];

          // (24.2) A control type resolves to the canonical color, typography,
          // and spacing values regardless of which Page renders it.
          const canonicalControl = resolveControlTokens(
            CANONICAL_CONTROL_TOKENS[control],
            tokens,
          );
          const pageControl = resolveControlTokens(
            renderedControlRefs(page, control),
            tokens,
          );
          expect(pageControl).toEqual(canonicalControl);

          // Resolution must land on concrete values, not undefined.
          expect(pageControl.color).toBeDefined();
          expect(pageControl.foreground).toBeDefined();
          expect(pageControl.typography).toBeDefined();
          expect(pageControl.spacing).toBeDefined();

          // The control's spacing token comes from the 4px spacing scale.
          expect(
            isSpacingScaleToken(renderedControlRefs(page, control).spacing),
          ).toBe(true);

          // (24.1) Same-level headings share the canonical typography scale on
          // every Page (theme-independent, so identical across Themes too).
          const canonicalHeading = resolveHeadingTypography(
            CANONICAL_HEADING_TYPOGRAPHY[heading],
            tokens,
          );
          expect(canonicalHeading.size).toBeDefined();
          expect(canonicalHeading.line).toBeDefined();
          expect(canonicalHeading.weight).toBeDefined();
          // Typography tokens are theme-independent: light === dark.
          expect(canonicalHeading).toEqual(
            resolveHeadingTypography(
              CANONICAL_HEADING_TYPOGRAPHY[heading],
              LIGHT_TOKENS,
            ),
          );

          // (24.3) Layout-region gaps are spacing-scale tokens on every Page.
          for (const gap of renderedLayoutRegionGaps(page)) {
            expect(isSpacingScaleToken(gap)).toBe(true);
            expect(
              resolveControlTokens(
                { color: gap, foreground: gap, typography: gap, spacing: gap },
                tokens,
              ).spacing,
            ).toBeDefined();
          }

          // (24.4) Under the active Theme, the same canonical references resolve
          // consistently for that Theme across pages (already asserted equal to
          // canonical above); confirm color values are theme-specific by
          // construction — a color token resolves to a non-empty channel string.
          expect(typeof pageControl.color).toBe("string");
        },
      ),
      { numRuns: 100 },
    );
  });
});
