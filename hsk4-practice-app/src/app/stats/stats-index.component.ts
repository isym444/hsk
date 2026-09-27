import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { SECTION_ORDER, SECTION_META } from '../data/section-meta';
import { Level, SectionKey } from '../data/models';
import { isLevel } from '../data/tests.data';
import { LevelSwitcherComponent } from '../home/level-switcher.component';
import { KIND_LABELS } from '../data/question-inventory';
import { CategoryStats, ReviewApiService, StatsOverview } from '../core/review-api.service';
import { formatDateTime, formatDuration, formatPercent } from '../core/format';

/**
 * Cross-category overview: one card per category, each linking to its own
 * stats page, plus the combined totals.
 */
@Component({
  selector: 'app-stats-index',
  standalone: true,
  imports: [LevelSwitcherComponent],
  templateUrl: './stats-index.component.html',
  styleUrl: './stats-index.component.css',
})
export class StatsIndexComponent {
  private readonly api = inject(ReviewApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly params = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('level') ?? '')),
    { initialValue: 'HSK4' },
  );

  private readonly levelParam$ = this.route.paramMap.pipe(map((p) => p.get('level') ?? ''));

  readonly level = computed<Level>(() => {
    const value = this.params();
    return isLevel(value) ? value : 'HSK4';
  });

  /**
   * The level's overview, derived from the route param rather than fetched by
   * an `effect`. The effect version silently failed to re-fetch when the level
   * changed while this component was reused, leaving the previous level's
   * numbers on screen.
   */
  private readonly overviewResult = toSignal(
    this.levelParam$.pipe(
      map((raw) => (isLevel(raw) ? raw : 'HSK4') as Level),
      distinctUntilChanged(),
      switchMap((level) =>
        this.api.overview(level).pipe(
          map((overview) => ({ overview, failed: false as const })),
          catchError(() =>
            of({
              overview: null,
              failed: true as const,
              message:
                'Could not load the statistics. Check that the backend is running: cd backend && ./.venv/bin/uvicorn app.main:app --port 8000',
            }),
          ),
        ),
      ),
    ),
    { initialValue: null },
  );

  readonly overview = computed(() => this.overviewResult()?.overview ?? null);
  readonly loading = computed(() => this.overviewResult() === null);
  readonly error = computed(() => {
    const result = this.overviewResult();
    return result && result.failed ? result.message : null;
  });

  readonly order: SectionKey[] = SECTION_ORDER;
  readonly meta = SECTION_META;
  readonly kindLabels = KIND_LABELS;

  readonly formatDuration = formatDuration;
  readonly formatPercent = formatPercent;
  readonly formatDateTime = formatDateTime;

  statsFor(category: SectionKey): CategoryStats | null {
    return this.overview()?.categories.find((entry) => entry.category === category) ?? null;
  }

  openStats(category: SectionKey): void {
    void this.router.navigate(['/stats', category]);
  }

  practice(category: SectionKey): void {
    void this.router.navigate(['/deck', category]);
  }

  home(): void {
    void this.router.navigate(['/']);
  }
}
