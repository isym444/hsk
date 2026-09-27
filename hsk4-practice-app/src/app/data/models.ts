/**
 * Data shapes for the practice app, covering both HSK levels it ships.
 *
 * The `*Raw` types mirror the nested shape of the original single-file app's
 * `TESTS` object. The `*Unit` types mirror what its `buildUnits()` produced:
 * one flat question at a time, discriminated by `kind`.
 */

export type TestId =
  | 'H31330'
  | 'H31332'
  | 'H41001'
  | 'H41002'
  | 'H41003'
  | 'H41332';

/**
 * Exam level. The app keeps one question bank per level and never pools across
 * them; `LEVEL_OF_PAPER` in `tests.data.ts` is the single place that decides
 * which papers belong to which level.
 */
export type Level = 'HSK3' | 'HSK4';

export type SectionKey = 'listening' | 'reading' | 'writing';

/* ---------- Raw test-bank shapes (today's T/B/Q/F/O/W/P helpers) ---------- */

/** True/false listening item — the old `T()` helper. */
export interface TrueFalseItem {
  n: number;
  statement: string;
  audio: string;
  answer: boolean;
}

/**
 * HSK3 listening part 1: a short dialogue with no text answers, where the
 * learner picks the matching picture. `options` holds the picture files under
 * `public/images/` and `answer` indexes them.
 *
 * The count varies by paper and by question: H31330 shares one set of six
 * pictures across Q1-5 and a set of five (A-E, no F) across Q6-10, so nothing
 * may assume six.
 */
export interface PictureChoiceItem {
  n: number;
  audio: string;
  options: string[];
  answer: number;
}

/**
 * Multiple-choice question — the old `Q()` helper.
 *
 * The option count is the paper's, not a fixed four: HSK4 uses A-D everywhere,
 * while HSK3's listening parts 3/4 and reading part 3 use only A-C.
 */
export interface McQuestion {
  n: number;
  q: string;
  o: string[];
  a: number;
}

/** A passage plus the question(s) asked about it — the old `B()` helper. */
export interface PassageBlock {
  passage: string;
  qs: McQuestion[];
}

/** Fill-in-the-blank item — the old `F()` helper. */
export interface FillBlankItem {
  n: number;
  bank: string[];
  sentence: string;
  answer: string;
}

/** Sentence-ordering item — the old `O()` helper. */
export interface OrderItem {
  n: number;
  s: string[];
  answer: string;
}

/** Sentence-building item — the old `W()` helper. */
export interface SentenceBuildItem {
  n: number;
  words: string[];
  orders: string[][];
}

/** Open-ended writing item — the old `P()` helper. */
export interface OpenWritingItem {
  n: number;
  word: string;
  model: string;
  /**
   * Overrides the default "write a sentence using this word" prompt. HSK3's
   * 76-80 ask for a single character given a gapped sentence, which is a
   * different task and needs its own wording.
   */
  instruction?: string;
}

/**
 * Listening, in the shape the source papers use.
 *
 * The original single-file app's part1/part2/part3 map onto HSK4 directly
 * (part 3 carries both its 26-35 and 36-45 blocks). HSK3 differs in two ways:
 * its part 1 is pictures rather than true/false, its part 2 is true/false
 * rather than dialogue blocks, and it has a fourth part of passages. So `part1`
 * and `part2` are unions — each paper fills one side — and part 4 is optional.
 * A `PassageBlock` is told apart from the flat items by carrying `qs`.
 */
export interface ListeningSection {
  part1: TrueFalseItem[] | PictureChoiceItem[];
  part2: TrueFalseItem[] | PassageBlock[];
  part3: PassageBlock[];
  /** HSK3 listening part 4 (its reading-style passages); absent for HSK4. */
  part4?: PassageBlock[];
}

/**
 * Reading, in the shape the source papers use.
 *
 * HSK4 part 2 is sentence ordering; HSK3's is a second word-bank fill, which is
 * the same shape as part 1. `part2` is therefore a union, told apart by whether
 * the item carries `s` (ordering chunks) or `bank` (fill choices).
 */
export interface ReadingSection {
  part1: FillBlankItem[];
  part2: OrderItem[] | FillBlankItem[];
  part3: PassageBlock[];
}

export interface WritingSection {
  part1: SentenceBuildItem[];
  part2: OpenWritingItem[];
}

export interface Test {
  listening: ListeningSection;
  reading: ReadingSection;
  writing: WritingSection;
}

/* ---------- Flattened question units (today's buildUnits output) ---------- */

export interface TrueFalseUnit {
  kind: 'tf';
  n: number;
  statement: string;
  audio: string;
  answer: boolean;
}

/**
 * HSK3 listening part 1 — pick the picture that matches the dialogue. The
 * options are image paths rather than text, so it needs its own renderer.
 */
export interface PictureChoiceUnit {
  kind: 'picture';
  n: number;
  audio: string;
  options: string[];
  answer: number;
}

/** Listening part 2/3 units carry `speak: true`; reading part 3 units do not. */
export interface MultipleChoiceUnit {
  kind: 'mc';
  n: number;
  passage: string;
  question: string;
  options: string[];
  answer: number;
  speak: boolean;
}

export interface FillBlankUnit {
  kind: 'fill';
  n: number;
  bank: string[];
  sentence: string;
  answer: string;
}

export interface OrderUnit {
  kind: 'order';
  n: number;
  s: string[];
  answer: string;
}

export interface BuildUnit {
  kind: 'build';
  n: number;
  words: string[];
  orders: string[][];
}

export interface OpenUnit {
  kind: 'open';
  n: number;
  word: string;
  model: string;
  instruction?: string;
}

export type Unit =
  | TrueFalseUnit
  | PictureChoiceUnit
  | MultipleChoiceUnit
  | FillBlankUnit
  | OrderUnit
  | BuildUnit
  | OpenUnit;

export type UnitKind = Unit['kind'];
