import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@/test-utils/render";
import { useQuery } from "@tanstack/react-query";
import { axe, toHaveNoViolations } from "jest-axe";
import AnalyticsPage from "./AnalyticsPage";
import i18n from "@/i18n";

expect.extend(toHaveNoViolations);

// --- Module mocks -----------------------------------------------------------

// Drive each visualization's data view deterministically by mocking useQuery.
// AnalyticsPage issues three queries:
//   - "analytics-summary" backs the four summary metric cards,
//   - "analytics" backs BOTH the activity area chart and the satisfaction
//     line chart (they share chartData),
//   - "analytics-channels" backs the channel-distribution pie + legend.
// Dispatching by queryKey lets us exercise the per-visualization AsyncBoundary
// states (Skeleton / EmptyState / ErrorState / loaded) in isolation without
// touching the network (Requirements 17.3, 17.4, 17.5).
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return { ...actual, useQuery: vi.fn() };
});

// The App_Shell has its own tests; here we only need a single wrapper so the
// page content forms a well-formed document for the axe scan.
vi.mock("@/components/layout/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));

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
    },
  },
}));

// --- Fixtures & helpers ------------------------------------------------------

const summaryFixture = {
  totalSessions: 42,
  completedSessions: 30,
  resolutionRate: 71.4,
  totalMessages: 100,
  totalCalls: 20,
  avgSatisfaction: "4.2",
  avgWaitTime: 120,
  avgCallDuration: 300,
};

// Raw rows as returned by the "analytics_daily" query; the page maps these
// into chartData for the activity and satisfaction charts.
const analyticsFixture = [
  {
    date: "2024-01-01",
    total_sessions: 10,
    total_messages: 50,
    total_calls: 5,
    avg_satisfaction_score: 4.2,
  },
  {
    date: "2024-01-02",
    total_sessions: 12,
    total_messages: 60,
    total_calls: 6,
    avg_satisfaction_score: 4.5,
  },
];

// Channel rows already carry a design-token color (as produced by the page's
// queryFn from CHANNEL_COLOR_TOKENS) so the legend swatch reflects a token.
const channelFixture = [
  {
    channel: "whatsapp",
    value: 60,
    count: 6,
    color: "hsl(var(--chart-success))",
  },
  {
    channel: "voice",
    value: 40,
    count: 4,
    color: "hsl(var(--chart-warning))",
  },
];

interface QueryState {
  loading?: boolean;
  error?: boolean;
  data?: unknown;
}

// Per-query refetch spies so retry wiring can be asserted independently.
const refetchByKey: Record<string, ReturnType<typeof vi.fn>> = {
  "analytics-summary": vi.fn(),
  analytics: vi.fn(),
  "analytics-channels": vi.fn(),
};

/**
 * Configure the mocked useQuery per visualization. Any query not overridden
 * resolves to its loaded fixture, so a single test can put one visualization
 * into loading/empty/error while the others stay loaded.
 */
function configureQueries(overrides: Record<string, QueryState> = {}) {
  const config: Record<string, QueryState> = {
    "analytics-summary": { data: summaryFixture },
    analytics: { data: analyticsFixture },
    "analytics-channels": { data: channelFixture },
    ...overrides,
  };

  (useQuery as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (options: { queryKey: unknown[] }) => {
      const key = String(options.queryKey[0]);
      const state = config[key] ?? { data: [] };
      return {
        data: state.loading || state.error ? undefined : state.data,
        isLoading: !!state.loading,
        isError: !!state.error,
        refetch: refetchByKey[key] ?? vi.fn(),
      };
    },
  );
}

const CHART_TITLES = [
  "Activity Over Time",
  "Channel Distribution",
  "Satisfaction Score Trend",
];

