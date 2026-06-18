import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import KnowledgePage from "./KnowledgePage";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/components/layout/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
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
  (useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
    data: opts.documents ?? [],
    isLoading: opts.isLoading ?? false,
    isError: opts.isError ?? false,
  });
  (useMutation as ReturnType<typeof vi.fn>).mockReturnValue({
    mutate: reindexMutate,
    isPending: false,
  });
  (useQueryClient as ReturnType<typeof vi.fn>).mockReturnValue(mockQueryClient);
  return render(<KnowledgePage />);
}

describe("KnowledgePage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the title and upload button", () => {
    setup({ documents: [] });
    expect(screen.getAllByText("kb.title").length).toBeGreaterThan(0);
    expect(screen.getByText("kb.upload")).toBeInTheDocument();
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
    fireEvent.click(screen.getByTitle("kb.reindex"));
    expect(reindexMutate).toHaveBeenCalledWith("d-1");
  });
});
