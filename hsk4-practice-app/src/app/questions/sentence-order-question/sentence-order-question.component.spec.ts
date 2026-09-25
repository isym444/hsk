import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SentenceOrderQuestionComponent } from './sentence-order-question.component';
import { OrderUnit } from '../../data/models';

describe('SentenceOrderQuestionComponent', () => {
  let fixture: ComponentFixture<SentenceOrderQuestionComponent>;
  let component: SentenceOrderQuestionComponent;

  const unit: OrderUnit = {
    kind: 'order',
    n: 56,
    s: ['它就长满了这面墙，叶子很厚，绿绿的', '这种植物在这个季节长得很快', '经过短短一个星期'],
    answer: 'BCA',
  };

  function perms(): HTMLButtonElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.permgrid .permbtn'));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SentenceOrderQuestionComponent] });
    fixture = TestBed.createComponent(SentenceOrderQuestionComponent);
    fixture.componentRef.setInput('unit', unit);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('lists the three fragments with A/B/C markers', () => {
    const lines = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.ordersent div'),
    );
    expect(lines.length).toBe(3);
    expect(lines[0].textContent).toContain('A它就长满了这面墙');
    expect(lines[1].textContent).toContain('B这种植物');
    expect(lines[2].textContent).toContain('C经过短短一个星期');
  });

  it('renders all six permutations in the original grid order', () => {
    expect(perms().map((b) => b.textContent?.trim())).toEqual([
      'A → B → C',
      'A → C → B',
      'B → A → C',
      'B → C → A',
      'C → A → B',
      'C → B → A',
    ]);
  });

  it('greens the correct permutation', () => {
    perms()[3].click();
    fixture.detectChanges();

    expect(perms()[3].classList).toContain('correct');
    expect(fixture.nativeElement.querySelector('.fbline.good')?.textContent).toContain('Correct');
    expect(perms().every((b) => b.disabled)).toBeTrue();
  });

  it('marks a wrong permutation red and shows the correct order', () => {
    perms()[0].click();
    fixture.detectChanges();

    expect(perms()[0].classList).toContain('wrong');
    expect(perms()[3].classList).toContain('correct');
    expect(fixture.nativeElement.querySelector('.fbline.bad')?.textContent).toContain(
      'correct order: B → C → A',
    );
    expect(component.hasAnswered()).toBeTrue();
  });

  it('emits answered once', () => {
    const emitted: { correct?: boolean }[] = [];
    component.answered.subscribe((e) => emitted.push(e));

    perms()[3].click();
    perms()[0].click();
    fixture.detectChanges();

    expect(emitted).toEqual([{ correct: true }]);
  });
});
