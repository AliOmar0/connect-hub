import { describe, it, expect } from "vitest";
import { filterNavByRole } from "./navigation";
import type { AppRole } from "@/types/database";

interface TestNavItem {
  to: string;
  roles: AppRole[];
}

const items: TestNavItem[] = [
  { to: "/", roles: ["admin", "supervisor", "manager", "agent", "viewer"] },
  { to: "/employees", roles: ["admin", "manager"] },
  { to: "/analytics", roles: ["admin", "supervisor", "manager"] },
  { to: "/queue", roles: ["agent", "supervisor"] },
  { to: "/nobody", roles: [] },
];

describe("filterNavByRole", () => {
  it("returns only items whose roles include the given role", () => {
    expect(filterNavByRole(items, "agent").map((i) => i.to)).toEqual([
      "/",
      "/queue",
    ]);
    expect(filterNavByRole(items, "admin").map((i) => i.to)).toEqual([
      "/",
      "/employees",
      "/analytics",
    ]);
  });

  it("preserves original order", () => {
    const result = filterNavByRole(items, "manager").map((i) => i.to);
    expect(result).toEqual(["/", "/employees", "/analytics"]);
  });

  it("never includes items with an empty roles list", () => {
    const roles: AppRole[] = [
      "admin",
      "supervisor",
      "manager",
      "agent",
      "viewer",
    ];
    for (const role of roles) {
      expect(filterNavByRole(items, role).some((i) => i.to === "/nobody")).toBe(
        false,
      );
    }
  });

  it("returns no items for an unauthenticated (nullish) role", () => {
    expect(filterNavByRole(items, null)).toEqual([]);
    expect(filterNavByRole(items, undefined)).toEqual([]);
  });
});
