import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { scheduleIdleTask } from "../browser-idle";

type IdleCallback = (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void;

describe("scheduleIdleTask", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("runs immediately when window is unavailable", () => {
    const callback = vi.fn();

    const cancel = scheduleIdleTask(callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(() => cancel()).not.toThrow();
  });

  it("uses requestIdleCallback when available and cancels pending idle work", () => {
    const callback = vi.fn();
    const requestIdleCallback =
      vi.fn<(cb: IdleCallback, options?: { timeout: number }) => number>();
    const cancelIdleCallback = vi.fn();
    let idleCallback: IdleCallback | undefined;

    requestIdleCallback.mockImplementation((cb) => {
      idleCallback = cb;
      return 77;
    });

    vi.stubGlobal("window", {
      cancelIdleCallback,
      clearTimeout,
      requestIdleCallback,
      setTimeout,
    });

    const cancel = scheduleIdleTask(callback, { timeoutMs: 3200 });

    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 3200 });

    cancel();

    expect(cancelIdleCallback).toHaveBeenCalledWith(77);
    expect(callback).not.toHaveBeenCalled();

    idleCallback?.({ didTimeout: false, timeRemaining: () => 12 });

    expect(callback).not.toHaveBeenCalled();
  });

  it("falls back to a short timeout when requestIdleCallback is unavailable", () => {
    const callback = vi.fn();

    vi.stubGlobal("window", {
      clearTimeout,
      setTimeout,
    });

    scheduleIdleTask(callback, { timeoutMs: 400 });

    vi.advanceTimersByTime(31);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("waits for delayMs before scheduling idle work", () => {
    const callback = vi.fn();
    const requestIdleCallback =
      vi.fn<(cb: IdleCallback, options?: { timeout: number }) => number>();
    let idleCallback: IdleCallback | undefined;

    requestIdleCallback.mockImplementation((cb) => {
      idleCallback = cb;
      return 99;
    });

    vi.stubGlobal("window", {
      clearTimeout,
      requestIdleCallback,
      setTimeout,
    });

    scheduleIdleTask(callback, { delayMs: 50, timeoutMs: 2000 });

    expect(requestIdleCallback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(49);
    expect(requestIdleCallback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 2000 });

    idleCallback?.({ didTimeout: false, timeRemaining: () => 10 });

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
