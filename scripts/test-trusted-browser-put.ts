import assert from "node:assert/strict";
import { putTrustedEvidenceFile } from "../src/lib/media/trusted-browser-put";

async function main() {
  const original = globalThis.XMLHttpRequest;
  let httpStatus = 200;
  let finishAutomatically = true;

  class FakeXHR {
    static latest: FakeXHR | null = null;
    upload: { onprogress: ((e: {
      lengthComputable: boolean;
      loaded: number;
      total: number;
    }) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    timeout = 0;
    status = 0;
    headers: Record<string, string> = {};
    method = "";
    url = "";
    constructor() { FakeXHR.latest = this; }
    open(method: string, url: string) { this.method = method; this.url = url; }
    setRequestHeader(name: string, value: string) { this.headers[name] = value; }
    send(_file: File) {
      if (!finishAutomatically) return;
      queueMicrotask(() => {
        this.upload.onprogress?.({ lengthComputable: true, loaded: 7, total: 10 });
        this.status = httpStatus;
        this.onload?.();
      });
    }
    abort() { this.onabort?.(); }
  }

  const known = { "Content-Type": "video/mp4", "If-None-Match": "*" };
  const file = new Blob(["this is just a transfer stub"], { type: "video/mp4" }) as File;
  Object.defineProperty(globalThis, "XMLHttpRequest", {
    configurable: true, writable: true, value: FakeXHR,
  });
  try {
    const progress: number[] = [];
    await putTrustedEvidenceFile({
      uploadUrl: "https://private-example.invalid/upload",
      headers: known, file,
      onProgress: value => progress.push(value),
    });
    const first = FakeXHR.latest!;
    assert.equal(first.method, "PUT");
    assert.equal(first.url, "https://private-example.invalid/upload");
    assert.deepEqual(first.headers, known);
    assert.deepEqual(progress, [70, 100], "iOS Web must show actual transferred bytes");
    assert.equal(first.timeout, 15 * 60 * 1000);

    httpStatus = 403;
    await assert.rejects(() => putTrustedEvidenceFile({
      uploadUrl: "https://private-example.invalid/upload",
      headers: known, file,
    }), /Private object transfer failed \(403\)/,
    "A storage failure may never be mistaken for a verified proof");

    finishAutomatically = false;
    const controller = new AbortController();
    const cancelled = putTrustedEvidenceFile({
      uploadUrl: "https://private-example.invalid/upload",
      headers: known, file, signal: controller.signal,
    });
    controller.abort();
    await assert.rejects(cancelled, /upload cancelled/);
    assert.equal(controller.signal.aborted, true);

    const preCancelled = new AbortController();
    preCancelled.abort();
    await assert.rejects(() => putTrustedEvidenceFile({
      uploadUrl: "https://private-example.invalid/upload",
      headers: known, file, signal: preCancelled.signal,
    }), /upload cancelled/);
    console.log("PASS private browser PUT: progress, signed headers, HTTP error and cancellation");
  } finally {
    if (original === undefined) {
      Reflect.deleteProperty(globalThis, "XMLHttpRequest");
    } else {
      Object.defineProperty(globalThis, "XMLHttpRequest", {
        configurable: true, writable: true, value: original,
      });
    }
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
