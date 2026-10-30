import test from "node:test";
import assert from "node:assert/strict";
import { ACTIVE_POLL_MS, BACKGROUND_POLL_MS, pollInterval, startAdaptivePolling, type PollState } from "../src/lib/polling";

function setup(run: (signal: AbortSignal) => Promise<void> = async () => {}) {
  let now = 0; let id = 0;
  const tasks = new Map<number, { due: number; callback: () => void }>();
  const state: PollState = { hidden: false, focused: true, online: true, failures: 0, retryAt: 0 };
  const calls: number[] = [];
  const poller = startAdaptivePolling({
    state: () => state,
    run: async signal => { calls.push(now); await run(signal); },
    clock: {
      now: () => now, random: () => 0,
      setTimeout: (callback, delay) => { const timer = ++id; tasks.set(timer, { due: now + delay, callback }); return timer as unknown as ReturnType<typeof setTimeout>; },
      clearTimeout: timer => { tasks.delete(timer as unknown as number); },
    },
  });
  async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
  async function advance(ms: number) {
    const target = now + ms;
    for (let i = 0; i < 10000; i++) {
      const next = [...tasks.entries()].sort((a, b) => a[1].due - b[1].due)[0];
      if (!next || next[1].due > target) break;
      now = next[1].due; tasks.delete(next[0]); next[1].callback(); await flush();
    }
    now = target; await flush();
  }
  return { state, calls, poller, tasks, advance, flush };
}
test("focused chat polls immediately and every two seconds with a single timer", async () => {
  const p = setup();
  await p.advance(10000);
  assert.deepEqual(p.calls, [0, 2000, 4000, 6000, 8000, 10000]);
  assert.equal(p.tasks.size, 1);
  p.poller.stop();
});
test("a visible but unfocused window reduces polling thirtyfold", async () => {
  const p = setup(); await p.advance(0);
  p.state.focused = false; p.poller.refresh();
  await p.advance(59999); assert.equal(p.calls.length, 1);
  await p.advance(1); assert.deepEqual(p.calls, [0, BACKGROUND_POLL_MS]);
  p.poller.stop();
});
test("hidden tabs make zero requests and resume immediately on return", async () => {
  const p = setup(); await p.advance(0);
  p.state.hidden = true; p.poller.refresh();
  assert.equal(p.tasks.size, 0);
  await p.advance(600000); assert.equal(p.calls.length, 1);
  p.state.hidden = false; p.poller.refresh(); await p.advance(0);
  assert.deepEqual(p.calls, [0, 600000]);
  p.poller.stop();
});
test("offline pauses polling and reconnect resumes without a timer backlog", async () => {
  const p = setup(); await p.advance(0);
  p.state.online = false; p.poller.refresh(); await p.advance(100000);
  assert.equal(p.calls.length, 1); assert.equal(p.tasks.size, 0);
  p.state.online = true; p.poller.refresh(); await p.advance(0);
  assert.equal(p.calls.length, 2); assert.equal(p.tasks.size, 1);
  p.poller.stop();
});
test("slow requests never overlap or create a catch-up burst", async () => {
  let resolve!: () => void;
  const p = setup(() => new Promise<void>(done => { resolve = done; }));
  await p.advance(10000); assert.equal(p.calls.length, 1); assert.equal(p.tasks.size, 0);
  p.poller.refresh(); p.poller.refresh();
  resolve(); await p.flush(); await p.advance(249); assert.equal(p.calls.length, 1);
  await p.advance(1); assert.equal(p.calls.length, 2);
  p.poller.stop(); resolve(); await p.flush();
});
test("hiding or stopping cancels in-flight requests and leaves no scheduled work", async () => {
  let signal!: AbortSignal;
  const p = setup(async s => { signal = s; await new Promise<void>(done => s.addEventListener("abort", () => done(), { once: true })); });
  await p.advance(0); assert.equal(signal.aborted, false);
  p.state.hidden = true; p.poller.refresh(); await p.flush();
  assert.equal(signal.aborted, true); assert.equal(p.tasks.size, 0);
  p.state.hidden = false; p.poller.refresh(); await p.advance(1000);
  assert.equal(signal.aborted, false);
  p.poller.stop(); await p.flush(); await p.advance(600000);
  assert.equal(signal.aborted, true); assert.equal(p.tasks.size, 0); assert.equal(p.calls.length, 2);
});
test("focus-event storms do not trigger a request storm", async () => {
  const p = setup(); await p.advance(0);
  for (let i = 0; i < 100; i++) p.poller.refresh();
  await p.advance(999); assert.equal(p.calls.length, 1); assert.equal(p.tasks.size, 1);
  await p.advance(1); assert.equal(p.calls.length, 2);
  p.poller.stop();
});
test("GitHub retry-after survives focus, visibility and online changes", async () => {
  const p = setup(); await p.advance(0);
  p.state.retryAt = 120000; p.state.failures = 1;
  p.poller.refresh(); await p.advance(10000);
  p.state.hidden = true; p.poller.refresh(); p.state.hidden = false; p.poller.refresh();
  await p.advance(109999); assert.equal(p.calls.length, 1);
  await p.advance(1); assert.deepEqual(p.calls, [0, 120000]);
  p.poller.stop();
});
test("error backoff grows, is bounded, and resets after a successful conditional response", async () => {
  const p = setup(); await p.advance(0);
  p.state.failures = 3; p.poller.refresh();
  await p.advance(15999); assert.equal(p.calls.length, 1);
  await p.advance(1); assert.equal(p.calls.length, 2);
  p.state.failures = 100;
  assert.equal(pollInterval(p.state), 300000);
  p.state.failures = 0; p.poller.refresh(); await p.advance(1000);
  assert.equal(p.calls.length, 3);
  assert.equal(pollInterval(p.state), ACTIVE_POLL_MS);
  p.poller.stop();
});
test("closing or changing chat stops the old poller permanently", async () => {
  const old = setup(); await old.advance(0); old.poller.stop();
  old.poller.refresh(); await old.advance(600000); assert.equal(old.calls.length, 1);
  const next = setup(); await next.advance(4000);
  assert.equal(next.calls.length, 3); next.poller.stop();
});
