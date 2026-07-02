import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import fc from "fast-check";
import { useAsyncAction } from "./use-async-action";

// Feature: ui-ux-redesign, Property 21
// Invariant: for any control that triggers an asynchronous operation, the first
// trigger produces a loading Component_State, and any additional triggers issued
// while that loading state is active do NOT initiate a duplicate operation.
// The wrapped operation is invoked at most once while a call is in flight.
//
// Validates: Requirements 10.2

/**
 * A manually-controlled deferred promise. The wrapped operation stays "in
 * flight" (unresolved) until `resolve` is called, so every trigger fired during
 * the test happens while loading is active — exactly the window in which
 * duplicate submission must be prevented.
 */
function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useAsyncAction async loading + duplicate prevention (property-based)", () => {
  it("enters loading on the first trigger and invokes the operation at most once while in flight", () => {
    fc.assert(
      fc.property(
        // Number of extra triggers fired while the operation is still in flight.
        fc.integer({ min: 0, max: 20 }),
        (extraTriggers) => {
          const deferred = createDeferred<string>();
          let invocationCount = 0;

          const operation = () => {
            invocationCount += 1;
            return deferred.promise;
          };

          const { result, unmount } = renderHook(() =>
            // Disable the timeout so the operation stays in flight deterministically.
            useAsyncAction(operation, { timeoutMs: 0 }),
          );

          // Precondition: idle, no invocations yet.
          expect(result.current.isLoading).toBe(false);
          expect(invocationCount).toBe(0);

          // First trigger: must enter the loading Component_State synchronously
          // and initiate exactly one operation.
          act(() => {
            void result.current.run();
          });

          expect(result.current.isLoading).toBe(true);
          expect(result.current.status).toBe("loading");
          expect(invocationCount).toBe(1);

          // Any further triggers issued while loading is active must be ignored:
          // no duplicate operation is initiated and loading remains active.
          for (let i = 0; i < extraTriggers; i++) {
            act(() => {
              void result.current.run();
            });
            expect(invocationCount).toBe(1);
            expect(result.current.isLoading).toBe(true);
          }

          // Total operation invocations across all triggers while in flight is 1.
          expect(invocationCount).toBe(1);

          // Settle the in-flight operation so nothing dangles between runs.
          act(() => {
            deferred.resolve("done");
          });

          unmount();
        },
      ),
      { numRuns: 100 },
    );
  });
});
