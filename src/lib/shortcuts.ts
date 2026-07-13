// Keyboard-shortcut grouping for the ShortcutsPage (Requirement 21.1, Property 40).
// Partitions a flat list of shortcuts into named context groups: every shortcut
// is assigned to exactly one group, and no rendered group is empty.

/** Whether a catalog shortcut is real today or documented as future work. */
export type ShortcutAvailability = "available" | "planned";

/** Platform-specific (or single) key combination for a catalog entry. */
export type ShortcutKeys = string | { mac: string; other: string };

/** Shape consumed by resolveCatalogShortcutKeys; mirrors ShortcutsPage's ShortcutDef. */
export interface CatalogShortcutInput {
  availability: ShortcutAvailability;
  /** Absent/undefined for Planned_Shortcut entries. */
  keys?: ShortcutKeys;
}

/**
 * Resolve a catalog entry's displayed key-combo string.
 *
 * - Planned_Shortcut entries (availability === "planned") always resolve to "",
 *   regardless of any `keys` value that may be present — Requirement 3.6.
 * - Available_Shortcut entries with a platform pair resolve to the mac branch when
 *   `isMac` is true, otherwise the other branch — Requirements 5.3, 5.4.
 * - Available_Shortcut entries with a single string resolve to that string as-is.
 */
export function resolveCatalogShortcutKeys(
  entry: CatalogShortcutInput,
  isMac: boolean,
): string {
  // Requirement 3.6: Planned shortcuts never display a key combination
  if (entry.availability === "planned") {
    return "";
  }

  // If no keys defined, return empty string
  if (entry.keys === undefined) {
    return "";
  }

  // Single string: return as-is (Requirements 5.3, 5.4)
  if (typeof entry.keys === "string") {
    return entry.keys;
  }

  // Platform pair: select by isMac (Requirements 5.3, 5.4)
  return isMac ? entry.keys.mac : entry.keys.other;
}

/**
 * Decide the Availability_Badge label for a catalog entry, or null when no badge
 * should render.
 *
 * - Returns null for Available_Shortcut entries (Requirement 3.8).
 * - Returns a non-empty label for Planned_Shortcut entries (Requirements 3.7, 3.9);
 *   the label always comes from `translate`, so it flows through i18n rather than a
 *   hard-coded literal.
 */
export function getAvailabilityBadgeLabel(
  entry: { availability: ShortcutAvailability },
  translate: (key: string) => string,
): string | null {
  // Requirement 3.8: No badge for available entries
  if (entry.availability === "available") {
    return null;
  }

  // Requirements 3.7, 3.9: Return translated label for planned entries
  return translate("shortcutsPage.notYetAvailable");
}

/** A single keyboard shortcut entry. */
export interface Shortcut {
  /** Optional stable identifier. */
  id?: string;
  /** Context group name (e.g. "navigation", "sessions"). */
  group?: string;
  /** The key combination, e.g. "Ctrl+K". */
  keys: string;
  /** Human-readable description of what the shortcut does. */
  description: string;
}

/** A named group with its member shortcuts (never empty). */
export interface ShortcutGroup<T extends Shortcut = Shortcut> {
  group: string;
  shortcuts: T[];
}

/** Group name used when a shortcut declares no (or an empty) group. */
export const DEFAULT_SHORTCUT_GROUP = "general";

/**
 * Partition shortcuts into named context groups.
 *
 * Guarantees (Property 40):
 * - every input shortcut appears in exactly one output group;
 * - no output group is empty;
 * - group order follows first appearance, and within a group the original
 *   shortcut order is preserved.
 *
 * `getGroup` lets callers override how the group key is derived; by default it
 * uses the shortcut's `group` field, falling back to `DEFAULT_SHORTCUT_GROUP`.
 */
export function groupShortcuts<T extends Shortcut>(
  shortcuts: T[],
  getGroup: (shortcut: T) => string = (s) =>
    s.group && s.group.trim() ? s.group : DEFAULT_SHORTCUT_GROUP,
): ShortcutGroup<T>[] {
  if (!Array.isArray(shortcuts)) return [];

  const order: string[] = [];
  const buckets = new Map<string, T[]>();

  for (const shortcut of shortcuts) {
    const key = getGroup(shortcut);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
      order.push(key);
    }
    bucket.push(shortcut);
  }

  return order.map((group) => ({ group, shortcuts: buckets.get(group)! }));
}
