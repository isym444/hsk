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
import { LEVEL_OF_PAPER, TEST_IDS } from './tests.data';
import { SectionKey, TestId, Unit } from './models';

/**
 * The aggregated decks and the review database are keyed by
 * `paper:category:kind:number`. These tests pin the key scheme and the
 * inventory counts the backend seeds from, so a change to the walker can
 * never silently desynchronise stored review history.
 */
const LEVEL_TOTALS = {
  HSK3: { listening: 40, reading: 30, writing: 10 },
  HSK4: { listening: 45, reading: 40, writing: 15 },
} as const;

describe('question inventory (deck identity)', () => {
  const KINDS = ['tf', 'picture', 'mc', 'fill', 'order', 'build', 'open'];

  it('covers every paper × three categories', () => {
    // Derived from the papers the app ships, so adding one updates the
    // expectation instead of breaking the suite.
    const expected = TEST_IDS.reduce(
      (n, paper) =>
        n +
        CATEGORY_ORDER.reduce((m, category) => m + buildUnits(paper, category).length, 0),
      0,
    );
    expect(QUESTION_INVENTORY.length).toBe(expected);
    expect(QUESTION_INVENTORY.length).toBeGreaterThan(0);
  });

  it('counts every question of each category', () => {
    for (const category of CATEGORY_ORDER) {
      const expected = TEST_IDS.reduce(
        (n, paper) => n + buildUnits(paper, category).length,
        0,
      );
      expect(categoryTotal(category)).withContext(category).toBe(expected);
      expect(categoryTotal(category)).toBeGreaterThan(0);
    }
  });

  it('gives every question a unique key', () => {
    const keys = QUESTION_INVENTORY.map((q) => q.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('formats every key as paper:category:kind:number', () => {
    for (const q of QUESTION_INVENTORY) {
      expect(q.key).toMatch(/^[A-Z]\d{5}:(listening|reading|writing):[a-z]+:\d+$/);
      expect(q.key).toBe(`${q.paper}:${q.category}:${q.kind}:${q.number}`);
      expect(KINDS).toContain(q.kind);
    }
  });

  it('numbers each paper through its own question range without gaps', () => {
    for (const paper of TEST_IDS) {
      const expected = LEVEL_TOTALS[LEVEL_OF_PAPER[paper]];
      const size = expected.listening + expected.reading + expected.writing;
      const numbers = QUESTION_INVENTORY.filter((q) => q.paper === paper)
        .map((q) => q.number)
        .sort((a, b) => a - b);
      expect(numbers).withContext(paper).toEqual(Array.from({ length: size }, (_, i) => i + 1));
    }
  });

  it('marks only the open writing items as self-assessed', () => {
    const unscoreable = QUESTION_INVENTORY.filter((q) => !q.scoreable);
    const openUnits = TEST_IDS.reduce(
      (n, paper) => n + buildUnits(paper, 'writing').filter((u) => u.kind === 'open').length,
      0,
    );
    expect(unscoreable.length).toBe(openUnits);
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

    // HSK4: tf=1, mc=2-3, fill=1, order=2. HSK3 adds tf at 2, mc at 3-4, and
    // a second fill bank at part 2.
    expect([...(partsFor('listening').get('tf') ?? [])].sort()).toEqual([1, 2]);
    expect([...(partsFor('listening').get('mc') ?? [])].sort()).toEqual([2, 3, 4]);
    expect([...(partsFor('reading').get('fill') ?? [])].sort()).toEqual([1, 2]);
    expect([...(partsFor('reading').get('order') ?? [])]).toEqual([2]);
    expect([...(partsFor('reading').get('mc') ?? [])]).toEqual([3]);
    expect([...(partsFor('writing').get('build') ?? [])]).toEqual([1]);
    expect([...(partsFor('writing').get('open') ?? [])]).toEqual([2]);
  });

  it('resolves every inventory key back to the unit the components render', () => {
    expect(UNIT_BY_QUESTION_KEY.size).toBe(QUESTION_INVENTORY.length);
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
    expect(catalogue.questions.length).toBe(QUESTION_INVENTORY.length);
    expect(catalogue.categories.map((c) => [c.key, c.total])).toEqual(
      CATEGORY_ORDER.map((key) => [key, categoryTotal(key)]),
    );
    const writingScoreable = QUESTION_INVENTORY.filter(
      (q) => q.category === 'writing' && q.scoreable,
    ).length;
    expect(catalogue.categories.find((c) => c.key === 'writing')?.scoreable).toBe(writingScoreable);
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
