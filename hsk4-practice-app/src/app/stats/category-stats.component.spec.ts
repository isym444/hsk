import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { categoryTotalForLevel } from '../data/question-inventory';
import { CategoryStatsComponent } from './category-stats.component';
import { routeStub } from '../testing/route-stub';
import { categoryPageFixture } from '../testing/fixtures/stats';

/**
 * The per-category stats page: how many questions have been answered, the
 * success rate, the average response time, the per-question history, and the
 * filters down to the questions that still need work.
 */
describe('CategoryStatsComponent', () => {
  let fixture: ComponentFixture<CategoryStatsComponent>;
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

  function rows(selector: string): HTMLTableRowElement[] {
    return Array.from(element().querySelectorAll<HTMLTableRowElement>(`${selector} tbody tr`));
  }

  /** Row text with the template's whitespace collapsed. */
  function rowText(row: HTMLTableRowElement): string {
    return (row.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function chip(label: string): HTMLButtonElement {
    const found = Array.from(element().querySelectorAll<HTMLButtonElement>('.chip')).find((button) =>
      button.textContent?.includes(label),
    );
    if (!found) {
      throw new Error(`no filter chip labelled ${label}`);
    }
    return found;
  }

  function create(params: Record<string, string>): void {
    TestBed.overrideProvider(ActivatedRoute, { useValue: routeStub(params) });
    fixture = TestBed.createComponent(CategoryStatsComponent);
    http = TestBed.inject(HttpTestingController);
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture.detectChanges();
  }

  async function open(category = 'reading', page = categoryPageFixture()): Promise<void> {
    create({ category });
    http.expectOne((request) => request.url === `/api/stats/${category}`).flush(page);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('shows how many questions have been answered out of the category total', async () => {
    await open();

    expect(text('.hero h1')).toBe('Reading · Statistics');
    expect(text('.deckcard-head')).toContain('Reading');
    expect(flat('.deckcard .statgrid')).toContain(`Answered2/${categoryTotalForLevel('HSK4', 'reading')}`);
    expect(flat('.deckcard .statgrid')).toContain('Unanswered118');
  });

  it('shows the success rate, average response time and attempt counts', async () => {
    await open();

    const stats = flat('.deckcard .statgrid');
    expect(stats).toContain('Successrate67%');
    expect(stats).toContain('Avg.time3.0s');
    expect(stats).toContain('Answers3');
    expect(stats).toContain('Sessions1');
    expect(text('.metricnote')).toContain('Bank coverage 1.7%');
  });

  it('breaks the category down by question type', async () => {
    await open();

    const kindRows = rows('.kinds');
    expect(kindRows.length).toBe(2);
    expect(rowText(kindRows[0])).toContain('Fill in the blank');
    expect(rowText(kindRows[0])).toContain('100%');
    expect(rowText(kindRows[1])).toContain('Multiple choice');
    expect(rowText(kindRows[1])).toContain('—');
  });

  it('surfaces the questions that most need review', async () => {
    await open();

    const weakest = rows('.weakest');
    expect(weakest.length).toBe(2);
    // 0% before 50%.
    expect(rowText(weakest[0])).toContain('H41002');
    expect(rowText(weakest[0])).toContain('0%');
    expect(rowText(weakest[1])).toContain('50%');
  });

  it('lists every question in the category with its history', async () => {
    await open();

    const questionRows = rows('.questions');
    expect(questionRows.length).toBe(3);
    expect(rowText(questionRows[0])).toContain('H41001');
    expect(rowText(questionRows[0])).toContain('46');
    expect(rowText(questionRows[0])).toContain('你去买啤酒吗');
    expect(rowText(questionRows[0])).toContain('1 / 1');
    // The untouched question is rendered but marked as never answered.
    expect(questionRows[1].classList).toContain('untouched');
    expect(rowText(questionRows[1])).toContain('—');
  });

  it('filters to unanswered, weak and never-correct questions', async () => {
    await open();
    expect(rows('.questions').length).toBe(3);

    chip('Unanswered').click();
    fixture.detectChanges();
    expect(rows('.questions').length).toBe(1);
    expect(rowText(rows('.questions')[0])).toContain('★ 刷牙时');

    chip('Success rate <60%').click();
    fixture.detectChanges();
    expect(rows('.questions').length).toBe(2);

    chip('Never correct').click();
    fixture.detectChanges();
    expect(rows('.questions').length).toBe(1);
    expect(rowText(rows('.questions')[0])).toContain('H41002');

    chip('All').click();
    fixture.detectChanges();
    expect(rows('.questions').length).toBe(3);
  });

  it('shows the recent sessions for the category and links to each one', async () => {
    await open();

    const sessionRows = rows('.sessions');
    expect(sessionRows.length).toBe(1);
    expect(rowText(sessionRows[0])).toContain('Smart review');
    expect(rowText(sessionRows[0])).toContain('67%');

    sessionRows[0].querySelector<HTMLButtonElement>('.linkbtn')?.click();

    expect(navigate).toHaveBeenCalledWith(['/deck', 'reading', 'summary', 'session-1']);
  });

  it('offers to keep practising this category', async () => {
    await open();

    element().querySelector<HTMLButtonElement>('.deckcard-actions .primarybtn')?.click();

    expect(navigate).toHaveBeenCalledWith(['/deck', 'reading']);
  });

  it('explains how to start the backend when the stats call fails', async () => {
    create({ category: 'writing' });
    http
      .expectOne((request) => request.url === '/api/stats/writing')
      .error(new ProgressEvent('error'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text('.errbar')).toContain('uvicorn');
  });

  it('handles a category with no history yet', async () => {
    const base = categoryPageFixture();
    await open('listening', {
      stats: {
        ...base.stats,
        category: 'listening',
        total_questions: 135,
        answered_questions: 0,
        unanswered_questions: 135,
        attempts: 0,
        correct: 0,
        incorrect: 0,
        success_rate: null,
        avg_ms: null,
        coverage: 0,
        last_reviewed_at: null,
        session_count: 0,
      },
      by_kind: [],
      questions: [],
      recent_sessions: [],
    });

    expect(flat('.deckcard .statgrid')).toContain('Successrate—');
    expect(text('.deckcard-head')).toContain('No practice records yet');
    expect(text('.loading')).toContain('No practice records yet');
  });
});
