import { describe, it, expect } from "vitest";
import {
  groupShortcuts,
  DEFAULT_SHORTCUT_GROUP,
  type Shortcut,
} from "./shortcuts";

const shortcuts: Shortcut[] = [
  { group: "navigation", keys: "G H", description: "Go home" },
  { group: "sessions", keys: "J", description: "Next session" },
  { group: "navigation", keys: "G Q", description: "Go to queue" },
  { keys: "?", description: "Show help" }, // no group -> default
];

describe("groupShortcuts", () => {
  it("partitions shortcuts into named groups in first-appearance order", () => {
    const groups = groupShortcuts(shortcuts);
    expect(groups.map((g) => g.group)).toEqual([
      "navigation",
      "sessions",
      DEFAULT_SHORTCUT_GROUP,
    ]);
  });

  it("assigns each shortcut to exactly one group (partition)", () => {
    const groups = groupShortcuts(shortcuts);
    const flattened = groups.flatMap((g) => g.shortcuts);
    expect(flattened).toHaveLength(shortcuts.length);
    expect(new Set(flattened)).toEqual(new Set(shortcuts));
  });

  it("produces no empty groups", () => {
    const groups = groupShortcuts(shortcuts);
    expect(groups.every((g) => g.shortcuts.length > 0)).toBe(true);
  });

  it("preserves shortcut order within a group", () => {
    const groups = groupShortcuts(shortcuts);
    const nav = groups.find((g) => g.group === "navigation")!;
    expect(nav.shortcuts.map((s) => s.keys)).toEqual(["G H", "G Q"]);
  });

  it("falls back to the default group for blank group names", () => {
    const groups = groupShortcuts([
      { group: "  ", keys: "X", description: "x" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].group).toBe(DEFAULT_SHORTCUT_GROUP);
  });

  it("supports a custom group selector", () => {
    const groups = groupShortcuts(shortcuts, (s) => s.keys[0]);
    expect(groups.map((g) => g.group)).toEqual(["G", "J", "?"]);
  });

  it("returns an empty array for an empty input", () => {
    expect(groupShortcuts([])).toEqual([]);
  });
});
