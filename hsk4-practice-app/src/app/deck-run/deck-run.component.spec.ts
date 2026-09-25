import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { DeckRunComponent } from './deck-run.component';
import { DeckStateService } from '../core/deck-state.service';
import { SpeechService } from '../core/speech.service';
import { TrueFalseQuestionComponent } from '../questions/true-false-question/true-false-question.component';
import { routeStub } from '../testing/route-stub';
import {
  deckPreviewFixture,
  deckQuestion,
  deckResponseFixture,
  sessionSummaryFixture,
} from '../testing/fixtures/stats';

/** Lets the service's awaited promise chain reach its next HTTP call. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

/**
 * Lets pending promise chains finish and re-renders. `ComponentFixture.
 * whenStable()` is not usable here: the runner keeps a 200ms interval alive for
 * the live response timer while a question is on screen.
 */
async function settleFixture(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    await tick();
    fixture.detectChanges();
  }
}

/**
 * Drives the aggregated deck runner the way a learner does: pick a mode, start,
 * answer, press 下一题, and end the session whenever — then check that the
 * session's own summary page is where you land.
 */
describe('DeckRunComponent', () => {
  let fixture: ComponentFixture<DeckRunComponent>;
  let navigate: jasmine.Spy;
  let http: HttpTestingController;
  let deck: DeckStateService;
  let spoken: string[];

  const QUESTIONS = [
    deckQuestion({ question_key: 'H41001:listening:tf:1', kind: 'tf', number: 1 }),
    deckQuestion({ question_key: 'H41001:listening:tf:2', kind: 'tf', number: 2, reason: 'weak' }),
    deckQuestion({ question_key: 'H41001:listening:tf:3', kind: 'tf', number: 3, reason: 'due' }),
  ];

  beforeEach(() => {
    spoken = [];
    TestBed.configureTestingModule({
      providers: [
        provideZoneChangeDetection(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SpeechService,
          useValue: {
            supported: true,
            speak: (text: string) => spoken.push(text),
            cancel: () => spoken.push('__cancel__'),
          },
        },
      ],
    });
  });

  afterEach(() => {
    deck.reset();
    http.verify();
  });

  async function settle(): Promise<void> {
    await settleFixture(fixture);
  }

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** Collapsed text, for prose where the template's spaces are meaningful. */
  function text(selector: string): string {
    return element().querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  /** Angular drops whitespace-only nodes, so stat cells need whitespace stripped. */
  function flat(selector: string): string {
    return element().querySelector(selector)?.textContent?.replace(/\s+/g, '') ?? '';
  }

  /** Creates the component for a category (the route params the spec injects). */
  function create(category: string): void {
    TestBed.overrideProvider(ActivatedRoute, { useValue: routeStub({ category }) });
    fixture = TestBed.createComponent(DeckRunComponent);
    http = TestBed.inject(HttpTestingController);
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    deck = TestBed.inject(DeckStateService);
    fixture.detectChanges();
  }

  async function open(category = 'listening'): Promise<void> {
    create(category);
    http
      .expectOne(`/api/deck/${category}/preview`)
      .flush(
        deckPreviewFixture({
          category,
          total_questions: category === 'listening' ? 135 : 120,
          answered: 21,
          unseen: 114,
          weak: 2,
          due: 1,
        }),
      );
    await settle();
  }

  async function startSession(
    mode: 'smart' | 'random' = 'smart',
    category = 'listening',
  ): Promise<void> {
    const modeButton = Array.from(element().querySelectorAll<HTMLButtonElement>('.modebtn')).find(
      (candidate) => candidate.textContent?.includes(mode === 'smart' ? '智能复习' : '随机练习'),
    );
    modeButton?.click();
    fixture.detectChanges();

    element().querySelector<HTMLButtonElement>('.deckcard-actions .primarybtn')?.click();
    fixture.detectChanges();

    http.expectOne('/api/sessions').flush({
      id: 'session-1',
      category,
      mode,
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

    http
      .expectOne((request) => request.url === `/api/deck/${category}`)
      .flush(deckResponseFixture(QUESTIONS, category as 'listening', { mode }));
    await settle();
  }

  /** Answers the question on screen by emitting from the question component. */
  async function answer(correct: boolean): Promise<void> {
    const question = fixture.debugElement.query(By.directive(TrueFalseQuestionComponent))
      .componentInstance as TrueFalseQuestionComponent;
    question.answered.emit({ correct });
    fixture.detectChanges();

    http.expectOne('/api/sessions/session-1/reviews').flush({});
    await settle();
  }

  async function next(): Promise<void> {
    element().querySelector<HTMLButtonElement>('.nextrow .primarybtn')?.click();
    await settle();
  }

  async function end(selector: '.endbtn' | '.backbtn'): Promise<void> {
    element().querySelector<HTMLButtonElement>(selector)?.click();
    await tick();
  }

  it('shows the aggregated deck for the category before starting', async () => {
    await open();

    expect(text('.hero h1')).toBe('听力 · 综合练习');
    expect(text('.hero p')).toContain('H41001–H41003');
    expect(text('.hero p')).toContain('135');
    expect(text('.deckcard-head')).toContain('题库来源：H41001 · H41002 · H41003');
    expect(flat('.statgrid')).toContain('题库总量135题');
    expect(flat('.statgrid')).toContain('还没做过114题');
    expect(flat('.statgrid')).toContain('该复习了1题');
  });

  it('defaults to smart mode and can switch to random', async () => {
    await open();
    const modes = Array.from(element().querySelectorAll<HTMLButtonElement>('.modebtn'));
    expect(modes[0].classList).toContain('on');

    modes[1].click();
    fixture.detectChanges();

    expect(modes[0].classList).not.toContain('on');
    expect(modes[1].classList).toContain('on');
  });

  it('starts the chosen mode and renders the first question', async () => {
    await open();
    await startSession('random');

    expect(text('.qz-label')).toContain('听力 · 综合练习');
    expect(text('.qz-label')).toContain('本次已答 0 题');
    expect(text('.tag')).toContain('第 1 题');
    expect(element().querySelector('app-true-false-question')).toBeTruthy();
    // The next button only appears once the question has been judged.
    expect(element().querySelector('.nextrow')).toBeNull();
  });

  it('records the answer, shows the outcome and advances to the next question', async () => {
    await open();
    await startSession();
    await answer(true);

    expect(text('.qz-score')).toContain('✓1');
    expect(text('.qz-score')).toContain('✗0');
    expect(text('.nextnote')).toContain('答对');

    await next();

    expect(text('.tag')).toContain('第 2 题');
    expect(text('.qz-label')).toContain('本次已答 1 题');
    expect(element().querySelector('.nextrow')).toBeNull();
  });

  it('shows the running wrong count and average time', async () => {
    await open();
    await startSession();
    await answer(false);

    expect(text('.qz-score')).toContain('✗1');
    expect(text('.sessionline')).toContain('本次平均');
  });

  it('ends the session on 结束练习 and opens that session summary', async () => {
    await open();
    await startSession();
    await answer(true);

    await end('.endbtn');

    http
      .expectOne('/api/sessions/session-1/finish')
      .flush(sessionSummaryFixture({ category: 'listening' }));
    await settle();

    expect(navigate).toHaveBeenCalledWith(['/deck', 'listening', 'summary', 'session-1']);
  });

  it('discards a session where nothing was answered', async () => {
    await open();
    await startSession();

    await end('.endbtn');

    http.expectOne((request) => request.method === 'DELETE').flush(null);
    await settle();

    expect(navigate).toHaveBeenCalledWith(['/']);
    expect(deck.hasSession()).toBeFalse();
  });

  it('ends the session when backing out, without showing a summary', async () => {
    await open();
    await startSession();
    await answer(true);

    await end('.backbtn');

    http.expectOne('/api/sessions/session-1/finish').flush(sessionSummaryFixture());
    await settle();

    expect(spoken).toContain('__cancel__');
    expect(navigate).toHaveBeenCalledWith(['/']);
  });

  it('explains how to start the backend when the preview fails, and can retry', async () => {
    create('writing');
    http.expectOne('/api/deck/writing/preview').error(new ProgressEvent('error'));
    await settle();

    expect(text('.errbar')).toContain('uvicorn');

    element().querySelector<HTMLButtonElement>('.errbar .smallbtn')?.click();
    http.expectOne('/api/deck/writing/preview').flush(deckPreviewFixture({ category: 'writing' }));
    await settle();

    expect(element().querySelector('.errbar')).toBeNull();
    expect(text('.hero h1')).toBe('写作 · 综合练习');
  });

  it('links to the category stats page', async () => {
    await open();
    const statsButton = Array.from(element().querySelectorAll<HTMLButtonElement>('.smallbtn')).find(
      (button) => button.textContent?.includes('查看统计'),
    );
    statsButton?.click();

    expect(navigate).toHaveBeenCalledWith(['/stats', 'listening']);
  });
});
