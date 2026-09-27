import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SECTION_META } from '../data/section-meta';
import { SectionKey, TestId } from '../data/models';
import { QuizStateService } from '../core/quiz-state.service';
import { LEVEL_OF_PAPER } from '../data/tests.data';

/** Final tally screen — same numbers/markup as the original `showSummary()`. */
@Component({
  selector: 'app-summary',
  standalone: true,
  templateUrl: './summary.component.html',
  styleUrl: './summary.component.css',
})
export class SummaryComponent {
  readonly quizState = inject(QuizStateService);
  private readonly router = inject(Router);

  readonly meta = computed(() => {
    const key = this.quizState.sectionKey();
    return SECTION_META[key ?? 'listening'];
  });

  readonly tag = computed(
    () => `${this.quizState.testId()} · ${this.meta().label} · complete`,
  );

  readonly percentage = computed(() => {
    const scoreable = this.quizState.scoreable();
    return scoreable ? Math.round((this.quizState.correct() / scoreable) * 100) : 100;
  });

  retry(): void {
    const testId = this.quizState.testId() as TestId;
    const sectionKey = this.quizState.sectionKey() as SectionKey;
    this.quizState.start(testId, sectionKey);
    void this.router.navigate(['/quiz', testId, sectionKey]);
  }

  home(): void {
    const testId = this.quizState.testId() as TestId;
    void this.router.navigate(['/', LEVEL_OF_PAPER[testId]]);
  }
}
