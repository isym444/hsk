/**
 * State for one aggregated practice deck session (listening/reading/writing
 * across all three papers).
 *
 * Two behaviours are deliberate:
 *
 * 1. **No fixed length.** The queue is refilled from the API whenever it runs
 *    out, so a session ends only when the learner says so. Smart-mode refills
 *    also pick up the reviews just recorded, which is what makes the spacing
 *    adapt within a session.
 * 2. **Engaged time only.** The per-question timer pauses while the tab is
 *    hidden, so "average response time" is not inflated by a question left
 *    open in a background tab. Cross-tab time is additionally capped at
 *    `MAX_RESPONSE_MS`.
 *
 * Reviews are posted as they are answered. If the API is unreachable they are
 * kept in memory and flushed before the next successful write or at finish, so
 * a brief network blip does not silently discard practice history.
 */

import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SectionKey, Unit } from '../data/models';
import { unitForQuestionKey } from '../data/question-inventory';
import { localIsoWithOffset } from './format';
import { QuestionRow, questionRows } from './question-row';
import {
  CategoryStats,
  DeckMode,
  DeckPreview,
  DeckQuestion,
  Outcome,
  ReviewApiService,
  SessionSummary,
} from './review-api.service';

export type DeckPhase = 'idle' | 'loading' | 'running' | 'finishing' | 'error';

/** Anything longer than this is treated as "walked away", not thinking time. */
export const MAX_RESPONSE_MS = 10 * 60 * 1000;

/** How many just-answered questions a refilled queue avoids repeating. */
const REFILL_EXCLUDE_TAIL = 15;

const TICK_MS = 200;

export interface SessionTally {
  answered: number;
  correct: number;
  incorrect: number;
  selfAssessed: number;
  totalMs: number;
}

const EMPTY_TALLY: SessionTally = {
  answered: 0,
  correct: 0,
  incorrect: 0,
  selfAssessed: 0,
  totalMs: 0,
};

interface PendingReview {
  sessionId: string;
  body: { question_key: string; outcome: Outcome; elapsed_ms: number; answered_at: string };
}

@Injectable({ providedIn: 'root' })
export class DeckStateService {
  private readonly api = inject(ReviewApiService);
  private readonly doc = inject(DOCUMENT);

  readonly category = signal<SectionKey | null>(null);
  readonly mode = signal<DeckMode>('smart');
  readonly phase = signal<DeckPhase>('idle');
  readonly preview = signal<DeckPreview | null>(null);
  readonly categoryStats = signal<CategoryStats | null>(null);
  readonly queue = signal<DeckQuestion[]>([]);
  readonly index = signal(0);
  readonly sessionId = signal<string | null>(null);
  readonly answered = signal(false);
  readonly lastOutcome = signal<Outcome | null>(null);
  readonly tally = signal<SessionTally>(EMPTY_TALLY);
  readonly error = signal<string | null>(null);
  readonly elapsedMs = signal(0);

  readonly current = computed<DeckQuestion | null>(() => this.queue()[this.index()] ?? null);

  /** The unit the question components render for the current queue entry. */
  readonly currentUnit = computed<Unit | null>(() => {
    const question = this.current();
    return question ? unitForQuestionKey(question.question_key) : null;
  });

  /**
   * Identity of the queue slot on screen. Changes whenever the question
   * changes, even if the same question comes round again.
   */
  readonly token = computed(() => `${this.index()}:${this.current()?.question_key ?? ''}`);

  /**
   * The question on screen, as a one-item list for the runner's `@for`.
   *
   * `token` is carried on the item because a `@for` track expression must read
   * the item it is handed — see `core/question-row.ts` for what goes wrong when
   * it only reads component state.
   */
  readonly currentRows = computed<QuestionRow[]>(() => questionRows(this.token(), this.currentUnit()));

  readonly averageMs = computed<number | null>(() => {
    const { correct, incorrect, totalMs } = this.tally();
    const scored = correct + incorrect;
    return scored ? totalMs / scored : null;
  });

  private pending: PendingReview[] = [];

  private startedAt: number | null = null;
  private accumulated = 0;
  private running = false;
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private visibilityBound = false;

