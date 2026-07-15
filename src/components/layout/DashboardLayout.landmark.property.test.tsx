import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@/test-utils/render";
import "@testing-library/jest-dom";
import fc from "fast-check";

import DashboardLayout from "./DashboardLayout";
import { useBreakpoint } from "@/hooks/use-breakpoint";

// Feature: ui-ux-redesign, Property 6: Landmark structure is well-formed per page
// Validates: Requirements 5.5
//
// Invariant: for any Page rendered inside the App_Shell, exactly one main
// content landmark is exposed, and navigation and complementary regions are
// exposed using their corresponding landmark roles.
//
// Quantified inputs:
//   - the active reference breakpoint (375 / 768 / 1024 / 1440), which decides
//     whether primary navigation is a persistent sidebar (a `navigation`
//     landmark) or a collapsible menu (a toggle, no persistent landmark), and
//   - arbitrary page content, which may include zero or more complementary
//     regions (`<aside>` → `complementary` role).
//
// Whatever the inputs, the shell must expose exactly one `main` landmark
// (`#main-content`), navigation must use the `navigation` role when present,
// and every complementary region must use the `complementary` role.

// Drive the shell's navigation variant from a controllable breakpoint. The
// component decides `isDesktop = breakpoint >= 1024` and renders the sidebar or
// menu variant accordingly.
vi.mock("@/hooks/use-breakpoint", async () => {
  const actual = await vi.importActual("@/hooks/use-breakpoint");
  return { ...actual, useBreakpoint: vi.fn() };
});

// The header is a `banner` landmark whose internals (search / notifications /
// account, backed by network + realtime) are irrelevant to this property; mock
// it to a plain banner so the test isolates the main/navigation/complementary
// landmark structure and keeps 100+ renders fast and deterministic.
vi.mock("./AppShellHeader", () => ({
  default: () => <header data-testid="app-shell-header">Header</header>,
}));

// Avoid real network calls from the sidebar badge-count queries.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => Promise.resolve({ count: 0 }) }),
      }),
    }),
  },
}));

const mockUseBreakpoint = useBreakpoint as ReturnType<typeof vi.fn>;

const LAPTOP = 1024;

// The four reference breakpoints are the full domain of `useBreakpoint`.
const breakpointArb = fc.constantFrom(375, 768, 1024, 1440);

// A page body made of plain text blocks and complementary (aside) regions.
type Block = { kind: "text" | "complementary"; text: string };
const contentArb = fc.array(
  fc.record({
    kind: fc.constantFrom<"text" | "complementary">("text", "complementary"),
    text: fc.string(),
  }),
  { minLength: 0, maxLength: 5 },
);

function renderBlocks(blocks: Block[]) {
  return blocks.map((block, index) =>
    block.kind === "complementary" ? (
      <aside key={index} aria-label={`complementary-${index}`}>
        {block.text}
      </aside>
    ) : (
      <p key={index}>{block.text}</p>
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("DashboardLayout – landmark structure (property-based, Req 5.5)", () => {
  it("exposes exactly one main landmark, correct nav role, and complementary regions", () => {
    fc.assert(
      fc.property(breakpointArb, contentArb, (breakpoint, blocks) => {
        mockUseBreakpoint.mockReturnValue(breakpoint);

        const { unmount } = render(
          <DashboardLayout>{renderBlocks(blocks)}</DashboardLayout>,
        );

        try {
          // 1. Exactly one main content landmark, and it is the shell's
          //    #main-content region — never zero, never two, regardless of
          //    breakpoint or page content.
          const mains = screen.getAllByRole("main");
          expect(mains).toHaveLength(1);
          expect(mains[0]).toHaveAttribute("id", "main-content");

          // 2. Navigation is exposed using the `navigation` role. At and above
          //    the laptop breakpoint the shell renders a persistent sidebar, so
          //    exactly one navigation landmark (with an accessible name) is
          //    present. Below it, navigation collapses behind a menu toggle and
          //    no persistent navigation landmark is exposed.
          const navs = screen.queryAllByRole("navigation");
          if (breakpoint >= LAPTOP) {
            expect(navs).toHaveLength(1);
            expect(navs[0].getAttribute("aria-label")?.trim()).toBeTruthy();
          } else {
            expect(navs).toHaveLength(0);
            // The navigation is reachable via a toggle that opens a Sheet
            // dialog containing the navigation landmark.
            const toggle = screen.getByRole("button", { name: /menu/i });
            expect(toggle).toHaveAttribute("aria-haspopup", "dialog");
          }

          // 3. Every complementary region in the page content is exposed with
          //    the `complementary` landmark role.
          const expectedComplementary = blocks.filter(
            (b) => b.kind === "complementary",
          ).length;
          expect(screen.queryAllByRole("complementary")).toHaveLength(
            expectedComplementary,
          );
        } finally {
          unmount();
        }
      }),
      { numRuns: 100 },
    );
  });
});
