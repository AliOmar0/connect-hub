// Feature: ui-ux-redesign, Property 2
//
// Property 2: Status meaning carries a non-color cue.
//
// For any status indicator — message authorship, SLA countdown, Role label,
// notification read/unread state, or generic status — the indicator includes at
// least one non-color cue (text label, icon, or shape) in addition to color.
// This targets the pure `resolveStatusCue` mapping in src/lib/status-cue.ts,
// whose descriptors carry an icon (shape) and a text label alongside color.
//
// Validates: Requirements 3.5, 14.7, 15.2, 18.5, 20.2

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  resolveStatusCue,
  STATUS_ICONS,
  type StatusCueInput,
  type GenericStatus,
  type MessageAuthor,
  type Role,
  type ReadState,
} from "./status-cue";

// Generators spanning every status kind and every value within each kind.
const genericArb: fc.Arbitrary<StatusCueInput> = fc
  .constantFrom(...(Object.keys(STATUS_ICONS) as GenericStatus[]))
  .map((value) => ({ kind: "generic", value }));

const authorshipArb: fc.Arbitrary<StatusCueInput> = fc
  .constantFrom<MessageAuthor>("customer", "agent", "bot")
  .map((value) => ({ kind: "authorship", value }));

const roleArb: fc.Arbitrary<StatusCueInput> = fc
  .constantFrom<Role>("agent", "supervisor", "manager", "admin")
  .map((value) => ({ kind: "role", value }));

const notificationArb: fc.Arbitrary<StatusCueInput> = fc
  .constantFrom<ReadState>("read", "unread")
  .map((value) => ({ kind: "notification", value }));

// SLA countdowns cover the full clock: comfortably remaining, near-breach, and
// already breached (zero / negative), which is where a naive "color only"
// indicator would be indistinguishable without text.
const slaArb: fc.Arbitrary<StatusCueInput> = fc
  .integer({ min: -3600, max: 24 * 3600 })
  .map((remainingSeconds) => ({ kind: "sla", remainingSeconds }));

const statusInputArb: fc.Arbitrary<StatusCueInput> = fc.oneof(
  genericArb,
  authorshipArb,
  roleArb,
  notificationArb,
  slaArb,
);

describe("Property 2: status meaning carries a non-color cue", () => {
  it("produces a descriptor with a non-empty non-color cue for every status kind and value", () => {
    fc.assert(
      fc.property(statusInputArb, (input) => {
        const descriptor = resolveStatusCue(input);

        // A non-color cue must exist: both the icon (shape) and the text label
        // are populated, so meaning survives with color removed entirely.
        expect(typeof descriptor.icon).toBe("string");
        expect(descriptor.icon.trim().length).toBeGreaterThan(0);
        expect(typeof descriptor.label).toBe("string");
        expect(descriptor.label.trim().length).toBeGreaterThan(0);

        // The descriptor faithfully reflects the requested indicator.
        expect(descriptor.kind).toBe(input.kind);
      }),
      { numRuns: 200 },
    );
  });

  it("maps generic statuses to the documented design-system icon convention", () => {
    fc.assert(
      fc.property(genericArb, (input) => {
        const descriptor = resolveStatusCue(input);
        // Guards the convention icons themselves are never blank.
        expect(descriptor.icon).toBe(
          STATUS_ICONS[input.value as GenericStatus],
        );
        expect(descriptor.icon.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});
