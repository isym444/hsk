import { Component, computed, inject, input, output, signal } from '@angular/core';
import { PictureChoiceUnit, TestId } from '../../data/models';
import { AnswerEvent } from '../answer-event';
import { AudioService } from '../../core/audio.service';
import { clipFor, clipUrl } from '../../data/audio-clips';
import { pictureUrl } from '../../data/pictures';

/** The option letters, in the order the paper labels them. */
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** How many pictures a paper may offer; the grid handles any count. */
const MAX_OPTIONS = LETTERS.length;

/**
 * HSK3 listening part 1: a short dialogue and six pictures, of which exactly one
 * matches. There is no text answer to read, so the options are images and the
 * learner answers by picking one.
 *
 * `options` holds the picture file names under `public/images/` and `answer`
 * indexes them, so nothing here needs to know how the pictures were extracted.
 */
@Component({
  selector: 'app-picture-choice-question',
  standalone: true,
  templateUrl: './picture-choice-question.component.html',
  styleUrl: './picture-choice-question.component.css',
})
export class PictureChoiceQuestionComponent {
  readonly unit = input.required<PictureChoiceUnit>();

  /**
   * Which sample paper this question belongs to — needed to find its recording
   * under `public/audio/`. Omitted by review screens that never play the clip.
   */
  readonly paper = input<TestId | null>(null);

  /** Read-only review rendering: the answer is revealed and nothing is emitted. */
  readonly review = input(false);

  /** Emitted once, when the learner commits an answer. */
  readonly answered = output<AnswerEvent>();

  /** Index of the picture picked, or null while unanswered. */
  readonly choice = signal<number | null>(null);

  readonly hasAnswered = computed(() => this.choice() !== null);

  readonly isCorrect = computed(() => this.choice() === this.unit().answer);

  /** The picture to reveal once answered (the right one). */
  readonly solutionLetter = computed(() => LETTERS[this.unit().answer]);

  /** Public so the template can read playback state and the clip length. */
  readonly audio = inject(AudioService);

  readonly clip = computed(() => {
    const paper = this.paper();
    return paper ? clipFor(paper, this.unit().n) : undefined;
  });

  readonly isPlaying = computed(() => {
    const recording = this.clip();
    return !!recording && this.audio.activeUrl() === clipUrl(recording) && this.audio.playing();
  });

  /**
   * The picture files, paired with their option letter. The count is whatever
   * the paper supplies (H31330 uses six for Q1-5 but only five for Q6-10), so
   * this never pads or truncates to a fixed number.
   */
  readonly options = computed(() =>
    this.unit().options.slice(0, MAX_OPTIONS).map((file, index) => ({
      file,
      letter: LETTERS[index],
      url: pictureUrl(file),
    })),
  );

  /** Number of pictures to choose between, for the prompt copy. */
  readonly optionCount = computed(() => this.options().length);

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

  /** Class for one option tile: correct/wrong feedback, dimmed when not picked. */
  optionClass(index: number): string {
    if (this.review()) {
      return index === this.unit().answer ? 'picoptbtn correct' : 'picoptbtn dim';
    }
    const picked = this.choice();
    if (picked === null) {
      return 'picoptbtn';
    }
    if (index === this.unit().answer) {
      return 'picoptbtn correct';
    }
    return index === picked ? 'picoptbtn wrong' : 'picoptbtn dim';
  }
}
