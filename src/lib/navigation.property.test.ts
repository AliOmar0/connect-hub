// Feature: ui-ux-redesign, Property 28
//
// Property 28: Navigation reflects role access exactly.
// For any Role, the set of rendered primary navigation items equals exactly the
// set of items whose allowed roles include that Role; items the Role cannot
// access are not rendered.
//
// Validates: Requirements 11.3

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { filterNavByRole, type RoleScopedNavItem } from "./navigation";
import type { AppRole } from "@/types/database";

// The complete Role union from the data model (the single source of truth for
// which roles exist). filterNavByRole must behave correctly for every one.
const ALL_ROLES: AppRole[] = [
  "admin",
  "supervisor",
  "manager",
  "agent",
  "viewer",
];

// A nav item carrying a stable identity so we can compare the filtered output
// against an independently computed expectation set by reference.
interface TestNavItem extends RoleScopedNavItem {
  id: number;
  roles: AppRole[];
}

const roleArb: fc.Arbitrary<AppRole> = fc.constantFrom(...ALL_ROLES);

// Generate a list of nav items, each with an arbitrary (possibly empty,
// possibly duplicated) subset of roles. Duplicates and empties are intentional
// edge cases the filter must tolerate.
const navItemsArb: fc.Arbitrary<TestNavItem[]> = fc
  .array(fc.uniqueArray(roleArb), { maxLength: 25 })
  .map((roleLists) => roleLists.map((roles, id) => ({ id, roles })));

describe("Property 28: Navigation reflects role access exactly", () => {
  it("returns exactly the items whose allowed roles include the given role", () => {
    fc.assert(
      fc.property(navItemsArb, roleArb, (items, role) => {
        const result = filterNavByRole(items, role);

        // 1. Every returned item is accessible to the role.
        for (const item of result) {
          expect(item.roles.includes(role)).toBe(true);
        }

        // 2. Every accessible item is returned (nothing accessible is dropped).
        const expectedIds = items
          .filter((item) => item.roles.includes(role))
          .map((item) => item.id);
        expect(result.map((item) => item.id)).toEqual(expectedIds);

        // 3. No item the role cannot access is present.
        const returnedIds = new Set(result.map((item) => item.id));
        for (const item of items) {
          if (!item.roles.includes(role)) {
            expect(returnedIds.has(item.id)).toBe(false);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