describe("AnalyticsPage", () => {
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

  it("renders the analytics page title and subtitle", () => {
    render(<AnalyticsPage />);
    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(
      screen.getByText(/In-depth analytics and reporting/i),
    ).toBeInTheDocument();
  });

  it("displays the labelled date-range and channel selectors", () => {
    render(<AnalyticsPage />);
    expect(
      screen.getByRole("combobox", { name: "Date range" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Channel" }),
    ).toBeInTheDocument();
  });

  // Requirement 17.1 — visualizations use the design-token color, spacing, and
  // typography values. The summary cards share the Card primitive's token
  // classes; the same primitive wraps every chart.
  it("renders summary metric cards using uniform design-token containers (17.1)", () => {
    render(<AnalyticsPage />);

    const titles = [
      "Total Sessions",
      "Resolution Rate",
      "Avg Satisfaction",
      "Avg Wait Time",
    ];
    const classNames = titles.map((title) => {
      const card = screen.getByText(title).closest("div.rounded-lg");
      expect(card).not.toBeNull();
      return card!.className;
    });

    classNames.forEach((cls) => {
      expect(cls).toContain("rounded-lg"); // radius token
      expect(cls).toContain("border"); // color token
      expect(cls).toContain("bg-card"); // surface token
      expect(cls).toContain("shadow-sm"); // elevation token
    });
  });

  // Requirement 17.2 — chart legends convey series meaning with a text label
  // (not color alone) and the swatch color references a design token, keeping
  // it contrast-managed across themes.
  it("renders the channel legend with token-colored swatches and text labels (17.2)", () => {
    render(<AnalyticsPage />);

    // Text labels carry channel meaning independent of color.
    const whatsappLabel = screen.getByText("WhatsApp");
    const voiceLabel = screen.getByText("Voice");
    expect(whatsappLabel).toBeInTheDocument();
    expect(voiceLabel).toBeInTheDocument();

    // Each legend row pairs a token-driven swatch with its label + percentage.
    const legendItem = whatsappLabel.closest("li");
    expect(legendItem).not.toBeNull();
    const swatch = legendItem!.querySelector("span[aria-hidden='true']");
    expect(swatch).not.toBeNull();
    expect((swatch as HTMLElement).getAttribute("style")).toContain(
      "hsl(var(--chart-success))",
    );
    expect(within(legendItem!).getByText("60%")).toBeInTheDocument();
  });

  // Requirement 17.3 — while analytics data is loading, each visualization
  // presents a Skeleton placeholder (not stale/blank content).
  it("shows a Skeleton per visualization while all data is loading (17.3)", () => {
    configureQueries({
      "analytics-summary": { loading: true },
      analytics: { loading: true },
      "analytics-channels": { loading: true },
    });
    const { container } = render(<AnalyticsPage />);

    // Real values / chart titles are not shown while loading.
    expect(screen.queryByText("Total Sessions")).not.toBeInTheDocument();
    CHART_TITLES.forEach((title) => {
      // Chart card titles remain (headers are outside the AsyncBoundary), but
      // the chart bodies are replaced by skeletons.
      expect(screen.getByText(title)).toBeInTheDocument();
    });

    // Skeleton placeholders (aria-hidden) stand in for every loading region:
    // 4 summary-card skeletons + 3 chart skeletons.
    const skeletons = container.querySelectorAll('[aria-hidden="true"]');
    const skeletonCount = Array.from(skeletons).filter((el) =>
      (el.getAttribute("class") ?? "").includes("rounded-lg"),
    ).length;
    expect(skeletonCount).toBeGreaterThanOrEqual(7);
  });

  // Requirement 17.3 (independence) — a single visualization can be loading
  // while the others are loaded.
  it("shows a Skeleton only for the loading visualization (17.3)", () => {
    configureQueries({ "analytics-channels": { loading: true } });
    render(<AnalyticsPage />);

    // Summary + charts remain loaded.
    expect(screen.getByText("Total Sessions")).toBeInTheDocument();
    expect(screen.getByText("Activity Over Time")).toBeInTheDocument();

    // The channel visualization has no legend labels while loading.
    expect(screen.queryByText("WhatsApp")).not.toBeInTheDocument();
    expect(screen.queryByText("No data available")).not.toBeInTheDocument();
  });

  // Requirement 17.4 — when a visualization has no data for the selected scope,
  // that visualization presents an Empty_State.
  it("shows an Empty_State per visualization with no data (17.4)", () => {
    configureQueries({
      analytics: { data: [] },
      "analytics-channels": { data: [] },
    });
    render(<AnalyticsPage />);

    // Activity chart, satisfaction chart, and channel pie are all empty.
    const emptyTitles = screen.getAllByText("No data available");
    expect(emptyTitles).toHaveLength(3);
    expect(
      screen.getAllByText("There is no data for the selected scope yet."),
    ).toHaveLength(3);

    // Summary is never "empty" (it always has computed values), so it stays
    // loaded even when its own rows are absent.
    expect(screen.getByText("Total Sessions")).toBeInTheDocument();
  });

  // Requirement 17.4 (independence) — only the data-less visualization shows
  // the Empty_State; loaded visualizations are unaffected.
  it("scopes the Empty_State to the data-less visualization (17.4)", () => {
    configureQueries({ "analytics-channels": { data: [] } });
    render(<AnalyticsPage />);

    // Only the channel pie is empty (activity + satisfaction charts have data).
    expect(screen.getByText("No data available")).toBeInTheDocument();
    expect(screen.queryByText("WhatsApp")).not.toBeInTheDocument();
    // The other charts remain rendered.
    expect(screen.getByText("Activity Over Time")).toBeInTheDocument();
    expect(screen.getByText("Satisfaction Score Trend")).toBeInTheDocument();
  });

  // Requirement 17.5 — if retrieval fails, each affected visualization presents
  // an Error_State with a recovery action.
  it("shows an Error_State with a retry action per failed visualization (17.5)", () => {
    configureQueries({
      "analytics-summary": { error: true },
      analytics: { error: true },
      "analytics-channels": { error: true },
    });
    render(<AnalyticsPage />);

    // Summary (1) + activity (1) + satisfaction (1) + channel (1) = 4.
    const errorHeadings = screen.getAllByText("Couldn't load analytics");
    expect(errorHeadings).toHaveLength(4);

    const retryButtons = screen.getAllByRole("button", { name: "Retry" });
    expect(retryButtons).toHaveLength(4);
  });

  // Requirement 17.5 (independence + recovery wiring) — retry on a single
  // failed visualization re-fetches only that query.
  it("wires the channel Error_State retry to its own refetch (17.5)", () => {
    configureQueries({ "analytics-channels": { error: true } });
    render(<AnalyticsPage />);

    // Only the channel visualization failed.
    expect(screen.getByText("Couldn't load analytics")).toBeInTheDocument();
    expect(screen.getByText("Activity Over Time")).toBeInTheDocument();

    const retry = screen.getByRole("button", { name: "Retry" });
    fireEvent.click(retry);
    expect(refetchByKey["analytics-channels"]).toHaveBeenCalledTimes(1);
    expect(refetchByKey.analytics).not.toHaveBeenCalled();
  });

  // Requirement 17.6 — under RTL the document mirrors so chart axes and legends
  // follow RTL reading order (axis orientation is driven by useDirection()).
  it("mirrors to RTL and renders localized legends when Arabic is active (17.6)", async () => {
    await i18n.changeLanguage("ar");
    render(<AnalyticsPage />);

    expect(document.documentElement.dir).toBe("rtl");

    // The channel legend still renders (labels localized), and the ms-auto
    // percentage uses a logical property that follows the RTL flow.
    const legendLists = document.querySelectorAll("ul");
    expect(legendLists.length).toBeGreaterThan(0);
    const percentage = screen.getByText("60%");
    expect(percentage.className).toContain("ms-auto");
  });

  // Requirement 17.7 — below 768px multi-column visualization layouts collapse
  // to a single column. Verified structurally via mobile-first grid classes
  // (single column at base, multi-column only at md/lg+).
  it("arranges summary cards in a single column below 768px (17.7)", () => {
    render(<AnalyticsPage />);

    const grid = screen.getByText("Total Sessions").closest("div.grid");
    expect(grid).not.toBeNull();
    expect(grid!.className).toContain("grid-cols-1");
    expect(grid!.className).toContain("md:grid-cols-2");
  });

  it("arranges the chart pair in a single column below 768px (17.7)", () => {
    render(<AnalyticsPage />);

    // The activity + channel charts share a grid that is single-column at base
    // and only splits at lg (>=1024px), so it is single-column below 768px.
    const grid = screen.getByText("Activity Over Time").closest("div.grid");
    expect(grid).not.toBeNull();
    expect(grid!.className).toContain("grid-cols-1");
    expect(grid!.className).toContain("lg:grid-cols-2");
  });

  describe("accessibility", () => {
    it("has no axe-detectable violations when loaded", async () => {
      const { container } = render(<AnalyticsPage />);
      const results = await axe(container, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
        },
      });
      expect(results).toHaveNoViolations();
    });

    it("has no axe-detectable violations in the empty state", async () => {
      configureQueries({
        analytics: { data: [] },
        "analytics-channels": { data: [] },
      });
      const { container } = render(<AnalyticsPage />);
      const results = await axe(container, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
        },
      });
      expect(results).toHaveNoViolations();
    });

    it("has no axe-detectable violations in the error state", async () => {
      configureQueries({
        "analytics-summary": { error: true },
        analytics: { error: true },
        "analytics-channels": { error: true },
      });
      const { container } = render(<AnalyticsPage />);
      const results = await axe(container, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
        },
      });
      expect(results).toHaveNoViolations();
    });
  });
});
