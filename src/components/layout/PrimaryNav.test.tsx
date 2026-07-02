import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@/test-utils/render";
import "@testing-library/jest-dom";
import { LayoutDashboard } from "lucide-react";

import PrimaryNav, { PRIMARY_NAV_ITEMS, type NavItem } from "./PrimaryNav";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "react-router-dom";
import { useBreakpoint } from "@/hooks/use-breakpoint";

vi.mock("@/hooks/useAuth", async () => {
  const actual = await vi.importActual("@/hooks/useAuth");
  return { ...actual, useAuth: vi.fn() };
});

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useLocation: vi.fn(() => ({ pathname: "/dashboard" })),
  };
});

vi.mock("@/hooks/use-breakpoint", async () => {
  const actual = await vi.importActual("@/hooks/use-breakpoint");
  return { ...actual, useBreakpoint: vi.fn(() => 1440) };
});

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;
const mockUseLocation = useLocation as ReturnType<typeof vi.fn>;
const mockUseBreakpoint = useBreakpoint as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ userRole: "admin" });
  mockUseLocation.mockReturnValue({ pathname: "/dashboard" });
  mockUseBreakpoint.mockReturnValue(1440);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("PrimaryNav – role filtering (Req 11.3)", () => {
  it("shows only items permitted for the current role", () => {
    mockUseAuth.mockReturnValue({ userRole: "agent" });
    render(<PrimaryNav variant="sidebar" />);

    // Agent sees sessions/queue/shortcuts but not employees/analytics/settings.
    expect(screen.getByText("Active AI Sessions")).toBeInTheDocument();
    expect(screen.getByText("Escalation Queue")).toBeInTheDocument();
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();

    expect(screen.queryByText("Employees")).not.toBeInTheDocument();
    expect(screen.queryByText("Analytics")).not.toBeInTheDocument();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
    // Dashboard is not visible to agent per config.
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("renders no items for an unauthenticated (null) role", () => {
    mockUseAuth.mockReturnValue({ userRole: null });
    const { container } = render(<PrimaryNav variant="sidebar" />);
    expect(container.querySelectorAll("a[href]")).toHaveLength(0);
  });

  it("shows the full admin item set", () => {
    mockUseAuth.mockReturnValue({ userRole: "admin" });
    const { container } = render(<PrimaryNav variant="sidebar" />);
    const adminCount = PRIMARY_NAV_ITEMS.filter((i) =>
      i.roles.includes("admin"),
    ).length;
    expect(container.querySelectorAll("a[href]")).toHaveLength(adminCount);
  });
});

describe("PrimaryNav – active item selection (Req 11.2)", () => {
  it("marks exactly the active route's item with aria-current=page", () => {
    mockUseLocation.mockReturnValue({ pathname: "/analytics" });
    render(<PrimaryNav variant="sidebar" />);

    const current = screen
      .getAllByRole("link")
      .filter((el) => el.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Analytics");
  });

  it("treats nested routes as selecting the parent item", () => {
    mockUseLocation.mockReturnValue({ pathname: "/sessions/abc-123" });
    render(<PrimaryNav variant="sidebar" />);

    const current = screen
      .getAllByRole("link")
      .filter((el) => el.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Active AI Sessions");
  });
});

describe("PrimaryNav – variant by breakpoint (Req 7.2, 7.3)", () => {
  it("renders a persistent sidebar nav at >= 1024px", () => {
    mockUseBreakpoint.mockReturnValue(1024);
    render(<PrimaryNav />);

    // Sidebar exposes a navigation landmark immediately (no toggle button).
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /navigation menu/i }),
    ).not.toBeInTheDocument();
  });

  it("renders a collapsible menu toggle below 1024px", () => {
    mockUseBreakpoint.mockReturnValue(768);
    render(<PrimaryNav />);

    expect(
      screen.getByRole("button", { name: /open navigation menu/i }),
    ).toBeInTheDocument();
    // Nav is not present until the menu is opened.
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("honors an explicit variant prop over the breakpoint", () => {
    mockUseBreakpoint.mockReturnValue(768);
    render(<PrimaryNav variant="sidebar" />);
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });
});

describe("PrimaryNav – menu reveals nav and moves focus into it (Req 7.4)", () => {
  it("opens the nav and focuses the first item on toggle activation", async () => {
    const { createUserEvent } = await import("@/test-utils/helpers");
    const user = createUserEvent();
    mockUseBreakpoint.mockReturnValue(375);

    render(<PrimaryNav />);

    const toggle = screen.getByRole("button", {
      name: /open navigation menu/i,
    });

    await act(async () => {
      await user.click(toggle);
    });

    // Nav becomes visible.
    await waitFor(() => {
      expect(screen.getByRole("navigation")).toBeInTheDocument();
    });

    // Keyboard focus moved into the nav (first link).
    await waitFor(() => {
      const active = document.activeElement as HTMLElement | null;
      expect(active?.tagName).toBe("A");
      expect(screen.getByRole("navigation").contains(active)).toBe(true);
    });
  });
});

describe("PrimaryNav – custom items", () => {
  it("respects a provided items array", () => {
    const items: NavItem[] = [
      {
        to: "/only-admin",
        icon: LayoutDashboard,
        labelKey: "appShell.nav.dashboard",
        roles: ["admin"],
      },
    ];
    render(<PrimaryNav variant="sidebar" items={items} />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
