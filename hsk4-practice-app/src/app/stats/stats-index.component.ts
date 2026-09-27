import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
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
export class StatsIndexComponent implements OnInit {
  private readonly api = inject(ReviewApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly params = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('level') ?? '')),
    { initialValue: 'HSK4' },
  );

  readonly level = computed<Level>(() => {
    const value = this.params();
    return isLevel(value) ? value : 'HSK4';
  });

  private loadedLevel: Level | null = null;

  readonly overview = signal<StatsOverview | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly order: SectionKey[] = SECTION_ORDER;
  readonly meta = SECTION_META;
  readonly kindLabels = KIND_LABELS;

  readonly formatDuration = formatDuration;
  readonly formatPercent = formatPercent;
  readonly formatDateTime = formatDateTime;

  constructor() {
    effect(() => {
      const level = this.level();
      if (this.loadedLevel !== null && level !== this.loadedLevel) {
        this.loadedLevel = level;
        this.load();
      }
    });
  }

  ngOnInit(): void {
    this.loadedLevel = this.level();
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.overview.set(null);
    this.api.overview(this.level()).subscribe({
      next: (overview) => {
        this.overview.set(overview);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set(
          'Could not load the statistics. Check that the backend is running: cd backend && ./.venv/bin/uvicorn app.main:app --port 8000',
        );
      },
    });
  }

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
