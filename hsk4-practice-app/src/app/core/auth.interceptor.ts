/**
 * Sends the Supabase access token with every API call, and signs the user out
 * when the backend refuses it.
 *
 * Attaching the token here (rather than in `ReviewApiService`) keeps that
 * service a plain typed client, and means no call site can forget the header.
 */

import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthService } from './auth.service';
import { RuntimeConfigService } from './runtime-config.service';

/** True for requests aimed at our own API, wherever it is deployed. */
export function isApiRequest(url: string, apiBase: string): boolean {
  if (!apiBase) {
    return false;
  }
  const base = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
  return url === base || url.startsWith(`${base}/`);
}

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const config = inject(RuntimeConfigService);
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!isApiRequest(request.url, config.apiBase)) {
    return next(request);
  }

  const token = auth.accessToken;
  const authorized = token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(authorized).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
        const detail = (error.error as { detail?: unknown } | null)?.detail;
        if (error.status === 403) {
          auth.markAccessDenied(
            typeof detail === 'string' && detail
              ? detail
              : 'This account is not allowed to use this app.',
          );
        }
        // The session is no longer usable: drop it and let the guard show the
        // login page, which is where the reason gets displayed.
        void auth.signOut().then(() => router.navigate(['/login']));
      }
      return throwError(() => error);
    }),
  );
};
