import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { useEffect } from "react";
import { render, screen, cleanup } from "@/test-utils/render";
import { useLocation } from "react-router-dom";
import fc from "fast-check";

import DashboardLayout from "./DashboardLayout";
import { BREAKPOINTS, widthToBreakpoint } from "@/hooks/use-breakpoint";

// Feature: ui-ux-redesign, Property 12: Breakpoint changes preserve context and
// entered data
// Validates: Requirements 7.7
//
// For any Page with entered form data, changing the viewport width across a
// breakpoint preserves the current Page context and the entered data without a
// page reload. DashboardLayout wires breakpoint adaptation as pure responsive
// state (task 18.2): crossing a breakpoint only swaps which PrimaryNav variant
// renders — it never changes the route or remounts the page content subtree.
//
// This property quantifies over (a) arbitrary entered form-data strings and
// (b) arbitrary sequences of viewport widths that walk across every breakpoint
// boundary. For every generated case, after all the width changes:
//   1. the entered data still lives in the same (never-remounted) inputs,
//   2. the page content subtree mounted exactly once (no remount), and
//   3. the route / page context is unchanged.
// A remount would reset the uncontrolled inputs and increment the mount count,
// so preservation of the entered value is a faithful proxy for "no reload".

// Isolate DashboardLayout's composition: mock the shell children so the test
// exercises only the content region's remount / preservation behavior.
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

// A controllable matchMedia mock keyed to window.innerWidth, matching the three
// boundaries useBreakpoint listens to (tablet / laptop / desktop).
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
      <label htmlFor="comment">Comment</label>
      <textarea id="comment" name="comment" />
      <span data-testid="route">{location.pathname}</span>
    </div>
  );
}

beforeEach(() => {
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

// A width from anywhere across the full spectrum, so a generated sequence walks
// arbitrarily across the mobile / tablet / laptop / desktop boundaries.
const widthArb = fc.integer({ min: 320, max: 2560 });

// Entered data: arbitrary text the user might have typed into a form field.
const enteredTextArb = fc.string({ maxLength: 60 });

describe("DashboardLayout – breakpoint change preserves context and data (property-based, Req 7.7)", () => {
  it("preserves entered form data, page context, and never remounts across arbitrary breakpoint changes", () => {
    fc.assert(
      fc.property(
        enteredTextArb,
        enteredTextArb,
        widthArb, // initial width at render time
        fc.array(widthArb, { minLength: 1, maxLength: 6 }), // subsequent widths
        (noteValue, commentValue, initialWidth, laterWidths) => {
          mountCount = 0;
          setWidth(initialWidth);

          const { unmount } = render(
            <DashboardLayout>
              <PageContent />
            </DashboardLayout>,
          );

          try {
            // Content mounts exactly once on initial render.
            expect(mountCount).toBe(1);

            const note = screen.getByLabelText("Note") as HTMLInputElement;
            const comment = screen.getByLabelText(
              "Comment",
            ) as HTMLTextAreaElement;

            // Simulate the user having entered form data. The inputs are
            // uncontrolled, so a remount would wipe these values.
            act(() => {
              note.value = noteValue;
              comment.value = commentValue;
            });

            const initialRoute = screen.getByTestId("route").textContent;

            // Walk the viewport across an arbitrary sequence of widths. Each
            // step may or may not cross a breakpoint boundary.
            for (const width of laterWidths) {
              setWidth(width);
            }

            // 1. Entered data survives every breakpoint change (same DOM nodes).
            expect(
              (screen.getByLabelText("Note") as HTMLInputElement).value,
            ).toBe(noteValue);
            expect(
              (screen.getByLabelText("Comment") as HTMLTextAreaElement).value,
            ).toBe(commentValue);

            // 2. No remount of the content subtree despite variant swaps.
            expect(mountCount).toBe(1);

            // 3. Page context (route) is unchanged.
            expect(screen.getByTestId("route").textContent).toBe(initialRoute);

            // Sanity: the nav variant tracks the final active breakpoint, i.e.
            // adaptation actually happened as pure responsive state.
            const finalWidth = laterWidths[laterWidths.length - 1];
            // A persistent sidebar from the tablet tier up (an icon rail at
            // 768-1023px, full width from 1024px); the Sheet menu below it.
            const expectedVariant =
              widthToBreakpoint(finalWidth) >= BREAKPOINTS.tablet
                ? "sidebar"
                : "menu";
            expect(screen.getByTestId("primary-nav")).toHaveAttribute(
              "data-variant",
              expectedVariant,
            );
          } finally {
            unmount();
            cleanup();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
