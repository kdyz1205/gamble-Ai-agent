export const JUDGE_POLL_DELAYS = [2_000, 3_000, 5_000, 8_000, 12_000, 20_000, 30_000];
export const JUDGE_POLL_TIMEOUT_MS = 15 * 60 * 1_000;

export function isTerminalChallenge(status: string | undefined): boolean {
  return status !== undefined && ["settled", "cancelled", "void"].includes(status);
}

/** One request at a time, no background ticks, immediate refresh on return. */
export function startVisiblePolling(options: {
  task: (signal: AbortSignal) => Promise<boolean | void>;
  delays: number | readonly number[];
  immediate?: boolean;
  timeoutMs?: number;
  onTimeout?: () => void;
  onError?: (error: unknown) => void;
}): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let running = false;
  let resumePending = false;
  let attempt = 0;
  const started = Date.now();
  const controller = new AbortController();
  const visible = () => document.visibilityState !== "hidden";
  const clearTimer = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  const stop = () => {
    stopped = true;
    controller.abort();
    clearTimer();
    document.removeEventListener("visibilitychange", visibilityChanged);
  };
  const expired = () => {
    if (options.timeoutMs === undefined || Date.now() - started < options.timeoutMs) return false;
    stop();
    options.onTimeout?.();
    return true;
  };
  const schedule = () => {
    if (stopped || !visible() || expired()) return;
    const delays = typeof options.delays === "number" ? [options.delays] : options.delays;
    const delay = delays[Math.min(attempt++, delays.length - 1)] ?? 5_000;
    timer = setTimeout(() => { timer = undefined; void run(); }, delay);
  };
  const run = async () => {
    if (stopped || !visible() || running || expired()) return;
    clearTimer();
    running = true;
    let keepPolling: boolean | void = true;
    try {
      keepPolling = await options.task(controller.signal);
    } catch (error) {
      if (!stopped) options.onError?.(error);
    } finally {
      running = false;
      if (keepPolling === false) stop();
      if (!stopped && visible()) {
        if (resumePending) { resumePending = false; void run(); }
        else schedule();
      }
    }
  };
  function visibilityChanged() {
    clearTimer();
    if (!visible() || stopped) { resumePending = false; return; }
    if (running) resumePending = true;
    else void run();
  }
  document.addEventListener("visibilitychange", visibilityChanged);
  if (options.immediate) void run();
  else schedule();
  return stop;
}
