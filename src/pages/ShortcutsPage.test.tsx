import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within } from "@/test-utils/render";
import { axe, toHaveNoViolations } from "jest-axe";
import ShortcutsPage from "./ShortcutsPage";
import i18n from "@/i18n";

expect.extend(toHaveNoViolations);

// --- Module mocks -----------------------------------------------------------

// The App_Shell has its own tests; here we only need a single main landmark so
// the page content is a well-formed document for the axe scan and queries stay
// focused on the shortcuts content.
vi.mock("@/components/layout/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));

// --- Helpers ----------------------------------------------------------------

// Unicode bidi isolate controls that BidiText wraps key combos in (LRI/PDI).
// They preserve LTR order under RTL but are invisible; strip them so text
// assertions compare the human-visible combo.
const stripBidi = (text: string | null | undefined) =>
  (text ?? "").replace(/[\u2066\u2069]/g, "").trim();

// The two labeled groups defined by ShortcutsPage, with their English labels
// and the descriptions/combos they contain. Combos assume a non-mac test
// platform (jsdom navigator), so the sidebar toggle resolves to "Ctrl + B".
const GENERAL_GROUP = {
  label: "General",
  entries: [
    { description: "Move focus to the next control", keys: "Tab" },
    { description: "Move focus to the previous control", keys: "Shift + Tab" },
    { description: "Activate the focused control", keys: "Enter" },
    { description: "Close the open dialog or menu", keys: "Esc" },
  ],
};

const NAVIGATION_GROUP = {
  label: "Navigation",
  entries: [{ description: "Toggle the navigation sidebar", keys: "Ctrl + B" }],
};

/** Locate a group's Card by its labeled <h2> heading. */
function getGroupCard(label: string): HTMLElement {
  const heading = screen.getByRole("heading", { level: 2, name: label });
  const card = heading.closest("div.shadow-card");
  expect(card).not.toBeNull();
  return card as HTMLElement;
}

describe("ShortcutsPage", () => {
  afterEach(async () => {
    // Reset direction/language so an RTL test can't leak into the next test.
    if (i18n.language !== "en") {
      await i18n.changeLanguage("en");
    }
  });

  // Requirement 21.1 — shortcuts are organized into labeled context groups.
  it("renders each shortcut group with its translated label heading", () => {
    render(<ShortcutsPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: /Keyboard Shortcuts/i }),
    ).toBeInTheDocument();

    // Both populated groups appear as labeled level-2 headings.
    expect(
      screen.getByRole("heading", { level: 2, name: GENERAL_GROUP.label }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: NAVIGATION_GROUP.label }),
    ).toBeInTheDocument();
  });

  // Requirement 21.1 — each shortcut belongs to exactly one group.
  it("assigns every shortcut to exactly one labeled group", () => {
    render(<ShortcutsPage />);

    const generalCard = getGroupCard(GENERAL_GROUP.label);
    const navigationCard = getGroupCard(NAVIGATION_GROUP.label);

    // General group owns its four entries and none of navigation's.
    for (const { description } of GENERAL_GROUP.entries) {
      expect(within(generalCard).getByText(description)).toBeInTheDocument();
      expect(
        within(navigationCard).queryByText(description),
      ).not.toBeInTheDocument();
    }

    // Navigation group owns its single entry and none of general's.
    for (const { description } of NAVIGATION_GROUP.entries) {
      expect(within(navigationCard).getByText(description)).toBeInTheDocument();
      expect(
        within(generalCard).queryByText(description),
      ).not.toBeInTheDocument();
    }

    // The total number of rendered shortcut rows equals the sum across groups
    // (no shortcut is duplicated into more than one group).
    const rows = document.querySelectorAll("dl > div");
    expect(rows).toHaveLength(
      GENERAL_GROUP.entries.length + NAVIGATION_GROUP.entries.length,
    );
  });

  // Requirement 21.2 — each shortcut pairs a human-readable description with
  // its key combination rendered as readable text.
  it("pairs each description with its readable key combination", () => {
    render(<ShortcutsPage />);

    const allEntries = [...GENERAL_GROUP.entries, ...NAVIGATION_GROUP.entries];
    for (const { description, keys } of allEntries) {
      const term = screen.getByText(description);
      const row = term.closest("div");
      expect(row).not.toBeNull();

      // The key combo is rendered as readable text alongside the description.
      const combo = row!.querySelector("dd span");
      expect(combo).not.toBeNull();
      expect(stripBidi(combo!.textContent)).toBe(keys);
    }
  });

  // Requirement 21.3 — empty context groups are omitted rather than rendered
  // empty. Only groups that actually contain shortcuts are present, and every
  // rendered group has at least one shortcut row.
  it("omits empty groups and renders only populated ones", () => {
    render(<ShortcutsPage />);

    const groupHeadings = screen.getAllByRole("heading", { level: 2 });
    // Exactly the two populated groups — no stray empty group card.
    expect(groupHeadings).toHaveLength(2);
    expect(groupHeadings.map((h) => h.textContent)).toEqual([
      GENERAL_GROUP.label,
      NAVIGATION_GROUP.label,
    ]);

    // No rendered group is empty: every definition list has at least one row.
    const lists = document.querySelectorAll("dl");
    expect(lists.length).toBeGreaterThan(0);
    lists.forEach((list) => {
      expect(list.querySelectorAll("div").length).toBeGreaterThan(0);
    });
  });

  // Requirement 21.4 — under RTL, descriptions render RTL (inheriting document
  // direction) while key combinations preserve left-to-right rendering.
  it("renders RTL descriptions while keeping key combos left-to-right under RTL", async () => {
    await i18n.changeLanguage("ar");
    render(<ShortcutsPage />);

    // Document mirrors to RTL so descriptions flow right-to-left.
    expect(document.documentElement.dir).toBe("rtl");

    // Arabic group labels are shown.
    const generalCard = getGroupCard("عام");
    getGroupCard("التنقل");

    // A description renders in the active (Arabic/RTL) language...
    expect(
      within(generalCard).getByText("نقل التركيز إلى العنصر التالي"),
    ).toBeInTheDocument();

    // ...while every key combination stays explicitly LTR and preserves its
    // character order via BidiText's dir="ltr" isolate wrapper.
    const combos = document.querySelectorAll("dd span");
    expect(combos.length).toBeGreaterThan(0);
    combos.forEach((combo) => {
      expect(combo.getAttribute("dir")).toBe("ltr");
    });

    // The sidebar combo is still readable as "Ctrl + B" (LTR order intact).
    const comboTexts = Array.from(combos).map((c) => stripBidi(c.textContent));
    expect(comboTexts).toContain("Ctrl + B");
  });

  // Accessibility — the loaded page has no detectable axe violations. Heading
  // order is well-formed (page h1 followed by group h2s), so no rules are
  // scoped out here.
  it("has no axe-detectable accessibility violations", async () => {
    const { container } = render(<ShortcutsPage />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
