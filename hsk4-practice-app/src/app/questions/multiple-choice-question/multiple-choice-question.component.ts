import { Component, computed, inject, input, output, signal } from '@angular/core';
import { MultipleChoiceUnit, TestId } from '../../data/models';
import { AnswerEvent } from '../answer-event';
import { AudioService } from '../../core/audio.service';
import { clipFor, clipUrl } from '../../data/audio-clips';

interface McOption {
  letter: string;
  text: string;
}

const LETTERS = ['A', 'B', 'C', 'D'];

/**
 * A–D multiple choice — mirrors the original `renderMC()`. Listening items
 * (`speak: true`) show the play button instead of the passage text and reveal
 * the transcript in the feedback block.
 */
@Component({
  selector: 'app-multiple-choice-question',
  standalone: true,
  templateUrl: './multiple-choice-question.component.html',
  styleUrl: './multiple-choice-question.component.css',
})
export class MultipleChoiceQuestionComponent {
  readonly unit = input.required<MultipleChoiceUnit>();

  /**
   * Which sample paper this question belongs to — needed to find its recording
   * under `public/audio/`. Omitted by specs and review screens.
   */
  readonly paper = input<TestId | null>(null);

  /**
   * Read-only review rendering: the correct option is highlighted, nothing can
   * be picked and nothing is emitted. Used by the session summary.
   */
  readonly review = input(false);

  readonly answered = output<AnswerEvent>();

  /** Index of the chosen option, or null while unanswered. */
  readonly choice = signal<number | null>(null);

  /** True once an answer has been committed — the shell keys the next button off this. */
  readonly hasAnswered = computed(() => this.choice() !== null);

  readonly options = computed<McOption[]>(() =>
    this.unit().options.map((text, i) => ({ letter: LETTERS[i], text })),
  );

  readonly isCorrect = computed(() => this.choice() === this.unit().answer);

  readonly solutionLetter = computed(() => LETTERS[this.unit().answer]);

  /** Public so the template can read playback state and the clip length. */
  readonly audio = inject(AudioService);

  /** The recording for this question, when one exists. */
  readonly clip = computed(() => {
    const paper = this.paper();
    return paper ? clipFor(paper, this.unit().n) : undefined;
  });

  /** True while this question's own recording is the one playing. */
  readonly isPlaying = computed(() => {
    const recording = this.clip();
    return !!recording && this.audio.activeUrl() === clipUrl(recording) && this.audio.playing();
  });

  /**
   * Play the official recording for this question. Only listening items
   * (`speak: true`) show the button, and the paper comes from the shell that
   * renders the question.
   */
  play(): void {
    const paper = this.paper();
    if (paper) {
      this.audio.playQuestion(paper, this.unit().n);
    }
  }

  pick(index: number): void {
    if (this.review() || this.choice() !== null) {
      return;
    }
    this.choice.set(index);
    this.answered.emit({ correct: index === this.unit().answer });
  }

  optionClass(index: number): string {
    if (this.review()) {
      return index === this.unit().answer ? 'optbtn correct' : 'optbtn dim';
    }
    const picked = this.choice();
    if (picked === null) {
      return 'optbtn';
    }
    if (index === this.unit().answer) {
      return 'optbtn correct';
    }
    return index === picked ? 'optbtn wrong' : 'optbtn dim';
  }
}
