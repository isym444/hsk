import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
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

    expect(text('.tag')).toBe('本次练习 · 阅读 · 智能复习');
    expect(text('.big')).toBe('2 / 3');
    expect(text('.sub')).toContain('正确率 67%');
  });

  it('compares the session with the category history', async () => {
    await open();

    // 2/3 this session versus 40% before it.
    expect(text('.delta')).toContain('提高 27%');
    expect(text('.delta')).toContain('历史 40%');
  });

  it('shows answered, timing and duration for the session', async () => {
    await open();

    const stats = flat('.statgrid');
    expect(stats).toContain('本次作答3题');
    expect(stats).toContain('答对/答错2/1');
    expect(stats).toContain('平均用时4.0秒');
    expect(stats).toContain('练习时长5分0秒');
    expect(stats).toContain('总答题时间12.0秒');
  });

  it('lists every question answered in the session, in order', async () => {
    await open();

    const rows = Array.from(element().querySelectorAll<HTMLTableRowElement>('.items tbody tr'));
    expect(rows.length).toBe(3);
    expect(rowText(rows[0])).toContain('H41001');
    expect(rowText(rows[0])).toContain('选词填空');
    expect(rowText(rows[0])).toContain('答对');
    expect(rowText(rows[1])).toContain('答错');
    expect(rowText(rows[1])).toContain('8.0 秒');
    expect(text('.footnote')).toContain('本次最慢的一题');
  });

  it('shows the category totals alongside the session', async () => {
    await open();

    const stats = allFlat('.statgrid');
    expect(stats).toContain('已练题目8/120');
    expect(stats).toContain('累计正确率55%');
    expect(stats).toContain('累计作答次数11');
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

    expect(text('.tag')).toBe('本次练习 · 写作 · 随机练习');
    expect(text('.delta')).toContain('这是写作的第一次练习');
  });

  it('handles an empty session without dividing by zero', async () => {
    await open(
      { category: 'reading', sessionId: 'session-3' },
      { answered: 0, correct: 0, incorrect: 0, success_rate: null, items: [] },
    );

    expect(text('.big')).toBe('0 题');
    expect(text('.sub')).toContain('这次没有作答记录');
  });

  it('offers to keep practising', async () => {
    await open();

    Array.from(element().querySelectorAll<HTMLButtonElement>('.summary-actions button'))
      .find((button) => button.textContent?.includes('继续练习'))
      ?.click();

    expect(navigate).toHaveBeenCalledWith(['/deck', 'reading']);
  });

  it('links to the category stats page', async () => {
    await open();

    Array.from(element().querySelectorAll<HTMLButtonElement>('.summary-actions button'))
      .find((button) => button.textContent?.includes('统计'))
      ?.click();

    expect(navigate).toHaveBeenCalledWith(['/stats', 'reading']);
  });

  it('explains a missing session instead of failing silently', async () => {
    create({ category: 'reading', sessionId: 'gone' });
    http.expectOne('/api/sessions/gone').error(new ProgressEvent('error'), { status: 404 });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text('.errbar')).toContain('找不到这次练习的记录');
  });
});
