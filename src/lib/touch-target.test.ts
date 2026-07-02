import { describe, it, expect } from "vitest";
import {
  TOUCH_TARGET_MIN_PX,
  MIN_ADJACENT_GAP_PX,
  TOUCH_TARGET_TOKEN,
  TOUCH_GAP_TOKEN,
  TOUCH_TARGET_CLASS,
  TOUCH_TARGET_HIT_CLASS,
  TOUCH_GAP_CLASS,
  touchTargetClass,
  touchGapClass,
  meetsTouchTargetSize,
  isSmallTarget,
  meetsAdjacentSeparation,
} from "./touch-target";

describe("touch-target constants", () => {
  it("mirrors the spacing-scale thresholds", () => {
    expect(TOUCH_TARGET_MIN_PX).toBe(44);
    expect(MIN_ADJACENT_GAP_PX).toBe(8);
    expect(TOUCH_TARGET_TOKEN).toBe("--space-11");
    expect(TOUCH_GAP_TOKEN).toBe("--space-2");
  });

  it("exposes the utility class names used in index.css", () => {
    expect(TOUCH_TARGET_CLASS).toBe("touch-target");
    expect(TOUCH_TARGET_HIT_CLASS).toBe("touch-target-hit");
    expect(TOUCH_GAP_CLASS).toBe("touch-gap");
  });
});

describe("touchTargetClass", () => {
  it("grows the visible box by default", () => {
    expect(touchTargetClass()).toBe("touch-target");
    expect(touchTargetClass("grow")).toBe("touch-target");
  });

  it("extends the hit area without resizing the box", () => {
    expect(touchTargetClass("extend")).toBe("touch-target-hit");
  });

  it("merges additional classes", () => {
    expect(touchTargetClass("grow", "rounded-full")).toBe(
      "touch-target rounded-full",
    );
  });
});

describe("touchGapClass", () => {
  it("returns the gap utility and merges extras", () => {
    expect(touchGapClass()).toBe("touch-gap");
    expect(touchGapClass("flex")).toBe("touch-gap flex");
  });
});

describe("meetsTouchTargetSize", () => {
  it("accepts activation areas at or above 44x44", () => {
    expect(meetsTouchTargetSize(44, 44)).toBe(true);
    expect(meetsTouchTargetSize(48, 60)).toBe(true);
  });

  it("rejects activation areas below the minimum in either dimension", () => {
    expect(meetsTouchTargetSize(43, 44)).toBe(false);
    expect(meetsTouchTargetSize(44, 20)).toBe(false);
    expect(meetsTouchTargetSize(24, 24)).toBe(false);
  });
});

describe("isSmallTarget", () => {
  it("flags controls smaller than 44px in any dimension", () => {
    expect(isSmallTarget(24, 24)).toBe(true);
    expect(isSmallTarget(44, 20)).toBe(true);
    expect(isSmallTarget(20, 44)).toBe(true);
  });

  it("does not flag controls at or above the minimum", () => {
    expect(isSmallTarget(44, 44)).toBe(false);
    expect(isSmallTarget(50, 50)).toBe(false);
  });
});

describe("meetsAdjacentSeparation", () => {
  it("requires >=8px only when both controls are small", () => {
    expect(meetsAdjacentSeparation(8, true, true)).toBe(true);
    expect(meetsAdjacentSeparation(12, true, true)).toBe(true);
    expect(meetsAdjacentSeparation(7, true, true)).toBe(false);
    expect(meetsAdjacentSeparation(0, true, true)).toBe(false);
  });

  it("does not constrain separation when at least one control is >=44px", () => {
    expect(meetsAdjacentSeparation(0, false, true)).toBe(true);
    expect(meetsAdjacentSeparation(0, true, false)).toBe(true);
    expect(meetsAdjacentSeparation(0, false, false)).toBe(true);
  });

  it("treats overlapping (negative) gaps between small targets as failing", () => {
    expect(meetsAdjacentSeparation(-2, true, true)).toBe(false);
  });
});
