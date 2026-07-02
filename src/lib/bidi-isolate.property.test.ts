// Feature: ui-ux-redesign, Property 16
//
// Property 16: Embedded LTR content preserves character order under RTL.
// For any embedded left-to-right value (masked card number, IBAN, phone number,
// or keyboard shortcut key combination), wrapping it with `isolateLtr` preserves
// the original character order with no reordering or reversal of its characters,
// i.e. stripping the Unicode isolate controls yields the original string.
//
// Validates: Requirements 8.8, 14.4, 21.4

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { isolateLtr } from "./i18n-helpers";

// Unicode bidi isolate controls added by `isolateLtr`.
const LRI = "\u2066"; // LEFT-TO-RIGHT ISOLATE
const PDI = "\u2069"; // POP DIRECTIONAL ISOLATE

/**
 * Remove the bidi isolate controls that `isolateLtr` wraps around a value.
 * Whatever remains must be exactly the original embedded LTR string, in order.
 */
function stripIsolates(s: string): string {
  return s.split(LRI).join("").split(PDI).join("");
}

/**
 * Smart generators constrained to the embedded LTR value space the property
 * targets: masked card numbers, IBANs, phone numbers, and keyboard shortcut
 * key combinations. None of these contain the isolate controls themselves, so
 * stripping is unambiguous.
 */
const maskedCardArb: fc.Arbitrary<string> = fc
  .array(fc.integer({ min: 0, max: 9 }), { minLength: 4, maxLength: 4 })
  .map((digits) => `•••• •••• •••• ${digits.join("")}`);

const ibanArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom("PS", "SA", "AE", "JO", "GB", "DE"),
    fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 18, maxLength: 24 }),
  )
  .map(([country, digits]) => {
    const body = `${country}00${digits.join("")}`;
    return body.replace(/(.{4})/g, "$1 ").trim();
  });

const phoneArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom("+970", "+966", "+971", "+962", "+1", "+44"),
    fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 7, maxLength: 10 }),
  )
  .map(([cc, digits]) => `${cc} ${digits.join("")}`);

const shortcutComboArb: fc.Arbitrary<string> = fc
  .array(
    fc.constantFrom(
      "Ctrl",
      "Shift",
      "Alt",
      "Cmd",
      "Enter",
      "Esc",
      "Tab",
      "A",
      "S",
      "K",
      "/",
      "?",
    ),
    { minLength: 1, maxLength: 4 },
  )
  .map((keys) => keys.join("+"));

const embeddedLtrValueArb: fc.Arbitrary<string> = fc.oneof(
  maskedCardArb,
  ibanArb,
  phoneArb,
  shortcutComboArb,
);

describe("Property 16: Embedded LTR content preserves character order under RTL", () => {
  it("wraps embedded LTR values so stripping the isolate controls yields the original string in order", () => {
    fc.assert(
      fc.property(embeddedLtrValueArb, (value) => {
        const wrapped = isolateLtr(value);

        // Stripping the added isolate controls recovers the original exactly:
        // no characters reordered, reversed, dropped, or duplicated.
        expect(stripIsolates(wrapped)).toBe(value);

        // The original characters appear contiguously and in order inside the
        // wrapped output (the controls only bracket the value).
        expect(wrapped).toContain(value);
        expect(wrapped).toBe(`${LRI}${value}${PDI}`);
      }),
      { numRuns: 100 },
    );
  });
});
