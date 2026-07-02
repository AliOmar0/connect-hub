import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import fc from "fast-check";
import { ThemeProvider, useTheme, type Theme } from "./theme-provider";

// Feature: ui-ux-redesign, Task 8.1 (ThemeProvider)
// Invariant: for any sequence of theme operations, the active theme, the
// persisted localStorage value, and the `.dark` class on the document root
// stay mutually consistent (class strategy + persistence, Requirements 11.4, 19.5, 19.7).

const STORAGE_KEY = "connect-hub-theme";

type Op = { kind: "set"; theme: Theme } | { kind: "toggle" };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc
    .constantFrom<Theme>("light", "dark")
    .map((theme) => ({ kind: "set", theme }) as Op),
  fc.constant<Op>({ kind: "toggle" }),
);

function reset() {
  window.localStorage.clear();
  document.documentElement.classList.remove("dark");
}

describe("ThemeProvider invariants (property-based)", () => {
  beforeEach(reset);

  it("keeps theme, persisted value, and .dark class consistent for any op sequence", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<Theme>("light", "dark"),
        fc.array(opArb, { minLength: 1, maxLength: 25 }),
        (defaultTheme, ops) => {
          reset();
          const { result } = renderHook(() => useTheme(), {
            wrapper: (p) => (
              <ThemeProvider defaultTheme={defaultTheme}>
                {p.children}
              </ThemeProvider>
            ),
          });

          let expected: Theme = defaultTheme;
          for (const op of ops) {
            act(() => {
              if (op.kind === "set") result.current.setTheme(op.theme);
              else result.current.toggleTheme();
            });
            expected =
              op.kind === "set"
                ? op.theme
                : expected === "dark"
                  ? "light"
                  : "dark";

            expect(result.current.theme).toBe(expected);
            expect(document.documentElement.classList.contains("dark")).toBe(
              expected === "dark",
            );
            expect(window.localStorage.getItem(STORAGE_KEY)).toBe(expected);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
