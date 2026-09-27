import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { SECTION_META, SECTION_ORDER } from '../data/section-meta';
import { isLevel, papersForLevel } from '../data/tests.data';
import { Level, SectionKey, TestId } from '../data/models';
import { KIND_LABELS, categoryTotalForLevel, levelTotal } from '../data/question-inventory';
import { LevelSwitcherComponent } from './level-switcher.component';
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

/** Levels in display order, for the switcher and the header copy. */
const DEFAULT_LEVEL: Level = 'HSK4';

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
  imports: [LevelSwitcherComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  private readonly quizState = inject(QuizStateService);
  private readonly builder = inject(QuizBuilderService);
  private readonly api = inject(ReviewApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /**
   * The `:level` route param, as a stream. Kept as an observable as well as a
   * signal because the stats request is derived from it directly — see
   * `overviewResult`.
   */
  private readonly levelParam$ = this.route.paramMap.pipe(map((p) => p.get('level') ?? ''));

  /** The same param as a signal, for the template and the local totals. */
  private readonly params = toSignal(this.levelParam$, { initialValue: '' });

  readonly level = computed<Level>(() => {
    const value = this.params();
    return isLevel(value) ? value : DEFAULT_LEVEL;
  });

  /** The papers of the current level, for the per-paper practice grid. */
  readonly papers = computed(() => papersForLevel(this.level()));

  /** One row per paper of this level, each with its three section buttons. */
  readonly tests = computed<HomeTestRow[]>(() =>
    this.papers().map((id) => ({
      id,
      sections: SECTION_ORDER.map((key) => ({
        key,
        label: SECTION_META[key].label,
        color: SECTION_META[key].color,
        count: this.builder.countQuestions(id, key),
      })),
    })),
  );

  readonly categories: SectionKey[] = SECTION_ORDER;

  /** Total questions in the current level, and the papers it pools. */
  readonly levelQuestionCount = computed(() => levelTotal(this.level()));
  readonly paperRange = computed(() => this.papers().join(' · '));

  readonly meta = SECTION_META;
  readonly kindLabels = KIND_LABELS;

  /**
   * Stats for the level on screen, driven straight off the route param.
   *
   * This used to be an `effect` that watched `level()` and called a loader,
   * which silently failed to re-fetch when the level changed while the
   * component was reused — so the HSK3 page kept showing HSK4's numbers.
   * Deriving the data from the param stream instead makes the request and the
   * level impossible to get out of step: `switchMap` cancels the previous
   * level's in-flight request, and there is no bookkeeping to forget.
   */
  private readonly overviewResult = toSignal(
    this.levelParam$.pipe(
      map((raw) => (isLevel(raw) ? raw : DEFAULT_LEVEL)),
      distinctUntilChanged(),
      switchMap((level) =>
        this.api.overview(level).pipe(
          map((overview) => ({ overview, failed: false as const })),
          catchError(() => of({ overview: null, failed: true as const })),
        ),
      ),
    ),
    { initialValue: null },
  );

  /** The level's stats, or null while loading / after a failure. */
  readonly overview = computed(() => this.overviewResult()?.overview ?? null);

  readonly statsError = computed(() => this.overviewResult()?.failed === true);

  readonly showPapers = signal(false);

  readonly formatDuration = formatDuration;
  readonly formatPercent = formatPercent;
  readonly formatDateTime = formatDateTime;

  /** Deck size per category for the current level, from the question inventory. */
  categoryTotal(category: SectionKey): number {
    return categoryTotalForLevel(this.level(), category);
  }

  statsFor(category: SectionKey): CategoryStats | null {
    return this.overview()?.categories.find((entry) => entry.category === category) ?? null;
  }

  /* ---------- Aggregated decks (primary flow) ---------- */

  practiceDeck(category: SectionKey): void {
    void this.router.navigate(['/', this.level(), 'deck', category]);
  }

  openStats(category: SectionKey): void {
    void this.router.navigate(['/', this.level(), 'stats', category]);
  }

  allStats(): void {
    void this.router.navigate(['/', this.level(), 'stats']);
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
