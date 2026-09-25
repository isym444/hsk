import { Component, computed, input, output, signal } from '@angular/core';
import { OrderUnit } from '../../data/models';
import { AnswerEvent } from '../answer-event';

interface OrderLine {
  letter: string;
  text: string;
}

/** All six permutations, in the grid order used by the original `renderOrder()`. */
const PERMUTATIONS = ['ABC', 'ACB', 'BAC', 'BCA', 'CAB', 'CBA'];
const LETTERS = ['A', 'B', 'C'];

/** Sentence-ordering grid — mirrors the original `renderOrder()`. */
@Component({
  selector: 'app-sentence-order-question',
  standalone: true,
  templateUrl: './sentence-order-question.component.html',
  styleUrl: './sentence-order-question.component.css',
})
export class SentenceOrderQuestionComponent {
  readonly unit = input.required<OrderUnit>();
  readonly answered = output<AnswerEvent>();

  /** Index into `permutations`, or null while unanswered. */
  readonly choice = signal<number | null>(null);

  /** True once an answer has been committed — the shell keys the next button off this. */
  readonly hasAnswered = computed(() => this.choice() !== null);

  readonly permutations = PERMUTATIONS;

  readonly lines = computed<OrderLine[]>(() =>
    this.unit().s.map((text, i) => ({ letter: LETTERS[i], text })),
  );

  readonly isCorrect = computed(() => {
    const picked = this.choice();
    return picked !== null && PERMUTATIONS[picked] === this.unit().answer;
  });

  /** "A → B → C" for the feedback line. */
  readonly solutionArrow = computed(() => this.unit().answer.split('').join(' → '));

  pick(index: number): void {
    if (this.choice() !== null) {
      return;
    }
    this.choice.set(index);
    this.answered.emit({ correct: PERMUTATIONS[index] === this.unit().answer });
  }

  permLabel(permutation: string): string {
    return permutation.split('').join(' → ');
  }

  permClass(index: number): string {
    const picked = this.choice();
    if (picked === null) {
      return 'permbtn';
    }
    if (PERMUTATIONS[index] === this.unit().answer) {
      return 'permbtn correct';
    }
    return index === picked ? 'permbtn wrong' : 'permbtn';
  }
}
