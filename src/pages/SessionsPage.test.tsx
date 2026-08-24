import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@/test-utils/render";
import { axe, toHaveNoViolations } from "jest-axe";
import SessionsPage from "./SessionsPage";
import { useAuth } from "@/hooks/useAuth";
import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryClient,
} from "@tanstack/react-query";
import { mockMessages } from "@/test-utils/fixtures";
import type { Breakpoint } from "@/hooks/use-breakpoint";

expect.extend(toHaveNoViolations);

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: vi.fn(() => vi.fn()),
  };
});

// Control the active breakpoint so the responsive split-view behaviour
// (Requirement 14.6) can be exercised deterministically.
const mockBreakpoint = vi.fn<[], Breakpoint>(() => 1440);
vi.mock("@/hooks/use-breakpoint", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/use-breakpoint")>(
    "@/hooks/use-breakpoint",
  );
  return {
    ...actual,
    useBreakpoint: () => mockBreakpoint(),
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
  setQueryData: vi.fn(),
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
        on: vi.fn(() => ({
          subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
        })),
        subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
      })),
    })),
    removeChannel: vi.fn(),
  },
}));

// A masked/embedded LTR value (phone number) used to verify bidi isolation.
const PHONE = "+970591234567";

// Strip the Unicode isolate characters that BidiText injects so text matching
// works, while still letting us assert the isolates are present.
const stripIsolates = (str: string) =>
  str.replace(/[\u2066\u2067\u2068\u2069]/g, "").trim();

const sessionWithData = {
  id: "session-1",
  channel: "whatsapp",
  status: "active",
  started_at: new Date().toISOString(),
  employee_id: "employee-1",
  main_type_id: null,
  wait_time_seconds: 30,
  duration_seconds: 300,
  satisfaction_score: null,
  customer: {
    id: "customer-1",
    name: "John Doe",
    phone: PHONE,
    email: "john@example.com",
  },
  employee: {
    id: "employee-1",
    profile: { first_name: "Agent", last_name: "One" },
  },
};

interface ConfigureOptions {
  sessions?: unknown[];
  messages?: unknown[];
  sessionsError?: boolean;
}

// Dispatch the mocked useQuery by its queryKey so the sessions list and the
// selected-session transcript can be driven independently.
function configureQueries({
  sessions = [],
  messages = [],
  sessionsError = false,
}: ConfigureOptions = {}) {
  (useQuery as ReturnType<typeof vi.fn>).mockImplementation(
    (options: { queryKey: unknown[] }) => {
      const key = Array.isArray(options?.queryKey)
        ? options.queryKey[0]
        : undefined;
      switch (key) {
        case "sessions":
          return {
            data: sessions,
            isLoading: false,
            isError: sessionsError,
            refetch: vi.fn(),
          };
        case "session-messages":
          return {
            data: messages,
            isLoading: false,
            isError: false,
            refetch: vi.fn(),
          };
        default:
          return {
            data: [],
            isLoading: false,
            isError: false,
            refetch: vi.fn(),
          };
      }
    },
  );
}

function renderPage(options?: ConfigureOptions) {
  configureQueries(options);
  const queryClient = createTestQueryClient();
  return render(<SessionsPage />, { queryClient });
}

describe("SessionsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBreakpoint.mockReturnValue(1440);
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      userRole: "admin",
      user: { id: "123" },
    });
    (useMutation as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    });
    (useQueryClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockQueryClient,
    );
    configureQueries();
  });

  it("renders the sessions page title", () => {
    renderPage();
    expect(screen.getByText("Active AI Sessions")).toBeInTheDocument();
  });

  it("displays the labelled search input", () => {
    renderPage();
    expect(
      screen.getByPlaceholderText(
        "Search by customer, phone, email, or agent...",
      ),
    ).toBeInTheDocument();
  });

  describe("empty states", () => {
    it("shows the no-sessions Empty_State when the list is empty (14.3)", () => {
      renderPage({ sessions: [] });
      expect(screen.getByText("No sessions available")).toBeInTheDocument();
      expect(
        screen.getByText("There are no sessions matching the current filters."),
      ).toBeInTheDocument();
    });

    it("shows the no-selection Empty_State when nothing is selected (14.2)", () => {
      renderPage({ sessions: [] });
      expect(screen.getByText("No conversation selected")).toBeInTheDocument();
      expect(
        screen.getByText(/Select a session from the list/),
      ).toBeInTheDocument();
    });
  });

  describe("bidi masked values (14.4)", () => {
    it("renders embedded LTR phone values wrapped in Unicode isolates", () => {
      renderPage({ sessions: [sessionWithData] });

      const matches = screen.getAllByText(PHONE, {
        normalizer: stripIsolates,
      });
      expect(matches.length).toBeGreaterThan(0);

      const bidiEl = matches[0];
      // BidiText renders an explicit dir="ltr" span so the value keeps LTR
      // order under RTL.
      expect(bidiEl).toHaveAttribute("dir", "ltr");
      // The raw text still contains the LTR isolate characters.
      expect(bidiEl.textContent).toMatch(/[\u2066-\u2069]/);
    });
  });

  describe("authorship non-color cue (14.7)", () => {
    it("labels each message with a textual author cue (customer vs agent)", async () => {
      const inbound = { ...mockMessages[0], direction: "inbound" };
      const outbound = { ...mockMessages[1], direction: "outbound" };
      renderPage({
        sessions: [sessionWithData],
        messages: [inbound, outbound],
      });

      // Inbound message -> customer authorship label paired with the bubble.
      const inboundText = await screen.findByText("Hello, I need help");
      const inboundWrapper = inboundText.closest("div.flex.flex-col");
      expect(inboundWrapper).not.toBeNull();
      expect(
        within(inboundWrapper as HTMLElement).getByText("Customer"),
      ).toBeInTheDocument();

      // Outbound message on an assigned session -> agent authorship label.
      const outboundText = screen.getByText("How can I help you?");
      const outboundWrapper = outboundText.closest("div.flex.flex-col");
      expect(outboundWrapper).not.toBeNull();
      expect(
        within(outboundWrapper as HTMLElement).getByText("Agent"),
      ).toBeInTheDocument();
    });
  });

  describe("responsive split view (14.6)", () => {
    it("shows both list and detail side by side at >=768px", () => {
      mockBreakpoint.mockReturnValue(1440);
      renderPage({ sessions: [sessionWithData] });

      // Both panes of the console are present and separately labelled. They
      // are regions rather than headed panels: the rail's own header already
      // names what it holds.
      expect(
        screen.getByRole("region", { name: "Sessions Overview" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("region", { name: "Conversation Details" }),
      ).toBeInTheDocument();
    });

    it("shows only the list view below 768px until a session is opened", () => {
      mockBreakpoint.mockReturnValue(375);
      renderPage({ sessions: [sessionWithData] });

      // The list is the active navigable view...
      expect(
        screen.getByRole("region", { name: "Sessions Overview" }),
      ).toBeInTheDocument();
      // ...and the detail view is not rendered alongside it.
      expect(
        screen.queryByRole("region", { name: "Conversation Details" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("has no detectable WCAG violations on the empty view", async () => {
      const { container } = renderPage({ sessions: [] });

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
