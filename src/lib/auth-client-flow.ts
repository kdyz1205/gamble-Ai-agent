/** Client lifecycle guards only. Authentication and session creation remain in NextAuth. */
export function createAuthAttemptController() {
  let generation = 0;
  let pending = false;
  return {
    begin(): number | null {
      if (pending) return null;
      pending = true;
      return ++generation;
    },
    current(attempt: number): boolean { return attempt === generation; },
    finish(attempt: number): void { if (attempt === generation) pending = false; },
    invalidate(): void { generation++; pending = false; },
  };
}

/** Absence of an error is not proof that NextAuth established a session. */
export function credentialsSignInSucceeded(response: unknown): boolean {
  if (!response || typeof response !== "object") return false;
  const value = response as { ok?: unknown; status?: unknown; error?: unknown };
  return value.ok === true && typeof value.status === "number"
    && value.status >= 200 && value.status < 300 && !value.error;
}

/** Preserve invitation/quest destinations without accepting an external redirect or auth loop. */
export function safeAuthReturnTo(value: unknown, origin?: string): string {
  const fallback = "/app/today";
  if (typeof value !== "string" || !value || /[\\\u0000-\u0020\u007f]/.test(value)) return fallback;
  try {
    const base = new URL(origin ?? "https://auth-return.invalid");
    const relative = value.startsWith("/") && !value.startsWith("//");
    if (!relative && !origin) return fallback;
    const target = new URL(value, base);
    if (!relative && !/^https?:\/\//i.test(value)) return fallback;
    if (target.origin !== base.origin || target.username || target.password) return fallback;
    const path = decodeURIComponent(target.pathname);
    if (path.startsWith("//") || path.includes("\\") || /[\u0000-\u001f\u007f]/.test(path)
      || /^\/(?:api\/)?auth(?:\/|$)/i.test(path)) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch { return fallback; }
}
