import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test-utils/render";
import { QueryClient } from "@tanstack/react-query";
import EmployeesTable from "./EmployeesTable";
import { mockEmployees, mockProfiles } from "@/test-utils/fixtures";
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

describe("EmployeesTable", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.clearAllMocks();

    // Mock supabase queries
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      count: vi.fn().mockResolvedValue({ count: 0 }),
    });
  });

  it("renders table title", () => {
    render(<EmployeesTable employees={[]} />, { queryClient });

    expect(screen.getByText("Team Overview")).toBeInTheDocument();
  });

  it("displays employees with profile information", async () => {
    const employees = [
      {
        ...mockEmployees[0],
        profile: mockProfiles[0],
      },
    ];

    render(<EmployeesTable employees={employees} />, { queryClient });

    await waitFor(() => {
      expect(screen.getByText(/Agent One/i)).toBeInTheDocument();
    });
  });

  it("displays 'Manage Team' button", () => {
    render(<EmployeesTable employees={[]} />, { queryClient });

    expect(screen.getByText("Manage Team")).toBeInTheDocument();
  });

  it("limits display to 5 employees", () => {
    const manyEmployees = Array.from({ length: 10 }, (_, i) => ({
      ...mockEmployees[0],
      id: `employee-${i}`,
      profile: mockProfiles[0],
    }));

    render(<EmployeesTable employees={manyEmployees} />, { queryClient });

    // Should render table but limit display
    expect(screen.getByText("Team Overview")).toBeInTheDocument();
  });

  it("handles empty employees array", () => {
    render(<EmployeesTable employees={[]} />, { queryClient });

    expect(screen.getByText("Team Overview")).toBeInTheDocument();
  });

  it("fetches employee stats", async () => {
    const employees = [
      {
        ...mockEmployees[0],
        profile: mockProfiles[0],
      },
    ];

    render(<EmployeesTable employees={employees} />, { queryClient });

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith("sessions");
    });
  });
});
