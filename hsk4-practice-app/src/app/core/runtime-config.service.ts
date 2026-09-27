/**
 * Runtime configuration, read once at startup from `config.json`.
 *
 * Nothing here is secret: `supabaseAnonKey` is the public API key Supabase
 * intends to ship in browsers, and access is enforced by the backend and by
 * row-level security, not by hiding this file.
 *
 * Why a file instead of the Angular environment files: the same bundle is
 * served from several places — `ng serve`, the nginx image, and the Render
 * static site — and only the static host needs an absolute API URL and a
 * Supabase project. Baking that in would mean a rebuild per environment.
 *
 * `scripts/write-runtime-config.mjs` (run by `npm run build:render`) fills it in
 * from `HSK_API_BASE`, `HSK_SUPABASE_URL` and `HSK_SUPABASE_ANON_KEY`; with none
 * of those set the committed defaults below are used.
 */

import { Injectable } from '@angular/core';

export interface RuntimeConfig {
  /** Base URL every API call is prefixed with, without a trailing slash. */
  apiBase: string;
  /** Supabase project URL, e.g. https://abcdefghijklm.supabase.co */
  supabaseUrl: string;
  /** Supabase publishable (or legacy anon) key. Public by design. */
  supabaseAnonKey: string;
  /**
   * Local-development switch: treat the visitor as signed in without Supabase.
   * Only ever true in a config.json written for local development, and matched
   * by `HSK_DEV_NO_AUTH` on the API, which refuses to honour it whenever a real
   * Supabase project is configured.
   */
  devNoAuth?: boolean;
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  apiBase: '/api',
  supabaseUrl: '',
  supabaseAnonKey: '',
  devNoAuth: false,
};

@Injectable({ providedIn: 'root' })
export class RuntimeConfigService {
  private config: RuntimeConfig = { ...DEFAULT_RUNTIME_CONFIG };

  get apiBase(): string {
    return this.config.apiBase;
  }

  get supabaseUrl(): string {
    return this.config.supabaseUrl;
  }

  get supabaseAnonKey(): string {
    return this.config.supabaseAnonKey;
  }

  /** True when a Supabase project is attached, i.e. sign-in is possible. */
  get hasSupabase(): boolean {
    return Boolean(this.config.supabaseUrl && this.config.supabaseAnonKey);
  }

  /**
   * True when this build runs without sign-in for local development.
   *
   * Requires that no Supabase project is attached, mirroring the API's own
   * refusal: a deployment cannot work without a project, so a `devNoAuth` flag
   * that leaked into a production config is ignored rather than opening the UI.
   */
  get devNoAuth(): boolean {
    return this.config.devNoAuth === true && !this.hasSupabase;
  }

  /**
   * Fetches `config.json` and applies it. Never rejects: a missing or broken
   * file just leaves the defaults in place, because an app that cannot boot is
   * worse than one pointed at the wrong API.
   */
  async load(): Promise<void> {
    try {
      // Resolved against <base href> so a deep link (/stats/reading) still
      // finds the file at the deployment root.
      const url = new URL('config.json', document.baseURI).toString();
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        return;
      }
      const loaded = (await response.json()) as Partial<RuntimeConfig> | null;
      this.config = {
        apiBase: this.read(loaded?.apiBase, DEFAULT_RUNTIME_CONFIG.apiBase).replace(/\/+$/, ''),
        supabaseUrl: this.read(loaded?.supabaseUrl, DEFAULT_RUNTIME_CONFIG.supabaseUrl).replace(
          /\/+$/,
          '',
        ),
        supabaseAnonKey: this.read(loaded?.supabaseAnonKey, DEFAULT_RUNTIME_CONFIG.supabaseAnonKey),
        // Copy every field explicitly: `config.json` is loaded at runtime and
        // anything not named here is silently dropped, which looks exactly like
        // the file not being read at all.
        devNoAuth: loaded?.devNoAuth === true,
      };
    } catch {
      // Offline or malformed config: keep the defaults.
    }
  }

  private read(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
  }
}