  constructor() {
    this.bindVisibility();
  }

  hasSession(): boolean {
    return this.sessionId() !== null;
  }

  /** Loads the start-panel counts (unseen / weak / due / total) for a category. */
  async loadPreview(category: SectionKey): Promise<void> {
    this.category.set(category);
    this.error.set(null);
    try {
      this.preview.set(await firstValueFrom(this.api.preview(category)));
    } catch {
      this.fail(
        `Cannot reach the review service. Start the backend first: cd backend && ./.venv/bin/uvicorn app.main:app --port 8000`,
      );
    }
  }

  /** Starts a fresh session and pulls the first queue for its mode. */
  async start(category: SectionKey, mode: DeckMode): Promise<void> {
    this.reset();
    this.category.set(category);
    this.mode.set(mode);
    this.phase.set('loading');
    try {
      const session = await firstValueFrom(this.api.startSession(category, mode));
      this.sessionId.set(session.id);
      await this.loadQueue({ fresh: true });
      this.phase.set('running');
      this.beginQuestion();
    } catch {
      this.fail('Cannot start practice: the review service is not responding. Check that the backend is running and try again.');
    }
  }

  /**
   * Records the answer for the question on screen. `correct` is undefined for
   * the self-assessed open writing items, exactly as the per-paper quiz does.
   */
  async answer(correct?: boolean): Promise<void> {
    const question = this.current();
    const sessionId = this.sessionId();
    if (!question || !sessionId || this.answered()) {
      return;
    }

    const elapsed = Math.min(this.stopTimer(), MAX_RESPONSE_MS);
    const outcome: Outcome =
      correct === undefined ? 'self_assessed' : correct ? 'correct' : 'incorrect';

    this.answered.set(true);
    this.lastOutcome.set(outcome);
    this.tally.update((tally) => ({
      answered: tally.answered + 1,
      correct: tally.correct + (outcome === 'correct' ? 1 : 0),
      incorrect: tally.incorrect + (outcome === 'incorrect' ? 1 : 0),
      selfAssessed: tally.selfAssessed + (outcome === 'self_assessed' ? 1 : 0),
      totalMs: tally.totalMs + (outcome === 'self_assessed' ? 0 : elapsed),
    }));

    await this.postReview({
      sessionId,
      body: {
        question_key: question.question_key,
        outcome,
        elapsed_ms: Math.round(elapsed),
        answered_at: localIsoWithOffset(new Date()),
      },
    });
  }

  /** Advances to the next question, refilling the queue when it runs out. */
  async next(): Promise<void> {
    this.answered.set(false);
    this.lastOutcome.set(null);
    this.index.update((index) => index + 1);

    if (this.index() >= this.queue().length) {
      await this.loadQueue({ fresh: false });
      if (this.index() >= this.queue().length) {
        // Nothing playable came back (e.g. every key was filtered out); start
        // the current queue again rather than dead-ending the session.
        this.index.set(0);
      }
    }
    this.beginQuestion();
  }

  /** Ends the session and returns its summary, or null if the call failed. */
  async finish(): Promise<SessionSummary | null> {
    const sessionId = this.sessionId();
    if (!sessionId) {
      return null;
    }
    this.stopTimer();
    this.phase.set('finishing');
    try {
      await this.flushPending();
      const summary = await firstValueFrom(this.api.finishSession(sessionId));
      this.phase.set('idle');
      return summary;
    } catch {
      this.fail('Cannot end this session: the review service is not responding.');
      return null;
    }
  }

  /** Drops a session that never got an answer, keeping the history clean. */
  async discard(): Promise<void> {
    const sessionId = this.sessionId();
    this.stopTimer();
    this.reset();
    if (!sessionId) {
      return;
    }
    try {
      await firstValueFrom(this.api.deleteSession(sessionId));
    } catch {
      // A missing session is fine — the goal was to not keep an empty one.
    }
  }

  /** Clears all session state (timers included) back to the start panel. */
  reset(): void {
    this.stopTicking();
    this.startedAt = null;
    this.accumulated = 0;
    this.running = false;
    this.pending = [];
    this.queue.set([]);
    this.index.set(0);
    this.sessionId.set(null);
    this.answered.set(false);
    this.lastOutcome.set(null);
    this.tally.set(EMPTY_TALLY);
    this.elapsedMs.set(0);
    this.error.set(null);
    this.phase.set('idle');
  }

