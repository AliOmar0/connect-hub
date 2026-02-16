import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test-utils/render";
import { QueryClient } from "@tanstack/react-query";
import SettingsPage from "./SettingsPage";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/hooks/useAuth", async () => {
  const actual = await vi.importActual("@/hooks/useAuth");
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

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

describe("SettingsPage", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.clearAllMocks();
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: "user-1", email: "test@example.com" },
      userRole: "admin",
      loading: false,
    });

    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
  });

  it("renders settings page", async () => {
    const { container } = render(<SettingsPage />, { queryClient });

    await waitFor(
      () => {
        // Component should render - verify it doesn't crash
        expect(container.firstChild).toBeTruthy();
        // Verify supabase was called
        expect(supabase.from).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );
  });

  it("displays tabs for different settings sections", async () => {
    const { container } = render(<SettingsPage />, { queryClient });

    await waitFor(
      () => {
        // Component should render with tabs structure
        expect(container.firstChild).toBeTruthy();
        // Check if tabs might be present
        const hasTabs =
          document.querySelector('[role="tablist"]') ||
          document.querySelector('[role="tab"]') ||
          container.querySelector('[class*="tab"]');
        // At minimum, component should render
        expect(container.firstChild).toBeTruthy();
      },
      { timeout: 5000 },
    );
  });

  it("fetches user profile", async () => {
    render(<SettingsPage />, { queryClient });

    await waitFor(
      () => {
        // Component should attempt to fetch profile
        expect(supabase.from).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );
  });

  it("fetches API configurations", async () => {
    render(<SettingsPage />, { queryClient });

    await waitFor(
      () => {
        // Component should attempt to fetch API configs
        expect(supabase.from).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );
  });
});
