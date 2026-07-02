// Feature: ui-ux-redesign, Property 29
//
// Property 29: Header context indicator names the current page.
// Validates: Requirements 11.5
//
// For ANY route, AppShellHeader's navigational context indicator
// (data-testid="page-context") identifies the current Page by a non-empty
// name derived from the route via resolvePageKey -> i18n. Known route prefixes
// (including nested sub-paths) resolve to their parent page name; unknown
// routes resolve to the localized "Page Not Found" label.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fc from "fast-check";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import AppShellHeader from "./AppShellHeader";
import { useAuth } from "@/hooks/useAuth";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], count: 0 }),
      single: vi.fn().mockResolvedValue({ data: null }),
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  },
}));

const authenticatedState = {
  user: { id: "user-1", email: "test@example.com" },
  session: null,
  userRole: "admin" as const,
  loading: false,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
};

// Known route prefixes and the (default English) page name each must resolve to.
// Mirrors the resolvePageKey map + en.json appShell.header.pages labels.
const KNOWN_ROUTES: Array<{ prefix: string; label: string }> = [
  { prefix: "/dashboard", label: "Dashboard" },
  { prefix: "/sessions", label: "Sessions" },
  { prefix: "/queue", label: "Escalation Queue" },
  { prefix: "/knowledge", label: "Knowledge Base" },
  { prefix: "/employees", label: "Employees" },
  { prefix: "/analytics", label: "Analytics" },
  { prefix: "/settings", label: "Settings" },
  { prefix: "/notifications", label: "Notifications" },
  { prefix: "/shortcuts", label: "Chat Shortcuts" },
  { prefix: "/backend-test", label: "Backend Tester" },
];
const HOME_LABEL = "Home";
const NOT_FOUND_LABEL = "Page Not Found";

// Lowercase word segments used to build arbitrary path suffixes / unknown routes.
const wordArb = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), {
    minLength: 1,
    maxLength: 8,
  })
  .map((cs) => cs.join(""));

// Any known route: its prefix optionally followed by nested sub-segments and/or
// a query string. Nesting must not change the resolved page name.
const knownRouteArb = fc
  .record({
    entry: fc.constantFrom(...KNOWN_ROUTES),
    suffix: fc.array(wordArb, { minLength: 0, maxLength: 3 }),
    query: fc.option(wordArb, { nil: undefined }),
  })
  .map(({ entry, suffix, query }) => {
    const nested = suffix.length ? "/" + suffix.join("/") : "";
    const q = query ? `?tab=${query}` : "";
    return { route: `${entry.prefix}${nested}${q}`, expected: entry.label };
  });

// The exact home route.
const homeRouteArb = fc.constant({ route: "/", expected: HOME_LABEL });

// Unknown routes: paths that match no known prefix and are not exactly "/".
const unknownRouteArb = fc
  .array(wordArb, { minLength: 1, maxLength: 3 })
  .map((parts) => "/" + parts.join("/"))
  .filter(
    (path) =>
      path !== "/" &&
      !KNOWN_ROUTES.some((k) => path.startsWith(k.prefix)) &&
      !path.startsWith("/dashboard"),
  )
  .map((route) => ({ route, expected: NOT_FOUND_LABEL }));

const routeCaseArb = fc.oneof(knownRouteArb, homeRouteArb, unknownRouteArb);

function renderHeaderAt(route: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <ThemeProvider>
          <TooltipProvider>
            <AppShellHeader />
          </TooltipProvider>
        </ThemeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AppShellHeader page-context indicator (Property 29)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(authenticatedState);
  });

  it("names the current page for any route via the page-context indicator", () => {
    fc.assert(
      fc.property(routeCaseArb, ({ route, expected }) => {
        (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(
          authenticatedState,
        );
        const { getByTestId, unmount } = renderHeaderAt(route);
        try {
          const context = getByTestId("page-context");
          const name = (context.textContent ?? "").trim();
          // The indicator always names a page with a non-empty label...
          expect(name.length).toBeGreaterThan(0);
          // ...and that name identifies the current page derived from the route.
          expect(name).toBe(expected);
        } finally {
          unmount();
        }
      }),
      { numRuns: 100 },
    );
  });
});
