import { H41001 } from './h41001.data';
import { H41002 } from './h41002.data';
import { H41003 } from './h41003.data';
import { Test, TestId } from './models';

/** The three official sample papers, same shape and order as the original `TESTS`. */
export const TESTS: Record<TestId, Test> = {
  H41001,
  H41002,
  H41003,
};

export const TEST_IDS = Object.keys(TESTS) as TestId[];

export function isTestId(value: string): value is TestId {
  return Object.prototype.hasOwnProperty.call(TESTS, value);
}

export function isSectionKey(value: string): value is 'listening' | 'reading' | 'writing' {
  return value === 'listening' || value === 'reading' || value === 'writing';
}
