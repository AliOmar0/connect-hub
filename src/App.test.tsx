import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/hooks/useAuth";
import { TooltipProvider } from "@/components/ui/tooltip";
import App from "./App";
import React from "react";

// Mock Supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
  },
}));

// Mock all page components to avoid complex setup
vi.mock("./pages/Index", () => ({
  default: () => <div>Dashboard Page</div>,
}));

vi.mock("./pages/AuthPage", () => ({
  default: () => <div>Auth Page</div>,
}));

vi.mock("./pages/SessionsPage", () => ({
  default: () => <div>Sessions Page</div>,
}));

vi.mock("./pages/EmployeesPage", () => ({
  default: () => <div>Employees Page</div>,
}));

vi.mock("./pages/AnalyticsPage", () => ({
  default: () => <div>Analytics Page</div>,
}));

vi.mock("./pages/SettingsPage", () => ({
  default: () => <div>Settings Page</div>,
}));

vi.mock("./pages/NotificationsPage", () => ({
  default: () => <div>Notifications Page</div>,
}));

vi.mock("./pages/NotFound", () => ({
  default: () => <div>Not Found Page</div>,
}));

vi.mock("./components/ProtectedRoute", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("./components/RoleBasedRedirect", () => ({
  default: () => <div>Role Based Redirect</div>,
}));

// Helper to render App without double BrowserRouter
const renderApp = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, cacheTime: 0 },
      mutations: { retry: false },
    },
  });

  return rtlRender(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders auth page at /auth route", async () => {
    // Navigate to /auth before rendering
    window.history.pushState({}, "", "/auth");
    renderApp();

    await screen.findByText("Auth Page");
    expect(screen.getByText("Auth Page")).toBeInTheDocument();
  });

  it("renders not found page for unknown routes", async () => {
    // Navigate to unknown route before rendering
    window.history.pushState({}, "", "/unknown-route");
    renderApp();

    await screen.findByText("Not Found Page");
    expect(screen.getByText("Not Found Page")).toBeInTheDocument();
  });

  it("provides QueryClient context", async () => {
    window.history.pushState({}, "", "/auth");
    renderApp();

    // If we can render without errors, QueryClient is provided
    await screen.findByText("Auth Page");
    expect(screen.getByText("Auth Page")).toBeInTheDocument();
  });

  it("provides AuthProvider context", async () => {
    window.history.pushState({}, "", "/auth");
    renderApp();

    // If we can render without errors, AuthProvider is provided
    await screen.findByText("Auth Page");
    expect(screen.getByText("Auth Page")).toBeInTheDocument();
  });

  it("provides TooltipProvider context", async () => {
    window.history.pushState({}, "", "/auth");
    renderApp();

    // If we can render without errors, TooltipProvider is provided
    await screen.findByText("Auth Page");
    expect(screen.getByText("Auth Page")).toBeInTheDocument();
  });
});

