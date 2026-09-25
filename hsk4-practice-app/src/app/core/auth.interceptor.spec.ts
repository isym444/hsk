import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { AuthService } from './auth.service';
import { authInterceptor, isApiRequest } from './auth.interceptor';
import { RuntimeConfigService } from './runtime-config.service';

describe('isApiRequest', () => {
  it('matches a relative API base', () => {
    expect(isApiRequest('/api/categories', '/api')).toBeTrue();
    expect(isApiRequest('/api', '/api')).toBeTrue();
  });

  it('matches an absolute API base on another origin', () => {
    expect(isApiRequest('https://hsk.isym.uk/api/me', 'https://hsk.isym.uk/api')).toBeTrue();
  });

  it('tolerates a trailing slash on the base', () => {
    expect(isApiRequest('/api/me', '/api/')).toBeTrue();
  });

  it('leaves everything else alone', () => {
    expect(isApiRequest('/audio/H41001_q01.mp3', '/api')).toBeFalse();
    expect(isApiRequest('https://test-project.supabase.co/auth/v1/token', '/api')).toBeFalse();
    expect(isApiRequest('/apiary/thing', '/api')).toBeFalse();
  });
});

describe('authInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;
  let auth: jasmine.SpyObj<AuthService>;
  let navigate: jasmine.Spy;

  function configure(token: string | null): void {
    auth = jasmine.createSpyObj<AuthService>('AuthService', [
      'signOut',
      'markAccessDenied',
      'clearAccessDenied',
    ]);
    Object.defineProperty(auth, 'accessToken', { get: () => token });
    auth.signOut.and.returnValue(Promise.resolve());
    navigate = jasmine.createSpy('navigate');

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
        {
          provide: RuntimeConfigService,
          useValue: { apiBase: '/api', supabaseUrl: '', supabaseAnonKey: '', hasSupabase: false },
        },
        { provide: Router, useValue: { navigate } },
      ],
    });

    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  }

  afterEach(() => httpMock.verify());

  it('adds the bearer token to API calls', () => {
    configure('token-abc');

    httpClient.get('/api/categories').subscribe();
    const request = httpMock.expectOne('/api/categories');

    expect(request.request.headers.get('Authorization')).toBe('Bearer token-abc');
    request.flush({});
  });

  it('leaves non-API requests untouched', () => {
    configure('token-abc');

    httpClient.get('/audio/H41001_q01.mp3').subscribe();
    const request = httpMock.expectOne('/audio/H41001_q01.mp3');

    expect(request.request.headers.has('Authorization')).toBeFalse();
    request.flush('');
  });

  it('sends no header when signed out', () => {
    configure(null);

    httpClient.get('/api/me').subscribe({ error: () => undefined });
    const request = httpMock.expectOne('/api/me');

    expect(request.request.headers.has('Authorization')).toBeFalse();
    request.flush({}, { status: 401, statusText: 'Unauthorized' });
  });

  it('signs the user out and returns to the login page on 401', async () => {
    configure('expired-token');

    httpClient.get('/api/me').subscribe({ error: () => undefined });
    httpMock
      .expectOne('/api/me')
      .flush({ detail: 'the access token has expired' }, { status: 401, statusText: 'Unauthorized' });
    await settle();

    expect(auth.signOut).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('explains an allow-list rejection before returning to the login page', async () => {
    configure('valid-token');

    httpClient.get('/api/me').subscribe({ error: () => undefined });
    httpMock
      .expectOne('/api/me')
      .flush(
        { detail: 'stranger@example.com is not allowed to use this app' },
        { status: 403, statusText: 'Forbidden' },
      );
    await settle();

    expect(auth.markAccessDenied).toHaveBeenCalledWith(
      'stranger@example.com is not allowed to use this app',
    );
    expect(auth.signOut).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('leaves other errors to the caller', () => {
    configure('token-abc');
    const errors: HttpErrorResponse[] = [];

    httpClient.get('/api/categories').subscribe({ error: (error) => errors.push(error) });
    httpMock.expectOne('/api/categories').flush({}, { status: 500, statusText: 'Server Error' });

    expect(errors.length).toBe(1);
    expect(errors[0].status).toBe(500);
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});

/** Lets the interceptor's signOut().then(navigate) microtask chain run. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
