import { TestBed } from '@angular/core/testing';
import { QuizBuilderService } from './quiz-builder.service';
import { LEVEL_OF_PAPER, TEST_IDS } from '../data/tests.data';
import { Unit } from '../data/models';
import { fixtureUnits } from '../testing/fixtures/fixtures';

describe('QuizBuilderService', () => {
  let service: QuizBuilderService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(QuizBuilderService);
  });

  it('flattens every ported section exactly like the original buildUnits()', () => {
    // The fixtures come from hsk4-practice.html, which only holds the first
    // three papers; H41332 was added later and has no counterpart there.
    for (const testId of ['H41001', 'H41002', 'H41003'] as const) {
      for (const sectionKey of ['listening', 'reading', 'writing'] as const) {
        expect(service.buildUnits(testId, sectionKey))
          .withContext(`${testId}|${sectionKey}`)
          .toEqual(fixtureUnits(testId, sectionKey));
      }
    }
  });

  it('flattens H41332 into the same unit counts as every other paper', () => {
    expect(service.buildUnits('H41332', 'listening').length).toBe(45);
    expect(service.buildUnits('H41332', 'reading').length).toBe(40);
    expect(service.buildUnits('H41332', 'writing').length).toBe(15);
  });

  it('produces 45 listening units tagged tf then mc for HSK4', () => {
    const units = service.buildUnits('H41001', 'listening');
    expect(units.length).toBe(45);
    expect(units.slice(0, 10).every((u) => u.kind === 'tf')).toBeTrue();
    expect(units.slice(10).every((u) => u.kind === 'mc')).toBeTrue();
    expect(units.slice(10).every((u: Unit) => u.kind === 'mc' && u.speak)).toBeTrue();
  });

  it('produces 40 reading units tagged fill, order, then mc', () => {
    const units = service.buildUnits('H41001', 'reading');
    expect(units.length).toBe(40);
    expect(units.slice(0, 10).every((u) => u.kind === 'fill')).toBeTrue();
    expect(units.slice(10, 20).every((u) => u.kind === 'order')).toBeTrue();
    expect(units.slice(20).every((u) => u.kind === 'mc')).toBeTrue();
  });

  it('marks reading multiple-choice units as not spoken', () => {
    const mc = service.buildUnits('H41001', 'reading').filter((u) => u.kind === 'mc');
    expect(mc.length).toBe(20);
    expect(mc.every((u) => u.kind === 'mc' && u.speak === false)).toBeTrue();
  });

  it('produces 15 writing units tagged build then open', () => {
    const units = service.buildUnits('H41001', 'writing');
    expect(units.length).toBe(15);
    expect(units.slice(0, 10).every((u) => u.kind === 'build')).toBeTrue();
    expect(units.slice(10).every((u) => u.kind === 'open')).toBeTrue();
  });

  it('numbers each paper through its own question range without gaps', () => {
    const size = {
      HSK3: 40 + 30 + 10,
      HSK4: 45 + 40 + 15,
    } as const;
    for (const testId of TEST_IDS) {
      const numbers = (['listening', 'reading', 'writing'] as const).flatMap((sectionKey) =>
        service.buildUnits(testId, sectionKey).map((u) => u.n),
      );
      expect(numbers)
        .withContext(testId)
        .toEqual(Array.from({ length: size[LEVEL_OF_PAPER[testId]] }, (_, i) => i + 1));
    }
  });

  it('countQuestions matches buildUnits length', () => {
    expect(service.countQuestions('H41003', 'listening')).toBe(45);
    expect(service.countQuestions('H41003', 'reading')).toBe(40);
    expect(service.countQuestions('H41003', 'writing')).toBe(15);
  });

  it('carries every listening transcript through onto the unit', () => {
    const units = service.buildUnits('H41002', 'listening');
    const tf = units[0];
    expect(tf.kind).toBe('tf');
    if (tf.kind === 'tf') {
      expect(tf.audio.length).toBeGreaterThan(0);
      expect(tf.statement.length).toBeGreaterThan(0);
    }
  });

  it('keeps all accepted word orders for sentence building', () => {
    const build = service.buildUnits('H41001', 'writing')[0];
    expect(build.kind).toBe('build');
    if (build.kind === 'build') {
      expect(build.orders.length).toBeGreaterThan(0);
      expect(build.words.length).toBe(build.orders[0].length);
    }
  });
});
