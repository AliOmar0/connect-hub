// Feature: ui-ux-redesign, Property 38
//
// Property 38: Non-modal controls never trap focus.
// For any interactive control that is not inside an open modal dialog, keyboard
// focus can move away from the control to another focusable control.
//
// Validates: Requirements 4.1, 4.7

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  DOCUMENT_SCOPE,
  tabbableControls,
  nextFocusable,
  traversalFrom,
  trapsFocus,
  type FocusableControl,
} from "./focus-order";

// Build a model of focusable controls: a mix of base-document (non-modal)
// controls and controls belonging to a modal that is NOT open. Because the
// modal is closed, only the non-modal controls are tabbable — the scenario the
// property is about. Some controls are disabled to exercise skip-over.
const scenarioArb = fc
  .record({
    // At least two non-modal controls so "move away to another control" is
    // meaningful; each carries an arbitrary reading-order position (with
    // possible ties, which the helper breaks deterministically by id).
    docControls: fc.array(
      fc.record({
        order: fc.integer({ min: -50, max: 50 }),
        disabled: fc.boolean(),
      }),
      { minLength: 2, maxLength: 12 },
    ),
    // Controls that live inside a modal which stays closed; they must never
    // interfere with (or trap) the non-modal traversal.
    modalControls: fc.array(
      fc.record({ order: fc.integer({ min: -50, max: 50 }) }),
      { maxLength: 6 },
    ),
  })
  .map(({ docControls, modalControls }) => {
    const controls: FocusableControl[] = [
      ...docControls.map((c, i) => ({
        id: `doc-${i}`,
        order: c.order,
        scope: DOCUMENT_SCOPE,
        disabled: c.disabled,
      })),
      ...modalControls.map((c, i) => ({
        id: `modal-${i}`,
        order: c.order,
        scope: "modal-1",
        disabled: false,
      })),
    ];
    return controls;
  })
  // Keep only scenarios where at least two non-modal controls are actually
  // focusable (not disabled), so the "move away" guarantee is exercised.
  .filter(
    (controls) =>
      controls.filter((c) => c.scope === DOCUMENT_SCOPE && !c.disabled)
        .length >= 2,
  );

describe("Property 38: Non-modal controls never trap focus", () => {
  it("lets focus move away from every non-modal control to another focusable control", () => {
    fc.assert(
      fc.property(scenarioArb, (controls) => {
        // No modal is open: the active scope is the base document.
        const tabbable = tabbableControls(controls, null);
        const tabbableIds = tabbable.map((c) => c.id);

        // Sanity: only enabled, non-modal controls are tabbable while the modal
        // is closed.
        for (const c of tabbable) {
          expect(c.scope).toBe(DOCUMENT_SCOPE);
          expect(c.disabled).not.toBe(true);
        }

        for (const control of tabbable) {
          // 1. No non-modal control traps focus.
          expect(trapsFocus(controls, control.id, null)).toBe(false);

          // 2. Pressing Tab moves focus to a DIFFERENT control (no self-trap).
          const next = nextFocusable(controls, control.id, null);
          expect(next).not.toBeNull();
          expect(next).not.toBe(control.id);
          expect(tabbableIds).toContain(next);

          // 3. Repeated Tab reaches every other focusable control — focus is
          //    never confined to a subset that excludes some reachable control.
          const reached = traversalFrom(controls, control.id, null);
          const expectedOthers = tabbableIds
            .filter((id) => id !== control.id)
            .sort();
          expect([...reached].sort()).toEqual(expectedOthers);
        }
      }),
      { numRuns: 100 },
    );
  });
});
