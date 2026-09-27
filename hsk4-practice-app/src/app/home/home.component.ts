import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
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
export class HomeComponent implements OnInit {
  private readonly quizState = inject(QuizStateService);
  private readonly builder = inject(QuizBuilderService);
  private readonly api = inject(ReviewApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Route param, tracked live so switching level re-renders this page. */
  private readonly params = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('level') ?? '')),
    { initialValue: '' },
  );

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

  /** Lowest level currently rendered, so a level switch refetches its stats. */
  private loadedLevel: Level | null = null;

  readonly overview = signal<{ categories: CategoryStats[]; generated_at: string } | null>(null);
  readonly statsError = signal(false);
  readonly showPapers = signal(false);

  readonly formatDuration = formatDuration;
  readonly formatPercent = formatPercent;
  readonly formatDateTime = formatDateTime;

  /** Deck size per category for the current level, from the question inventory. */
  categoryTotal(category: SectionKey): number {
    return categoryTotalForLevel(this.level(), category);
  }

  constructor() {
    // The component is reused when only the level param changes, so reload on a
    // live switch; ngOnInit covers the first paint.
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
    this.overview.set(null);
    this.statsError.set(false);
    this.api.overview(this.level()).subscribe({
      next: (overview) => this.overview.set(overview),
      error: () => this.statsError.set(true),
    });
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
