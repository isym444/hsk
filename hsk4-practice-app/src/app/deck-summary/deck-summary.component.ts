import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SECTION_META } from '../data/section-meta';
import { Level, SectionKey, TestId, Unit } from '../data/models';
import { isLevel } from '../data/tests.data';
import { CATEGORY_ORDER, KIND_LABELS, unitForQuestionKey } from '../data/question-inventory';
import { ReviewApiService, SessionItem, SessionSummary } from '../core/review-api.service';
import { DECK_MODE_LABELS, OUTCOME_LABELS, formatDateTime, formatDuration, formatPercent } from '../core/format';
import { QuestionRow, questionRows } from '../core/question-row';
import { TrueFalseQuestionComponent } from '../questions/true-false-question/true-false-question.component';
import { PictureChoiceQuestionComponent } from '../questions/picture-choice-question/picture-choice-question.component';
import { MultipleChoiceQuestionComponent } from '../questions/multiple-choice-question/multiple-choice-question.component';
import { FillBlankQuestionComponent } from '../questions/fill-blank-question/fill-blank-question.component';
import { SentenceOrderQuestionComponent } from '../questions/sentence-order-question/sentence-order-question.component';
import { SentenceBuildQuestionComponent } from '../questions/sentence-build-question/sentence-build-question.component';
import { OpenWritingQuestionComponent } from '../questions/open-writing-question/open-writing-question.component';

/**
 * End-of-session stats: the numbers for the practice run the learner just
 * finished, next to the same numbers for the category as a whole.
 *
 * Everything is fetched from the API by session id, so the page survives a
 * refresh and can be reopened from the stats page later.
 *
 * Each row of "Question detail for this session" reopens that question in a
 * read-only review overlay, with the correct answer revealed — the review
 * database only stores the key, so the question itself comes from the local
 * inventory (see `data/question-inventory.ts`).
 */
@Component({
  selector: 'app-deck-summary',
  standalone: true,
  imports: [
    TrueFalseQuestionComponent,
    PictureChoiceQuestionComponent,
    MultipleChoiceQuestionComponent,
    FillBlankQuestionComponent,
    SentenceOrderQuestionComponent,
    SentenceBuildQuestionComponent,
    OpenWritingQuestionComponent,
  ],
  templateUrl: './deck-summary.component.html',
  styleUrl: './deck-summary.component.css',
})
export class DeckSummaryComponent implements OnInit {
  private readonly api = inject(ReviewApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** Route param, so the back links stay inside this level's bank. */
  readonly level = computed<Level>(() => {
    const value = this.route.snapshot.paramMap.get('level') ?? '';
    return isLevel(value) ? value : 'HSK4';
  });

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

  readonly modeLabel = computed(() => {
    const mode = this.summary()?.mode;
    return (mode ? DECK_MODE_LABELS[mode] : undefined) ?? mode ?? '';
  });

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

  /** The session item currently open in the review overlay, if any. */
  readonly reviewItem = signal<SessionItem | null>(null);

  /** The renderable unit behind the open item, or null if the key is unknown. */
  readonly reviewUnit = computed<Unit | null>(() => {
    const item = this.reviewItem();
    return item ? unitForQuestionKey(item.question_key) : null;
  });

  /**
   * Changes with the reviewed question. The review card's `@for` tracks the
   * row's own token (see `core/question-row.ts`), so the question component is
   * rebuilt — with a clean state — when stepping to another item.
   */
  readonly reviewKey = computed(() => this.reviewItem()?.question_key ?? '');

  /**
   * Paper of the question under review, read from the front of its stable key
   * (`H41002:listening:tf:3`), so the review card can replay its recording.
   */
  readonly reviewPaper = computed<TestId | null>(() => {
    const paper = this.reviewItem()?.question_key.split(':')[0];
    return paper === 'H41001' || paper === 'H41002' || paper === 'H41003' ? paper : null;
  });

  /** Where the open question sits in the session, for the prev/next controls. */
  readonly reviewPosition = computed(() => {
    const item = this.reviewItem();
    return item ? this.summary()?.items.indexOf(item) ?? -1 : -1;
  });

  /**
   * The reviewed question as the review card's one-item `@for` collection. The
   * token is the item's place in the session plus its key, so stepping to
   * another question always builds a fresh question component.
   */
  readonly reviewRows = computed<QuestionRow[]>(() =>
    questionRows(`${this.reviewPosition()}:${this.reviewKey()}`, this.reviewUnit()),
  );

  /** Opens the review overlay on one question of this session. */
  openReview(item: SessionItem): void {
    this.reviewItem.set(item);
  }

  closeReview(): void {
    this.reviewItem.set(null);
  }

  /** Steps through the session's questions, stopping at either end. */
  stepReview(delta: number): void {
    const items = this.summary()?.items ?? [];
    const index = this.reviewPosition() + delta;
    if (index < 0 || index >= items.length) {
      return;
    }
    this.reviewItem.set(items[index]);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeReview();
  }

  ngOnInit(): void {
    const sessionId = this.route.snapshot.paramMap.get('sessionId') ?? '';
    this.api.session(sessionId).subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Could not find this practice session (it may have been deleted, or the backend is not running).');
      },
    });
  }

  again(): void {
    void this.router.navigate(['/', this.level(), 'deck', this.category()]);
  }

  stats(): void {
    void this.router.navigate(['/', this.level(), 'stats', this.category()]);
  }

  home(): void {
    void this.router.navigate(['/']);
  }
}
