/**
 * The question catalogue the backend seeds its SQLite `questions` table from.
 *
 * This module is plain TypeScript with no Angular dependencies so the backend
 * generator (`backend/scripts/export_catalogue.mjs`) can bundle it with
 * esbuild and write `backend/data/catalogue.json`. The Angular app itself can
 * also import it for tests, so both sides agree on counts.
 */

import { CATEGORY_ORDER, QuestionInventoryEntry, collectInventory } from './build-units';
import { SECTION_META } from './section-meta';
import { TEST_IDS } from './tests.data';
import { SectionKey } from './models';

export interface CatalogueCategory {
  key: SectionKey;
  label: string;
  total: number;
  scoreable: number;
}

export interface Catalogue {
  schema_version: number;
  source: string;
  papers: string[];
  categories: CatalogueCategory[];
  questions: QuestionInventoryEntry[];
}

export function buildCatalogue(): Catalogue {
  const questions = collectInventory();

  const categories: CatalogueCategory[] = CATEGORY_ORDER.map((key) => {
    const rows = questions.filter((q) => q.category === key);
    return {
      key,
      label: SECTION_META[key].label,
      total: rows.length,
      scoreable: rows.filter((q) => q.scoreable).length,
    };
  });

  return {
    schema_version: 1,
    source: 'hsk4-practice-app/src/app/data',
    papers: [...TEST_IDS],
    categories,
    questions,
  };
}
