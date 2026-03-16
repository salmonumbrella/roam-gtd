interface IdleTaskOptions {
  delayMs?: number;
  timeoutMs?: number;
}

const DEFAULT_IDLE_TIMEOUT_MS = 1500;

export function scheduleIdleTask(
  callback: () => void,
  { delayMs = 0, timeoutMs = DEFAULT_IDLE_TIMEOUT_MS }: IdleTaskOptions = {},
): () => void {
  if (typeof window === "undefined") {
    callback();
    return () => {};
  }

  let cancelled = false;
  let delayTimer: number | null = null;
  let idleHandle: number | null = null;

  const clearScheduledWork = () => {
    if (delayTimer != null) {
      window.clearTimeout(delayTimer);
      delayTimer = null;
    }
    if (idleHandle != null) {
      if (typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleHandle);
      } else {
        window.clearTimeout(idleHandle);
      }
      idleHandle = null;
    }
  };

  const runTask = () => {
    idleHandle = null;
    if (cancelled) {
      return;
    }
    callback();
  };

  const scheduleWhenIdle = () => {
    if (cancelled) {
      return;
    }
    if (typeof window.requestIdleCallback === "function") {
      idleHandle = window.requestIdleCallback(runTask, { timeout: timeoutMs });
      return;
    }
    idleHandle = window.setTimeout(runTask, Math.min(timeoutMs, 32));
  };

  if (delayMs > 0) {
    delayTimer = window.setTimeout(() => {
      delayTimer = null;
      scheduleWhenIdle();
    }, delayMs);
  } else {
    scheduleWhenIdle();
  }

  return () => {
    cancelled = true;
    clearScheduledWork();
  };
}
