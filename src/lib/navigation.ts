// Role-based primary-navigation filtering (Requirement 11.3, Property 28).
// Reuses the existing Role union from the data model; this redesign does not
// change roles or access control, only which nav items are rendered.

import type { AppRole } from "@/types/database";

/** Any navigation item that declares the roles allowed to see it. */
export interface RoleScopedNavItem {
  /** Allowed roles; an item with an empty list is visible to no role. */
  roles: AppRole[];
}

/**
 * Return exactly the navigation items whose allowed roles include the given
 * role, preserving the original order. When no role is provided (unauthenticated
 * session), no items are returned.
 */
export function filterNavByRole<T extends RoleScopedNavItem>(
  items: T[],
  role: AppRole | null | undefined,
): T[] {
  if (!role || !Array.isArray(items)) return [];
  return items.filter(
    (item) => Array.isArray(item.roles) && item.roles.includes(role),
  );
}
