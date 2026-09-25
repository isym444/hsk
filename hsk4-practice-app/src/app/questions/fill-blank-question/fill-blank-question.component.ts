import { Component, computed, input, output, signal } from '@angular/core';
import { FillBlankUnit } from '../../data/models';
import { AnswerEvent } from '../answer-event';

interface BankChoice {
  letter: string;
  word: string;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** Word-bank fill in the blank — mirrors the original `renderFill()`. */
@Component({
  selector: 'app-fill-blank-question',
  standalone: true,
  templateUrl: './fill-blank-question.component.html',
  styleUrl: './fill-blank-question.component.css',
})
export class FillBlankQuestionComponent {
  readonly unit = input.required<FillBlankUnit>();

  /**
   * Read-only review rendering: the correct chip is highlighted, nothing can be
   * picked and nothing is emitted. Used by the session summary.
   */
  readonly review = input(false);

  readonly answered = output<AnswerEvent>();

  /** Index of the chosen bank chip, or null while unanswered. */
  readonly choice = signal<number | null>(null);

  /** True once an answer has been committed — the shell keys the next button off this. */
  readonly hasAnswered = computed(() => this.choice() !== null);

  readonly bankChoices = computed<BankChoice[]>(() =>
    this.unit().bank.map((word, i) => ({ letter: LETTERS[i], word })),
  );

  readonly isCorrect = computed(() => {
    const picked = this.choice();
    return picked !== null && this.unit().bank[picked] === this.unit().answer;
  });

  pick(index: number): void {
    if (this.review() || this.choice() !== null) {
      return;
    }
    this.choice.set(index);
    this.answered.emit({ correct: this.unit().bank[index] === this.unit().answer });
  }

  chipClass(index: number): string {
    if (this.review()) {
      return this.unit().bank[index] === this.unit().answer ? 'bankchip correct' : 'bankchip';
    }
    const picked = this.choice();
    if (picked === null) {
      return 'bankchip';
    }
    if (this.unit().bank[index] === this.unit().answer) {
      return 'bankchip correct';
    }
    return index === picked ? 'bankchip wrong' : 'bankchip';
  }
}
