// Feature: ui-ux-redesign, Property 13
//
// Property 13: Language determines document direction.
// For any supported language, the document Direction equals that language's
// directionality (Arabic -> rtl, English -> ltr).
//
// Validates: Requirements 8.1, 8.2

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { languageToDirection, type Direction } from "./i18n-helpers";
import { SUPPORTED_LANGUAGES, RTL_LANGUAGES } from "@/i18n";

/**
 * The expected document direction for a supported language, derived directly
 * from the i18n configuration's RTL_LANGUAGES set (the single source of truth
 * for which languages are written right-to-left).
 */
function expectedDirection(
  lang: (typeof SUPPORTED_LANGUAGES)[number],
): Direction {
  return RTL_LANGUAGES.includes(lang) ? "rtl" : "ltr";
}

describe("Property 13: Language determines document direction", () => {
  it("maps every supported language to its writing direction (Arabic -> rtl, English -> ltr)", () => {
    fc.assert(
      fc.property(fc.constantFrom(...SUPPORTED_LANGUAGES), (lang) => {
        expect(languageToDirection(lang)).toBe(expectedDirection(lang));
      }),
      { numRuns: 100 },
    );
  });
});
