/** Shared chat/API deadline semantics. Never replace an unknown window with a guess. */
export function parseProofDeadline(raw: string, now = Date.now()): Date | null {
  const text = raw.trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:z|[+-]\d{2}:\d{2})$/.test(text)) {
    const calendar = Date.parse(`${text.slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(calendar) || new Date(calendar).toISOString().slice(0, 10) !== text.slice(0, 10)) return null;
    const timestamp = Date.parse(text);
    return Number.isFinite(timestamp) && timestamp > now ? new Date(timestamp) : null;
  }
  const duration = text.replace(/^(?:within|in)\s+/, "").replace(/^(?:在|限时|限時)\s*/, "").replace(/\s*(?:以内|以內|内|內)$/, "");
  const units: Record<string, number> = {
    m: 60_000, min: 60_000, mins: 60_000, minute: 60_000, minutes: 60_000, 分钟: 60_000, 分鐘: 60_000,
    h: 3_600_000, hr: 3_600_000, hrs: 3_600_000, hour: 3_600_000, hours: 3_600_000, 小时: 3_600_000, 小時: 3_600_000,
    d: 86_400_000, day: 86_400_000, days: 86_400_000, 天: 86_400_000,
    w: 604_800_000, week: 604_800_000, weeks: 604_800_000, 周: 604_800_000, 週: 604_800_000,
  };
  let total = 0;
  const seen = new Set<number>();
  const rest = duration.replace(/(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|days?|weeks?|分钟|分鐘|小时|小時|天|周|週|m|h|d|w)(?![a-z])/g, (_match, count: string, unit: string) => {
    const multiplier = units[unit];
    const amount = Number(count);
    if (!Number.isFinite(amount) || amount <= 0 || seen.has(multiplier)) total = Number.NaN;
    seen.add(multiplier);
    total += amount * multiplier;
    return "";
  }).trim();
  if (rest || !Number.isFinite(total) || total < 60_000 || !Number.isSafeInteger(total)) return null;
  const timestamp = now + total;
  return Number.isFinite(new Date(timestamp).getTime()) ? new Date(timestamp) : null;
}
