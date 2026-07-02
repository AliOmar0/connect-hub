// Unit tests for the ErrorState shared feedback component.
//
// Verifies the token-styled error view presents a human-readable failure and a
// recovery action, defaults the retry label via i18n, and is announced to AT.
//
// Requirements: 10.4, 10.7
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createRef } from "react";

// Use i18n keys as identity so assertions do not depend on translation loading.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { ErrorState } from "./error-state";

describe("ErrorState", () => {
  it("renders the title and human-readable description", () => {
    render(
      <ErrorState
        title="Something went wrong"
        description="We couldn't load the sessions."
      />,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByText("We couldn't load the sessions."),
    ).toBeInTheDocument();
  });

  it("renders a retry recovery action when onRetry is provided", () => {
    const onRetry = vi.fn();
    render(<ErrorState title="Failed" onRetry={onRetry} />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("defaults the retry label via i18n", () => {
    render(<ErrorState title="Failed" onRetry={() => {}} />);
    expect(
      screen.getByRole("button", { name: "feedback.retry" }),
    ).toBeInTheDocument();
  });

  it("honours an explicit retryLabel override", () => {
    render(
      <ErrorState title="Failed" onRetry={() => {}} retryLabel="Try again" />,
    );
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("omits the retry control when onRetry is not provided", () => {
    render(<ErrorState title="Failed" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("exposes an alert role for assistive technology", () => {
    render(<ErrorState title="Failed" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("hides the decorative icon from assistive technology", () => {
    render(<ErrorState title="Failed" data-testid="error" />);
    const svg = screen.getByTestId("error").querySelector("svg");
    expect(svg?.parentElement).toHaveAttribute("aria-hidden", "true");
  });

  it("forwards className and ref", () => {
    const ref = createRef<HTMLDivElement>();
    render(<ErrorState title="Failed" className="custom-class" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current).toHaveClass("custom-class");
  });
});
