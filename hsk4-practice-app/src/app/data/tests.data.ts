import { H41001 } from './h41001.data';
import { H41002 } from './h41002.data';
import { H41003 } from './h41003.data';
import { H41332 } from './h41332.data';
import { Test, TestId } from './models';

/** The official sample papers, same shape and order as the original `TESTS`. */
export const TESTS: Record<TestId, Test> = {
  H41001,
  H41002,
  H41003,
  H41332,
};

export const TEST_IDS = Object.keys(TESTS) as TestId[];

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
