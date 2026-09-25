/**
 * Formatting helpers shared by the deck runner, the session summary and the
 * stats pages. Kept pure so they can be unit-tested without a browser.
 */

function pad(value: number, width = 2): string {
  return String(Math.abs(Math.trunc(value))).padStart(width, '0');
}

/**
 * ISO-8601 in the *browser's* timezone, including the offset
 * (e.g. `2026-09-25T13:45:00.123+01:00`).
 *
 * `Date.toISOString()` always reports UTC, which would make the stored
 * "client local time" column a duplicate of the server timestamp.
 */
export function localIsoWithOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const offset = `${sign}${pad(offsetMinutes / 60)}:${pad(offsetMinutes % 60)}`;
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `.${pad(date.getMilliseconds(), 3)}${offset}`
  );
}

/** Human-readable duration: `850 ms`, `4.2 s`, `1 min 12 s`. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) {
    return '—';
  }
  if (ms < 0) {
    return '—';
  }
  if (ms < 1000) {
    return `${Math.round(ms)} ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${Math.round(seconds % 60)} s`;
}

/** Seconds with one decimal, for the live per-question timer. */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(ms, 0) / 1000;
  return seconds < 10 ? `${seconds.toFixed(1)} s` : `${Math.round(seconds)} s`;
}

/** A 0..1 rate as a percentage, or an em dash when there is no data yet. */
export function formatPercent(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) {
    return '—';
  }
  const percent = rate * 100;
  return `${percent > 0 && percent < 10 ? percent.toFixed(1) : Math.round(percent)}%`;
}

/** Local wall-clock time of a UTC server timestamp: `2026-09-25 13:45`. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Coarse "how long ago", for last-reviewed columns. */
export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) {
    return '—';
  }
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) {
    return '—';
  }
  const minutes = Math.floor((now - time) / 60_000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days} d ago`;
  }
  return formatDateTime(iso);
}

/** Short relative-time label for how a question's next review is scheduled. */
export function formatInterval(days: number | null | undefined): string {
  if (days === null || days === undefined || !Number.isFinite(days)) {
    return '—';
  }
  if (days < 1) {
    return `${Math.max(Math.round(days * 24), 1)} h`;
  }
  return `${Math.round(days)} d`;
}

/** How many consecutive correct answers map to what review spacing. */
export const REVIEW_INTERVALS_DAYS = [1, 2, 4, 8, 16, 32, 60] as const;

/**
 * The scheduler's interval for a question, derived from its current correct
 * streak. Mirrors `review_interval_days` in `backend/app/scheduling.py`; the
 * stats page shows it as the "Streak" column.
 */
export function intervalDaysForStreak(streak: number): number {
  const index = Math.min(Math.max(streak, 0), REVIEW_INTERVALS_DAYS.length - 1);
  return REVIEW_INTERVALS_DAYS[index];
}

/**
 * Deck modes, with the labels shown on the start panel. Typed as possibly
 * undefined because these are string-indexed lookups that can miss.
 */
export const DECK_MODE_LABELS: Record<string, string | undefined> = {
  random: 'Random practice',
  smart: 'Smart review',
};

/** Review outcomes, with the labels used in lists. */
export const OUTCOME_LABELS: Record<string, string | undefined> = {
  correct: 'Correct',
  incorrect: 'Wrong',
  self_assessed: 'Self-assessed',
};
