import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideZoneChangeDetection } from '@angular/core';

import { routes } from '../app.routes';
import { authStubProviders } from '../testing/auth-stub';

/**
 * The guard is only a UI boundary — the API checks the token itself — but it
 * has to send an anonymous visitor somewhere useful rather than let the pages
 * render and then fail on every request.
 */
describe('authGuard', () => {
  let router: Router;

  function configure(signedIn: boolean): void {
    TestBed.configureTestingModule({
      providers: [
        provideZoneChangeDetection(),
        provideRouter(routes),
        ...authStubProviders({ signedIn }),
      ],
    });
    router = TestBed.inject(Router);
  }

  it('lets a signed-in user through to the app', async () => {
    configure(true);

    await router.navigate(['/stats']);

    expect(router.url).toBe('/stats');
  });

  it('sends a signed-out visitor to the login page', async () => {
    configure(false);

    await router.navigate(['/stats']);

    expect(router.url.startsWith('/login')).toBeTrue();
  });

  it('remembers where the visitor was heading', async () => {
    configure(false);

    await router.navigate(['/stats', 'reading']);

    const query = router.parseUrl(router.url).queryParams;
    expect(query['redirectTo']).toBe('/stats/reading');
  });

  it('keeps the login page itself reachable while signed out', async () => {
    configure(false);

    await router.navigate(['/login']);

    expect(router.url).toBe('/login');
  });

  it('keeps the password-reset landing reachable while signed out', async () => {
    // A recovery link signs you in, so this page usually has a session — but an
    // expired link must still reach it to be told so, rather than bouncing.
    configure(false);

    await router.navigate(['/reset-password']);

    expect(router.url).toBe('/reset-password');
  });

  it('protects the deck routes too', async () => {
    configure(false);

    await router.navigate(['/deck', 'listening']);

    expect(router.url.startsWith('/login')).toBeTrue();
  });
});
