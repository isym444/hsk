/**
 * Pure, dependency-free flattening of the nested test banks into flat question
 * units.
 *
 * This is the single source of truth for "what questions exist": both
 * `QuizBuilderService` (per-paper practice) and the aggregated deck/catalogue
 * layer walk the banks through `walkSection()`. Keeping one walker means the
 * question keys the review database is keyed by can never drift from the
 * question keys the UI renders.
 */

import { LEVEL_OF_PAPER, TESTS } from './tests.data';
import { Level, SectionKey, TestId, Unit, UnitKind } from './models';

/** Categories, in the order they are presented (matches SECTION_ORDER). */
export const CATEGORY_ORDER: SectionKey[] = ['listening', 'reading', 'writing'];

/** A unit plus the part of its section it came from (1-based). */
export interface BuiltQuestion {
  part: number;
  unit: Unit;
}

/**
 * Flattens one paper's section into units, preserving the original
 * `buildUnits()` ordering: part 1, then part 2, then part 3 (and HSK3's
 * part 4 after those).
 */
export function walkSection(testId: TestId, sectionKey: SectionKey): BuiltQuestion[] {
  const out: BuiltQuestion[] = [];

  if (sectionKey === 'listening') {
    const sec = TESTS[testId].listening;
    sec.part1.forEach((item) => {
      // A paper's part 1 is either true/false (HSK4) or picture choice (HSK3);
      // `options` is what tells them apart.
      const unit: Unit = 'options' in item
        ? { kind: 'picture', n: item.n, audio: item.audio, options: item.options, answer: item.answer }
        : {
            kind: 'tf',
            n: item.n,
            statement: item.statement,
            audio: item.audio,
            answer: item.answer,
          };
      out.push({ part: 1, unit });
    });
    sec.part2.forEach((block) => {
      // HSK4 part 2 is dialogue blocks; HSK3's is a run of true/false items.
      if (!('qs' in block)) {
        out.push({
          part: 2,
          unit: {
            kind: 'tf',
            n: block.n,
            statement: block.statement,
            audio: block.audio,
            answer: block.answer,
          },
        });
        return;
      }
      block.qs.forEach((q) =>
        out.push({
          part: 2,
          unit: {
            kind: 'mc',
            n: q.n,
            passage: block.passage,
            question: q.q,
            options: q.o,
            answer: q.a,
            speak: true,
          },
        }),
      );
    });
    sec.part3.forEach((block) =>
      block.qs.forEach((q) =>
        out.push({
          part: 3,
          unit: {
            kind: 'mc',
            n: q.n,
            passage: block.passage,
            question: q.q,
            options: q.o,
            answer: q.a,
            speak: true,
          },
        }),
      ),
    );
    (sec.part4 ?? []).forEach((block) =>
      block.qs.forEach((q) =>
        out.push({
          part: 4,
          unit: {
            kind: 'mc',
            n: q.n,
            passage: block.passage,
            question: q.q,
            options: q.o,
            answer: q.a,
            speak: true,
          },
        }),
      ),
    );
  } else if (sectionKey === 'reading') {
    const sec = TESTS[testId].reading;
    sec.part1.forEach((item) =>
      out.push({
        part: 1,
        unit: {
          kind: 'fill',
          n: item.n,
          bank: item.bank,
          sentence: item.sentence,
          answer: item.answer,
        },
      }),
    );
    sec.part2.forEach((item) => {
      // HSK4 orders sentence chunks; HSK3 fills a second word bank.
      if (!('s' in item)) {
        out.push({
          part: 2,
          unit: {
            kind: 'fill',
            n: item.n,
            bank: item.bank,
            sentence: item.sentence,
            answer: item.answer,
          },
        });
        return;
      }
      out.push({ part: 2, unit: { kind: 'order', n: item.n, s: item.s, answer: item.answer } });
    });
    sec.part3.forEach((block) =>
      block.qs.forEach((q) =>
        out.push({
          part: 3,
          unit: {
            kind: 'mc',
            n: q.n,
            passage: block.passage,
            question: q.q,
            options: q.o,
            answer: q.a,
            speak: false,
          },
        }),
      ),
    );
  } else if (sectionKey === 'writing') {
    const sec = TESTS[testId].writing;
    sec.part1.forEach((item) =>
      out.push({
        part: 1,
        unit: { kind: 'build', n: item.n, words: item.words, orders: item.orders },
      }),
    );
    sec.part2.forEach((item) =>
      out.push({
        part: 2,
        unit: {
          kind: 'open',
          n: item.n,
          word: item.word,
          model: item.model,
          // Only set when the paper needs different wording, so the HSK4 units
          // keep exactly the shape the original app produced.
          ...(item.instruction ? { instruction: item.instruction } : {}),
        },
      }),
    );
  }

  return out;
}

/** The flat unit list for one paper's section — the original `buildUnits()`. */
export function buildUnits(testId: TestId, sectionKey: SectionKey): Unit[] {
  return walkSection(testId, sectionKey).map((built) => built.unit);
}

/**
 * Stable identity of one question across the whole app and the review
 * database. Question numbers restart at 1 in every paper, so the paper and
 * category are part of the key.
 */
export function questionKeyOf(testId: TestId, sectionKey: SectionKey, unit: Unit): string {
  return `${testId}:${sectionKey}:${unit.kind}:${unit.n}`;
}

/**
 * Open writing items (guided writing: write a sentence from a picture) are
 * self-assessed against a model answer, so they are counted as "answered" but
 * excluded from success rate — the same rule the original quiz applied.
 */
export function isScoreable(unit: Unit): boolean {
  return unit.kind !== 'open';
}

/** Short human-readable snippet used in stats tables and review listings. */
export function unitLabel(unit: Unit): string {
  switch (unit.kind) {
    case 'tf':
      return unit.statement;
    case 'picture':
      return `图片选择 (${unit.options.length} 张图片)`;
    case 'mc':
      return unit.question;
    case 'fill':
      return unit.sentence;
    case 'order':
      return unit.s.join(' / ');
    case 'build':
      return unit.words.join(' ');
    case 'open':
      return unit.word;
  }
}

/** One row of the question catalogue shared with the backend. */
export interface QuestionInventoryEntry {
  key: string;
  paper: TestId;
  /** Exam level the paper belongs to; a deck never mixes two levels. */
  level: Level;
  category: SectionKey;
  kind: UnitKind;
  number: number;
  part: number;
  scoreable: boolean;
  label: string;
}

/** Every question in every paper, in paper-then-category-then-part order. */
export function collectInventory(): QuestionInventoryEntry[] {
  const out: QuestionInventoryEntry[] = [];
  for (const paper of Object.keys(TESTS) as TestId[]) {
    for (const category of CATEGORY_ORDER) {
      for (const { part, unit } of walkSection(paper, category)) {
        out.push({
          key: questionKeyOf(paper, category, unit),
          paper,
          level: LEVEL_OF_PAPER[paper],
          category,
          kind: unit.kind,
          number: unit.n,
          part,
          scoreable: isScoreable(unit),
          label: unitLabel(unit),
        });
      }
    }
  }
  return out;
}
