import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { render, screen } from "@/test-utils/render";
import { createUserEvent } from "@/test-utils/helpers";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import DashboardLayout from "./DashboardLayout";
import { BREAKPOINTS } from "@/hooks/use-breakpoint";

// Task 18.2 — Wire breakpoint-change context and data preservation.
//
// These tests assert that crossing a breakpoint is *pure responsive state*:
// - the page content subtree is NOT remounted (state survives),
// - entered form data is preserved,
// - the route/page context does not change.
// (Requirements 7.7, 7.8)

// Focus DashboardLayout's composition; the shell children are mocked so the
// test isolates the remount/preservation behavior of the content region.
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

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => Promise.resolve({ count: 0 }) }),
      }),
    }),
  },
}));

// A controllable matchMedia mock keyed to window.innerWidth, matching the
// three boundaries useBreakpoint listens to (tablet / laptop / desktop).
type Listener = (event: MediaQueryListEvent) => void;
const changeListeners = new Set<Listener>();
const originalMatchMedia = window.matchMedia;
const originalInnerWidth = window.innerWidth;

function installMatchMedia() {
  changeListeners.clear();
  window.matchMedia = vi.fn((query: string) => {
    const evaluate = () => {
      const match = /min-width:\s*(\d+)px/.exec(query);
      const min = match ? Number(match[1]) : 0;
      return window.innerWidth >= min;
    };
    const mql = {
      get matches() {
        return evaluate();
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: Listener) => {
        changeListeners.add(listener);
      },
      removeEventListener: (_type: string, listener: Listener) => {
        changeListeners.delete(listener);
      },
      addListener: (listener: Listener) => changeListeners.add(listener),
      removeListener: (listener: Listener) => changeListeners.delete(listener),
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
    return mql;
  }) as unknown as typeof window.matchMedia;
}

function setWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: width,
  });
  act(() => {
    changeListeners.forEach((listener) =>
      listener({ matches: true } as MediaQueryListEvent),
    );
  });
}

// Tracks how many times the page content mounts, to detect remounts.
let mountCount = 0;

function PageContent() {
  const location = useLocation();
  useEffect(() => {
    mountCount += 1;
  }, []);
  return (
    <div>
      <label htmlFor="note">Note</label>
      <input id="note" name="note" />
      <span data-testid="route">{location.pathname}</span>
    </div>
  );
}

beforeEach(() => {
  mountCount = 0;
  installMatchMedia();
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: originalInnerWidth,
  });
});

describe("DashboardLayout — breakpoint change preserves context and data (Req 7.7, 7.8)", () => {
  it("preserves entered form data when crossing from desktop to mobile", async () => {
    const user = createUserEvent();
    setWidth(BREAKPOINTS.desktop); // 1440 → persistent sidebar

    render(
      <DashboardLayout>
        <PageContent />
      </DashboardLayout>,
    );

    expect(screen.getByTestId("primary-nav")).toHaveAttribute(
      "data-variant",
      "sidebar",
    );

    const input = screen.getByLabelText("Note") as HTMLInputElement;
    await user.type(input, "draft in progress");
    expect(input.value).toBe("draft in progress");

    // Cross below the laptop breakpoint → collapsible menu variant.
    setWidth(BREAKPOINTS.mobile); // 375

    expect(screen.getByTestId("primary-nav")).toHaveAttribute(
      "data-variant",
      "menu",
    );
    // Same input element instance keeps the entered value.
    expect((screen.getByLabelText("Note") as HTMLInputElement).value).toBe(
      "draft in progress",
    );
  });

  it("does not remount page content or change the route across breakpoints", () => {
    setWidth(BREAKPOINTS.desktop);

    render(
      <DashboardLayout>
        <PageContent />
      </DashboardLayout>,
    );

    expect(mountCount).toBe(1);
    const initialRoute = screen.getByTestId("route").textContent;

    // Walk across every breakpoint boundary in both directions.
    setWidth(BREAKPOINTS.laptop); // 1024
    setWidth(BREAKPOINTS.tablet); // 768
    setWidth(BREAKPOINTS.mobile); // 375
    setWidth(BREAKPOINTS.desktop); // 1440

    // Content mounted exactly once — no remount despite variant swaps.
    expect(mountCount).toBe(1);
    // Route/page context unchanged.
    expect(screen.getByTestId("route").textContent).toBe(initialRoute);
  });
});
