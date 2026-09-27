/**
 * Runtime question inventory: maps the stable question keys the review
 * database uses back to the units the question components render.
 *
 * Built from the same walker as `QuizBuilderService`, so the deck runner can
 * take a key list from the API and render local content without a second copy
 * of the question text.
 */

import {
  CATEGORY_ORDER,
  QuestionInventoryEntry,
  buildUnits,
  collectInventory,
  questionKeyOf,
} from './build-units';
import { SECTION_META } from './section-meta';
import { TEST_IDS, papersForLevel } from './tests.data';
import { Level, SectionKey, Unit } from './models';

export type { QuestionInventoryEntry } from './build-units';
export { CATEGORY_ORDER } from './build-units';

/** Every question across every paper and category. */
export const QUESTION_INVENTORY: QuestionInventoryEntry[] = collectInventory();

/** Question key -> renderable unit. */
export const UNIT_BY_QUESTION_KEY: ReadonlyMap<string, Unit> = (() => {
  const map = new Map<string, Unit>();
  for (const paper of TEST_IDS) {
    for (const category of CATEGORY_ORDER) {
      for (const unit of buildUnits(paper, category)) {
        map.set(questionKeyOf(paper, category, unit), unit);
      }
    }
  }
  return map;
})();

/** Inventory rows for one category, in paper order. */
export function inventoryForCategory(category: SectionKey): QuestionInventoryEntry[] {
  return QUESTION_INVENTORY.filter((q) => q.category === category);
}

/** Total questions in a category across every paper. */
export function categoryTotal(category: SectionKey): number {
  return inventoryForCategory(category).length;
}

/* ---------- level-scoped views ----------
 * The app ships one bank per exam level and never pools across them, so most
 * of the UI wants these rather than the unscoped helpers above.
 */

/** Inventory rows for one level and category, in paper order. */
export function inventoryForLevel(level: Level, category: SectionKey): QuestionInventoryEntry[] {
  return QUESTION_INVENTORY.filter((q) => q.level === level && q.category === category);
}

/** Questions in one category of one level. */
export function categoryTotalForLevel(level: Level, category: SectionKey): number {
  return inventoryForLevel(level, category).length;
}

/** Questions in one level across its three categories. */
export function levelTotal(level: Level): number {
  return QUESTION_INVENTORY.filter((q) => q.level === level).length;
}

/** Per-paper counts inside one level and category, for the deck start panel. */
export function perPaperForLevel(level: Level, category: SectionKey): Record<string, number> {
  return inventoryForLevel(level, category).reduce<Record<string, number>>((counts, question) => {
    counts[question.paper] = (counts[question.paper] ?? 0) + 1;
    return counts;
  }, {});
}

/** The papers of one level that actually contribute to a category. */
export function papersForLevelCategory(level: Level, category: SectionKey): string[] {
  return Object.keys(perPaperForLevel(level, category)).filter((paper) =>
    papersForLevel(level).includes(paper as never),
  );
}

/** The unit to render for a deck key, or null if the key is unknown. */
export function unitForQuestionKey(key: string): Unit | null {
  return UNIT_BY_QUESTION_KEY.get(key) ?? null;
}

/** Short label for a deck key, for places that only have the key. */
export function labelForQuestionKey(key: string): string {
  return QUESTION_INVENTORY.find((q) => q.key === key)?.label ?? key;
}

/** Distribution of the flat "kind" taxonomy, for the stats page. */
export const KIND_LABELS: Record<string, string | undefined> = {
  tf: 'True / false',
  mc: 'Multiple choice',
  fill: 'Fill in the blank',
  order: 'Sentence order',
  build: 'Sentence building',
  open: 'Guided writing',
  picture: 'Picture choice',
};

/** Paper metadata for stats tables. */
export function metaForCategory(category: SectionKey) {
  return SECTION_META[category];
}
