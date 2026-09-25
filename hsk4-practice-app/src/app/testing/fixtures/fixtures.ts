// Typed re-exports of the JSON fixtures generated from hsk4-practice.html.
// See .build/make-fixtures.js at the repo root — never hand-edit those JSON files.
import testsJson from './tests.json';
import unitsJson from './units.json';
import { Test, TestId, SectionKey, Unit } from '../../data/models';

export const FIXTURE_TESTS = testsJson as unknown as Record<TestId, Test>;
export const FIXTURE_UNITS = unitsJson as unknown as Record<string, Unit[]>;

export function fixtureUnits(testId: TestId, sectionKey: SectionKey): Unit[] {
  return FIXTURE_UNITS[`${testId}|${sectionKey}`];
}
