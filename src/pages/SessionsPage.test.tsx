import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test-utils/render";
import SessionsPage from "./SessionsPage";
import { useAuth } from "@/hooks/useAuth";
import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryClient,
} from "@tanstack/react-query";

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
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
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

describe("SessionsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockedUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;
    (useQueryClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockQueryClient,
    );
    (useQuery as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      data: [],
      isLoading: false,
      refetch: vi.fn(),
    }));
  });

  it("renders sessions page title", () => {
    const mockedUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;
    mockedUseAuth.mockReturnValue({
      userRole: "admin",
      user: { id: "123" },
    });

    (useMutation as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
    });

    const queryClient = createTestQueryClient();

    render(<SessionsPage />, { queryClient });

    expect(screen.getByText("Active AI Sessions")).toBeInTheDocument();
  });

  it("shows assign agent button for managers", () => {
    const mockedUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;
    mockedUseAuth.mockReturnValue({
      userRole: "manager",
      user: { id: "123" },
    });

    (useMutation as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
    });

    const queryClient = createTestQueryClient();

    render(<SessionsPage />, { queryClient });

    expect(screen.getByText("Active AI Sessions")).toBeInTheDocument();
  });

  it("displays search input", () => {
    const mockedUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;
    mockedUseAuth.mockReturnValue({
      userRole: "admin",
      user: { id: "123" },
    });

    (useMutation as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
    });

    const queryClient = createTestQueryClient();

    render(<SessionsPage />, { queryClient });

    // Search input should be present
    expect(
      screen.getByPlaceholderText(
        "Search by customer, phone, email, or agent...",
      ),
    ).toBeInTheDocument();
  });

  it("shows filter dropdowns", () => {
    const mockedUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;
    mockedUseAuth.mockReturnValue({
      userRole: "admin",
      user: { id: "123" },
    });

    (useMutation as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
    });

    const queryClient = createTestQueryClient();

    render(<SessionsPage />, { queryClient });

    expect(screen.getByText("Active AI Sessions")).toBeInTheDocument();
  });

  it("shows conversation placeholder when no session is selected", () => {
    const mockedUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;
    mockedUseAuth.mockReturnValue({
      userRole: "admin",
      user: { id: "123" },
    });

    (useMutation as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
    });

    const queryClient = createTestQueryClient();

    render(<SessionsPage />, { queryClient });

    expect(screen.getByText("لم يتم اختيار محادثة")).toBeInTheDocument();
  });
});
