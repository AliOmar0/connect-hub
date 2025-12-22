import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useToast, toast } from "./use-toast";

describe("useToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns initial empty toasts", () => {
    const { result } = renderHook(() => useToast());

    expect(result.current.toasts).toEqual([]);
  });

  it("adds a toast", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      toast({
        title: "Test Toast",
        description: "Test Description",
      });
    });

    expect(result.current.toasts.length).toBe(1);
    expect(result.current.toasts[0].title).toBe("Test Toast");
    expect(result.current.toasts[0].description).toBe("Test Description");
  });

  it("dismisses a toast", () => {
    const { result } = renderHook(() => useToast());

    let toastId: string;

    act(() => {
      const toastResult = toast({
        title: "Test Toast",
      });
      toastId = toastResult.id;
    });

    expect(result.current.toasts.length).toBe(1);

    act(() => {
      result.current.dismiss(toastId!);
    });

    expect(result.current.toasts[0].open).toBe(false);
  });

  it("limits toast count to TOAST_LIMIT", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      toast({ title: "Toast 1" });
      toast({ title: "Toast 2" });
      toast({ title: "Toast 3" });
    });

    // Should be limited to TOAST_LIMIT (1)
    expect(result.current.toasts.length).toBeLessThanOrEqual(1);
  });
});

