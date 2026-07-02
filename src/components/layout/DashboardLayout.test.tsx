import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test-utils/render";
import DashboardLayout from "./DashboardLayout";

// Mock the shell child components so this test focuses on DashboardLayout's
// composition (order, landmarks, single main) rather than their internals.
vi.mock("./SkipLink", () => ({
  default: ({ targetId }: { targetId?: string }) => (
    <a data-testid="skip-link" href={`#${targetId ?? "main-content"}`}>
      Skip to content
    </a>
  ),
}));

vi.mock("./AppShellHeader", () => ({
  default: () => <header data-testid="app-shell-header">Header</header>,
}));

vi.mock("./PrimaryNav", () => ({
  default: ({ variant }: { variant?: string }) => (
    <nav data-testid="primary-nav" data-variant={variant}>
      Nav
    </nav>
  ),
  PRIMARY_NAV_ITEMS: [
    { to: "/sessions", labelKey: "s", roles: [], icon: () => null },
    { to: "/notifications", labelKey: "n", roles: [], icon: () => null },
  ],
}));

// Avoid real network calls from the badge-count queries.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => Promise.resolve({ count: 0 }) }),
      }),
    }),
  },
}));

describe("DashboardLayout", () => {
  it("renders the skip link, header, navigation, and main landmark", () => {
    render(
      <DashboardLayout>
        <div>Test Content</div>
      </DashboardLayout>,
    );

    expect(screen.getByTestId("skip-link")).toBeInTheDocument();
    expect(screen.getByTestId("app-shell-header")).toBeInTheDocument();
    expect(screen.getByTestId("primary-nav")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("exposes exactly one main content landmark with id main-content", () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>,
    );

    const mains = screen.getAllByRole("main");
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute("id", "main-content");
  });

  it("renders children inside the main region", () => {
    render(
      <DashboardLayout>
        <div data-testid="test-content">Test Content</div>
      </DashboardLayout>,
    );

    const main = screen.getByRole("main");
    const content = screen.getByTestId("test-content");
    expect(main).toContainElement(content);
  });

  it("makes the skip link the first focusable element targeting main-content", () => {
    const { container } = render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>,
    );

    const skip = screen.getByTestId("skip-link");
    expect(skip).toHaveAttribute("href", "#main-content");

    // The skip link precedes the header and navigation in DOM order.
    const focusables = container.querySelectorAll("a, header, nav, main");
    expect(focusables[0]).toBe(skip);
  });

  it("uses the persistent sidebar variant on wide viewports", () => {
    // jsdom defaults window.innerWidth to 1024 (>= laptop breakpoint).
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>,
    );

    expect(screen.getByTestId("primary-nav")).toHaveAttribute(
      "data-variant",
      "sidebar",
    );
  });
});
