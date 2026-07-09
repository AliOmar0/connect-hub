import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import ScraperPanel from "./ScraperPanel";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

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

// ScraperPanel attaches the Supabase access token to every scraper request;
// the real client requires env vars this test doesn't set, so stub it like
// every other page/component test does.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({ data: { session: { access_token: "test-token" } } }),
      ),
    },
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useQuery: vi.fn(),
    useMutation: vi.fn(),
    useQueryClient: vi.fn(),
  };
});

interface FixtureJob {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  trigger_type: "scheduled" | "manual";
  triggered_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  pages_visited: number;
  pages_succeeded: number;
  pages_failed: number;
  failure_reason: string | null;
  created_at: string;
}

function setup(opts: {
  userRole?: string | null;
  currentJob?: FixtureJob | null;
  isCurrentJobLoading?: boolean;
  jobs?: FixtureJob[];
  isHistoryLoading?: boolean;
  isHistoryError?: boolean;
}) {
  (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
    userRole: opts.userRole ?? "admin",
    user: null,
    session: null,
    loading: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  });

  (useQuery as ReturnType<typeof vi.fn>).mockImplementation(
    (config: { queryKey: unknown[] }) => {
      const key = config.queryKey[0];
      if (key === "scraper-current-job") {
        return {
          data: opts.currentJob ?? null,
          isLoading: opts.isCurrentJobLoading ?? false,
        };
      }
      if (key === "scraper-jobs") {
        return {
          data: opts.jobs ?? [],
          isLoading: opts.isHistoryLoading ?? false,
          isError: opts.isHistoryError ?? false,
          refetch: vi.fn(),
        };
      }
      return { data: undefined, isLoading: false };
    },
  );

  (useMutation as ReturnType<typeof vi.fn>).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  });

  (useQueryClient as ReturnType<typeof vi.fn>).mockReturnValue({
    invalidateQueries: vi.fn(),
  });

  return render(<ScraperPanel />);
}

const runningJob: FixtureJob = {
  id: "job-1",
  status: "running",
  trigger_type: "manual",
  triggered_by: "user-1",
  started_at: "2024-01-01T10:00:00.000Z",
  completed_at: null,
  pages_visited: 5,
  pages_succeeded: 3,
  pages_failed: 1,
  failure_reason: null,
  created_at: "2024-01-01T10:00:00.000Z",
};

const historyFixture: FixtureJob[] = [
  {
    id: "job-a",
    status: "completed",
    trigger_type: "scheduled",
    triggered_by: null,
    started_at: "2024-01-01T08:00:00.000Z",
    completed_at: "2024-01-01T08:10:00.000Z",
    pages_visited: 20,
    pages_succeeded: 18,
    pages_failed: 2,
    failure_reason: null,
    created_at: "2024-01-01T08:00:00.000Z",
  },
  {
    id: "job-b",
    status: "failed",
    trigger_type: "manual",
    triggered_by: "user-2",
    started_at: "2024-01-02T09:00:00.000Z",
    completed_at: "2024-01-02T09:05:00.000Z",
    pages_visited: 10,
    pages_succeeded: 7,
    pages_failed: 3,
    failure_reason: "backend unreachable",
    created_at: "2024-01-02T09:00:00.000Z",
  },
  {
    id: "job-c",
    status: "completed",
    trigger_type: "scheduled",
    triggered_by: null,
    started_at: "2024-01-03T11:00:00.000Z",
    completed_at: "2024-01-03T11:20:00.000Z",
    pages_visited: 15,
    pages_succeeded: 15,
    pages_failed: 0,
    failure_reason: null,
    created_at: "2024-01-03T11:00:00.000Z",
  },
];

describe("ScraperPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("trigger control visibility (Requirements 9.1, 9.5)", () => {
    it.each(["admin", "supervisor"])(
      "shows an enabled trigger button for the %s role",
      (role) => {
        setup({ userRole: role, jobs: historyFixture });
        const button = screen.getByRole("button", {
          name: "scraper.triggerNow",
        });
        expect(button).toBeInTheDocument();
        expect(button).not.toBeDisabled();
      },
    );

    it.each(["manager", "agent", "viewer"])(
      "hides the trigger button for the %s role",
      (role) => {
        setup({ userRole: role, jobs: historyFixture });
        expect(
          screen.queryByRole("button", { name: "scraper.triggerNow" }),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByText("scraper.triggerNow"),
        ).not.toBeInTheDocument();
      },
    );
  });

  describe("status/progress block (Requirements 9.2, 9.3)", () => {
    it("renders the progress block while a job is running", () => {
      setup({ currentJob: runningJob, jobs: historyFixture });
      const title = screen.getByText("scraper.currentJobTitle");
      expect(title).toBeInTheDocument();

      // Scope the count assertions to the current-job card itself, since the
      // history table below renders overlapping numeric values.
      const card = title.closest(".rounded-lg") as HTMLElement;
      expect(card).not.toBeNull();
      expect(within(card).getByText("5")).toBeInTheDocument();
      expect(within(card).getByText("3")).toBeInTheDocument();
      expect(within(card).getByText("1")).toBeInTheDocument();
    });

    it("renders nothing in that slot when there is no current job", () => {
      setup({ currentJob: null, jobs: historyFixture });
      expect(
        screen.queryByText("scraper.currentJobTitle"),
      ).not.toBeInTheDocument();
    });

    it("renders nothing in that slot when the current job is not running", () => {
      setup({
        currentJob: { ...runningJob, status: "completed" },
        jobs: historyFixture,
      });
      expect(
        screen.queryByText("scraper.currentJobTitle"),
      ).not.toBeInTheDocument();
    });
  });

  describe("history table (Requirement 9.4)", () => {
    it("renders start/end time and success/failure counts for each fixture job", () => {
      setup({ jobs: historyFixture });

      const rows = screen.getAllByRole("row");
      // Header row + one row per fixture job.
      expect(rows).toHaveLength(historyFixture.length + 1);

      historyFixture.forEach((job) => {
        const row = rows[historyFixture.indexOf(job) + 1];
        const cells = row.querySelectorAll("td");
        expect(cells[0].textContent).toContain(
          new Date(job.started_at as string).toLocaleString(),
        );
        expect(cells[1].textContent).toContain(
          new Date(job.completed_at as string).toLocaleString(),
        );
        expect(cells[2].textContent).toBe(String(job.pages_succeeded));
        expect(cells[3].textContent).toBe(String(job.pages_failed));
      });
    });
  });

  it("has no axe-detectable accessibility violations", async () => {
    const { container } = setup({
      currentJob: runningJob,
      jobs: historyFixture,
    });
    const results = await axe(container, {
      rules: { "heading-order": { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });
});
