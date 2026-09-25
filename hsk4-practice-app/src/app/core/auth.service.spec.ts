import { TestBed } from '@angular/core/testing';
import { SupabaseClient } from '@supabase/supabase-js';

import { AuthService } from './auth.service';
import { RuntimeConfigService } from './runtime-config.service';
import { SupabaseClientFactory } from './supabase-client';

/** The parts of `supabase.auth` this app actually touches. */
class FakeAuthApi {
  session: unknown = null;
  listener: ((event: string, session: unknown) => void) | null = null;

  signInArgs: Record<string, unknown> | null = null;
  signInResult: { data?: unknown; error?: unknown } = {};
  resetArgs: unknown[] | null = null;
  resetError: unknown = null;
  updateArgs: Record<string, unknown> | null = null;
  updateError: unknown = null;
  signOutCalls = 0;

  onAuthStateChange(callback: (event: string, session: unknown) => void) {
    this.listener = callback;
    return { data: { subscription: { unsubscribe: () => undefined } } };
  }

  async getSession() {
    return { data: { session: this.session } };
  }

  async signInWithPassword(args: Record<string, unknown>) {
    this.signInArgs = args;
    return { data: this.signInResult.data ?? { session: null }, error: this.signInResult.error ?? null };
  }

  async resetPasswordForEmail(...args: unknown[]) {
    this.resetArgs = args;
    return { error: this.resetError };
  }

  async updateUser(args: Record<string, unknown>) {
    this.updateArgs = args;
    return { error: this.updateError };
  }

  async signOut() {
    this.signOutCalls += 1;
    this.session = null;
    return { error: null };
  }

  /** Simulates Supabase reporting an auth event, e.g. opening a reset link. */
  emit(event: string, session: unknown): void {
    this.listener?.(event, session);
  }
}

const SESSION = {
  access_token: 'access-token-123',
  user: { email: 'learner@example.com' },
};

function configure(options: { configured?: boolean; session?: unknown } = {}) {
  const { configured = true, session = null } = options;
  const auth = new FakeAuthApi();
  auth.session = session;

  TestBed.configureTestingModule({
    providers: [
      {
        provide: RuntimeConfigService,
        useValue: {
          apiBase: '/api',
          supabaseUrl: configured ? 'https://test-project.supabase.co' : '',
          supabaseAnonKey: configured ? 'test-anon-key' : '',
          hasSupabase: configured,
        },
      },
      {
        provide: SupabaseClientFactory,
        useValue: { create: () => ({ auth }) as unknown as SupabaseClient },
      },
    ],
  });

  return { service: TestBed.inject(AuthService), auth };
}

