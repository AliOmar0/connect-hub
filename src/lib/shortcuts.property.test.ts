// Feature: ui-ux-redesign, Property 40
//
// Property 40: Shortcut grouping is a partition with no empty groups.
// For any set of keyboard shortcuts, the rendered grouping assigns each
// shortcut to exactly one context group, the union of all groups equals the
// input set, and no rendered group is empty.
//
// Validates: Requirements 21.1, 21.3

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { groupShortcuts, type Shortcut } from "./shortcuts";

// Generate shortcuts with arbitrary group fields (including missing/empty/
// whitespace groups, which exercise the DEFAULT_SHORTCUT_GROUP fallback) and a
// stable index so each entry can be tracked through the partition by reference.
interface TestShortcut extends Shortcut {
  index: number;
}

const groupArb: fc.Arbitrary<string | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.constant(""),
  fc.constant("   "),
  fc.constantFrom("navigation", "sessions", "general", "editing", "view"),
  fc.string(),
);

const shortcutsArb: fc.Arbitrary<TestShortcut[]> = fc
  .array(
    fc.record({
      group: groupArb,
      keys: fc.string(),
      description: fc.string(),
    }),
    { maxLength: 30 },
  )
  .map((records) => records.map((record, index) => ({ ...record, index })));

describe("Property 40: Shortcut grouping is a partition with no empty groups", () => {
  it("partitions every shortcut into exactly one non-empty group", () => {
    fc.assert(
      fc.property(shortcutsArb, (shortcuts) => {
        const groups = groupShortcuts(shortcuts);

        // 1. No rendered group is empty.
        for (const group of groups) {
          expect(group.shortcuts.length).toBeGreaterThan(0);
        }

        // 2. Group names are unique (a partition has no duplicate cells).
        const groupNames = groups.map((g) => g.group);
        expect(new Set(groupNames).size).toBe(groupNames.length);

        // 3. Every shortcut appears in exactly one group, and the union of all
        //    groups equals the input set (same count + same membership by
        //    stable index, with no extras introduced).
        const flattened = groups.flatMap((g) => g.shortcuts);
        expect(flattened.length).toBe(shortcuts.length);

        const inputIndices = shortcuts
          .map((s) => s.index)
          .sort((a, b) => a - b);
        const outputIndices = flattened
          .map((s) => (s as TestShortcut).index)
          .sort((a, b) => a - b);
        expect(outputIndices).toEqual(inputIndices);

        // Exactly-one membership: each index occurs precisely once across all
        // groups (no shortcut duplicated into multiple groups).
        const counts = new Map<number, number>();
        for (const s of flattened) {
          const idx = (s as TestShortcut).index;
          counts.set(idx, (counts.get(idx) ?? 0) + 1);
        }
        for (const s of shortcuts) {
          expect(counts.get(s.index)).toBe(1);
        }
      }),
      { numRuns: 100 },
    );
  });
});
