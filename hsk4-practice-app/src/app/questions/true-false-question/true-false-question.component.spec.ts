import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TrueFalseQuestionComponent } from './true-false-question.component';
import { TrueFalseUnit } from '../../data/models';
import { AudioService } from '../../core/audio.service';

/** Typed non-null lookup, so specs stay readable without `!` everywhere. */
function el<T extends HTMLElement>(root: unknown, selector: string): T {
  const found = (root as HTMLElement).querySelector<T>(selector);
  if (!found) {
    throw new Error(`expected to find ${selector}`);
  }
  return found;
}

describe('TrueFalseQuestionComponent', () => {
  let fixture: ComponentFixture<TrueFalseQuestionComponent>;
  let component: TrueFalseQuestionComponent;
  let played: { paper: string; n: number }[];

  const unit: TrueFalseUnit = {
    kind: 'tf',
    n: 1,
    statement: '今天天气不错。',
    audio: '喂？我们去树林里走走吧。',
    answer: true,
  };

  function buttons(): HTMLButtonElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.tfrow .optbtn'));
  }

  beforeEach(() => {
    played = [];
    TestBed.configureTestingModule({
      imports: [TrueFalseQuestionComponent],
      providers: [
        {
          provide: AudioService,
          useValue: {
            activeUrl: () => null,
            playing: () => false,
            failed: () => false,
            playQuestion: (paper: string, n: number) => played.push({ paper, n }),
            stop: () => {},
          },
        },
      ],
    });
    fixture = TestBed.createComponent(TrueFalseQuestionComponent);
    fixture.componentRef.setInput('unit', unit);
    fixture.componentRef.setInput('paper', 'H41001');
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders the starred statement, the play button and 对/错', () => {
    expect(fixture.nativeElement.querySelector('.statement .star')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.statement').textContent).toContain('今天天气不错。');
    expect(fixture.nativeElement.querySelector('.playbtn')).toBeTruthy();
    expect(buttons().map((b) => b.textContent?.trim())).toEqual(['对', '错']);
  });

  it('has no feedback and no next button before answering', () => {
    expect(component.hasAnswered()).toBeFalse();
    expect(fixture.nativeElement.querySelector('.feedback')).toBeFalsy();
  });

  it('marks a correct pick green and disables both buttons', () => {
    buttons()[0].click();
    fixture.detectChanges();

    expect(component.hasAnswered()).toBeTrue();
    expect(buttons()[0].classList).toContain('correct');
    expect(buttons()[0].disabled).toBeTrue();
    expect(buttons()[1].disabled).toBeTrue();
    expect(fixture.nativeElement.querySelector('.fbline.good')?.textContent).toContain('Correct');
  });

  it('marks a wrong pick red and still reveals the right one', () => {
    buttons()[1].click();
    fixture.detectChanges();

    expect(buttons()[1].classList).toContain('wrong');
    expect(buttons()[0].classList).toContain('correct');
    expect(fixture.nativeElement.querySelector('.fbline.bad')?.textContent).toContain('answer: 对');
  });

  it('shows the transcript once answered', () => {
    expect(fixture.nativeElement.querySelector('.transcript')).toBeFalsy();

    buttons()[0].click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.transcript-label')?.textContent).toBe('Transcript');
    expect(fixture.nativeElement.querySelector('.transcript')?.textContent).toContain('树林');
  });

  it('emits answered once and ignores a second pick', () => {
    const emitted: { correct?: boolean }[] = [];
    component.answered.subscribe((e) => emitted.push(e));

    buttons()[0].click();
    buttons()[1].click();
    fixture.detectChanges();

    expect(emitted).toEqual([{ correct: true }]);
  });

  it('plays this question\'s official recording when the play button is pressed', () => {
    el<HTMLButtonElement>(fixture.nativeElement, '.playbtn').click();

    expect(played).toEqual([{ paper: 'H41001', n: unit.n }]);
  });

  it('omits the play button and transcript for items without audio', () => {
    fixture.componentRef.setInput('unit', { ...unit, audio: '' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.playbtn')).toBeFalsy();

    expect(fixture.nativeElement.querySelector('.playbtn')).toBeFalsy();
    buttons()[0].click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.transcript')).toBeFalsy();
  });

  it('reports 错 as the solution for a false statement', () => {
    fixture.componentRef.setInput('unit', { ...unit, answer: false });
    fixture.detectChanges();

    buttons()[0].click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.fbline.bad')?.textContent).toContain('answer: 错');
    expect(buttons()[1].classList).toContain('correct');
  });

  it('reviews the item read-only with the answer highlighted', () => {
    fixture.componentRef.setInput('review', true);
    fixture.detectChanges();

    expect(buttons()[0].classList).toContain('correct');
    expect(buttons()[1].classList).toContain('dim');
    expect(buttons().every((button) => button.disabled)).toBeTrue();
    expect(fixture.nativeElement.querySelector('.fbline.good')?.textContent).toContain('Correct answer: 对');
    expect(fixture.nativeElement.querySelector('.transcript')?.textContent).toContain('树林');
  });

  it('emits nothing while reviewing', () => {
    const emitted: { correct?: boolean }[] = [];
    component.answered.subscribe((event) => emitted.push(event));
    fixture.componentRef.setInput('review', true);
    fixture.detectChanges();

    buttons()[0].click();
    buttons()[1].click();
    fixture.detectChanges();

    expect(emitted).toEqual([]);
    expect(component.hasAnswered()).toBeFalse();
  });
});
