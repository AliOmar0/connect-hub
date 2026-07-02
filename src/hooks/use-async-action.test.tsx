import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useAsyncAction,
  DEFAULT_TIMEOUT_MS,
  type AsyncOperation,
} from "./use-async-action";

/** A promise plus its resolve/reject handles, for driving async operations in tests. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useAsyncAction", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("starts idle and enters loading synchronously on run", async () => {
    const d = deferred<string>();
    const op: AsyncOperation<[], string> = () => d.promise;

    const { result } = renderHook(() => useAsyncAction(op));
    expect(result.current.status).toBe("idle");
    expect(result.current.isLoading).toBe(false);

    let runPromise: Promise<string | undefined>;
    act(() => {
      runPromise = result.current.run();
    });

    // Loading is set within the same tick as the trigger (well under 200ms).
    expect(result.current.isLoading).toBe(true);
    expect(result.current.status).toBe("loading");

    await act(async () => {
      d.resolve("ok");
      await runPromise;
    });

    expect(result.current.status).toBe("success");
    expect(result.current.data).toBe("ok");
    expect(result.current.isLoading).toBe(false);
  });

  it("prevents duplicate submission while a call is in flight", async () => {
    const d = deferred<string>();
    const op = vi.fn<AsyncOperation<[], string>>(() => d.promise);

    const { result } = renderHook(() => useAsyncAction(op));

    let first: Promise<string | undefined>;
    let second: Promise<string | undefined> | undefined;
    act(() => {
      first = result.current.run();
      // Second trigger while loading must be ignored.
      second = result.current.run();
    });

    expect(op).toHaveBeenCalledTimes(1);
    expect(await second!).toBeUndefined();

    await act(async () => {
      d.resolve("done");
      await first;
    });

    // A fresh run after completion is allowed.
    const d2 = deferred<string>();
    op.mockImplementationOnce(() => d2.promise);
    let third: Promise<string | undefined>;
    act(() => {
      third = result.current.run();
    });
    expect(op).toHaveBeenCalledTimes(2);
    await act(async () => {
      d2.resolve("again");
      await third;
    });
    expect(result.current.data).toBe("again");
  });

  it("surfaces a recoverable timeout Error_State after 30s and aborts the operation", async () => {
    vi.useFakeTimers();
    let receivedSignal: AbortSignal | undefined;
    // Never settles on its own; only the timeout should resolve the state.
    const op: AsyncOperation<[], string> = (signal) => {
      receivedSignal = signal;
      return new Promise<string>(() => {});
    };

    const { result } = renderHook(() => useAsyncAction(op));

    act(() => {
      void result.current.run();
    });
    expect(result.current.isLoading).toBe(true);

    // Advance to just before the timeout: still loading.
    await act(async () => {
      vi.advanceTimersByTime(DEFAULT_TIMEOUT_MS - 1);
    });
    expect(result.current.status).toBe("loading");
    expect(receivedSignal?.aborted).toBe(false);

    // Cross the 30s boundary: timeout fires, operation is aborted.
    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(receivedSignal?.aborted).toBe(true);
    expect(result.current.status).toBe("error");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toMatchObject({
      kind: "timeout",
      recoverable: true,
    });
    expect(result.current.error?.message).toBeTruthy();
  });

  it("uses a configurable timeout duration", async () => {
    vi.useFakeTimers();
    const op: AsyncOperation<[], string> = () => new Promise<string>(() => {});

    const { result } = renderHook(() =>
      useAsyncAction(op, { timeoutMs: 5_000, timeoutMessage: "Too slow" }),
    );

    act(() => {
      void result.current.run();
    });

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error?.kind).toBe("timeout");
    expect(result.current.error?.message).toBe("Too slow");
  });

  it("presents a recoverable failure error and preserves the ability to retry", async () => {
    const op = vi.fn<AsyncOperation<[string], string>>(async () => {
      throw new Error("boom");
    });

    const { result } = renderHook(() => useAsyncAction(op));

    await act(async () => {
      await result.current.run("payload");
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatchObject({
      kind: "failure",
      recoverable: true,
      message: "boom",
    });

    // retry re-runs with the same arguments from the last run.
    op.mockImplementationOnce(async () => "recovered");
    await act(async () => {
      await result.current.retry();
    });

    expect(op).toHaveBeenLastCalledWith(expect.any(AbortSignal), "payload");
    expect(result.current.status).toBe("success");
    expect(result.current.data).toBe("recovered");
  });

  it("does not time out when the operation resolves before the deadline", async () => {
    vi.useFakeTimers();
    const d = deferred<string>();
    const op: AsyncOperation<[], string> = () => d.promise;

    const { result } = renderHook(() => useAsyncAction(op));

    act(() => {
      void result.current.run();
    });

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      d.resolve("fast");
      await Promise.resolve();
    });

    // Advancing past the original deadline must not overwrite the success.
    await act(async () => {
      vi.advanceTimersByTime(DEFAULT_TIMEOUT_MS);
    });

    expect(result.current.status).toBe("success");
    expect(result.current.data).toBe("fast");
  });

  it("cancel aborts in-flight work and returns to idle without an error", async () => {
    let receivedSignal: AbortSignal | undefined;
    const op: AsyncOperation<[], string> = (signal) => {
      receivedSignal = signal;
      return new Promise<string>(() => {});
    };

    const { result } = renderHook(() => useAsyncAction(op));

    act(() => {
      void result.current.run();
    });
    expect(result.current.isLoading).toBe(true);

    act(() => {
      result.current.cancel();
    });

    expect(receivedSignal?.aborted).toBe(true);
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
  });

  it("reset clears data, error, and status back to idle", async () => {
    const op: AsyncOperation<[], string> = async () => "value";
    const { result } = renderHook(() => useAsyncAction(op));

    await act(async () => {
      await result.current.run();
    });
    expect(result.current.data).toBe("value");

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeNull();
  });

  it("invokes onSuccess and onError callbacks", async () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const op = vi.fn<AsyncOperation<[], string>>();

    const { result } = renderHook(() =>
      useAsyncAction(op, { onSuccess, onError }),
    );

    op.mockImplementationOnce(async () => "yay");
    await act(async () => {
      await result.current.run();
    });
    expect(onSuccess).toHaveBeenCalledWith("yay");

    op.mockImplementationOnce(async () => {
      throw new Error("nope");
    });
    await act(async () => {
      await result.current.run();
    });
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "failure", message: "nope" }),
    );
  });
});
