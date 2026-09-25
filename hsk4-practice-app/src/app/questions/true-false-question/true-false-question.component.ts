import { Component, computed, inject, input, output, signal } from '@angular/core';
import { TrueFalseUnit } from '../../data/models';
import { AnswerEvent } from '../answer-event';
import { SpeechService } from '../../core/speech.service';

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

  private readonly speech = inject(SpeechService);

  play(): void {
    this.speech.speak(this.unit().audio);
  }

  pick(index: number): void {
    if (this.choice() !== null) {
      return;
    }
    this.choice.set(index);
    this.answered.emit({ correct: PARTS[index] === this.unit().answer });
  }

  /** 'correct' for the right answer, 'wrong' for a wrong pick, bare class otherwise. */
  buttonClass(index: number): string {
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
