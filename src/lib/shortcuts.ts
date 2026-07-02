// Keyboard-shortcut grouping for the ShortcutsPage (Requirement 21.1, Property 40).
// Partitions a flat list of shortcuts into named context groups: every shortcut
// is assigned to exactly one group, and no rendered group is empty.

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
