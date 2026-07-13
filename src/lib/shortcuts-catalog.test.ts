import { describe, it, expect } from "vitest";
import {
  resolveCatalogShortcutKeys,
  getAvailabilityBadgeLabel,
  type CatalogShortcutInput,
} from "./shortcuts";

describe("resolveCatalogShortcutKeys", () => {
  describe("planned entries", () => {
    it("returns empty string for planned entry regardless of keys", () => {
      const entry: CatalogShortcutInput = {
        availability: "planned",
        keys: "Enter",
      };
      expect(resolveCatalogShortcutKeys(entry, true)).toBe("");
      expect(resolveCatalogShortcutKeys(entry, false)).toBe("");
    });

    it("returns empty string for planned entry with platform-pair keys", () => {
      const entry: CatalogShortcutInput = {
        availability: "planned",
        keys: { mac: "Cmd+R", other: "Ctrl+R" },
      };
      expect(resolveCatalogShortcutKeys(entry, true)).toBe("");
      expect(resolveCatalogShortcutKeys(entry, false)).toBe("");
    });

    it("returns empty string for planned entry with undefined keys", () => {
      const entry: CatalogShortcutInput = {
        availability: "planned",
      };
      expect(resolveCatalogShortcutKeys(entry, true)).toBe("");
      expect(resolveCatalogShortcutKeys(entry, false)).toBe("");
    });
  });

  describe("available entries with single string keys", () => {
    it("returns the string as-is for available entry", () => {
      const entry: CatalogShortcutInput = {
        availability: "available",
        keys: "Enter",
      };
      expect(resolveCatalogShortcutKeys(entry, true)).toBe("Enter");
      expect(resolveCatalogShortcutKeys(entry, false)).toBe("Enter");
    });

    it("returns the string as-is for special characters", () => {
      const entry: CatalogShortcutInput = {
        availability: "available",
        keys: "\\",
      };
      expect(resolveCatalogShortcutKeys(entry, true)).toBe("\\");
      expect(resolveCatalogShortcutKeys(entry, false)).toBe("\\");
    });
  });

  describe("available entries with platform-pair keys", () => {
    it("returns mac branch when isMac is true", () => {
      const entry: CatalogShortcutInput = {
        availability: "available",
        keys: { mac: "Cmd+B", other: "Ctrl+B" },
      };
      expect(resolveCatalogShortcutKeys(entry, true)).toBe("Cmd+B");
    });

    it("returns other branch when isMac is false", () => {
      const entry: CatalogShortcutInput = {
        availability: "available",
        keys: { mac: "Cmd+B", other: "Ctrl+B" },
      };
      expect(resolveCatalogShortcutKeys(entry, false)).toBe("Ctrl+B");
    });
  });

  describe("available entries with undefined keys", () => {
    it("returns empty string when keys is undefined", () => {
      const entry: CatalogShortcutInput = {
        availability: "available",
      };
      expect(resolveCatalogShortcutKeys(entry, true)).toBe("");
      expect(resolveCatalogShortcutKeys(entry, false)).toBe("");
    });
  });
});

describe("getAvailabilityBadgeLabel", () => {
  it("returns null for available entries", () => {
    const entry = { availability: "available" as const };
    const translate = (key: string) => `translated:${key}`;
    expect(getAvailabilityBadgeLabel(entry, translate)).toBeNull();
  });

  it("returns translated label for planned entries", () => {
    const entry = { availability: "planned" as const };
    const translate = (key: string) => `translated:${key}`;
    expect(getAvailabilityBadgeLabel(entry, translate)).toBe(
      "translated:shortcutsPage.notYetAvailable",
    );
  });

  it("uses the correct i18n key for planned entries", () => {
    const entry = { availability: "planned" as const };
    let capturedKey = "";
    const translate = (key: string) => {
      capturedKey = key;
      return "Not yet available";
    };
    getAvailabilityBadgeLabel(entry, translate);
    expect(capturedKey).toBe("shortcutsPage.notYetAvailable");
  });
});
