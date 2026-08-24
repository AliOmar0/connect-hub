import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test-utils/render";
import { axe, toHaveNoViolations } from "jest-axe";
import ShortcutsPage from "./ShortcutsPage";

expect.extend(toHaveNoViolations);

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/components/layout/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));

// Mock useAuth so user is always authenticated
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "test-user-id" } }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock Supabase — return an empty list by default; individual tests override
const mockSelect = vi.fn().mockResolvedValue({ data: [], error: null });
const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
const mockUpdate = vi.fn().mockResolvedValue({ data: null, error: null });
const mockDelete = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => mockSelect(),
        }),
      }),
      insert: () => mockInsert(),
      update: () => ({
        eq: () => mockUpdate(),
      }),
      delete: () => ({
        eq: () => mockDelete(),
      }),
    }),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SAMPLE_SHORTCUTS = [
  {
    id: "sc-1",
    user_id: "test-user-id",
    title: "Greeting",
    content: "Hello! How can I help you today?",
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
  },
  {
    id: "sc-2",
    user_id: "test-user-id",
    title: "Farewell",
    content: "Thank you for contacting us. Have a great day!",
    created_at: "2024-01-02",
    updated_at: "2024-01-02",
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ShortcutsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockResolvedValue({ data: [], error: null });
  });

  // ── Page structure ────────────────────────────────────────────────────────

  it("renders the page title as an h1 with the Zap icon label", () => {
    render(<ShortcutsPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: /Quick Reply Shortcuts/i }),
    ).toBeInTheDocument();
  });

  it("does NOT render a Keyboard Shortcuts Reference heading", () => {
    render(<ShortcutsPage />);
    expect(
      screen.queryByRole("heading", { name: /keyboard shortcuts reference/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the Add Shortcut button", () => {
    render(<ShortcutsPage />);
    expect(
      screen.getByRole("button", { name: /add shortcut/i }),
    ).toBeInTheDocument();
  });

  it("renders the backslash trigger hint in the subtitle", () => {
    render(<ShortcutsPage />);
    // The subtitle mentions the \ trigger
    expect(screen.getByText(/message box/i)).toBeInTheDocument();
  });

  // ── Empty state ───────────────────────────────────────────────────────────

  it("shows an empty state with CTA when there are no shortcuts", async () => {
    mockSelect.mockResolvedValue({ data: [], error: null });
    render(<ShortcutsPage />);

    await waitFor(() => {
      expect(screen.getByText(/no shortcuts yet/i)).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: /add your first shortcut/i }),
    ).toBeInTheDocument();
  });

  // ── Shortcut cards ────────────────────────────────────────────────────────

  it("renders a card for each shortcut returned by the API", async () => {
    mockSelect.mockResolvedValue({ data: SAMPLE_SHORTCUTS, error: null });
    render(<ShortcutsPage />);

    await waitFor(() => {
      expect(screen.getByText("Greeting")).toBeInTheDocument();
      expect(screen.getByText("Farewell")).toBeInTheDocument();
    });

    expect(
      screen.getByText("Hello! How can I help you today?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Thank you for contacting us. Have a great day!"),
    ).toBeInTheDocument();
  });

  // ── Search ────────────────────────────────────────────────────────────────

  it("filters shortcuts by title when the user types in the search box", async () => {
    mockSelect.mockResolvedValue({ data: SAMPLE_SHORTCUTS, error: null });
    render(<ShortcutsPage />);

    await waitFor(() => {
      expect(screen.getByText("Greeting")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search shortcuts/i);
    fireEvent.change(searchInput, { target: { value: "Greeting" } });

    expect(screen.getByText("Greeting")).toBeInTheDocument();
    expect(screen.queryByText("Farewell")).not.toBeInTheDocument();
  });

  it("shows 'no shortcuts match' message when search finds nothing", async () => {
    mockSelect.mockResolvedValue({ data: SAMPLE_SHORTCUTS, error: null });
    render(<ShortcutsPage />);

    await waitFor(() => {
      expect(screen.getByText("Greeting")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search shortcuts/i);
    fireEvent.change(searchInput, { target: { value: "xyznotfound" } });

    expect(
      screen.getByText(/no shortcuts match your search/i),
    ).toBeInTheDocument();
  });

  // ── Add dialog ────────────────────────────────────────────────────────────

  it("opens the Add Shortcut dialog when the Add button is clicked", async () => {
    render(<ShortcutsPage />);

    fireEvent.click(screen.getByRole("button", { name: /add shortcut/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: /new chat shortcut/i }),
      ).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/shortcut title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/reply text/i)).toBeInTheDocument();
  });

  it("disables the Save button when title or content is empty", async () => {
    render(<ShortcutsPage />);
    fireEvent.click(screen.getByRole("button", { name: /add shortcut/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    const saveBtn = screen.getByRole("button", {
      name: /add shortcut/i,
      hidden: false,
    });
    // Find the save button specifically inside the dialog
    const dialogSave = screen
      .getAllByRole("button", { name: /add shortcut/i })
      .find((btn) => btn.closest("[role='dialog']"));
    expect(dialogSave).toBeDisabled();
  });

  it("enables the Save button when both title and content are filled", async () => {
    render(<ShortcutsPage />);
    fireEvent.click(screen.getByRole("button", { name: /^add shortcut$/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/shortcut title/i), {
      target: { value: "My Shortcut" },
    });
    fireEvent.change(screen.getByLabelText(/reply text/i), {
      target: { value: "My response text" },
    });

    const saveBtn = screen
      .getAllByRole("button")
      .find(
        (btn) =>
          btn.closest("[role='dialog']") &&
          /add shortcut/i.test(btn.textContent ?? ""),
      );
    expect(saveBtn).not.toBeDisabled();
  });

  it("closes the dialog when Cancel is clicked", async () => {
    render(<ShortcutsPage />);
    fireEvent.click(screen.getByRole("button", { name: /^add shortcut$/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  // ── Edit dialog ───────────────────────────────────────────────────────────

  it("opens the Edit Shortcut dialog pre-filled with the shortcut data", async () => {
    mockSelect.mockResolvedValue({ data: SAMPLE_SHORTCUTS, error: null });
    render(<ShortcutsPage />);

    await waitFor(() => {
      expect(screen.getByText("Greeting")).toBeInTheDocument();
    });

    // Click the edit button for the first shortcut
    const editBtn = screen.getAllByRole("button", {
      name: /edit shortcut/i,
    })[0];
    fireEvent.click(editBtn);

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: /edit shortcut/i }),
      ).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue("Greeting")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("Hello! How can I help you today?"),
    ).toBeInTheDocument();
  });

  // ── Delete confirmation ───────────────────────────────────────────────────

  it("opens a confirmation AlertDialog when the delete button is clicked", async () => {
    mockSelect.mockResolvedValue({ data: SAMPLE_SHORTCUTS, error: null });
    render(<ShortcutsPage />);

    await waitFor(() => {
      expect(screen.getByText("Greeting")).toBeInTheDocument();
    });

    const deleteBtn = screen.getAllByRole("button", {
      name: /delete shortcut/i,
    })[0];
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(
        screen.getByRole("alertdialog", { name: /delete shortcut/i }),
      ).toBeInTheDocument();
    });

    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^delete$/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("closes the AlertDialog when Cancel is clicked", async () => {
    mockSelect.mockResolvedValue({ data: SAMPLE_SHORTCUTS, error: null });
    render(<ShortcutsPage />);

    await waitFor(() => {
      expect(screen.getByText("Greeting")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getAllByRole("button", { name: /delete shortcut/i })[0],
    );

    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  // ── Accessibility ─────────────────────────────────────────────────────────

  it("has no axe-detectable accessibility violations on the empty page", async () => {
    mockSelect.mockResolvedValue({ data: [], error: null });
    const { container } = render(<ShortcutsPage />);
    await waitFor(() =>
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument(),
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no axe-detectable accessibility violations with shortcuts loaded", async () => {
    mockSelect.mockResolvedValue({ data: SAMPLE_SHORTCUTS, error: null });
    const { container } = render(<ShortcutsPage />);
    await waitFor(() => {
      expect(screen.getByText("Greeting")).toBeInTheDocument();
    });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
