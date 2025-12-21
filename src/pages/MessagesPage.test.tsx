import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MessagesPage from "./MessagesPage";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: vi.fn(() => vi.fn()),
    useSearchParams: vi.fn(() => [new URLSearchParams(), vi.fn()]),
  };
});

vi.mock("@/components/layout/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

// Mock dependencies
vi.mock("@/hooks/useAuth");
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
      eq: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
    })),
    channel: vi.fn(() => ({
      on: vi.fn(() => ({
        subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
      })),
    })),
    removeChannel: vi.fn(),
  },
}));

describe("MessagesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders messages page", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      userRole: "agent",
      user: { id: "123" },
    });

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <MessagesPage />
        </BrowserRouter>
      </QueryClientProvider>
    );

    // Messages page should render (check that supabase was called)
    expect(supabase.from).toHaveBeenCalled();
  });

  it("fetches sessions for agent", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      userRole: "agent",
      user: { id: "123" },
    });

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <MessagesPage />
        </BrowserRouter>
      </QueryClientProvider>
    );

    expect(supabase.from).toHaveBeenCalled();
  });

  it("fetches sessions for admin", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      userRole: "admin",
      user: { id: "123" },
    });

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <MessagesPage />
        </BrowserRouter>
      </QueryClientProvider>
    );

    expect(supabase.from).toHaveBeenCalled();
  });
});

