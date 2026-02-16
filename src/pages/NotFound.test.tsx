import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test-utils/render";
import NotFound from "./NotFound";
import { useLocation } from "react-router-dom";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useLocation: vi.fn(),
  };
});

describe("NotFound", () => {
  it("renders 404 message", () => {
    (useLocation as ReturnType<typeof vi.fn>).mockReturnValue({
      pathname: "/non-existent",
    });

    render(<NotFound />);

    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText(/page not found/i)).toBeInTheDocument();
  });

  it("displays return to home link", () => {
    (useLocation as ReturnType<typeof vi.fn>).mockReturnValue({
      pathname: "/non-existent",
    });

    render(<NotFound />);

    const homeLink = screen.getByText(/return to home/i);
    expect(homeLink).toBeInTheDocument();
    expect(homeLink.closest("a")).toHaveAttribute("href", "/");
  });

  it("logs error to console", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    (useLocation as ReturnType<typeof vi.fn>).mockReturnValue({
      pathname: "/test-route",
    });

    render(<NotFound />);

    expect(consoleSpy).toHaveBeenCalledWith(
      "404 Error: User attempted to access non-existent route:",
      "/test-route",
    );

    consoleSpy.mockRestore();
  });
});
