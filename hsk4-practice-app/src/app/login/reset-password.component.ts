import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../core/auth.service';

/** Supabase's default minimum; the dashboard's own policy may be stricter. */
const MINIMUM_PASSWORD_LENGTH = 6;

/**
 * Where a password-recovery link lands: choose a new password.
 *
 * The link signs the visitor in (a recovery session), so a session existing is
 * what makes this page usable. Without one — an expired link, or someone
 * typing the URL — there is nothing to reset, and the page says so rather than
 * showing a form that cannot work.
 */
@Component({
  selector: 'app-reset-password',
  standalone: true,
  templateUrl: './reset-password.component.html',
  styleUrl: './auth-form.css',
})
export class ResetPasswordComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly isConfigured = this.auth.isConfigured;
  readonly hasSession = this.auth.signedIn;
  readonly email = this.auth.email;
  readonly minimum = MINIMUM_PASSWORD_LENGTH;

  readonly password = signal('');
  readonly confirmation = signal('');
  readonly busy = signal(false);
  readonly done = signal(false);
  readonly error = signal<string | null>(null);

  readonly tooShort = computed(
    () => this.password().length > 0 && this.password().length < MINIMUM_PASSWORD_LENGTH,
  );
  readonly mismatch = computed(
    () => this.confirmation().length > 0 && this.password() !== this.confirmation(),
  );
  readonly canSubmit = computed(
    () =>
      !this.busy() &&
      this.password().length >= MINIMUM_PASSWORD_LENGTH &&
      this.password() === this.confirmation(),
  );

  onPasswordInput(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
  }

  onConfirmationInput(event: Event): void {
    this.confirmation.set((event.target as HTMLInputElement).value);
  }

  async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canSubmit()) {
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.updatePassword(this.password());
      this.done.set(true);
    } catch (failure) {
      this.error.set(this.auth.describeError(failure));
    } finally {
      this.busy.set(false);
    }
  }

  goToSignIn(): void {
    void this.router.navigateByUrl('/login');
  }

  goToApp(): void {
    void this.router.navigateByUrl('/');
  }
}
