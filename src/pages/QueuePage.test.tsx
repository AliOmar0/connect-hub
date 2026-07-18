import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test-utils/render";
import { axe, toHaveNoViolations } from "jest-axe";
import { toast } from "sonner";
import QueuePage from "./QueuePage";

expect.extend(toHaveNoViolations);

// Success/error confirmations are routed through the shared sonner-based
// feedback helper; mock the library so we can assert the confirmation
// (Requirement 15.4) and the recoverable error (Requirement 15.5) directly.
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

// The App_Shell frame is exercised elsewhere; render only the page body.
vi.mock("@/components/layout/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

// The realtime subscription is a side effect unrelated to these assertions.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "test-access-token" } },
        error: null,
      }),
    },
    channel: vi.fn(() => ({
      on: vi.fn(() => ({ subscribe: vi.fn(() => ({})) })),
    })),
    removeChannel: vi.fn(),
  },
}));

interface QueueSession {
  id: string;
  channel: string;
  customer_name: string | null;
  customer_phone: string | null;
  last_message: string;
  status: string;
  started_at: string;
  wait_time_seconds: number | null;
  main_type_id: string | null;
}

const sampleSession: QueueSession = {
  id: "s-1-abcdef01",
  channel: "whatsapp",
  customer_name: "Test Customer",
  customer_phone: "0599123456",
  last_message: "I need help with account 12345678",
  status: "escalated",
  started_at: new Date().toISOString(),
  wait_time_seconds: 30,
  main_type_id: null,
};

// Drive the mocked network layer. Real react-query runs so the accept
// mutation's success/error callbacks (confirmation, removal, retention) fire.
let currentSessions: QueueSession[] = [];
let acceptSucceeds = true;
const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  currentSessions = [];
  acceptSucceeds = true;

  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "PATCH") {
      return Promise.resolve({
        ok: acceptSucceeds,
        json: () => Promise.resolve({ id: "s-1-abcdef01", status: "active" }),
      } as Response);
    }
    // GET escalation queue
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(currentSessions),
    } as Response);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

function renderQueue(sessions: QueueSession[] = [], accept = true) {
  currentSessions = sessions;
  acceptSucceeds = accept;
  return render(<QueuePage />);
}

describe("QueuePage", () => {
  it("renders the queue title", async () => {
    renderQueue([]);
    expect(
      await screen.findByRole("heading", { name: "Escalation Queue" }),
    ).toBeInTheDocument();
  });

  // Requirement 15.3: empty state when no escalations await handoff.
  it("shows the Empty_State when the queue is empty", async () => {
    renderQueue([]);
    expect(
      await screen.findByText("No escalations awaiting handoff"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No sessions are waiting for handoff."),
    ).toBeInTheDocument();
  });

  // Requirement 15.1: waiting context (duration + originating session ref).
  it("presents each escalation with its waiting context", async () => {
    renderQueue([sampleSession]);
    expect(await screen.findByText("Test Customer")).toBeInTheDocument();
    // Waiting duration is rendered as text ("Waiting {{duration}}").
    expect(screen.getByText(/^Waiting\s+\d+:\d{2}$/)).toBeInTheDocument();
    // Originating session reference is shown (first 8 chars of the id).
    expect(screen.getByText(/#s-1-abcd/)).toBeInTheDocument();
  });

  // Requirement 15.2: SLA countdown is a text value, not color-only.
  it("renders the SLA countdown as a text value with an accessible label", async () => {
    renderQueue([sampleSession]);
    await screen.findByText("Test Customer");

    const slaBadge = screen.getByLabelText(/Service level:/);
    expect(slaBadge).toBeInTheDocument();
    // The remaining time is exposed as a text value (M:SS), not color alone.
    expect(slaBadge.textContent).toMatch(/\d+:\d{2}/);
  });

  // Requirement 15: sensitive values are masked in the card presentation.
  it("masks customer phone and account digits in the card", async () => {
    renderQueue([sampleSession]);
    expect(await screen.findByText("Test Customer")).toBeInTheDocument();
    expect(screen.queryByText(/12345678/)).not.toBeInTheDocument();
    expect(screen.queryByText(/0599123456/)).not.toBeInTheDocument();
  });

  // Requirement 15.6: accept control meets the 44px touch-target minimum.
  it("renders the accept control with a 44px touch target", async () => {
    renderQueue([sampleSession]);
    await screen.findByText("Test Customer");

    const acceptButton = screen.getByRole("button", { name: "Accept" });
    expect(acceptButton.className).toContain("touch-target");
  });

  // Requirement 15.4: accepting confirms by name and removes from the queue.
  it("confirms the accepted escalation by name and removes it", async () => {
    renderQueue([sampleSession], true);
    await screen.findByText("Test Customer");

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    // Optimistically removed from the presentation.
    await waitFor(() =>
      expect(screen.queryByText("Test Customer")).not.toBeInTheDocument(),
    );

    // Confirmation identifies the accepted escalation.
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "You accepted Test Customer's session.",
        undefined,
      ),
    );
  });

  // Requirement 15.5: accept failure retains the escalation and offers recovery.
  it("retains the escalation and offers recovery when accept fails", async () => {
    renderQueue([sampleSession], false);
    await screen.findByText("Test Customer");

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    // The failed escalation is restored to the queue presentation.
    await waitFor(() =>
      expect(screen.getByText("Test Customer")).toBeInTheDocument(),
    );

    // A recoverable error is surfaced with a retry action.
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Could not accept the escalation. It is still in the queue.",
        expect.objectContaining({
          action: expect.objectContaining({ label: "Retry" }),
        }),
      ),
    );
  });

  describe("accessibility", () => {
    it("has no detectable WCAG violations on the empty view", async () => {
      const { container } = renderQueue([]);
      await screen.findByText("No escalations awaiting handoff");

      const results = await axe(container, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
        },
      });

      expect(results).toHaveNoViolations();
    });

    it("has no detectable WCAG violations with escalation cards", async () => {
      const { container } = renderQueue([sampleSession]);
      await screen.findByText("Test Customer");

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
