// Horizontal-overflow prevention helpers for the responsive layout system.
//
// The redesign spec requires that every Page renders without horizontal content
// overflow at the four reference breakpoints (375 / 768 / 1024 / 1440), in both
// LTR and RTL Direction (Requirements 7.1, 13.7, 22.3). "No horizontal overflow"
// is the DOM condition `element.scrollWidth <= element.clientWidth`.
//
// The App_Shell (`DashboardLayout`) enforces this structurally with a small set
// of Tailwind utilities:
//   - the outer shell is `w-full overflow-hidden` (clips any horizontal scroll),
//   - the content column is `flex-1 flex-col overflow-hidden`,
//   - the header context slot is `min-w-0 flex-1` (`min-w-0` lets a flex child
//     shrink below its intrinsic content width instead of forcing overflow),
//   - `<main>` is `overflow-y-auto` (vertical scrolling only; horizontal is
//     never introduced).
// Width-constrained page regions likewise use `w-full`/`max-w-full` with
// `min-w-0`, so their rendered width is clamped to the available container width.
//
// This module captures those semantics as pure, direction-independent functions
// so components and tests reference a single source of truth rather than
// re-deriving the layout contract. Widths never depend on Direction — RTL only
// mirrors horizontal placement — so every predicate here is Direction-invariant.

/** The four reference breakpoints (client widths) from the design. */
export const REFERENCE_BREAKPOINTS = [375, 768, 1024, 1440] as const;
export type ReferenceBreakpoint = (typeof REFERENCE_BREAKPOINTS)[number];

/** Document/layout direction. Included so callers/tests can quantify over both. */
export type LayoutDirection = "ltr" | "rtl";

/** Utility that clips horizontal overflow at a container boundary. */
export const OVERFLOW_CLIP_CLASS = "overflow-hidden";

/**
 * Utility classes that make a (flex/grid/block) child honour the width-constraint
 * contract: it may shrink below its intrinsic content width (`min-w-0`) and never
 * grows past the container (`max-w-full`/`w-full`).
 */
export const CONSTRAIN_WIDTH_CLASSES = [
  "min-w-0",
  "max-w-full",
  "w-full",
] as const;

/** A layout child placed inside a container of some client width. */
export interface LayoutChild {
  /**
   * The child's intrinsic (natural) content width in CSS pixels. This may be far
   * larger than the container — e.g. a wide table, a long unbroken string, or a
   * fixed-width element — which is exactly the case that would overflow if left
   * unconstrained.
   */
  intrinsicWidthPx: number;
  /**
   * Whether the child applies the width-constraint contract
   * (`min-w-0` + `max-w-full`/`w-full`). Constrained children are clamped to the
   * container width; unconstrained children keep their intrinsic width and can
   * therefore overflow.
   */
  constrained: boolean;
}

/**
 * The width a child actually renders at inside a container of `clientWidthPx`.
 * A constrained child is clamped down to the container width; an unconstrained
 * child keeps its intrinsic width.
 */
export function childRenderedWidth(
  child: LayoutChild,
  clientWidthPx: number,
): number {
  return child.constrained
    ? Math.min(child.intrinsicWidthPx, clientWidthPx)
    : child.intrinsicWidthPx;
}

/**
 * The content scroll width of a stack of block-level children in a container of
 * `clientWidthPx`: the widest rendered child determines the horizontal scroll
 * extent. An empty stack contributes no width.
 */
export function contentScrollWidth(
  children: readonly LayoutChild[],
  clientWidthPx: number,
): number {
  return children.reduce(
    (max, child) => Math.max(max, childRenderedWidth(child, clientWidthPx)),
    0,
  );
}

/**
 * Core DOM condition: content produces horizontal overflow when its scroll width
 * exceeds the client width. Uses a strict comparison so an exact fit is not
 * overflow.
 */
export function hasHorizontalOverflow(
  scrollWidthPx: number,
  clientWidthPx: number,
): boolean {
  return scrollWidthPx > clientWidthPx;
}

/**
 * The effective scroll width observed at a container. When the container clips
 * horizontal overflow (`overflow-hidden`, as the App_Shell does), the visible
 * client can never scroll horizontally, so the effective scroll width is capped
 * at the client width regardless of descendant content.
 */
export function effectiveScrollWidth(
  contentScrollWidthPx: number,
  clientWidthPx: number,
  clipsOverflow: boolean,
): number {
  return clipsOverflow
    ? Math.min(contentScrollWidthPx, clientWidthPx)
    : contentScrollWidthPx;
}
