import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OpenWritingQuestionComponent } from './open-writing-question.component';
import { OpenUnit } from '../../data/models';

/** Typed non-null lookup, so specs stay readable without `!` everywhere. */
function el<T extends HTMLElement>(root: unknown, selector: string): T {
  const found = (root as HTMLElement).querySelector<T>(selector);
  if (!found) {
    throw new Error(`expected to find ${selector}`);
  }
  return found;
}

describe('OpenWritingQuestionComponent', () => {
  let fixture: ComponentFixture<OpenWritingQuestionComponent>;
  let component: OpenWritingQuestionComponent;

  const unit: OpenUnit = { kind: 'open', n: 96, word: '日记', model: '她每天都坚持写日记。' };

  function textarea(): HTMLTextAreaElement {
    return el<HTMLTextAreaElement>(fixture.nativeElement, '.opentext');
  }

  function revealButton(): HTMLButtonElement {
    return el<HTMLButtonElement>(fixture.nativeElement, '.rowbtns .smallbtn');
  }

  function type(value: string): void {
    const el = textarea();
    el.value = value;
    el.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [OpenWritingQuestionComponent] });
    fixture = TestBed.createComponent(OpenWritingQuestionComponent);
    fixture.componentRef.setInput('unit', unit);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows the prompt, the target word and an empty textarea', () => {
    expect(fixture.nativeElement.querySelector('.question')?.textContent).toContain('Write a sentence using this word');
    expect(fixture.nativeElement.querySelector('.wordpill')?.textContent?.trim()).toBe('日记');
    expect(textarea().placeholder).toBe('Type your sentence here…');
    expect(textarea().disabled).toBeFalse();
  });

  it('hides the model answer until "Show model answer" is pressed', () => {
    expect(fixture.nativeElement.querySelector('.model')).toBeFalsy();
    expect(component.hasRevealed()).toBeFalse();

    revealButton().click();
    fixture.detectChanges();

    expect(component.hasRevealed()).toBeTrue();
    expect(fixture.nativeElement.querySelector('.model')?.textContent).toContain('她每天都坚持写日记。');
    expect(textarea().disabled).toBeTrue();
    expect(revealButton().disabled).toBeTrue();
  });

  it('praises a draft that contains the target word', () => {
    type('我每天都写日记。');
    revealButton().click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.fbline.good')?.textContent).toContain(
      'Your sentence uses 「日记」',
    );
  });

  it('nudges toward the model answer when the word is missing', () => {
    type('我每天都写汉字。');
    revealButton().click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.fbline.good')?.textContent).toContain(
      'Tip: compare with the model answer',
    );
  });

  it('emits answered once, with no verdict to score', () => {
    const emitted: { correct?: boolean }[] = [];
    component.answered.subscribe((e) => emitted.push(e));

    revealButton().click();
    revealButton().click();
    fixture.detectChanges();

    expect(emitted).toEqual([{ correct: undefined }]);
  });
});
