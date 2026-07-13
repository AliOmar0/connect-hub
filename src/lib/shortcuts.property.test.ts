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

import {
  groupShortcuts,
  resolveCatalogShortcutKeys,
  type Shortcut,
  type CatalogShortcutInput,
  type ShortcutKeys,
} from "./shortcuts";

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

// Feature: chat-shortcuts-page, Property 1
//
// Property 1: Planned shortcuts never display a key combination.
// For any catalog entry with availability: "planned", regardless of what (if any)
// keys value it carries, resolveCatalogShortcutKeys returns the empty string,
// on both macOS and non-macOS platforms.
//
// Validates: Requirements 3.6

// Generator for arbitrary ShortcutKeys: absent, single string, or platform pair
const shortcutKeysArb: fc.Arbitrary<ShortcutKeys | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.string({ minLength: 1 }),
  fc.record({
    mac: fc.string({ minLength: 1 }),
    other: fc.string({ minLength: 1 }),
  }),
);

// Generator for CatalogShortcutInput with availability: "planned"
const plannedShortcutArb: fc.Arbitrary<CatalogShortcutInput> = fc.record({
  availability: fc.constant("planned" as const),
  keys: shortcutKeysArb,
});

describe("Property 1: Planned shortcuts never display a key combination", () => {
  it("returns empty string for planned shortcuts regardless of keys or platform", () => {
    fc.assert(
      fc.property(plannedShortcutArb, fc.boolean(), (entry, isMac) => {
        const result = resolveCatalogShortcutKeys(entry, isMac);
        expect(result).toBe("");
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: chat-shortcuts-page, Property 2
//
// Property 2: Platform-specific key resolution picks the branch matching the platform.
// For any Available_Shortcut entry with a platform-specific key pair { mac, other },
// resolveCatalogShortcutKeys returns mac when isMac is true and other when isMac is false.
// For any Available_Shortcut entry with a single string keys value,
// resolveCatalogShortcutKeys returns that string unchanged regardless of isMac.
//
// Validates: Requirements 5.3, 5.4

// Generator for platform-specific key pairs { mac, other }
const platformPairArb = fc.record({
  mac: fc.string({ minLength: 1 }),
  other: fc.string({ minLength: 1 }),
});

// Generator for single string keys
const singleStringKeysArb = fc.string({ minLength: 1 });

// Generator for CatalogShortcutInput with availability: "available" and platform pair keys
const availablePlatformPairArb: fc.Arbitrary<CatalogShortcutInput> = fc.record({
  availability: fc.constant("available" as const),
  keys: platformPairArb,
});

// Generator for CatalogShortcutInput with availability: "available" and single string keys
const availableSingleStringArb: fc.Arbitrary<CatalogShortcutInput> = fc.record({
  availability: fc.constant("available" as const),
  keys: singleStringKeysArb,
});

describe("Property 2: Platform-specific key resolution picks the branch matching the platform", () => {
  it("returns mac branch when isMac is true, other branch when isMac is false", () => {
    fc.assert(
      fc.property(availablePlatformPairArb, fc.boolean(), (entry, isMac) => {
        const result = resolveCatalogShortcutKeys(entry, isMac);
        const keys = entry.keys as { mac: string; other: string };
        expect(result).toBe(isMac ? keys.mac : keys.other);
      }),
      { numRuns: 100 },
    );
  });

  it("returns single string keys unchanged regardless of isMac", () => {
    fc.assert(
      fc.property(availableSingleStringArb, fc.boolean(), (entry, isMac) => {
        const result = resolveCatalogShortcutKeys(entry, isMac);
        expect(result).toBe(entry.keys);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: chat-shortcuts-page, Property 3
//
// Property 3: An Availability_Badge label is present if and only if the entry is planned.
// For any catalog entry and any non-empty translate function, getAvailabilityBadgeLabel
// returns null when availability is "available", and returns a non-empty string
// (never null, never "") when availability is "planned".
//
// Validates: Requirements 3.7, 3.8, 3.9

import { getAvailabilityBadgeLabel } from "./shortcuts";

// Generator for availability values
const availabilityArb: fc.Arbitrary<"available" | "planned"> = fc.constantFrom(
  "available" as const,
  "planned" as const,
);

// Generator for non-empty translate functions that return various non-empty strings
const translateArb: fc.Arbitrary<(key: string) => string> = fc.func(
  fc.string({ minLength: 1 }),
);

describe("Property 3: An Availability_Badge label is present if and only if the entry is planned", () => {
  it("returns null for available entries and non-empty string for planned entries", () => {
    fc.assert(
      fc.property(availabilityArb, translateArb, (availability, translate) => {
        const entry = { availability };
        const result = getAvailabilityBadgeLabel(entry, translate);

        if (availability === "available") {
          // Requirement 3.8: No badge for available entries
          expect(result).toBeNull();
        } else {
          // Requirements 3.7, 3.9: Non-empty label for planned entries
          expect(result).not.toBeNull();
          expect(result).not.toBe("");
          expect(typeof result).toBe("string");
          expect(result!.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});
