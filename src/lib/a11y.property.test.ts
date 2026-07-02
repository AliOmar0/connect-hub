// Feature: ui-ux-redesign, Property 3
//
// Property 3: Every interactive control has a non-empty accessible name.
// For any interactive control or form input — including icon-only controls —
// that applies at least one valid labeling strategy (aria-labelledby,
// aria-label, an associated <label>, text content, value, alt, title, or
// placeholder), the programmatically determinable accessible name is non-empty
// and describes the control's purpose/action.
//
// Validates: Requirements 5.1, 5.3

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  computeAccessibleName,
  type ControlDescriptor,
  type LabelRegistry,
} from "./a11y";

// Text guaranteed to contain at least one non-whitespace character, so it
// survives accname whitespace-normalization as a real label.
const meaningfulText: fc.Arbitrary<string> = fc
  .tuple(
    fc.string(),
    fc.constantFrom(
      "Save",
      "Close dialog",
      "Search sessions",
      "Open menu",
      "حفظ",
      "Delete employee",
      "X",
    ),
    fc.string(),
  )
  .map(([a, core, b]) => `${a}${core}${b}`);

// Whitespace-only or empty strings that normalize away to no name.
const emptyish: fc.Arbitrary<string> = fc.constantFrom("", " ", "\t", "\n  \t");

const optionalText: fc.Arbitrary<string | undefined> = fc.oneof(
  fc.constant(undefined),
  emptyish,
  meaningfulText,
);

const roleArb = fc.constantFrom(
  "button",
  "input",
  "a",
  "checkbox",
  "radio",
  "switch",
  "menuitem",
  // icon-only control (no text content of its own)
  "icon-button",
);

// The eight labeling strategies computeAccessibleName supports, in precedence
// order. Each generator yields a descriptor whose named strategy is guaranteed
// non-empty (plus a registry when the strategy needs one).
type LabeledCase = { descriptor: ControlDescriptor; registry: LabelRegistry };

const labeledViaAriaLabelledBy: fc.Arbitrary<LabeledCase> = fc
  .tuple(fc.constantFrom("lbl-1", "lbl-2", "hdr"), meaningfulText)
  .map(([id, text]) => ({
    descriptor: { ariaLabelledBy: [id] },
    registry: { [id]: text },
  }));

const withStrategy = (
  build: (text: string) => ControlDescriptor,
): fc.Arbitrary<LabeledCase> =>
  meaningfulText.map((text) => ({ descriptor: build(text), registry: {} }));

const labeledCase: fc.Arbitrary<LabeledCase> = fc.oneof(
  labeledViaAriaLabelledBy,
  withStrategy((t) => ({ ariaLabel: t })),
  withStrategy((t) => ({ associatedLabel: t })),
  withStrategy((t) => ({ textContent: t })),
  withStrategy((t) => ({ value: t })),
  withStrategy((t) => ({ alt: t })),
  withStrategy((t) => ({ title: t })),
  withStrategy((t) => ({ placeholder: t })),
);

// Compose a full descriptor: a guaranteed-labeled base, plus a role and a spray
// of arbitrary (possibly empty) other fields, so the property holds regardless
// of what other noise is present.
const controlArb: fc.Arbitrary<LabeledCase> = fc
  .tuple(
    labeledCase,
    roleArb,
    optionalText,
    optionalText,
    optionalText,
    optionalText,
  )
  .map(([base, role, extra1, extra2, extra3, extra4]) => ({
    descriptor: {
      role,
      // Start with arbitrary noise fields, then apply the guaranteed strategy
      // last so it is never clobbered.
      title: extra1,
      placeholder: extra2,
      textContent: extra3,
      ariaLabel: extra4,
      ...base.descriptor,
    },
    registry: base.registry,
  }));

describe("Property 3: Every interactive control has a non-empty accessible name", () => {
  it("computes a non-empty accessible name for any labeled control", () => {
    fc.assert(
      fc.property(controlArb, ({ descriptor, registry }) => {
        const name = computeAccessibleName(descriptor, registry);

        // Non-empty and describes the control (contains a real, non-whitespace
        // character rather than being blank).
        expect(name.length).toBeGreaterThan(0);
        expect(name.trim()).toBe(name);
        expect(/\S/.test(name)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("returns empty only when a control exposes no labeling information", () => {
    // Guards the contrapositive: an unlabeled control is correctly reported as
    // nameless, so the property above is meaningful and not vacuously true.
    expect(computeAccessibleName({ role: "icon-button" })).toBe("");
    expect(computeAccessibleName({ ariaLabelledBy: ["missing"] }, {})).toBe("");
  });
});
