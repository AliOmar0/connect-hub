import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test-utils/render";
import { axe, toHaveNoViolations } from "jest-axe";
import { toast } from "sonner";
import NotificationsPage from "./NotificationsPage";
import type { Notification } from "@/types/database";

expect.extend(toHaveNoViolations);

// t returns the key so assertions are locale-independent (matches sibling
// page test conventions, e.g. KnowledgePage.test.tsx).
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

// --- Controllable Supabase mock ------------------------------------------
// The query builder is chainable and thenable; the resolved value depends on
// which terminal operation (select / update / delete) started the chain. Tests
// mutate these results to simulate success and failure without faking the page
// logic itself.
type Result = { data?: unknown; error: unknown };

let selectResult: Result = { data: [], error: null };
let updateResult: Result = { error: null };
let deleteResult: Result = { error: null };

function makeBuilder() {
  let mode: "select" | "update" | "delete" = "select";
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = vi.fn(() => {
    mode = "select";
    return builder;
  });
  builder.update = vi.fn(() => {
    mode = "update";
    return builder;
  });
  builder.delete = vi.fn(() => {
    mode = "delete";
    return builder;
  });
  builder.order = vi.fn(chain);
  builder.or = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.then = (
    resolve: (v: Result) => unknown,
    reject?: (e: unknown) => unknown,
  ) => {
    const r =
      mode === "select"
        ? selectResult
        : mode === "update"
          ? updateResult
          : deleteResult;
    return Promise.resolve(r).then(resolve, reject);
  };
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => makeBuilder()),
    channel: vi.fn(() => {
      const ch: Record<string, unknown> = {};
      ch.on = vi.fn(() => ch);
      ch.subscribe = vi.fn(() => ch);
      return ch;
    }),
    removeChannel: vi.fn(),
  },
}));

// --- Test data ------------------------------------------------------------
const now = new Date().toISOString();

const unreadNotification = {
  id: "n-unread",
  user_id: "user-1",
  title: "Escalation raised",
  message: "A chat was escalated to a human agent",
  type: "warning",
  is_read: false,
  action_url: null,
  created_at: now,
} as unknown as Notification;

const readNotification = {
  id: "n-read",
  user_id: "user-1",
  title: "System update",
  message: "Maintenance completed",
  type: "info",
  is_read: true,
  action_url: null,
  created_at: now,
} as unknown as Notification;

beforeEach(() => {
  vi.clearAllMocks();
  selectResult = { data: [], error: null };
  updateResult = { error: null };
  deleteResult = { error: null };
});

describe("NotificationsPage", () => {
  // Requirement 20.2: read vs unread notifications are distinguished by a
  // non-color cue (text label + icon), not color alone.
  it("distinguishes read from unread with a non-color text cue", async () => {
    selectResult = {
      data: [unreadNotification, readNotification],
      error: null,
    };
    render(<NotificationsPage />);

    // Both notifications resolve into the list.
    expect(await screen.findByText("Escalation raised")).toBeInTheDocument();
    expect(screen.getByText("System update")).toBeInTheDocument();

    // The non-color cue is a readable label for each state.
    expect(screen.getByText("notifications.unread")).toBeInTheDocument();
    expect(screen.getByText("notifications.read")).toBeInTheDocument();
  });

  // Requirement 20.3: with no notifications the page shows an Empty_State that
  // explains the absence.
  it("shows the empty state when there are no notifications", async () => {
    selectResult = { data: [], error: null };
    render(<NotificationsPage />);

    expect(
      await screen.findByText("notifications.emptyTitle"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("notifications.emptyDescription"),
    ).toBeInTheDocument();
  });

  // Requirement 20.4: marking a notification as read updates the presentation
  // and announces the change to assistive technology.
  it("announces the read-state change to assistive technology", async () => {
    selectResult = { data: [unreadNotification], error: null };
    updateResult = { error: null };
    render(<NotificationsPage />);

    const markReadButton = await screen.findByRole("button", {
      name: "notifications.markAsRead",
    });
    fireEvent.click(markReadButton);

    // The live-region announcement is rendered after the successful update.
    expect(
      await screen.findByText("notifications.markedReadAnnouncement"),
    ).toBeInTheDocument();
  });

  // Requirement 20.6: if notification data fails to load, an Error_State with a
  // human-readable description and a recovery action is presented.
  it("shows an error state with a recovery action when loading fails", async () => {
    selectResult = { data: null, error: new Error("load failed") };
    render(<NotificationsPage />);

    expect(
      await screen.findByText("notifications.loadErrorTitle"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("notifications.loadErrorDescription"),
    ).toBeInTheDocument();
    // The shared ErrorState surfaces a retry control.
    expect(
      screen.getByRole("button", { name: "feedback.retry" }),
    ).toBeInTheDocument();
  });

  // Requirement 20.7: if marking as read fails, present an Error_State with a
  // recovery action and retain the notification's unread state.
  it("retains the unread state and offers retry when marking read fails", async () => {
    selectResult = { data: [unreadNotification], error: null };
    updateResult = { error: new Error("mark read failed") };
    render(<NotificationsPage />);

    const markReadButton = await screen.findByRole("button", {
      name: "notifications.markAsRead",
    });
    fireEvent.click(markReadButton);

    // The failure is surfaced via the shared feedback mechanism with a retry.
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "notifications.markReadFailed",
        expect.objectContaining({
          action: expect.objectContaining({ label: "feedback.retry" }),
        }),
      );
    });

    // The unread state is retained: the notification and its unread cue remain,
    // and no read announcement was made (the state was never optimistically
    // flipped).
    expect(screen.getByText("Escalation raised")).toBeInTheDocument();
    expect(screen.getByText("notifications.unread")).toBeInTheDocument();
    expect(
      screen.queryByText("notifications.markedReadAnnouncement"),
    ).not.toBeInTheDocument();
  });

  it("has no axe-detectable accessibility violations when loaded", async () => {
    selectResult = {
      data: [unreadNotification, readNotification],
      error: null,
    };
    const { container } = render(<NotificationsPage />);
    await screen.findByText("Escalation raised");

    const results = await axe(container, {
      rules: { "heading-order": { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });

  it("has no axe-detectable accessibility violations in the empty state", async () => {
    selectResult = { data: [], error: null };
    const { container } = render(<NotificationsPage />);
    await screen.findByText("notifications.emptyTitle");

    const results = await axe(container, {
      rules: { "heading-order": { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });
});
