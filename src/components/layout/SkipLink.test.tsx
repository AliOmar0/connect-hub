import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SkipLink from "./SkipLink";

// Use i18n keys as identity so assertions do not depend on translation loading.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

describe("SkipLink", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders a link labelled via i18n", () => {
    render(<SkipLink />);
    const link = screen.getByRole("link", {
      name: "accessibility.skipToContent",
    });
    expect(link).toBeInTheDocument();
  });

  it("points to the default #main-content target", () => {
    render(<SkipLink />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "#main-content");
  });

  it("points to a custom target when targetId is provided", () => {
    render(<SkipLink targetId="content" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "#content");
  });

  it("is visually hidden until focused (sr-only)", () => {
    render(<SkipLink />);
    expect(screen.getByRole("link")).toHaveClass("sr-only");
  });

  it("moves keyboard focus to the target region on click", () => {
    const main = document.createElement("main");
    main.id = "main-content";
    main.textContent = "Main region";
    document.body.appendChild(main);

    render(<SkipLink />);
    const link = screen.getByRole("link");
    fireEvent.click(link);

    expect(document.activeElement).toBe(main);
  });

  it("makes a non-focusable target focusable via a temporary tabindex", () => {
    const main = document.createElement("main");
    main.id = "main-content";
    document.body.appendChild(main);

    render(<SkipLink />);
    fireEvent.click(screen.getByRole("link"));

    expect(main).toHaveAttribute("tabindex", "-1");
    expect(document.activeElement).toBe(main);
  });

  it("moves focus on Enter key activation", () => {
    const main = document.createElement("main");
    main.id = "main-content";
    document.body.appendChild(main);

    render(<SkipLink />);
    const link = screen.getByRole("link");
    fireEvent.keyDown(link, { key: "Enter" });

    expect(document.activeElement).toBe(main);
  });

  it("does not throw when the target is missing", () => {
    render(<SkipLink />);
    expect(() => fireEvent.click(screen.getByRole("link"))).not.toThrow();
  });
});
