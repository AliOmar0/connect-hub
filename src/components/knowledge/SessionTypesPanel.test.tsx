import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import SessionTypesPanel from "./SessionTypesPanel";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

expect.extend(toHaveNoViolations);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts?.term ? `${key}:${opts.term}` : key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

// SessionTypesPanel reads/writes public.session_main_types directly via the
// Supabase client (not through useQuery/useMutation like ScraperPanel), and
// syncs to the backend via apiFetch. Both are stubbed here.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({ data: { session: { access_token: "test-token" } } }),
      ),
    },
    from: vi.fn(),
  },
}));

vi.mock("@/lib/config", () => ({
  KNOWLEDGE_BASE_API_URL: "http://localhost:5000/api/v1/knowledge-base",
  apiFetch: vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  ),
}));

interface FixtureType {
  id: string;
  name: string;
  parent_category: string | null;
  description: string | null;
  ai_prompt?: string | null;
  created_at: string;
}

const fixtureTypes: FixtureType[] = [
  {
    id: "type-1",
    name: "Car Financing",
    parent_category: "Services",
    description: "Questions about vehicle financing",
    ai_prompt: "Detailed financing terms...",
    created_at: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "type-2",
    name: "Branches",
    parent_category: "Inquiries",
    description: "Branch locations and hours",
    ai_prompt: null,
    created_at: "2024-01-02T00:00:00.000Z",
  },
];

function mockSupabaseSelect(data: FixtureType[]) {
  const order = vi.fn(() => Promise.resolve({ data, error: null }));
  const select = vi.fn(() => ({ order }));
  (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ select });
  return { select, order };
}

function setup(opts: { userRole?: string | null; types?: FixtureType[] } = {}) {
  (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
    userRole: opts.userRole ?? "admin",
    user: null,
    session: null,
    loading: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  });

  mockSupabaseSelect(opts.types ?? fixtureTypes);

  return render(<SessionTypesPanel />);
}

describe("SessionTypesPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the panel title and loaded session types grouped by category", async () => {
    setup();
    expect(screen.getByText("kb.sessionTypes.title")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Car Financing")).toBeInTheDocument();
    });
    expect(screen.getByText("Branches")).toBeInTheDocument();
    expect(screen.getByText("Services")).toBeInTheDocument();
    expect(screen.getByText("Inquiries")).toBeInTheDocument();
  });

  it("shows the empty state when there are no session types", async () => {
    setup({ types: [] });
    await waitFor(() => {
      expect(screen.getByText("kb.sessionTypes.empty")).toBeInTheDocument();
    });
  });

  describe("admin-only management controls", () => {
    it("shows the new-type button and edit/delete controls for admin", async () => {
      setup({ userRole: "admin" });
      await waitFor(() => {
        expect(screen.getByText("Car Financing")).toBeInTheDocument();
      });
      expect(
        screen.getByRole("button", { name: "kb.sessionTypes.newType" }),
      ).toBeInTheDocument();
      expect(
        screen.getAllByRole("button", { name: "kb.sessionTypes.edit" }).length,
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByRole("button", { name: "kb.sessionTypes.delete" })
          .length,
      ).toBeGreaterThan(0);
    });

    it.each(["manager", "agent", "viewer"])(
      "hides management controls and shows a read-only notice for the %s role",
      async (role) => {
        setup({ userRole: role });
        await waitFor(() => {
          expect(screen.getByText("Car Financing")).toBeInTheDocument();
        });
        expect(
          screen.queryByRole("button", { name: "kb.sessionTypes.newType" }),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByRole("button", { name: "kb.sessionTypes.edit" }),
        ).not.toBeInTheDocument();
        expect(
          screen.getByText("kb.sessionTypes.adminOnly"),
        ).toBeInTheDocument();
      },
    );
  });

  it("filters the list by search term", async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText("Car Financing")).toBeInTheDocument();
    });

    const search = screen.getByLabelText("kb.sessionTypes.searchPlaceholder");
    fireEvent.change(search, { target: { value: "Branches" } });

    expect(screen.queryByText("Car Financing")).not.toBeInTheDocument();
    expect(screen.getByText("Branches")).toBeInTheDocument();
  });

  it("opens the create dialog with empty fields when adding a new type", async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText("Car Financing")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "kb.sessionTypes.newType" }),
    );

    expect(screen.getByText("kb.sessionTypes.createTitle")).toBeInTheDocument();
    expect(screen.getByLabelText("kb.sessionTypes.nameLabel")).toHaveValue("");
    expect(screen.getByLabelText("kb.sessionTypes.aiPromptLabel")).toHaveValue(
      "",
    );
  });

  it("opens the edit dialog pre-filled with the selected type's data", async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText("Car Financing")).toBeInTheDocument();
    });

    const editButtons = screen.getAllByRole("button", {
      name: "kb.sessionTypes.edit",
    });
    fireEvent.click(editButtons[0]);

    expect(screen.getByText("kb.sessionTypes.editTitle")).toBeInTheDocument();
    expect(screen.getByLabelText("kb.sessionTypes.nameLabel")).toHaveValue(
      "Car Financing",
    );
  });

  it("has no axe-detectable accessibility violations when loaded", async () => {
    const { container } = setup();
    await waitFor(() => {
      expect(screen.getByText("Car Financing")).toBeInTheDocument();
    });
    const results = await axe(container, {
      rules: { "heading-order": { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });
});
