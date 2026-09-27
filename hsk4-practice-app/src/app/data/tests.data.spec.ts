import { SECTION_META } from '../data/section-meta';
import { LEVEL_OF_PAPER, TESTS, TEST_IDS, papersForLevel } from '../data/tests.data';
import { SECTION_ORDER } from '../data/section-meta';
import { FIXTURE_TESTS } from '../testing/fixtures/fixtures';

/**
 * The three papers ported from `hsk4-practice.html` must stay data-identical to
 * it. The fixtures are extracted straight out of that file by
 * `scripts/make-fixtures.js`, so these assertions fail loudly if any
 * transcription drifts. Papers added later (H41332) are not in that file and
 * are checked on their own below.
 */
describe('data layer parity with hsk4-practice.html', () => {
  const ORIGINAL_PAPERS = ['H41001', 'H41002', 'H41003'] as const;

  it('keeps every original paper registered, in their original order', () => {
    const ported = TEST_IDS.filter((id) => (ORIGINAL_PAPERS as readonly string[]).includes(id));
    expect(ported).toEqual([...ORIGINAL_PAPERS]);
  });

  it('deep-equals the original TESTS object for the ported papers', () => {
    for (const id of ORIGINAL_PAPERS) {
      expect(TESTS[id]).withContext(id).toEqual(FIXTURE_TESTS[id]);
    }
  });

  it('registers every shipped paper', () => {
    expect([...TEST_IDS].sort()).toEqual(
      ['H31330', 'H31332', 'H41001', 'H41002', 'H41003', 'H41332'],
    );
    // Every shipped paper must resolve to a level, or it vanishes from the app.
    for (const id of TEST_IDS) {
      expect(['HSK3', 'HSK4']).withContext(id).toContain(LEVEL_OF_PAPER[id]);
    }
  });

  it('splits the papers into the two levels without overlap', () => {
    const hsk3 = papersForLevel('HSK3');
    const hsk4 = papersForLevel('HSK4');
    expect(hsk3.length + hsk4.length).toBe(TEST_IDS.length);
    expect(hsk3.filter((id) => hsk4.includes(id))).toEqual([]);
  });

  it('keeps the section meta map, with English UI labels', () => {
    expect(SECTION_META).toEqual({
      listening: { label: 'Listening', color: 'var(--listen)', speak: true },
      reading: { label: 'Reading', color: 'var(--read)', speak: false },
      writing: { label: 'Writing', color: 'var(--write)', speak: false },
    });
    expect(SECTION_ORDER).toEqual(['listening', 'reading', 'writing']);
  });

  it('gives every paper the question counts its level defines', () => {
    // HSK4 is 45 listening / 40 reading / 15 writing; HSK3 is 40 / 30 / 10.
    const perLevel = {
      HSK4: { listening: 45, reading: 40, writing: 15 },
      HSK3: { listening: 40, reading: 30, writing: 10 },
    };
    for (const id of TEST_IDS) {
      const test = TESTS[id];
      // Parts are unions across levels, so count whatever shape each holds.
      const count = (parts: { qs?: unknown[] }[]) =>
        parts.reduce((n, b) => n + (b.qs ? b.qs.length : 1), 0);
      const listening =
        count(test.listening.part1 as never) +
        count(test.listening.part2 as never) +
        count(test.listening.part3) +
        count((test.listening.part4 ?? []) as never);
      const reading =
        test.reading.part1.length +
        count(test.reading.part2 as never) +
        count(test.reading.part3);
      const writing = test.writing.part1.length + test.writing.part2.length;

      const expected = perLevel[LEVEL_OF_PAPER[id]];
      expect(listening).withContext(`${id} listening`).toBe(expected.listening);
      expect(reading).withContext(`${id} reading`).toBe(expected.reading);
      expect(writing).withContext(`${id} writing`).toBe(expected.writing);
      expect(listening + reading + writing).toBe(
        expected.listening + expected.reading + expected.writing,
      );
    }
  });
});
