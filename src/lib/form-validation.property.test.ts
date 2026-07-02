// Feature: ui-ux-redesign, Property 4
//
// Property 4: Validation state is a clean round trip.
// For any form input, when validation fails the error message is
// programmatically associated with the input (aria-describedby), the input's
// invalid state is exposed (aria-invalid), and the entered value is retained;
// and when the same input subsequently becomes valid, the associated error
// message and the invalid-state indication are removed.
//
// Validates: Requirements 5.6, 5.7

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  computeFieldValidationState,
  errorMessageId,
  type FieldValidator,
} from "./form-validation";

// A stable, non-empty field id (used as the aria-describedby association base).
const fieldIdArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 24 })
  .map((s) => `field-${s.replace(/\s+/g, "-")}`);

// Arbitrary user-entered values, including empty strings and whitespace.
const valueArb: fc.Arbitrary<string> = fc.string({ maxLength: 40 });

// Arbitrary non-empty error messages a validator might produce.
const messageArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 60 })
  .filter((s) => s.length > 0);

describe("Property 4: Validation state is a clean round trip", () => {
  it("associates error + invalid state on failure and retains the value; clears both on success", () => {
    fc.assert(
      fc.property(
        fieldIdArb,
        valueArb,
        valueArb,
        messageArb,
        (fieldId, invalidValue, validValue, errorMessage) => {
          // A validator that fails for the "invalid" value and passes otherwise.
          const validate: FieldValidator = (v) =>
            v === invalidValue && invalidValue !== validValue
              ? errorMessage
              : null;

          // Guard: ensure the two generated values genuinely differ so the
          // transition is a real invalid -> valid round trip.
          fc.pre(invalidValue !== validValue);

          // --- Failing state (Requirement 5.6) ---
          const failed = computeFieldValidationState(
            fieldId,
            invalidValue,
            validate,
          );

          // Invalid state is exposed to assistive technology.
          expect(failed.ariaInvalid).toBe(true);
          // Error message is programmatically associated with the input.
          expect(failed.describedById).toBe(errorMessageId(fieldId));
          expect(typeof failed.describedById).toBe("string");
          expect(
            failed.describedById && failed.describedById.length,
          ).toBeGreaterThan(0);
          // The error message is present and non-empty.
          expect(failed.message).toBe(errorMessage);
          // The entered value is retained.
          expect(failed.value).toBe(invalidValue);

          // --- Becoming valid (Requirement 5.7) ---
          const passed = computeFieldValidationState(
            fieldId,
            validValue,
            validate,
          );

          // Invalid-state indication is removed.
          expect(passed.ariaInvalid).toBe(false);
          // The associated error message is removed (no stale association).
          expect(passed.describedById).toBeUndefined();
          expect(passed.message).toBeUndefined();
          // The (now valid) entered value is still retained.
          expect(passed.value).toBe(validValue);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("is deterministic and idempotent: recomputing a state yields the same result (round trip closes)", () => {
    fc.assert(
      fc.property(
        fieldIdArb,
        valueArb,
        fc.boolean(),
        messageArb,
        (fieldId, value, shouldFail, errorMessage) => {
          const validate: FieldValidator = () =>
            shouldFail ? errorMessage : null;

          const first = computeFieldValidationState(fieldId, value, validate);
          const second = computeFieldValidationState(fieldId, value, validate);

          // Same inputs -> identical state.
          expect(second).toEqual(first);

          // The value is always retained regardless of validity.
          expect(first.value).toBe(value);

          // Invariant tying the fields together: an associated error id and a
          // message exist if and only if the field is invalid.
          const hasAssociation =
            first.describedById !== undefined && first.message !== undefined;
          expect(hasAssociation).toBe(first.ariaInvalid);
        },
      ),
      { numRuns: 100 },
    );
  });
});
