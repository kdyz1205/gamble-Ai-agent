const ISO_DATETIME_RE =
  /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?/g;
const ISO_DATE_RE = /\b\d{4}-\d{2}-\d{2}\b(?!T)/g;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const PAST_GRACE_MS = MINUTE;

function addMs(now: Date, ms: number) {
  return new Date(now.getTime() + ms);
}

function defaultDeadline(now: Date, fallbackHours: number) {
  return addMs(now, Math.max(1, fallbackHours) * HOUR);
}

export function parseChallengeDeadline(
  source: unknown,
  options?: { now?: Date; fallbackHours?: number; allowPast?: boolean },
): Date | null {
  if (source == null) return null;
  const text = String(source).trim();
  if (!text) return null;

  const normalized = text.toLowerCase();
  if (/^(none|no deadline|open|open ended|open-ended|n\/a|null)$/i.test(normalized)) {
    return null;
  }

  const now = options?.now ?? new Date();
  const fallbackHours = options?.fallbackHours ?? 48;
  if (/\b(after|following)\s+(verdict|judgment|judge|review|settlement)\b|\bdispute window\b/.test(normalized)) {
    return defaultDeadline(now, fallbackHours);
  }

  const relativePatterns: Array<{ re: RegExp; unitMs: number }> = [
    { re: /(\d+)\s*(?:min|mins|minute|minutes|m|\u5206\u949f|\u5206\u9418)/i, unitMs: MINUTE },
    { re: /(\d+)\s*(?:hour|hours|hr|hrs|h|\u5c0f\u65f6|\u5c0f\u6642)/i, unitMs: HOUR },
    { re: /(\d+)\s*(?:day|days|d|\u5929|\u65e5)/i, unitMs: DAY },
    { re: /(\d+)\s*(?:week|weeks|w|\u5468|\u9031|\u661f\u671f)/i, unitMs: WEEK },
  ];

  for (const pattern of relativePatterns) {
    const match = text.match(pattern.re);
    if (match?.[1]) return addMs(now, Number(match[1]) * pattern.unitMs);
  }

  if (/\btomorrow\b|\u660e\u5929/.test(normalized)) return addMs(now, DAY);

  const absolute = new Date(text);
  if (Number.isFinite(absolute.getTime())) {
    return options?.allowPast || absolute.getTime() > now.getTime() + PAST_GRACE_MS
      ? absolute
      : defaultDeadline(now, fallbackHours);
  }

  return defaultDeadline(now, fallbackHours);
}

export function formatChallengeDeadline(
  value: string | Date | null | undefined,
  options?: { now?: Date; includePrefix?: boolean },
) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  const now = options?.now ?? new Date();
  if (date.getTime() <= now.getTime() + PAST_GRACE_MS) return "Deadline passed";

  const formatted = date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return options?.includePrefix === false ? formatted : `Due ${formatted}`;
}

export function cleanDeadlineArtifactsForDisplay(value: string, options?: { now?: Date }) {
  const replaceDate = (raw: string) => formatChallengeDeadline(raw, { now: options?.now }) ?? "";
  return value
    .replace(ISO_DATETIME_RE, replaceDate)
    .replace(ISO_DATE_RE, replaceDate)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function stripDeadlineArtifacts(value: string) {
  return value
    .replace(ISO_DATETIME_RE, "")
    .replace(ISO_DATE_RE, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/[.\s]+$/g, "")
    .trim();
}
