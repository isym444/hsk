import { Injectable } from '@angular/core';
import { buildUnits } from '../data/build-units';
import { SectionKey, TestId, Unit } from '../data/models';

/**
 * Flattens a test bank's nested section into the flat list of question units
 * the quiz walks through. Same logic as the original file's `buildUnits()`,
 * now delegated to the shared pure walker in `data/build-units.ts` so the
 * aggregated decks and the review database use exactly the same question
 * identities.
 */
@Injectable({ providedIn: 'root' })
export class QuizBuilderService {
  buildUnits(testId: TestId, sectionKey: SectionKey): Unit[] {
    return buildUnits(testId, sectionKey);
  }

  /** Number of questions in a section — the count shown on the home buttons. */
  countQuestions(testId: TestId, sectionKey: SectionKey): number {
    return buildUnits(testId, sectionKey).length;
  }
}
