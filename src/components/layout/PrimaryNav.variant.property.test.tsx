import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@/test-utils/render";
import "@testing-library/jest-dom";
import fc from "fast-check";

import PrimaryNav from "./PrimaryNav";
import { useBreakpoint, widthToBreakpoint } from "@/hooks/use-breakpoint";

// Feature: ui-ux-redesign, Property 10
// Invariant: the primary-navigation presentation is determined solely by the
// viewport width. For any width < 768px the App_Shell presents primary
// navigation as a collapsible menu (a toggle button, no persistent nav
// landmark), and for any width >= 768px it presents a persistent sidebar
// -- an icon rail up to 1024px, full width above it --
// (a nav landmark, no toggle button). (Requirements 7.2, 7.3)

vi.mock("@/hooks/use-breakpoint", async () => {
  const actual = await vi.importActual("@/hooks/use-breakpoint");
  return { ...actual, useBreakpoint: vi.fn() };
});

const mockUseBreakpoint = useBreakpoint as ReturnType<typeof vi.fn>;

// The laptop breakpoint is the boundary between the two presentations.
// Lowest width that keeps a persistent sidebar: the tablet rail starts here.
const SIDEBAR_FROM = 768;

// Cover the full spectrum: mobile/tablet widths below the boundary and
// laptop/desktop widths at or above it, including the exact boundary value.
const widthArb = fc.integer({ min: 320, max: 2560 });

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("PrimaryNav – variant by breakpoint (property-based, Req 7.2, 7.3)", () => {
  it("renders a persistent sidebar at >=768px and a collapsible menu below", () => {
    fc.assert(
      fc.property(widthArb, (width) => {
        // The breakpoint hook maps the viewport width to a reference
        // breakpoint; drive the component with that mapped value so the test
        // exercises the same width -> variant decision the app uses.
        const breakpoint = widthToBreakpoint(width);
        mockUseBreakpoint.mockReturnValue(breakpoint);

        const { unmount } = render(<PrimaryNav />);
        try {
          const nav = screen.queryByRole("navigation");
          const toggle = screen.queryByRole("button");

          if (width >= SIDEBAR_FROM) {
            // Persistent sidebar: a nav landmark is always present and there
            // is no menu toggle to expand/collapse it.
            expect(nav).not.toBeNull();
            expect(toggle).toBeNull();
          } else {
            // Collapsible menu: a toggle button controls a menu; the nav
            // landmark is not persistently rendered (the sheet is closed).
            expect(toggle).not.toBeNull();
            expect(toggle).toHaveAttribute("aria-haspopup", "menu");
            expect(nav).toBeNull();
          }
        } finally {
          unmount();
        }
      }),
      { numRuns: 100 },
    );
  });
});
