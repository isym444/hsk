/**
 * Typed client for the FastAPI review backend (`backend/app`).
 *
 * Calls are same-origin under `/api` by default: during development `ng serve`
 * proxies them to the API (see `proxy.conf.json`), and in the Docker stack the
 * API itself serves the bundle. A static host with no proxy (Render) points the
 * client at the deployed API instead, via `config.json` and
 * `RuntimeConfigService`.
 */

import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Level, SectionKey } from '../data/models';
import { RuntimeConfigService } from './runtime-config.service';

export type DeckMode = 'random' | 'smart';
export type Outcome = 'correct' | 'incorrect' | 'self_assessed';

export interface CategoryStats {
  category: string;
  total_questions: number;
  scoreable_questions: number;
  answered_questions: number;
  answered_scoreable: number;
  unanswered_questions: number;
  coverage: number;
  attempts: number;
  correct: number;
  incorrect: number;
  self_assessed: number;
  success_rate: number | null;
  avg_ms: number | null;
  total_review_ms: number;
  first_reviewed_at: string | null;
  last_reviewed_at: string | null;
  session_count: number;
}

export interface QuestionStats {
  question_key: string;
  label: string;
  paper: string;
  category: string;
  kind: string;
  number: number;
  part: number;
  scoreable: boolean;
  attempts: number;
  correct: number;
  incorrect: number;
  self_assessed: number;
  success_rate: number | null;
  avg_ms: number | null;
  streak: number;
  last_answered_at: string | null;
}

export interface DeckQuestion extends QuestionStats {
  priority: number | null;
  reason: string;
}

export interface DeckResponse {
  category: string;
  mode: DeckMode;
  count: number;
  total_questions: number;
  answered_questions: number;
  generated_at: string;
  questions: DeckQuestion[];
}

export interface DeckPreview {
  category: string;
  total_questions: number;
  answered: number;
  unseen: number;
  weak: number;
  due: number;
}

export interface SessionListItem {
  id: string;
  category: string;
  mode: string;
  started_at: string;
  ended_at: string | null;
  answered: number;
  correct: number;
  incorrect: number;
  self_assessed: number;
  success_rate: number | null;
  avg_ms: number | null;
  total_ms: number;
}

export interface SessionItem {
  question_key: string;
  label: string;
  paper: string;
  number: number;
  kind: string;
  part: number;
  scoreable: boolean;
  outcome: Outcome;
  elapsed_ms: number;
  answered_at: string;
  answered_at_local: string | null;
}

export interface SessionSummary extends SessionListItem {
  duration_ms: number;
  items: SessionItem[];
  prior: { attempts: number; success_rate: number | null; avg_ms: number | null };
  category_stats: CategoryStats;
}

export interface KindBreakdown {
  kind: string;
  questions: number;
  answered_questions: number;
  attempts: number;
  correct: number;
  incorrect: number;
  self_assessed: number;
  success_rate: number | null;
  avg_ms: number | null;
  coverage: number;
}

export interface CategoryStatsPage {
  stats: CategoryStats;
  by_kind: KindBreakdown[];
  questions: QuestionStats[];
  recent_sessions: SessionListItem[];
}

export interface StatsOverview {
  generated_at: string;
  categories: CategoryStats[];
  totals: CategoryStats;
}

export interface Health {
  status: string;
  database: string;
  questions: number;
}

/** Who the caller is, and how much history they have. Requires a token. */
export interface Me {
  user_id: string;
  email: string | null;
  role: string | null;
  reviews: number;
  sessions: number;
}

@Injectable({ providedIn: 'root' })
export class ReviewApiService {
  private readonly http = inject(HttpClient);
  private readonly runtimeConfig = inject(RuntimeConfigService);

  /** `/api` by default; an absolute URL when `config.json` overrides it. */
  private get base(): string {
    return this.runtimeConfig.apiBase;
  }

  /** Public liveness probe — carries no per-user data. */
  health(): Observable<Health> {
    return this.http.get<Health>(`${this.base}/health`);
  }

  /** The signed-in account, with its own row counts. */
  me(): Observable<Me> {
    return this.http.get<Me>(`${this.base}/me`);
  }

  overview(level: Level): Observable<StatsOverview> {
    const params = new HttpParams().set('level', level);
    return this.http.get<StatsOverview>(`${this.base}/categories`, { params });
  }

  categoryPage(category: SectionKey, level: Level, sessions = 10): Observable<CategoryStatsPage> {
    const params = new HttpParams().set('sessions', sessions).set('level', level);
    return this.http.get<CategoryStatsPage>(`${this.base}/stats/${category}`, { params });
  }

  deck(
    category: SectionKey,
    level: Level,
    mode: DeckMode,
    options: { limit?: number; exclude?: string[] } = {},
  ): Observable<DeckResponse> {
    let params = new HttpParams().set('mode', mode).set('level', level);
    if (options.limit !== undefined) {
      params = params.set('limit', options.limit);
    }
    if (options.exclude?.length) {
      params = params.set('exclude', options.exclude.join(','));
    }
    return this.http.get<DeckResponse>(`${this.base}/deck/${category}`, { params });
  }

  preview(category: SectionKey, level: Level): Observable<DeckPreview> {
    const params = new HttpParams().set('level', level);
    return this.http.get<DeckPreview>(`${this.base}/deck/${category}/preview`, { params });
  }

  startSession(category: SectionKey, mode: DeckMode): Observable<SessionListItem> {
    return this.http.post<SessionListItem>(`${this.base}/sessions`, {
      category,
      mode,
      tz_offset_minutes: -new Date().getTimezoneOffset(),
    });
  }

  recordReview(
    sessionId: string,
    review: { question_key: string; outcome: Outcome; elapsed_ms: number; answered_at: string },
  ): Observable<unknown> {
    return this.http.post(`${this.base}/sessions/${sessionId}/reviews`, review);
  }

  finishSession(sessionId: string): Observable<SessionSummary> {
    return this.http.post<SessionSummary>(`${this.base}/sessions/${sessionId}/finish`, {});
  }

  session(sessionId: string): Observable<SessionSummary> {
    return this.http.get<SessionSummary>(`${this.base}/sessions/${sessionId}`);
  }

  sessions(category?: SectionKey, limit = 10): Observable<SessionListItem[]> {
    let params = new HttpParams().set('limit', limit);
    if (category) {
      params = params.set('category', category);
    }
    return this.http.get<SessionListItem[]>(`${this.base}/sessions`, { params });
  }

  deleteSession(sessionId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/sessions/${sessionId}`);
  }
}
