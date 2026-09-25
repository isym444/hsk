/**
 * Payload every question component emits once the user has committed an
 * answer. `correct` is `undefined` for open-ended writing items, which are
 * self-assessed rather than scored.
 */
export interface AnswerEvent {
  correct?: boolean;
}
