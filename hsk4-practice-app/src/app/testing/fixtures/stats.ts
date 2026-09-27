/**
 * Fixtures for the review API's response shapes, so the stats/deck specs can
 * render realistic numbers without hitting a server.
 */

import { categoryTotalForLevel } from '../../data/question-inventory';
import {
  CategoryStats,
  CategoryStatsPage,
  DeckPreview,
  DeckQuestion,
  DeckResponse,
  QuestionStats,
  SessionSummary,
  StatsOverview,
} from '../../core/review-api.service';

/**
 * Real category totals, read from the local question bank instead of being
 * hardcoded, so adding a paper cannot leave these fixtures behind.
 */
const TOTALS: Record<string, number> = {
  listening: categoryTotalForLevel('HSK4', 'listening'),
  reading: categoryTotalForLevel('HSK4', 'reading'),
  writing: categoryTotalForLevel('HSK4', 'writing'),
};
const ALL_TOTAL = TOTALS['listening'] + TOTALS['reading'] + TOTALS['writing'];

export function categoryStats(
  category: keyof typeof TOTALS,
  overrides: Partial<CategoryStats> = {},
): CategoryStats {
  const total = TOTALS[category];
  return {
    category,
    total_questions: total,
    scoreable_questions: total,
    answered_questions: 0,
    answered_scoreable: 0,
    unanswered_questions: total,
    coverage: 0,
    attempts: 0,
    correct: 0,
    incorrect: 0,
    self_assessed: 0,
    success_rate: null,
    avg_ms: null,
    total_review_ms: 0,
    first_reviewed_at: null,
    last_reviewed_at: null,
    session_count: 0,
    ...overrides,
  };
}

export function overviewFixture(overrides: Partial<StatsOverview> = {}): StatsOverview {
  const listening = categoryStats('listening', {
    answered_questions: 12,
    answered_scoreable: 12,
    unanswered_questions: 123,
    coverage: 12 / 135,
    attempts: 20,
    correct: 15,
    incorrect: 5,
    success_rate: 0.75,
    avg_ms: 4200,
    total_review_ms: 84_000,
    last_reviewed_at: '2026-09-25T10:00:00.000Z',
    session_count: 2,
  });
  const reading = categoryStats('reading', {
    answered_questions: 6,
    answered_scoreable: 6,
    unanswered_questions: 114,
    coverage: 6 / 120,
    attempts: 8,
    correct: 4,
    incorrect: 4,
    success_rate: 0.5,
    avg_ms: 6100,
    total_review_ms: 48_800,
    last_reviewed_at: '2026-09-24T18:30:00.000Z',
    session_count: 1,
  });
  const writing = categoryStats('writing', {
    scoreable_questions: 30,
    answered_questions: 3,
    answered_scoreable: 2,
    unanswered_questions: 42,
    coverage: 3 / 45,
    attempts: 4,
    correct: 2,
    incorrect: 1,
    self_assessed: 1,
    success_rate: 2 / 3,
    avg_ms: 9000,
    total_review_ms: 27_000,
    last_reviewed_at: '2026-09-23T09:15:00.000Z',
    session_count: 1,
  });

  return {
    generated_at: '2026-09-25T12:00:00.000Z',
    categories: [listening, reading, writing],
    totals: categoryStats('listening', {
      category: 'all',
      total_questions: ALL_TOTAL,
      scoreable_questions: ALL_TOTAL - 20,
      answered_questions: 21,
      answered_scoreable: 20,
      unanswered_questions: ALL_TOTAL - 21,
      coverage: 21 / ALL_TOTAL,
      attempts: 32,
      correct: 21,
      incorrect: 10,
      self_assessed: 1,
      success_rate: 21 / 31,
      avg_ms: 5100,
      total_review_ms: 158_100,
      first_reviewed_at: '2026-09-23T09:15:00.000Z',
      last_reviewed_at: '2026-09-25T10:00:00.000Z',
      session_count: 4,
    }),
    ...overrides,
  };
}

export function questionStats(overrides: Partial<QuestionStats> = {}): QuestionStats {
  return {
    question_key: 'H41001:reading:fill:46',
    label: '你去买啤酒吗？（　）帮我买一盒牛奶吧。',
    paper: 'H41001',
    category: 'reading',
    kind: 'fill',
    number: 46,
    part: 1,
    scoreable: true,
    attempts: 0,
    correct: 0,
    incorrect: 0,
    self_assessed: 0,
    success_rate: null,
    avg_ms: null,
    streak: 0,
    last_answered_at: null,
    ...overrides,
  };
}

export function deckQuestion(overrides: Partial<DeckQuestion> = {}): DeckQuestion {
  return { ...questionStats(), priority: 3, reason: 'new', ...overrides };
}

export function deckPreviewFixture(overrides: Partial<DeckPreview> = {}): DeckPreview {
  return {
    category: 'reading',
    total_questions: TOTALS['reading'],
    answered: 6,
    unseen: TOTALS['reading'] - 6,
    weak: 2,
    due: 1,
    ...overrides,
  };
}

