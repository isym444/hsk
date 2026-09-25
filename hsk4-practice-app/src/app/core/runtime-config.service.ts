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
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  apiBase: '/api',
  supabaseUrl: '',
  supabaseAnonKey: '',
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
      };
    } catch {
      // Offline or malformed config: keep the defaults.
    }
  }

  private read(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
  }
}
