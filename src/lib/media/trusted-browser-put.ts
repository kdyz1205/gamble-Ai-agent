/**
 * Browser-only presigned PUT transport. A private object is never considered
 * Evidence until the authenticated server completes SHA-256 verification
 * and binds the session to the accepted Quest.
 *
 * XMLHttpRequest is used intentionally: fetch() does not report upload byte
 * progress to iPhone Safari. No cookie or S3 credentials are sent by us.
 */
export function putTrustedEvidenceFile(args: {
  uploadUrl: string;
  headers: Record<string, string>;
  file: File;
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}): Promise<void> {
  if (args.signal?.aborted) return Promise.reject(new Error("Private upload cancelled"));
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let finished = false;
    const cancel = () => xhr.abort();
    const settle = (failure?: Error) => {
      if (finished) return;
      finished = true;
      args.signal?.removeEventListener("abort", cancel);
      if (failure) reject(failure);
      else resolve();
    };

    xhr.upload.onprogress = event => {
      if (!event.lengthComputable || event.total <= 0) return;
      const percentage = Math.min(99, Math.max(0, Math.round(
        (event.loaded / event.total) * 100,
      )));
      args.onProgress?.(percentage);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        args.onProgress?.(100);
        settle();
      } else {
        settle(new Error(`Private object transfer failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => settle(new Error("Private upload network failure; no proof was submitted"));
    xhr.onabort = () => settle(new Error("Private upload cancelled; no proof was submitted"));
    xhr.ontimeout = () => settle(new Error("Private upload timed out; no proof was submitted"));

    args.signal?.addEventListener("abort", cancel, { once: true });
    try {
      xhr.open("PUT", args.uploadUrl, true);
      for (const [key, value] of Object.entries(args.headers)) {
        xhr.setRequestHeader(key, value);
      }
      xhr.timeout = 15 * 60 * 1000;
      xhr.send(args.file);
    } catch {
      settle(new Error("Private upload could not be started; no proof was submitted"));
    }
  });
}
