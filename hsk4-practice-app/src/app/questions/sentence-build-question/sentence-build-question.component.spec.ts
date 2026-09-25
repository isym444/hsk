import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SentenceBuildQuestionComponent } from './sentence-build-question.component';
import { BuildUnit } from '../../data/models';

/** Typed non-null lookup, so specs stay readable without `!` everywhere. */
function el<T extends HTMLElement>(root: unknown, selector: string): T {
  const found = (root as HTMLElement).querySelector<T>(selector);
  if (!found) {
    throw new Error(`expected to find ${selector}`);
  }
  return found;
}

/**
 * The trickiest interaction in the app: undo has to re-enable exactly the
 * tiles the user had placed, including when the sentence repeats a word.
 */
describe('SentenceBuildQuestionComponent', () => {
  let fixture: ComponentFixture<SentenceBuildQuestionComponent>;
  let component: SentenceBuildQuestionComponent;

  function setUp(unit: BuildUnit): void {
    fixture = TestBed.createComponent(SentenceBuildQuestionComponent);
    fixture.componentRef.setInput('unit', unit);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function tileButton(word: string, occurrence = 0): HTMLButtonElement {
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.tilepool .tile'),
    ).filter((b) => b.textContent?.trim() === word);
    return buttons[occurrence];
  }

  function undoButton(): HTMLButtonElement {
    return el<HTMLButtonElement>(fixture.nativeElement, '.rowbtns .smallbtn');
  }

  function stripWords(): string[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLSpanElement>('.answerstrip .atile'),
    ).map((span) => span.textContent?.trim() ?? '');
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SentenceBuildQuestionComponent] });
  });

  it('shows the placeholder until a word is placed', () => {
    setUp({ kind: 'build', n: 87, words: ['我', '打算', '去长城', '看看'], orders: [['我', '打算', '去长城', '看看']] });

    expect(fixture.nativeElement.querySelector('.answerstrip .placeholder')).toBeTruthy();
    expect(stripWords()).toEqual([]);
  });

  it('moves a clicked tile into the strip and disables that tile', () => {
    setUp({ kind: 'build', n: 87, words: ['我', '打算', '去长城', '看看'], orders: [['我', '打算', '去长城', '看看']] });

    tileButton('我').click();
    fixture.detectChanges();

    expect(stripWords()).toEqual(['我']);
    expect(tileButton('我').disabled).toBeTrue();
    expect(fixture.nativeElement.querySelector('.answerstrip .placeholder')).toBeFalsy();
  });

  it('undo re-enables only the tile that was removed', () => {
    setUp({ kind: 'build', n: 87, words: ['我', '打算', '去长城', '看看'], orders: [['我', '打算', '去长城', '看看']] });

    tileButton('我').click();
    tileButton('打算').click();
    fixture.detectChanges();
    expect(stripWords()).toEqual(['我', '打算']);

    component.undo();
    fixture.detectChanges();

    expect(stripWords()).toEqual(['我']);
    expect(tileButton('打算').disabled).toBeFalse();
    expect(tileButton('我').disabled).toBeTrue();
  });

  it('placing a repeated word disables exactly one of its tiles', () => {
    setUp({
      kind: 'build',
      n: 1,
      words: ['很', '高兴', '很', '好'],
      orders: [['很', '高兴', '很', '好']],
    });

    tileButton('很', 0).click();
    fixture.detectChanges();

    const wei = [tileButton('很', 0), tileButton('很', 1)];
    expect(wei.filter((b) => b.disabled).length).toBe(1);
    expect(tileButton('高兴').disabled).toBeFalse();
  });

  it('undo re-enables exactly the tile that was removed', () => {
    setUp({
      kind: 'build',
      n: 1,
      words: ['很', '高兴', '很', '好'],
      orders: [['很', '高兴', '很', '好']],
    });

    tileButton('很', 0).click();
    tileButton('高兴').click();
    tileButton('很', 1).click();
    fixture.detectChanges();
    expect(stripWords()).toEqual(['很', '高兴', '很']);
    expect(
      [tileButton('很', 0), tileButton('很', 1), tileButton('高兴')].every((b) => b.disabled),
    ).toBeTrue();

    component.undo();
    fixture.detectChanges();

    expect(stripWords()).toEqual(['很', '高兴']);
    const wei = [tileButton('很', 0), tileButton('很', 1)];
    expect(wei.filter((b) => b.disabled).length).toBe(1);
    expect(tileButton('高兴').disabled).toBeTrue();
  });

  it('undo on an empty strip does nothing', () => {
    setUp({ kind: 'build', n: 87, words: ['我', '打算'], orders: [['我', '打算']] });

    expect(undoButton().disabled).toBeTrue();
    component.undo();
    fixture.detectChanges();

    expect(stripWords()).toEqual([]);
    expect(tileButton('我').disabled).toBeFalse();
  });

  it('judges a correct sentence and shows no reference answer', () => {
    setUp({ kind: 'build', n: 87, words: ['我', '打算'], orders: [['我', '打算']] });

    tileButton('我').click();
    tileButton('打算').click();
    fixture.detectChanges();

    expect(component.finished()).toBeTrue();
    expect(component.isCorrect()).toBeTrue();
    expect(component.hasAnswered()).toBeTrue();
    expect(fixture.nativeElement.querySelector('.fbline.good')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.transcript')).toBeFalsy();
  });

  it('reveals the first accepted order when the answer is wrong', () => {
    setUp({ kind: 'build', n: 87, words: ['我', '打算'], orders: [['我', '打算']] });

    tileButton('打算').click();
    tileButton('我').click();
    fixture.detectChanges();

    expect(component.isCorrect()).toBeFalse();
    expect(fixture.nativeElement.querySelector('.fbline.bad')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.transcript')?.textContent).toContain('我打算。');
  });

  it('blocks undo and further picks once judged', () => {
    setUp({ kind: 'build', n: 87, words: ['我', '打算'], orders: [['我', '打算']] });

    tileButton('我').click();
    tileButton('打算').click();
    fixture.detectChanges();
    const stripBefore = stripWords();

    component.undo();
    fixture.detectChanges();

    expect(stripWords()).toEqual(stripBefore);
    expect(undoButton().disabled).toBeTrue();
    expect(Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.tile')).every((b) => b.disabled)).toBeTrue();
  });

  it('accepts any of the listed orders', () => {
    setUp({
      kind: 'build',
      n: 95,
      words: ['对', '这个城市', '我', '很熟悉'],
      orders: [
        ['我', '对', '这个城市', '很熟悉'],
        ['对', '这个城市', '我', '很熟悉'],
      ],
    });

    for (const word of ['对', '这个城市', '我', '很熟悉']) {
      tileButton(word).click();
    }
    fixture.detectChanges();

    expect(component.isCorrect()).toBeTrue();
  });

  it('emits a single answered event with the verdict', () => {
    setUp({ kind: 'build', n: 87, words: ['我', '打算'], orders: [['我', '打算']] });
    const emitted: { correct?: boolean }[] = [];
    component.answered.subscribe((e) => emitted.push(e));

    tileButton('我').click();
    tileButton('打算').click();
    fixture.detectChanges();

    expect(emitted).toEqual([{ correct: true }]);
  });

  it('reviews the item read-only with the model answer shown', () => {
    setUp({ kind: 'build', n: 87, words: ['我', '打算'], orders: [['我', '打算']] });
    fixture.componentRef.setInput('review', true);
    fixture.detectChanges();

    expect(stripWords()).toEqual(['我', '打算']);
    expect(fixture.nativeElement.querySelector('.rowbtns')).toBeFalsy();
    expect(
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.tile'),
      ).every((button) => button.disabled),
    ).toBeTrue();
    expect(fixture.nativeElement.querySelector('.transcript')?.textContent).toContain('我打算。');
  });

  it('emits nothing while reviewing', () => {
    setUp({ kind: 'build', n: 87, words: ['我', '打算'], orders: [['我', '打算']] });
    const emitted: { correct?: boolean }[] = [];
    component.answered.subscribe((event) => emitted.push(event));
    fixture.componentRef.setInput('review', true);
    fixture.detectChanges();

    tileButton('我').click();
    fixture.detectChanges();

    expect(emitted).toEqual([]);
    expect(component.finished()).toBeFalse();
  });
});
