import { TestBed } from '@angular/core/testing';
import { QuizStateService } from './quiz-state.service';
import { QuizBuilderService } from './quiz-builder.service';

describe('QuizStateService', () => {
  let service: QuizStateService;
  let builder: QuizBuilderService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(QuizStateService);
    builder = TestBed.inject(QuizBuilderService);
  });

  it('has no session before start()', () => {
    expect(service.hasSession()).toBeFalse();
    expect(service.total()).toBe(0);
    expect(service.currentUnit()).toBeNull();
    expect(service.done()).toBeFalse();
  });

  it('start() loads the built units and zeroes the tally', () => {
    service.start('H41001', 'reading');

    expect(service.hasSession()).toBeTrue();
    expect(service.testId()).toBe('H41001');
    expect(service.sectionKey()).toBe('reading');
    expect(service.units()).toEqual(builder.buildUnits('H41001', 'reading'));
    expect(service.total()).toBe(40);
    expect(service.idx()).toBe(0);
    expect(service.correct()).toBe(0);
    expect(service.scoreable()).toBe(0);
    expect(service.openDone()).toBe(0);
    expect(service.currentUnit()).toBe(service.units()[0]);
  });

  it('counts open writing questions separately via openTotal', () => {
    service.start('H41001', 'writing');
    expect(service.openTotal()).toBe(5);

    service.start('H41001', 'reading');
    expect(service.openTotal()).toBe(0);
  });

  it('recordAnswer(true) counts a scoreable point and a correct answer', () => {
    service.start('H41001', 'listening');

    service.recordAnswer(true);

    expect(service.scoreable()).toBe(1);
    expect(service.correct()).toBe(1);
  });

  it('recordAnswer(false) counts a scoreable point but no correct answer', () => {
    service.start('H41001', 'listening');

    service.recordAnswer(false);

    expect(service.scoreable()).toBe(1);
    expect(service.correct()).toBe(0);
  });

  it('recordAnswer(undefined) only bumps openDone', () => {
    service.start('H41001', 'writing');

    service.recordAnswer(undefined);

    expect(service.openDone()).toBe(1);
    expect(service.scoreable()).toBe(0);
    expect(service.correct()).toBe(0);
  });

  it('recordAnswer is a no-op without a session', () => {
    service.recordAnswer(true);
    expect(service.scoreable()).toBe(0);
    expect(service.openDone()).toBe(0);
  });

  it('goNext() advances the index and exposes the next unit', () => {
    service.start('H41001', 'listening');
    const second = service.units()[1];

    service.goNext();

    expect(service.idx()).toBe(1);
    expect(service.currentUnit()).toBe(second);
    expect(service.done()).toBeFalse();
  });

  it('goNext() past the last unit transitions to done', () => {
    service.start('H41001', 'writing');
    const total = service.total();

    for (let i = 0; i < total; i++) {
      service.goNext();
    }

    expect(service.idx()).toBe(total);
    expect(service.done()).toBeTrue();
    expect(service.currentUnit()).toBeNull();
  });

  it('start() resets an in-flight session', () => {
    service.start('H41001', 'listening');
    service.recordAnswer(true);
    service.goNext();
    service.goNext();

    service.start('H41002', 'reading');

    expect(service.testId()).toBe('H41002');
    expect(service.sectionKey()).toBe('reading');
    expect(service.idx()).toBe(0);
    expect(service.correct()).toBe(0);
    expect(service.scoreable()).toBe(0);
  });

  it('walking a whole section accumulates the same tally as the original state object', () => {
    service.start('H41001', 'reading');
    const units = service.units();

    // Answer everything correctly except the first unit.
    units.forEach((unit, i) => {
      const correct = i !== 0 && unit.kind !== 'open';
      service.recordAnswer(correct);
      service.goNext();
    });

    expect(service.scoreable()).toBe(40);
    expect(service.correct()).toBe(39);
    expect(service.done()).toBeTrue();
  });
});
