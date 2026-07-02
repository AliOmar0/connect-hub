// Feature: ui-ux-redesign, Property 32
//
// Property 32: Token changes propagate to all referencing consumers.
// For any design token and any new value assigned at its single definition,
// every consumer that references that token (via var(--token) or a bare
// token-name / Tailwind-utility mapping) resolves to the new value, and
// consumers that do not reference it are unchanged — without any per-consumer
// edit.
//
// Validates: Requirements 1.6
//
// This is a single fast-check property-based test (>= 100 iterations) that
// targets the `resolveToken` helper in src/lib/tokens.ts.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { resolveToken, type TokenMap, type TokenConsumer } from "./tokens";

// A literal token value (e.g. a resolved color). Never starts with `var(` or
// `--`, so resolveToken treats it as a concrete value rather than an alias.
const literalArb = fc
  .integer({ min: 0, max: 0xffffff })
  .map((n) => "#" + n.toString(16).padStart(6, "0"));

type TokenDef =
  | { kind: "literal"; value: string }
  | { kind: "alias"; target: number; useVar: boolean };

/**
 * Build a scenario: a DAG of token definitions (aliases only ever point to a
 * higher index, so no cycles can form and every chain terminates in a literal),
 * a set of consumers each referencing some token, a target token to mutate, and
 * the new value to assign at that target's single definition.
 */
const scenarioArb = fc.integer({ min: 2, max: 8 }).chain((n) => {
  const defArb = (i: number) =>
    i === n - 1
      ? // The highest-index token must be a literal (it cannot alias higher).
        literalArb.map((value): TokenDef => ({ kind: "literal", value }))
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
    consumers: fc.array(
      fc.record({
        idx: fc.integer({ min: 0, max: n - 1 }),
        useVar: fc.boolean(),
      }),
      { minLength: 1, maxLength: 12 },
    ),
    target: fc.integer({ min: 0, max: n - 1 }),
    newValue: literalArb,
  });
});

describe("Property 32: token changes propagate to all referencing consumers", () => {
  it("changing a token's single definition updates exactly the consumers that reference it", () => {
    fc.assert(
      fc.property(scenarioArb, ({ n, defs, consumers, target, newValue }) => {
        const names = Array.from({ length: n }, (_, i) => `--t${i}`);

        // Build the single token-definition map from the generated DAG.
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

        // The resolution chain (by index) for a consumer that starts at `start`.
        const chainOf = (start: number): number[] => {
          const chain: number[] = [];
          const seen = new Set<number>();
          let cur = start;
          while (!seen.has(cur)) {
            seen.add(cur);
            chain.push(cur);
            const def = defs[cur];
            if (def.kind === "literal") break;
            cur = def.target;
          }
          return chain;
        };

        // Assign the new value at the target token's *single* definition only.
        const updated: TokenMap = { ...tokens, [names[target]]: newValue };

        for (const { idx, useVar } of consumers) {
          const consumer: TokenConsumer = {
            tokenRef: useVar ? `var(${names[idx]})` : names[idx],
          };

          const before = resolveToken(consumer, tokens);
          const after = resolveToken(consumer, updated);

          // Sanity: every consumer references an existing token whose chain
          // terminates in a literal, so resolution is always defined.
          expect(before).toBeDefined();

          const references = chainOf(idx).includes(target);

          if (references) {
            // Referencing consumers resolve to the new value, with no
            // per-consumer edit (only the target definition changed).
            expect(after).toBe(newValue);
          } else {
            // Non-referencing consumers are completely unchanged.
            expect(after).toBe(before);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
