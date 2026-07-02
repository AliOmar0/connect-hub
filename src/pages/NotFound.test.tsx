import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@/test-utils/render";
import { axe, toHaveNoViolations } from "jest-axe";
import NotFound from "./NotFound";
import { useLocation } from "react-router-dom";
import i18n from "@/i18n";

expect.extend(toHaveNoViolations);

// NotFound renders a real <Link>, so keep react-router-dom intact and stub only
// useLocation (the page logs the attempted path on mount).
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useLocation: vi.fn(),
  };
});

const mockLocation = (pathname: string) => {
  (useLocation as ReturnType<typeof vi.fn>).mockReturnValue({ pathname });
};

describe("NotFound", () => {
  afterEach(async () => {
    vi.clearAllMocks();
    // Reset direction/language so an RTL test can't leak into the next test.
    if (i18n.language !== "en") {
      await i18n.changeLanguage("en");
    }
  });

  it("renders 404 message", () => {
    mockLocation("/non-existent");
    render(<NotFound />);

    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText(/page not found/i)).toBeInTheDocument();
  });

  it("displays return to home link", () => {
    mockLocation("/non-existent");
    render(<NotFound />);

    const homeLink = screen.getByText(/return to home/i);
    expect(homeLink).toBeInTheDocument();
    expect(homeLink.closest("a")).toHaveAttribute("href", "/");
  });

  it("logs error to console", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockLocation("/test-route");

    render(<NotFound />);

    expect(consoleSpy).toHaveBeenCalledWith(
      "404 Error: User attempted to access non-existent route:",
      "/test-route",
    );

    consoleSpy.mockRestore();
  });

  // Requirement 22.1 — the message applies color, typography, and spacing
  // Design_Tokens (referenced via Tailwind token utility classes) rather than
  // hard-coded literal values.
  it("styles the message and container with design tokens (22.1)", () => {
    mockLocation("/non-existent");
    render(<NotFound />);

    // The surrounding surface uses the background color token.
    const main = screen.getByRole("main");
    expect(main.className).toContain("bg-background");

    // The 404 code, heading, and description each reference a color token.
    expect(screen.getByText("404").className).toContain("text-primary");
    expect(screen.getByText(/page not found/i).className).toContain(
      "text-foreground",
    );
    expect(
      screen.getByText(/doesn't exist or may have been moved/i).className,
    ).toContain("text-muted-foreground");
  });

  // Requirement 22.2 — the return control is a single activation target that is
  // keyboard reachable/activatable and navigates to the default landing page.
  it("exposes a single keyboard-accessible return control to the landing page (22.2)", () => {
    mockLocation("/non-existent");
    render(<NotFound />);

    // Exactly one recovery control, exposed as a link with an accessible name.
    const links = screen.getAllByRole("link", { name: /return to home/i });
    expect(links).toHaveLength(1);

    const homeLink = links[0];
    // A native anchor with an href is focusable and activatable by keyboard
    // alone (Enter), without a pointing device, in a single activation.
    expect(homeLink.tagName).toBe("A");
    expect(homeLink).toHaveAttribute("href", "/");
    expect(homeLink).not.toHaveAttribute("tabindex", "-1");
    expect(homeLink).not.toBeDisabled();
  });

  // Requirement 22.3 — content stays within the viewport width (no horizontal
  // overflow). Verified structurally via the centered, width-constrained,
  // padded layout that fits any of the four reference breakpoints.
  it("constrains content to the viewport without horizontal overflow (22.3)", () => {
    mockLocation("/non-existent");
    render(<NotFound />);

    const main = screen.getByRole("main");
    // Horizontal padding + centering keeps the block inside the viewport.
    expect(main.className).toContain("px-4");
    expect(main.className).toContain("justify-center");

    // The content column is fluid (w-full) but capped (max-w-md), so it never
    // forces the layout wider than the viewport at any breakpoint.
    const column = main.querySelector("div.max-w-md");
    expect(column).not.toBeNull();
    expect(column!.className).toContain("w-full");
  });

  // Requirement 22.3 — the same content renders without overflow under RTL.
  it("renders the recovery content under RTL (22.3)", async () => {
    await i18n.changeLanguage("ar");
    mockLocation("/non-existent");
    render(<NotFound />);

    expect(document.documentElement.dir).toBe("rtl");
    // The centered, constrained column is still present in RTL.
    const column = screen.getByRole("main").querySelector("div.max-w-md");
    expect(column).not.toBeNull();
    expect(
      screen.getByRole("link", { name: i18n.t("notFoundPage.returnHome") }),
    ).toBeInTheDocument();
  });

  it("has no axe-detectable accessibility violations (22.1, 22.2)", async () => {
    mockLocation("/non-existent");
    const { container } = render(<NotFound />);
    const results = await axe(container, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
    });
    expect(results).toHaveNoViolations();
  });
});
