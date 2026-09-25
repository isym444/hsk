import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HomeComponent } from './home.component';
import { QuizStateService } from '../core/quiz-state.service';
import { routes } from '../app.routes';
import { overviewFixture } from '../testing/fixtures/stats';

describe('HomeComponent', () => {
  let fixture: ComponentFixture<HomeComponent>;
  let router: Router;
  let quizState: QuizStateService;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideZoneChangeDetection(),
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();

    http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/categories').flush(overviewFixture());
    await fixture.whenStable();
    fixture.detectChanges();

    router = TestBed.inject(Router);
    quizState = TestBed.inject(QuizStateService);
  });

  afterEach(() => {
    http.verify();
  });

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function rows(): HTMLElement[] {
    return Array.from(element().querySelectorAll<HTMLElement>('.testrow'));
  }

  function expandPaperList(): void {
    element().querySelector<HTMLButtonElement>('.papertoggle')!.click();
    fixture.detectChanges();
  }

  /* ---------- Aggregated decks (primary flow) ---------- */

  it('lists the three aggregated skill decks with their totals', () => {
    const cards = Array.from(element().querySelectorAll<HTMLElement>('.deckcard'));
    expect(cards.length).toBe(3);
    expect(cards.map((card) => card.querySelector('.name')?.textContent?.trim())).toEqual([
      'Listening',
      'Reading',
      'Writing',
    ]);
    expect(cards[0].textContent).toContain('135 questions across all three sample papers');
    expect(cards[1].textContent).toContain('120 questions across all three sample papers');
    expect(cards[2].textContent).toContain('45 questions across all three sample papers');
  });

  it('shows live progress from the review database on each deck card', () => {
    const reading = Array.from(element().querySelectorAll<HTMLElement>('.deckcard'))[1];
    const stats = Array.from(reading.querySelectorAll<HTMLElement>('.stat')).map((stat) =>
      stat.textContent?.replace(/\s+/g, ''),
    );
    expect(stats[0]).toContain('Answered6/120');
    expect(stats[1]).toContain('Successrate50%');
    expect(reading.querySelector<HTMLElement>('.metricnote')?.textContent).toContain('Coverage 5.0%');
  });

  it('navigates into an aggregated deck', async () => {
    Array.from(element().querySelectorAll<HTMLElement>('.deckcard'))[1]
      .querySelector<HTMLButtonElement>('.primarybtn')!
      .click();
    await fixture.whenStable();
    expect(router.url).toBe('/deck/reading');
  });

  it('links each deck to its own stats page', async () => {
    Array.from(element().querySelectorAll<HTMLElement>('.deckcard'))[2]
      .querySelector<HTMLButtonElement>('.smallbtn')!
      .click();
    await fixture.whenStable();
    expect(router.url).toBe('/stats/writing');
  });

  it('surfaces a clear message when the stats API is unreachable', async () => {
    const fresh = TestBed.createComponent(HomeComponent);
    fresh.detectChanges();
    http.expectOne('/api/categories').error(new ProgressEvent('error'));
    await fresh.whenStable();
    fresh.detectChanges();

    expect((fresh.nativeElement as HTMLElement).querySelector('.errbar')?.textContent).toContain(
      'uvicorn',
    );
  });

  /* ---------- Per-paper practice (secondary flow) ---------- */

  it('keeps the three per-paper rows behind the expander', () => {
    expect(rows().length).toBe(0);
    expandPaperList();
    expect(rows().length).toBe(3);
    expect(rows().map((r) => r.querySelector('.id')?.textContent?.trim())).toEqual([
      'H41001',
      'H41002',
      'H41003',
    ]);
  });

  it('shows nine section buttons with the section labels and counts', () => {
    expandPaperList();
    const buttons = Array.from(element().querySelectorAll<HTMLButtonElement>('.secbtn'));
    expect(buttons.length).toBe(9);
    expect(buttons.slice(0, 3).map((b) => b.textContent?.replace(/\s+/g, ''))).toEqual([
      'Listening45questions',
      'Reading40questions',
      'Writing15questions',
    ]);
  });

  it('tints each section button with its section colour', () => {
    expandPaperList();
    const buttons = Array.from(element().querySelectorAll<HTMLButtonElement>('.secbtn'));
    expect(buttons[0].style.getPropertyValue('--c')).toBe('var(--listen)');
    expect(buttons[1].style.getPropertyValue('--c')).toBe('var(--read)');
    expect(buttons[2].style.getPropertyValue('--c')).toBe('var(--write)');
  });

  it('starts a session and navigates into the per-paper quiz', async () => {
    expandPaperList();
    const second = rows()[1].querySelectorAll<HTMLButtonElement>('.secbtn')[1];
    second.click();
    await fixture.whenStable();

    expect(router.url).toBe('/quiz/H41002/reading');
    expect(quizState.hasSession()).toBeTrue();
    expect(quizState.testId()).toBe('H41002');
    expect(quizState.sectionKey()).toBe('reading');
    expect(quizState.total()).toBe(40);
    expect(quizState.idx()).toBe(0);
  });

  it('keeps the footnote copy', () => {
    const footnote = element().querySelector('.footnote')?.textContent ?? '';
    expect(footnote).toContain('Hanban');
    expect(footnote).toContain("browser's built-in speech synthesis");
  });

  it('renders the hero copy for the aggregated decks', () => {
    expect(element().querySelector('.hero h1')?.textContent?.trim()).toBe('HSK 4 · Combined question bank');
  });
});
