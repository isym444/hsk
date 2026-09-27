import { Component, HostListener, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { SECTION_META, SectionMeta } from '../data/section-meta';
import { isLevel, papersForLevel } from '../data/tests.data';
import { LevelSwitcherComponent } from '../home/level-switcher.component';
import { Level, SectionKey, TestId, Unit } from '../data/models';
import { CATEGORY_ORDER, categoryTotalForLevel, perPaperForLevel } from '../data/question-inventory';
import { AudioService } from '../core/audio.service';
import { DeckStateService } from '../core/deck-state.service';
import { PreferencesService } from '../core/preferences.service';
import { DeckMode } from '../core/review-api.service';
import { DECK_MODE_LABELS, formatDuration, formatPercent } from '../core/format';
import { TrueFalseQuestionComponent } from '../questions/true-false-question/true-false-question.component';
import { PictureChoiceQuestionComponent } from '../questions/picture-choice-question/picture-choice-question.component';
import { MultipleChoiceQuestionComponent } from '../questions/multiple-choice-question/multiple-choice-question.component';
import { FillBlankQuestionComponent } from '../questions/fill-blank-question/fill-blank-question.component';
import { SentenceOrderQuestionComponent } from '../questions/sentence-order-question/sentence-order-question.component';
import { SentenceBuildQuestionComponent } from '../questions/sentence-build-question/sentence-build-question.component';
import { OpenWritingQuestionComponent } from '../questions/open-writing-question/open-writing-question.component';
import { AnswerEvent } from '../questions/answer-event';

/**
 * Runs an aggregated practice deck for one category (all three papers).
 *
 * The session has no fixed length: `DeckStateService` refills the queue, and
 * the learner ends it whenever they like. Finishing navigates to that
 * session's own summary page.
 */
@Component({
  selector: 'app-deck-run',
  standalone: true,
  imports: [
    LevelSwitcherComponent,
    TrueFalseQuestionComponent,
    PictureChoiceQuestionComponent,
    MultipleChoiceQuestionComponent,
    FillBlankQuestionComponent,
    SentenceOrderQuestionComponent,
    SentenceBuildQuestionComponent,
    OpenWritingQuestionComponent,
  ],
  templateUrl: './deck-run.component.html',
  styleUrl: './deck-run.component.css',
})
export class DeckRunComponent implements OnInit {
  readonly deck = inject(DeckStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly audio = inject(AudioService);

  /** The live timer is hidden unless the learner has opted into it. */
  private readonly prefs = inject(PreferencesService);

  readonly modes: DeckMode[] = ['smart', 'random'];
  readonly modeLabels = DECK_MODE_LABELS;
  readonly chosenMode = signal<DeckMode>('smart');
  readonly starting = signal(false);

  readonly formatDuration = formatDuration;
  readonly formatPercent = formatPercent;

  /** Route param, tracked live so switching categories re-prepares the page. */
  private readonly params = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('category') ?? '')),
    { initialValue: 'listening' },
  );

  readonly category = computed<SectionKey>(() => {
    const value = this.params();
    return (CATEGORY_ORDER as string[]).includes(value) ? (value as SectionKey) : 'listening';
  });

  /** Route param `:level`, tracked live so switching re-prepares the page. */
  private readonly levelParam = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('level') ?? '')),
    { initialValue: 'HSK4' },
  );

  readonly level = computed<Level>(() => {
    const value = this.levelParam();
    return isLevel(value) ? value : 'HSK4';
  });

  readonly meta = computed<SectionMeta>(() => SECTION_META[this.category()]);
  readonly total = computed(() => categoryTotalForLevel(this.level(), this.category()));

  /** Per-paper counts, so the start panel shows where the deck comes from. */
  readonly perPaper = computed(() =>
    perPaperForLevel(this.level(), this.category()),
  );

  readonly papers = computed(() => Object.keys(this.perPaper()));

  /** Spelled-out paper count for the hero copy ("four sample papers"). */


  /** Last level+category this component prepared; see `ngOnInit` / the effect. */
  private prepared: string | null = null;

  constructor() {
    // The component instance is reused when only the category param changes,
    // so re-prepare on a live category switch. The first run is handled by
    // ngOnInit (which also clears any state left over from a previous visit).
    effect(() => {
      const key = `${this.level()}|${this.category()}`;
      if (this.prepared === null || key === this.prepared) {
        return;
      }
      this.prepared = key;
      this.deck.reset();
      void this.deck.loadPreview(this.category(), this.level());
    });
  }

  ngOnInit(): void {
    this.prepared = `${this.level()}|${this.category()}`;
    this.deck.reset();
    void this.deck.loadPreview(this.category(), this.level());
  }

  /* ------------------------------------------------------------------ */
  /* Start panel                                                        */
  /* ------------------------------------------------------------------ */

  chooseMode(mode: DeckMode): void {
    this.chosenMode.set(mode);
  }

  start(): void {
    this.starting.set(true);
    void this.deck
      .start(this.category(), this.level(), this.chosenMode())
      .finally(() => this.starting.set(false));
  }

  async retry(): Promise<void> {
    this.deck.reset();
    await this.deck.loadPreview(this.category(), this.level());
  }

  /* ------------------------------------------------------------------ */
  /* Running session                                                    */
  /* ------------------------------------------------------------------ */

  onAnswered(event: AnswerEvent): void {
    void this.deck.answer(event.correct);
  }

  /**
   * The sample paper the current question came from, so a listening question
   * can find its recording. The deck mixes all three papers into one queue, so
   * this is read per question rather than from the page.
   */
  paperOf(unit: Unit): TestId | null {
    const paper = this.deck.current()?.paper;
    return paper === 'H41001' || paper === 'H41002' || paper === 'H41003' ? paper : null;
  }

  next(): void {
    this.audio.stop();
    void this.deck.next();
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }

  /**
   * Enter moves on once the question has been judged. Skipped inside the
   * open-writing textarea, where Enter is a newline.
   */
  @HostListener('document:keydown.enter', ['$event'])
  onEnter(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (target && ['TEXTAREA', 'INPUT', 'BUTTON'].includes(target.tagName)) {
      return;
    }
    if (this.deck.phase() === 'running' && this.deck.answered()) {
      event.preventDefault();
      this.next();
    }
  }

  /** Finishes the session and shows its summary; an empty session is dropped. */
  async endSession(goToSummary = true): Promise<void> {
    this.audio.stop();
    if (this.deck.tally().answered === 0) {
      await this.deck.discard();
      void this.router.navigate(['/']);
      return;
    }
    const summary = await this.deck.finish();
    if (!summary) {
      return;
    }
    void this.router.navigate(
      goToSummary ? ['/deck', summary.category, 'summary', summary.id] : ['/'],
    );
  }

  back(): void {
    void this.endSession(false);
  }

  home(): void {
    void this.router.navigate(['/']);
  }

  statsLink(): void {
    void this.router.navigate(['/stats', this.category()]);
  }

  /* ------------------------------------------------------------------ */
  /* Display helpers                                                    */
  /* ------------------------------------------------------------------ */

  readonly progressLabel = computed(() => `Answered this session: ${this.deck.tally().answered}`);

  /** Whether the per-question timer readouts are currently visible. */
  readonly timingVisible = this.prefs.showResponseTimer;

  /** Shows/hides the timing readouts, and remembers the choice on this device. */
  toggleTimer(): void {
    this.prefs.toggleResponseTimer();
  }
}
