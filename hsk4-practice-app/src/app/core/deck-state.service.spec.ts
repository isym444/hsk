import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DeckStateService } from './deck-state.service';
import { DeckQuestion, DeckResponse, SessionSummary } from './review-api.service';
import {
  deckPreviewFixture,
  deckQuestion,
  sessionSummaryFixture,
} from '../testing/fixtures/stats';

/** Minimal stand-in so the visibility handling can be driven from a test. */
class FakeDocument {
  visibilityState: 'visible' | 'hidden' = 'visible';
  private readonly listeners = new Map<string, Array<() => void>>();

  addEventListener(type: string, handler: () => void): void {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  hide(): void {
    this.visibilityState = 'hidden';
    this.emit('visibilitychange');
  }

  show(): void {
    this.visibilityState = 'visible';
    this.emit('visibilitychange');
  }

  private emit(type: string): void {
    (this.listeners.get(type) ?? []).forEach((handler) => handler());
  }
}

function deckResponse(questions: DeckQuestion[], category = 'reading'): DeckResponse {
  return {
    category,
    mode: 'smart',
    count: questions.length,
    total_questions: 120,
    answered_questions: 0,
    generated_at: '2026-09-25T12:00:00.000Z',
    questions,
  };
}

/** Lets the service's awaited promise chain reach its next HTTP call. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

const QUESTIONS: DeckQuestion[] = [
  deckQuestion({ question_key: 'H41001:reading:fill:46', number: 46 }),
  deckQuestion({
    question_key: 'H41001:reading:order:56',
    kind: 'order',
    number: 56,
    reason: 'weak',
  }),
  deckQuestion({ question_key: 'H41001:reading:mc:66', kind: 'mc', number: 66, reason: 'due' }),
];

describe('DeckStateService', () => {
  let service: DeckStateService;
  let http: HttpTestingController;
  let doc: FakeDocument;
  let clock: number;

  beforeEach(() => {
    doc = new FakeDocument();
    clock = 0;
    spyOn(performance, 'now').and.callFake(() => clock);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: DOCUMENT, useValue: doc },
      ],
    });
    service = TestBed.inject(DeckStateService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    service.reset();
    http.verify();
  });

  /** Runs `start()` and answers the two calls it makes. */
  async function start(questions: DeckQuestion[] = QUESTIONS): Promise<void> {
    const started = service.start('reading', 'smart');
    http.expectOne('/api/sessions').flush({
      id: 'session-1',
      category: 'reading',
      mode: 'smart',
      started_at: '2026-09-25T12:00:00.000Z',
      ended_at: null,
      answered: 0,
      correct: 0,
      incorrect: 0,
      self_assessed: 0,
      success_rate: null,
      avg_ms: null,
      total_ms: 0,
    });
    await tick();
    http.expectOne((req) => req.url === '/api/deck/reading').flush(deckResponse(questions));
    await started;
  }

  it('starts on the start panel with no session', () => {
    expect(service.phase()).toBe('idle');
    expect(service.hasSession()).toBeFalse();
    expect(service.current()).toBeNull();
  });

  it('loads the preview counts for a category', async () => {
    const loaded = service.loadPreview('reading');
    http.expectOne('/api/deck/reading/preview').flush(deckPreviewFixture());
    await loaded;

    expect(service.preview()?.unseen).toBe(114);
    expect(service.category()).toBe('reading');
  });

  it('explains how to start the backend when the preview cannot be loaded', async () => {
    const loaded = service.loadPreview('reading');
    http.expectOne('/api/deck/reading/preview').error(new ProgressEvent('error'));
    await loaded;

    expect(service.phase()).toBe('error');
    expect(service.error()).toContain('uvicorn');
  });

  it('starts a session, loads the deck and resolves the first unit', async () => {
    await start();

    expect(service.phase()).toBe('running');
    expect(service.sessionId()).toBe('session-1');
    expect(service.queue().length).toBe(3);
    expect(service.index()).toBe(0);
    expect(service.current()?.question_key).toBe('H41001:reading:fill:46');
    // The key resolves to the local unit the question component renders.
    expect(service.currentUnit()?.kind).toBe('fill');
  });

  it('changes the token when the question changes, so components are recreated', async () => {
    await start();
    const first = service.token();

    await answerAndAdvance(true);
    expect(service.token()).not.toBe(first);
  });

  it('drops queue entries the UI has no unit for', async () => {
    await start([...QUESTIONS, deckQuestion({ question_key: 'H41001:reading:fill:9999' })]);
    expect(service.queue().length).toBe(3);
  });

  async function answerAndAdvance(correct?: boolean): Promise<void> {
    const answered = service.answer(correct);
    http.expectOne('/api/sessions/session-1/reviews').flush({});
    await answered;

    const advanced = service.next();
    await tick();
    await advanced;
  }

  it('records a correct answer with its response time and updates the tally', async () => {
    await start();
    clock = 4200;

    const answered = service.answer(true);
    const review = http.expectOne('/api/sessions/session-1/reviews');
    expect(review.request.body.question_key).toBe('H41001:reading:fill:46');
    expect(review.request.body.outcome).toBe('correct');
    expect(review.request.body.elapsed_ms).toBe(4200);
    expect(review.request.body.answered_at).toMatch(/[+-]\d{2}:\d{2}$/);
    review.flush({});
    await answered;

    expect(service.answered()).toBeTrue();
    expect(service.lastOutcome()).toBe('correct');
    expect(service.tally()).toEqual({
      answered: 1,
      correct: 1,
      incorrect: 0,
      selfAssessed: 0,
      totalMs: 4200,
    });
    expect(service.averageMs()).toBe(4200);
  });

