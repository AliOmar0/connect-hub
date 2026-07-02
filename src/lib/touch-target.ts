// Touch-target sizing helpers for the design system.
//
// WCAG 2.1 AA + the redesign spec require that every interactive control has an
// activation area of at least 44x44 CSS pixels at every reference breakpoint
// (Requirements 6.1, 6.4, 7.6), and that two adjacent controls that are each
// smaller than 44px in some dimension are separated by at least 8px so their
// hit areas never overlap (Requirement 6.2).
//
// The visual behaviour lives in `src/index.css` as three utility classes
// (`.touch-target`, `.touch-target-hit`, `.touch-gap`) backed by the spacing
// scale (`--space-11` = 44px, `--space-2` = 8px). This module mirrors those
// class names and the numeric thresholds so components and tests reference a
// single source of truth instead of hard-coded literals.

import { cn } from "@/lib/utils";

/** Minimum touch-target dimension in CSS pixels (`--space-11`). */
export const TOUCH_TARGET_MIN_PX = 44;

/** Minimum separation between adjacent sub-44px controls in CSS pixels (`--space-2`). */
export const MIN_ADJACENT_GAP_PX = 8;

/** CSS custom property backing the touch-target minimum. */
export const TOUCH_TARGET_TOKEN = "--space-11";

/** CSS custom property backing the adjacent-separation minimum. */
export const TOUCH_GAP_TOKEN = "--space-2";

/** Utility class that grows a control's own box to at least 44x44. */
export const TOUCH_TARGET_CLASS = "touch-target";

/** Utility class that extends the activation area to 44x44 without resizing the visible box. */
export const TOUCH_TARGET_HIT_CLASS = "touch-target-hit";

/** Utility class that enforces >=8px spacing between adjacent controls. */
export const TOUCH_GAP_CLASS = "touch-gap";

/**
 * Hit-area strategy:
 * - `"grow"`   enlarges the control's own box to the 44px minimum.
 * - `"extend"` keeps the visible box unchanged and extends only the
 *   activation area via a centered pseudo-element hit area (Requirement 6.4).
 */
export type HitAreaStrategy = "grow" | "extend";

/**
 * Return the touch-target utility class for a given strategy, merged with any
 * additional classes.
 *
 * @param strategy  Whether to grow the visible box or extend the hit area only.
 * @param className Optional extra classes to merge.
 */
export function touchTargetClass(
  strategy: HitAreaStrategy = "grow",
  className?: string,
): string {
  const base =
    strategy === "extend" ? TOUCH_TARGET_HIT_CLASS : TOUCH_TARGET_CLASS;
  return cn(base, className);
}

/**
 * Return the container utility class that guarantees >=8px separation between
 * adjacent controls, merged with any additional classes.
 */
export function touchGapClass(className?: string): string {
  return cn(TOUCH_GAP_CLASS, className);
}

/**
 * Whether a control's dimensions meet the 44x44 CSS px activation minimum.
 *
 * @param width  Activation-area width in CSS pixels.
 * @param height Activation-area height in CSS pixels.
 */
export function meetsTouchTargetSize(width: number, height: number): boolean {
  return width >= TOUCH_TARGET_MIN_PX && height >= TOUCH_TARGET_MIN_PX;
}

/**
 * Whether a control is a "small target" — smaller than the 44px minimum in at
 * least one dimension. Small targets are the ones that trigger the adjacent
 * separation rule (Requirement 6.2).
 */
export function isSmallTarget(width: number, height: number): boolean {
  return width < TOUCH_TARGET_MIN_PX || height < TOUCH_TARGET_MIN_PX;
}

/**
 * Whether the separation between two adjacent controls satisfies Requirement
 * 6.2. The 8px minimum only applies when BOTH controls are small targets; a
 * negative gap (overlapping hit areas) is never acceptable for small targets.
 *
 * @param gapPx  Separation between the two hit areas in CSS pixels.
 * @param aSmall Whether the first control is a small target.
 * @param bSmall Whether the second control is a small target.
 */
export function meetsAdjacentSeparation(
  gapPx: number,
  aSmall: boolean,
  bSmall: boolean,
): boolean {
  if (aSmall && bSmall) {
    return gapPx >= MIN_ADJACENT_GAP_PX;
  }
  return true;
}
