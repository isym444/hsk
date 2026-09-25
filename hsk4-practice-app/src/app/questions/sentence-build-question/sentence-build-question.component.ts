import { Component, computed, input, output, signal } from '@angular/core';
import { BuildUnit } from '../../data/models';
import { AnswerEvent } from '../answer-event';

/** One tile in the scrambled word pool, with its fixed position in the pool. */
interface Tile {
  word: string;
  pos: number;
}

/**
 * Word tiles → answer strip, with undo. Mirrors the original `renderBuild()`,
 * including the "recompute disabled tiles from chosen counts" undo behaviour.
 */
@Component({
  selector: 'app-sentence-build-question',
  standalone: true,
  templateUrl: './sentence-build-question.component.html',
  styleUrl: './sentence-build-question.component.css',
})
export class SentenceBuildQuestionComponent {
  readonly unit = input.required<BuildUnit>();
  readonly answered = output<AnswerEvent>();

  /** Question number the cached pool belongs to. */
  private seededUnit = -1;

  /** Words placed into the answer strip, in click order. */
  readonly chosen = signal<string[]>([]);

  /** Pool positions currently placed in the strip. */
  readonly used = signal<readonly number[]>([]);

  /** True once the sentence has been judged; blocks further picking and undo. */
  readonly finished = signal(false);

  /** Alias used by the shell to decide when to show the next button. */
  readonly hasAnswered = computed(() => this.finished());

  readonly isCorrect = signal(false);

  readonly referenceAnswer = computed(() => this.unit().orders[0].join('') + '。');

  /** A pool tile is disabled exactly while it sits in the strip. */
  readonly disabledTiles = computed(() => new Set(this.used()));

  /**
   * The scrambled word pool, cached so tiles keep their position while the
   * user works. Seeded lazily on first read, because required inputs are not
   * available in the constructor.
   */
  private pool: readonly Tile[] = [];

  /** The scrambled pool as a plain array for the template. */
  get tiles(): readonly Tile[] {
    if (this.pool.length === 0) {
      this.pool = scramble(this.unit());
      this.seededUnit = this.unit().n;
    }
    return this.pool;
  }

  pick(tile: Tile): void {
    if (this.finished() || this.disabledTiles().has(tile.pos)) {
      return;
    }
    this.used.update((used) => [...used, tile.pos]);
    this.chosen.update((chosen) => [...chosen, tile.word]);
    if (this.chosen().length === this.unit().words.length) {
      this.check();
    }
  }

  /**
   * Removes the last placed word and recomputes which pool tiles should be
   * disabled from the counts of what remains chosen — the same walk the
   * original undo handler performed.
   */
  undo(): void {
    const chosen = this.chosen();
    if (this.finished() || chosen.length === 0) {
      return;
    }
    const remaining = chosen.slice(0, -1);
    this.chosen.set(remaining);
    this.used.set(positionsFor(this.tiles, remaining));
  }

  private check(): void {
    const chosen = this.chosen();
    const correct = this.unit().orders.some(
      (order) => order.length === chosen.length && order.every((w, i) => w === chosen[i]),
    );
    this.isCorrect.set(correct);
    this.finished.set(true);
    this.answered.emit({ correct });
  }
}

/**
 * Walks the pool in order, claiming one tile per occurrence of each word in
 * `chosen`, so duplicate words re-enable the right number of tiles.
 */
function positionsFor(tiles: readonly Tile[], chosen: readonly string[]): number[] {
  const counts = new Map<string, number>();
  chosen.forEach((w) => counts.set(w, (counts.get(w) ?? 0) + 1));

  const claimed: number[] = [];
  const used = new Map<string, number>();
  tiles.forEach((tile) => {
    const seen = used.get(tile.word) ?? 0;
    if (seen < (counts.get(tile.word) ?? 0)) {
      claimed.push(tile.pos);
      used.set(tile.word, seen + 1);
    }
  });
  return claimed;
}

/** Fisher–Yates, same as the original file's `shuffle()`. */
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Builds a freshly scrambled pool for one question. */
function scramble(unit: BuildUnit): Tile[] {
  return shuffle(unit.words.map((word, pos) => ({ word, pos })));
}
