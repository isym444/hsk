import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { AuthService } from '../core/auth.service';
import { authStub } from '../testing/auth-stub';
import { ResetPasswordComponent } from './reset-password.component';

describe('ResetPasswordComponent', () => {
  let fixture: ComponentFixture<ResetPasswordComponent>;
  let auth: Record<string, unknown>;
  let navigateByUrl: jasmine.Spy;

  function configure(
    options: { isConfigured?: boolean; hasSession?: boolean; updateError?: Error } = {},
  ): void {
    const { isConfigured = true, hasSession = true, updateError } = options;

    const updatePassword = jasmine
      .createSpy('updatePassword')
      .and.callFake(() => (updateError ? Promise.reject(updateError) : Promise.resolve()));

    auth = {
      ...authStub({ signedIn: hasSession, isConfigured }),
      updatePassword,
    };
    navigateByUrl = jasmine.createSpy('navigateByUrl').and.returnValue(Promise.resolve(true));

    TestBed.configureTestingModule({
      imports: [ResetPasswordComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: { navigateByUrl } },
      ],
    });

    fixture = TestBed.createComponent(ResetPasswordComponent);
    fixture.detectChanges();
  }

  function field(name: 'password' | 'confirmation'): HTMLInputElement | null {
    return fixture.nativeElement.querySelector(`input[name="${name}"]`);
  }

  function type(name: 'password' | 'confirmation', value: string): void {
    const input = field(name)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function submit(): void {
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  it('refuses a short password', () => {
    configure();
    type('password', 'short');

    expect(fixture.nativeElement.textContent).toContain('At least 6 characters');
    expect((fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBeTrue();
  });

  it('refuses a confirmation that does not match', () => {
    configure();
    type('password', 'a-good-password');
    type('confirmation', 'a-good-passwerd');

    expect(fixture.nativeElement.textContent).toContain('do not match');
    expect((fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBeTrue();
  });

  it('sets the new password and confirms it', async () => {
    configure();
    type('password', 'a-good-password');
    type('confirmation', 'a-good-password');

    submit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth['updatePassword'] as jasmine.Spy).toHaveBeenCalledWith('a-good-password');
    expect(fixture.nativeElement.textContent).toContain('Password updated');
    expect(field('password')).toBeNull();
  });

  it('shows why a new password was refused', async () => {
    configure({ updateError: new Error('New password should be different from the old password') });
    type('password', 'a-good-password');
    type('confirmation', 'a-good-password');

    submit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    expect(field('password')).not.toBeNull();
  });

  it('explains an expired link rather than showing a form that cannot work', () => {
    configure({ hasSession: false });

    expect(fixture.nativeElement.textContent).toContain('expired');
    expect(field('password')).toBeNull();
  });

  it('offers a way back to sign in from an expired link', () => {
    configure({ hasSession: false });

    (fixture.nativeElement.querySelector('.primarybtn') as HTMLButtonElement).click();

    expect(navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('continues into the app once the password is set', async () => {
    configure();
    type('password', 'a-good-password');
    type('confirmation', 'a-good-password');
    submit();
    await fixture.whenStable();
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.primarybtn') as HTMLButtonElement).click();

    expect(navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('says so when the deployment has no Supabase project', () => {
    configure({ isConfigured: false });

    expect(fixture.nativeElement.textContent).toContain('Not configured');
    expect(field('password')).toBeNull();
  });
});
