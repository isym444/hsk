import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SummaryComponent } from './summary.component';
import { QuizStateService } from '../core/quiz-state.service';
import { routes } from '../app.routes';
import { provideZoneChangeDetection } from '@angular/core';

/** Typed non-null lookup, so specs stay readable without `!` everywhere. */
function el<T extends HTMLElement>(root: unknown, selector: string): T {
  const found = (root as HTMLElement).querySelector<T>(selector);
  if (!found) {
    throw new Error(`expected to find ${selector}`);
  }
  return found;
}

describe('SummaryComponent', () => {
  let fixture: ComponentFixture<SummaryComponent>;
  let quizState: QuizStateService;
  let router: Router;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [SummaryComponent],
      providers: [provideZoneChangeDetection(), provideRouter(routes)],
    });
    quizState = TestBed.inject(QuizStateService);
    quizState.reset();
    router = TestBed.inject(Router);
  });

  async function render(testId: 'H41001' | 'H41002' | 'H41003', section: 'listening' | 'reading' | 'writing') {
    quizState.start(testId, section);
    fixture = TestBed.createComponent(SummaryComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function text(selector: string): string {
    return fixture.nativeElement.querySelector(selector)?.textContent?.trim() ?? '';
  }

  it('shows the score, the percentage and the completion tag', async () => {
    await render('H41001', 'reading');
    for (let i = 0; i < 40; i++) {
      quizState.recordAnswer(i < 30);
    }
    fixture.detectChanges();

    expect(text('.tag')).toBe('H41001 · 阅读 · 完成');
    expect(text('.big')).toBe('30 / 40');
    expect(text('.sub')).toBe('正确率 75%');
  });

  it('treats an unanswered section as 100%', async () => {
    await render('H41001', 'reading');

    expect(text('.big')).toBe('0 / 0');
    expect(text('.sub')).toBe('正确率 100%');
  });

  it('hides the open-question note for sections without open items', async () => {
    await render('H41001', 'listening');

    expect(fixture.nativeElement.querySelector('.summary-open')).toBeFalsy();
  });

  it('reports the open-question completion count for writing', async () => {
    await render('H41001', 'writing');
    expect(text('.summary-open')).toContain('已完成 0 / 5 题');

    quizState.recordAnswer(undefined);
    quizState.recordAnswer(undefined);
    fixture.detectChanges();

    expect(text('.summary-open')).toContain('已完成 2 / 5 题');
    expect(text('.summary-open')).toContain('不计入正确率');
  });

  it('retry restarts the same section and navigates back to the quiz', async () => {
    await render('H41001', 'writing');
    quizState.recordAnswer(undefined);
    quizState.goNext();

    el<HTMLButtonElement>(fixture.nativeElement, '.summary-actions .smallbtn').click();
    await fixture.whenStable();

    expect(router.url).toBe('/quiz/H41001/writing');
    expect(quizState.idx()).toBe(0);
    expect(quizState.openDone()).toBe(0);
  });

  it('home returns to the landing page', async () => {
    await render('H41001', 'reading');

    el<HTMLButtonElement>(fixture.nativeElement, '.summary-actions .primarybtn').click();
    await fixture.whenStable();

    expect(router.url).toBe('/');
  });

  it('tints the card and tag with the section colour', async () => {
    await render('H41002', 'writing');

    const card: HTMLElement = fixture.nativeElement.querySelector('.summary-card');
    expect(card.style.getPropertyValue('--c')).toBe('var(--write)');
    expect(fixture.nativeElement.querySelector('.tag').style.color).toBe('var(--write)');
  });
});
