// Pure form-validation-state helper (Requirements 5.6, 5.7, Property 4).
//
// This models the accessibility contract for a single form field as a pure,
// deterministic function so it can be property-tested and reused by field
// components. It computes the ARIA wiring and retained value for a field given
// its current value and a validator:
//
//   - On validation failure: the field is marked invalid (`ariaInvalid`), the
//     error message is programmatically associated via a stable
//     `describedById` (aria-describedby target), the human-readable `message`
//     is exposed, and the entered `value` is retained.
//   - On validation success: the invalid-state indication and the associated
//     error message are removed (`ariaInvalid: false`, `describedById` and
//     `message` become undefined), while the entered `value` is still retained.

/** A validator returns an error message string when invalid, or null when valid. */
export type FieldValidator = (value: string) => string | null | undefined;

/**
 * The resolved accessibility state for a single form field. Mirrors the props a
 * field component binds to its input and error element:
 *   - `ariaInvalid`    -> input `aria-invalid`
 *   - `describedById`  -> input `aria-describedby` (and the error element `id`)
 *   - `message`        -> the rendered error text
 *   - `value`          -> the retained entered value
 */
export interface FieldValidationState {
  /** True when the field is invalid; exposed to AT via `aria-invalid`. */
  ariaInvalid: boolean;
  /**
   * The id that programmatically associates the error message with the input
   * (used for both `aria-describedby` and the error element's `id`). Undefined
   * when the field is valid so no stale association remains.
   */
  describedById: string | undefined;
  /** The human-readable error message, or undefined when valid. */
  message: string | undefined;
  /** The user's entered value, always retained across valid/invalid states. */
  value: string;
}

/** Deterministic id used to associate a field's error message with the input. */
export function errorMessageId(fieldId: string): string {
  return `${fieldId}-error`;
}

/**
 * Compute the accessible validation state for a field. Pure and deterministic:
 * the same inputs always yield the same output.
 *
 * A message is treated as "present" only when it is a non-empty string, so a
 * validator returning `""` is treated as valid (there is nothing to announce).
 */
export function computeFieldValidationState(
  fieldId: string,
  value: string,
  validate: FieldValidator,
): FieldValidationState {
  const raw = validate(value);
  const hasError = typeof raw === "string" && raw.length > 0;

  if (hasError) {
    return {
      ariaInvalid: true,
      describedById: errorMessageId(fieldId),
      message: raw as string,
      value,
    };
  }

  return {
    ariaInvalid: false,
    describedById: undefined,
    message: undefined,
    value,
  };
}
