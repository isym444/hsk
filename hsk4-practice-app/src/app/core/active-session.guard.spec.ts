import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideZoneChangeDetection } from '@angular/core';
import { QuizStateService } from './quiz-state.service';
import { routes } from '../app.routes';
import { authStubProviders } from '../testing/auth-stub';

/**
 * A page refresh drops the in-memory session, so /summary must bounce home —
 * the same effective behaviour as the original single-file app.
 */
describe('activeSessionGuard', () => {
  let router: Router;
  let quizState: QuizStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZoneChangeDetection(), provideRouter(routes), ...authStubProviders()],
    });
    router = TestBed.inject(Router);
    quizState = TestBed.inject(QuizStateService);
  });

  it('redirects /summary to / when there is no session', async () => {
    await router.navigate(['/summary', 'H41001', 'listening']);

    expect(router.url).toBe('/HSK4');
  });

  it('allows /summary when a session is in memory', async () => {
    quizState.start('H41001', 'listening');

    await router.navigate(['/summary', 'H41001', 'listening']);

    expect(router.url).toBe('/summary/H41001/listening');
  });

  it('redirects an unknown route home', async () => {
    await router.navigate(['/nope/nothing/here']);

    expect(router.url).toBe('/HSK4');
  });
});
