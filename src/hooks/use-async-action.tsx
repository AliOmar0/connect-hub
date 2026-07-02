import * as React from "react";

/**
 * Default time budget for an async operation before it is considered timed out
 * and its loading state is terminated with a recoverable Error_State
 * (Requirement 10.5 mandates 30 seconds).
 */
export const DEFAULT_TIMEOUT_MS = 30_000;

/** Discriminates how an operation failed so callers can react appropriately. */
export type AsyncErrorKind = "timeout" | "aborted" | "failure";

/**
 * Human-readable, recoverable error surfaced to the UI (typically an
 * `ErrorState`). Mirrors the presentation-only error shape in the design's
 * `AsyncViewState` (`{ message, recoverable }`) with an added `kind`.
 */
export interface AsyncActionError {
  message: string;
  /** Whether the operation can be retried. Timeouts and failures are recoverable. */
  recoverable: boolean;
  kind: AsyncErrorKind;
  /** The original thrown value, when the failure originated from the operation. */
  cause?: unknown;
}

/** Lifecycle of the wrapped operation, drives loading / error affordances. */
export type AsyncActionStatus = "idle" | "loading" | "success" | "error";

/**
 * The wrapped operation. Receives an {@link AbortSignal} that is aborted on
 * timeout (or manual cancel) so the operation can terminate promptly, plus any
 * caller-provided arguments. `TArgs` are also captured for `retry`.
 */
export type AsyncOperation<TArgs extends unknown[], TResult> = (
  signal: AbortSignal,
  ...args: TArgs
) => Promise<TResult>;

export interface UseAsyncActionOptions<TResult> {
  /**
   * Milliseconds before the operation times out. Defaults to
   * {@link DEFAULT_TIMEOUT_MS} (30s). Non-finite / non-positive values disable
   * the timeout entirely.
   */
  timeoutMs?: number;
  /** Message used for the timeout Error_State. Callers may localize this. */
  timeoutMessage?: string;
  /** Maps a thrown value to the message shown for a generic failure. */
  getErrorMessage?: (error: unknown) => string;
  /** Invoked with the resolved value on success (after state updates). */
  onSuccess?: (result: TResult) => void;
  /** Invoked with the structured error on failure/timeout (after state updates). */
  onError?: (error: AsyncActionError) => void;
}

export interface UseAsyncActionResult<TArgs extends unknown[], TResult> {
  /**
   * Trigger the operation. While a call is in flight this is a no-op and
   * returns `undefined`, preventing duplicate submission (Requirement 10.2).
   * On completion it resolves with the result, or `undefined` on failure.
   */
  run: (...args: TArgs) => Promise<TResult | undefined>;
  /** Re-run the operation with the arguments from the last `run` call. */
  retry: () => Promise<TResult | undefined>;
  /** Abort an in-flight operation without surfacing a timeout error. */
  cancel: () => void;
  /** Clear status, data, and error back to idle (also cancels in-flight work). */
  reset: () => void;
  /** True while the operation is in flight (set synchronously on `run`). */
  isLoading: boolean;
  /** Current lifecycle status. */
  status: AsyncActionStatus;
  /** The last successful result, if any. */
  data: TResult | undefined;
  /** The current recoverable error, if the last run failed or timed out. */
  error: AsyncActionError | null;
}

function defaultErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Something went wrong. Please try again.";
}

/**
 * Wrap an asynchronous operation with consistent loading, duplicate-submit
 * prevention, cancellation, and timeout behavior.
 *
 * - A loading Component_State is entered synchronously on `run` (well within
 *   the 200ms budget of Requirement 10.2).
 * - A second `run` while loading is ignored, so the operation cannot be
 *   submitted twice (Requirement 10.2).
 * - If the operation does not settle within `timeoutMs` (30s by default), the
 *   in-flight work is aborted via {@link AbortController} and a recoverable
 *   timeout Error_State is surfaced with a retry action (Requirement 10.5).
 *
 * This hook supplies the behavior consumed by `AsyncBoundary` / mutation
 * wrappers and validated by Properties 21 and 22.
 *
 * Requirements: 10.2, 10.5
 */
