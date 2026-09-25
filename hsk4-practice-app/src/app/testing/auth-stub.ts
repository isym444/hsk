/**
 * A signed-in stand-in for `AuthService`.
 *
 * Specs that drive the real router (`provideRouter(routes)`) hit `authGuard`,
 * which is exactly what the app does — but those specs are about decks, quizzes
 * and statistics, not about signing in. This keeps them focused.
 */

import { Provider } from '@angular/core';

import { AuthService } from '../core/auth.service';

export interface AuthStubOptions {
  signedIn?: boolean;
  email?: string | null;
  accessToken?: string | null;
  isConfigured?: boolean;
  inRecovery?: boolean;
}

export function authStub(options: AuthStubOptions = {}): Record<string, unknown> {
  const {
    signedIn = true,
    email = 'learner@example.com',
    accessToken = 'test-access-token',
    isConfigured = true,
    inRecovery = false,
  } = options;

  return {
    signedIn: () => signedIn,
    email: () => email,
    accessToken,
    isConfigured,
    inRecovery: () => inRecovery,
    accessDenied: () => null,
    signOut: async () => undefined,
    markAccessDenied: () => undefined,
    clearAccessDenied: () => undefined,
    describeError: (failure: unknown) => String(failure),
    signInWithPassword: async () => undefined,
    sendPasswordReset: async () => undefined,
    updatePassword: async () => undefined,
    load: async () => undefined,
  };
}

/** `providers` entry for a spec that needs a signed-in user. */
export function authStubProviders(options: AuthStubOptions = {}): Provider[] {
  return [{ provide: AuthService, useValue: authStub(options) }];
}
