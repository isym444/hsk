import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SECTION_ORDER, SECTION_META } from '../data/section-meta';
import { SectionKey } from '../data/models';
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
  templateUrl: './stats-index.component.html',
  styleUrl: './stats-index.component.css',
})
export class StatsIndexComponent implements OnInit {
  private readonly api = inject(ReviewApiService);
  private readonly router = inject(Router);

  readonly overview = signal<StatsOverview | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly order: SectionKey[] = SECTION_ORDER;
  readonly meta = SECTION_META;
  readonly kindLabels = KIND_LABELS;

  readonly formatDuration = formatDuration;
  readonly formatPercent = formatPercent;
  readonly formatDateTime = formatDateTime;

  ngOnInit(): void {
    this.api.overview().subscribe({
      next: (overview) => {
        this.overview.set(overview);
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
