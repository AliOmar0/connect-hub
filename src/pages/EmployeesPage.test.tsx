import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
  act,
} from "@/test-utils/render";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import EmployeesPage from "./EmployeesPage";
import { useAuth } from "@/hooks/useAuth";
import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryClient,
} from "@tanstack/react-query";
import { mockEmployees, mockProfiles } from "@/test-utils/fixtures";
import type { Employee, Profile } from "@/types/database";

expect.extend(toHaveNoViolations);

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

// ---------------------------------------------------------------------------
// Task 14.2 — focus trap, failure announcement/retention, role labels,
// delete confirmation, and duplicate-submit prevention.
// Requirements: 18.1, 18.3, 18.4, 18.5, 18.6, 18.7, 18.8
// ---------------------------------------------------------------------------

const employeeWithProfile: Employee & { profile?: Profile } = {
  ...mockEmployees[0],
  profile: mockProfiles[0],
};

// Stable mutate spies so assertions survive re-renders (the mocked useMutation
// factory runs on every render).
const createMutate = vi.fn();
const updateMutate = vi.fn();
const deleteMutate = vi.fn();

// Captured mutation options (onSuccess/onError) keyed by declaration order in
// EmployeesPage: create, update, delete. useMutation is called in that fixed
// order on every render, so cycling the call index mod 3 keeps the latest
// options for each slot regardless of how many times React re-renders.
let mutationCallIndex = 0;
const captured: {
  create?: { onSuccess?: () => void; onError?: (e: Error) => void };
  update?: { onSuccess?: () => void; onError?: (e: Error) => void };
  delete?: { onSuccess?: () => void; onError?: (e: Error) => void };
} = {};

function setupAuth(role: string) {
  const mockedUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;
  mockedUseAuth.mockReturnValue({ userRole: role, user: { id: "123" } });
}

function setupQuery(employees: Array<Employee & { profile?: Profile }>) {
  (useQuery as ReturnType<typeof vi.fn>).mockImplementation(
    (options: { queryKey: string[] }) => {
      if (options.queryKey[0] === "employees") {
        return { data: employees, isLoading: false, isError: false };
      }
      // profiles query
      return { data: mockProfiles, isLoading: false, isError: false };
    },
  );
}

function setupMutations(
  pending: { create?: boolean; update?: boolean; delete?: boolean } = {},
) {
  mutationCallIndex = 0;
  captured.create = undefined;
  captured.update = undefined;
  captured.delete = undefined;
  const mutates = [createMutate, updateMutate, deleteMutate];
  const pendingFlags = [
    pending.create ?? false,
    pending.update ?? false,
    pending.delete ?? false,
  ];

  (useMutation as ReturnType<typeof vi.fn>).mockImplementation(
    (options: { onSuccess?: () => void; onError?: (e: Error) => void }) => {
      const slot = mutationCallIndex % 3;
      mutationCallIndex += 1;
      if (slot === 0) captured.create = options;
      else if (slot === 1) captured.update = options;
      else captured.delete = options;
      return {
        mutate: mutates[slot],
        mutateAsync: vi.fn(),
        isPending: pendingFlags[slot],
      };
    },
  );
}

