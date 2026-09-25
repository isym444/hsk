import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { QuizShellComponent } from './quiz-shell/quiz-shell.component';
import { SummaryComponent } from './summary/summary.component';
import { DeckRunComponent } from './deck-run/deck-run.component';
import { DeckSummaryComponent } from './deck-summary/deck-summary.component';
import { CategoryStatsComponent } from './stats/category-stats.component';
import { StatsIndexComponent } from './stats/stats-index.component';
import { activeSessionGuard } from './core/active-session.guard';

export const routes: Routes = [
  { path: '', component: HomeComponent },

  /* Aggregated decks: every paper's questions for one skill, in one queue. */
  { path: 'deck/:category', component: DeckRunComponent },
  { path: 'deck/:category/summary/:sessionId', component: DeckSummaryComponent },

  /* Review statistics. */
  { path: 'stats', component: StatsIndexComponent },
  { path: 'stats/:category', component: CategoryStatsComponent },

  /* Original per-paper practice, kept as the secondary flow. */
  { path: 'quiz/:testId/:section', component: QuizShellComponent },
  {
    path: 'summary/:testId/:section',
    component: SummaryComponent,
    canActivate: [activeSessionGuard],
  },

  { path: '**', redirectTo: '' },
];
