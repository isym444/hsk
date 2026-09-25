import { buildCatalogue } from './catalogue-export';
import {
  CATEGORY_ORDER,
  buildUnits,
  collectInventory,
  isScoreable,
  questionKeyOf,
  unitLabel,
} from './build-units';
import {
  QUESTION_INVENTORY,
  UNIT_BY_QUESTION_KEY,
  categoryTotal,
  unitForQuestionKey,
} from './question-inventory';
import { TEST_IDS } from './tests.data';
import { SectionKey, TestId, Unit } from './models';

/**
 * The aggregated decks and the review database are keyed by
 * `paper:category:kind:number`. These tests pin the key scheme and the
 * inventory counts the backend seeds from, so a change to the walker can
 * never silently desynchronise stored review history.
 */
describe('question inventory (deck identity)', () => {
  const KINDS = ['tf', 'mc', 'fill', 'order', 'build', 'open'];

  it('covers all three papers × three categories = 300 questions', () => {
    expect(QUESTION_INVENTORY.length).toBe(300);
  });

  it('counts 135 listening, 120 reading and 45 writing questions', () => {
    expect(categoryTotal('listening')).toBe(135);
    expect(categoryTotal('reading')).toBe(120);
    expect(categoryTotal('writing')).toBe(45);
  });

  it('gives every question a unique key', () => {
    const keys = QUESTION_INVENTORY.map((q) => q.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('formats every key as paper:category:kind:number', () => {
    for (const q of QUESTION_INVENTORY) {
      expect(q.key).toMatch(/^H410\d\d:(listening|reading|writing):[a-z]+:\d+$/);
      expect(q.key).toBe(`${q.paper}:${q.category}:${q.kind}:${q.number}`);
      expect(KINDS).toContain(q.kind);
    }
  });

  it('numbers each paper 1..100 across its categories', () => {
    for (const paper of TEST_IDS) {
      const numbers = QUESTION_INVENTORY.filter((q) => q.paper === paper)
        .map((q) => q.number)
        .sort((a, b) => a - b);
      expect(numbers).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
    }
  });

  it('marks only the open writing items as self-assessed', () => {
    const unscoreable = QUESTION_INVENTORY.filter((q) => !q.scoreable);
    expect(unscoreable.length).toBe(15);
    expect(unscoreable.every((q) => q.kind === 'open' && q.category === 'writing')).toBeTrue();
  });

  it('records the part each question came from', () => {
    const partsFor = (category: SectionKey) => {
      const byKind = new Map<string, Set<number>>();
      for (const q of QUESTION_INVENTORY.filter((q) => q.category === category)) {
        const set = byKind.get(q.kind) ?? new Set<number>();
        set.add(q.part);
        byKind.set(q.kind, set);
      }
      return byKind;
    };

    expect([...(partsFor('listening').get('tf') ?? [])]).toEqual([1]);
    expect([...(partsFor('listening').get('mc') ?? [])].sort()).toEqual([2, 3]);
    expect([...(partsFor('reading').get('fill') ?? [])]).toEqual([1]);
    expect([...(partsFor('reading').get('order') ?? [])]).toEqual([2]);
    expect([...(partsFor('reading').get('mc') ?? [])]).toEqual([3]);
    expect([...(partsFor('writing').get('build') ?? [])]).toEqual([1]);
    expect([...(partsFor('writing').get('open') ?? [])]).toEqual([2]);
  });

  it('resolves every inventory key back to the unit the components render', () => {
    expect(UNIT_BY_QUESTION_KEY.size).toBe(300);
    for (const entry of QUESTION_INVENTORY) {
      const unit = unitForQuestionKey(entry.key);
      expect(unit).withContext(entry.key).not.toBeNull();
      expect((unit as Unit).kind).toBe(entry.kind);
      expect((unit as Unit).n).toBe(entry.number);
      expect(unitLabel(unit as Unit)).toBe(entry.label);
    }
  });

  it('returns null for keys outside the catalogue', () => {
    expect(unitForQuestionKey('H41001:reading:mc:9999')).toBeNull();
    expect(unitForQuestionKey('nonsense')).toBeNull();
  });

  it('keeps questionKeyOf consistent with the inventory', () => {
    for (const paper of TEST_IDS) {
      for (const category of CATEGORY_ORDER) {
        for (const unit of buildUnits(paper, category)) {
          const key = questionKeyOf(paper, category, unit);
          expect(unitForQuestionKey(key)).withContext(key).toEqual(unit);
        }
      }
    }
  });

  it('builds a catalogue whose totals match the inventory', () => {
    const catalogue = buildCatalogue();
    expect(catalogue.schema_version).toBe(1);
    expect(catalogue.questions.length).toBe(300);
    expect(catalogue.categories.map((c) => [c.key, c.total])).toEqual([
      ['listening', 135],
      ['reading', 120],
      ['writing', 45],
    ]);
    expect(catalogue.categories.find((c) => c.key === 'writing')?.scoreable).toBe(30);
    expect(catalogue.categories.find((c) => c.key === 'listening')?.label).toBe('Listening');
  });

  it('classifies scoreable items the same way for every paper', () => {
    for (const paper of TEST_IDS) {
      for (const category of CATEGORY_ORDER) {
        const units = buildUnits(paper, category);
        for (const unit of units) {
          const entry = QUESTION_INVENTORY.find(
            (q) => q.key === questionKeyOf(paper as TestId, category, unit),
          );
          expect(entry?.scoreable).toBe(isScoreable(unit));
        }
      }
    }
  });
});