  it('records a wrong answer as incorrect', async () => {
    await start();
    clock = 1000;

    const answered = service.answer(false);
    const review = http.expectOne('/api/sessions/session-1/reviews');
    expect(review.request.body.outcome).toBe('incorrect');
    review.flush({});
    await answered;

    expect(service.tally().incorrect).toBe(1);
    expect(service.averageMs()).toBe(1000);
  });

  it('treats an undefined answer as a self-assessment that is not timed', async () => {
    await start();
    clock = 90_000;

    const answered = service.answer(undefined);
    const review = http.expectOne('/api/sessions/session-1/reviews');
    expect(review.request.body.outcome).toBe('self_assessed');
    review.flush({});
    await answered;

    expect(service.tally().selfAssessed).toBe(1);
    expect(service.tally().totalMs).toBe(0);
    expect(service.averageMs()).toBeNull();
  });

  it('ignores a second answer for the same question', async () => {
    await start();
    const answered = service.answer(true);
    http.expectOne('/api/sessions/session-1/reviews').flush({});
    await answered;

    await service.answer(false);
    http.expectNone('/api/sessions/session-1/reviews');
    expect(service.tally().answered).toBe(1);
  });

  it('advances to the next question', async () => {
    await start();
    await answerAndAdvance(true);

    expect(service.index()).toBe(1);
    expect(service.current()?.question_key).toBe('H41001:reading:order:56');
    expect(service.currentUnit()?.kind).toBe('order');
    expect(service.answered()).toBeFalse();
  });

  it('refills the queue instead of ending the session when it runs out', async () => {
    await start();

    // Answer all three; the third advance has to ask for more questions.
    for (let i = 0; i < 3; i += 1) {
      const answered = service.answer(true);
      http.expectOne('/api/sessions/session-1/reviews').flush({});
      await answered;

      const advanced = service.next();
      await tick();
      if (i < 2) {
        await advanced;
      } else {
        const refill = http.expectOne((req) => req.url === '/api/deck/reading');
        // A refill avoids repeating what was just answered.
        expect(refill.request.params.has('exclude')).toBeTrue();
        refill.flush(deckResponse([deckQuestion({ question_key: 'H41001:reading:mc:67' })]));
        await advanced;
      }
    }

    // Appended, not replaced: the queue keeps growing instead of ending the session.
    expect(service.queue().length).toBe(4);
    expect(service.index()).toBe(3);
    expect(service.current()?.question_key).toBe('H41001:reading:mc:67');
    expect(service.phase()).toBe('running');
  });

  it('falls back to the start of the queue if a refill yields nothing playable', async () => {
    await start();

    for (let i = 0; i < 3; i += 1) {
      const answered = service.answer(true);
      http.expectOne('/api/sessions/session-1/reviews').flush({});
      await answered;

      const advanced = service.next();
      await tick();
      if (i < 2) {
        await advanced;
      } else {
        http
          .expectOne((req) => req.url === '/api/deck/reading')
          .flush(deckResponse([deckQuestion({ question_key: 'H41001:reading:mc:9999' })]));
        await advanced;
      }
    }

    expect(service.index()).toBe(0);
    expect(service.current()?.question_key).toBe('H41001:reading:fill:46');
  });

  it('caps an abandoned-tab response time', async () => {
    await start();
    clock = 60 * 60 * 1000;

    const answered = service.answer(true);
    const review = http.expectOne('/api/sessions/session-1/reviews');
    expect(review.request.body.elapsed_ms).toBe(600_000);
    review.flush({});
    await answered;
  });

  it('pauses the response timer while the tab is hidden', async () => {
    await start();

    clock = 5000;
    doc.hide();
    clock = 60_000;
    doc.show();
    clock = 62_000;

    const answered = service.answer(true);
    const review = http.expectOne('/api/sessions/session-1/reviews');
    // 5s of the 62s elapsed was spent in a background tab and is not counted.
    expect(review.request.body.elapsed_ms).toBe(7000);
    review.flush({});
    await answered;
  });

  it('keeps reviews that failed to send and flushes them on the next success', async () => {
    await start();

    const first = service.answer(true);
    http.expectOne('/api/sessions/session-1/reviews').error(new ProgressEvent('error'));
    await first;
    expect(service.error()).toContain('已暂存');

    const advanced = service.next();
    await tick();
    await advanced;

    const second = service.answer(false);
    // The retry of the first review, then this answer.
    http.expectOne((req) => req.body.outcome === 'correct').flush({});
    await tick();
    http.expectOne((req) => req.body.outcome === 'incorrect').flush({});
    await second;

    expect(service.error()).toBeNull();
    expect(service.tally().answered).toBe(2);
  });

  it('finishes the session and returns the summary', async () => {
    await start();
    const finished = service.finish();
    await tick();
    http.expectOne('/api/sessions/session-1/finish').flush(sessionSummaryFixture());
    const summary = (await finished) as SessionSummary;

    expect(summary.id).toBe('session-1');
    expect(summary.answered).toBe(3);
  });

  it('discards an empty session and clears the state', async () => {
    await start();
    const discarded = service.discard();
    http.expectOne((req) => req.method === 'DELETE').flush(null);
    await discarded;

    expect(service.hasSession()).toBeFalse();
    expect(service.queue().length).toBe(0);
    expect(service.phase()).toBe('idle');
  });

  it('tolerates discarding a session the server no longer has', async () => {
    await start();
    const discarded = service.discard();
    http.expectOne((req) => req.method === 'DELETE').flush(null, { status: 404, statusText: 'gone' });
    await discarded;

    expect(service.hasSession()).toBeFalse();
  });

  it('does nothing when a deck is started without a session id', async () => {
    await service.answer(true);
    await service.finish();
    http.expectNone('/api/sessions');
  });
});
