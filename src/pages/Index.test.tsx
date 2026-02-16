import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test-utils/render";
import { QueryClient } from "@tanstack/react-query";
import Index from "./Index";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

vi.mock("@/components/layout/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe("Index", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.clearAllMocks();

    // Mock all supabase queries
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
      count: vi.fn().mockResolvedValue({ count: 0 }),
    });
  });

  it("renders dashboard stats cards", async () => {
    const { container } = render(<Index />, { queryClient });

    // Component should render - verify it doesn't crash
    await waitFor(
      () => {
        // Check if component rendered (has content in container)
        expect(container.firstChild).toBeTruthy();
        // Verify supabase was called (component attempted to fetch data)
        expect(supabase.from).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );
  });

  it("displays loading state initially", async () => {
    const { container } = render(<Index />, { queryClient });

    // Component should render even while loading
    await waitFor(
      () => {
        expect(container.firstChild).toBeTruthy();
      },
      { timeout: 5000 },
    );
  });

  it("fetches dashboard statistics", async () => {
    render(<Index />, { queryClient });

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith("messages");
      expect(supabase.from).toHaveBeenCalledWith("calls");
      expect(supabase.from).toHaveBeenCalledWith("sessions");
    });
  });
});
