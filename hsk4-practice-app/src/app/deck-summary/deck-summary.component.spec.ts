import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { categoryTotal } from '../data/question-inventory';
import { DeckSummaryComponent } from './deck-summary.component';
import { routeStub } from '../testing/route-stub';
import { sessionSummaryFixture } from '../testing/fixtures/stats';

/**
 * The end-of-session screen: the numbers for the run just finished, read back
 * from the API by session id so the page also works on a refresh.
 */
describe('DeckSummaryComponent', () => {
  let fixture: ComponentFixture<DeckSummaryComponent>;
  let navigate: jasmine.Spy;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZoneChangeDetection(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
  });

  afterEach(() => http.verify());

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

  function allFlat(selector: string): string {
    return Array.from(element().querySelectorAll(selector))
      .map((node) => node.textContent?.replace(/\s+/g, '') ?? '')
      .join('|');
  }

  /** Row text with the template's whitespace collapsed. */
  function rowText(row: HTMLTableRowElement): string {
    return (row.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function create(params: Record<string, string>): void {
    TestBed.overrideProvider(ActivatedRoute, { useValue: routeStub(params) });
    fixture = TestBed.createComponent(DeckSummaryComponent);
    http = TestBed.inject(HttpTestingController);
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture.detectChanges();
  }

  async function open(
    params: Record<string, string> = { category: 'reading', sessionId: 'session-1' },
    overrides: Record<string, unknown> = {},
  ): Promise<void> {
    create(params);
    http
      .expectOne(`/api/sessions/${params['sessionId']}`)
      .flush(sessionSummaryFixture({ id: params['sessionId'], ...overrides }));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('shows the session score and success rate', async () => {
    await open();

    expect(text('.tag')).toBe('This session · Reading · Smart review');
    expect(text('.big')).toBe('2 / 3');
    expect(text('.sub')).toContain('Success rate 67%');
  });

  it('compares the session with the category history', async () => {
    await open();

    // 2/3 this session versus 40% before it.
    expect(text('.delta')).toContain('up 27%');
    expect(text('.delta')).toContain('history 40%');
  });

  it('shows answered, timing and duration for the session', async () => {
    await open();

    const stats = flat('.statgrid');
    expect(stats).toContain('Answeredthissession3');
    expect(stats).toContain('Correct/wrong2/1');
    expect(stats).toContain('Avg.time4.0s');
    expect(stats).toContain('Sessionlength5min0s');
    expect(stats).toContain('Totalansweringtime12.0s');
  });

  it('lists every question answered in the session, in order', async () => {
    await open();

    const rows = Array.from(element().querySelectorAll<HTMLTableRowElement>('.items tbody tr'));
    expect(rows.length).toBe(3);
    expect(rowText(rows[0])).toContain('H41001');
    expect(rowText(rows[0])).toContain('Fill in the blank');
    expect(rowText(rows[0])).toContain('Correct');
    expect(rowText(rows[1])).toContain('Wrong');
    expect(rowText(rows[1])).toContain('8.0 s');
    expect(text('.footnote')).toContain('Slowest question this session');
  });

  it('shows the category totals alongside the session', async () => {
    await open();

    const stats = allFlat('.statgrid');
    expect(stats).toContain(`Questionspractised8/${categoryTotal('reading')}`);
    expect(stats).toContain('Overallsuccessrate55%');
    expect(stats).toContain('Totalanswers11');
  });

  it('explains a first-ever session with no history to compare', async () => {
    await open(
      { category: 'writing', sessionId: 'session-2' },
      {
        category: 'writing',
        mode: 'random',
        prior: { attempts: 0, success_rate: null, avg_ms: null },
      },
    );

    expect(text('.tag')).toBe('This session · Writing · Random practice');
    expect(text('.delta')).toContain('This is your first Writing practice');
  });

  it('handles an empty session without dividing by zero', async () => {
    await open(
      { category: 'reading', sessionId: 'session-3' },
      { answered: 0, correct: 0, incorrect: 0, success_rate: null, items: [] },
    );

    expect(text('.big')).toBe('0 questions');
    expect(text('.sub')).toContain('No answers were recorded this time');
  });

  it('offers to keep practising', async () => {
    await open();

    Array.from(element().querySelectorAll<HTMLButtonElement>('.summary-actions button'))
      .find((button) => button.textContent?.includes('Keep practising'))
      ?.click();

    expect(navigate).toHaveBeenCalledWith(['/deck', 'reading']);
  });

  it('links to the category stats page', async () => {
    await open();

    Array.from(element().querySelectorAll<HTMLButtonElement>('.summary-actions button'))
      .find((button) => button.textContent?.includes('View Reading stats'))
      ?.click();

    expect(navigate).toHaveBeenCalledWith(['/stats', 'reading']);
  });

  it('explains a missing session instead of failing silently', async () => {
    create({ category: 'reading', sessionId: 'gone' });
    http.expectOne('/api/sessions/gone').error(new ProgressEvent('error'), { status: 404 });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text('.errbar')).toContain('Could not find this practice session');
  });

  it('reopens a session question for review with the answer revealed', async () => {
    await open();

    const rows = Array.from(element().querySelectorAll<HTMLTableRowElement>('.items tbody tr'));
    rows[0].querySelector<HTMLButtonElement>('.linkbtn')?.click();
    fixture.detectChanges();

    const sheet = element().querySelector('.review-sheet');
    expect(sheet).toBeTruthy();
    expect(text('.review-head')).toContain('H41001 · Fill in the blank · question 46');
    expect(text('.review-head')).toContain('Correct');
    expect(text('.review-head')).toContain('Answered in 2.0 s');
    expect(sheet?.querySelector('app-fill-blank-question')).toBeTruthy();
    expect(sheet?.querySelector('.bankchip.correct')).toBeTruthy();
    expect(text('.review-card .fbline')).toContain('Correct answer');
    expect(text('.review-nav .metricnote')).toBe('1 of 3');
  });

  it('opens the review by clicking anywhere on the row', async () => {
    await open();

    element().querySelector<HTMLTableRowElement>('.items tbody tr')?.click();
    fixture.detectChanges();

    expect(element().querySelector('.review-sheet')).toBeTruthy();
  });

  it('steps through the session questions and stops at the ends', async () => {
    await open();
    element().querySelector<HTMLTableRowElement>('.items tbody tr')?.click();
    fixture.detectChanges();

    const nav = () =>
      Array.from(element().querySelectorAll<HTMLButtonElement>('.review-nav button'));
    expect(nav()[0].disabled).toBeTrue();
    expect(nav()[1].disabled).toBeFalse();

    nav()[1].click();
    fixture.detectChanges();

    expect(text('.review-head')).toContain('H41001 · Multiple choice · question 66');
    expect(text('.review-nav .metricnote')).toBe('2 of 3');

    nav()[1].click();
    fixture.detectChanges();

    expect(text('.review-nav .metricnote')).toBe('3 of 3');
    expect(nav()[1].disabled).toBeTrue();
    expect(nav()[0].disabled).toBeFalse();

    nav()[0].click();
    fixture.detectChanges();

    expect(text('.review-nav .metricnote')).toBe('2 of 3');
  });

  it('closes the review overlay with Close', async () => {
    await open();
    element().querySelector<HTMLTableRowElement>('.items tbody tr')?.click();
    fixture.detectChanges();

    Array.from(element().querySelectorAll<HTMLButtonElement>('.review-head button'))
      .find((button) => button.textContent?.includes('Close'))
      ?.click();
    fixture.detectChanges();

    expect(element().querySelector('.review-sheet')).toBeNull();
  });

  it('closes the review overlay on Escape', async () => {
    await open();
    element().querySelector<HTMLTableRowElement>('.items tbody tr')?.click();
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(element().querySelector('.review-sheet')).toBeNull();
  });

  it('explains when a reviewed question is no longer in the bank', async () => {
    await open(
      { category: 'reading', sessionId: 'session-9' },
      {
        items: [
          {
            question_key: 'H41001:reading:fill:9999',
            label: 'Removed question',
            paper: 'H41001',
            number: 9999,
            kind: 'fill',
            part: 1,
            scoreable: true,
            outcome: 'incorrect',
            elapsed_ms: 1000,
            answered_at: '2026-09-25T09:56:00.000Z',
            answered_at_local: null,
          },
        ],
      },
    );
    element().querySelector<HTMLTableRowElement>('.items tbody tr')?.click();
    fixture.detectChanges();

    expect(text('.review-sheet')).toContain('no longer in the Reading bank');
  });
});
