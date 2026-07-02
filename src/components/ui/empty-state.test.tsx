// Unit tests for the EmptyState shared feedback component.
//
// Verifies the token-styled empty view explains the absence of records and
// surfaces an optional next action, and is discoverable by assistive tech.
//
// Requirements: 10.4, 10.7
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRef } from "react";

import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders the title", () => {
    render(<EmptyState title="No sessions yet" />);
    expect(screen.getByText("No sessions yet")).toBeInTheDocument();
  });

  it("renders the optional description explaining the absence", () => {
    render(
      <EmptyState
        title="No sessions yet"
        description="Sessions will appear here once customers start chatting."
      />,
    );
    expect(
      screen.getByText(
        "Sessions will appear here once customers start chatting.",
      ),
    ).toBeInTheDocument();
  });

  it("omits the description when not provided", () => {
    render(<EmptyState title="No sessions yet" data-testid="empty" />);
    // Only the title paragraph should be present.
    expect(screen.getByTestId("empty").querySelectorAll("p")).toHaveLength(1);
  });

  it("renders the optional next action", () => {
    render(
      <EmptyState
        title="No documents"
        action={<button type="button">Add document</button>}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Add document" }),
    ).toBeInTheDocument();
  });

  it("exposes a status role for assistive technology", () => {
    render(<EmptyState title="No records" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("hides the decorative icon from assistive technology", () => {
    render(
      <EmptyState
        title="No records"
        icon={<svg data-testid="icon" />}
        data-testid="empty"
      />,
    );
    const iconWrapper = screen.getByTestId("icon").parentElement;
    expect(iconWrapper).toHaveAttribute("aria-hidden", "true");
  });

  it("forwards className and ref", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <EmptyState title="No records" className="custom-class" ref={ref} />,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current).toHaveClass("custom-class");
  });
});