export function deckResponseFixture(
  questions: DeckQuestion[],
  category: keyof typeof TOTALS = 'reading',
  overrides: Partial<DeckResponse> = {},
): DeckResponse {
  return {
    category,
    mode: 'smart',
    count: questions.length,
    total_questions: TOTALS[category],
    answered_questions: 0,
    generated_at: '2026-09-25T12:00:00.000Z',
    questions,
    ...overrides,
  };
}

export function categoryPageFixture(overrides: Partial<CategoryStatsPage> = {}): CategoryStatsPage {
  return {
    stats: categoryStats('reading', {
      answered_questions: 2,
      unanswered_questions: 118,
      attempts: 3,
      correct: 2,
      incorrect: 1,
      self_assessed: 0,
      success_rate: 2 / 3,
      avg_ms: 3000,
      coverage: 2 / 120,
      last_reviewed_at: '2026-09-25T10:00:00.000Z',
      session_count: 1,
    }),
    by_kind: [
      {
        kind: 'fill',
        questions: 30,
        answered_questions: 1,
        attempts: 1,
        correct: 1,
        incorrect: 0,
        self_assessed: 0,
        success_rate: 1,
        avg_ms: 2000,
        coverage: 1 / 30,
      },
      {
        kind: 'mc',
        questions: 60,
        answered_questions: 0,
        attempts: 0,
        correct: 0,
        incorrect: 0,
        self_assessed: 0,
        success_rate: null,
        avg_ms: null,
        coverage: 0,
      },
    ],
    questions: [
      questionStats({
        attempts: 2,
        correct: 1,
        incorrect: 1,
        success_rate: 0.5,
        avg_ms: 3000,
        streak: 0,
        last_answered_at: '2026-09-25T10:00:00.000Z',
      }),
      questionStats({
        question_key: 'H41001:reading:mc:66',
        label: '★ 刷牙时，我们应该：',
        kind: 'mc',
        number: 66,
        part: 3,
      }),
      questionStats({
        question_key: 'H41002:reading:order:56',
        label: '它就长满了这面墙 / 这种植物在这个季节长得很快 / 经过短短一个星期',
        paper: 'H41002',
        kind: 'order',
        number: 56,
        part: 2,
        attempts: 1,
        correct: 0,
        incorrect: 1,
        success_rate: 0,
        avg_ms: 8000,
        last_answered_at: '2026-09-25T09:00:00.000Z',
      }),
    ],
    recent_sessions: [
      {
        id: 'session-1',
        category: 'reading',
        mode: 'smart',
        started_at: '2026-09-25T09:55:00.000Z',
        ended_at: '2026-09-25T10:00:00.000Z',
        answered: 3,
        correct: 2,
        incorrect: 1,
        self_assessed: 0,
        success_rate: 2 / 3,
        avg_ms: 3000,
        total_ms: 9000,
      },
    ],
    ...overrides,
  };
}

export function sessionSummaryFixture(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 'session-1',
    category: 'reading',
    mode: 'smart',
    started_at: '2026-09-25T09:55:00.000Z',
    ended_at: '2026-09-25T10:00:00.000Z',
    duration_ms: 300_000,
    answered: 3,
    correct: 2,
    incorrect: 1,
    self_assessed: 0,
    success_rate: 2 / 3,
    avg_ms: 4000,
    total_ms: 12_000,
    items: [
      {
        question_key: 'H41001:reading:fill:46',
        label: '你去买啤酒吗？（　）帮我买一盒牛奶吧。',
        paper: 'H41001',
        number: 46,
        kind: 'fill',
        part: 1,
        scoreable: true,
        outcome: 'correct',
        elapsed_ms: 2000,
        answered_at: '2026-09-25T09:56:00.000Z',
        answered_at_local: '2026-09-25T10:56:00.000+01:00',
      },
      {
        question_key: 'H41001:reading:mc:66',
        label: '★ 刷牙时，我们应该：',
        paper: 'H41001',
        number: 66,
        kind: 'mc',
        part: 3,
        scoreable: true,
        outcome: 'incorrect',
        elapsed_ms: 8000,
        answered_at: '2026-09-25T09:57:00.000Z',
        answered_at_local: null,
      },
      {
        question_key: 'H41002:reading:fill:46',
        label: '第二套的填空题。',
        paper: 'H41002',
        number: 46,
        kind: 'fill',
        part: 1,
        scoreable: true,
        outcome: 'correct',
        elapsed_ms: 2000,
        answered_at: '2026-09-25T09:58:00.000Z',
        answered_at_local: null,
      },
    ],
    prior: { attempts: 5, success_rate: 0.4, avg_ms: 6000 },
    category_stats: categoryStats('reading', {
      answered_questions: 8,
      attempts: 11,
      correct: 6,
      incorrect: 5,
      success_rate: 6 / 11,
      avg_ms: 5000,
      coverage: 8 / 120,
    }),
    ...overrides,
  };
}
