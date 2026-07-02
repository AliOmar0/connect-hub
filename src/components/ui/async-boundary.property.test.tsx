import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import fc from "fast-check";

import { AsyncBoundary } from "./async-boundary";
import type { ViewStatus } from "@/types/presentation";

// Feature: ui-ux-redesign, Property 23
// Property 23: Loading views show a placeholder until resolved.
// Validates: Requirements 10.6
//
// Invariant: for any data view routed through AsyncBoundary, the Skeleton
// (loading placeholder) occupies the affected region while and only while
// status === "loading". Once the view resolves ("loaded" | "empty" | "error")
// — or is otherwise not loading ("idle") — the skeleton is gone and the
// resolved presentation (children / EmptyState / ErrorState) is shown instead.

const SKELETON_TESTID = "async-boundary-skeleton";
const CHILDREN_TESTID = "async-boundary-children";
const EMPTY_MARKER = "EMPTY_STATE_MARKER";
const ERROR_MARKER = "ERROR_STATE_MARKER";

const statusArb: fc.Arbitrary<ViewStatus> = fc.constantFrom<ViewStatus>(
  "idle",
  "loading",
  "loaded",
  "empty",
  "error",
);

function renderBoundary(status: ViewStatus) {
  return render(
    <AsyncBoundary
      status={status}
      skeleton={<div data-testid={SKELETON_TESTID}>loading…</div>}
      emptyTitle={EMPTY_MARKER}
      errorTitle={ERROR_MARKER}
    >
      <div data-testid={CHILDREN_TESTID}>resolved content</div>
    </AsyncBoundary>,
  );
}

describe("AsyncBoundary loading-placeholder invariants (property-based)", () => {
  it("shows the skeleton iff loading, and the resolved presentation otherwise", () => {
    fc.assert(
      fc.property(statusArb, (status) => {
        const { queryByTestId, queryByText, unmount } = renderBoundary(status);

        const skeleton = queryByTestId(SKELETON_TESTID);
        const children = queryByTestId(CHILDREN_TESTID);
        const empty = queryByText(EMPTY_MARKER);
        const error = queryByText(ERROR_MARKER);

        if (status === "loading") {
          // The placeholder occupies the region while loading...
          expect(skeleton).not.toBeNull();
          // ...and none of the resolved presentations leak through.
          expect(children).toBeNull();
          expect(empty).toBeNull();
          expect(error).toBeNull();
        } else {
          // Once resolved (or idle) the placeholder must be gone.
          expect(skeleton).toBeNull();

          // And the correct resolved presentation is shown for each status.
          switch (status) {
            case "loaded":
              expect(children).not.toBeNull();
              break;
            case "empty":
              expect(empty).not.toBeNull();
              break;
            case "error":
              expect(error).not.toBeNull();
              break;
            case "idle":
              // idle renders nothing but the (visually hidden) live region.
              expect(children).toBeNull();
              expect(empty).toBeNull();
              expect(error).toBeNull();
              break;
          }
        }

        unmount();
      }),
      { numRuns: 100 },
    );
  });
});
