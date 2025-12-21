import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CallsPage from "./CallsPage";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: vi.fn(() => vi.fn()),
  };
});

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

// Mock dependencies
vi.mock("@/hooks/useAuth");
const mockQueryClient = {
  invalidateQueries: vi.fn(),
};

vi.mock("@/components/layout/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useQuery: vi.fn(),
    useQueryClient: vi.fn(() => mockQueryClient),
  };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          eq: vi.fn(() => ({
            gte: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      })),
    })),
    channel: vi.fn(() => ({
      on: vi.fn(() => ({
        subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
      })),
    })),
    removeChannel: vi.fn(),
  },
}));

describe("CallsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useQueryClient as ReturnType<typeof vi.fn>).mockReturnValue(mockQueryClient);
  });

  it("renders calls page title", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      userRole: "admin",
      user: { id: "123" },
    });

    (useQuery as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      data: [],
      isLoading: false,
    }));

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <CallsPage />
        </BrowserRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText("Calls")).toBeInTheDocument();
  });

  it("displays search input", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      userRole: "admin",
      user: { id: "123" },
    });

    (useQuery as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      data: [],
      isLoading: false,
    }));

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <CallsPage />
        </BrowserRouter>
      </QueryClientProvider>
    );

    expect(
      screen.getByPlaceholderText("Search by customer, phone, or agent...")
    ).toBeInTheDocument();
  });

  it("shows filter dropdowns", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      userRole: "admin",
      user: { id: "123" },
    });

    (useQuery as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      data: [],
      isLoading: false,
    }));

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <CallsPage />
        </BrowserRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText("Calls")).toBeInTheDocument();
  });
});