describe("EmployeesPage - accessibility and management flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useQueryClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockQueryClient,
    );
    // jsdom lacks these DOM APIs that Radix Select relies on when opening.
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    window.HTMLElement.prototype.hasPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  });

  // Requirement 18.1 — consistent tokens/structure with no a11y violations.
  it("has no detectable WCAG violations when the list is loaded", async () => {
    setupAuth("admin");
    setupQuery([employeeWithProfile]);
    setupMutations();

    const { container } = render(<EmployeesPage />, {
      queryClient: createTestQueryClient(),
    });

    const results = await axe(container, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
    });

    expect(results).toHaveNoViolations();
  });

  // Requirement 18.3 — the create/edit dialog is a modal that confines focus.
  it("opens a modal create/edit dialog that traps focus", async () => {
    setupAuth("admin");
    setupQuery([]);
    setupMutations();

    render(<EmployeesPage />, { queryClient: createTestQueryClient() });

    fireEvent.click(screen.getByText("Add Employee"));

    const dialog = await screen.findByRole("dialog");
    // Radix mounts a trapped FocusScope with edge focus guards when the modal
    // dialog opens; those guards are the focus-confinement mechanism, keeping
    // keyboard focus inside the dialog until it is dismissed (Requirement 18.3).
    await waitFor(() => {
      expect(
        document.querySelectorAll("[data-radix-focus-guard]").length,
      ).toBeGreaterThan(0);
    });
    expect(
      within(dialog).getByRole("heading", { name: "Add Employee" }),
    ).toBeInTheDocument();
  });

  // Requirement 18.5 — each Role is presented with a text label, not color alone.
  it("presents roles as text labels in the create-user dialog", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    setupAuth("admin");
    setupQuery([]);
    setupMutations();

    render(<EmployeesPage />, { queryClient: createTestQueryClient() });

    fireEvent.click(screen.getByText("Create User"));

    const dialog = await screen.findByRole("dialog");
    // The role field is labelled with readable text ("Role"), not a color cue.
    const roleTrigger = within(dialog).getByLabelText(/Role/);
    expect(roleTrigger).toBeInTheDocument();

    // Every role option is presented as a readable text label.
    await user.click(roleTrigger);
    const options = await screen.findAllByRole("option");
    const optionLabels = options.map((o) => o.textContent);
    expect(optionLabels).toEqual(
      expect.arrayContaining([
        "Administrator",
        "Supervisor",
        "Manager",
        "Agent",
        "Viewer",
      ]),
    );
  });

  // Requirement 18.4 — create failure is announced to AT, offers recovery, and
  // retains the user's entered values.
  it("announces a create failure and retains entered values", async () => {
    setupAuth("admin");
    setupQuery([]);
    setupMutations();

    render(<EmployeesPage />, { queryClient: createTestQueryClient() });

    fireEvent.click(screen.getByText("Add Employee"));
    await screen.findByRole("dialog");

    // Enter a value the user should not lose when the operation fails.
    const codeInput = screen.getByLabelText(
      "Employee Code",
    ) as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: "EMP-RETAIN" } });

    // Simulate the create mutation failing (react-query is mocked, so drive the
    // captured onError directly).
    act(() => {
      captured.create?.onError?.(new Error("Server rejected the request"));
    });

    // The failure surfaces in an assertive live region (role="alert"), which is
    // announced to assistive technology, and includes a human-readable message.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't save the employee");
    expect(alert).toHaveTextContent("Server rejected the request");

    // Entered values are retained (Requirement 18.4) and a recovery action (the
    // submit control) remains available.
    expect(
      (screen.getByLabelText("Employee Code") as HTMLInputElement).value,
    ).toBe("EMP-RETAIN");
    expect(
      screen.getByRole("button", { name: "Save Changes" }),
    ).toBeInTheDocument();
  });

  // Requirement 18.6 — while a create is in progress the initiating control
  // shows a loading state and is disabled, preventing duplicate submission.
  it("disables the submit control with a loading state while saving", async () => {
    setupAuth("admin");
    setupQuery([]);
    setupMutations({ create: true });

    render(<EmployeesPage />, { queryClient: createTestQueryClient() });

    fireEvent.click(screen.getByText("Add Employee"));
    await screen.findByRole("dialog");

    const submitButton = screen.getByRole("button", { name: /Processing/ });
    expect(submitButton).toBeDisabled();
  });

  // Requirement 18.8 — deletion requires an explicit confirmation action.
  it("requires explicit confirmation before deleting an employee", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    setupAuth("admin");
    setupQuery([employeeWithProfile]);
    setupMutations();

    render(<EmployeesPage />, { queryClient: createTestQueryClient() });

    // Open the record's action menu and choose Delete.
    await user.click(
      screen.getByRole("button", { name: /Actions for Agent One/ }),
    );
    await user.click(await screen.findByText("Delete"));

    // A confirmation dialog appears and no deletion has been performed yet.
    const alertDialog = await screen.findByRole("alertdialog");
    expect(
      within(alertDialog).getByText("Delete employee?"),
    ).toBeInTheDocument();
    expect(deleteMutate).not.toHaveBeenCalled();

    // Only the explicit confirm action triggers the deletion.
    await user.click(
      within(alertDialog).getByRole("button", { name: "Delete" }),
    );
    expect(deleteMutate).toHaveBeenCalledWith(employeeWithProfile.id);
  });

  // Requirement 18.6 (delete) — the confirm control shows a loading state and is
  // disabled while the deletion is in flight, preventing duplicate submission.
  it("shows a loading state on the delete confirm control while deleting", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    setupAuth("admin");
    setupQuery([employeeWithProfile]);
    setupMutations({ delete: true });

    render(<EmployeesPage />, { queryClient: createTestQueryClient() });

    await user.click(
      screen.getByRole("button", { name: /Actions for Agent One/ }),
    );
    await user.click(await screen.findByText("Delete"));

    const alertDialog = await screen.findByRole("alertdialog");
    const confirmButton = within(alertDialog).getByRole("button", {
      name: /Deleting/,
    });
    expect(confirmButton).toBeDisabled();
    expect(
      within(alertDialog).getByRole("button", { name: "Cancel" }),
    ).toBeDisabled();
  });

  // Requirement 18.7 — a successful operation confirms and refreshes the list.
  it("invalidates the employees query on successful deletion", async () => {
    setupAuth("admin");
    setupQuery([employeeWithProfile]);
    setupMutations();

    render(<EmployeesPage />, { queryClient: createTestQueryClient() });

    act(() => {
      captured.delete?.onSuccess?.();
    });

    await waitFor(() => {
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["employees"],
      });
    });
  });
});
