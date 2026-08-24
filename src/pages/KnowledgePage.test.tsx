import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { toast } from "sonner";
import KnowledgePage from "./KnowledgePage";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

expect.extend(toHaveNoViolations);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

vi.mock("@/components/layout/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

// ScraperPanel and SessionTypesPanel are separate features with their own
// data dependencies (useAuth, scraper/session-type queries); each is
// covered by its own test suite, so both are stubbed here to keep this
// file focused on KnowledgePage's own behavior.
vi.mock("@/components/knowledge/ScraperPanel", () => ({
  default: () => null,
}));
vi.mock("@/components/knowledge/SessionTypesPanel", () => ({
  default: () => null,
}));

// KnowledgePage attaches the Supabase access token to every KB request; the
// real client requires env vars this test doesn't set, so stub it like every
// other page test does.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({ data: { session: { access_token: "test-token" } } }),
      ),
    },
  },
}));

const mockQueryClient = { invalidateQueries: vi.fn() };
const reindexMutate = vi.fn();

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useQuery: vi.fn(),
    useMutation: vi.fn(),
    useQueryClient: vi.fn(() => mockQueryClient),
  };
});

const sampleDoc = {
  id: "d-1",
  name: "branches.pdf",
  status: "indexed" as const,
  version: 2,
  updated_at: new Date().toISOString(),
};

function setup(opts: {
  documents?: unknown[];
  isLoading?: boolean;
  isError?: boolean;
}) {
  // DocumentDetailDialog and VersionHistoryDialog stay mounted (for open/close
  // transitions) and run their own useQuery calls even when their dialog is
  // closed; only the "kb-documents" query should reflect this setup's data.
  (useQuery as ReturnType<typeof vi.fn>).mockImplementation(
    ({ queryKey }: { queryKey: unknown[] }) => {
      if (queryKey[0] === "kb-documents") {
        return {
          data: opts.documents ?? [],
          isLoading: opts.isLoading ?? false,
          isError: opts.isError ?? false,
        };
      }
      return { data: undefined, isLoading: false, isError: false };
    },
  );
  (useMutation as ReturnType<typeof vi.fn>).mockReturnValue({
    mutate: reindexMutate,
    isPending: false,
  });
  (useQueryClient as ReturnType<typeof vi.fn>).mockReturnValue(mockQueryClient);
  return render(<KnowledgePage />);
}

// The file <input> carries an accessible label ("kb.upload") so it is the only
// labelable form control matching that name; the visible Button is queried by
// role instead.
function getFileInput(): HTMLInputElement {
  return screen.getByLabelText("kb.upload") as HTMLInputElement;
}

function selectFile(input: HTMLInputElement) {
  const file = new File(["hello"], "guide.pdf", { type: "application/pdf" });
  fireEvent.change(input, { target: { files: [file] } });
}

describe("KnowledgePage", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("renders the title and upload button", () => {
    setup({ documents: [] });
    expect(screen.getAllByText("kb.title").length).toBeGreaterThan(0);
    expect(screen.getAllByText("kb.upload").length).toBeGreaterThan(0);
  });

  it("shows the empty state when there are no documents", () => {
    setup({ documents: [] });
    expect(screen.getByText("kb.empty")).toBeInTheDocument();
  });

  it("shows the backend-missing warning on error", () => {
    setup({ documents: [], isError: true });
    expect(screen.getByText("kb.backendMissing")).toBeInTheDocument();
  });

  it("renders a document row and triggers re-index", () => {
    setup({ documents: [sampleDoc] });
    expect(screen.getByText("branches.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "kb.reindex" }));
    expect(reindexMutate).toHaveBeenCalledWith("d-1");
  });

  // Requirement 16.2: while an upload is in progress the page presents a
  // loading Component_State and disables the upload submission control to
  // prevent duplicate submission.
  it("shows a loading state and disables the upload button while uploading", async () => {
    // A fetch that never settles keeps the upload in flight.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    setup({ documents: [sampleDoc] });

    const uploadButton = screen.getByRole("button", { name: "kb.upload" });
    expect(uploadButton).not.toBeDisabled();

    selectFile(getFileInput());

    await waitFor(() => {
      const busyButton = screen.getByRole("button", { name: "kb.uploading" });
      expect(busyButton).toBeDisabled();
      expect(busyButton).toHaveAttribute("aria-busy", "true");
    });
    // The in-progress label replaces the idle one.
    expect(
      screen.queryByRole("button", { name: "kb.upload" }),
    ).not.toBeInTheDocument();
  });

  // Requirement 16.3: a failed operation presents an Error_State with a
  // recovery action and retains the prior document collection presentation.
  it("keeps the document collection and offers retry when upload fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("Upload failed"))),
    );
    setup({ documents: [sampleDoc] });

    selectFile(getFileInput());

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "kb.operationFailed",
        expect.objectContaining({
          action: expect.objectContaining({ label: "feedback.retry" }),
        }),
      );
    });

    // The existing collection presentation is retained after the failure.
    expect(screen.getByText("branches.pdf")).toBeInTheDocument();
    // The upload control returns to its idle, enabled state.
    expect(
      screen.getByRole("button", { name: "kb.upload" }),
    ).not.toBeDisabled();
  });

  // Requirement 16.4: the empty state offers a document-add action.
  it("offers a document-add action in the empty state", () => {
    setup({ documents: [] });
    expect(screen.getByText("kb.empty")).toBeInTheDocument();
    // Both the header button and the empty-state action expose the add affordance.
    const addButtons = screen.getAllByRole("button", { name: "kb.upload" });
    expect(addButtons.length).toBeGreaterThanOrEqual(2);
  });

  // Requirement 16.5: every document management input has an accessible label.
  it("associates document management inputs with accessible labels", () => {
    setup({ documents: [sampleDoc] });
    // The file input, re-index, and version-history controls are all labelled.
    expect(getFileInput()).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "kb.reindex" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "kb.versionHistory" }),
    ).toBeInTheDocument();
  });

  it("has no axe-detectable accessibility violations when loaded", async () => {
    const { container } = setup({ documents: [sampleDoc] });
    const results = await axe(container, {
      rules: { "heading-order": { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });

  it("has no axe-detectable accessibility violations in the empty state", async () => {
    const { container } = setup({ documents: [] });
    const results = await axe(container, {
      rules: { "heading-order": { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });
});
