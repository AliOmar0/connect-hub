// Unit tests for the top-level ErrorBoundary.
//
// Verifies that a render failure in the boundary's subtree is caught and
// replaced with a token-styled ErrorState that exposes a human-readable
// failure and a recovery action, rather than crashing the whole tree.
//
// Requirements: 10.4
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Use i18n keys as identity so assertions do not depend on translation loading.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import ErrorBoundary from "./ErrorBoundary";

function Boom(): JSX.Element {
  throw new Error("kaboom");
}

describe("ErrorBoundary", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // React logs caught render errors; silence it to keep test output clean.
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("renders children when no error is thrown", () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("renders a token-styled ErrorState with a recovery action on error", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    // Shared ErrorState carries role="alert" for assistive technology.
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("feedback.boundaryTitle")).toBeInTheDocument();
    expect(
      screen.getByText("feedback.boundaryDescription"),
    ).toBeInTheDocument();

    // A recovery action is present (Requirement 10.4).
    expect(
      screen.getByRole("button", { name: "feedback.reload" }),
    ).toBeInTheDocument();
  });

  it("supports a custom fallback receiving a reset callback", () => {
    render(
      <ErrorBoundary fallback={() => <p>custom fallback</p>}>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText("custom fallback")).toBeInTheDocument();
  });

  it("invokes the recovery action when the retry control is activated", () => {
    const reloadSpy = vi.fn();
    const original = window.location;
    // window.location.reload is not implemented in jsdom; stub it.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, reload: reloadSpy },
    });

    try {
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      );

      fireEvent.click(screen.getByRole("button", { name: "feedback.reload" }));

      expect(reloadSpy).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: original,
      });
    }
  });
});
