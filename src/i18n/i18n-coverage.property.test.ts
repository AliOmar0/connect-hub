// Feature: ui-ux-redesign, Property 35
//
// Property 35: Visible text and labels are internationalized and emoji-free.
// For any visible interface text — and specifically for navigation, heading,
// and action labels — the text derives from an i18n key (no hard-coded language
// string) and contains no decorative emoji/pictographic code points.
//
// Approach: sample over the i18n dictionaries (en.json / ar.json) and the
// App_Shell label keys (appShell.nav.*, appShell.header.*, appShell.sidebar.*,
// appShell.roles.*). For each sampled (key, language) pair assert that
//   (a) the key resolves via the i18n layer (resolveText) to a non-empty string
//       — i.e. the label is internationalized, never a raw key or empty; and
//   (b) the resolved value contains no emoji / pictographic Unicode code points.
//
// Validates: Requirements 2.4, 8.4

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { resolveText, type Dictionary } from "@/lib/i18n-helpers";
import { SUPPORTED_LANGUAGES } from "@/i18n";
import en from "@/i18n/locales/en.json";
import ar from "@/i18n/locales/ar.json";

/**
 * Flatten a nested translation JSON into dotted keys mapped to their string
 * values, e.g. { appShell: { nav: { dashboard: "Dashboard" } } } becomes
 * { "appShell.nav.dashboard": "Dashboard" }. This mirrors how i18next addresses
 * nested keys and gives the flat shape the pure resolveText helper expects.
 */
function flatten(
  obj: Record<string, unknown>,
  prefix = "",
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") {
      out[key] = v;
    } else if (v && typeof v === "object") {
      Object.assign(out, flatten(v as Record<string, unknown>, key));
    }
  }
  return out;
}

const flatEn = flatten(en as Record<string, unknown>);
const flatAr = flatten(ar as Record<string, unknown>);

// The i18n layer sees both languages; resolveText falls back to English when an
// Arabic translation is missing, so every English key resolves for every lang.
const dict: Dictionary = { en: flatEn, ar: flatAr };

// Every visible-text key present in the English dictionary (the source of
// truth). Includes the App_Shell nav/header/sidebar/roles labels.
const allKeys = Object.keys(flatEn);

// The App_Shell navigation, header, sidebar, and role label keys explicitly
// called out by the property (navigation, heading, and action labels).
const appShellLabelKeys = allKeys.filter((k) =>
  /^appShell\.(nav|header|sidebar|roles)\./.test(k),
);

// Emoji / pictographic detection. Extended_Pictographic covers the emoji code
// points (faces, symbols, pictographs) that must not appear in formal labels.
// The copyright sign (U+00A9) is a legitimate label character, not decorative.
const EMOJI_RE = /\p{Extended_Pictographic}/u;
const LEGAL_SYMBOLS = new Set(["\u00A9"]); // © copyright sign

function hasEmoji(text: string): boolean {
  for (const ch of text) {
    if (LEGAL_SYMBOLS.has(ch)) continue;
    if (EMOJI_RE.test(ch)) return true;
  }
  return false;
}

describe("Property 35: Visible text and labels are internationalized and emoji-free", () => {
  it("resolves every label via the i18n layer to a non-empty, emoji-free string", () => {
    // Sanity: the App_Shell label set the property targets must be non-empty,
    // otherwise the property would vacuously pass.
    expect(appShellLabelKeys.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(
        // Bias sampling toward the App_Shell nav/header/sidebar/roles labels
        // while still covering the full visible-text dictionary.
        fc.oneof(
          fc.constantFrom(...appShellLabelKeys),
          fc.constantFrom(...allKeys),
        ),
        fc.constantFrom(...SUPPORTED_LANGUAGES),
        (key, lang) => {
          const resolved = resolveText(key, lang, dict);

          // (a) Internationalized: resolves to a non-empty string, never the
          // raw key or an empty value.
          expect(typeof resolved).toBe("string");
          expect(resolved.length).toBeGreaterThan(0);
          expect(resolved).not.toBe(key);

          // (b) Emoji-free: no decorative pictographic code points.
          expect(hasEmoji(resolved)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
