import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import fc from "fast-check";
import { useFocusReturn } from "./use-focus-return";

// Feature: ui-ux-redesign, Property 37
// Invariant: for any control that opens a modal dialog, dismissing the dialog
// returns keyboard focus to the opening control, or — when the opening control
// no longer exists — to a deterministic fallback control in the same region.
//
// Validates: Requirements 4.5

/**
 * Build a region containing `count` focusable buttons appended to the document
 * body. Returns the region and its buttons so the test can pick an opener,
 * optionally remove it, and assert where focus lands after restore().
 */
function buildRegion(count: number): {
  region: HTMLElement;
  buttons: HTMLButtonElement[];
} {
  const region = document.createElement("div");
  region.setAttribute("data-focus-region", "");

  const buttons: HTMLButtonElement[] = [];
  for (let i = 0; i < count; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `control-${i}`;
    region.appendChild(btn);
    buttons.push(btn);
  }

  document.body.appendChild(region);
  return { region, buttons };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useFocusReturn focus-return round trip (property-based)", () => {
  it("returns focus to the opener, or a deterministic same-region fallback when the opener is gone", () => {
    fc.assert(
      fc.property(
        // Region must hold at least 2 controls so a fallback exists after the
        // opener is removed.
        fc.integer({ min: 2, max: 8 }),
        // Which control acts as the opener (bounded later to the count).
        fc.nat(),
        // Whether the opener is removed from the DOM before restore().
        fc.boolean(),
        (count, openerSeed, removeOpener) => {
          document.body.innerHTML = "";

          const { region, buttons } = buildRegion(count);
          const openerIndex = openerSeed % count;
          const opener = buttons[openerIndex];

          const { result, unmount } = renderHook(() => useFocusReturn());

          // The opener is focused and then opens the dialog: capture it.
          opener.focus();
          expect(document.activeElement).toBe(opener);

          act(() => {
            result.current.capture(opener);
          });

          // Compute the deterministic fallback (first focusable still in the
          // region, in DOM order) that applies when the opener is removed.
          const remaining = buttons.filter((_, i) => i !== openerIndex);
          const expectedFallback = removeOpener ? (remaining[0] ?? null) : null;

          if (removeOpener) {
            opener.remove();
          }

          // Simulate focus moving into the dialog while it is open.
          buttons[(openerIndex + 1) % count]?.focus();

          // Dismiss the dialog: focus must return.
          act(() => {
            result.current.restore();
          });

          if (removeOpener) {
            // Opener no longer exists → deterministic same-region fallback.
            expect(document.activeElement).toBe(expectedFallback);
            // The fallback is a real, connected element in the same region.
            expect(region.contains(document.activeElement)).toBe(true);
          } else {
            // Opener still exists → clean round trip back to the opener.
            expect(document.activeElement).toBe(opener);
          }

          unmount();
        },
      ),
      { numRuns: 100 },
    );
  });
});
