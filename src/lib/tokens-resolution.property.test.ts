// Feature: ui-ux-redesign, Property 32
//
// Property 32: Token changes propagate to all referencing consumers
// (consumer-resolution layer).
//
// While src/lib/tokens.property.test.ts covers the *propagation* facet (a value
// changed at a token's single definition reaches every referencing consumer),
// this test targets the *consumer-resolution layer* of `resolveToken`
// (src/lib/tokens.ts): for any consumer referencing a token — including
// transitive alias chains via `var(--x)` — resolution lands on the correct
// terminal literal, honours `var(--name, fallback)` semantics, is safe against
// reference cycles, and is stable/consistent across repeated calls.
//
// Validates: Requirements 1.6

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { resolveToken, type TokenMap, type TokenConsumer } from "./tokens";

// A concrete literal token value (e.g. a resolved color). It never starts with
// `var(` or `--`, so resolveToken treats it as a terminal value, not an alias.
const literalArb = fc
  .integer({ min: 0, max: 0xffffff })
  .map((n) => "#" + n.toString(16).padStart(6, "0"));

type TokenDef =
  | { kind: "literal"; value: string }
  | { kind: "alias"; target: number; useVar: boolean };

/**
 * Build an acyclic chain scenario: token definitions where an alias only ever
 * points to a strictly higher index, guaranteeing every chain terminates in a
 * literal (the highest index is always a literal). This lets us independently
 * compute the expected terminal value for any consumer's reference.
 */
const acyclicScenarioArb = fc.integer({ min: 1, max: 10 }).chain((n) => {
  const defArb = (i: number) =>
    i === n - 1
      ? literalArb.map((value): TokenDef => ({ kind: "literal", value }))
      : fc.oneof(
          literalArb.map((value): TokenDef => ({ kind: "literal", value })),
          fc
            .integer({ min: i + 1, max: n - 1 })
            .chain((target) =>
              fc
                .boolean()
                .map((useVar): TokenDef => ({ kind: "alias", target, useVar })),
            ),
        );

  return fc.record({
    n: fc.constant(n),
    defs: fc.tuple(...Array.from({ length: n }, (_, i) => defArb(i))),
    // Each consumer starts at some token and may reference it bare or via var().
    consumers: fc.array(
      fc.record({
        idx: fc.integer({ min: 0, max: n - 1 }),
        useVar: fc.boolean(),
      }),
      { minLength: 1, maxLength: 12 },
    ),
  });
});

function buildTokenMap(defs: TokenDef[], names: string[]): TokenMap {
  const tokens: TokenMap = {};
  defs.forEach((def, i) => {
    if (def.kind === "literal") {
      tokens[names[i]] = def.value;
    } else {
      tokens[names[i]] = def.useVar
        ? `var(${names[def.target]})`
        : names[def.target];
    }
  });
  return tokens;
}

// Independently compute the expected terminal literal for the chain starting at
// `start`, following alias targets until a literal is reached.
function terminalValue(start: number, defs: TokenDef[]): string {
  let cur = start;
  // Acyclic by construction, but cap iterations defensively.
  for (let step = 0; step <= defs.length; step++) {
    const def = defs[cur];
    if (def.kind === "literal") return def.value;
    cur = def.target;
  }
  throw new Error("chain did not terminate");
}

describe("Property 32 (consumer-resolution layer): resolveToken resolves references correctly and stably", () => {
  it("resolves any consumer (bare or var(), incl. transitive alias chains) to the correct terminal literal", () => {
    fc.assert(
      fc.property(acyclicScenarioArb, ({ n, defs, consumers }) => {
        const names = Array.from({ length: n }, (_, i) => `--t${i}`);
        const tokens = buildTokenMap(defs, names);

        for (const { idx, useVar } of consumers) {
          const consumer: TokenConsumer = {
            tokenRef: useVar ? `var(${names[idx]})` : names[idx],
          };

          const expected = terminalValue(idx, defs);
          const resolved = resolveToken(consumer, tokens);

          // Correct terminal value regardless of how deep the alias chain is.
          expect(resolved).toBe(expected);

          // Stability/consistency: resolving the same consumer against the same
          // map repeatedly yields an identical result (pure resolution).
          expect(resolveToken(consumer, tokens)).toBe(resolved);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("applies var(--missing, fallback) and returns undefined for unresolvable refs without a fallback", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 8 })
          .filter((s) => /^[a-zA-Z0-9]+$/.test(s)),
        literalArb,
        (rawName, fallback) => {
          const missingName = `--missing-${rawName}`;
          // An otherwise-populated map that deliberately omits the referenced token.
          const tokens: TokenMap = { "--present": "#abcdef" };

          // With a fallback supplied, resolution returns the fallback verbatim.
          const withFallback: TokenConsumer = {
            tokenRef: `var(${missingName}, ${fallback})`,
          };
          expect(resolveToken(withFallback, tokens)).toBe(fallback);

          // Without a fallback, an unresolvable reference yields undefined.
          const bareMissing: TokenConsumer = { tokenRef: missingName };
          expect(resolveToken(bareMissing, tokens)).toBeUndefined();

          const varMissing: TokenConsumer = { tokenRef: `var(${missingName})` };
          expect(resolveToken(varMissing, tokens)).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("is cycle-safe: references inside an alias cycle resolve to undefined instead of looping forever", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 6 }),
        fc.boolean(),
        (cycleLen, useVar) => {
          // Build a closed cycle: --c0 -> --c1 -> ... -> --c{len-1} -> --c0.
          const names = Array.from({ length: cycleLen }, (_, i) => `--c${i}`);
          const tokens: TokenMap = {};
          for (let i = 0; i < cycleLen; i++) {
            const next = names[(i + 1) % cycleLen];
            tokens[names[i]] = useVar ? `var(${next})` : next;
          }

          for (let i = 0; i < cycleLen; i++) {
            const consumer: TokenConsumer = {
              tokenRef: useVar ? `var(${names[i]})` : names[i],
            };
            // Cycle guard: terminates and reports unresolvable rather than hanging.
            expect(resolveToken(consumer, tokens)).toBeUndefined();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
