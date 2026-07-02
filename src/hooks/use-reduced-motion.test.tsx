import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useReducedMotion } from "./use-reduced-motion";

type Listener = () => void;

describe("useReducedMotion", () => {
  const originalMatchMedia = window.matchMedia;

  function mockMatchMedia(matches: boolean) {
    const listeners = new Set<Listener>();
    const mql = {
      matches,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: (_: string, cb: Listener) => listeners.add(cb),
      removeEventListener: (_: string, cb: Listener) => listeners.delete(cb),
      addListener: (cb: Listener) => listeners.add(cb),
      removeListener: (cb: Listener) => listeners.delete(cb),
      dispatchEvent: vi.fn(),
      _emit(next: boolean) {
        (mql as { matches: boolean }).matches = next;
        listeners.forEach((cb) => cb());
      },
    };
    window.matchMedia = vi.fn(() => mql) as unknown as typeof window.matchMedia;
    return mql;
  }

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  it("returns true when reduced motion is preferred", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it("returns false when motion is allowed", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it("defaults to reduced motion when matchMedia is unavailable", () => {
    // @ts-expect-error simulate environment without matchMedia
    window.matchMedia = undefined;
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it("defaults to reduced motion when matchMedia throws", () => {
    window.matchMedia = vi.fn(() => {
      throw new Error("unreadable");
    }) as unknown as typeof window.matchMedia;
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it("updates when the preference changes", () => {
    const mql = mockMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    act(() => {
      mql._emit(true);
    });

    expect(result.current).toBe(true);
  });
});
