/**
 * Keeps the practice pages behind a sign-in.
 *
 * The session is restored before the router starts (see `app.config.ts`), so by
 * the time a guard runs `signedIn()` is already the real answer — a signed-in
 * user reloading /stats/reading never bounces through the login page.
 */

import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  if (inject(AuthService).signedIn()) {
    return true;
  }
  return inject(Router).createUrlTree(['/login'], {
    queryParams: { redirectTo: state.url },
  });
};
