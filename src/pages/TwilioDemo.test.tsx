import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test-utils/render";
import { axe, toHaveNoViolations } from "jest-axe";
import TwilioDemo from "./TwilioDemo";
import { notifySuccess, notifyError } from "@/lib/feedback";
import i18n from "@/i18n";

expect.extend(toHaveNoViolations);

// The Twilio Voice SDK is a browser-only dependency; stub it so the module
// resolves without touching real telephony infrastructure.
vi.mock("@twilio/voice-sdk", () => ({
  Device: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    register: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Success/error results route through the shared feedback helper
// (Requirement 23.2 / 10.3, 10.8). Mock it so we can assert the mechanism.
vi.mock("@/lib/feedback", () => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
  dismissFeedback: vi.fn(),
}));

const notifySuccessMock = notifySuccess as unknown as ReturnType<typeof vi.fn>;
const notifyErrorMock = notifyError as unknown as ReturnType<typeof vi.fn>;

let callOk = true;

beforeEach(() => {
  vi.clearAllMocks();
  callOk = true;

  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes("/api/make-call")) {
      return Promise.resolve({
        ok: callOk,
        status: callOk ? 200 : 500,
        json: () =>
          Promise.resolve(callOk ? { sid: "CA123" } : { error: "call failed" }),
      } as Response);
    }

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

describe("TwilioDemo", () => {
  // Requirement 23.1 — text, controls, and containers apply design-token
  // color/typography/spacing utilities rather than literal values.
  it("styles headings and status with design tokens (23.1)", () => {
    render(<TwilioDemo />);

    const heading = screen.getByRole("heading", {
      name: "Connect Hub AI",
      level: 1,
    });
    expect(heading.className).toContain("text-foreground");
    expect(
      screen.getByText("Premium Voice Gateway for PIB").className,
    ).toContain("text-muted-foreground");

    // The connection indicator conveys state through a status role + tokens
    // (non-color cue is the SDK status text), not color alone.
    const statusPill = screen.getByRole("status");
    expect(statusPill.textContent).toMatch(/SDK:/);
    expect(statusPill.className).toContain("text-status-error");
  });

  // Requirement 23.2 — a successful operation surfaces its result through the
  // shared success feedback mechanism.
  it("routes a successful call through the shared success feedback (23.2)", async () => {
    render(<TwilioDemo />);

    fireEvent.change(screen.getByLabelText("Test Inbound/Outbound AI"), {
      target: { value: "+970599123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Dial Now" }));

    await waitFor(() => {
      expect(notifySuccessMock).toHaveBeenCalledWith("AI call initiated");
    });
    expect(notifyErrorMock).not.toHaveBeenCalled();
  });

  // Requirement 23.2 — a failed operation surfaces its error through the same
  // shared feedback mechanism.
  it("routes a failed call through the shared error feedback (23.2)", async () => {
    callOk = false;
    render(<TwilioDemo />);

    fireEvent.change(screen.getByLabelText("Test Inbound/Outbound AI"), {
      target: { value: "+970599123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Dial Now" }));

    await waitFor(() => {
      expect(notifyErrorMock).toHaveBeenCalledWith("call failed");
    });
    expect(notifySuccessMock).not.toHaveBeenCalled();
  });

  // Requirement 23.3 — every interactive control is keyboard reachable and
  // carries a non-empty accessible name.
  it("gives every interactive control a non-empty accessible name (23.3)", () => {
    render(<TwilioDemo />);

    // The voice number field is labelled (label htmlFor -> input id).
    expect(
      screen.getByLabelText("Test Inbound/Outbound AI"),
    ).toBeInTheDocument();

    // Tabs and the dial control expose text names.
    expect(
      screen.getByRole("tab", { name: "AI Voice Call" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Dial Now" }),
    ).toBeInTheDocument();

    // No button is left without an accessible name.
    screen.getAllByRole("button").forEach((btn) => {
      expect(btn).toHaveAccessibleName();
    });
  });

  it("has no axe-detectable accessibility violations when loaded (23.1, 23.3)", async () => {
    const { container } = render(<TwilioDemo />);
    const results = await axe(container, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
    });
    expect(results).toHaveNoViolations();
  });
});
