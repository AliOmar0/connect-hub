// Feature: chat-shortcuts-page, Property 4
//
// Property 4: The Chat_Shortcuts_Page nav entry's role visibility and ordinal
// position are unchanged.
//
// For any AppRole value, the /shortcuts entry appears in
// filterNavByRole(PRIMARY_NAV_ITEMS, role) if and only if role is one of
// "admin", "supervisor", "manager", "agent", and when it appears, its index
// relative to the other items that remain visible for that role is the same
// as its index relative to those same items in the unfiltered PRIMARY_NAV_ITEMS
// array.
//
// Validates: Requirements 1.6

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { filterNavByRole } from "./navigation";
import { PRIMARY_NAV_ITEMS } from "@/components/layout/PrimaryNav";
import type { AppRole } from "@/types/database";

// The complete Role union from the data model (the single source of truth for
// which roles exist).
const ALL_ROLES: AppRole[] = [
  "admin",
  "supervisor",
  "manager",
  "agent",
  "viewer",
];

// The roles that should be able to see the /shortcuts nav item, per the
// declared configuration in PRIMARY_NAV_ITEMS.
const SHORTCUTS_ALLOWED_ROLES: AppRole[] = [
  "admin",
  "supervisor",
  "manager",
  "agent",
];

// The /shortcuts entry's route path for identification.
const SHORTCUTS_ROUTE = "/shortcuts";

const roleArb: fc.Arbitrary<AppRole> = fc.constantFrom(...ALL_ROLES);

describe("Property 4: Chat_Shortcuts_Page nav entry's role visibility and ordinal position are unchanged", () => {
  it("the /shortcuts entry appears exactly for its declared roles and preserves relative ordering", () => {
    fc.assert(
      fc.property(roleArb, (role) => {
        const filteredItems = filterNavByRole(PRIMARY_NAV_ITEMS, role);

        // Find the /shortcuts entry in the unfiltered array.
        const shortcutsItem = PRIMARY_NAV_ITEMS.find(
          (item) => item.to === SHORTCUTS_ROUTE,
        );
        expect(shortcutsItem).toBeDefined();

        // Find the /shortcuts entry in the filtered result (if present).
        const shortcutsInFiltered = filteredItems.find(
          (item) => item.to === SHORTCUTS_ROUTE,
        );

        // 1. Visibility matches the declared roles.
        const shouldBeVisible = SHORTCUTS_ALLOWED_ROLES.includes(role);
        if (shouldBeVisible) {
          expect(shortcutsInFiltered).toBeDefined();
        } else {
          expect(shortcutsInFiltered).toBeUndefined();
        }

        // 2. When visible, relative ordering is preserved.
        if (shouldBeVisible && shortcutsInFiltered) {
          // Get all items that are visible for this role.
          const visibleRoutes = new Set(filteredItems.map((item) => item.to));

          // Find the index of /shortcuts in the unfiltered array.
          const unfilteredIndex = PRIMARY_NAV_ITEMS.findIndex(
            (item) => item.to === SHORTCUTS_ROUTE,
          );

          // Find the index of /shortcuts in the filtered array.
          const filteredIndex = filteredItems.findIndex(
            (item) => item.to === SHORTCUTS_ROUTE,
          );

          // Count how many visible items appear before /shortcuts in the
          // unfiltered array.
          const itemsBeforeInUnfiltered = PRIMARY_NAV_ITEMS.slice(
            0,
            unfilteredIndex,
          ).filter((item) => visibleRoutes.has(item.to));

          // Count how many items appear before /shortcuts in the filtered array.
          const itemsBeforeInFiltered = filteredItems.slice(0, filteredIndex);

          // The relative position should be the same: same number of items
          // before /shortcuts in both arrays (among the items that remain
          // visible after filtering).
          expect(itemsBeforeInFiltered.length).toBe(
            itemsBeforeInUnfiltered.length,
          );

          // Additionally, verify the filtered index matches the count of
          // visible items preceding it in the original array.
          expect(filteredIndex).toBe(itemsBeforeInUnfiltered.length);
        }
      }),
      { numRuns: 100 },
    );
  });
});
