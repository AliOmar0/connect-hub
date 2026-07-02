import { describe, it, expect, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  useBreakpoint,
  widthToBreakpoint,
  type Breakpoint,
} from "./use-breakpoint";

const originalInnerWidth = window.innerWidth;

function setWidth(value: number) {
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value,
  });
}

describe("widthToBreakpoint", () => {
  it("maps mobile widths to 375", () => {
    expect(widthToBreakpoint(320)).toBe(375);
    expect(widthToBreakpoint(375)).toBe(375);
    expect(widthToBreakpoint(767)).toBe(375);
  });

  it("maps tablet widths to 768", () => {
    expect(widthToBreakpoint(768)).toBe(768);
    expect(widthToBreakpoint(1023)).toBe(768);
  });

  it("maps laptop widths to 1024", () => {
    expect(widthToBreakpoint(1024)).toBe(1024);
    expect(widthToBreakpoint(1439)).toBe(1024);
  });

  it("maps desktop widths to 1440", () => {
    expect(widthToBreakpoint(1440)).toBe(1440);
    expect(widthToBreakpoint(2560)).toBe(1440);
  });
});

describe("useBreakpoint", () => {
  afterEach(() => {
    setWidth(originalInnerWidth);
  });

  it.each<[number, Breakpoint]>([
    [375, 375],
    [500, 375],
    [768, 768],
    [900, 768],
    [1024, 1024],
    [1280, 1024],
    [1440, 1440],
    [1920, 1440],
  ])("reports breakpoint %i as %i", (width, expected) => {
    setWidth(width);
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe(expected);
  });
});
