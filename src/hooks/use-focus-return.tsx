import * as React from "react";

/**
 * Elements that can receive keyboard focus. Used both to validate the captured
 * opener and to locate a deterministic fallback within a region.
 */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(",");

/**
 * Region containers, in priority order, used to derive the "same region" as
 * the opener. An explicit `[data-focus-region]` wins, then ARIA/HTML landmarks.
 */
const DEFAULT_REGION_SELECTOR = [
  "[data-focus-region]",
  '[role="dialog"]',
  '[role="region"]',
  "section",
  "main",
  "nav",
  "aside",
  "form",
  "header",
  "footer",
].join(",");

export interface UseFocusReturnOptions {
  /**
   * An explicit fallback target used when the opener no longer exists. May be
   * an element or a getter returning one. Takes precedence over the
   * region-derived fallback.
   */
  fallback?: HTMLElement | null | (() => HTMLElement | null);
  /**
   * Selector identifying the region that contains the opener. The first
   * focusable element within that region (in DOM order) is the deterministic
   * fallback when the opener is gone. Defaults to common landmark containers.
   */
  regionSelector?: string;
}

export interface FocusReturn {
  /**
   * Capture the control that should receive focus when the dialog closes.
   * Defaults to the currently focused element (the opener) when no element is
   * passed. Also records the opener's enclosing region for fallback purposes.
   */
  capture: (opener?: HTMLElement | null) => void;
  /**
   * Restore focus to the captured opener if it still exists and is focusable;
   * otherwise move focus to a deterministic fallback control in the same
   * region (the explicit `fallback`, else the first focusable element in the
   * captured region).
   */
  restore: () => void;
}

/** True when `el` is an element currently present in the DOM and focusable. */
export function isFocusable(el: Element | null | undefined): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (!el.isConnected) return false;
  if (el.hasAttribute("disabled")) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  try {
    return el.matches(FOCUSABLE_SELECTOR);
  } catch {
    return false;
  }
}

/** First focusable element within `region`, in DOM order, or null. */
function firstFocusableIn(region: HTMLElement | null): HTMLElement | null {
  if (!region || !region.isConnected) return null;
  const candidates = region.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  for (const candidate of Array.from(candidates)) {
    if (isFocusable(candidate)) return candidate;
  }
  return null;
}

/**
 * Captures the opening control when a dialog opens and restores focus to it on
 * close. When the opener no longer exists in the DOM, focus is returned to a
 * deterministic fallback control in the same region (Requirement 4.5).
 *
 * Conceptual signature: `() => { capture, restore }`.
 */
export function useFocusReturn(
  options: UseFocusReturnOptions = {},
): FocusReturn {
  const { fallback, regionSelector = DEFAULT_REGION_SELECTOR } = options;

  const openerRef = React.useRef<HTMLElement | null>(null);
  const regionRef = React.useRef<HTMLElement | null>(null);

  // Keep the latest option values without forcing `capture`/`restore` to change
  // identity, so consumers can pass them to effects safely.
  const fallbackRef = React.useRef(fallback);
  const regionSelectorRef = React.useRef(regionSelector);
  fallbackRef.current = fallback;
  regionSelectorRef.current = regionSelector;

  const capture = React.useCallback((opener?: HTMLElement | null) => {
    const target =
      opener ??
      (typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null);

    // Ignore the document body / null: it is not a meaningful opener.
    openerRef.current = target && target !== document?.body ? target : null;

    // Record the opener's enclosing region now, while it is still attached, so
    // a fallback can be resolved even after the opener is removed.
    regionRef.current = openerRef.current
      ? (openerRef.current.closest(
          regionSelectorRef.current,
        ) as HTMLElement | null)
      : null;
  }, []);

  const resolveFallback = React.useCallback((): HTMLElement | null => {
    const explicit = fallbackRef.current;
    const resolved =
      typeof explicit === "function" ? explicit() : (explicit ?? null);
    if (isFocusable(resolved)) return resolved;
    return firstFocusableIn(regionRef.current);
  }, []);

  const restore = React.useCallback(() => {
    const opener = openerRef.current;

    if (isFocusable(opener)) {
      opener.focus();
    } else {
      const fb = resolveFallback();
      if (fb) {
        fb.focus();
      } else if (
        typeof document !== "undefined" &&
        document.activeElement instanceof HTMLElement
      ) {
        // No valid target remains: release focus rather than leave it stranded.
        document.activeElement.blur();
      }
    }

    openerRef.current = null;
    regionRef.current = null;
  }, [resolveFallback]);

  return React.useMemo(() => ({ capture, restore }), [capture, restore]);
}
