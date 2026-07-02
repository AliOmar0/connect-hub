import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import fc from "fast-check";

import { AsyncBoundary } from "./async-boundary";
import { Skeleton } from "./skeleton";
import type { ViewStatus } from "@/types/presentation";

// Feature: ui-ux-redesign, Property 25
//
// Property 25: The same condition yields the same feedback mechanism on every
// page (Requirement 10.8).
//
// The redesign funnels every async view through ONE shared feedback layer:
//   - AsyncBoundary maps  loading -> Skeleton,  empty -> EmptyState,
//     error -> ErrorState (src/components/ui/async-boundary.tsx)
//   - feedback.ts routes  success -> toast.success,  error -> toast.error
//     through the single `sonner` toast (src/lib/feedback.ts)
//
// This test asserts that, for any feedback condition, the rendered mechanism is
// the single designated component/route for that condition, regardless of the
// surrounding page context (titles, descriptions, retry handlers, children,
// skeleton sizing, announcements, message text, or toast options).

// The `sonner` module is the single success/error mechanism. Mock it so we can
// observe exactly which route each feedback condition takes.
vi.mock("sonner", () => {
  const toast = {
    success: vi.fn((_msg: string, _opts?: unknown) => "success-id"),
    error: vi.fn((_msg: string, _opts?: unknown) => "error-id"),
    dismiss: vi.fn(),
  };
  return { toast };
});

// Imported AFTER the mock so the helpers bind to the mocked toast.
import { notifySuccess, notifyError } from "@/lib/feedback";
import { toast } from "sonner";

const mockedToast = toast as unknown as {
  success: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  dismiss: ReturnType<typeof vi.fn>;
};

// --- AsyncBoundary mechanism detection ------------------------------------
//
// Each designated component carries a stable, unique DOM signature that is
// independent of the caller-supplied text/props:
//   - Skeleton    -> `.animate-pulse`
//   - EmptyState  -> `.border-dashed` (role="status", no aria-atomic)
//   - ErrorState  -> role="alert" WITHOUT aria-atomic (the embedded LiveRegion
//                    also uses role="alert" but is always aria-atomic="true")
// The LiveRegion is a sr-only announcer present for every status and is
// intentionally excluded from the mechanism check below.
function detectMechanisms(container: HTMLElement): string[] {
  const present: string[] = [];
  if (container.querySelector(".animate-pulse")) present.push("skeleton");
  if (container.querySelector(".border-dashed")) present.push("empty-state");
  if (container.querySelector('[role="alert"]:not([aria-atomic="true"])'))
    present.push("error-state");
  return present;
}

// The one true mapping from a boundary condition to its feedback mechanism.
const EXPECTED_MECHANISM: Record<
  Extract<ViewStatus, "loading" | "empty" | "error">,
  string
> = {
  loading: "skeleton",
  empty: "empty-state",
  error: "error-state",
};

// Random "page context" — the surrounding props that legitimately differ from
// page to page but must NOT change which feedback mechanism is used.
interface PageContext {
  emptyTitle?: string;
  emptyDescription?: string;
  errorTitle?: string;
  errorDescription?: string;
  retryLabel?: string;
  withRetry: boolean;
  childrenText: string;
  skeletonClass: string;
  announce?: string;
}

const pageContextArb: fc.Arbitrary<PageContext> = fc.record({
  emptyTitle: fc.option(fc.string(), { nil: undefined }),
  emptyDescription: fc.option(fc.string(), { nil: undefined }),
  errorTitle: fc.option(fc.string(), { nil: undefined }),
  errorDescription: fc.option(fc.string(), { nil: undefined }),
  retryLabel: fc.option(fc.string(), { nil: undefined }),
  withRetry: fc.boolean(),
  childrenText: fc.string(),
  skeletonClass: fc.constantFrom("h-4 w-full", "h-24", "h-8 w-1/2", ""),
  announce: fc.option(fc.string(), { nil: undefined }),
});

const boundaryConditionArb = fc.constantFrom<"loading" | "empty" | "error">(
  "loading",
  "empty",
  "error",
);

describe("Property 25: feedback consistency across pages", () => {
  beforeEach(() => {
    mockedToast.success.mockClear();
    mockedToast.error.mockClear();
    mockedToast.dismiss.mockClear();
  });

  it("AsyncBoundary renders the single designated component for each condition, regardless of page context", () => {
    fc.assert(
      fc.property(boundaryConditionArb, pageContextArb, (condition, ctx) => {
        const { container } = render(
          <AsyncBoundary
            status={condition}
            skeleton={<Skeleton className={ctx.skeletonClass} />}
            onRetry={ctx.withRetry ? () => {} : undefined}
            emptyTitle={ctx.emptyTitle}
            emptyDescription={ctx.emptyDescription}
            errorTitle={ctx.errorTitle}
            errorDescription={ctx.errorDescription}
            retryLabel={ctx.retryLabel}
            announcements={
              ctx.announce ? { [condition]: ctx.announce } : undefined
            }
          >
            <div>{ctx.childrenText}</div>
          </AsyncBoundary>,
        );

        const mechanisms = detectMechanisms(container);

        // Exactly ONE feedback mechanism is present...
        expect(mechanisms).toHaveLength(1);
        // ...and it is the single designated one for this condition.
        expect(mechanisms[0]).toBe(EXPECTED_MECHANISM[condition]);

        cleanup();
      }),
      { numRuns: 150 },
    );
  });

  it("feedback.ts routes success/error through the one shared toast mechanism, regardless of message/options", () => {
    const optionsArb = fc.option(
      fc.record(
        {
          description: fc.option(fc.string(), { nil: undefined }),
          duration: fc.option(fc.integer({ min: 0, max: 10000 }), {
            nil: undefined,
          }),
          id: fc.option(fc.oneof(fc.string(), fc.integer()), {
            nil: undefined,
          }),
        },
        { requiredKeys: [] },
      ),
      { nil: undefined },
    );

    fc.assert(
      fc.property(
        fc.constantFrom<"success" | "error">("success", "error"),
        fc.string(),
        optionsArb,
        (condition, message, options) => {
          mockedToast.success.mockClear();
          mockedToast.error.mockClear();

          if (condition === "success") {
            notifySuccess(message, options);
          } else {
            notifyError(message, options);
          }

          if (condition === "success") {
            // Success always uses the single success route, never the error one.
            expect(mockedToast.success).toHaveBeenCalledTimes(1);
            expect(mockedToast.success).toHaveBeenCalledWith(message, options);
            expect(mockedToast.error).not.toHaveBeenCalled();
          } else {
            // Error always uses the single error route, never the success one.
            expect(mockedToast.error).toHaveBeenCalledTimes(1);
            expect(mockedToast.error).toHaveBeenCalledWith(message, options);
            expect(mockedToast.success).not.toHaveBeenCalled();
          }
        },
      ),
      { numRuns: 150 },
    );
  });
});
