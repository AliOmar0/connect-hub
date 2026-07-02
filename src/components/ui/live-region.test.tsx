// Unit tests for the LiveRegion status announcer.
//
// Verifies the visually-hidden ARIA live region mirrors its message to
// assistive technology, defaults to a polite status role, honours an
// assertive/alert configuration, and updates when the message changes.
//
// Requirements: 5.4, 10.6, 10.8
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRef } from "react";

import { LiveRegion } from "./live-region";

describe("LiveRegion", () => {
  it("announces the current message", () => {
    render(<LiveRegion message="Content loaded" />);
    expect(screen.getByRole("status")).toHaveTextContent("Content loaded");
  });

  it("defaults to a polite status region", () => {
    render(<LiveRegion message="Loading content" />);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveAttribute("aria-atomic", "true");
  });

  it("supports an assertive alert configuration", () => {
    render(
      <LiveRegion
        message="Failed to load content"
        politeness="assertive"
        role="alert"
      />,
    );
    const region = screen.getByRole("alert");
    expect(region).toHaveAttribute("aria-live", "assertive");
  });

  it("updates the announced text when the message changes", () => {
    const { rerender } = render(<LiveRegion message="Loading content" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading content");

    rerender(<LiveRegion message="Content loaded" />);
    expect(screen.getByRole("status")).toHaveTextContent("Content loaded");
  });

  it("renders an empty region without announcing when message is empty", () => {
    render(<LiveRegion message="" />);
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("is present in the DOM but visually hidden", () => {
    render(<LiveRegion message="hi" data-testid="live" />);
    const region = screen.getByTestId("live");
    expect(region).toBeInTheDocument();
    expect(region).toHaveClass("absolute", "overflow-hidden");
  });

  it("forwards className and ref", () => {
    const ref = createRef<HTMLDivElement>();
    render(<LiveRegion message="hi" className="custom" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current).toHaveClass("custom");
  });
});