describe('AuthService', () => {
  it('creates no client when the deployment has no Supabase project', async () => {
    const { service } = configure({ configured: false });

    expect(service.isConfigured).toBeFalse();
    await service.load();

    expect(service.accessToken).toBeNull();
    await expectAsync(service.signInWithPassword('a@b.com', 'secret')).toBeRejectedWithError(
      /no Supabase project/,
    );
  });

  it('restores the stored session on load', async () => {
    const { service } = configure({ session: SESSION });

    await service.load();

    expect(service.signedIn()).toBeTrue();
    expect(service.email()).toBe('learner@example.com');
    expect(service.accessToken).toBe('access-token-123');
  });

  it('is signed out when there is no stored session', async () => {
    const { service } = configure();

    await service.load();

    expect(service.signedIn()).toBeFalse();
    expect(service.email()).toBeNull();
    expect(service.accessToken).toBeNull();
  });

  it('follows later sign-in and sign-out events', async () => {
    const { service, auth } = configure();
    await service.load();

    auth.emit('SIGNED_IN', SESSION);
    expect(service.signedIn()).toBeTrue();

    auth.emit('SIGNED_OUT', null);
    expect(service.signedIn()).toBeFalse();
  });

  it('recognises a password-recovery landing', async () => {
    const { service, auth } = configure();
    await service.load();

    expect(service.inRecovery()).toBeFalse();

    auth.emit('PASSWORD_RECOVERY', SESSION);
    expect(service.inRecovery()).toBeTrue();
    expect(service.signedIn()).toBeTrue();
  });

  describe('signInWithPassword', () => {
    it('trims the address and makes the session available immediately', async () => {
      const { service, auth } = configure({ session: null });
      await service.load();
      auth.signInResult = { data: { session: SESSION } };

      await service.signInWithPassword('  learner@example.com ', 'hunter2');

      expect(auth.signInArgs).toEqual({ email: 'learner@example.com', password: 'hunter2' });
      // Set before the promise resolves, so the guard sees it when the caller
      // navigates next.
      expect(service.signedIn()).toBeTrue();
      expect(service.accessToken).toBe('access-token-123');
    });

    it('surfaces bad credentials instead of pretending to sign in', async () => {
      const { service, auth } = configure();
      await service.load();
      auth.signInResult = { error: new Error('Invalid login credentials') };

      await expectAsync(service.signInWithPassword('a@b.com', 'wrong')).toBeRejected();
      expect(service.signedIn()).toBeFalse();
    });
  });

  describe('sendPasswordReset', () => {
    it('sends the reset link to the page that asks for a new password', async () => {
      const { service, auth } = configure();
      await service.load();

      await service.sendPasswordReset('  learner@example.com  ');

      expect(auth.resetArgs?.[0]).toBe('learner@example.com');
      expect(auth.resetArgs?.[1]).toEqual({
        redirectTo: `${window.location.origin}/reset-password`,
      });
    });

    it('accepts another local path', async () => {
      const { service, auth } = configure();
      await service.load();

      await service.sendPasswordReset('learner@example.com', '/login');

      expect(auth.resetArgs?.[1]).toEqual({ redirectTo: `${window.location.origin}/login` });
    });

    it('refuses to send the link anywhere but this deployment', async () => {
      const { service, auth } = configure();
      await service.load();

      await service.sendPasswordReset('learner@example.com', 'https://evil.example.com/steal');

      expect(auth.resetArgs?.[1]).toEqual({ redirectTo: `${window.location.origin}/` });
    });

    it('surfaces a Supabase error', async () => {
      const { service, auth } = configure();
      await service.load();
      auth.resetError = new Error('Email rate limit exceeded');

      await expectAsync(service.sendPasswordReset('learner@example.com')).toBeRejected();
    });
  });

  describe('updatePassword', () => {
    it('sets the new password and leaves recovery mode', async () => {
      const { service, auth } = configure({ session: SESSION });
      await service.load();
      auth.emit('PASSWORD_RECOVERY', SESSION);

      await service.updatePassword('a-new-secret');

      expect(auth.updateArgs).toEqual({ password: 'a-new-secret' });
      expect(service.inRecovery()).toBeFalse();
      expect(service.signedIn()).toBeTrue();
    });

    it('surfaces a rejected password', async () => {
      const { service, auth } = configure({ session: SESSION });
      await service.load();
      auth.updateError = new Error('Password should be at least 8 characters');

      await expectAsync(service.updatePassword('short')).toBeRejected();
    });
  });

  it('clears the session on sign out', async () => {
    const { service, auth } = configure({ session: SESSION });
    await service.load();
    auth.emit('PASSWORD_RECOVERY', SESSION);

    await service.signOut();

    expect(auth.signOutCalls).toBe(1);
    expect(service.signedIn()).toBeFalse();
    expect(service.accessToken).toBeNull();
    expect(service.inRecovery()).toBeFalse();
  });

  it('remembers an allow-list rejection for the login page to show', () => {
    const { service } = configure();

    service.markAccessDenied('stranger@example.com is not allowed to use this app');
    expect(service.accessDenied()).toContain('not allowed');

    service.clearAccessDenied();
    expect(service.accessDenied()).toBeNull();
  });

  describe('describeError', () => {
    it('explains credentials that do not match', () => {
      const { service } = configure();
      expect(service.describeError(new Error('Invalid login credentials'))).toContain(
        'do not match',
      );
    });

    it('explains an unconfirmed account', () => {
      const { service } = configure();
      expect(service.describeError(new Error('Email not confirmed'))).toContain('Auto Confirm User');
    });

    it('quotes the required password length', () => {
      const { service } = configure();
      expect(
        service.describeError(new Error('Password should be at least 8 characters')),
      ).toContain('at least 8 characters');
    });

    it('explains reusing the current password', () => {
      const { service } = configure();
      expect(
        service.describeError(new Error('New password should be different from the old password')),
      ).toContain('already your password');
    });

    it('explains the one-email-per-minute limit', () => {
      const { service } = configure();
      expect(
        service.describeError(new Error('For security purposes, you can only request this after 60 seconds')),
      ).toContain('wait a minute');
    });

    it('explains an unusable address', () => {
      const { service } = configure();
      expect(service.describeError(new Error('Unable to validate email address: invalid format'))).toContain(
        'valid email',
      );
    });

    it('explains a network failure', () => {
      const { service } = configure();
      expect(service.describeError(new Error('Failed to fetch'))).toContain('connection');
    });

    it('falls back to the original message', () => {
      const { service } = configure();
      expect(service.describeError(new Error('something odd'))).toBe('something odd');
    });
  });
});
