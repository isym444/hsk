/**
 * Sign-in state, backed by Supabase Auth (email + password).
 *
 * Accounts are created in the Supabase dashboard rather than in the app, so
 * there is no sign-up here: `signInWithPassword` exchanges credentials for a
 * session, `sendPasswordReset` emails a recovery link, and `updatePassword`
 * sets a new password once that link has been opened.
 *
 * supabase-js keeps the session fresh in the background (`autoRefreshToken`)
 * and picks the tokens out of the URL when a recovery link lands
 * (`detectSessionInUrl`). The access token is attached to every API call by
 * `auth.interceptor.ts`, and the backend verifies its signature against the
 * project's public keys.
 */

import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';

import { RuntimeConfigService } from './runtime-config.service';
import { SupabaseClientFactory } from './supabase-client';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly config = inject(RuntimeConfigService);
  private readonly clients = inject(SupabaseClientFactory);

  private client: SupabaseClient | null = null;

  private readonly session = signal<Pick<Session, 'access_token' | 'user'> | null>(null);
  private readonly denied = signal<string | null>(null);
  private readonly recovery = signal(false);

  /** The current session's access token, or null when signed out. */
  get accessToken(): string | null {
    return this.session()?.access_token ?? null;
  }

  /** True once the deployment has a Supabase project attached. */
  get isConfigured(): boolean {
    return this.config.hasSupabase;
  }

  /**
   * True when this build runs against a local API with the development bypass
   * switched on (see `RuntimeConfigService.devNoAuth`). The API only honours
   * the bypass when it has no Supabase project of its own, so this is a local
   * development convenience rather than a way in.
   */
  readonly devNoAuth = computed(() => this.config.devNoAuth);

  /** True when Supabase refused this account (the backend's allow-list). */
  readonly accessDenied = this.denied.asReadonly();

  readonly signedIn = computed(() => this.devNoAuth() || this.session() !== null);
  readonly email = computed(() =>
    this.session()?.user?.email ?? (this.devNoAuth() ? 'local development' : null),
  );

  /**
   * True when the current session came from a password-recovery link, i.e. the
   * visitor is here to choose a new password. The recovery link signs you in,
   * so this is what distinguishes "reset your password" from "you are already
   * signed in".
   */
  readonly inRecovery = this.recovery.asReadonly();

  /**
   * Creates the client if the deployment is configured, restores any stored
   * session, and starts following sign-in/sign-out. Safe to call when no
   * Supabase project is configured — everything just stays signed out.
   */
  async load(): Promise<void> {
    if (this.client || !this.config.hasSupabase) {
      return;
    }

    const client = this.clients.create(this.config.supabaseUrl, this.config.supabaseAnonKey);

    // Fires on sign-in, token refresh, sign-out and the recovery link, so the
    // whole app can react to one source of truth.
    client.auth.onAuthStateChange((event: AuthChangeEvent, session) => {
      this.session.set(session ? { access_token: session.access_token, user: session.user } : null);
      if (event === 'PASSWORD_RECOVERY') {
        this.recovery.set(true);
      } else if (event === 'SIGNED_OUT') {
        this.recovery.set(false);
      }
    });

    const { data } = await client.auth.getSession();
    this.session.set(
      data.session ? { access_token: data.session.access_token, user: data.session.user } : null,
    );

    this.client = client;
  }

  /** Exchanges an email and password for a session. */
  async signInWithPassword(email: string, password: string): Promise<void> {
    const client = this.requireClient();
    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      throw error;
    }
    // Set the session here rather than waiting for the auth event, so the
    // guard already sees a signed-in user when the caller navigates next.
    if (data.session) {
      this.session.set({
        access_token: data.session.access_token,
        user: data.session.user,
      });
    }
  }

  /**
   * Emails a password-recovery link.
   *
   * `redirectTo` is where the link lands — the page that asks for a new
   * password. It has to be on Supabase's redirect allow-list; if it is not,
   * Supabase quietly substitutes the project's Site URL, so a mistake here
   * costs a redirect, not a broken reset.
   */
  async sendPasswordReset(email: string, redirectTo = '/reset-password'): Promise<void> {
    const client = this.requireClient();
    const target = new URL(
      redirectTo.startsWith('/') ? redirectTo : '/',
      window.location.origin,
    ).toString();

    const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: target });
    if (error) {
      throw error;
    }
  }

  /** Sets a new password for the signed-in (recovery) session. */
  async updatePassword(password: string): Promise<void> {
    const client = this.requireClient();
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      throw error;
    }
    this.recovery.set(false);
  }

  async signOut(): Promise<void> {
    try {
      await this.client?.auth.signOut();
    } finally {
      this.session.set(null);
      this.recovery.set(false);
    }
  }

  /** Records that the backend refused this account, for the login page to show. */
  markAccessDenied(detail: string): void {
    this.denied.set(detail);
  }

  clearAccessDenied(): void {
    this.denied.set(null);
  }

  /** Turns a Supabase error into something worth showing a person. */
  describeError(failure: unknown): string {
    const message = failure instanceof Error ? failure.message : String(failure ?? '');
    if (/invalid login credentials|invalid grant/i.test(message)) {
      return 'That email and password do not match.';
    }
    if (/email not confirmed/i.test(message)) {
      return 'This account has not been confirmed yet. Re-create it in the Supabase dashboard with "Auto Confirm User" ticked, or confirm it by email.';
    }
    if (/password should be at least (\d+)/i.test(message)) {
      const minimum = /password should be at least (\d+)/i.exec(message)?.[1] ?? '6';
      return `Passwords must be at least ${minimum} characters long.`;
    }
    if (/should be different|same password|new password should be different/i.test(message)) {
      return 'That is already your password — choose a different one.';
    }
    if (/rate limit|too many|only request|security purposes|60 seconds/i.test(message)) {
      return 'Please wait a minute before asking for another email.';
    }
    if (/unable to validate email|invalid email|email address is invalid/i.test(message)) {
      return 'That does not look like a valid email address.';
    }
    if (/failed to fetch|networkerror|load failed/i.test(message)) {
      return 'Could not reach Supabase. Check your connection and try again.';
    }
    return message || 'Something went wrong. Please try again.';
  }

  private requireClient(): SupabaseClient {
    if (!this.client) {
      throw new Error('This deployment has no Supabase project configured.');
    }
    return this.client;
  }
}
