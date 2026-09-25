import { TestBed } from '@angular/core/testing';

import { RuntimeConfigService } from './runtime-config.service';

function stubFetch(response: Response | Error): void {
  window.fetch = (() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response)) as typeof fetch;
}

function configFile(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe('RuntimeConfigService', () => {
  let service: RuntimeConfigService;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RuntimeConfigService);
    originalFetch = window.fetch;
  });

  afterEach(() => {
    window.fetch = originalFetch;
  });

  it('defaults to the same-origin /api prefix, with no Supabase project', () => {
    expect(service.apiBase).toBe('/api');
    expect(service.supabaseUrl).toBe('');
    expect(service.supabaseAnonKey).toBe('');
    expect(service.hasSupabase).toBeFalse();
  });

  it('reads an absolute apiBase from config.json, without a trailing slash', async () => {
    stubFetch(configFile({ apiBase: 'https://ftapi.isym.uk/api/' }));

    await service.load();

    expect(service.apiBase).toBe('https://ftapi.isym.uk/api');
  });

  it('reads the Supabase project and its public key', async () => {
    stubFetch(
      configFile({
        apiBase: '/api',
        supabaseUrl: 'https://abcdefghijklm.supabase.co/',
        supabaseAnonKey: 'sb_publishable_abc123',
      }),
    );

    await service.load();

    expect(service.supabaseUrl).toBe('https://abcdefghijklm.supabase.co');
    expect(service.supabaseAnonKey).toBe('sb_publishable_abc123');
    expect(service.hasSupabase).toBeTrue();
  });

  it('is not configured when only half of the Supabase pair is present', async () => {
    stubFetch(configFile({ supabaseUrl: 'https://abcdefghijklm.supabase.co' }));

    await service.load();

    expect(service.hasSupabase).toBeFalse();
  });

  it('keeps the defaults when config.json is missing', async () => {
    stubFetch(new Response('not found', { status: 404 }));

    await service.load();

    expect(service.apiBase).toBe('/api');
    expect(service.hasSupabase).toBeFalse();
  });

  it('keeps the defaults when the request fails', async () => {
    stubFetch(new Error('offline'));

    await service.load();

    expect(service.apiBase).toBe('/api');
    expect(service.hasSupabase).toBeFalse();
  });

  it('ignores blank values', async () => {
    stubFetch(configFile({ apiBase: '   ', supabaseUrl: '  ', supabaseAnonKey: '  ' }));

    await service.load();

    expect(service.apiBase).toBe('/api');
    expect(service.hasSupabase).toBeFalse();
  });
});
