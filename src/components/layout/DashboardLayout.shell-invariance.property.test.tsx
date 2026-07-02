// Feature: ui-ux-redesign, Property 26: App_Shell structure is invariant across authenticated pages
//
// Property 26: For any authenticated Page, the header, primary navigation, and
// main content region appear in the same relative positions.
//
// Validates: Requirements 11.1
//
// This is a single fast-check property-based test (>= 100 iterations). It
// renders `DashboardLayout` (the App_Shell composition every authenticated page
// consumes) with arbitrarily generated page children and asserts that the
// relative document positions of the primary navigation, the header, and the
// main content region are identical regardless of what the page renders. The
// shell children are mocked so the assertion isolates DashboardLayout's own
// composition (ordering + landmarks) from their internals, and the test-utils
// `render` wraps the tree in an authenticated AuthProvider (mock user), so the
// shell is exercised in its authenticated form.
import { ReactNode } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import fc from "fast-check";
import { render, cleanup } from "@/test-utils/render";
import DashboardLayout from "./DashboardLayout";

// Mock the shell child components so the test focuses on DashboardLayout's
// composition (relative order + single main) rather than their internals.
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

// The three shell regions whose relative positions must stay invariant, in the
// order DashboardLayout composes them: navigation, then header, then main.
const EXPECTED_SHELL_ORDER = [
  "primary-nav",
  "app-shell-header",
  "main-content",
] as const;

// A benign leaf of arbitrary page content. Deliberately excludes landmark roles
// (main/nav/banner) so generated pages vary in content without introducing a
// second shell region that would confuse the invariant.
type Leaf =
  | { kind: "text"; value: string }
  | { kind: "heading"; value: string }
  | { kind: "button"; value: string }
  | { kind: "input"; value: string }
  | { kind: "list"; items: string[] };

const leafArb: fc.Arbitrary<Leaf> = fc.oneof(
  fc.record({ kind: fc.constant("text" as const), value: fc.string() }),
  fc.record({
    kind: fc.constant("heading" as const),
    value: fc.string({ minLength: 1, maxLength: 20 }),
  }),
  fc.record({
    kind: fc.constant("button" as const),
    value: fc.string({ minLength: 1, maxLength: 20 }),
  }),
  fc.record({
    kind: fc.constant("input" as const),
    value: fc.string({ maxLength: 20 }),
  }),
  fc.record({
    kind: fc.constant("list" as const),
    items: fc.array(fc.string({ maxLength: 12 }), { maxLength: 5 }),
  }),
);

// An arbitrary "page" is a varying tree of benign content. This stands in for
// the 13 different authenticated pages the shell can host.
const pageArb: fc.Arbitrary<Leaf[]> = fc.array(leafArb, {
  minLength: 0,
  maxLength: 8,
});

function renderLeaf(leaf: Leaf, key: number): ReactNode {
  switch (leaf.kind) {
    case "text":
      return <p key={key}>{leaf.value}</p>;
    case "heading":
      return <h2 key={key}>{leaf.value}</h2>;
    case "button":
      return (
        <button key={key} type="button">
          {leaf.value}
        </button>
      );
    case "input":
      return (
        <input
          key={key}
          aria-label={`field-${key}`}
          defaultValue={leaf.value}
        />
      );
    case "list":
      return (
        <ul key={key}>
          {leaf.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
  }
}

function renderPage(leaves: Leaf[]): ReactNode {
  return <div data-testid="page-content">{leaves.map(renderLeaf)}</div>;
}

// Returns the shell regions currently in the document, ordered by their DOM
// position. `querySelectorAll` yields matches in document order, so the
// resulting identifiers describe the shell's relative structure.
function shellOrder(): string[] {
  const nodes = Array.from(
    document.querySelectorAll(
      '[data-testid="primary-nav"], [data-testid="app-shell-header"], #main-content',
    ),
  );
  return nodes.map((node) => node.getAttribute("data-testid") ?? node.id);
}

afterEach(() => {
  cleanup();
});

describe("Property 26: App_Shell structure is invariant across authenticated pages", () => {
  it("keeps header, primary navigation, and main content in the same relative positions for any page", () => {
    fc.assert(
      fc.property(pageArb, (leaves) => {
        render(<DashboardLayout>{renderPage(leaves)}</DashboardLayout>);

        // Exactly one of each shell region is present...
        expect(
          document.querySelectorAll('[data-testid="primary-nav"]'),
        ).toHaveLength(1);
        expect(
          document.querySelectorAll('[data-testid="app-shell-header"]'),
        ).toHaveLength(1);
        expect(document.querySelectorAll("#main-content")).toHaveLength(1);

        // ...and their relative positions are the invariant shell order,
        // regardless of what the page child renders.
        expect(shellOrder()).toEqual([...EXPECTED_SHELL_ORDER]);

        // The generated page content lives inside the main region, confirming
        // the shell wraps the page rather than the reverse.
        const main = document.querySelector("#main-content");
        const pageContent = document.querySelector(
          '[data-testid="page-content"]',
        );
        expect(main?.contains(pageContent)).toBe(true);

        cleanup();
      }),
      { numRuns: 100 },
    );
  });
});