  /* ------------------------------------------------------------------ */
  /* Queue                                                              */
  /* ------------------------------------------------------------------ */

  private async loadQueue({ fresh }: { fresh: boolean }): Promise<void> {
    const category = this.category();
    if (!category) {
      return;
    }
    const exclude = fresh ? [] : this.recentKeys();
    const deck = await firstValueFrom(
      this.api.deck(category, this.mode(), { exclude: exclude.length ? exclude : undefined }),
    );

    const playable = deck.questions.filter((question) => unitForQuestionKey(question.question_key));
    this.queue.update((queue) => (fresh ? playable : [...queue, ...playable]));
    if (fresh) {
      this.index.set(0);
    }
  }

  private recentKeys(): string[] {
    const queue = this.queue();
    const upTo = Math.min(this.index() + 1, queue.length);
    return queue
      .slice(Math.max(upTo - REFILL_EXCLUDE_TAIL, 0), upTo)
      .map((question) => question.question_key);
  }

  /* ------------------------------------------------------------------ */
  /* Review posting                                                     */
  /* ------------------------------------------------------------------ */

  private async postReview(review: PendingReview): Promise<void> {
    // Anything still queued is older, so send it first: the session summary
    // lists reviews in insertion order, and that should match answer order.
    if (this.pending.length) {
      await this.flushPending();
    }

    try {
      await firstValueFrom(this.api.recordReview(review.sessionId, review.body));
      if (!this.pending.length) {
        this.error.set(null);
      }
    } catch {
      this.pending.push(review);
      this.error.set(
        `Could not save to the database (service not responding). ${this.pending.length} answers are held and will be re-sent automatically once it is back.`,
      );
    }
  }

  private async flushPending(): Promise<void> {
    if (!this.pending.length) {
      return;
    }
    const queued = this.pending;
    this.pending = [];
    for (let index = 0; index < queued.length; index += 1) {
      try {
        await firstValueFrom(this.api.recordReview(queued[index].sessionId, queued[index].body));
      } catch {
        // Keep this review and everything after it, in order, for the next try.
        this.pending = queued.slice(index);
        return;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Response timer                                                     */
  /* ------------------------------------------------------------------ */

  private beginQuestion(): void {
    this.accumulated = 0;
    this.elapsedMs.set(0);
    this.startedAt = this.isVisible() ? this.now() : null;
    this.running = this.startedAt !== null;
    this.ensureTicking();
  }

  private pauseTimer(): void {
    if (!this.running || this.startedAt === null) {
      return;
    }
    this.accumulated += this.now() - this.startedAt;
    this.startedAt = null;
    this.running = false;
  }

  private resumeTimer(): void {
    if (this.running || this.answered() || !this.hasSession()) {
      return;
    }
    this.startedAt = this.now();
    this.running = true;
    this.ensureTicking();
  }

  private stopTimer(): number {
    this.pauseTimer();
    this.stopTicking();
    this.elapsedMs.set(this.accumulated);
    return this.accumulated;
  }

  private liveElapsed(): number {
    const running = this.running && this.startedAt !== null ? this.now() - this.startedAt : 0;
    return this.accumulated + running;
  }

  private ensureTicking(): void {
    if (this.tickHandle !== null) {
      return;
    }
    this.tickHandle = setInterval(() => this.elapsedMs.set(this.liveElapsed()), TICK_MS);
  }

  private stopTicking(): void {
    if (this.tickHandle !== null) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
  }

  private bindVisibility(): void {
    if (this.visibilityBound || !this.doc?.addEventListener) {
      return;
    }
    this.visibilityBound = true;
    this.doc.addEventListener('visibilitychange', () => {
      if (this.isVisible()) {
        this.resumeTimer();
      } else {
        this.pauseTimer();
      }
    });
  }

  private isVisible(): boolean {
    return this.doc?.visibilityState !== 'hidden';
  }

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  private fail(message: string): void {
    this.phase.set('error');
    this.error.set(message);
  }
}
