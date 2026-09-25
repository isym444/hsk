import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../core/auth.service';

/** Which credential the form is asking for. */
export type LoginMode = 'signin' | 'reset';

/**
 * Sign in with an email and password.
 *
 * Accounts are created in the Supabase dashboard, so there is no sign-up here.
 * The only other thing this page does is hand off to Supabase's email-based
 * password reset, which is why the form can drop to email-only.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.component.html',
  styleUrl: './auth-form.css',
})
export class LoginComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly isConfigured = this.auth.isConfigured;

  readonly email = signal('');
  readonly password = signal('');
  readonly mode = signal<LoginMode>('signin');
  readonly busy = signal(false);
  /** True once a reset email has been sent. */
  readonly sent = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    if (this.auth.signedIn()) {
      void this.router.navigateByUrl(this.redirectTo);
      return;
    }

    // Arriving here because the backend refused the account is the one case
    // worth explaining rather than silently showing an empty form.
    const denied = this.auth.accessDenied();
    if (denied) {
      this.error.set(denied);
      this.auth.clearAccessDenied();
    }
  }

  private get redirectTo(): string {
    return this.route.snapshot.queryParamMap.get('redirectTo') || '/';
  }

  get canSubmit(): boolean {
    if (!this.email().trim() || this.busy()) {
      return false;
    }
    return this.mode() === 'reset' || this.password().length > 0;
  }

  onEmailInput(event: Event): void {
    this.email.set((event.target as HTMLInputElement).value);
  }

  onPasswordInput(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
  }

  async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canSubmit) {
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    try {
      if (this.mode() === 'reset') {
        await this.auth.sendPasswordReset(this.email());
        this.sent.set(true);
      } else {
        await this.auth.signInWithPassword(this.email(), this.password());
        await this.router.navigateByUrl(this.redirectTo);
      }
    } catch (failure) {
      this.error.set(this.auth.describeError(failure));
    } finally {
      this.busy.set(false);
    }
  }

  /** "Forgot password?" — keep the address, drop the password field. */
  askForReset(): void {
    this.mode.set('reset');
    this.password.set('');
    this.error.set(null);
  }

  backToSignIn(): void {
    this.mode.set('signin');
    this.sent.set(false);
    this.error.set(null);
  }
}
