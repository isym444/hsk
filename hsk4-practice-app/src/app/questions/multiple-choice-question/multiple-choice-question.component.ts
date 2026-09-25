import { Component, computed, inject, input, output, signal } from '@angular/core';
import { MultipleChoiceUnit } from '../../data/models';
import { AnswerEvent } from '../answer-event';
import { SpeechService } from '../../core/speech.service';

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

  private readonly speech = inject(SpeechService);

  play(): void {
    this.speech.speak(this.unit().passage);
  }

  pick(index: number): void {
    if (this.choice() !== null) {
      return;
    }
    this.choice.set(index);
    this.answered.emit({ correct: index === this.unit().answer });
  }

  optionClass(index: number): string {
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
