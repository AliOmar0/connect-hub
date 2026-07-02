// Unit tests for the BidiText wrapper component.
//
// Verifies that embedded LTR values (masked numbers, IBANs, phones, key combos)
// are wrapped in Unicode isolates and rendered with an explicit direction so
// their character order is preserved inside an RTL layout.
//
// Requirements: 8.8, 14.4, 21.4
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRef } from "react";

import { BidiText } from "./bidi-text";

const LRI = "\u2066"; // LEFT-TO-RIGHT ISOLATE
const PDI = "\u2069"; // POP DIRECTIONAL ISOLATE

describe("BidiText", () => {
  it("wraps the value in Unicode LTR isolates", () => {
    render(<BidiText value="+970-59-123-4567" data-testid="bidi" />);
    const el = screen.getByTestId("bidi");
    expect(el.textContent).toBe(`${LRI}+970-59-123-4567${PDI}`);
  });

  it("preserves the original character order when isolates are stripped", () => {
    const value = "GB29 NWBK 6016 1331 9268 19";
    render(<BidiText value={value} data-testid="bidi" />);
    const el = screen.getByTestId("bidi");
    expect(el.textContent?.replace(/[\u2066\u2069]/g, "")).toBe(value);
  });

  it("defaults to dir='ltr'", () => {
    render(<BidiText value="4242 4242 4242 4242" data-testid="bidi" />);
    expect(screen.getByTestId("bidi")).toHaveAttribute("dir", "ltr");
  });

  it("honours an explicit dir override", () => {
    render(<BidiText value="Ctrl+K" dir="rtl" data-testid="bidi" />);
    expect(screen.getByTestId("bidi")).toHaveAttribute("dir", "rtl");
  });

  it("forwards className and standard span props", () => {
    render(
      <BidiText
        value="Ctrl+Shift+P"
        className="font-mono"
        aria-label="shortcut"
        data-testid="bidi"
      />,
    );
    const el = screen.getByTestId("bidi");
    expect(el.tagName).toBe("SPAN");
    expect(el).toHaveClass("font-mono");
    expect(el).toHaveAttribute("aria-label", "shortcut");
  });

  it("forwards the ref to the underlying span", () => {
    const ref = createRef<HTMLSpanElement>();
    render(<BidiText value="IBAN" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
  });
});
