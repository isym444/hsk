import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { QuizShellComponent } from './quiz-shell.component';
import { QuizStateService } from '../core/quiz-state.service';
import { AudioService } from '../core/audio.service';
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

/**
 * Walks a whole section through the shell the way a user does: pick the right
 * answer every time, press "Next question", and confirm the shell lands on
 * /summary.
 */
describe('QuizShellComponent', () => {
  let fixture: ComponentFixture<QuizShellComponent>;
  let quizState: QuizStateService;
  let router: Router;
  let spoken: string[];

  beforeEach(async () => {
    spoken = [];
    TestBed.configureTestingModule({
      imports: [QuizShellComponent],
      providers: [
        provideZoneChangeDetection(),
        provideRouter(routes),
        {
          provide: AudioService,
          useValue: {
            activeUrl: () => null,
            playing: () => false,
            failed: () => false,
            playQuestion: (paper: string, n: number) => spoken.push(`${paper}:${n}`),
            stop: () => {
              spoken.push('__stop__');
            },
          },
        },
      ],
    });

    quizState = TestBed.inject(QuizStateService);
    router = TestBed.inject(Router);
  });

  async function open(testId: 'H41001' | 'H41002' | 'H41003', section: 'listening' | 'reading' | 'writing') {
    quizState.start(testId, section);
    await router.navigate(['/quiz', testId, section]);
    fixture = TestBed.createComponent(QuizShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function text(selector: string): string {
    return fixture.nativeElement.querySelector(selector)?.textContent?.trim() ?? '';
  }

  function nextButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('.nextrow .primarybtn');
  }

  it('renders the listening chrome and first true/false item', async () => {
    await open('H41001', 'listening');

    expect(text('.qz-label')).toContain('H41001 · Listening');
    expect(text('.qz-label')).toContain('Question 1 / 45');
    expect(text('.qz-score')).toContain('✓0');
    expect(text('.qz-score')).toContain('✗0');
    expect(text('.tag')).toBe('Listening · question 1');
    expect(fixture.nativeElement.querySelector('app-true-false-question')).toBeTruthy();
    expect(nextButton()).toBeFalsy();
  });

  it('records a right answer, shows next, and advances the running score', async () => {
    await open('H41001', 'listening');

    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.tfrow .optbtn');
    buttons[0].click();
    fixture.detectChanges();

    expect(text('.qz-score')).toContain('✓1');
    expect(text('.qz-score')).toContain('✗0');
    expect(nextButton()).toBeTruthy();
    expect(nextButton().textContent?.trim()).toBe('Next question');
  });

  it('records a wrong answer against the running score', async () => {
    await open('H41001', 'listening');

    // Item 1's statement is true, so 错 is wrong.
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.tfrow .optbtn');
    buttons[1].click();
    fixture.detectChanges();

    expect(text('.qz-score')).toContain('✓0');
    expect(text('.qz-score')).toContain('✗1');
  });

  it('advances to the next unit and resets the progress bar width', async () => {
    await open('H41001', 'listening');

    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.tfrow .optbtn')[0].click();
    fixture.detectChanges();
    nextButton().click();
    fixture.detectChanges();

    expect(text('.qz-label')).toContain('Question 2 / 45');
    expect(text('.tag')).toBe('Listening · question 2');
  });

  it('plays the real recording when Play audio is pressed', async () => {
    await open('H41001', 'listening');

    el<HTMLButtonElement>(fixture.nativeElement, '.playbtn').click();

    expect(spoken).toEqual(['H41001:1']);
  });

  it('stops audio and returns home from the back button', async () => {
    await open('H41001', 'listening');

    el<HTMLButtonElement>(fixture.nativeElement, '.backbtn').click();
    await fixture.whenStable();

    expect(spoken).toContain('__stop__');
    expect(router.url).toBe('/');
  });

  it('labels the last question See results and navigates to the summary', async () => {
    await open('H41001', 'writing');
    const total = quizState.total(); // 15

    // Jump straight to the last question: this test only cares about the final
    // step of the flow, not about answering every question on the way there.
    for (let i = 0; i < total - 1; i++) {
      quizState.goNext();
    }
    fixture.detectChanges();

    expect(text('.qz-label')).toContain(`Question ${total} / ${total}`);
    expect(text('.tag')).toContain('question 100');

    el<HTMLButtonElement>(fixture.nativeElement, '.rowbtns .smallbtn').click();
    fixture.detectChanges();

    expect(nextButton()?.textContent?.trim()).toBe('See results');

    nextButton().click();
    await fixture.whenStable();

    expect(router.url).toBe('/summary/H41001/writing');
    expect(quizState.done()).toBeTrue();
  });

});
