import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';

import { AuthService } from '../core/auth.service';
import { authStub } from '../testing/auth-stub';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let auth: Record<string, unknown>;
  let navigateByUrl: jasmine.Spy;

  function configure(
    options: {
      isConfigured?: boolean;
      signedIn?: boolean;
      denied?: string | null;
      redirectTo?: string;
      signInError?: Error;
      resetError?: Error;
    } = {},
  ): void {
    const {
      isConfigured = true,
      signedIn = false,
      denied = null,
      redirectTo = '/stats',
      signInError,
      resetError,
    } = options;

    const signInWithPassword = jasmine
      .createSpy('signInWithPassword')
      .and.callFake(() => (signInError ? Promise.reject(signInError) : Promise.resolve()));
    const sendPasswordReset = jasmine
      .createSpy('sendPasswordReset')
      .and.callFake(() => (resetError ? Promise.reject(resetError) : Promise.resolve()));
    const clearAccessDenied = jasmine.createSpy('clearAccessDenied');

    auth = {
      ...authStub({ signedIn, isConfigured }),
      accessDenied: () => denied,
      signInWithPassword,
      sendPasswordReset,
      clearAccessDenied,
    };
    navigateByUrl = jasmine.createSpy('navigateByUrl').and.returnValue(Promise.resolve(true));

    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: { navigateByUrl } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ redirectTo }) } },
        },
      ],
    });

    fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
  }

  function field(type: 'email' | 'password'): HTMLInputElement | null {
    return fixture.nativeElement.querySelector(`input[type="${type}"]`);
  }

  function type(target: 'email' | 'password', value: string): void {
    const input = field(target)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function submit(): void {
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  function button(selector: string): HTMLButtonElement {
    return fixture.nativeElement.querySelector(selector) as HTMLButtonElement;
  }

  it('asks for an email and a password', () => {
    configure();

    expect(field('email')).not.toBeNull();
    expect(field('password')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Sign in');
  });

  it('cannot be submitted until both fields have something in them', () => {
    configure();

    expect(button('button[type="submit"]').disabled).toBeTrue();

    type('email', 'learner@example.com');
    expect(button('button[type="submit"]').disabled).toBeTrue();

    type('password', 'hunter2');
    expect(button('button[type="submit"]').disabled).toBeFalse();
  });

  it('signs in and continues to the page the visitor wanted', async () => {
    configure({ redirectTo: '/stats/reading' });
    type('email', 'learner@example.com');
    type('password', 'hunter2');

    submit();
    await fixture.whenStable();

    expect(auth['signInWithPassword'] as jasmine.Spy).toHaveBeenCalledWith(
      'learner@example.com',
      'hunter2',
    );
    expect(navigateByUrl).toHaveBeenCalledWith('/stats/reading');
  });

  it('shows why a sign-in was refused', async () => {
    configure({ signInError: new Error('Invalid login credentials') });
    type('email', 'learner@example.com');
    type('password', 'wrong');

    submit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('drops to email-only for a forgotten password', () => {
    configure();
    type('email', 'learner@example.com');
    type('password', 'hunter2');

    button('.linkbtn').click();
    fixture.detectChanges();

    expect(field('password')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Email me a reset link');
    // The address typed for sign-in is kept, and the button is usable again
    // without a password.
    expect(field('email')!.value).toBe('learner@example.com');
    expect(button('button[type="submit"]').disabled).toBeFalse();
  });

  it('sends the reset email and says where it went', async () => {
    configure();
    type('email', 'learner@example.com');
    button('.linkbtn').click();
    fixture.detectChanges();

    submit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth['sendPasswordReset'] as jasmine.Spy).toHaveBeenCalledWith('learner@example.com');
    expect(fixture.nativeElement.textContent).toContain('Check your email');
    expect(field('email')).toBeNull();
  });

  it('shows why a reset email could not be sent', async () => {
    configure({ resetError: new Error('Email rate limit exceeded') });
    type('email', 'learner@example.com');
    button('.linkbtn').click();
    fixture.detectChanges();

    submit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    expect(field('email')).not.toBeNull();
  });

  it('returns to the sign-in form from the reset confirmation', async () => {
    configure();
    type('email', 'learner@example.com');
    button('.linkbtn').click();
    fixture.detectChanges();
    submit();
    await fixture.whenStable();
    fixture.detectChanges();

    button('.smallbtn').click();
    fixture.detectChanges();

    expect(field('password')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Forgot password?');
  });

  it('explains an allow-list rejection from the backend', () => {
    configure({ denied: 'stranger@example.com is not allowed to use this app' });

    expect(fixture.nativeElement.textContent).toContain('not allowed to use this app');
    expect((auth['clearAccessDenied'] as jasmine.Spy).calls.count()).toBe(1);
  });

  it('says so when the deployment has no Supabase project', () => {
    configure({ isConfigured: false });

    expect(fixture.nativeElement.textContent).toContain('Not configured');
    expect(field('email')).toBeNull();
  });

  it('sends an already signed-in visitor on to where they were going', () => {
    configure({ signedIn: true, redirectTo: '/stats/reading' });

    expect(navigateByUrl).toHaveBeenCalledWith('/stats/reading');
  });

  it('falls back to the home page when no destination was recorded', () => {
    configure({ signedIn: true, redirectTo: '' });

    expect(navigateByUrl).toHaveBeenCalledWith('/');
  });
});
