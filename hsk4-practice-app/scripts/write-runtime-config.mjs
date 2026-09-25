#!/usr/bin/env node
/**
 * Writes `public/config.json` from environment variables, so a static host can
 * point the bundle at a backend on another origin and at a Supabase project
 * without any source change (see `src/app/core/runtime-config.service.ts`).
 *
 * Used by the Render static-site build:
 *
 *   HSK_API_BASE=https://ftapi.isym.uk/api \
 *   HSK_SUPABASE_URL=https://abcdefghijklm.supabase.co \
 *   HSK_SUPABASE_ANON_KEY=sb_publishable_... \
 *     npm run build:render
 *
 * The Supabase anon (publishable) key is a public value — it ships in every
 * Supabase web app and grants nothing on its own.
 *
 * With none of those variables set the script does nothing, leaving the
 * committed file alone; that is what local development, `ng build` and the
 * Docker/nginx image want.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(here, '..', 'public', 'config.json');

const DEFAULTS = { apiBase: '/api', supabaseUrl: '', supabaseAnonKey: '' };

/** Trimmed, with no trailing slash — the app joins paths onto these. */
function tidy(value) {
  return (value ?? '').trim().replace(/\/+$/, '');
}

const overrides = {
  apiBase: tidy(process.env.HSK_API_BASE),
  supabaseUrl: tidy(process.env.HSK_SUPABASE_URL),
  supabaseAnonKey: (process.env.HSK_SUPABASE_ANON_KEY ?? '').trim(),
};

const provided = Object.entries(overrides).filter(([, value]) => value);

if (provided.length === 0) {
  let existing = JSON.stringify(DEFAULTS);
  try {
    existing = (await readFile(outputPath, 'utf8')).replace(/\s+/g, ' ').trim();
  } catch {
    // The file is committed; a missing one is not worth failing the build over.
  }
  console.log(`No HSK_* variables set; leaving public/config.json as ${existing}`);
  process.exit(0);
}

if (overrides.apiBase && !/^https?:\/\//.test(overrides.apiBase) && !overrides.apiBase.startsWith('/')) {
  console.error(
    `HSK_API_BASE must be an absolute URL or a root-relative path, got "${overrides.apiBase}"`,
  );
  process.exit(1);
}

if (overrides.supabaseUrl && !/^https?:\/\//.test(overrides.supabaseUrl)) {
  console.error(`HSK_SUPABASE_URL must be an absolute URL, got "${overrides.supabaseUrl}"`);
  process.exit(1);
}

if (overrides.supabaseUrl && !overrides.supabaseAnonKey) {
  console.error('HSK_SUPABASE_URL is set but HSK_SUPABASE_ANON_KEY is not: sign-in would fail.');
  process.exit(1);
}

// Start from whatever is committed, then apply only what was provided.
let config = { ...DEFAULTS };
try {
  config = { ...DEFAULTS, ...JSON.parse(await readFile(outputPath, 'utf8')) };
} catch {
  // Keep the defaults if the committed file is missing or unreadable.
}
for (const [key, value] of provided) {
  config[key] = value;
}

await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
console.log(
  `public/config.json -> apiBase = ${config.apiBase}` +
    `, supabaseUrl = ${config.supabaseUrl || '(unset)'}` +
    `, supabaseAnonKey = ${config.supabaseAnonKey ? '(set)' : '(unset)'}`,
);
