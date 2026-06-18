import { describe, it, expect } from "vitest";
import {
  BACKEND_URL,
  NODE_API_URL,
  KB_API_URL,
  SLA_BUSINESS_HOURS_SECONDS,
  SLA_OUT_OF_HOURS_SECONDS,
} from "./config";

describe("config", () => {
  it("exposes string URL defaults", () => {
    expect(typeof BACKEND_URL).toBe("string");
    expect(typeof NODE_API_URL).toBe("string");
    expect(KB_API_URL).toContain("/kb");
  });

  it("exposes numeric SLA windows", () => {
    expect(Number.isFinite(SLA_BUSINESS_HOURS_SECONDS)).toBe(true);
    expect(Number.isFinite(SLA_OUT_OF_HOURS_SECONDS)).toBe(true);
    expect(SLA_BUSINESS_HOURS_SECONDS).toBeGreaterThan(0);
    expect(SLA_OUT_OF_HOURS_SECONDS).toBeGreaterThan(0);
  });
});
