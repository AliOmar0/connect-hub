import { describe, it, expect } from "vitest";
import { SHORTCUT_DEFS, type ShortcutDef } from "./ShortcutsPage";
import { groupShortcuts } from "@/lib/shortcuts";

/**
 * Unit tests for the SHORTCUT_DEFS catalog content.
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3
 */

describe("SHORTCUT_DEFS catalog content", () => {
  // --- Chat group entries (Requirements 2.1-2.5, 3.1-3.4) ---

  it("contains the 5 available chat entries with exact id/keys/group", () => {
    const chatAvailable = SHORTCUT_DEFS.filter(
      (d) => d.group === "chat" && d.availability === "available",
    );

    expect(chatAvailable).toHaveLength(5);

    // Requirement 2.1: Enter to send message
    expect(chatAvailable).toContainEqual<ShortcutDef>({
      id: "chat-send-message",
      group: "chat",
      descriptionKey: "shortcutsPage.items.chatSendMessage",
      availability: "available",
      keys: "Enter",
    });

    // Requirement 2.2: Backslash to open quick replies
    expect(chatAvailable).toContainEqual<ShortcutDef>({
      id: "chat-open-quick-replies",
      group: "chat",
      descriptionKey: "shortcutsPage.items.chatOpenQuickReplies",
      availability: "available",
      keys: "\\",
    });

    // Requirement 2.3: Up/Down arrow for picker navigation
    expect(chatAvailable).toContainEqual<ShortcutDef>({
      id: "chat-picker-navigate",
      group: "chat",
      descriptionKey: "shortcutsPage.items.chatPickerNavigate",
      availability: "available",
      keys: "↑ / ↓",
    });

    // Requirement 2.4: Enter to insert from picker
    expect(chatAvailable).toContainEqual<ShortcutDef>({
      id: "chat-picker-insert",
      group: "chat",
      descriptionKey: "shortcutsPage.items.chatPickerInsert",
      availability: "available",
      keys: "Enter",
    });

    // Requirement 2.5: Escape to close picker
    expect(chatAvailable).toContainEqual<ShortcutDef>({
      id: "chat-picker-close",
      group: "chat",
      descriptionKey: "shortcutsPage.items.chatPickerClose",
      availability: "available",
      keys: "Esc",
    });
  });

  it("contains the 4 planned chat entries with exact id/group and no keys", () => {
    const chatPlanned = SHORTCUT_DEFS.filter(
      (d) => d.group === "chat" && d.availability === "planned",
    );

    expect(chatPlanned).toHaveLength(4);

    // Requirement 3.1: Reply to message (planned)
    expect(chatPlanned).toContainEqual<ShortcutDef>({
      id: "chat-reply-to-message",
      group: "chat",
      descriptionKey: "shortcutsPage.items.chatReplyToMessage",
      availability: "planned",
    });

    // Requirement 3.2: Resolve conversation (planned)
    expect(chatPlanned).toContainEqual<ShortcutDef>({
      id: "chat-resolve-conversation",
      group: "chat",
      descriptionKey: "shortcutsPage.items.chatResolveConversation",
      availability: "planned",
    });

    // Requirement 3.3: Switch conversation (planned)
    expect(chatPlanned).toContainEqual<ShortcutDef>({
      id: "chat-switch-conversation",
      group: "chat",
      descriptionKey: "shortcutsPage.items.chatSwitchConversation",
      availability: "planned",
    });

    // Requirement 3.4: Quick reply navigate (planned)
    expect(chatPlanned).toContainEqual<ShortcutDef>({
      id: "chat-quick-reply-navigate",
      group: "chat",
      descriptionKey: "shortcutsPage.items.chatQuickReplyNavigate",
      availability: "planned",
    });

    // All planned entries should have no keys defined
    chatPlanned.forEach((entry) => {
      expect(entry.keys).toBeUndefined();
    });
  });

  // Requirement 2.6: Chat group is distinct from general/navigation

  it("places all chat entries in a 'chat' group distinct from 'general' and 'navigation'", () => {
    const chatEntries = SHORTCUT_DEFS.filter((d) => d.group === "chat");
    expect(chatEntries).toHaveLength(9); // 5 available + 4 planned

    chatEntries.forEach((entry) => {
      expect(entry.group).toBe("chat");
      expect(entry.group).not.toBe("general");
      expect(entry.group).not.toBe("navigation");
    });
  });

  // --- General and Navigation entries preserved (Requirements 4.1, 4.2) ---

  it("preserves the original 4 General entries with unchanged keys", () => {
    const generalEntries = SHORTCUT_DEFS.filter(
      (d) => d.group === "general" && d.availability === "available",
    );

    expect(generalEntries).toHaveLength(4);

    // Requirement 4.1: Tab for focus next
    expect(generalEntries).toContainEqual<ShortcutDef>({
      id: "focus-next",
      group: "general",
      descriptionKey: "shortcutsPage.items.focusNext",
      availability: "available",
      keys: "Tab",
    });

    // Requirement 4.1: Shift+Tab for focus previous
    expect(generalEntries).toContainEqual<ShortcutDef>({
      id: "focus-previous",
      group: "general",
      descriptionKey: "shortcutsPage.items.focusPrevious",
      availability: "available",
      keys: "Shift + Tab",
    });

    // Requirement 4.1: Enter to activate
    expect(generalEntries).toContainEqual<ShortcutDef>({
      id: "activate",
      group: "general",
      descriptionKey: "shortcutsPage.items.activate",
      availability: "available",
      keys: "Enter",
    });

    // Requirement 4.1: Esc to dismiss
    expect(generalEntries).toContainEqual<ShortcutDef>({
      id: "dismiss",
      group: "general",
      descriptionKey: "shortcutsPage.items.dismiss",
      availability: "available",
      keys: "Esc",
    });
  });

  it("preserves the 1 Navigation entry with unchanged keys", () => {
    const navigationEntries = SHORTCUT_DEFS.filter(
      (d) => d.group === "navigation" && d.availability === "available",
    );

    expect(navigationEntries).toHaveLength(1);

    // Requirement 4.2: Ctrl/Cmd+B to toggle sidebar (platform pair)
    expect(navigationEntries).toContainEqual<ShortcutDef>({
      id: "toggle-sidebar",
      group: "navigation",
      descriptionKey: "shortcutsPage.items.toggleSidebar",
      availability: "available",
      keys: { mac: "⌘ B", other: "Ctrl + B" },
    });
  });

  // --- Grouping validation (Requirement 4.3) ---

  it("groups the full catalog into exactly three groups with expected membership", () => {
    // Convert SHORTCUT_DEFS to the Shortcut shape expected by groupShortcuts
    const shortcuts = SHORTCUT_DEFS.map((def) => ({
      id: def.id,
      group: def.group,
      keys: def.keys
        ? typeof def.keys === "string"
          ? def.keys
          : def.keys.other // Use 'other' for testing
        : "",
      description: def.descriptionKey,
    }));

    const groups = groupShortcuts(shortcuts);

    // Requirement 4.3: Exactly three groups
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.group)).toEqual([
      "general",
      "navigation",
      "chat",
    ]);

    // Requirement 4.3: Expected membership per group
    const generalGroup = groups.find((g) => g.group === "general");
    const navigationGroup = groups.find((g) => g.group === "navigation");
    const chatGroup = groups.find((g) => g.group === "chat");

    expect(generalGroup).toBeDefined();
    expect(navigationGroup).toBeDefined();
    expect(chatGroup).toBeDefined();

    // General: 4 entries
    expect(generalGroup!.shortcuts).toHaveLength(4);

    // Navigation: 1 entry
    expect(navigationGroup!.shortcuts).toHaveLength(1);

    // Chat: 9 entries (5 available + 4 planned)
    expect(chatGroup!.shortcuts).toHaveLength(9);

    // No group should be empty
    groups.forEach((group) => {
      expect(group.shortcuts.length).toBeGreaterThan(0);
    });
  });

  // --- Total count sanity check ---

  it("contains exactly 14 entries (4 general + 1 navigation + 9 chat)", () => {
    expect(SHORTCUT_DEFS).toHaveLength(14);
  });
});
