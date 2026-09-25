import { Injectable, computed, signal } from '@angular/core';
import { QuizBuilderService } from './quiz-builder.service';
import { SectionKey, TestId, Unit } from '../data/models';

/**
 * Holds the one in-flight quiz session as signals. Replaces the original
 * file's module-level `state` object; `QuizShellComponent` and
 * `SummaryComponent` both read from here instead of passing state by route.
 */
@Injectable({ providedIn: 'root' })
export class QuizStateService {
  /** Null until `start()` is called; the guard uses this to gate /summary. */
  private readonly session = signal<Session | null>(null);

  readonly testId = computed(() => this.session()?.testId ?? null);
  readonly sectionKey = computed(() => this.session()?.sectionKey ?? null);
  readonly units = computed<Unit[]>(() => this.session()?.units ?? []);
  readonly idx = computed(() => this.session()?.idx ?? 0);
  readonly correct = computed(() => this.session()?.correct ?? 0);
  readonly scoreable = computed(() => this.session()?.scoreable ?? 0);
  readonly openDone = computed(() => this.session()?.openDone ?? 0);
  readonly openTotal = computed(
    () => this.session()?.units.filter((u) => u.kind === 'open').length ?? 0,
  );
  readonly total = computed(() => this.session()?.units.length ?? 0);

  /** The question currently on screen, or null once the session is done. */
  readonly currentUnit = computed<Unit | null>(() => {
    const s = this.session();
    return s ? (s.units[s.idx] ?? null) : null;
  });

  /** True once the last question has been advanced past. */
  readonly done = computed(() => {
    const s = this.session();
    return s !== null && s.idx >= s.units.length;
  });

  constructor(private readonly builder: QuizBuilderService) {}

  hasSession(): boolean {
    return this.session() !== null;
  }

  /** Begins (or restarts) a session, exactly like the old `startSection()`. */
  start(testId: TestId, sectionKey: SectionKey): void {
    this.session.set({
      testId,
      sectionKey,
      units: this.builder.buildUnits(testId, sectionKey),
      idx: 0,
      correct: 0,
      scoreable: 0,
      openDone: 0,
    });
  }

  /**
   * Records one answer. `isCorrect` is undefined for open-ended writing items,
   * which are self-assessed and counted separately rather than scored.
   */
  recordAnswer(isCorrect?: boolean): void {
    this.session.update((s) => {
      if (!s) {
        return s;
      }
      if (isCorrect === undefined) {
        return { ...s, openDone: s.openDone + 1 };
      }
      return {
        ...s,
        scoreable: s.scoreable + 1,
        correct: s.correct + (isCorrect ? 1 : 0),
      };
    });
  }

  /** Advances to the next question, or past the end when the section is done. */
  goNext(): void {
    this.session.update((s) => (s ? { ...s, idx: s.idx + 1 } : s));
  }

  /** Clears the session (not used by the app flow, handy for tests/reset). */
  reset(): void {
    this.session.set(null);
  }
}

interface Session {
  testId: TestId;
  sectionKey: SectionKey;
  units: Unit[];
  idx: number;
  correct: number;
  scoreable: number;
  openDone: number;
}
