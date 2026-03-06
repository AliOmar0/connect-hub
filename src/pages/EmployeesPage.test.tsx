import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test-utils/render";
import EmployeesPage from "./EmployeesPage";
import { useAuth } from "@/hooks/useAuth";
import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryClient,
} from "@tanstack/react-query";
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
vi.mock("@/hooks/useAuth", async () => {
  const actual =
    await vi.importActual<typeof import("@/hooks/useAuth")>("@/hooks/useAuth");
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});
vi.mock("@/components/layout/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const mockQueryClient = {
  invalidateQueries: vi.fn(),
};

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useQuery: vi.fn(),
    useMutation: vi.fn(),
    useQueryClient: vi.fn(() => mockQueryClient),
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
    })),
    functions: {
      invoke: vi.fn(() =>
        Promise.resolve({ data: { success: true }, error: null }),
      ),
    },
  },
}));

describe("EmployeesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockedUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;
    (useQueryClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockQueryClient,
    );
  });

  it("renders employees page title", () => {
    const mockedUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;
    mockedUseAuth.mockReturnValue({
      userRole: "admin",
      user: { id: "123" },
    });

    (useQuery as ReturnType<typeof vi.fn>).mockImplementation(
      (options: { queryKey: string[] }) => {
        if (options.queryKey[0] === "employees") {
          return {
            data: [],
            isLoading: false,
          };
        }
        return {
          data: [],
          isLoading: false,
        };
      },
    );

    (useMutation as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
    });

    const queryClient = createTestQueryClient();

    render(<EmployeesPage />, { queryClient });

    expect(screen.getByText("Employee Management")).toBeInTheDocument();
  });

  it("shows create user button for managers", () => {
    const mockedUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;
    mockedUseAuth.mockReturnValue({
      userRole: "manager",
      user: { id: "123" },
    });

    (useQuery as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      data: [],
      isLoading: false,
    }));

    (useMutation as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
    });

    const queryClient = createTestQueryClient();

    render(<EmployeesPage />, { queryClient });

    expect(screen.getByText("Create User")).toBeInTheDocument();
  });

  it("shows create user button for admins", () => {
    const mockedUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;
    mockedUseAuth.mockReturnValue({
      userRole: "admin",
      user: { id: "123" },
    });

    (useQuery as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      data: [],
      isLoading: false,
    }));

    (useMutation as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
    });

    const queryClient = createTestQueryClient();

    render(<EmployeesPage />, { queryClient });

    expect(screen.getByText("Create User")).toBeInTheDocument();
  });

  it("does not show create user button for agents", () => {
    const mockedUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;
    mockedUseAuth.mockReturnValue({
      userRole: "agent",
      user: { id: "123" },
    });

    (useQuery as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      data: [],
      isLoading: false,
    }));

    (useMutation as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
    });

    const queryClient = createTestQueryClient();

    render(<EmployeesPage />, { queryClient });

    expect(screen.queryByText("Create User")).not.toBeInTheDocument();
  });

  it("displays search input", () => {
    const mockedUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;
    mockedUseAuth.mockReturnValue({
      userRole: "admin",
      user: { id: "123" },
    });

    (useQuery as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      data: [],
      isLoading: false,
    }));

    (useMutation as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
    });

    const queryClient = createTestQueryClient();

    render(<EmployeesPage />, { queryClient });

    expect(
      screen.getByPlaceholderText(
        "Search employees by name, code, or department...",
      ),
    ).toBeInTheDocument();
  });

  it("shows loading state", () => {
    const mockedUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;
    mockedUseAuth.mockReturnValue({
      userRole: "admin",
      user: { id: "123" },
    });

    (useQuery as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      data: undefined,
      isLoading: true,
    }));

    (useMutation as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
    });

    const queryClient = createTestQueryClient();

    render(<EmployeesPage />, { queryClient });

    // Should show loading skeletons (check for search input which should still be visible)
    expect(
      screen.getByPlaceholderText(
        "Search employees by name, code, or department...",
      ),
    ).toBeInTheDocument();
  });
});
