import { SECTION_META } from '../data/section-meta';
import { TESTS, TEST_IDS } from '../data/tests.data';
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

  it('keeps the original papers first, in their original order', () => {
    expect(TEST_IDS.slice(0, 3)).toEqual([...ORIGINAL_PAPERS]);
  });

  it('deep-equals the original TESTS object for the ported papers', () => {
    for (const id of ORIGINAL_PAPERS) {
      expect(TESTS[id]).withContext(id).toEqual(FIXTURE_TESTS[id]);
    }
  });

  it('registers every paper in TEST_IDS', () => {
    expect(TEST_IDS).toEqual(['H41001', 'H41002', 'H41003', 'H41332']);
  });

  it('keeps the section meta map, with English UI labels', () => {
    expect(SECTION_META).toEqual({
      listening: { label: 'Listening', color: 'var(--listen)', speak: true },
      reading: { label: 'Reading', color: 'var(--read)', speak: false },
      writing: { label: 'Writing', color: 'var(--write)', speak: false },
    });
    expect(SECTION_ORDER).toEqual(['listening', 'reading', 'writing']);
  });

  it('counts 100 questions per paper', () => {
    for (const id of TEST_IDS) {
      const test = TESTS[id];
      const listening =
        test.listening.part1.length +
        test.listening.part2.reduce((n, b) => n + b.qs.length, 0) +
        test.listening.part3.reduce((n, b) => n + b.qs.length, 0);
      const reading =
        test.reading.part1.length +
        test.reading.part2.length +
        test.reading.part3.reduce((n, b) => n + b.qs.length, 0);
      const writing = test.writing.part1.length + test.writing.part2.length;

      expect(listening).toBe(45);
      expect(reading).toBe(40);
      expect(writing).toBe(15);
      expect(listening + reading + writing).toBe(100);
    }
  });
});
