/**
 * Data-integrity checks over the whole question bank.
 *
 * The banks in `*.data.ts` are hand-transcribed from the official sample
 * papers, so the failure mode to guard against is a transcript that *looks*
 * fine but cannot be answered: a fill-in whose answer is not one of its six
 * chips, a sentence-ordering answer that names a letter that does not exist,
 * a multiple-choice answer pointing past the end of its options, a guided
 * writing prompt whose model answer never uses the target word.
 *
 * A question like that is unanswerable no matter how the UI behaves — the
 * correct chip can never be highlighted and every pick is judged wrong — which
 * is exactly the shape of "the app gave me the wrong answer" bug reports. This
 * spec walks every unit in the inventory so a bad transcript fails the build
 * instead of the learner.
 */

import { LEVEL_OF_PAPER, papersForLevel } from './tests.data';
import { QUESTION_INVENTORY, inventoryForCategory, unitForQuestionKey , categoryTotalForLevel} from './question-inventory';
import { TEST_IDS } from './tests.data';
import { Unit } from './models';

/** A4 reading part 1 offers exactly six words to choose from. */
/**
 * HSK4 banks hold six choices; HSK3's reading 46-50 prints only five (there is
 * no F option in that paper), so the check is a range rather than a constant.
 */
const FILL_BANK_MIN = 5;
const FILL_BANK_MAX = 6;

/** A4 reading part 2 asks you to order three fragments. */
const ORDER_FRAGMENTS = 3;

const LEVEL_TOTALS = {
  HSK3: { listening: 40, reading: 30, writing: 10 },
  HSK4: { listening: 45, reading: 40, writing: 15 },
} as const;

