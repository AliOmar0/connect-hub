// Feature: ui-ux-redesign, Property 30
//
// Property 30: Unauthenticated shell omits auth-requiring controls.
// *For any* unauthenticated session, the App_Shell renders no primary
// navigation items and no account, notification, or Theme controls that
// require authentication — while pre-auth controls (logo, language switcher)
// remain.
//
// Validates: Requirements 11.6
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fc from "fast-check";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import AppShellHeader from "./AppShellHeader";
import PrimaryNav from "./PrimaryNav";
import { useAuth } from "@/hooks/useAuth";
import { useBreakpoint } from "@/hooks/use-breakpoint";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/hooks/use-breakpoint", async () => {
  const actual = await vi.importActual("@/hooks/use-breakpoint");
  return { ...actual, useBreakpoint: vi.fn(() => 1440) };
});

// Supabase is only exercised by the authenticated code paths (queries are
// `enabled: isAuthenticated`), but the module is imported at load time so it
// must resolve to a harmless stub.
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

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;
const mockUseBreakpoint = useBreakpoint as ReturnType<typeof vi.fn>;

// The only auth state under test: a fully unauthenticated session. There is no
// user, session, or role — every auth-gated control must therefore be absent.
const unauthenticatedState = {
  user: null,
  session: null,
  userRole: null,
  loading: false,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
};

// Routes the shell can be mounted on, mixing known app pages, the pre-auth
// route, and arbitrary/unknown paths so the property holds for *any* route.
const knownRoutes = [
  "/",
  "/auth",
  "/dashboard",
  "/sessions",
  "/sessions/abc-123",
  "/queue",
  "/knowledge",
  "/employees",
  "/analytics",
  "/settings",
  "/notifications",
  "/shortcuts",
  "/backend-test",
];

const routeArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(...knownRoutes),
  fc
    .array(
      fc.stringMatching(/^[a-z0-9-]+$/).filter((s) => s.length > 0),
      { minLength: 1, maxLength: 3 },
    )
    .map((segments) => `/${segments.join("/")}`),
);

// PrimaryNav derives its presentation from the breakpoint; vary it so the
// "no nav items" guarantee holds regardless of sidebar vs. menu layout.
const breakpointArb: fc.Arbitrary<number> = fc.integer({ min: 320, max: 2560 });

function renderShell(route: string) {
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
            {/* Force the persistent sidebar variant so any role-visible nav
                links render directly into the DOM (rather than behind a menu
                toggle), making "no nav items" directly observable. */}
            <PrimaryNav variant="sidebar" />
          </TooltipProvider>
        </ThemeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("App_Shell unauthenticated omission (property-based)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(unauthenticatedState);
  });

  it("omits all auth-requiring controls and nav items for any unauthenticated route", () => {
    fc.assert(
      fc.property(routeArb, breakpointArb, (route, breakpoint) => {
        cleanup();
        mockUseAuth.mockReturnValue(unauthenticatedState);
        mockUseBreakpoint.mockReturnValue(breakpoint);

        const { container } = renderShell(route);

        // --- No primary navigation items ---
        // filterNavByRole returns [] for a null role, so no nav links exist.
        expect(container.querySelectorAll("a[href]")).toHaveLength(0);

        // --- No auth-requiring header controls ---
        // Notifications control (bell dropdown trigger).
        expect(
          screen.queryByLabelText(/notifications/i),
        ).not.toBeInTheDocument();
        // Theme toggle (aria-label is "Switch to <theme> mode").
        expect(screen.queryByLabelText(/switch to/i)).not.toBeInTheDocument();
        // Account control (avatar button).
        expect(screen.queryByLabelText(/account/i)).not.toBeInTheDocument();
        // Search (operates on protected data).
        expect(
          screen.queryByPlaceholderText(/search conversations/i),
        ).not.toBeInTheDocument();

        // --- Pre-auth controls remain ---
        // PIB logo (or its text fallback) anchors the header.
        expect(
          screen.getByRole("img", {
            name: /palestinian islamic bank logo/i,
          }),
        ).toBeInTheDocument();
        // Language switcher is available before authentication.
        expect(screen.getByLabelText(/language/i)).toBeInTheDocument();
      }),
      { numRuns: 100 },
    );
    cleanup();
  });
});
