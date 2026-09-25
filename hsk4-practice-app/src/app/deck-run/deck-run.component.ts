import { Component, HostListener, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { SECTION_META, SectionMeta } from '../data/section-meta';
import { SectionKey } from '../data/models';
import { CATEGORY_ORDER, categoryTotal, inventoryForCategory } from '../data/question-inventory';
import { SpeechService } from '../core/speech.service';
import { DeckStateService } from '../core/deck-state.service';
import { DeckMode } from '../core/review-api.service';
import { DECK_MODE_LABELS, formatDuration, formatPercent } from '../core/format';
import { TrueFalseQuestionComponent } from '../questions/true-false-question/true-false-question.component';
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
    TrueFalseQuestionComponent,
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
  private readonly speech = inject(SpeechService);

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

  readonly meta = computed<SectionMeta>(() => SECTION_META[this.category()]);
  readonly total = computed(() => categoryTotal(this.category()));

  /** Per-paper counts, so the start panel shows where the deck comes from. */
  readonly perPaper = computed(() =>
    inventoryForCategory(this.category()).reduce<Record<string, number>>((counts, question) => {
      counts[question.paper] = (counts[question.paper] ?? 0) + 1;
      return counts;
    }, {}),
  );

  readonly papers = computed(() => Object.keys(this.perPaper()));

  /** Last category this component prepared; see `ngOnInit` / the effect. */
  private prepared: SectionKey | null = null;

  constructor() {
    // The component instance is reused when only the category param changes,
    // so re-prepare on a live category switch. The first run is handled by
    // ngOnInit (which also clears any state left over from a previous visit).
    effect(() => {
      const category = this.category();
      if (this.prepared === null || category === this.prepared) {
        return;
      }
      this.prepared = category;
      this.deck.reset();
      void this.deck.loadPreview(category);
    });
  }

  ngOnInit(): void {
    this.prepared = this.category();
    this.deck.reset();
    void this.deck.loadPreview(this.category());
  }

  /* ------------------------------------------------------------------ */
  /* Start panel                                                        */
  /* ------------------------------------------------------------------ */

  chooseMode(mode: DeckMode): void {
    this.chosenMode.set(mode);
  }

  start(): void {
    this.starting.set(true);
    void this.deck.start(this.category(), this.chosenMode()).finally(() => this.starting.set(false));
  }

  async retry(): Promise<void> {
    this.deck.reset();
    await this.deck.loadPreview(this.category());
  }

  /* ------------------------------------------------------------------ */
  /* Running session                                                    */
  /* ------------------------------------------------------------------ */

  onAnswered(event: AnswerEvent): void {
    void this.deck.answer(event.correct);
  }

  next(): void {
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
    this.speech.cancel();
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

  readonly progressLabel = computed(() => `本次已答 ${this.deck.tally().answered} 题`);
}
