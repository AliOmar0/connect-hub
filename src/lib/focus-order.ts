// Pure focus-order / traversal helpers for keyboard accessibility
// (Requirements 4.1, 4.3, 4.7; Properties 38 and 39).
//
// This module is intentionally framework-free: it models a set of focusable
// controls and computes cyclic Tab traversal over them, honoring modal focus
// scoping. Property 38 (non-modal controls never trap focus) and Property 39
// (focus order follows reading order) both build on this helper.

/** Document / layout direction. */
export type Direction = "ltr" | "rtl";

/** Scope key used for controls that live in the base document (not a modal). */
export const DOCUMENT_SCOPE = "document";

/**
 * A single focusable control in the model.
 *
 * `order` encodes the logical reading-order position of the control (lower
 * comes first). Tab order follows reading order, which is direction-independent
 * at the logical level, so callers that build controls from a visual layout are
 * responsible for mapping coordinates to `order` for the active Direction.
 */
export interface FocusableControl {
  /** Stable identity for the control. */
  id: string;
  /** Logical reading-order position (lower comes first). */
  order: number;
  /** Focus scope the control belongs to; defaults to DOCUMENT_SCOPE. */
  scope?: string;
  /** Disabled controls are neither focusable nor part of the Tab cycle. */
  disabled?: boolean;
}

/** The scope of the control that currently traps focus, if any. */
function scopeOf(control: FocusableControl): string {
  return control.scope ?? DOCUMENT_SCOPE;
}

/**
 * Return the ordered list of controls that are tabbable given the currently
 * open modal.
 *
 * - When a modal is open (`openModalId` non-null), only controls inside that
 *   modal are tabbable (the modal traps focus, per Requirement 4.4).
 * - When no modal is open, only base-document controls are tabbable.
 * - Disabled controls are always excluded.
 *
 * The result is sorted by logical reading order; ties break by `id` so the
 * order is deterministic.
 */
export function tabbableControls(
  controls: FocusableControl[],
  openModalId: string | null = null,
): FocusableControl[] {
  if (!Array.isArray(controls)) return [];
  const activeScope = openModalId ?? DOCUMENT_SCOPE;
  return controls
    .filter((c) => !c.disabled && scopeOf(c) === activeScope)
    .slice()
    .sort(
      (a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

/**
 * Return the id of the next focusable control after `currentId` in cyclic Tab
 * order, or `null` when there is nothing to focus.
 *
 * If `currentId` is not itself tabbable, traversal begins from the first
 * tabbable control. When exactly one control is tabbable, it is returned (there
 * is nowhere else to move).
 */
export function nextFocusable(
  controls: FocusableControl[],
  currentId: string,
  openModalId: string | null = null,
): string | null {
  const tabbable = tabbableControls(controls, openModalId);
  if (tabbable.length === 0) return null;
  const idx = tabbable.findIndex((c) => c.id === currentId);
  if (idx === -1) return tabbable[0].id;
  return tabbable[(idx + 1) % tabbable.length].id;
}

/**
 * Return the id of the previous focusable control before `currentId` in cyclic
 * Tab order (Shift+Tab), or `null` when there is nothing to focus.
 */
export function previousFocusable(
  controls: FocusableControl[],
  currentId: string,
  openModalId: string | null = null,
): string | null {
  const tabbable = tabbableControls(controls, openModalId);
  if (tabbable.length === 0) return null;
  const idx = tabbable.findIndex((c) => c.id === currentId);
  if (idx === -1) return tabbable[tabbable.length - 1].id;
  return tabbable[(idx - 1 + tabbable.length) % tabbable.length].id;
}

/**
 * Compute the full traversal reached by repeatedly pressing Tab starting from
 * `currentId`, following the cyclic order until it returns to the start.
 *
 * The returned list is the sequence of controls visited *after* leaving
 * `currentId`, ending when the cycle wraps back to `currentId`. For a
 * well-formed order this is every other tabbable control exactly once.
 */
export function traversalFrom(
  controls: FocusableControl[],
  currentId: string,
  openModalId: string | null = null,
): string[] {
  const tabbable = tabbableControls(controls, openModalId);
  if (tabbable.length === 0) return [];
  const visited: string[] = [];
  let cursor = currentId;
  // Guard the loop length by the tabbable size so a malformed cycle can never
  // spin forever.
  for (let i = 0; i < tabbable.length; i++) {
    const next = nextFocusable(controls, cursor, openModalId);
    if (next === null || next === currentId) break;
    visited.push(next);
    cursor = next;
  }
  return visited;
}

/**
 * Whether focus is trapped at `currentId`: the control is tabbable, other
 * tabbable controls exist, yet pressing Tab keeps returning to the same
 * control so focus can never move away.
 *
 * For a correctly formed cyclic order this is always `false` for any
 * non-modal control, which is exactly Property 38.
 */
export function trapsFocus(
  controls: FocusableControl[],
  currentId: string,
  openModalId: string | null = null,
): boolean {
  const tabbable = tabbableControls(controls, openModalId);
  const isTabbable = tabbable.some((c) => c.id === currentId);
  if (!isTabbable || tabbable.length <= 1) return false;
  const next = nextFocusable(controls, currentId, openModalId);
  return next === currentId;
}
