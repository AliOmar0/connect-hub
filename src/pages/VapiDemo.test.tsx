import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test-utils/render";
import { axe, toHaveNoViolations } from "jest-axe";
import VapiDemo from "./VapiDemo";
import { notifySuccess, notifyError } from "@/lib/feedback";
import i18n from "@/i18n";

expect.extend(toHaveNoViolations);

// The Vapi web SDK is a browser-only dependency; stub it so the module resolves
// without touching real telephony infrastructure.
vi.mock("@vapi-ai/web", () => ({
  default: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
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
          Promise.resolve(
            callOk ? { sid: "call-123" } : { error: "call failed" },
          ),
      } as Response);
    }

    if (url.includes("/api/vapi/config")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ publicKey: "pk_test", assistantId: "asst_1" }),
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

describe("VapiDemo", () => {
  // Requirement 23.1 — text, controls, and containers apply design-token
  // color/typography/spacing utilities rather than literal values.
  it("styles headings and status with design tokens (23.1)", () => {
    render(<VapiDemo />);

    const heading = screen.getByRole("heading", {
      name: "Connect Hub AI",
      level: 1,
    });
    expect(heading.className).toContain("text-foreground");
    expect(screen.getByText("Vapi Voice Gateway for PIB").className).toContain(
      "text-muted-foreground",
    );

    // The connection indicator conveys state through a status role + tokens
    // (non-color cue is the call status text), not color alone.
    const statusPill = screen.getByRole("status");
    expect(statusPill.textContent).toMatch(/Voice:/);
    expect(statusPill.className).toContain("text-status-error");
  });

  // Requirement 23.2 — a successful operation surfaces its result through the
  // shared success feedback mechanism.
  it("routes a successful call through the shared success feedback (23.2)", async () => {
    render(<VapiDemo />);

    fireEvent.change(screen.getByLabelText("Place an outbound AI call"), {
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
    render(<VapiDemo />);

    fireEvent.change(screen.getByLabelText("Place an outbound AI call"), {
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
    render(<VapiDemo />);

    // The voice number field is labelled (label htmlFor -> input id).
    expect(
      screen.getByLabelText("Place an outbound AI call"),
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
    const { container } = render(<VapiDemo />);
    const results = await axe(container, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
    });
    expect(results).toHaveNoViolations();
  });
});
