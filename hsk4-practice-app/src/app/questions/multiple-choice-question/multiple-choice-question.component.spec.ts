import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MultipleChoiceQuestionComponent } from './multiple-choice-question.component';
import { MultipleChoiceUnit } from '../../data/models';
import { SpeechService } from '../../core/speech.service';

/** Typed non-null lookup, so specs stay readable without `!` everywhere. */
function el<T extends HTMLElement>(root: unknown, selector: string): T {
  const found = (root as HTMLElement).querySelector<T>(selector);
  if (!found) {
    throw new Error(`expected to find ${selector}`);
  }
  return found;
}

describe('MultipleChoiceQuestionComponent', () => {
  let fixture: ComponentFixture<MultipleChoiceQuestionComponent>;
  let component: MultipleChoiceQuestionComponent;
  let spoken: string[];

  const listeningUnit: MultipleChoiceUnit = {
    kind: 'mc',
    n: 11,
    passage: '男：请问，附近有超市吗？\n女：前面那儿有个银行。',
    question: '问：超市在哪儿？',
    options: ['银行对面', '银行右边', '车站附近', '使馆西边'],
    answer: 0,
    speak: true,
  };

  const readingUnit: MultipleChoiceUnit = { ...listeningUnit, speak: false, answer: 2 };

  function options(): HTMLButtonElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.options .optbtn'));
  }

  beforeEach(() => {
    spoken = [];
    TestBed.configureTestingModule({
      imports: [MultipleChoiceQuestionComponent],
      providers: [
        {
          provide: SpeechService,
          useValue: { supported: true, speak: (t: string) => spoken.push(t), cancel: () => {} },
        },
      ],
    });
    fixture = TestBed.createComponent(MultipleChoiceQuestionComponent);
    fixture.componentRef.setInput('unit', listeningUnit);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('hides the passage behind the play button for listening items', () => {
    expect(fixture.nativeElement.querySelector('.playbtn')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.passage')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.question')?.textContent).toContain('超市在哪儿');
  });

  it('renders the passage text for reading items', () => {
    fixture.componentRef.setInput('unit', readingUnit);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.playbtn')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.passage')?.textContent).toContain('银行');
  });

  it('letters the options A–D in order', () => {
    expect(options().map((b) => b.querySelector('.lt')?.textContent)).toEqual(['A', 'B', 'C', 'D']);
    expect(options().map((b) => b.textContent)).toEqual([
      'A银行对面',
      'B银行右边',
      'C车站附近',
      'D使馆西边',
    ]);
  });

  it('greens the correct option and dims the rest', () => {
    options()[0].click();
    fixture.detectChanges();

    expect(options()[0].classList).toContain('correct');
    expect(options().slice(1).every((b) => b.classList.contains('dim'))).toBeTrue();
    expect(options().every((b) => b.disabled)).toBeTrue();
  });

  it('marks a wrong pick red and reveals the correct letter', () => {
    options()[3].click();
    fixture.detectChanges();

    expect(options()[3].classList).toContain('wrong');
    expect(options()[0].classList).toContain('correct');
    expect(fixture.nativeElement.querySelector('.fbline.bad')?.textContent).toContain('正确答案：A');
    expect(component.hasAnswered()).toBeTrue();
  });

  it('reveals the transcript only for listening items', () => {
    options()[0].click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.transcript')?.textContent).toContain('银行');

    fixture.componentRef.setInput('unit', readingUnit);
    fixture.detectChanges();
    options()[2].click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.transcript')).toBeFalsy();
  });

  it('speaks the passage rather than the question', () => {
    el<HTMLButtonElement>(fixture.nativeElement, '.playbtn').click();

    expect(spoken).toEqual([listeningUnit.passage]);
  });

  it('uses the C letter in the solution for a C answer', () => {
    fixture.componentRef.setInput('unit', { ...listeningUnit, answer: 2 });
    fixture.detectChanges();

    options()[0].click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.fbline.bad')?.textContent).toContain('正确答案：C');
    expect(options()[2].classList).toContain('correct');
    expect(options()[0].classList).toContain('wrong');
  });
});
