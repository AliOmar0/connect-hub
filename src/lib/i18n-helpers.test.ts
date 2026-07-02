import { describe, it, expect } from "vitest";
import {
  languageToDirection,
  resolveText,
  formatNumber,
  formatDate,
  formatTime,
  isolateLtr,
  type Dictionary,
} from "./i18n-helpers";

describe("languageToDirection", () => {
  it("maps Arabic to rtl", () => {
    expect(languageToDirection("ar")).toBe("rtl");
  });

  it("maps English to ltr", () => {
    expect(languageToDirection("en")).toBe("ltr");
  });

  it("handles BCP-47 tags by primary subtag", () => {
    expect(languageToDirection("ar-PS")).toBe("rtl");
    expect(languageToDirection("en-US")).toBe("ltr");
  });

  it("defaults unknown/empty languages to ltr", () => {
    expect(languageToDirection("")).toBe("ltr");
    expect(languageToDirection("fr")).toBe("ltr");
  });
});

describe("resolveText", () => {
  const dict: Dictionary = {
    en: { "nav.dashboard": "Dashboard", "common.save": "Save" },
    ar: { "nav.dashboard": "لوحة التحكم" },
  };

  it("returns the active-language translation when present", () => {
    expect(resolveText("nav.dashboard", "ar", dict)).toBe("لوحة التحكم");
  });

  it("falls back to English when the active translation is missing", () => {
    expect(resolveText("common.save", "ar", dict)).toBe("Save");
  });

  it("falls back to English when the active value is empty", () => {
    const withEmpty: Dictionary = {
      en: { "common.save": "Save" },
      ar: { "common.save": "" },
    };
    expect(resolveText("common.save", "ar", withEmpty)).toBe("Save");
  });

  it("never returns an empty string for a key present in English", () => {
    expect(resolveText("common.save", "ar", dict)).not.toBe("");
  });

  it("returns the key as a last resort when absent everywhere", () => {
    expect(resolveText("missing.key", "ar", dict)).toBe("missing.key");
  });
});

describe("locale formatting", () => {
  it("formats numbers with locale separators (en)", () => {
    expect(formatNumber(1234567.89, "en-US")).toBe("1,234,567.89");
  });

  it("uses Arabic-Indic digits for the ar locale", () => {
    // Arabic locale renders digits in Arabic-Indic by default.
    expect(formatNumber(123, "ar-EG")).toBe("١٢٣");
  });

  it("matches Intl reference output for dates", () => {
    const d = new Date(Date.UTC(2024, 0, 15, 9, 5));
    const opts: Intl.DateTimeFormatOptions = {
      dateStyle: "medium",
      timeZone: "UTC",
    };
    expect(formatDate(d, "en-US", opts)).toBe(
      new Intl.DateTimeFormat("en-US", opts).format(d),
    );
  });

  it("matches Intl reference output for times", () => {
    const d = new Date(Date.UTC(2024, 0, 15, 9, 5));
    const opts: Intl.DateTimeFormatOptions = {
      timeStyle: "short",
      timeZone: "UTC",
    };
    expect(formatTime(d, "en-US", opts)).toBe(
      new Intl.DateTimeFormat("en-US", opts).format(d),
    );
  });
});

describe("isolateLtr", () => {
  it("wraps the value in Unicode LTR isolates", () => {
    expect(isolateLtr("+970-59-123")).toBe("\u2066+970-59-123\u2069");
  });

  it("preserves the original character order", () => {
    const value = "GB29 NWBK 6016 1331 9268 19";
    const wrapped = isolateLtr(value);
    // Stripping the isolate controls yields the original string unchanged.
    expect(wrapped.replace(/[\u2066\u2069]/g, "")).toBe(value);
  });

  it("leaves empty input untouched", () => {
    expect(isolateLtr("")).toBe("");
  });
});
