import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SECTION_META } from '../data/section-meta';
import { SectionKey } from '../data/models';
import { CATEGORY_ORDER, KIND_LABELS } from '../data/question-inventory';
import { ReviewApiService, SessionSummary } from '../core/review-api.service';
import { OUTCOME_LABELS, formatDateTime, formatDuration, formatPercent } from '../core/format';

/**
 * End-of-session stats: the numbers for the practice run the learner just
 * finished, next to the same numbers for the category as a whole.
 *
 * Everything is fetched from the API by session id, so the page survives a
 * refresh and can be reopened from the stats page later.
 */
@Component({
  selector: 'app-deck-summary',
  standalone: true,
  templateUrl: './deck-summary.component.html',
  styleUrl: './deck-summary.component.css',
})
export class DeckSummaryComponent implements OnInit {
  private readonly api = inject(ReviewApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly summary = signal<SessionSummary | null>(null);
  readonly error = signal<string | null>(null);
  readonly loading = signal(true);

  readonly formatDuration = formatDuration;
  readonly formatPercent = formatPercent;
  readonly formatDateTime = formatDateTime;
  readonly outcomeLabels = OUTCOME_LABELS;
  readonly kindLabels = KIND_LABELS;

  readonly category = computed<SectionKey>(() => {
    const value = this.route.snapshot.paramMap.get('category') ?? '';
    return (CATEGORY_ORDER as string[]).includes(value) ? (value as SectionKey) : 'listening';
  });

  readonly meta = computed(() => SECTION_META[this.category()]);

  readonly modeLabel = computed(() =>
    this.summary()?.mode === 'smart' ? '智能复习' : '随机练习',
  );

  /** How the session compared with the same category's earlier history. */
  readonly priorDelta = computed<number | null>(() => {
    const data = this.summary();
    if (!data || data.success_rate === null || data.prior.success_rate === null) {
      return null;
    }
    return data.success_rate - data.prior.success_rate;
  });

  readonly speedDelta = computed<number | null>(() => {
    const data = this.summary();
    if (!data || data.avg_ms === null || data.prior.avg_ms === null) {
      return null;
    }
    return data.avg_ms - data.prior.avg_ms;
  });

  /** Fastest and slowest answer of the session, for a bit of shape. */
  readonly slowest = computed(() => {
    const items = this.summary()?.items.filter((item) => item.outcome !== 'self_assessed') ?? [];
    if (!items.length) {
      return null;
    }
    return items.reduce((worst, item) => (item.elapsed_ms > worst.elapsed_ms ? item : worst));
  });

  ngOnInit(): void {
    const sessionId = this.route.snapshot.paramMap.get('sessionId') ?? '';
    this.api.session(sessionId).subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('找不到这次练习的记录（可能已被删除，或后端没有启动）。');
      },
    });
  }

  again(): void {
    void this.router.navigate(['/deck', this.category()]);
  }

  stats(): void {
    void this.router.navigate(['/stats', this.category()]);
  }

  home(): void {
    void this.router.navigate(['/']);
  }
}
