/**
 * Data shapes for the HSK4 practice app.
 *
 * The `*Raw` types mirror the nested shape of the original single-file app's
 * `TESTS` object. The `*Unit` types mirror what its `buildUnits()` produced:
 * one flat question at a time, discriminated by `kind`.
 */

export type TestId = 'H41001' | 'H41002' | 'H41003';
export type SectionKey = 'listening' | 'reading' | 'writing';

/* ---------- Raw test-bank shapes (today's T/B/Q/F/O/W/P helpers) ---------- */

/** True/false listening item — the old `T()` helper. */
export interface TrueFalseItem {
  n: number;
  statement: string;
  audio: string;
  answer: boolean;
}

/** Multiple-choice question — the old `Q()` helper. */
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
}

export interface ListeningSection {
  part1: TrueFalseItem[];
  part2: PassageBlock[];
  part3: PassageBlock[];
}

export interface ReadingSection {
  part1: FillBlankItem[];
  part2: OrderItem[];
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
}

export type Unit =
  | TrueFalseUnit
  | MultipleChoiceUnit
  | FillBlankUnit
  | OrderUnit
  | BuildUnit
  | OpenUnit;

export type UnitKind = Unit['kind'];
