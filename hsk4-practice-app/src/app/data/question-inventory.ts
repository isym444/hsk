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
import { TEST_IDS } from './tests.data';
import { SectionKey, Unit } from './models';

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

/** Total questions in a category across all three papers. */
export function categoryTotal(category: SectionKey): number {
  return inventoryForCategory(category).length;
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
  tf: '判断对错',
  mc: '单项选择',
  fill: '选词填空',
  order: '句子排序',
  build: '完成句子',
  open: '看图造句',
};

/** Paper metadata for stats tables. */
export function metaForCategory(category: SectionKey) {
  return SECTION_META[category];
}
