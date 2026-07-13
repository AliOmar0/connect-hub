/**
 * Unit tests for i18n resolution of chat-shortcuts-page keys.
 *
 * For each new/changed key in the design's Data Models list, this test asserts
 * that both en.json and ar.json resolve to a non-empty string.
 *
 * Validates: Requirements 6.2, 6.3
 */

import { describe, it, expect } from "vitest";
import en from "@/i18n/locales/en.json";
import ar from "@/i18n/locales/ar.json";

/**
 * Flatten a nested translation JSON into dotted keys mapped to their string
 * values, e.g. { shortcutsPage: { title: "Chat Shortcuts" } } becomes
 * { "shortcutsPage.title": "Chat Shortcuts" }.
 */
function flatten(
  obj: Record<string, unknown>,
  prefix = "",
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") {
      out[key] = v;
    } else if (v && typeof v === "object") {
      Object.assign(out, flatten(v as Record<string, unknown>, key));
    }
  }
  return out;
}

const flatEn = flatten(en as Record<string, unknown>);
const flatAr = flatten(ar as Record<string, unknown>);

/**
 * All new/changed i18n keys from the design's Data Models table.
 * These are the keys introduced or modified by the chat-shortcuts-page feature.
 */
const SHORTCUTS_I18N_KEYS = [
  // Page title and subtitle (values changed, keys unchanged)
  "shortcutsPage.title",
  "shortcutsPage.subtitle",
  // New chat group label
  "shortcutsPage.groups.chat",
  // New chat shortcut item descriptions (available)
  "shortcutsPage.items.chatSendMessage",
  "shortcutsPage.items.chatOpenQuickReplies",
  "shortcutsPage.items.chatPickerNavigate",
  "shortcutsPage.items.chatPickerInsert",
  "shortcutsPage.items.chatPickerClose",
  // New chat shortcut item descriptions (planned)
  "shortcutsPage.items.chatReplyToMessage",
  "shortcutsPage.items.chatResolveConversation",
  "shortcutsPage.items.chatSwitchConversation",
  "shortcutsPage.items.chatQuickReplyNavigate",
  // Availability badge label
  "shortcutsPage.notYetAvailable",
  // Navigation label (value changed)
  "appShell.nav.shortcuts",
  // Header page context label (value changed)
  "appShell.header.pages.shortcuts",
] as const;

describe("Chat Shortcuts Page i18n keys", () => {
  describe("English translations (en.json)", () => {
    it.each(SHORTCUTS_I18N_KEYS)(
      "resolves '%s' to a non-empty string",
      (key) => {
        const value = flatEn[key];
        expect(value).toBeDefined();
        expect(typeof value).toBe("string");
        expect(value.length).toBeGreaterThan(0);
      },
    );
  });

  describe("Arabic translations (ar.json)", () => {
    it.each(SHORTCUTS_I18N_KEYS)(
      "resolves '%s' to a non-empty string",
      (key) => {
        const value = flatAr[key];
        expect(value).toBeDefined();
        expect(typeof value).toBe("string");
        expect(value.length).toBeGreaterThan(0);
      },
    );
  });

  describe("All required keys are present", () => {
    it("contains all expected keys in en.json", () => {
      for (const key of SHORTCUTS_I18N_KEYS) {
        expect(flatEn).toHaveProperty(key);
      }
    });

    it("contains all expected keys in ar.json", () => {
      for (const key of SHORTCUTS_I18N_KEYS) {
        expect(flatAr).toHaveProperty(key);
      }
    });
  });
});
