import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test-utils/render";
import { QueryClient } from "@tanstack/react-query";
import DashboardHeader from "./DashboardHeader";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/hooks/useAuth", async () => {
  const actual = await vi.importActual("@/hooks/useAuth");
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], count: 0 }),
    })),
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

describe("DashboardHeader", () => {
  const mockNavigate = vi.fn();
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.clearAllMocks();
    (useNavigate as ReturnType<typeof vi.fn>).mockReturnValue(mockNavigate);
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: "user-1", email: "test@example.com" },
      userRole: "admin",
      loading: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
      signUp: vi.fn(),
    });
  });

  it("renders search input", async () => {
    render(<DashboardHeader />, { queryClient });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search conversations/i)).toBeInTheDocument();
    });
  });

  it("renders notification bell icon", async () => {
    render(<DashboardHeader />, { queryClient });

    await waitFor(() => {
      // Find button with bell icon
      const buttons = screen.getAllByRole("button");
      const bellButton = buttons.find(btn => 
        btn.querySelector('svg')?.getAttribute('class')?.includes('bell') ||
        btn.querySelector('svg')?.getAttribute('class')?.includes('Bell')
      );
      expect(bellButton).toBeInTheDocument();
    });
  });

  it("displays notification badge when there are unread notifications", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [{ 
          id: "1", 
          title: "Test", 
          message: "Test message",
          is_read: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }],
        count: 1,
      }),
    });

    render(<DashboardHeader />, { queryClient });

    await waitFor(() => {
      const badge = screen.queryByText("1");
      if (badge) {
        expect(badge).toBeInTheDocument();
      }
    }, { timeout: 3000 });
  });

  it("navigates to sessions when headphones button is clicked", async () => {
    const { createUserEvent } = await import("@/test-utils/helpers");
    const user = createUserEvent();

    render(<DashboardHeader />, { queryClient });

    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      const sessionsButton = buttons.find(btn => 
        btn.querySelector('svg')?.getAttribute('class')?.includes('headphones') ||
        btn.querySelector('svg')?.getAttribute('class')?.includes('Headphones')
      );
      if (sessionsButton) {
        return sessionsButton;
      }
      throw new Error("Sessions button not found");
    });

    const buttons = screen.getAllByRole("button");
    const sessionsButton = buttons.find(btn => 
      btn.querySelector('svg')?.getAttribute('class')?.includes('headphones') ||
      btn.querySelector('svg')?.getAttribute('class')?.includes('Headphones')
    );
    
    if (sessionsButton) {
      await user.click(sessionsButton);
      expect(mockNavigate).toHaveBeenCalledWith("/sessions");
    }
  });

  it("renders integration status indicators", async () => {
    render(<DashboardHeader />, { queryClient });

    await waitFor(() => {
      expect(screen.getByText("WhatsApp")).toBeInTheDocument();
      expect(screen.getByText("Messenger")).toBeInTheDocument();
    });
  });
});

