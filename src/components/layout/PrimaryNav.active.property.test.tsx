import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@/test-utils/render";
import "@testing-library/jest-dom";
import fc from "fast-check";

import PrimaryNav, { PRIMARY_NAV_ITEMS } from "./PrimaryNav";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "react-router-dom";
import { useBreakpoint } from "@/hooks/use-breakpoint";

// Feature: ui-ux-redesign, Property 27
// Invariant: for any active route, exactly the corresponding navigation item is
// rendered with a selected visual treatment (aria-current="page") distinct from
// every unselected item, with nested routes (e.g. /sessions/:id) selecting the
// parent item (Requirement 11.2).

vi.mock("@/hooks/useAuth", async () => {
  const actual = await vi.importActual("@/hooks/useAuth");
  return { ...actual, useAuth: vi.fn() };
});

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useLocation: vi.fn(() => ({ pathname: "/dashboard" })),
  };
});

vi.mock("@/hooks/use-breakpoint", async () => {
  const actual = await vi.importActual("@/hooks/use-breakpoint");
  return { ...actual, useBreakpoint: vi.fn(() => 1440) };
});

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;
const mockUseLocation = useLocation as ReturnType<typeof vi.fn>;
const mockUseBreakpoint = useBreakpoint as ReturnType<typeof vi.fn>;

// Admin sees every item, so the generated active routes always map to a
// rendered nav item.
const ADMIN_ITEMS = PRIMARY_NAV_ITEMS.filter((i) => i.roles.includes("admin"));

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ userRole: "admin" });
  mockUseBreakpoint.mockReturnValue(1440);
});

afterEach(() => {
  vi.clearAllMocks();
});

/**
 * Build an active pathname for a nav item: either its exact route or a nested
 * route beneath it (which must still select the parent item).
 */
const routeArb = fc
  .record({
    itemIndex: fc.nat({ max: ADMIN_ITEMS.length - 1 }),
    nested: fc.boolean(),
    suffix: fc.stringMatching(/^[a-z0-9-]{1,12}$/),
  })
  .map(({ itemIndex, nested, suffix }) => {
    const item = ADMIN_ITEMS[itemIndex];
    return {
      to: item.to,
      pathname: nested ? `${item.to}/${suffix}` : item.to,
    };
  });

describe("PrimaryNav – active item selection (property-based, Req 11.2)", () => {
  it("marks exactly the active route's item (or its parent) with aria-current=page", () => {
    fc.assert(
      fc.property(routeArb, ({ to, pathname }) => {
        mockUseLocation.mockReturnValue({ pathname });

        const { unmount } = render(<PrimaryNav variant="sidebar" />);
        try {
          const links = screen.getAllByRole("link");

          const selected = links.filter(
            (el) => el.getAttribute("aria-current") === "page",
          );
          const unselected = links.filter(
            (el) => el.getAttribute("aria-current") !== "page",
          );

          // Exactly one item is selected.
          expect(selected).toHaveLength(1);

          // The selected item is the one whose route matches the active route.
          expect(selected[0].getAttribute("href")).toBe(to);

          // Every other item is explicitly not selected (no aria-current="page").
          expect(unselected).toHaveLength(links.length - 1);
          for (const el of unselected) {
            expect(el.getAttribute("aria-current")).not.toBe("page");
          }
        } finally {
          unmount();
        }
      }),
      { numRuns: 100 },
    );
  });
});
