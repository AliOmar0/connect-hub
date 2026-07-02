// Feature: ui-ux-redesign, Property 20
//
// Property 20: Component states are pairwise distinguishable.
// For any interactive control and for any two of its defined Component_States
// (default, hover, focus, active, disabled), the resolved style descriptors for
// the two states differ in at least one visual dimension.
//
// Validates: Requirements 10.1
//
// Strategy: Task 5.1 expressed each interactive primitive's states as token-based
// Tailwind utilities (via class-variance-authority or inline class strings) in
// `src/components/ui/*`. This test extracts, for each control, the class-string
// descriptor and resolves it per state by keeping the utilities that are active
// in that state (base utilities plus the ones gated on that state's variant).
// Two states are "distinguishable" iff their resolved utility sets differ.

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { buttonVariants } from "./button";
import { toggleVariants } from "./toggle";

// The five interaction states enumerated by Requirement 10.1 / Property 20.
type FiveState = "default" | "hover" | "focus" | "active" | "disabled";
const NON_DEFAULT_STATES: Exclude<FiveState, "default">[] = [
  "hover",
  "focus",
  "active",
  "disabled",
];

// Tailwind variant prefixes that gate a utility on one of the five states.
// `focus`/`focus-visible` both map to focus; `disabled`/`aria-disabled`/
// `data-[disabled]` all map to the disabled state.
const INTERACTION_VARIANTS: Record<string, Exclude<FiveState, "default">> = {
  hover: "hover",
  focus: "focus",
  "focus-visible": "focus",
  active: "active",
  disabled: "disabled",
  "aria-disabled": "disabled",
  "data-[disabled]": "disabled",
};

// Variants that gate a utility on a *different* condition than the five states
// (selected/checked, open, keyboard-highlighted, invalid). A utility gated only
// on one of these is not part of any of the five states and is excluded from
// every state's descriptor.
function isOtherStateVariant(variant: string): boolean {
  return (
    variant.startsWith("data-[state=") ||
    variant.startsWith("data-[side=") ||
    variant === "data-[highlighted]" ||
    variant.startsWith("aria-[invalid")
  );
}

// Split a Tailwind class token into its leading variant prefixes and its base
// utility. Arbitrary-value brackets (`data-[state=checked]`, `aria-[invalid=true]`,
// `[&>span]`) contain no `:` in these strings, so a plain `:` split is safe.
function splitToken(token: string): { variants: string[]; base: string } {
  const parts = token.split(":");
  const base = parts.pop() as string;
  return { variants: parts, base };
}

function tokenize(classString: string): string[] {
  return classString.split(/\s+/).filter(Boolean);
}

// Resolve the set of effective utilities active for a control in a given state.
// A utility with no interaction variant is always active (unless it is gated on
// a different, non-five state); a utility with an interaction variant is active
// only in the mapped state, and is stored with its interaction prefix stripped
// so overrides (e.g. `hover:bg-primary/90` vs base `bg-primary`) surface as a
// distinct effective utility.
function resolveDescriptor(classString: string, state: FiveState): Set<string> {
  const descriptor = new Set<string>();
  for (const token of tokenize(classString)) {
    const { variants, base } = splitToken(token);
    const interaction = variants.filter((v) => v in INTERACTION_VARIANTS);
    const nonInteraction = variants.filter((v) => !(v in INTERACTION_VARIANTS));

    if (interaction.length === 0) {
      // No interaction gate. Skip utilities gated purely on another condition
      // (checked/open/highlighted/invalid) since they are constant across the
      // five states and belong to a separate state.
      if (nonInteraction.some(isOtherStateVariant)) continue;
      descriptor.add([...nonInteraction, base].join(":"));
    } else {
      const mapped = new Set(interaction.map((v) => INTERACTION_VARIANTS[v]));
      if (mapped.has(state as Exclude<FiveState, "default">)) {
        descriptor.add([...nonInteraction, base].join(":"));
      }
    }
  }
  return descriptor;
}

// The states a control actually defines: default always, plus any state that at
// least one utility is gated on.
function definedStates(classString: string): FiveState[] {
  const states = new Set<FiveState>(["default"]);
  for (const token of tokenize(classString)) {
    for (const variant of splitToken(token).variants) {
      const mapped = INTERACTION_VARIANTS[variant];
      if (mapped) states.add(mapped);
    }
  }
  return [...states];
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

// Registry of interactive primitives restyled in task 5.1. Button and toggle use
// their exported CVA generators directly; the remaining primitives' class
// strings mirror the token-driven `className` declared in their source files
// (button.tsx, toggle.tsx, input.tsx, checkbox.tsx, radio-group.tsx, switch.tsx,
// select.tsx SelectTrigger, dropdown-menu.tsx DropdownMenuItem).
const CONTROLS: { name: string; className: string }[] = [
  {
    name: "button",
    className: buttonVariants({ variant: "default", size: "default" }),
  },
  {
    name: "link",
    className: buttonVariants({ variant: "link", size: "default" }),
  },
  {
    name: "toggle",
    className: toggleVariants({ variant: "default", size: "default" }),
  },
  {
    name: "input",
    className:
      "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background transition-colors duration-fast file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-ring/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
  },
  {
    name: "checkbox",
    className:
      "peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background transition-colors duration-fast hover:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground aria-[invalid=true]:border-destructive disabled:cursor-not-allowed disabled:opacity-50",
  },
  {
    name: "radio",
    className:
      "aspect-square h-4 w-4 rounded-full border border-primary text-primary ring-offset-background transition-colors duration-fast hover:border-primary/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-[invalid=true]:border-destructive disabled:cursor-not-allowed disabled:opacity-50",
  },
  {
    name: "switch",
    className:
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-fast data-[state=checked]:bg-primary data-[state=unchecked]:bg-input hover:data-[state=checked]:bg-primary/90 hover:data-[state=unchecked]:bg-input/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
  },
  {
    name: "select",
    className:
      "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors duration-fast placeholder:text-muted-foreground hover:border-ring/60 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 data-[state=open]:border-ring aria-[invalid=true]:border-destructive aria-[invalid=true]:focus:ring-destructive disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
  },
  {
    name: "menu-item",
    className:
      "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors duration-fast data-[disabled]:pointer-events-none data-[disabled]:opacity-50 focus:bg-accent focus:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground active:bg-accent/80",
  },
];

describe("Property 20: Component states are pairwise distinguishable", () => {
  it("resolves distinct style descriptors for every pair of a control's defined states", () => {
    // Every interactive control defines at least two states (default plus one),
    // so the pair sampling below always has something to compare.
    for (const control of CONTROLS) {
      expect(definedStates(control.className).length).toBeGreaterThanOrEqual(2);
    }

    fc.assert(
      fc.property(
        fc.nat(),
        fc.nat(),
        fc.nat(),
        (controlIndex, firstPick, secondPick) => {
          const control = CONTROLS[controlIndex % CONTROLS.length];
          const states = definedStates(control.className);
          const n = states.length;

          // Choose two distinct defined states deterministically from the picks.
          const i = firstPick % n;
          const j = (i + 1 + (secondPick % (n - 1))) % n;
          const stateA = states[i];
          const stateB = states[j];
          expect(stateA).not.toBe(stateB);

          const descriptorA = resolveDescriptor(control.className, stateA);
          const descriptorB = resolveDescriptor(control.className, stateB);

          // Distinguishability: the two states differ in at least one visual
          // dimension (their effective utility sets are not equal).
          expect(setsEqual(descriptorA, descriptorB)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});
