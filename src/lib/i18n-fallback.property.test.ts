// Feature: ui-ux-redesign, Property 14
//
// Property 14: Text resolution falls back to English, never raw key or empty.
// For any text key that exists in the English dictionary and any supported
// language, resolveText returns the active-language translation when present
// and the English text otherwise, and never returns the raw key or an empty
// value.
//
// Validates: Requirements 8.5

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { resolveText, type Dictionary } from "./i18n-helpers";
import { SUPPORTED_LANGUAGES } from "@/i18n";

/**
 * How the active (non-default) language translation is provided for a key:
 *  - "present": a non-empty translation exists -> resolveText must return it
 *  - "empty":   an empty-string translation exists -> treated as missing
 *  - "absent":  no translation key -> missing
 * For "empty" and "absent", resolveText must fall back to the English text.
 */
type ActivePresence = "present" | "empty" | "absent";

interface Entry {
  key: string;
  enRaw: string;
  presence: ActivePresence;
  activeRaw: string;
}

/**
 * Build a value that is guaranteed to be non-empty and strictly longer than its
 * key (so it can never accidentally equal the raw key). The language marker
 * keeps English and active-language values distinguishable for the same key.
 */
function makeValue(key: string, marker: string, raw: string): string {
  return `${key}|${marker}|${raw}`;
}

/**
 * A set of entries with unique keys. Every key is present in the English
 * dictionary (the property's precondition); the active language may or may not
 * carry a usable translation.
 */
const entriesArb = fc.uniqueArray(
  fc.record({
    key: fc.stringMatching(/^[a-z0-9]{1,24}$/),
    enRaw: fc.string({ minLength: 1, maxLength: 24 }),
    presence: fc.constantFrom<ActivePresence>("present", "empty", "absent"),
    activeRaw: fc.string({ minLength: 1, maxLength: 24 }),
  }),
  { selector: (e) => e.key, minLength: 1, maxLength: 25 },
);

function buildDictionary(entries: Entry[], activeLang: string): Dictionary {
  const dict: Dictionary = { en: {} };
  if (activeLang !== "en") dict[activeLang] = {};

  for (const e of entries) {
    dict.en[e.key] = makeValue(e.key, "EN", e.enRaw);
    if (activeLang !== "en") {
      if (e.presence === "present") {
        dict[activeLang][e.key] = makeValue(e.key, "AR", e.activeRaw);
      } else if (e.presence === "empty") {
        dict[activeLang][e.key] = "";
      }
      // "absent": leave the active-language entry undefined
    }
  }
  return dict;
}

describe("Property 14: Text resolution falls back to English, never raw key or empty", () => {
  it("returns the active translation when present and English otherwise, never the raw key or empty", () => {
    fc.assert(
      fc.property(
        entriesArb,
        fc.nat(),
        fc.constantFrom(...SUPPORTED_LANGUAGES),
        (entries, idx, lang) => {
          const dict = buildDictionary(entries as Entry[], lang);
          const target = (entries as Entry[])[idx % entries.length];
          const key = target.key;
          const enValue = dict.en[key];

          const result = resolveText(key, lang, dict);

          // Never the raw key, never empty.
          expect(result.length).toBeGreaterThan(0);
          expect(result).not.toBe(key);

          // Active translation when usable; English fallback otherwise.
          if (lang !== "en" && target.presence === "present") {
            expect(result).toBe(dict[lang][key]);
          } else {
            expect(result).toBe(enValue);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