export function useAsyncAction<TArgs extends unknown[] = [], TResult = unknown>(
  operation: AsyncOperation<TArgs, TResult>,
  options: UseAsyncActionOptions<TResult> = {},
): UseAsyncActionResult<TArgs, TResult> {
  const [status, setStatus] = React.useState<AsyncActionStatus>("idle");
  const [data, setData] = React.useState<TResult | undefined>(undefined);
  const [error, setError] = React.useState<AsyncActionError | null>(null);

  // Latest option/operation values without re-creating `run` on every render.
  const operationRef = React.useRef(operation);
  const optionsRef = React.useRef(options);
  operationRef.current = operation;
  optionsRef.current = options;

  // Synchronous in-flight guard: blocks duplicate submission even before React
  // has committed the `loading` state (Requirement 10.2).
  const inFlightRef = React.useRef(false);
  const controllerRef = React.useRef<AbortController | null>(null);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastArgsRef = React.useRef<TArgs | null>(null);
  // Monotonic run id so a stale (aborted/timed-out) run cannot commit state.
  const runIdRef = React.useRef(0);
  const mountedRef = React.useRef(true);

  const clearTimer = React.useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const teardown = React.useCallback(() => {
    clearTimer();
    inFlightRef.current = false;
    controllerRef.current = null;
  }, [clearTimer]);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Abort any in-flight work on unmount to avoid dangling operations.
      clearTimer();
      controllerRef.current?.abort();
      controllerRef.current = null;
      inFlightRef.current = false;
    };
  }, [clearTimer]);

  const run = React.useCallback(
    async (...args: TArgs): Promise<TResult | undefined> => {
      // Duplicate-submit prevention: ignore triggers while one is in flight.
      if (inFlightRef.current) return undefined;

      lastArgsRef.current = args;
      inFlightRef.current = true;
      const runId = ++runIdRef.current;

      const controller = new AbortController();
      controllerRef.current = controller;

      // Enter the loading state synchronously (Requirement 10.2).
      setStatus("loading");
      setError(null);

      const {
        timeoutMs = DEFAULT_TIMEOUT_MS,
        timeoutMessage = "The operation timed out. Please try again.",
        getErrorMessage = defaultErrorMessage,
        onSuccess,
        onError,
      } = optionsRef.current;

      // Guards single settlement: whichever of the operation or the timeout
      // fires first wins; the other becomes a no-op.
      let settled = false;
      // True only for the current run and while still mounted.
      const isCurrent = () => mountedRef.current && runIdRef.current === runId;

      clearTimer();
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        timeoutRef.current = setTimeout(() => {
          if (settled) return;
          settled = true;
          // Signal the operation to stop, then surface the timeout Error_State
          // ourselves — the operation may never settle on its own
          // (Requirement 10.5).
          controller.abort();
          teardown();
          if (!isCurrent()) return;
          const asyncError: AsyncActionError = {
            message: timeoutMessage,
            recoverable: true,
            kind: "timeout",
          };
          setError(asyncError);
          setStatus("error");
          onError?.(asyncError);
        }, timeoutMs);
      }

      try {
        const result = await operationRef.current(controller.signal, ...args);
        if (settled) return undefined;
        settled = true;
        clearTimer();
        if (!isCurrent()) return undefined;
        inFlightRef.current = false;
        controllerRef.current = null;
        setData(result);
        setStatus("success");
        onSuccess?.(result);
        return result;
      } catch (caught) {
        if (settled) return undefined;
        settled = true;
        clearTimer();
        if (!isCurrent()) return undefined;
        inFlightRef.current = false;
        controllerRef.current = null;

        // A manual cancel (not a timeout) returns to idle without an error.
        if (controller.signal.aborted) {
          setStatus("idle");
          return undefined;
        }

        const asyncError: AsyncActionError = {
          message: getErrorMessage(caught),
          recoverable: true,
          kind: "failure",
          cause: caught,
        };

        setError(asyncError);
        setStatus("error");
        onError?.(asyncError);
        return undefined;
      }
    },
    [clearTimer],
  );

  const retry = React.useCallback((): Promise<TResult | undefined> => {
    const args = (lastArgsRef.current ?? ([] as unknown as TArgs)) as TArgs;
    return run(...args);
  }, [run]);

  const cancel = React.useCallback(() => {
    if (!inFlightRef.current) return;
    // Invalidate the current run so its settlement cannot commit state.
    runIdRef.current++;
    controllerRef.current?.abort();
    teardown();
    if (mountedRef.current) setStatus("idle");
  }, [teardown]);

  const reset = React.useCallback(() => {
    runIdRef.current++;
    controllerRef.current?.abort();
    teardown();
    if (!mountedRef.current) return;
    setStatus("idle");
    setData(undefined);
    setError(null);
  }, [teardown]);

  return {
    run,
    retry,
    cancel,
    reset,
    isLoading: status === "loading",
    status,
    data,
    error,
  };
}
