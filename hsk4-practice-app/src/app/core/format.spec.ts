import {
  DECK_MODE_LABELS,
  OUTCOME_LABELS,
  formatDateTime,
  formatDuration,
  formatElapsed,
  formatPercent,
  formatRelative,
  intervalDaysForStreak,
  localIsoWithOffset,
} from './format';

describe('format helpers', () => {
  describe('formatDuration', () => {
    it('renders sub-second, second and minute scales', () => {
      expect(formatDuration(850)).toBe('850 毫秒');
      expect(formatDuration(4200)).toBe('4.2 秒');
      expect(formatDuration(60000)).toBe('1 分 0 秒');
      expect(formatDuration(72000)).toBe('1 分 12 秒');
      expect(formatDuration(125000)).toBe('2 分 5 秒');
    });

    it('renders an em dash for missing or impossible values', () => {
      expect(formatDuration(null)).toBe('—');
      expect(formatDuration(undefined)).toBe('—');
      expect(formatDuration(-1)).toBe('—');
      expect(formatDuration(Number.NaN)).toBe('—');
    });
  });

  describe('formatElapsed', () => {
    it('keeps one decimal below ten seconds and rounds above', () => {
      expect(formatElapsed(0)).toBe('0.0 秒');
      expect(formatElapsed(4200)).toBe('4.2 秒');
      expect(formatElapsed(9999)).toBe('10.0 秒');
      expect(formatElapsed(12500)).toBe('13 秒');
    });
  });

  describe('formatPercent', () => {
    it('shows a decimal place for small non-zero rates', () => {
      expect(formatPercent(0.053)).toBe('5.3%');
      expect(formatPercent(6 / 120)).toBe('5.0%');
      expect(formatPercent(1 / 135)).toBe('0.7%');
    });

    it('rounds ordinary rates', () => {
      expect(formatPercent(0)).toBe('0%');
      expect(formatPercent(0.5)).toBe('50%');
      expect(formatPercent(2 / 3)).toBe('67%');
      expect(formatPercent(1)).toBe('100%');
    });

    it('renders an em dash when there is nothing to rate', () => {
      expect(formatPercent(null)).toBe('—');
      expect(formatPercent(undefined)).toBe('—');
    });
  });

  describe('formatDateTime', () => {
    it('renders a local wall-clock timestamp', () => {
      expect(formatDateTime('2026-09-25T12:45:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    });

    it('renders an em dash for missing or malformed values', () => {
      expect(formatDateTime(null)).toBe('—');
      expect(formatDateTime('not-a-date')).toBe('—');
    });
  });

  describe('formatRelative', () => {
    const now = Date.parse('2026-09-25T12:00:00.000Z');

    it('scales from seconds to days', () => {
      expect(formatRelative('2026-09-25T11:59:30.000Z', now)).toBe('刚刚');
      expect(formatRelative('2026-09-25T11:30:00.000Z', now)).toBe('30 分钟前');
      expect(formatRelative('2026-09-25T09:00:00.000Z', now)).toBe('3 小时前');
      expect(formatRelative('2026-09-22T12:00:00.000Z', now)).toBe('3 天前');
    });

    it('falls back to a date once it is a month old', () => {
      expect(formatRelative('2026-01-05T12:00:00.000Z', now)).toMatch(/^2026-01-05 \d{2}:\d{2}$/);
    });

    it('renders an em dash for missing values', () => {
      expect(formatRelative(null, now)).toBe('—');
    });
  });

  describe('localIsoWithOffset', () => {
    it('round-trips the same instant and carries an explicit offset', () => {
      const date = new Date('2026-09-25T12:45:30.123Z');
      const formatted = localIsoWithOffset(date);

      expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
      expect(Date.parse(formatted)).toBe(date.getTime());
    });

    it('reports local time rather than UTC', () => {
      const date = new Date('2026-09-25T12:45:30.123Z');
      const formatted = localIsoWithOffset(date);
      const offsetMinutes = -date.getTimezoneOffset();
      const sign = offsetMinutes >= 0 ? '+' : '-';
      const expectedHours = String(Math.abs(offsetMinutes) / 60).padStart(2, '0');
      const expectedMinutes = String(Math.abs(offsetMinutes) % 60).padStart(2, '0');

      expect(formatted.endsWith(`${sign}${expectedHours}:${expectedMinutes}`)).toBeTrue();
    });
  });

  describe('intervalDaysForStreak', () => {
    it('doubles the review spacing with each consecutive correct answer', () => {
      expect([0, 1, 2, 3, 4, 5, 6, 7].map(intervalDaysForStreak)).toEqual([
        1, 2, 4, 8, 16, 32, 60, 60,
      ]);
    });

    it('clamps negative streaks to the shortest interval', () => {
      expect(intervalDaysForStreak(-4)).toBe(1);
    });
  });

  it('labels every deck mode and review outcome', () => {
    expect(DECK_MODE_LABELS['random']).toBe('随机练习');
    expect(DECK_MODE_LABELS['smart']).toBe('智能复习');
    expect(OUTCOME_LABELS['correct']).toBe('答对');
    expect(OUTCOME_LABELS['incorrect']).toBe('答错');
    expect(OUTCOME_LABELS['self_assessed']).toBe('自评');
  });
});
