// Feature: ui-ux-redesign, Property 33
//
// Property 33: Every token is documented.
// For any Design_Token in the registry (declared once in src/index.css), the
// design system reference (design-system.md at repo root) contains a matching
// entry with a non-empty name, value, and intended-usage note.
//
// Validates: Requirements 1.7
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fc from "fast-check";

// Resolve paths relative to this test file so the suite is cwd-independent.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const cssPath = path.join(repoRoot, "src", "index.css");
const docPath = path.join(repoRoot, "design-system.md");

const css = readFileSync(cssPath, "utf8");
const doc = readFileSync(docPath, "utf8");

// Strip block comments so token *mentions* in commentary are not parsed as
// declarations — only real `--name: value;` declarations form the registry.
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * The token registry: every CSS custom property *declared* in index.css.
 * A declaration is `--name:` (the property followed by a colon); `var(--x)`
 * references are not declarations and are excluded.
 */
function parseTokenNames(source: string): string[] {
  const re = /(--[a-z0-9-]+)\s*:/gi;
  const names = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    names.add(m[1]);
  }
  return [...names];
}

const tokenNames = parseTokenNames(cssNoComments);

// Documentation is authored as Markdown tables; index rows by line.
const docLines = doc.split(/\r?\n/);

/**
 * Find the documentation table row that declares `token` and return its
 * trimmed cells. A row "declares" a token when one of its cells is exactly the
 * token's code span (`` `--token` ``), which avoids matching substrings such as
 * `--radius` inside `--radius-lg` or `var(--radius)`.
 */
function findDocRow(token: string): string[] | null {
  const span = "`" + token + "`";
  for (const line of docLines) {
    if (!line.includes("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    if (cells.some((c) => c === span)) return cells;
  }
  return null;
}

describe("design token documentation completeness", () => {
  it("parses a non-empty token registry from src/index.css", () => {
    // Guard: a broken parser must not vacuously pass the property below.
    expect(tokenNames.length).toBeGreaterThan(0);
  });

  it("documents every design token with a name, value, and usage note (Property 33)", () => {
    fc.assert(
      fc.property(fc.constantFrom(...tokenNames), (token) => {
        const row = findDocRow(token);
        expect(
          row,
          `token ${token} must have a documented entry in design-system.md`,
        ).not.toBeNull();

        const cells = row as string[];
        const span = "`" + token + "`";
        const idx = cells.findIndex((c) => c === span);

        // Name: the matched code span is the documented token name.
        expect(cells[idx]).toBe(span);

        // Value: the cell immediately following the name holds the token value
        // and must be non-empty.
        const value = cells[idx + 1] ?? "";
        expect(
          value.length,
          `token ${token} must document a non-empty value`,
        ).toBeGreaterThan(0);

        // Usage: the row's last non-empty cell is the intended-usage note and
        // must be non-empty and distinct from the name cell.
        const nonEmpty = cells.filter((c) => c.length > 0);
        const usage = nonEmpty[nonEmpty.length - 1] ?? "";
        expect(
          usage.length,
          `token ${token} must document a non-empty intended-usage note`,
        ).toBeGreaterThan(0);
        expect(usage).not.toBe(span);
      }),
      { numRuns: Math.max(100, tokenNames.length * 3) },
    );
  });
});
