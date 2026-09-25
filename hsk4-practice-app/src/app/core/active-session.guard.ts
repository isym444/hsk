import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { QuizStateService } from './quiz-state.service';

/**
 * Blocks `/summary/...` unless a quiz session is in memory. Mirrors today's
 * behaviour, where refreshing the page loses all state and there is nothing
 * to summarize.
 */
export const activeSessionGuard: CanActivateFn = () => {
  const quizState = inject(QuizStateService);
  const router = inject(Router);

  return quizState.hasSession() ? true : router.createUrlTree(['/']);
};
