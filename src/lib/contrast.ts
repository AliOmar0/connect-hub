// WCAG 2.1 color-contrast math for the design system (Requirements 3.1–3.4).
// Pure functions: parse a color, compute relative luminance, derive the contrast
// ratio between a foreground/background pair, and test it against the AA/AAA
// thresholds for the relevant text size / graphical-element class.

export interface RGB {
  r: number; // 0–255
  g: number; // 0–255
  b: number; // 0–255
}

/**
 * Size class of the element being checked.
 * - `normal`    : body text below the WCAG large-text threshold
 * - `large`     : large text (>=24px regular or >=18.66px bold)
 * - `graphical` : meaningful icons, control boundaries, focus indicators
 */
export type ContrastSizeClass = "normal" | "large" | "graphical";

export type ContrastLevel = "AA" | "AAA";

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_RE =
  /^rgba?\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/i;

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/**
 * Parse a CSS color literal into RGB. Supports #rgb, #rgba, #rrggbb,
 * #rrggbbaa and rgb()/rgba() notations. Alpha is ignored for the luminance
 * calculation (WCAG contrast is defined against opaque adjacent backgrounds).
 * Returns null when the input cannot be parsed.
 */
export function parseColor(input: string): RGB | null {
  if (typeof input !== "string") return null;
  const value = input.trim();

  const hex = HEX_RE.exec(value);
  if (hex) {
    let h = hex[1];
    // Expand shorthand (#rgb / #rgba) to full form.
    if (h.length === 3 || h.length === 4) {
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    }
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }

  const rgb = RGB_RE.exec(value);
  if (rgb) {
    return {
      r: clampByte(Number(rgb[1])),
      g: clampByte(Number(rgb[2])),
      b: clampByte(Number(rgb[3])),
    };
  }

  return null;
}

/**
 * Relative luminance of an sRGB color per WCAG 2.1 definition.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance(color: RGB): number {
  const toLinear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * toLinear(color.r) +
    0.7152 * toLinear(color.g) +
    0.0722 * toLinear(color.b)
  );
}

/**
 * WCAG contrast ratio between two colors, in the range [1, 21].
 * Accepts either color strings or already-parsed RGB. Throws a TypeError when a
 * color cannot be parsed so misuse surfaces instead of silently passing.
 */
export function contrastRatio(fg: string | RGB, bg: string | RGB): number {
  const fgRgb = typeof fg === "string" ? parseColor(fg) : fg;
  const bgRgb = typeof bg === "string" ? parseColor(bg) : bg;
  if (!fgRgb)
    throw new TypeError(`Unparseable foreground color: ${String(fg)}`);
  if (!bgRgb)
    throw new TypeError(`Unparseable background color: ${String(bg)}`);

  const l1 = relativeLuminance(fgRgb);
  const l2 = relativeLuminance(bgRgb);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Minimum contrast ratio required for a given size class and conformance level.
 * AA:  4.5 normal, 3 large, 3 graphical.
 * AAA: 7   normal, 4.5 large, 3 graphical (non-text stays at 3:1 under WCAG).
 */
export function contrastThreshold(
  sizeClass: ContrastSizeClass,
  level: ContrastLevel,
): number {
  if (sizeClass === "graphical") return 3;
  if (level === "AAA") return sizeClass === "large" ? 4.5 : 7;
  return sizeClass === "large" ? 3 : 4.5;
}

/**
 * True when the foreground/background pair meets the WCAG contrast minimum for
 * the given size class and conformance level (defaults: normal text, AA).
 */
export function meetsContrast(
  fg: string | RGB,
  bg: string | RGB,
  sizeClass: ContrastSizeClass = "normal",
  level: ContrastLevel = "AA",
): boolean {
  return contrastRatio(fg, bg) >= contrastThreshold(sizeClass, level);
}
