// Feature: ui-ux-redesign, Property 34
//
// Property 34: Styled values reference tokens, not literals.
// For any color, spacing, radius, typography, or elevation value applied by a
// Shared_Component or Page, the value resolves to a Design_Token reference
// rather than a hard-coded literal.
//
// Validates: Requirements 1.2
//
// This is a single fast-check property-based test (>= 100 iterations). It
// enumerates the real className strings of the shadcn/ui interactive primitives
// made token-driven in task 5.1 (button, input, select, checkbox, radio-group,
// switch, toggle, dropdown-menu — every file carrying the
// "Token-driven states (Requirements 10.1, 1.2, ...)" contract), tokenizes the
// utility classes, and samples over the resulting set of *styled values*. For
// each sampled styled value the test asserts it references a design token and is
// never a hard-coded literal — specifically it is not a hex color (`#rrggbb`),
// not a Tailwind palette literal (`bg-red-500`), and not an arbitrary bracket
// value carrying a raw color or px measurement (`bg-[#fff]`, `p-[13px]`).
// Color-bearing utilities are further required to resolve to a documented
// token color root from tailwind.config.ts. Decorative opt-in utilities
// (glow / gradient / backdrop-blur / animation) documented in design-system.md
// are scoped out, since the property targets non-decorative styling only.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import fc from "fast-check";

// Directory of this test file === src/components/ui (co-located primitives).
const UI_DIR = dirname(fileURLToPath(import.meta.url));

// The interactive primitives updated in task 5.1 (Requirements 10.1, 1.2, ...).
// These are the components whose styling was brought fully under design tokens.
const SCOPED_PRIMITIVES = [
  "button.tsx",
  "input.tsx",
  "select.tsx",
  "checkbox.tsx",
  "radio-group.tsx",
  "switch.tsx",
  "toggle.tsx",
  "dropdown-menu.tsx",
] as const;

// ---------------------------------------------------------------------------
// Token registry (mirrors tailwind.config.ts color theme). A color utility is
// a token reference iff its value begins with one of these documented roots
// (e.g. `primary`, `primary-foreground`, `sidebar-accent-foreground`, `chart`)
// or is a direction-neutral color keyword.
// ---------------------------------------------------------------------------
const TOKEN_COLOR_ROOTS = new Set([
  "background",
  "foreground",
  "card",
  "popover",
  "primary",
  "secondary",
  "muted",
  "accent",
  "destructive",
  "border",
  "input",
  "ring",
  "sidebar",
  "navy",
  "gold",
  "chart",
  "status",
]);
const COLOR_KEYWORDS = new Set([
  "transparent",
  "current",
  "currentColor",
  "inherit",
]);

// Utility prefixes that carry a *color* value. Ordered longest-first so
// `ring-offset` is matched before `ring`.
const COLOR_PREFIXES = [
  "ring-offset",
  "bg",
  "text",
  "border",
  "ring",
  "fill",
  "stroke",
  "outline",
  "divide",
  "decoration",
  "from",
  "via",
  "to",
];

// Prefixes that denote a "styled value" in one of the Property-34 categories
// (color / spacing / radius / typography / elevation). Used to build the
// sample space; longest-first for deterministic matching.
const STYLED_PREFIXES = [
  ...COLOR_PREFIXES,
  "min-w",
  "min-h",
  "max-w",
  "max-h",
  "rounded",
  "shadow",
  "leading",
  "tracking",
  "font",
  "gap-x",
  "gap-y",
  "space-x",
  "space-y",
  "gap",
  "px",
  "py",
  "pt",
  "pr",
  "pb",
  "pl",
  "ps",
  "pe",
  "mx",
  "my",
  "mt",
  "mr",
  "mb",
  "ml",
  "ms",
  "me",
  "inset",
  "top",
  "right",
  "bottom",
  "left",
  "start",
  "end",
  "size",
  "w",
  "h",
  "p",
  "m",
].sort((a, b) => b.length - a.length);

// Tailwind default palette color names — any of these used as a utility value
// is a hard-coded literal (the design forbids them in favour of semantic
// tokens). `white`/`black` included.
const PALETTE = [
  "slate",
  "gray",
  "grey",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
  "white",
  "black",
];
const PALETTE_LITERAL = new RegExp(
  `^(?:${COLOR_PREFIXES.join("|")})-(?:${PALETTE.join("|")})(?:-\\d{2,3})?$`,
);

