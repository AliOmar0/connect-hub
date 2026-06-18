import { describe, it, expect } from "vitest";
import { maskDigits, maskEmail, maskText } from "./mask";

describe("maskDigits", () => {
  it("masks all but the last 4 digits of a long run", () => {
    expect(maskDigits("12345678")).toBe("••••5678");
  });

  it("leaves short digit runs untouched", () => {
    expect(maskDigits("1234")).toBe("1234");
  });

  it("respects a custom visible count", () => {
    expect(maskDigits("123456789", 2)).toBe("•••••••89");
  });

  it("masks digits embedded in text", () => {
    expect(maskDigits("account 998877665 ok")).toContain("•");
  });
});

describe("maskEmail", () => {
  it("masks the local part of an email", () => {
    expect(maskEmail("john.doe@example.com")).toBe("j•••@example.com");
  });

  it("ignores plain text without emails", () => {
    expect(maskEmail("no email here")).toBe("no email here");
  });
});

describe("maskText", () => {
  it("returns empty string for nullish input", () => {
    expect(maskText(null)).toBe("");
    expect(maskText(undefined)).toBe("");
    expect(maskText("")).toBe("");
  });

  it("masks both digits and emails", () => {
    const out = maskText("call 0599123456 or mail ali@pib.ps");
    expect(out).toContain("•");
    expect(out).toContain("@pib.ps");
    expect(out).not.toContain("ali@pib.ps");
  });
});
