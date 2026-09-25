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
  readonly answered = output<AnswerEvent>();

  /** True once 查看参考答案 has been pressed. */
  readonly revealed = signal(false);

  /** Same flag, named for the shell's next-button condition. */
  readonly hasRevealed = computed(() => this.revealed());

  private readonly draft = signal('');

  /** Same heuristic as today: did the draft literally contain the target word? */
  readonly usedTargetWord = computed(() => this.draft().includes(this.unit().word));

  readonly prompt = computed(
    () => `你的句子里用到了「${this.unit().word}」`,
  );

  readonly hint = computed(
    () => `提示：可以对照参考答案，看看怎么用「${this.unit().word}」造句`,
  );

  onInput(value: string): void {
    this.draft.set(value);
  }

  reveal(): void {
    if (this.revealed()) {
      return;
    }
    this.revealed.set(true);
    this.answered.emit({ correct: undefined });
  }
}
