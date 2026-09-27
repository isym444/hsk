import { RouterTestingHarness } from '@angular/router/testing';
import { categoryTotalForLevel } from '../data/question-inventory';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HomeComponent } from './home.component';
import { QuizStateService } from '../core/quiz-state.service';
import { routes } from '../app.routes';
import { authStubProviders } from '../testing/auth-stub';
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
        ...authStubProviders(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();

    http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/categories?level=HSK4').flush(overviewFixture());
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

  it('lists the aggregated skill decks with their totals', () => {
    const cards = Array.from(element().querySelectorAll<HTMLElement>('.deckcard'));
    expect(cards.length).toBe(3);
    expect(cards.map((card) => card.querySelector('.name')?.textContent?.trim())).toEqual([
      'Listening',
      'Reading',
      'Writing',
    ]);
    expect(cards[0].textContent).toContain('180 questions from every HSK4 paper');
    expect(cards[1].textContent).toContain('160 questions from every HSK4 paper');
    expect(cards[2].textContent).toContain('60 questions from every HSK4 paper');
  });

  it('shows live progress from the review database on each deck card', () => {
    const reading = Array.from(element().querySelectorAll<HTMLElement>('.deckcard'))[1];
    const stats = Array.from(reading.querySelectorAll<HTMLElement>('.stat')).map((stat) =>
      stat.textContent?.replace(/\s+/g, ''),
    );
    expect(stats[0]).toContain('Answered6/160');
    expect(stats[1]).toContain('Successrate50%');
    expect(reading.querySelector<HTMLElement>('.metricnote')?.textContent).toContain('Coverage 5.0%');
  });

  it('navigates into an aggregated deck', async () => {
    Array.from(element().querySelectorAll<HTMLElement>('.deckcard'))[1]
      .querySelector<HTMLButtonElement>('.primarybtn')!
      .click();
    await fixture.whenStable();
    expect(router.url).toBe('/HSK4/deck/reading');
  });

  it('links each deck to its own stats page', async () => {
    Array.from(element().querySelectorAll<HTMLElement>('.deckcard'))[2]
      .querySelector<HTMLButtonElement>('.smallbtn')!
      .click();
    await fixture.whenStable();
    expect(router.url).toBe('/HSK4/stats/writing');
  });

  it('surfaces a clear message when the stats API is unreachable', async () => {
    const fresh = TestBed.createComponent(HomeComponent);
    fresh.detectChanges();
    http.expectOne('/api/categories?level=HSK4').error(new ProgressEvent('error'));
    await fresh.whenStable();
    fresh.detectChanges();

    expect((fresh.nativeElement as HTMLElement).querySelector('.errbar')?.textContent).toContain(
      'uvicorn',
    );
  });

  /* ---------- Per-paper practice (secondary flow) ---------- */

  it('keeps the per-paper rows behind the expander', () => {
    expect(rows().length).toBe(0);
    expandPaperList();
    expect(rows().length).toBe(4);
    expect(rows().map((r) => r.querySelector('.id')?.textContent?.trim())).toEqual([
      'H41001',
      'H41002',
      'H41003',
      'H41332',
    ]);
  });

  it('shows a section button per paper and section, with their labels and counts', () => {
    expandPaperList();
    const buttons = Array.from(element().querySelectorAll<HTMLButtonElement>('.secbtn'));
    expect(buttons.length).toBe(12);
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
    expect(footnote).toContain('official HSK 4 recordings');
  });

  it('renders the hero copy for the aggregated decks', () => {
    expect(element().querySelector('.hero h1')?.textContent?.trim()).toBe('HSK 4 · Combined question bank');
  });
});

/*
 * The two levels are separate banks, so switching must re-scope what the home
 * screen shows. This is driven through `RouterTestingHarness`, because a
 * component created with `TestBed.createComponent` sits *outside* the outlet
 * and never sees its `:level` param — which would make the test pass or fail
 * for reasons that have nothing to do with the app.
 */
describe('HomeComponent level scoping', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideZoneChangeDetection(),
        provideRouter(routes),
        ...authStubProviders(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('re-scopes the headline totals when the level changes', async () => {
    harness = await RouterTestingHarness.create('/HSK4');
    http.expectOne('/api/categories?level=HSK4').flush(overviewFixture());
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();

    const card = () =>
      (harness.fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.deckcard')[0];

    expect(card().textContent).toContain(
      `${categoryTotalForLevel('HSK4', 'listening')} questions from every HSK4 paper`,
    );

    await harness.navigateByUrl('/HSK3');
    const cmp = harness.routeDebugElement?.componentInstance as { level?: () => string } | null;
    expect(cmp?.level?.()).withContext('level after switch').toBe('HSK3');
    http.expectOne('/api/categories?level=HSK3').flush(overviewFixture());
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();

    expect(card().textContent).toContain(
      `${categoryTotalForLevel('HSK3', 'listening')} questions from every HSK3 paper`,
    );
  });

  it('gives the two levels different headline totals', () => {
    // Guards the data itself: if these were equal the test above would be
    // asserting nothing.
    expect(categoryTotalForLevel('HSK3', 'listening')).not.toBe(
      categoryTotalForLevel('HSK4', 'listening'),
    );
  });
});
