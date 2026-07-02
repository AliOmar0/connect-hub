import { describe, it, expect } from "vitest";
import {
  parseColor,
  relativeLuminance,
  contrastRatio,
  contrastThreshold,
  meetsContrast,
} from "./contrast";

describe("parseColor", () => {
  it("parses 6-digit hex", () => {
    expect(parseColor("#ffffff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor("#000000")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("expands 3-digit shorthand hex", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor("#f00")).toEqual({ r: 255, g: 0, b: 0 });
  });

  it("ignores alpha in #rrggbbaa", () => {
    expect(parseColor("#0a0a0a80")).toEqual({ r: 10, g: 10, b: 10 });
  });

  it("parses rgb() and rgba() notations", () => {
    expect(parseColor("rgb(18, 52, 86)")).toEqual({ r: 18, g: 52, b: 86 });
    expect(parseColor("rgba(255, 0, 0, 0.5)")).toEqual({ r: 255, g: 0, b: 0 });
  });

  it("returns null for unparseable input", () => {
    expect(parseColor("not-a-color")).toBeNull();
    expect(parseColor("#12")).toBeNull();
  });
});

describe("relativeLuminance", () => {
  it("is 0 for black and 1 for white", () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
  });
});

describe("contrastRatio", () => {
  it("is 21:1 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 2);
  });

  it("is 1:1 for identical colors", () => {
    expect(contrastRatio("#336699", "#336699")).toBeCloseTo(1, 5);
  });

  it("is symmetric regardless of argument order", () => {
    const a = contrastRatio("#123456", "#abcdef");
    const b = contrastRatio("#abcdef", "#123456");
    expect(a).toBeCloseTo(b, 10);
  });

  it("throws on an unparseable color", () => {
    expect(() => contrastRatio("nope", "#fff")).toThrow(TypeError);
  });
});

describe("contrastThreshold", () => {
  it("uses AA thresholds", () => {
    expect(contrastThreshold("normal", "AA")).toBe(4.5);
    expect(contrastThreshold("large", "AA")).toBe(3);
    expect(contrastThreshold("graphical", "AA")).toBe(3);
  });

  it("uses AAA thresholds", () => {
    expect(contrastThreshold("normal", "AAA")).toBe(7);
    expect(contrastThreshold("large", "AAA")).toBe(4.5);
    expect(contrastThreshold("graphical", "AAA")).toBe(3);
  });
});

describe("meetsContrast", () => {
  it("passes black on white for normal text at AA", () => {
    expect(meetsContrast("#000000", "#ffffff", "normal", "AA")).toBe(true);
  });

  it("fails a low-contrast pair for normal text", () => {
    // ~2.3:1 — below the 4.5 normal-text AA threshold.
    expect(meetsContrast("#777777", "#ffffff", "normal", "AA")).toBe(false);
  });

  it("can pass as large text where it fails as normal text", () => {
    // #767676 on white is ~4.54:1 — passes normal AA; pick a pair between 3 and 4.5.
    const fg = "#949494"; // ~3.0–3.x:1 on white
    expect(meetsContrast(fg, "#ffffff", "large", "AA")).toBe(true);
    expect(meetsContrast(fg, "#ffffff", "normal", "AA")).toBe(false);
  });

  it("defaults to normal text at AA", () => {
    expect(meetsContrast("#000000", "#ffffff")).toBe(true);
  });
});
