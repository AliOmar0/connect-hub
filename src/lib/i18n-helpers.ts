// Pure i18n / direction / locale / bidi helpers for the UI/UX redesign.
//
// These are framework-agnostic, side-effect-free functions consumed by the
// App_Shell, hooks, and pages. Keeping them pure makes the universal properties
// (Requirements 8.1, 8.2, 8.5, 8.7, 8.8) directly testable in isolation.

export type Direction = "ltr" | "rtl";

/**
 * A translation dictionary keyed by language code, then by text key.
 *
 * Example:
 *   { en: { "nav.dashboard": "Dashboard" }, ar: { "nav.dashboard": "لوحة التحكم" } }
 */
export type Dictionary = Record<string, Record<string, string>>;

/** The default language used as the fallback for text resolution. */
export const DEFAULT_LANGUAGE = "en";

/**
 * Primary language subtags that are written right-to-left. Kept local to this
 * module so the helpers stay pure (no dependency on the i18n runtime/init).
 */
const RTL_PRIMARY_SUBTAGS = new Set(["ar", "he", "fa", "ur"]);

/**
 * Extract the primary subtag from a BCP-47 language tag.
 * e.g. "ar-PS" -> "ar", "en-US" -> "en". Empty/invalid input yields "".
 */
function primarySubtag(lang: string): string {
  if (!lang) return "";
  return lang.toLowerCase().split(/[-_]/)[0];
}

/**
 * Map a language to its writing direction.
 * Arabic (and other RTL scripts) -> "rtl"; everything else -> "ltr".
 *
 * Requirements: 8.1, 8.2
 */
export function languageToDirection(lang: string): Direction {
  return RTL_PRIMARY_SUBTAGS.has(primarySubtag(lang)) ? "rtl" : "ltr";
}

/**
 * Resolve a text key to its active-language translation, falling back to the
 * default language (English) when the active translation is missing or empty.
 *
 * The raw key or an empty string is never returned for any key present in the
 * default-language dictionary.
 *
 * Requirements: 8.5
 */
export function resolveText(
  key: string,
  lang: string,
  dict: Dictionary,
): string {
  const active = dict?.[lang];
  const activeValue = active?.[key];
  if (typeof activeValue === "string" && activeValue.length > 0) {
    return activeValue;
  }

  const fallback = dict?.[DEFAULT_LANGUAGE];
  const fallbackValue = fallback?.[key];
  if (typeof fallbackValue === "string" && fallbackValue.length > 0) {
    return fallbackValue;
  }

  // Key is absent from both the active and default dictionaries. There is no
  // translated text to show; returning the key is the last-resort signal for a
  // missing entry (outside the guaranteed contract, which covers keys present
  // in the default dictionary).
  return key;
}

/**
 * Format a number according to the locale's conventions (digit representation,
 * decimal and thousands separators).
 *
 * Requirements: 8.7
 */
export function formatNumber(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Format a date according to the locale's conventions (date ordering, digit
 * representation).
 *
 * Requirements: 8.7
 */
export function formatDate(
  value: Date | number,
  locale: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
): string {
  return new Intl.DateTimeFormat(locale, options).format(value);
}

/**
 * Format a time according to the locale's conventions (time ordering, digit
 * representation).
 *
 * Requirements: 8.7
 */
export function formatTime(
  value: Date | number,
  locale: string,
  options: Intl.DateTimeFormatOptions = { timeStyle: "short" },
): string {
  return new Intl.DateTimeFormat(locale, options).format(value);
}

// Unicode bidi isolate controls.
const LRI = "\u2066"; // LEFT-TO-RIGHT ISOLATE
const PDI = "\u2069"; // POP DIRECTIONAL ISOLATE

/**
 * Wrap a string in Unicode left-to-right isolates so embedded LTR content
 * (masked card numbers, IBANs, phone numbers, key combos) keeps its character
 * order when rendered inside an RTL context.
 *
 * The wrapped value preserves the original characters in order; only the
 * isolate controls are added around them.
 *
 * Requirements: 8.8
 */
export function isolateLtr(value: string): string {
  if (!value) return value;
  return `${LRI}${value}${PDI}`;
}
