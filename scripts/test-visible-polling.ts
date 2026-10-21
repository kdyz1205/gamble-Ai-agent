import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { isTerminalChallenge, startVisiblePolling } from "../src/lib/visible-polling";

async function main() {
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const document = new EventTarget();
  let visibility = "visible";
  Object.defineProperty(document, "visibilityState", { get: () => visibility });
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  const show = (state: string) => { visibility = state; document.dispatchEvent(new Event("visibilitychange")); };
  const stops: Array<() => void> = [];
  try {
    let calls = 0;
    let complete!: () => void;
    let signal!: AbortSignal;
    show("hidden");
    const stop = startVisiblePolling({ immediate: true, delays: 5, task: async incoming => { calls += 1; signal = incoming; await new Promise<void>(resolve => { complete = resolve; }); } });
    stops.push(stop);
    await delay(20);
    assert.equal(calls, 0, "Hidden start must not perform work");
    show("visible");
    assert.equal(calls, 1, "Visibility resume starts immediately");
    show("hidden"); show("visible");
    await delay(20);
    assert.equal(calls, 1, "Visibility resume must not overlap an existing slow task");
    stop();
    assert.equal(signal.aborted, true);
    complete();
    await delay(20);
    show("hidden"); show("visible");
    assert.equal(calls, 1, "Unmount/stop must prevent in-flight completion from scheduling again");
    console.log("PASS hidden start, immediate visible resume, no resume overlap, and stopped in-flight work never reschedules");

    let running = 0;
    let maximum = 0;
    let serialCalls = 0;
    const stopSerial = startVisiblePolling({ immediate: true, delays: 5, task: async () => {
      running += 1; maximum = Math.max(maximum, running); serialCalls += 1;
      await delay(25);
      running -= 1;
    } });
    stops.push(stopSerial);
    await delay(100);
    stopSerial();
    assert.equal(maximum, 1);
    assert.ok(serialCalls >= 2);
    await delay(30);
    console.log("PASS task latency longer than polling interval remains serial");

    let attempts = 0;
    let errors = 0;
    const stopRetry = startVisiblePolling({ immediate: true, delays: [1, 5], onError: () => { errors += 1; }, task: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("Transient network failure");
      return false;
    } });
    stops.push(stopRetry);
    await delay(30);
    assert.equal(attempts, 2);
    assert.equal(errors, 1);
    show("hidden"); show("visible");
    await delay(10);
    assert.equal(attempts, 2, "Terminal task must remove visibility listener");
    console.log("PASS transient errors retry; terminal completion stops both timer and resume listener");

    let timedCalls = 0;
    let timeouts = 0;
    show("hidden");
    stops.push(startVisiblePolling({ delays: 5, timeoutMs: 10, onTimeout: () => { timeouts += 1; }, task: async () => { timedCalls += 1; } }));
    await delay(20);
    show("visible");
    await delay(10);
    assert.equal(timedCalls, 0);
    assert.equal(timeouts, 1, "Expired jobs stop on return without another request");
    for (const status of ["settled", "cancelled", "void"]) assert.equal(isTerminalChallenge(status), true);
    for (const status of ["open", "live", "judging", "disputed", "pending_settlement", undefined]) assert.equal(isTerminalChallenge(status), false);
    console.log("PASS background deadline expiry makes no request; consent/review states remain active");
  } finally {
    stops.forEach(stop => stop());
    if (oldDocument) Object.defineProperty(globalThis, "document", oldDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
