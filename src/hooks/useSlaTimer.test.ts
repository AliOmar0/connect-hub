import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSlaTimer, formatCountdown } from "./useSlaTimer";

describe("formatCountdown", () => {
  it("formats positive seconds as m:ss", () => {
    expect(formatCountdown(125)).toBe("2:05");
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(9)).toBe("0:09");
  });

  it("formats negative (breached) seconds with a leading minus", () => {
    expect(formatCountdown(-65)).toBe("-1:05");
  });
});

describe("useSlaTimer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is not breached for a session that just started", () => {
    const { result } = renderHook(() => useSlaTimer(new Date().toISOString()));
    expect(result.current.breached).toBe(false);
    expect(result.current.remainingSeconds).toBeGreaterThan(0);
    expect(result.current.windowSeconds).toBeGreaterThan(0);
  });

  it("is breached for a session started long ago", () => {
    const { result } = renderHook(() =>
      useSlaTimer("2000-01-01T00:00:00.000Z"),
    );
    expect(result.current.breached).toBe(true);
    expect(result.current.remainingSeconds).toBeLessThanOrEqual(0);
  });

  it("counts down over time", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSlaTimer(new Date().toISOString()));
    const start = result.current.remainingSeconds;
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.remainingSeconds).toBeLessThanOrEqual(start);
  });
});
