// Accessible-name computation for interactive controls (Requirement 5.1, 5.3,
// Property 3). Pure, framework-agnostic helper: given a descriptor of a control
// and the labeling strategies applied to it, derive the programmatically
// determinable accessible name. Kept pure so it can be property-tested without
// a DOM.
//
// This is a pragmatic subset of the WAI-ARIA "accessible name computation"
// (accname) precedence, sufficient to verify that every interactive control the
// Dashboard renders exposes a non-empty name describing its purpose/action.

/**
 * A descriptor of a single interactive control and the labeling strategies
 * that have been applied to it. Every field is optional; the accessible name is
 * derived from whichever strategies are present, following ARIA precedence.
 */
export interface ControlDescriptor {
  /** Element/role kind, e.g. "button", "input", "a", "checkbox". */
  role?: string;
  /** `aria-labelledby`: ids referencing other elements whose text labels this control. */
  ariaLabelledBy?: string[];
  /** `aria-label`: a direct string label on the control. */
  ariaLabel?: string;
  /**
   * Text of the `<label>` element associated with this control (via `htmlFor`
   * or by wrapping). For form inputs this is the primary visible label.
   */
  associatedLabel?: string;
  /** Visible text content of the control (e.g. a button's inner text). */
  textContent?: string;
  /** `title` attribute (tooltip) — a last-resort labeling source. */
  title?: string;
  /** `alt` text, for image controls / icon buttons rendered as images. */
  alt?: string;
  /** `value`, used by button-like inputs (`<input type="submit" value="Save">`). */
  value?: string;
  /** `placeholder`, a weak fallback label source for text inputs. */
  placeholder?: string;
}

/**
 * A registry mapping element ids to their text, used to resolve
 * `aria-labelledby` references. Missing ids contribute nothing.
 */
export type LabelRegistry = Record<string, string>;

/** Collapse ASCII/Unicode whitespace runs and trim, per accname flattening. */
function normalize(text: string | undefined | null): string {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Resolve `aria-labelledby` into a single flat string by concatenating the
 * text of each referenced id (in order) separated by a single space. Ids with
 * no entry in the registry contribute nothing.
 */
function resolveLabelledBy(
  ids: string[] | undefined,
  registry: LabelRegistry,
): string {
  if (!ids || ids.length === 0) return "";
  return normalize(
    ids
      .map((id) => normalize(registry[id]))
      .filter((part) => part.length > 0)
      .join(" "),
  );
}

/**
 * Compute the accessible name of a control from its descriptor, following a
 * simplified WAI-ARIA accessible-name precedence:
 *
 *   1. aria-labelledby (resolved against the registry)
 *   2. aria-label
 *   3. associated <label>
 *   4. text content
 *   5. value (button-like controls)
 *   6. alt (image controls)
 *   7. title
 *   8. placeholder (weak fallback)
 *
 * Returns the first non-empty source in that order, normalized. Returns an
 * empty string only when the control exposes no labeling information at all —
 * which the Dashboard treats as a violation of Requirement 5.1/5.3.
 */
export function computeAccessibleName(
  descriptor: ControlDescriptor,
  registry: LabelRegistry = {},
): string {
  if (!descriptor) return "";

  const sources: string[] = [
    resolveLabelledBy(descriptor.ariaLabelledBy, registry),
    normalize(descriptor.ariaLabel),
    normalize(descriptor.associatedLabel),
    normalize(descriptor.textContent),
    normalize(descriptor.value),
    normalize(descriptor.alt),
    normalize(descriptor.title),
    normalize(descriptor.placeholder),
  ];

  for (const source of sources) {
    if (source.length > 0) return source;
  }
  return "";
}

/**
 * Convenience predicate: does the control have a non-empty accessible name?
 * Used by callers and tests to assert Requirement 5.1/5.3.
 */
export function hasAccessibleName(
  descriptor: ControlDescriptor,
  registry: LabelRegistry = {},
): boolean {
  return computeAccessibleName(descriptor, registry).length > 0;
}
