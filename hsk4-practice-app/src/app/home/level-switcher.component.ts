import { Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { LEVELS } from '../data/tests.data';
import { Level } from '../data/models';
import { levelTotal } from '../data/question-inventory';

/**
 * The HSK3/HSK4 switcher.
 *
 * The two levels are separate question banks — a deck, a stats page and a
 * spelling of "question 1" all differ — so the level is part of the URL and
 * this control just navigates. It is rendered on every level-scoped page so a
 * learner can always see which bank they are in and jump to the other.
 */
@Component({
  selector: 'app-level-switcher',
  standalone: true,
  template: `
    <nav class="levelbar" aria-label="Exam level">
      @for (option of levels; track option) {
        <button
          type="button"
          class="levelbtn"
          [class.on]="option === level()"
          [attr.aria-current]="option === level() ? 'page' : null"
          (click)="go(option)"
        >
          <span class="lv">{{ option }}</span>
          <span class="lq">{{ total(option) }} questions</span>
        </button>
      }
    </nav>
  `,
  styles: [
    `
      .levelbar {
        display: inline-flex;
        gap: 6px;
        padding: 4px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--surface);
        margin-bottom: 18px;
      }
      .levelbtn {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 1px;
        border: 0;
        background: transparent;
        color: var(--ink-soft);
        border-radius: 7px;
        padding: 7px 14px;
        font: inherit;
        cursor: pointer;
      }
      .levelbtn:hover {
        color: var(--ink);
      }
      .levelbtn.on {
        background: var(--accent);
        color: #fff;
      }
      .lv {
        font-weight: 700;
        font-size: 14.5px;
      }
      .lq {
        font-size: 11.5px;
        opacity: 0.85;
      }
    `,
  ],
})
export class LevelSwitcherComponent {
  readonly level = input.required<Level>();

  private readonly router = inject(Router);

  readonly levels = LEVELS;

  /** Deck size per level, so each button says how much practice it holds. */
  private readonly totals: Record<Level, number> = Object.fromEntries(
    LEVELS.map((l) => [l, levelTotal(l)]),
  ) as Record<Level, number>;

  total(level: Level): number {
    return this.totals[level] ?? 0;
  }

  /** Navigate to the same page for the other level. */
  go(level: Level): void {
    if (level === this.level()) {
      return;
    }
    // The level is the first path segment, so the rest of the route is
    // preserved (a deck stays on the same skill, stats stay on stats).
    const rest = this.router.url.split('/').slice(2).join('/');
    void this.router.navigateByUrl(`/${level}${rest ? '/' + rest : ''}`);
  }
}
