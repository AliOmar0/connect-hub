// Feature: ui-ux-redesign, Property 15
//
// Property 15: Locale formatting matches locale conventions.
// For any number, date, or time value and any supported locale, the formatted
// output of formatNumber/formatDate/formatTime matches that locale's
// conventions for digit representation, decimal and thousands separators, and
// date/time ordering — equivalent to the locale's reference `Intl` formatting.
//
// Validates: Requirements 8.7

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { formatNumber, formatDate, formatTime } from "./i18n-helpers";
import { SUPPORTED_LANGUAGES } from "@/i18n";

/**
 * Locales exercised by the property. The base supported language subtags plus
 * representative regional variants exercise distinct convention sets (e.g.
 * Western vs. Arabic-Indic digits, thousands/decimal separators, and date/time
 * ordering).
 */
const LOCALES = [
  ...SUPPORTED_LANGUAGES, // "en", "ar"
  "en-US",
  "en-GB",
  "ar-EG",
  "ar-PS",
  "ar-SA",
] as const;

const localeArb = fc.constantFrom(...LOCALES);

// Finite numbers spanning magnitudes that exercise thousands grouping and
// fractional digits. NaN/Infinity are excluded: they are not "number, date, or
// time values" in the requirement's sense.
const numberArb = fc.double({
  noNaN: true,
  noDefaultInfinity: true,
  min: -1e12,
  max: 1e12,
});

// Timestamps within a realistic range (roughly 1973–2065) so date/time ordering
// conventions are meaningfully exercised across locales.
const timestampArb = fc.integer({
  min: 100_000_000_000,
  max: 3_000_000_000_000,
});

describe("Property 15: Locale formatting matches locale conventions", () => {
  it("formats numbers, dates, and times equivalently to the locale's reference Intl formatting", () => {
    fc.assert(
      fc.property(localeArb, numberArb, timestampArb, (locale, value, ts) => {
        // Numbers: digit representation, decimal and thousands separators.
        const refNumber = new Intl.NumberFormat(locale).format(value);
        expect(formatNumber(value, locale)).toBe(refNumber);

        // Dates: ordering and digit representation (default medium style).
        const date = new Date(ts);
        const refDate = new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
        }).format(date);
        expect(formatDate(date, locale)).toBe(refDate);

        // Times: ordering and digit representation (default short style).
        const refTime = new Intl.DateTimeFormat(locale, {
          timeStyle: "short",
        }).format(date);
        expect(formatTime(date, locale)).toBe(refTime);

        // The numeric timestamp form must agree with the Date form, confirming
        // the helpers accept both inputs without altering conventions.
        expect(formatDate(ts, locale)).toBe(refDate);
        expect(formatTime(ts, locale)).toBe(refTime);
      }),
      { numRuns: 100 },
    );
  });
});
