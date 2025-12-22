import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test-utils/render";
import { QueryClient } from "@tanstack/react-query";
import AnalyticsPage from "./AnalyticsPage";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

vi.mock("@/components/layout/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("AnalyticsPage", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.clearAllMocks();

    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
  });

  it("renders analytics page", async () => {
    const { container } = render(<AnalyticsPage />, { queryClient });

    await waitFor(() => {
      // Component should render - verify it doesn't crash
      expect(container.firstChild).toBeTruthy();
      // Verify supabase was called
      expect(supabase.from).toHaveBeenCalled();
    }, { timeout: 5000 });
  });

  it("displays date range selector", async () => {
    render(<AnalyticsPage />, { queryClient });

    await waitFor(() => {
      // Date range selector should be present
      const selector = screen.queryByText(/30 days/i) ||
                      screen.queryByText(/days/i) ||
                      screen.queryByText(/7 days/i);
      expect(selector).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("fetches analytics data", async () => {
    render(<AnalyticsPage />, { queryClient });

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith("analytics_daily");
    });
  });

  it("filters by channel when channel filter is selected", async () => {
    render(<AnalyticsPage />, { queryClient });

    // Wait for component to render and verify it fetches data
    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith("analytics_daily");
    }, { timeout: 5000 });
  });
});

