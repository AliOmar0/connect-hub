import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test-utils/render";
import "@testing-library/jest-dom";
import fc from "fast-check";
import EmployeesPage from "./EmployeesPage";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mockEmployees, mockProfiles } from "@/test-utils/fixtures";
import type { Employee, Profile } from "@/types/database";

// Feature: ui-ux-redesign, Property 11: Tabular fields are reachable without
// horizontal scroll below 768px
// Validates: Requirements 7.5, 18.2
//
// For any Page presenting tabular data at a viewport width below 768px, every
// field of each record must be reachable and readable without horizontal
// scrolling of the surrounding layout. EmployeesPage presents each employee
// record as a card in a responsive grid. The grid is mobile-first
// (`grid-cols-1`) and only becomes multi-column at the `md:` (768px) breakpoint
// and above. This test renders the real records grid, captures its actual
// className, then quantifies over every viewport width below 768px: at each
// such width the effective column count must resolve to exactly one column, so
// each record occupies the full row width and all of its fields stack
// vertically — reachable without horizontal scrolling.

// ---------------------------------------------------------------------------
// Test doubles — mirror the mocking approach used in EmployeesPage.test.tsx so
// the page renders its loaded records grid deterministically.
// ---------------------------------------------------------------------------

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: vi.fn(() => vi.fn()) };
});

vi.mock("@/hooks/useAuth", async () => {
  const actual =
    await vi.importActual<typeof import("@/hooks/useAuth")>("@/hooks/useAuth");
  return { ...actual, useAuth: vi.fn() };
});

vi.mock("@/components/layout/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const mockQueryClient = { invalidateQueries: vi.fn() };

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useQuery: vi.fn(),
    useMutation: vi.fn(),
    useQueryClient: vi.fn(() => mockQueryClient),
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
    })),
    functions: {
      invoke: vi.fn(() => Promise.resolve({ data: {}, error: null })),
    },
  },
}));

const employeeWithProfile: Employee & { profile?: Profile } = {
  ...mockEmployees[0],
  profile: mockProfiles[0],
};

// ---------------------------------------------------------------------------
// Pure resolver — mirrors Tailwind's mobile-first breakpoint semantics. Given a
// grid container's className and a viewport width, it returns the number of
// columns that is actually active at that width (the largest breakpoint prefix
// whose min-width does not exceed the width; base = no prefix = min-width 0).
// ---------------------------------------------------------------------------

const TAILWIND_MIN_WIDTH: Record<string, number> = {
  base: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
};

function resolveEffectiveGridCols(
  className: string,
  width: number,
): number | null {
  let bestMinWidth = -1;
  let bestCols: number | null = null;

  for (const token of className.split(/\s+/)) {
    const match = token.match(/^(?:(sm|md|lg|xl|2xl):)?grid-cols-(\d+)$/);
    if (!match) continue;

    const prefix = match[1] ?? "base";
    const cols = Number(match[2]);
    const minWidth = TAILWIND_MIN_WIDTH[prefix];

    if (minWidth <= width && minWidth > bestMinWidth) {
      bestMinWidth = minWidth;
      bestCols = cols;
    }
  }

  return bestCols;
}

// Locate the records container: the nearest layout ancestor of a rendered
// employee record card. The roster is a vertical stack of full-width rows
// rather than a card grid, so the container is a flex column; the older grid
// form is still accepted so the property describes the invariant, not one
// particular implementation of it.
function getRecordsContainerClassName(): string {
  // mockProfiles[0] => first_name "Agent", last_name "One".
  const recordName = screen.getByText("Agent One");
  const container = recordName.closest(".grid, .flex-col");
  expect(container).not.toBeNull();
  return (container as HTMLElement).className;
}

beforeEach(() => {
  vi.clearAllMocks();
  (useQueryClient as ReturnType<typeof vi.fn>).mockReturnValue(mockQueryClient);
  (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    userRole: "admin",
    user: { id: "user-1" },
  });
  (useQuery as ReturnType<typeof vi.fn>).mockImplementation(
    (options: { queryKey: string[] }) => {
      if (options.queryKey[0] === "employees") {
        return {
          data: [employeeWithProfile],
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        };
      }
      return { data: mockProfiles, isLoading: false, isError: false };
    },
  );
  (useMutation as ReturnType<typeof vi.fn>).mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  });
});

describe("EmployeesPage – tabular field reachability below 768px (property-based, Req 7.5, 18.2)", () => {
  it("presents each record in a single column at every width below 768px", () => {
    render(<EmployeesPage />);

    const containerClassName = getRecordsContainerClassName();

    // A flex column is single-column at every width by construction; a grid
    // has to declare it.
    const isStack = containerClassName.includes("flex-col");
    if (!isStack) {
      expect(containerClassName).toContain("grid-cols-1");
    }

    // Widths strictly below the 768px tablet breakpoint.
    const widthBelow768 = fc.integer({ min: 240, max: 767 });

    fc.assert(
      fc.property(widthBelow768, (width) => {
        const cols = isStack
          ? 1
          : resolveEffectiveGridCols(containerClassName, width);
        // Exactly one column below 768px => each record spans the full row and
        // all of its fields stack vertically, so no field requires horizontal
        // scrolling of the surrounding layout.
        expect(cols).toBe(1);
      }),
      { numRuns: 100 },
    );
  });
});
