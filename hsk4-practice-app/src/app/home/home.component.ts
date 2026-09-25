import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SECTION_META, SECTION_ORDER } from '../data/section-meta';
import { PAPER_COUNT_LABEL, PAPER_RANGE_LABEL, TEST_IDS } from '../data/tests.data';
import { SectionKey, TestId } from '../data/models';
import { KIND_LABELS, categoryTotal } from '../data/question-inventory';
import { QuizBuilderService } from '../core/quiz-builder.service';
import { QuizStateService } from '../core/quiz-state.service';
import { CategoryStats, ReviewApiService } from '../core/review-api.service';
import { formatDateTime, formatDuration, formatPercent } from '../core/format';

interface HomeSectionButton {
  key: SectionKey;
  label: string;
  color: string;
  count: number;
}

interface HomeTestRow {
  id: TestId;
  sections: HomeSectionButton[];
}

/**
 * Home screen: the aggregated skill decks (every paper combined) come first,
 * with their live progress from the review database. The per-paper sections
 * grid is kept below as "Practice by paper".
 */
@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent implements OnInit {
  private readonly quizState = inject(QuizStateService);
  private readonly builder = inject(QuizBuilderService);
  private readonly api = inject(ReviewApiService);
  private readonly router = inject(Router);

  /** Same 3 tests × 3 sections grid as the original `renderHome()`. */
  readonly tests: HomeTestRow[] = TEST_IDS.map((id) => ({
    id,
    sections: SECTION_ORDER.map((key) => ({
      key,
      label: SECTION_META[key].label,
      color: SECTION_META[key].color,
      count: this.builder.countQuestions(id, key),
    })),
  }));

  readonly categories: SectionKey[] = SECTION_ORDER;

  readonly paperCountLabel = PAPER_COUNT_LABEL;
  readonly paperRange = PAPER_RANGE_LABEL;
  readonly meta = SECTION_META;
  readonly kindLabels = KIND_LABELS;

  readonly overview = signal<{ categories: CategoryStats[]; generated_at: string } | null>(null);
  readonly statsError = signal(false);
  readonly showPapers = signal(false);

  readonly formatDuration = formatDuration;
  readonly formatPercent = formatPercent;
  readonly formatDateTime = formatDateTime;

  /** Deck size per category, straight from the question inventory. */
  categoryTotal = categoryTotal;

  ngOnInit(): void {
    this.api.overview().subscribe({
      next: (overview) => this.overview.set(overview),
      error: () => this.statsError.set(true),
    });
  }

  statsFor(category: SectionKey): CategoryStats | null {
    return this.overview()?.categories.find((entry) => entry.category === category) ?? null;
  }

  /* ---------- Aggregated decks (primary flow) ---------- */

  practiceDeck(category: SectionKey): void {
    void this.router.navigate(['/deck', category]);
  }

  openStats(category: SectionKey): void {
    void this.router.navigate(['/stats', category]);
  }

  allStats(): void {
    void this.router.navigate(['/stats']);
  }

  togglePapers(): void {
    this.showPapers.update((shown) => !shown);
  }

  /* ---------- Per-paper practice (secondary flow) ---------- */

  startPaperSection(testId: TestId, sectionKey: SectionKey): void {
    this.quizState.start(testId, sectionKey);
    void this.router.navigate(['/quiz', testId, sectionKey]);
  }
}