// Arbitrary bracket value carrying a raw color or px measurement, e.g.
// `bg-[#fff]`, `text-[rgb(0,0,0)]`, `p-[13px]`, `h-[44px]`. Bracket values that
// reference CSS custom properties (`h-[var(--x)]`) or rem units (`min-w-[8rem]`)
// are structural, not literals, and are intentionally NOT matched.
const ARBITRARY_LITERAL = /-\[[^\]]*(?:#|\d*\.?\d+px|rgba?\(|hsla?\()[^\]]*\]/;
const HEX_LITERAL = /#[0-9a-fA-F]{3,8}\b/;

// Decorative opt-in utilities (design-system.md): glow shadows, gradients,
// backdrop blur, and keyframe animations. Scoped OUT of the assertion.
function isDecorative(root: string): boolean {
  return (
    root.startsWith("shadow-glow") ||
    root === "backdrop-blur" ||
    root.startsWith("backdrop-blur-") ||
    root.startsWith("animate-") ||
    root.startsWith("bg-gradient")
  );
}

// Split a class on ':' at bracket-depth 0 so Tailwind variant modifiers
// (`hover:`, `focus-visible:`, `data-[state=open]:`, `aria-[invalid=true]:`,
// `[&_svg]:`) are stripped while arbitrary values are preserved. Returns the
// bare utility (last segment).
function stripModifiers(cls: string): string {
  let depth = 0;
  let start = 0;
  let last = cls;
  for (let i = 0; i < cls.length; i++) {
    const ch = cls[i];
    if (ch === "[") depth++;
    else if (ch === "]") depth--;
    else if (ch === ":" && depth === 0) {
      start = i + 1;
    }
  }
  last = cls.slice(start);
  return last;
}

// Remove a trailing Tailwind opacity modifier (`bg-primary/90` -> `bg-primary`).
function stripOpacity(base: string): string {
  return base.replace(/\/[0-9.]+$/, "");
}

function matchPrefix(base: string, prefixes: string[]): string | null {
  for (const p of prefixes) {
    if (base === p || base.startsWith(p + "-")) return p;
  }
  return null;
}

type Kind = "token" | "literal" | "decorative" | "ignore";
interface Classified {
  raw: string;
  base: string;
  root: string;
  kind: Kind;
  isColor: boolean;
}

function classify(raw: string): Classified {
  const base = stripModifiers(raw);
  const root = stripOpacity(base);

  if (isDecorative(root)) {
    return { raw, base, root, kind: "decorative", isColor: false };
  }

  // Disallowed literal forms (hex / palette / arbitrary color-or-px).
  if (
    HEX_LITERAL.test(raw) ||
    ARBITRARY_LITERAL.test(base) ||
    PALETTE_LITERAL.test(root)
  ) {
    return { raw, base, root, kind: "literal", isColor: true };
  }

  const colorPrefix = matchPrefix(root, COLOR_PREFIXES);
  if (colorPrefix) {
    const value = root.slice(colorPrefix.length + 1); // strip "prefix-"
    if (COLOR_KEYWORDS.has(value)) {
      return { raw, base, root, kind: "token", isColor: true };
    }
    const valueRoot = value.split("-")[0];
    if (TOKEN_COLOR_ROOTS.has(valueRoot)) {
      return { raw, base, root, kind: "token", isColor: true };
    }
    // A color-prefixed utility whose value is not a color (e.g. `text-sm`,
    // `border-2`, `ring-2`, `outline-none`): not a color, not a literal.
    return { raw, base, root, kind: "ignore", isColor: false };
  }

  return { raw, base, root, kind: "ignore", isColor: false };
}

function isStyledValue(base: string): boolean {
  return matchPrefix(base, STYLED_PREFIXES) !== null;
}

// Extract every double-quoted string literal from a source file and split it
// into whitespace-separated class tokens. Class strings in these primitives are
// all double-quoted arguments to `cn()` / `cva()`; comments use backticks, so
// prose is not captured.
function extractClassTokens(source: string): string[] {
  const tokens: string[] = [];
  const stringRe = /"([^"\n]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = stringRe.exec(source)) !== null) {
    for (const t of m[1].split(/\s+/)) {
      if (t) tokens.push(t);
    }
  }
  return tokens;
}

// Build the corpus of styled values across all scoped primitives.
interface StyledEntry extends Classified {
  file: string;
}
const styledValues: StyledEntry[] = [];
for (const file of SCOPED_PRIMITIVES) {
  const source = readFileSync(join(UI_DIR, file), "utf8");
  for (const raw of extractClassTokens(source)) {
    const base = stripModifiers(raw);
    if (!isStyledValue(base)) continue;
    const c = classify(raw);
    if (c.kind === "decorative") continue; // scope out decorative opt-ins
    styledValues.push({ ...c, file });
  }
}

describe("Property 34: styled values reference tokens, not literals", () => {
  // Guards: the corpus must be populated and must contain real color tokens,
  // otherwise the property below would pass vacuously.
  it("enumerates a non-empty corpus of styled values including color tokens", () => {
    expect(styledValues.length).toBeGreaterThan(0);
    expect(styledValues.some((s) => s.isColor && s.kind === "token")).toBe(
      true,
    );
  });

  it("has no hard-coded literal among the scoped primitives (diagnostic)", () => {
    const literals = styledValues.filter((s) => s.kind === "literal");
    // Surface any offending class + file to make failures actionable.
    expect(literals.map((l) => `${l.file}: ${l.raw}`)).toEqual([]);
  });

  it("every sampled styled value resolves to a design token, never a literal", () => {
    const indexArb = fc.integer({ min: 0, max: styledValues.length - 1 });
    fc.assert(
      fc.property(indexArb, (i) => {
        const entry = styledValues[i];

        // No styled value may be a hard-coded literal (hex, palette, or an
        // arbitrary color/px bracket value).
        expect(entry.kind).not.toBe("literal");

        // Color-bearing utilities must resolve to a documented token color
        // root (or a direction-neutral color keyword).
        if (entry.isColor && entry.kind === "token") {
          const colorPrefix = matchPrefix(entry.root, COLOR_PREFIXES)!;
          const value = entry.root.slice(colorPrefix.length + 1);
          const resolvesToToken =
            COLOR_KEYWORDS.has(value) ||
            TOKEN_COLOR_ROOTS.has(value.split("-")[0]);
          expect(resolvesToToken).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });
});
