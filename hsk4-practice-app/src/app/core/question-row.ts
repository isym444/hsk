/**
 * The one-item collection a question `@for` iterates.
 *
 * Both the deck runner and the session-summary review card render exactly one
 * question at a time through a one-item `@for`, so that a change of question
 * destroys the old component and builds a new one instead of carrying its
 * local state (the picked chip, the sentence being built, the revealed model
 * answer) into the next question.
 *
 * The track expression has to read the *item* for that to work. Angular asks
 * the track function for the key of the outgoing item and of the incoming one;
 * an expression that only reads component state — `track deck.token()` or
 * `track reviewKey()` — answers the same key for both, so the diff reports
 * "same row, new value" and Angular reuses the component. The next question
 * then renders as already answered, with no way on. Carrying the key on the
 * item makes a new question a new key.
 */

import { Unit } from '../data/models';

export interface QuestionRow {
  /** Identity of the slot this question is being shown in. */
  token: string;
  unit: Unit;
}

/** Wraps the question on screen as a one-item `@for` collection. */
export function questionRows(token: string | null, unit: Unit | null): QuestionRow[] {
  return token && unit ? [{ token, unit }] : [];
}
