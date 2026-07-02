import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Controllable fake i18n instance shared with the react-i18next mock.
const listeners: Record<string, Array<() => void>> = {};
const fakeI18n = {
  language: "en",
  dir(this: { language: string }) {
    return this.language === "ar" ? "rtl" : "ltr";
  },
  on(event: string, cb: () => void) {
    (listeners[event] ??= []).push(cb);
  },
  off(event: string, cb: () => void) {
    listeners[event] = (listeners[event] ?? []).filter((fn) => fn !== cb);
  },
  emit(event: string) {
    (listeners[event] ?? []).forEach((fn) => fn());
  },
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: fakeI18n }),
}));

import { useDirection } from "./use-direction";

describe("useDirection", () => {
  beforeEach(() => {
    fakeI18n.language = "en";
    Object.keys(listeners).forEach((k) => delete listeners[k]);
  });

  it("returns ltr for English", () => {
    fakeI18n.language = "en";
    const { result } = renderHook(() => useDirection());
    expect(result.current).toBe("ltr");
  });

  it("returns rtl for Arabic", () => {
    fakeI18n.language = "ar";
    const { result } = renderHook(() => useDirection());
    expect(result.current).toBe("rtl");
  });

  it("updates when the language changes", () => {
    const { result } = renderHook(() => useDirection());
    expect(result.current).toBe("ltr");

    act(() => {
      fakeI18n.language = "ar";
      fakeI18n.emit("languageChanged");
    });

    expect(result.current).toBe("rtl");
  });
});
