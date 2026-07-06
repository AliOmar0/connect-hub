import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test-utils/render";
import { axe, toHaveNoViolations } from "jest-axe";
import BackendTester from "./BackendTester";
import { notifySuccess, notifyError } from "@/lib/feedback";
import i18n from "@/i18n";

expect.extend(toHaveNoViolations);

// The App_Shell frame is exercised elsewhere; render only the page body inside
// a single main landmark so the content forms a well-formed document for axe.
vi.mock("@/components/layout/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));

// Success/error results are routed through the shared feedback helper
// (Requirement 23.2 / 10.3, 10.8). Mock it so we can assert the mechanism.
vi.mock("@/lib/feedback", () => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
  dismissFeedback: vi.fn(),
}));

const notifySuccessMock = notifySuccess as unknown as ReturnType<typeof vi.fn>;
const notifyErrorMock = notifyError as unknown as ReturnType<typeof vi.fn>;

// --- Network layer -----------------------------------------------------------

const statusFixture = {
  ok: true,
  env: "test",
  model: "gpt-test",
  ttsProvider: "edge",
  redisHealthy: true,
  mediaConfigured: true,
  vapiSignatureValidation: true,
  providers: {
    openrouter: true,
    supabase: true,
    vapi: true,
    whatsappOtp: true,
    azureTts: false,
    elevenlabs: false,
    edgeTts: true,
  },
};

const voiceFixture = {
  userText: "بدي اعرف رصيدي",
  aiText: "رصيدك الحالي هو ١٠٠ شيكل",
  ttsProvider: "edge",
  // Keep audio null so the component does not attempt media playback in jsdom.
  audio: null,
};

let statusOk = true;
let voiceOk = true;

beforeEach(() => {
  vi.clearAllMocks();
  statusOk = true;
  voiceOk = true;

  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url.includes("/api/test/status")) {
      return Promise.resolve({
        ok: statusOk,
        status: statusOk ? 200 : 503,
        json: () => Promise.resolve(statusFixture),
      } as Response);
    }

    if (url.includes("/api/test/voice")) {
      return Promise.resolve({
        ok: voiceOk,
        status: voiceOk ? 200 : 500,
        json: () => Promise.resolve(voiceOk ? voiceFixture : { error: "boom" }),
      } as Response);
    }

    // Default: chat / tts / anything else resolves to an empty ok response.
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ content: "ok" }),
    } as Response);
  }) as unknown as typeof fetch;
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (i18n.language !== "en") {
    await i18n.changeLanguage("en");
  }
});

// Render and wait for the on-mount status fetch to settle so we don't assert
// mid-update.
async function renderTester() {
  const result = render(<BackendTester />);
  await screen.findByText("Backend Health");
  return result;
}

describe("BackendTester", () => {
  // Requirement 23.1 — text, controls, and containers apply the design-token
  // color/typography/spacing utilities rather than literal values.
  it("styles headings, controls, and containers with design tokens (23.1)", async () => {
    await renderTester();

    const heading = screen.getByRole("heading", {
      name: "Backend Tester",
      level: 1,
    });
    expect(heading.className).toContain("text-foreground");
    expect(screen.getByText(/Exercise the Node API/i).className).toContain(
      "text-muted-foreground",
    );

    // The API-endpoint chip uses surface + muted-foreground tokens.
    const endpoint = screen.getByText("http://localhost:3001");
    expect(endpoint.className).toContain("bg-muted");
    expect(endpoint.className).toContain("text-muted-foreground");
  });

  // Requirement 23.2 — a successful operation surfaces its result through the
  // shared feedback mechanism (a single toast helper).
  it("routes a successful voice simulation through the shared success feedback (23.2)", async () => {
    await renderTester();

    fireEvent.click(screen.getByRole("button", { name: /simulate/i }));

    await waitFor(() => {
      expect(notifySuccessMock).toHaveBeenCalledWith("Voice turn simulated");
    });
    expect(notifyErrorMock).not.toHaveBeenCalled();

    // The result is also rendered in the page for the caller to read.
    expect(
      await screen.findByText("رصيدك الحالي هو ١٠٠ شيكل"),
    ).toBeInTheDocument();
  });

  // Requirement 23.2 — a failed operation surfaces its error through the same
  // shared feedback mechanism.
  it("routes a failed voice simulation through the shared error feedback (23.2)", async () => {
    voiceOk = false;
    await renderTester();

    fireEvent.click(screen.getByRole("button", { name: /simulate/i }));

    await waitFor(() => {
      expect(notifyErrorMock).toHaveBeenCalled();
    });
    expect(notifySuccessMock).not.toHaveBeenCalled();
  });

  // Requirement 23.2 — when the health probe fails, the page presents a shared
  // Error_State with a recovery action (per Requirement 10).
  it("shows a recoverable Error_State when the health probe fails (23.2)", async () => {
    statusOk = false;
    render(<BackendTester />);

    // The shared ErrorState (title + retry) stands in for the failed panel.
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Retry" });
    expect(retry).toBeInTheDocument();

    // Recover: retrying re-issues the status probe.
    const callsBefore = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      .length;
    statusOk = true;
    fireEvent.click(retry);
    await waitFor(() => {
      expect(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length,
      ).toBeGreaterThan(callsBefore);
    });
  });

  // Requirement 23.3 — every interactive control is keyboard reachable and
  // carries a non-empty accessible name (buttons, inputs, and the icon-only
  // chat send control are all named).
  it("gives every interactive control a non-empty accessible name (23.3)", async () => {
    await renderTester();

    // Buttons expose text or aria-label names.
    expect(
      screen.getByRole("button", { name: /refresh/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /simulate/i }),
    ).toBeInTheDocument();

    // Voice inputs are labelled (aria-label), so they are reachable by name.
    expect(
      screen.getByRole("textbox", {
        name: "Caller phone (e.g. +970599123456)",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "What the caller says..." }),
    ).toBeInTheDocument();

    // No control is left without an accessible name.
    screen.getAllByRole("button").forEach((btn) => {
      expect(btn).toHaveAccessibleName();
    });
  });

  it("has no axe-detectable accessibility violations when loaded (23.1, 23.3)", async () => {
    const { container } = await renderTester();
    const results = await axe(container, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
    });
    expect(results).toHaveNoViolations();
  });
});
