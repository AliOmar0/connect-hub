import { describe, it, expect } from "vitest";
import {
  MOTION_DURATIONS,
  MOTION_TOKEN_VARS,
  resolveMotionDuration,
  resolveMotionDurationMs,
  type MotionToken,
} from "./motion";

const TOKENS: MotionToken[] = ["fast", "base", "slow"];

describe("resolveMotionDuration", () => {
  it("returns 0 for every token under reduced motion", () => {
    for (const token of TOKENS) {
      expect(resolveMotionDuration(token, true)).toBe(0);
    }
  });

  it("returns the bounded token value when motion is allowed", () => {
    expect(resolveMotionDuration("fast", false)).toBe(120);
    expect(resolveMotionDuration("base", false)).toBe(240);
    expect(resolveMotionDuration("slow", false)).toBe(400);
  });

  it("keeps every token within the 100-500ms design range", () => {
    for (const token of TOKENS) {
      const value = MOTION_DURATIONS[token];
      expect(value).toBeGreaterThanOrEqual(100);
      expect(value).toBeLessThanOrEqual(500);
    }
  });

  it("exposes at least three distinct named durations", () => {
    const distinct = new Set(Object.values(MOTION_DURATIONS));
    expect(distinct.size).toBeGreaterThanOrEqual(3);
  });
});

describe("resolveMotionDurationMs", () => {
  it("formats 0ms under reduced motion", () => {
    expect(resolveMotionDurationMs("base", true)).toBe("0ms");
  });

  it("formats the token value with a ms suffix when motion is allowed", () => {
    expect(resolveMotionDurationMs("fast", false)).toBe("120ms");
    expect(resolveMotionDurationMs("slow", false)).toBe("400ms");
  });
});

describe("MOTION_TOKEN_VARS", () => {
  it("maps each token to its CSS custom property name", () => {
    expect(MOTION_TOKEN_VARS).toEqual({
      fast: "--motion-fast",
      base: "--motion-base",
      slow: "--motion-slow",
    });
  });
});
