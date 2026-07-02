// Design-token resolution for the design system (Requirement 1.6, Property 32).
// A "consumer" references a token by name (e.g. a component that uses
// `var(--primary)`). Resolution follows the reference into the single token
// definition map, transitively resolving token-to-token aliases, so that
// changing a value at its single definition propagates to every consumer
// without any per-consumer edit.

/** A flat map of token name -> resolved (or aliasing) value. */
export type TokenMap = Record<string, string>;

/** Something that references a design token. */
export interface TokenConsumer {
  /** Optional identifier for diagnostics (component/page + styled property). */
  name?: string;
  /** The token reference, e.g. `--primary`, `var(--primary)`, or `var(--x, #fff)`. */
  tokenRef: string;
}

interface ParsedRef {
  name: string;
  fallback?: string;
}

/**
 * Normalize a token reference into a bare token name plus optional fallback.
 * Accepts `--name`, `var(--name)`, and `var(--name, fallback)` forms.
 */
function parseRef(ref: string): ParsedRef | null {
  if (typeof ref !== "string") return null;
  let value = ref.trim();

  const varMatch = /^var\(\s*(.+)\s*\)$/i.exec(value);
  if (varMatch) {
    const inner = varMatch[1];
    const commaIdx = inner.indexOf(",");
    if (commaIdx >= 0) {
      return {
        name: inner.slice(0, commaIdx).trim(),
        fallback: inner.slice(commaIdx + 1).trim(),
      };
    }
    value = inner.trim();
  }

  if (!value) return null;
  return { name: value };
}

/**
 * Resolve a consumer's token reference to its concrete value using the token
 * map. Transitively follows token aliases (a token whose value is itself a
 * `var(--other)` reference), guards against reference cycles, and applies a
 * `var(--name, fallback)` fallback when the named token is absent.
 *
 * Returns the resolved literal value, or `undefined` when the reference cannot
 * be resolved and no fallback is available.
 */
export function resolveToken(
  consumer: TokenConsumer,
  tokens: TokenMap,
): string | undefined {
  if (!consumer || typeof consumer.tokenRef !== "string") return undefined;

  const seen = new Set<string>();
  let parsed = parseRef(consumer.tokenRef);

  while (parsed) {
    const { name, fallback } = parsed;

    if (seen.has(name)) return undefined; // cycle guard
    seen.add(name);

    const value = tokens[name];
    if (value === undefined) {
      // Named token missing: use the fallback if the reference provided one.
      return fallback !== undefined ? fallback : undefined;
    }

    // If the value is itself a token reference, keep resolving; otherwise it is
    // the concrete literal value.
    const next = parseRef(value);
    if (
      next &&
      (value.trim().startsWith("var(") || value.trim().startsWith("--"))
    ) {
      parsed = next;
      continue;
    }
    return value;
  }

  return undefined;
}
