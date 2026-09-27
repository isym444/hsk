import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { QuizShellComponent } from './quiz-shell/quiz-shell.component';
import { SummaryComponent } from './summary/summary.component';
import { DeckRunComponent } from './deck-run/deck-run.component';
import { DeckSummaryComponent } from './deck-summary/deck-summary.component';
import { CategoryStatsComponent } from './stats/category-stats.component';
import { StatsIndexComponent } from './stats/stats-index.component';
import { LoginComponent } from './login/login.component';
import { ResetPasswordComponent } from './login/reset-password.component';
import { activeSessionGuard } from './core/active-session.guard';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  /* The only public pages. */
  { path: 'login', component: LoginComponent },
  { path: 'reset-password', component: ResetPasswordComponent },

  /*
   * Everything else needs a session. One parent route carries the guard, so a
   * new page cannot accidentally ship unprotected — and the guard is a real
   * boundary only for the UI: the API checks the token itself.
   */
  {
    path: '',
    canActivate: [authGuard],
    children: [
      /*
       * The two banks are separate, so every page carries a level. Landing on
       * HSK4 keeps the old entry point working; the level switcher on the page
       * moves between them.
       */
      { path: '', pathMatch: 'full', redirectTo: 'HSK4' },
      { path: ':level', component: HomeComponent },

      /*
       * Aggregated decks, scoped to one level: every paper's questions of that
       * level for one skill, in one queue.
       */
      { path: ':level/deck/:category', component: DeckRunComponent },
      { path: ':level/deck/:category/summary/:sessionId', component: DeckSummaryComponent },

      /* Review statistics, also per level. */
      { path: ':level/stats', component: StatsIndexComponent },
      { path: ':level/stats/:category', component: CategoryStatsComponent },

      /* Original per-paper practice, kept as the secondary flow. */
      { path: 'quiz/:testId/:section', component: QuizShellComponent },
      {
        path: 'summary/:testId/:section',
        component: SummaryComponent,
        canActivate: [activeSessionGuard],
      },
    ],
  },

  { path: '**', redirectTo: '' },
];
