// Feature: ui-ux-redesign, Property 24
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import fc from "fast-check";
import { EmptyState } from "./empty-state";

// Feature: ui-ux-redesign, Property 24
// Property 24: Empty views explain the absence of records.
// For any data view containing zero records, the Dashboard presents an
// EmptyState that explains the absence and, where a next action exists,
// offers that action.
// Validates: Requirements 10.7

// Non-empty text arbitrary: guarantees at least one visible (non-whitespace)
// character so the rendered explanation is genuinely explanatory.
const nonEmptyText = fc
  .string({ minLength: 1, maxLength: 80 })
  .filter((s) => s.trim().length > 0);

// Optional supporting description; may be absent.
const optionalDescription = fc.option(nonEmptyText, { nil: undefined });

// A distinctive label used to identify a rendered next-action control.
const actionLabel = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((s) => s.trim().length > 0);

describe("EmptyState invariants (property-based) - Property 24", () => {
  afterEach(cleanup);

  it("always renders a non-empty explanatory message for an empty view", () => {
    fc.assert(
      fc.property(nonEmptyText, optionalDescription, (title, description) => {
        cleanup();
        render(<EmptyState title={title} description={description} />);

        // The empty condition is discoverable by assistive technology.
        const region = screen.getByRole("status");
        expect(region).toBeTruthy();

        // The explanation is non-empty: the visible text content of the empty
        // state carries a real (non-whitespace) message explaining the absence.
        const explanation = (region.textContent ?? "").trim();
        expect(explanation.length).toBeGreaterThan(0);

        // The provided title text is surfaced verbatim within the empty state.
        expect(region.textContent).toContain(title.trim());
        if (description !== undefined) {
          expect(region.textContent).toContain(description.trim());
        }
      }),
      { numRuns: 150 },
    );
  });

  it("offers the next action whenever one is provided", () => {
    fc.assert(
      fc.property(nonEmptyText, actionLabel, (title, label) => {
        cleanup();
        render(
          <EmptyState
            title={title}
            action={<button type="button">{label}</button>}
          />,
        );

        const region = screen.getByRole("status");
        // When a next action exists, it is rendered/offered inside the empty
        // state so the user has a way forward.
        const action = within(region).getByRole("button");
        expect(action).toBeTruthy();
        expect(action.textContent).toBe(label);

        // The explanatory message is still present alongside the action.
        expect((region.textContent ?? "").trim().length).toBeGreaterThan(0);
      }),
      { numRuns: 150 },
    );
  });
});
