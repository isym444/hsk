import { H31330 } from './h31330.data';
import { H31332 } from './h31332.data';
import { H41001 } from './h41001.data';
import { H41002 } from './h41002.data';
import { H41003 } from './h41003.data';
import { H41332 } from './h41332.data';
import { Level, Test, TestId } from './models';

/** The official sample papers, same shape and order as the original `TESTS`. */
export const TESTS: Record<TestId, Test> = {
  H31330,
  H31332,
  H41001,
  H41002,
  H41003,
  H41332,
};

export const TEST_IDS = Object.keys(TESTS) as TestId[];

/**
 * Which papers belong to which exam level. This is the single source of truth
 * for the HSK3/HSK4 split: the decks, the stats pages and the level picker all
 * derive from it, and a paper is never pooled with another level's.
 */
export const LEVEL_OF_PAPER: Record<TestId, Level> = {
  H31330: 'HSK3',
  H31332: 'HSK3',
  H41001: 'HSK4',
  H41002: 'HSK4',
  H41003: 'HSK4',
  H41332: 'HSK4',
};

/** Levels in the order they are offered, easiest first. */
export const LEVELS: Level[] = ['HSK3', 'HSK4'];

/** The papers belonging to one level, in paper order. */
export function papersForLevel(level: Level): TestId[] {
  return TEST_IDS.filter((id) => LEVEL_OF_PAPER[id] === level);
}

export function isLevel(value: string): value is Level {
  return (LEVELS as string[]).includes(value);
}

/** Spelled-out number of papers, for prose like "all four sample papers". */
export const PAPER_COUNT_LABEL = (() => {
  const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];
  return words[TEST_IDS.length] ?? String(TEST_IDS.length);
})();

/** The papers the decks pool, e.g. "H41001–H41003, H41332". */
export const PAPER_RANGE_LABEL =
  TEST_IDS.length > 1
    ? `${TEST_IDS[0]}–${TEST_IDS[TEST_IDS.length - 2]}, ${TEST_IDS[TEST_IDS.length - 1]}`
    : TEST_IDS[0];

export function isTestId(value: string): value is TestId {
  return Object.prototype.hasOwnProperty.call(TESTS, value);
}

export function isSectionKey(value: string): value is 'listening' | 'reading' | 'writing' {
  return value === 'listening' || value === 'reading' || value === 'writing';
}
