import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFocusReturn } from "./use-focus-return";

describe("useFocusReturn", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("restores focus to the opener that had focus when captured", () => {
    const opener = document.createElement("button");
    opener.textContent = "Open dialog";
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { result } = renderHook(() => useFocusReturn());

    // Dialog opens: capture the opener, then focus moves into the dialog.
    act(() => result.current.capture());
    const dialogInput = document.createElement("input");
    document.body.appendChild(dialogInput);
    dialogInput.focus();
    expect(document.activeElement).toBe(dialogInput);

    // Dialog closes: focus returns to the opener.
    act(() => result.current.restore());
    expect(document.activeElement).toBe(opener);
  });

  it("accepts an explicit opener element", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    const other = document.createElement("button");
    document.body.appendChild(other);
    other.focus();

    const { result } = renderHook(() => useFocusReturn());

    act(() => result.current.capture(opener));
    act(() => result.current.restore());

    expect(document.activeElement).toBe(opener);
  });

  it("falls back to the first focusable control in the same region when the opener is gone", () => {
    const region = document.createElement("section");
    const sibling = document.createElement("button");
    sibling.textContent = "Sibling";
    const opener = document.createElement("button");
    opener.textContent = "Opener";
    // sibling is first in DOM order, so it is the deterministic fallback.
    region.appendChild(sibling);
    region.appendChild(opener);
    document.body.appendChild(region);

    opener.focus();

    const { result } = renderHook(() => useFocusReturn());
    act(() => result.current.capture());

    // The opener is removed from the DOM (e.g., its list item was deleted).
    region.removeChild(opener);

    act(() => result.current.restore());
    expect(document.activeElement).toBe(sibling);
  });

  it("prefers an explicit fallback over the region-derived fallback", () => {
    const region = document.createElement("section");
    const sibling = document.createElement("button");
    const opener = document.createElement("button");
    region.appendChild(sibling);
    region.appendChild(opener);
    document.body.appendChild(region);

    const explicitFallback = document.createElement("button");
    explicitFallback.textContent = "Explicit";
    document.body.appendChild(explicitFallback);

    opener.focus();

    const { result } = renderHook(() =>
      useFocusReturn({ fallback: () => explicitFallback }),
    );
    act(() => result.current.capture());
    region.removeChild(opener);

    act(() => result.current.restore());
    expect(document.activeElement).toBe(explicitFallback);
  });

  it("skips a non-focusable (disabled) opener and uses the fallback", () => {
    const region = document.createElement("section");
    const fallback = document.createElement("button");
    const opener = document.createElement("button");
    region.appendChild(fallback);
    region.appendChild(opener);
    document.body.appendChild(region);

    opener.focus();

    const { result } = renderHook(() => useFocusReturn());
    act(() => result.current.capture());

    // Opener stays in the DOM but becomes unfocusable.
    opener.setAttribute("disabled", "");

    act(() => result.current.restore());
    expect(document.activeElement).toBe(fallback);
  });

  it("does not throw when there is no opener and no fallback", () => {
    const { result } = renderHook(() => useFocusReturn());
    expect(() => {
      act(() => {
        result.current.capture(null);
        result.current.restore();
      });
    }).not.toThrow();
  });
});
