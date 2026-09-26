import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { DeckRunComponent } from './deck-run.component';
import { DeckStateService } from '../core/deck-state.service';
import { AudioService } from '../core/audio.service';
import { TrueFalseQuestionComponent } from '../questions/true-false-question/true-false-question.component';
import { categoryTotal } from '../data/question-inventory';
import { SectionKey } from '../data/models';
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
 * answer, press "Next question", and end the session whenever — then check that
 * the session's own summary page is where you land.
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

  /**
   * Two real reading questions of the same kind, back to back. Question 48's
   * answer is 禁止 (chip A); question 49's is 地点 (chip F). The pair is what
   * exposed the "the next question is already answered" bug: the runner used
   * to reuse one question component for both.
   */
  const READING_FILL = [
    deckQuestion({
      question_key: 'H41001:reading:fill:48',
      kind: 'fill',
      number: 48,
      paper: 'H41001',
      category: 'reading',
    }),
    deckQuestion({
      question_key: 'H41332:reading:fill:49',
      kind: 'fill',
      number: 49,
      paper: 'H41332',
      category: 'reading',
    }),
  ];

  /** Sentence building first (answerable by tapping tiles), then guided writing. */
  const WRITING = [
    deckQuestion({
      question_key: 'H41001:writing:build:86',
      kind: 'build',
      number: 86,
      paper: 'H41001',
      category: 'writing',
    }),
    deckQuestion({
      question_key: 'H41001:writing:open:96',
      kind: 'open',
      number: 96,
      paper: 'H41001',
      category: 'writing',
    }),
  ];

  beforeEach(() => {
    spoken = [];
    // The timer preference persists in localStorage, so every test starts from
    // the default (hidden) rather than inheriting a previous test's choice.
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideZoneChangeDetection(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AudioService,
          useValue: {
            activeUrl: () => null,
            playing: () => false,
            failed: () => false,
            playQuestion: () => {},
            stop: () => spoken.push('__stop__'),
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
          total_questions: categoryTotal(category as SectionKey),
          answered: 21,
          unseen: categoryTotal(category as SectionKey) - 21,
          weak: 2,
          due: 1,
        }),
      );
    await settle();
  }

  async function startSession(
    mode: 'smart' | 'random' = 'smart',
    category = 'listening',
    questions = QUESTIONS,
  ): Promise<void> {
    const modeButton = Array.from(element().querySelectorAll<HTMLButtonElement>('.modebtn')).find(
      (candidate) => candidate.textContent?.includes(mode === 'smart' ? 'Smart review' : 'Random practice'),
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
      .flush(deckResponseFixture(questions, category as 'listening', { mode }));
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

    expect(text('.hero h1')).toBe('Listening · Combined practice');
    expect(text('.hero p')).toContain('H41001 · H41002 · H41003 · H41332');
    expect(text('.hero p')).toContain(String(categoryTotal('listening')));
    expect(text('.deckcard-head')).toContain('Source papers: H41001 · H41002 · H41003 · H41332');
    expect(flat('.statgrid')).toContain(`Questionsinbank${categoryTotal('listening')}`);
    expect(flat('.statgrid')).toContain(`Notseenyet${categoryTotal('listening') - 21}`);
    expect(flat('.statgrid')).toContain('Dueforreview1');
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

    expect(text('.qz-label')).toContain('Listening · Combined practice');
    expect(text('.qz-label')).toContain('Answered this session: 0');
    expect(text('.tag')).toContain('question 1');
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
    expect(text('.nextnote')).toContain('Correct');

    await next();

    expect(text('.tag')).toContain('question 2');
    expect(text('.qz-label')).toContain('Answered this session: 1');
    expect(element().querySelector('.nextrow')).toBeNull();
  });

  /**
   * The runner used to force a fresh question component with
   * `@for (question of [unit]; track deck.token())`. That track expression
   * ignores the item, so Angular's diff always reported "same row, new value"
   * and the component was reused: the previous question's local state (the
   * picked chip, the sentence built, the revealed model answer) leaked into
   * the next question, which then rendered as already answered with no Next
   * button. These two tests pin the fresh-card behaviour for the two kinds
   * where questions come in long same-kind runs — reading fill-ins and
   * writing.
   */
  it('starts every reading question unanswered, even after another fill-in', async () => {
    await open('reading');
    await startSession('smart', 'reading', READING_FILL);

    const chips = () =>
      Array.from(element().querySelectorAll<HTMLButtonElement>('.bank .bankchip'));

    // Question 48: 禁止 is chip A, so picking F is wrong.
    chips()[5].click();
    fixture.detectChanges();
    http.expectOne('/api/sessions/session-1/reviews').flush({});
    await settle();
    expect(text('.nextnote')).toContain('Wrong');
    expect(chips()[0].classList).toContain('correct');
    expect(chips()[5].classList).toContain('wrong');

    await next();

    // Question 49 (地点, chip F) must be untouched: no verdict from question
    // 48, no feedback, no Next button, and every chip usable again.
    expect(text('.tag')).toContain('H41332');
    expect(text('.tag')).toContain('question 49');
    expect(element().querySelector('.feedback')).toBeNull();
    expect(element().querySelector('.nextrow')).toBeNull();
    expect(chips().some((chip) => chip.classList.contains('correct'))).toBeFalse();
    expect(chips().some((chip) => chip.classList.contains('wrong'))).toBeFalse();
    expect(chips().every((chip) => !chip.disabled)).toBeTrue();
  });

  it('keeps a writing question answerable after Next', async () => {
    await open('writing');
    await startSession('smart', 'writing', WRITING);

    const tiles = () =>
      Array.from(element().querySelectorAll<HTMLButtonElement>('.tilepool .tile'));

    // Build H41001's sentence in the right order: 她很羡慕会弹钢琴的人。
    for (const word of ['她', '很', '羡慕', '会弹钢琴的人']) {
      tiles()
        .find((tile) => tile.textContent?.trim() === word)
        ?.click();
      fixture.detectChanges();
    }
    http.expectOne('/api/sessions/session-1/reviews').flush({});
    await settle();
    expect(text('.nextnote')).toContain('Correct');

    await next();

    // Guided writing (H41001 question 96) must be a fresh, usable question:
    // its own prompt, an empty enabled draft box, and no carried-over verdict.
    expect(text('.tag')).toContain('question 96');
    expect(element().querySelector('app-open-writing-question')).toBeTruthy();
    expect(element().querySelector('.feedback')).toBeNull();
    expect(element().querySelector('.nextrow')).toBeNull();

    const draft = element().querySelector<HTMLTextAreaElement>('textarea.opentext');
    expect(draft).toBeTruthy();
    expect(draft?.disabled).toBeFalse();
    expect(draft?.value).toBe('');
    expect(element().querySelector<HTMLButtonElement>('.rowbtns .smallbtn')?.disabled).toBeFalse();
  });

  it('hides the response timer by default and can turn it on', async () => {
    await open();
    await startSession();

    expect(text('.sessionline')).not.toContain('Time on this question');
    expect(text('.timertoggle')).toBe('Show timer');

    element().querySelector<HTMLButtonElement>('.timertoggle')?.click();
    fixture.detectChanges();

    expect(text('.sessionline')).toContain('Time on this question');
    expect(text('.timertoggle')).toBe('Hide timer');

    element().querySelector<HTMLButtonElement>('.timertoggle')?.click();
    fixture.detectChanges();

    expect(text('.sessionline')).not.toContain('Time on this question');
  });

  it('keeps the wrong count while timing stays hidden after answering', async () => {
    await open();
    await startSession();
    await answer(false);

    expect(text('.qz-score')).toContain('✗1');
    expect(text('.sessionline')).not.toContain('Session average');
    expect(text('.nextnote')).toContain('Wrong');
    expect(text('.nextnote')).not.toContain('This question took');
  });

  it('shows the session average and answer time once the timer is on', async () => {
    await open();
    await startSession();

    element().querySelector<HTMLButtonElement>('.timertoggle')?.click();
    fixture.detectChanges();
    await answer(false);

    expect(text('.sessionline')).toContain('Session average');
    expect(text('.nextnote')).toContain('This question took');
  });

  it('ends the session on "End session" and opens that session summary', async () => {
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

    expect(spoken).toContain('__stop__');
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
    expect(text('.hero h1')).toBe('Writing · Combined practice');
  });

  it('links to the category stats page', async () => {
    await open();
    const statsButton = Array.from(element().querySelectorAll<HTMLButtonElement>('.smallbtn')).find(
      (button) => button.textContent?.includes('View stats'),
    );
    statsButton?.click();

    expect(navigate).toHaveBeenCalledWith(['/stats', 'listening']);
  });
});
