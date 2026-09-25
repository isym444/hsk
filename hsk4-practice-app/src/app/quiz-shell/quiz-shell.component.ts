import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { SECTION_META, SectionMeta } from '../data/section-meta';
import { isSectionKey, isTestId } from '../data/tests.data';
import { SectionKey, TestId } from '../data/models';
import { AnswerEvent } from '../questions/answer-event';
import { SpeechService } from '../core/speech.service';
import { QuizStateService } from '../core/quiz-state.service';
import { TrueFalseQuestionComponent } from '../questions/true-false-question/true-false-question.component';
import { MultipleChoiceQuestionComponent } from '../questions/multiple-choice-question/multiple-choice-question.component';
import { FillBlankQuestionComponent } from '../questions/fill-blank-question/fill-blank-question.component';
import { SentenceOrderQuestionComponent } from '../questions/sentence-order-question/sentence-order-question.component';
import { SentenceBuildQuestionComponent } from '../questions/sentence-build-question/sentence-build-question.component';
import { OpenWritingQuestionComponent } from '../questions/open-writing-question/open-writing-question.component';

/**
 * The sticky quiz chrome (back / title / progress / running score) plus a
 * switch over the six question renderers. Replaces `renderQuestion()`,
 * `updateChrome()` and `goNext()` from the original file.
 */
@Component({
  selector: 'app-quiz-shell',
  standalone: true,
  imports: [
    TrueFalseQuestionComponent,
    MultipleChoiceQuestionComponent,
    FillBlankQuestionComponent,
    SentenceOrderQuestionComponent,
    SentenceBuildQuestionComponent,
    OpenWritingQuestionComponent,
  ],
  templateUrl: './quiz-shell.component.html',
  styleUrl: './quiz-shell.component.css',
})
export class QuizShellComponent {
  readonly quizState = inject(QuizStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly speech = inject(SpeechService);

  /** Set once the first (placeholder-params) effect run has been skipped. */
  private synced = false;

  /**
   * The question the user has just answered, as `${section}-${n}`. The shell
   * tracks this itself rather than reading `hasAnswered` off the child, because
   * the child reference inside the keyed @for is not reliable.
   */
  private readonly answeredQuestion = signal<string | null>(null);

  /** Route params, tracked live so re-entering the same route works. */
  private readonly params = toSignal(
    this.route.paramMap.pipe(
      map((p) => {
        const testId = p.get('testId') ?? '';
        const section = p.get('section') ?? '';
        return {
          testId: (isTestId(testId) ? testId : 'H41001') as TestId,
          sectionKey: (isSectionKey(section) ? section : 'listening') as SectionKey,
        };
      }),
    ),
    { initialValue: { testId: 'H41001' as TestId, sectionKey: 'listening' as SectionKey } },
  );

  readonly sectionKey = computed<SectionKey>(
    () => this.quizState.sectionKey() ?? this.params().sectionKey,
  );

  readonly meta = computed<SectionMeta>(() => SECTION_META[this.sectionKey()]);

  readonly title = computed(
    () => `${this.quizState.testId() ?? this.params().testId} · ${this.meta().label}`,
  );

  readonly progressLabel = () =>
    `Question ${this.quizState.idx() + 1} / ${this.quizState.total()}`;

  readonly progressWidth = () => {
    const total = this.quizState.total();
    return total ? `${Math.round((this.quizState.idx() / total) * 100)}%` : '0%';
  };

  readonly wrongCount = () => this.quizState.scoreable() - this.quizState.correct();

  readonly nextLabel = () =>
    this.quizState.idx() < this.quizState.total() - 1 ? 'Next question' : 'See results';

  constructor() {
    // Keep the session in sync with the URL. This covers /summary's "Try again"
    // and section-to-section navigation, where the shell is reused and the
    // state service still holds the previous section's session.
    //
    // The first run sees `params`'s placeholder value (the real paramMap has
    // not arrived yet) and must not touch the session the home screen just
    // started, so it only arms the sync.
    effect(() => {
      const { testId, sectionKey } = this.params();
      if (!this.synced) {
        this.synced = true;
        return;
      }
      if (this.quizState.testId() !== testId || this.quizState.sectionKey() !== sectionKey) {
        this.quizState.start(testId, sectionKey);
      }
    });
  }

  back(): void {
    this.speech.cancel();
    void this.router.navigate(['/']);
  }

  /** Called by a question component once it has judged the user's answer. */
  onAnswered(event: AnswerEvent): void {
    this.answeredQuestion.set(this.questionKey());
    this.quizState.recordAnswer(event.correct);
  }

  /** True once the question on screen has been answered. */
  readonly hasAnswered = computed(() => this.answeredQuestion() === this.questionKey());

  /** Identity of the question on screen: section + question number. */
  private questionKey(): string {
    const unit = this.quizState.currentUnit();
    return unit ? `${this.sectionKey()}-${unit.n}` : '';
  }

  next(): void {
    this.answeredQuestion.set(null);
    if (this.quizState.idx() < this.quizState.total() - 1) {
      this.quizState.goNext();
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    } else {
      this.quizState.goNext();
      void this.router.navigate(['/summary', this.quizState.testId(), this.quizState.sectionKey()]);
    }
  }
}
