#!/usr/bin/env node
/**
 * Regenerates `backend/data/catalogue.json` from the Angular app's own data
 * layer.
 *
 * The question banks live in exactly one place — `hsk4-practice-app/src/app/
 * data/*.data.ts` — and the review database is keyed by the question keys that
 * `build-units.ts` derives from them. Rather than hand-copying 300 questions
 * into Python, this script bundles the app's dependency-free
 * `catalogue-export.ts` entry with esbuild and evaluates it, so the backend's
 * question inventory can never drift from what the UI renders.
 *
 * Usage:
 *   node scripts/export_catalogue.mjs           # write data/catalogue.json
 *   node scripts/export_catalogue.mjs --check   # exit 1 if it is out of date
 */

import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '..');
const repoRoot = path.resolve(backendDir, '..');
const appDir = path.join(repoRoot, 'hsk4-practice-app');
const entryPoint = path.join(appDir, 'src', 'app', 'data', 'catalogue-export.ts');
const outputPath = path.join(backendDir, 'data', 'catalogue.json');

const checkOnly = process.argv.includes('--check');

async function loadEsbuild() {
  const require = createRequire(path.join(appDir, 'package.json'));
  try {
    return require('esbuild');
  } catch {
    throw new Error(
      `Could not load esbuild from ${appDir}. Run "npm install" there first.`,
    );
  }
}

async function buildCatalogue() {
  const esbuild = await loadEsbuild();
  const result = await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    logLevel: 'warning',
  });

  const scratch = await mkdtemp(path.join(tmpdir(), 'hsk-catalogue-'));
  const bundlePath = path.join(scratch, 'catalogue-export.mjs');
  try {
    await writeFile(bundlePath, result.outputFiles[0].text, 'utf8');
    const module = await import(pathToFileURL(bundlePath).href);
    return module.buildCatalogue();
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

/** Compares everything except the volatile generation timestamp. */
function sameContent(a, b) {
  const strip = (catalogue) => {
    const { generated_at: _ignored, ...rest } = catalogue;
    return JSON.stringify(rest);
  };
  return strip(a) === strip(b);
}

async function main() {
  const catalogue = await buildCatalogue();

  if (checkOnly) {
    let existing;
    try {
      existing = JSON.parse(await readFile(outputPath, 'utf8'));
    } catch {
      console.error(`✗ ${path.relative(repoRoot, outputPath)} is missing or unreadable.`);
      process.exit(1);
    }
    if (!sameContent(existing, catalogue)) {
      console.error(
        `✗ ${path.relative(repoRoot, outputPath)} is out of date — run: node scripts/export_catalogue.mjs`,
      );
      process.exit(1);
    }
    console.log(`✓ ${path.relative(repoRoot, outputPath)} is up to date (${catalogue.questions.length} questions).`);
    return;
  }

  catalogue.generated_at = new Date().toISOString();
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(catalogue, null, 2)}\n`, 'utf8');

  const summary = catalogue.categories
    .map((c) => `${c.key} ${c.total} (${c.scoreable} scored)`)
    .join(', ');
  console.log(`✓ wrote ${path.relative(repoRoot, outputPath)} — ${catalogue.questions.length} questions: ${summary}`);
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
