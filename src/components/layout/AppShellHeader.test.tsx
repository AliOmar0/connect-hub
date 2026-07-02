import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

const unauthenticatedState = {
  user: null,
  session: null,
  userRole: null,
  loading: false,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
};

function renderHeader(route = "/dashboard") {
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

describe("AppShellHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("PIB logo", () => {
    it("renders the logo at >=24px height by default", () => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(authenticatedState);
      renderHeader();

      const logo = screen.getByRole("img", {
        name: /palestinian islamic bank logo/i,
      });
      expect(logo).toBeInTheDocument();
      // h-8 == 2rem == 32px, comfortably above the 24px minimum
      expect(logo).toHaveClass("h-8");
      expect(screen.queryByTestId("logo-fallback")).not.toBeInTheDocument();
    });

    it("shows the bank-name text fallback when the logo fails to load", () => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(authenticatedState);
      renderHeader();

      const logo = screen.getByRole("img", {
        name: /palestinian islamic bank logo/i,
      });
      fireEvent.error(logo);

      const fallback = screen.getByTestId("logo-fallback");
      expect(fallback).toBeInTheDocument();
      expect(fallback).toHaveTextContent(/palestinian islamic bank/i);
      // The image is replaced so it cannot overlap adjacent header elements.
      expect(
        screen.queryByRole("img", {
          name: /palestinian islamic bank logo/i,
        }),
      ).not.toBeInTheDocument();
      // Page-context indicator is still present alongside the fallback.
      expect(screen.getByTestId("page-context")).toBeInTheDocument();
    });
  });

  describe("page-context indicator", () => {
    it("names the current page derived from the route", () => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(authenticatedState);
      renderHeader("/analytics");
      expect(screen.getByTestId("page-context")).toHaveTextContent("Analytics");
    });

    it("resolves nested routes to the parent page name", () => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(authenticatedState);
      renderHeader("/sessions/abc-123");
      expect(screen.getByTestId("page-context")).toHaveTextContent("Sessions");
    });

    it("falls back to a not-found label for unknown routes", () => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(authenticatedState);
      renderHeader("/does-not-exist");
      expect(screen.getByTestId("page-context")).toHaveTextContent(
        /page not found/i,
      );
    });
  });

  describe("authenticated controls", () => {
    it("renders search, theme, notifications, and account controls", () => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(authenticatedState);
      renderHeader();

      expect(
        screen.getByPlaceholderText(/search conversations/i),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Notifications")).toBeInTheDocument();
      expect(screen.getByLabelText(/switch to/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/account/i)).toBeInTheDocument();
    });
  });

  describe("unauthenticated omission", () => {
    it("omits account, notifications, theme, and search controls", () => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(
        unauthenticatedState,
      );
      renderHeader("/auth");

      expect(screen.queryByLabelText("Notifications")).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/switch to/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/account/i)).not.toBeInTheDocument();
      expect(
        screen.queryByPlaceholderText(/search conversations/i),
      ).not.toBeInTheDocument();
    });

    it("still renders the logo and pre-auth language switcher", () => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(
        unauthenticatedState,
      );
      renderHeader("/auth");

      expect(
        screen.getByRole("img", { name: /palestinian islamic bank logo/i }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/language/i)).toBeInTheDocument();
    });
  });
});
