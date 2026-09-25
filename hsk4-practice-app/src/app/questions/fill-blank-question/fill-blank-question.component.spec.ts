import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FillBlankQuestionComponent } from './fill-blank-question.component';
import { FillBlankUnit } from '../../data/models';

describe('FillBlankQuestionComponent', () => {
  let fixture: ComponentFixture<FillBlankQuestionComponent>;
  let component: FillBlankQuestionComponent;

  const unit: FillBlankUnit = {
    kind: 'fill',
    n: 46,
    bank: ['禁止', '海洋', '推迟', '坚持', '顺便', '估计'],
    sentence: '你去买啤酒吗？（　）帮我买一盒牛奶吧。',
    answer: '顺便',
  };

  function chips(): HTMLButtonElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.bank .bankchip'));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [FillBlankQuestionComponent] });
    fixture = TestBed.createComponent(FillBlankQuestionComponent);
    fixture.componentRef.setInput('unit', unit);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows the sentence and six lettered chips', () => {
    expect(fixture.nativeElement.querySelector('.statement')?.textContent).toContain('买啤酒');
    expect(chips().length).toBe(6);
    expect(chips().map((c) => c.querySelector('.lt')?.textContent)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
    ]);
    expect(chips()[4].textContent?.trim()).toBe('E顺便');
  });

  it('greens the right chip', () => {
    chips()[4].click();
    fixture.detectChanges();

    expect(chips()[4].classList).toContain('correct');
    expect(fixture.nativeElement.querySelector('.fbline.good')?.textContent).toContain('Correct');
    expect(chips().every((c) => c.disabled)).toBeTrue();
  });

  it('marks a wrong chip red and highlights the answer', () => {
    chips()[0].click();
    fixture.detectChanges();

    expect(chips()[0].classList).toContain('wrong');
    expect(chips()[4].classList).toContain('correct');
    expect(fixture.nativeElement.querySelector('.fbline.bad')?.textContent).toContain('answer: 顺便');
  });

  it('emits answered once with the verdict', () => {
    const emitted: { correct?: boolean }[] = [];
    component.answered.subscribe((e) => emitted.push(e));

    chips()[0].click();
    chips()[4].click();
    fixture.detectChanges();

    expect(emitted).toEqual([{ correct: false }]);
    expect(component.hasAnswered()).toBeTrue();
  });
});
