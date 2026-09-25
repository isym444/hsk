import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SECTION_META } from '../data/section-meta';
import { SectionKey } from '../data/models';
import { CATEGORY_ORDER, KIND_LABELS, categoryTotal } from '../data/question-inventory';
import {
  CategoryStatsPage,
  QuestionStats,
  ReviewApiService,
  SessionListItem,
} from '../core/review-api.service';
import {
  DECK_MODE_LABELS,
  formatDateTime,
  formatDuration,
  formatPercent,
  formatRelative,
  intervalDaysForStreak,
} from '../core/format';

type QuestionFilter = 'all' | 'unseen' | 'weak' | 'wrong';

interface QuestionRow extends QuestionStats {
  /** True when the question has been answered at least once. */
  seen: boolean;
  /** True when it has never been answered correctly. */
  neverCorrect: boolean;
}

/**
 * Per-category stats: coverage, success rate, average response time, the
 * per-question breakdown, and the recent sessions for that category.
 */
@Component({
  selector: 'app-category-stats',
  standalone: true,
  templateUrl: './category-stats.component.html',
  styleUrl: './category-stats.component.css',
})
export class CategoryStatsComponent implements OnInit {
  private readonly api = inject(ReviewApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly page = signal<CategoryStatsPage | null>(null);
  readonly error = signal<string | null>(null);
  readonly loading = signal(true);
  readonly filter = signal<QuestionFilter>('all');

  readonly formatDuration = formatDuration;
  readonly formatPercent = formatPercent;
  readonly formatDateTime = formatDateTime;
  readonly formatRelative = formatRelative;
  readonly kindLabels = KIND_LABELS;
  readonly modeLabels = DECK_MODE_LABELS;

  readonly category = computed<SectionKey>(() => {
    const value = this.route.snapshot.paramMap.get('category') ?? '';
    return (CATEGORY_ORDER as string[]).includes(value) ? (value as SectionKey) : 'listening';
  });

  readonly meta = computed(() => SECTION_META[this.category()]);

  readonly rows = computed<QuestionRow[]>(() =>
    (this.page()?.questions ?? []).map((question) => ({
      ...question,
      seen: question.attempts > 0,
      neverCorrect: question.attempts > 0 && question.correct === 0,
    })),
  );

  /** Counts behind the filter chips. */
  readonly counts = computed(() => {
    const rows = this.rows();
    return {
      all: rows.length,
      unseen: rows.filter((row) => !row.seen).length,
      weak: rows.filter((row) => row.seen && (row.success_rate ?? 0) < 0.6).length,
      wrong: rows.filter((row) => row.neverCorrect).length,
    };
  });

  readonly visibleRows = computed<QuestionRow[]>(() => {
    const rows = this.rows();
    switch (this.filter()) {
      case 'unseen':
        return rows.filter((row) => !row.seen);
      case 'weak':
        return rows.filter((row) => row.seen && (row.success_rate ?? 0) < 0.6);
      case 'wrong':
        return rows.filter((row) => row.neverCorrect);
      default:
        return rows;
    }
  });

  /**
   * Questions worth revisiting: answered at least once and not yet consistently
   * right, weakest first. A question you have never got wrong does not belong
   * in a "needs review" list.
   */
  readonly weakest = computed<QuestionRow[]>(() =>
    this.rows()
      .filter((row) => row.seen && (row.success_rate ?? 0) < 0.9)
      .sort((a, b) => (a.success_rate ?? 0) - (b.success_rate ?? 0) || b.attempts - a.attempts)
      .slice(0, 5),
  );

  readonly total = computed(() => categoryTotal(this.category()));

  ngOnInit(): void {
    this.api.categoryPage(this.category()).subscribe({
      next: (page) => {
        this.page.set(page);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set(
          '无法读取统计数据。请确认后端已启动：cd backend && ./.venv/bin/uvicorn app.main:app --port 8000',
        );
      },
    });
  }

  setFilter(filter: QuestionFilter): void {
    this.filter.set(filter);
  }

  /** The scheduler's current review interval for a question, in days. */
  interval(row: QuestionRow): number {
    return intervalDaysForStreak(row.streak);
  }

  practice(): void {
    void this.router.navigate(['/deck', this.category()]);
  }

  home(): void {
    void this.router.navigate(['/']);
  }

  allStats(): void {
    void this.router.navigate(['/stats']);
  }

  openSession(session: SessionListItem): void {
    void this.router.navigate(['/deck', this.category(), 'summary', session.id]);
  }
}
