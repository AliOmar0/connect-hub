import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import fc from "fast-check";
import { useAsyncAction, type AsyncOperation } from "./use-async-action";

// Feature: ui-ux-redesign, Property 22
//
// Property 22: Async failure yields a recoverable error that preserves data.
// For any asynchronous operation that fails while user-entered data is present,
// the resulting Error_State includes a human-readable description and at least
// one recovery action (retry), and the user-entered data is preserved.
//
// Validates: Requirements 10.4, 19.4

/**
 * Arbitrary "cause" of an async failure. Covers the realistic shapes a rejected
 * operation can throw: Error instances (with and without messages), plain
 * strings, and other non-string/non-Error values that must still degrade to a
 * human-readable message.
 */
const errorCauseArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.string().map((m) => new Error(m)),
  fc.string(),
  fc.constantFrom<unknown>(null, undefined, 42, { code: "E_FAIL" }, ["x"]),
);

/** Arbitrary user-entered form data that must survive a failed submission. */
const enteredDataArb = fc.record({
  name: fc.string(),
  email: fc.string(),
  count: fc.integer(),
});

describe("useAsyncAction recoverable failure (property-based)", () => {
  it("yields a recoverable error with a message and retry, preserving entered data", async () => {
    await fc.assert(
      fc.asyncProperty(
        errorCauseArb,
        enteredDataArb,
        async (cause, enteredData) => {
          // The operation fails on the first attempt. On retry it succeeds,
          // echoing back the entered data it received — this proves the
          // user-entered data was preserved across the failure.
          let attempts = 0;
          const seenData: (typeof enteredData)[] = [];
          const op: AsyncOperation<
            [typeof enteredData],
            typeof enteredData
          > = async (_signal, data) => {
            seenData.push(data);
            attempts += 1;
            if (attempts === 1) {
              throw cause;
            }
            return data;
          };

          const { result } = renderHook(() => useAsyncAction(op));

          await act(async () => {
            await result.current.run(enteredData);
          });

          // Failure surfaces a recoverable Error_State (human-readable message
          // + recovery action available).
          expect(result.current.status).toBe("error");
          const error = result.current.error;
          expect(error).not.toBeNull();
          expect(error?.recoverable).toBe(true);
          expect(error?.kind).toBe("failure");
          expect(typeof error?.message).toBe("string");
          expect((error?.message ?? "").length).toBeGreaterThan(0);
          // A recovery action (retry) must be exposed by the hook.
          expect(typeof result.current.retry).toBe("function");

          // The user-entered data is not lost: the failed attempt received
          // exactly the data the user entered.
          expect(seenData[0]).toEqual(enteredData);

          // Exercising the recovery action re-submits the same entered data,
          // confirming it was preserved and can be recovered from.
          await act(async () => {
            await result.current.retry();
          });

          expect(result.current.status).toBe("success");
          expect(result.current.data).toEqual(enteredData);
          expect(result.current.error).toBeNull();
          expect(seenData[1]).toEqual(enteredData);
        },
      ),
      { numRuns: 100 },
    );
  });
});
