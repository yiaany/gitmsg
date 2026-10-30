export const ACTIVE_POLL_MS = 2000;
export const BACKGROUND_POLL_MS = 60000;
const MIN_WAKE_GAP_MS = 1000;
const MIN_REST_MS = 250;

export type PollState = { hidden: boolean; focused: boolean; online: boolean; failures: number; retryAt: number };
export function pollInterval(state: PollState): number | null {
  if (state.hidden || !state.online) return null;
  const backoff = state.failures > 0 ? Math.min(300000, ACTIVE_POLL_MS * 2 ** Math.min(state.failures, 8)) : 0;
  return Math.max(state.focused ? ACTIVE_POLL_MS : BACKGROUND_POLL_MS, backoff);
}
type Clock = {
  now: () => number;
  random: () => number;
  setTimeout: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => void;
};
const systemClock: Clock = { now: Date.now, random: Math.random, setTimeout, clearTimeout };

// One request and one timer at most. No interval backlog when a request is slow.
export function startAdaptivePolling({ run, state, clock = systemClock }: { run: (signal: AbortSignal) => Promise<void>; state: () => PollState; clock?: Clock }) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: AbortController | undefined;
  let lastStarted = -Infinity;
  let lastFinished = -Infinity;
  let wakeRequested = false;

  function schedule(wake = false) {
    if (timer !== undefined) { clock.clearTimeout(timer); timer = undefined; }
    if (stopped) return;
    const current = state();
    const interval = pollInterval(current);
    if (interval === null) { running?.abort(); return; }
    if (running) { wakeRequested ||= wake; return; }
    // Focus/visibility events cannot bypass a rate-limit cooldown or error backoff.
    const cadence = wake && current.focused && !current.failures ? MIN_WAKE_GAP_MS : interval + clock.random() * 150;
    const due = Math.max(current.retryAt, lastStarted + cadence, lastFinished + MIN_REST_MS);
    timer = clock.setTimeout(() => { timer = undefined; void tick(); }, Math.max(0, due - clock.now()));
  }
  async function tick() {
    if (stopped || running) return;
    const current = state();
    if (pollInterval(current) === null) return;
    if (current.retryAt > clock.now()) { schedule(); return; }
    const controller = new AbortController(); running = controller; lastStarted = clock.now();
    try { await run(controller.signal); }
    catch { /* The task reports its errors and updates state.failures / retryAt. */ }
    finally {
      running = undefined; lastFinished = clock.now();
      const wake = wakeRequested; wakeRequested = false;
      schedule(wake);
    }
  }
  schedule(true);
  return {
    refresh: () => schedule(true),
    stop: () => {
      stopped = true;
      if (timer !== undefined) { clock.clearTimeout(timer); timer = undefined; }
      running?.abort();
    },
  };
}
