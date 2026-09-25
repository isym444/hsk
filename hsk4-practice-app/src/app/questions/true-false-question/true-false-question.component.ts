import { Component, computed, inject, input, output, signal } from '@angular/core';
import { TestId, TrueFalseUnit } from '../../data/models';
import { AnswerEvent } from '../answer-event';
import { AudioService } from '../../core/audio.service';
import { clipFor, clipUrl } from '../../data/audio-clips';

/** The two answers, in button order; index 0 = 对, index 1 = 错. */
const PARTS = [true, false] as const;
const LABELS = ['对', '错'] as const;

/** 对 / 错 listening item — mirrors the original `renderTF()`. */
@Component({
  selector: 'app-true-false-question',
  standalone: true,
  templateUrl: './true-false-question.component.html',
  styleUrl: './true-false-question.component.css',
})
export class TrueFalseQuestionComponent {
  readonly unit = input.required<TrueFalseUnit>();

  /**
   * Which sample paper this question belongs to — needed to find its recording
   * under `public/audio/`. Omitted by specs and review screens that never play
   * the clip.
   */
  readonly paper = input<TestId | null>(null);

  /**
   * Read-only review rendering: the correct answer is highlighted, the buttons
   * cannot be used and nothing is emitted. Used by the session summary.
   */
  readonly review = input(false);

  /** Emitted once, when the user commits an answer. */
  readonly answered = output<AnswerEvent>();

  readonly parts = PARTS;
  readonly labels = LABELS;

  /** Index of the picked button (0 = 对, 1 = 错), or null while unanswered. */
  readonly choice = signal<number | null>(null);

  /** True once an answer has been committed — the shell keys the next button off this. */
  readonly hasAnswered = computed(() => this.choice() !== null);

  /** True while unanswered; drives the buttons' disabled state. */
  readonly locked = computed(() => this.choice() === null);

  readonly pickedValue = computed(() => {
    const picked = this.choice();
    return picked === null ? null : PARTS[picked];
  });

  readonly isCorrect = computed(() => this.pickedValue() === this.unit().answer);

  /** The label of the button that was correct, revealed after a wrong pick. */
  readonly solutionLabel = computed(() => (this.unit().answer ? '对' : '错'));

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
   * Play the official recording for this question. The paper is passed in by
   * whichever shell renders the question; when it is absent (specs, review
   * screens) there is nothing to resolve a clip from.
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
    this.answered.emit({ correct: PARTS[index] === this.unit().answer });
  }

  /** 'correct' for the right answer, 'wrong' for a wrong pick, bare class otherwise. */
  buttonClass(index: number): string {
    if (this.review()) {
      return PARTS[index] === this.unit().answer ? 'optbtn correct' : 'optbtn dim';
    }
    const picked = this.choice();
    if (picked === null) {
      return 'optbtn';
    }
    if (PARTS[index] === this.unit().answer) {
      return 'optbtn correct';
    }
    return index === picked ? 'optbtn wrong' : 'optbtn';
  }
}