describe('question bank integrity', () => {
  const keys = QUESTION_INVENTORY.map((entry) => entry.key);

  it('gives every catalogue row a renderable unit', () => {
    const orphaned = keys.filter((key) => unitForQuestionKey(key) === null);
    expect(orphaned).toEqual([]);
  });

  it('keys every question uniquely', () => {
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every paper the section sizes its level defines', () => {
    for (const paper of TEST_IDS) {
      const expected = LEVEL_TOTALS[LEVEL_OF_PAPER[paper]];
      const forPaper = QUESTION_INVENTORY.filter((entry) => entry.paper === paper);
      for (const category of ['listening', 'reading', 'writing'] as const) {
        const count = forPaper.filter((entry) => entry.category === category).length;
        expect(count).withContext(`${paper} ${category}`).toBe(expected[category]);
      }
    }
    // The level totals are what the decks advertise, so check them too.
    for (const level of ['HSK3', 'HSK4'] as const) {
      for (const category of ['listening', 'reading', 'writing'] as const) {
        expect(categoryTotalForLevel(level, category))
          .withContext(`${level} ${category}`)
          .toBe(LEVEL_TOTALS[level][category] * papersForLevel(level).length);
      }
    }
  });

  it('numbers every question inside its paper and section, exactly once', () => {
    for (const paper of TEST_IDS) {
      for (const category of ['listening', 'reading', 'writing'] as const) {
        const numbers = QUESTION_INVENTORY.filter(
          (entry) => entry.paper === paper && entry.category === category,
        ).map((entry) => entry.number);
        expect(new Set(numbers).size)
          .withContext(`${paper} ${category}`)
          .toBe(numbers.length);
      }
    }
  });

  it('is answerable question by question', () => {
    const problems: string[] = [];

    const note = (unit: Unit, key: string, message: string): void => {
      problems.push(`${key} (${unit.kind} q${unit.n}): ${message}`);
    };

    for (const entry of QUESTION_INVENTORY) {
      const unit = unitForQuestionKey(entry.key);
      if (!unit) {
        continue;
      }

      switch (unit.kind) {
        case 'tf': {
          if (typeof unit.answer !== 'boolean') {
            note(unit, entry.key, 'answer is not 对/错');
          }
          if (!unit.statement?.trim()) {
            note(unit, entry.key, 'empty statement');
          }
          if (!unit.audio?.trim()) {
            note(unit, entry.key, 'no recording/transcript attached');
          }
          break;
        }

        case 'picture': {
          // HSK3 listening part 1: the "options" are picture files, so the only
          // thing to check is that the answer points at one that exists.
          if (!Number.isInteger(unit.answer) || unit.answer < 0 || unit.answer >= unit.options.length) {
            note(unit, entry.key, `answer index ${unit.answer} is outside the pictures`);
          }
          if (unit.options.length < 2) {
            note(unit, entry.key, 'fewer than two pictures');
          }
          if (new Set(unit.options).size !== unit.options.length) {
            note(unit, entry.key, 'duplicate picture files');
          }
          if (unit.options.some((option) => !option.trim())) {
            note(unit, entry.key, 'blank picture file name');
          }
          if (!unit.audio?.trim()) {
            note(unit, entry.key, 'no dialogue to listen to');
          }
          break;
        }

        case 'mc': {
          if (!Number.isInteger(unit.answer) || unit.answer < 0 || unit.answer >= unit.options.length) {
            note(unit, entry.key, `answer index ${unit.answer} is outside options`);
          }
          if (unit.options.length < 2) {
            note(unit, entry.key, 'fewer than two options');
          }
          if (new Set(unit.options).size !== unit.options.length) {
            note(unit, entry.key, 'duplicate options');
          }
          if (unit.options.some((option) => !option.trim())) {
            note(unit, entry.key, 'blank option');
          }
          if (!unit.question?.trim() || !unit.passage?.trim()) {
            note(unit, entry.key, 'empty question or passage');
          }
          break;
        }

        case 'fill': {
          if (unit.bank.length < FILL_BANK_MIN || unit.bank.length > FILL_BANK_MAX) {
            note(
              unit,
              entry.key,
              `bank has ${unit.bank.length} choices, expected ${FILL_BANK_MIN}-${FILL_BANK_MAX}`,
            );
          }
          if (new Set(unit.bank).size !== unit.bank.length) {
            note(unit, entry.key, 'duplicate words in the bank');
          }
          if (unit.bank.some((word) => !word.trim())) {
            note(unit, entry.key, 'blank word in the bank');
          }
          if (!unit.bank.includes(unit.answer)) {
            note(unit, entry.key, `answer ${unit.answer} is not one of the chips`);
          }
          if (!unit.sentence.includes('（')) {
            note(unit, entry.key, 'sentence has no gap to fill');
          }
          break;
        }

        case 'order': {
          if (unit.s.length !== ORDER_FRAGMENTS) {
            note(unit, entry.key, `${unit.s.length} fragments, expected ${ORDER_FRAGMENTS}`);
          }
          if (unit.s.some((fragment) => !fragment.trim())) {
            note(unit, entry.key, 'blank fragment');
          }
          if (unit.answer.length !== unit.s.length) {
            note(unit, entry.key, `answer ${unit.answer} does not order ${unit.s.length} fragments`);
          }
          const letters = unit.answer.split('').sort().join('');
          const expected = 'ABCDEFGHIJ'.slice(0, unit.s.length).split('').sort().join('');
          if (letters !== expected) {
            note(unit, entry.key, `answer ${unit.answer} is not a permutation of the letters`);
          }
          break;
        }

        case 'build': {
          if (unit.words.length < 2) {
            note(unit, entry.key, 'fewer than two word tiles');
          }
          if (unit.words.some((word) => !word.trim())) {
            note(unit, entry.key, 'blank word tile');
          }
          if (unit.orders.length === 0) {
            note(unit, entry.key, 'no model sentences to mark against');
          }
          const sortedWords = [...unit.words].sort().join('\u0000');
          for (const order of unit.orders) {
            if ([...order].sort().join('\u0000') !== sortedWords) {
              note(unit, entry.key, `model sentence 「${order.join('')}」 is not a use of the tiles`);
            }
          }
          break;
        }

        case 'open': {
          if (!unit.word?.trim()) {
            note(unit, entry.key, 'no prompt word');
          }
          if (!unit.model?.trim()) {
            note(unit, entry.key, 'no model answer to self-assess against');
          }
          if (unit.instruction) {
            // HSK3's 76-80 are a different task: the prompt is a gapped
            // sentence and the model is the single character that fills it, so
            // "the model uses the prompt" cannot hold. What must hold is that
            // the blank is there and the model is short enough to be a
            // character.
            if (!unit.word.includes('（')) {
              note(unit, entry.key, 'gap-fill prompt has no blank');
            }
            if (unit.model.length > 4) {
              note(unit, entry.key, `expected a short character answer, got 「${unit.model}」`);
            }
          } else if (!unit.model.includes(unit.word)) {
            note(unit, entry.key, `model answer never uses 「${unit.word}」`);
          }
          break;
        }
      }
    }

    expect(problems).toEqual([]);
  });
});
