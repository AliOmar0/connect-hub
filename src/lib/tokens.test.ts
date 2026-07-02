import { describe, it, expect } from "vitest";
import { resolveToken, type TokenMap } from "./tokens";

const tokens: TokenMap = {
  "--navy": "#0a1f44",
  "--gold": "#c9a227",
  "--primary": "var(--navy)", // alias -> brand token
  "--accent": "--gold", // bare-name alias
  "--button-bg": "var(--primary)", // chained alias -> --navy
};

describe("resolveToken", () => {
  it("resolves a direct token reference", () => {
    expect(resolveToken({ tokenRef: "--navy" }, tokens)).toBe("#0a1f44");
  });

  it("accepts var() wrapped references", () => {
    expect(resolveToken({ tokenRef: "var(--gold)" }, tokens)).toBe("#c9a227");
  });

  it("follows a single alias", () => {
    expect(resolveToken({ tokenRef: "--primary" }, tokens)).toBe("#0a1f44");
    expect(resolveToken({ tokenRef: "--accent" }, tokens)).toBe("#c9a227");
  });

  it("follows a chained alias", () => {
    expect(resolveToken({ tokenRef: "--button-bg" }, tokens)).toBe("#0a1f44");
  });

  it("propagates a changed definition to consumers (Property 32)", () => {
    const updated: TokenMap = { ...tokens, "--navy": "#001122" };
    expect(resolveToken({ tokenRef: "--button-bg" }, updated)).toBe("#001122");
    // A consumer that does not reference --navy is unchanged.
    expect(resolveToken({ tokenRef: "--gold" }, updated)).toBe("#c9a227");
  });

  it("returns undefined for an unknown token", () => {
    expect(resolveToken({ tokenRef: "--missing" }, tokens)).toBeUndefined();
  });

  it("uses a var() fallback when the named token is missing", () => {
    expect(resolveToken({ tokenRef: "var(--missing, #ffffff)" }, tokens)).toBe(
      "#ffffff",
    );
  });

  it("guards against reference cycles", () => {
    const cyclic: TokenMap = { "--a": "var(--b)", "--b": "var(--a)" };
    expect(resolveToken({ tokenRef: "--a" }, cyclic)).toBeUndefined();
  });

  it("returns undefined for an invalid consumer", () => {
    // @ts-expect-error intentional misuse
    expect(resolveToken({}, tokens)).toBeUndefined();
  });
});
