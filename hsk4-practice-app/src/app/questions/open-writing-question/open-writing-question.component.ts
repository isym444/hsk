import { Component, computed, input, output, signal } from '@angular/core';
import { OpenUnit } from '../../data/models';
import { AnswerEvent } from '../answer-event';

/** Textarea + reveal model answer — mirrors the original `renderOpen()`. */
@Component({
  selector: 'app-open-writing-question',
  standalone: true,
  templateUrl: './open-writing-question.component.html',
  styleUrl: './open-writing-question.component.css',
})
export class OpenWritingQuestionComponent {
  readonly unit = input.required<OpenUnit>();

  /**
   * Read-only review rendering: the model answer is shown straight away and the
   * draft box is hidden. Used by the session summary.
   */
  readonly review = input(false);

  readonly answered = output<AnswerEvent>();

  /** True once "Show model answer" has been pressed. */
  readonly revealed = signal(false);

  /** Same flag, named for the shell's next-button condition. */
  readonly hasRevealed = computed(() => this.revealed());

  private readonly draft = signal('');

  /** Same heuristic as today: did the draft literally contain the target word? */
  readonly usedTargetWord = computed(() => this.draft().includes(this.unit().word));

  readonly prompt = computed(
    () => `Your sentence uses 「${this.unit().word}」`,
  );

  readonly hint = computed(
    () => `Tip: compare with the model answer to see how 「${this.unit().word}」 is used in a sentence`,
  );

  onInput(value: string): void {
    this.draft.set(value);
  }

  reveal(): void {
    if (this.review() || this.revealed()) {
      return;
    }
    this.revealed.set(true);
    this.answered.emit({ correct: undefined });
  }
}
