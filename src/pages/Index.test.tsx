import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@/test-utils/render";
import { useQuery } from "@tanstack/react-query";
import { axe, toHaveNoViolations } from "jest-axe";
import Index from "./Index";
import i18n from "@/i18n";

expect.extend(toHaveNoViolations);

// --- Module mocks -----------------------------------------------------------

// Drive the page's data views deterministically by mocking useQuery. Index
// issues one query per data region; the metric cards read the "dashboard-stats"
// query, so controlling its loading/error/loaded status exercises the per-card
// AsyncBoundary (Skeleton / ErrorState / loaded) without touching the network.
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return { ...actual, useQuery: vi.fn() };
});

// The App_Shell has its own tests; here we only need a single main landmark so
// the page content is a well-formed document for the axe scan.
vi.mock("@/components/layout/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));

// Stub the heavy chart/panel children so the tests stay focused on the metric
// grid, its states, and layout. Each stub is a simple, labelled region.
vi.mock("@/components/dashboard/ConversationsChart", () => ({
  default: () => <div data-testid="conversations-chart" />,
}));
vi.mock("@/components/dashboard/ChannelDistributionChart", () => ({
  default: () => <div data-testid="channel-chart" />,
}));
vi.mock("@/components/dashboard/ActiveSessionsPanel", () => ({
  default: () => <div data-testid="active-sessions-panel" />,
}));
vi.mock("@/components/dashboard/EmployeesTable", () => ({
  default: () => <div data-testid="employees-table" />,
}));
vi.mock("@/components/dashboard/IntegrationStatus", () => ({
  default: () => <div data-testid="integration-status" />,
}));
vi.mock("@/components/dashboard/ResponseTimeChart", () => ({
  default: () => <div data-testid="response-time-chart" />,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  },
}));

// --- Fixtures & helpers ------------------------------------------------------

const METRIC_TITLES = [
  "Total Messages",
  "Total Calls",
  "Active Sessions",
  "Active Agents",
  "Avg. Response",
  "Resolution Rate",
];

const statsFixture = {
  messages: { count: 1200, trend: 5 },
  calls: { count: 300, trend: -2 },
  activeSessions: 12,
  activeAgents: 8,
  avgResponseTime: "2.5m",
  resolutionRate: 87,
};

const refetchStats = vi.fn();

/**
 * Configure the mocked useQuery. `loading`/`error` apply only to the
 * "dashboard-stats" query that backs the metric cards, so the per-card
 * AsyncBoundary states are exercised in isolation; every other data region
 * (charts, panels) always resolves to a loaded, empty result.
 */
function configureQueries({
  loading = false,
  error = false,
  stats = statsFixture,
}: {
  loading?: boolean;
  error?: boolean;
  stats?: typeof statsFixture | undefined;
} = {}) {
  (useQuery as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (options: { queryKey: unknown[] }) => {
      const key = options.queryKey[0];
      if (key === "dashboard-stats") {
        return {
          isLoading: loading,
          isError: error,
          data: loading || error ? undefined : stats,
          refetch: refetchStats,
        };
      }
      return { isLoading: false, isError: false, data: [], refetch: vi.fn() };
    },
  );
}

describe("Index (dashboard home)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureQueries();
  });

  afterEach(async () => {
    // Reset direction/language so an RTL test can't leak into the next test.
    if (i18n.language !== "en") {
      await i18n.changeLanguage("en");
    }
  });

  // Requirement 12.1 — metric cards share the same color, spacing, typography,
  // radius, and elevation token values.
  it("renders all metric cards with a uniform token-driven container", () => {
    render(<Index />);

    const classNames = METRIC_TITLES.map((title) => {
      const card = screen.getByText(title).closest("div.rounded-xl");
      expect(card).not.toBeNull();
      return card!.className;
    });

    // Every card carries the same design-token utility classes...
    classNames.forEach((cls) => {
      expect(cls).toContain("rounded-xl"); // radius token
      expect(cls).toContain("border-border"); // color token
      expect(cls).toContain("p-5"); // spacing token
      expect(cls).toContain("shadow-card"); // elevation token
    });
    // ...and the container styling is identical across all six cards.
    expect(new Set(classNames).size).toBe(1);
  });

  // Requirement 12.2 — while metric data is loading, each card shows a Skeleton
  // occupying the same footprint until the value resolves.
  it("shows a same-footprint skeleton per metric card while loading", () => {
    configureQueries({ loading: true });
    const { container } = render(<Index />);

    // Real metric values are not shown while loading.
    METRIC_TITLES.forEach((title) => {
      expect(screen.queryByText(title)).not.toBeInTheDocument();
    });

    // One skeleton placeholder per metric card, each reproducing the card
    // footprint (same radius/elevation/spacing tokens, hidden from AT).
    const skeletons = container.querySelectorAll(
      'div[aria-hidden="true"].shadow-card',
    );
    expect(skeletons).toHaveLength(METRIC_TITLES.length);
    skeletons.forEach((el) => {
      expect(el.className).toContain("rounded-xl");
      expect(el.className).toContain("p-5");
    });
  });

  // Requirement 12.3 — if metric retrieval fails, each affected card shows an
  // Error_State with a recovery action (per Requirement 10).
  it("shows a per-card error state with a working retry action on failure", () => {
    configureQueries({ error: true });
    render(<Index />);

    // Metric values are replaced by the shared ErrorState on every card.
    METRIC_TITLES.forEach((title) => {
      expect(screen.queryByText(title)).not.toBeInTheDocument();
    });

    const errorHeadings = screen.getAllByText("Something went wrong");
    expect(errorHeadings).toHaveLength(METRIC_TITLES.length);

    const retryButtons = screen.getAllByRole("button", { name: "Retry" });
    expect(retryButtons).toHaveLength(METRIC_TITLES.length);

    // The recovery action is wired to the stats query's refetch.
    fireEvent.click(retryButtons[0]);
    expect(refetchStats).toHaveBeenCalledTimes(1);
  });

  // Requirement 12.6 — below 768px the metric grid is a single column with no
  // horizontal overflow. Verified structurally via the mobile-first grid
  // classes (single column at base, multi-column only at md+ breakpoints).
  it("arranges metric cards in a single column below 768px", () => {
    render(<Index />);

    const grid = screen.getByText("Total Messages").closest("div.grid");
    expect(grid).not.toBeNull();
    // Base (mobile, <768px) is a single column.
    expect(grid!.className).toContain("grid-cols-1");
    // Multiple columns only kick in at md (768px) and larger.
    expect(grid!.className).toContain("md:grid-cols-2");
  });

  // Requirement 12.5 — under RTL the document mirrors so metric-card order
  // follows RTL reading order (the grid inherits document direction).
  it("mirrors to RTL when the active language is Arabic", async () => {
    await i18n.changeLanguage("ar");
    render(<Index />);

    expect(document.documentElement.dir).toBe("rtl");
    // Cards still render (order mirrors automatically via inherited direction).
    const grid = screen.getByText("Total Messages").closest("div.grid");
    expect(grid).not.toBeNull();
    METRIC_TITLES.forEach((title) => {
      expect(screen.getByText(title)).toBeInTheDocument();
    });
  });

  // Accessibility — the loaded dashboard has no detectable axe violations.
  // The `heading-order` rule is scoped out here: StatsCard renders each metric
  // value as an <h3>, which is a component-level heading-semantics choice.
  // Page-wide heading structure is validated separately (Property 5, task 18.4).
  it("has no axe-detectable accessibility violations when loaded", async () => {
    const { container } = render(<Index />);
    const results = await axe(container, {
      rules: { "heading-order": { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });
});
