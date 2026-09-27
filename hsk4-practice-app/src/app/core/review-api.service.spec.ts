import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ReviewApiService } from './review-api.service';
import { overviewFixture, sessionSummaryFixture } from '../testing/fixtures/stats';

describe('ReviewApiService', () => {
  let api: ReviewApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ReviewApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('starts a session with the category, mode and browser timezone offset', () => {
    api.startSession('writing', 'smart').subscribe();

    const request = http.expectOne('/api/sessions');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      category: 'writing',
      mode: 'smart',
      tz_offset_minutes: -new Date().getTimezoneOffset(),
    });
    request.flush({});
  });

  it('asks for a deck with its mode, limit and excluded keys', () => {
    api.deck('reading', 'HSK4', 'smart', { limit: 20, exclude: ['a:b:c:1', 'a:b:c:2'] }).subscribe();

    const request = http.expectOne((req) => req.url === '/api/deck/reading');
    expect(request.request.params.get('mode')).toBe('smart');
    expect(request.request.params.get('limit')).toBe('20');
    expect(request.request.params.get('exclude')).toBe('a:b:c:1,a:b:c:2');
    request.flush({});
  });

  it('omits the exclude parameter when there is nothing to exclude', () => {
    api.deck('listening', 'HSK4', 'random').subscribe();

    const request = http.expectOne((req) => req.url === '/api/deck/listening');
    expect(request.request.params.has('exclude')).toBeFalse();
    expect(request.request.params.has('limit')).toBeFalse();
    expect(request.request.params.get('mode')).toBe('random');
    request.flush({});
  });

  it('reads a category stats page with a session limit', () => {
    api.categoryPage('writing', 'HSK4', 5).subscribe();

    const request = http.expectOne((req) => req.url === '/api/stats/writing');
    expect(request.request.params.get('sessions')).toBe('5');
    request.flush(overviewFixture());
  });

  it('records a review against its session', () => {
    api
      .recordReview('session-1', {
        question_key: 'H41001:reading:fill:46',
        outcome: 'correct',
        elapsed_ms: 2500,
        answered_at: '2026-09-25T13:45:00.000+01:00',
      })
      .subscribe();

    const request = http.expectOne('/api/sessions/session-1/reviews');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.outcome).toBe('correct');
    expect(request.request.body.elapsed_ms).toBe(2500);
    request.flush({});
  });

  it('finishes and fetches a session by id', () => {
    api.finishSession('session-1').subscribe();
    http.expectOne('/api/sessions/session-1/finish').flush(sessionSummaryFixture());

    api.session('session-1').subscribe((summary) => expect(summary.answered).toBe(3));
    const request = http.expectOne('/api/sessions/session-1');
    expect(request.request.method).toBe('GET');
    request.flush(sessionSummaryFixture());
  });

  it('deletes an abandoned session', () => {
    api.deleteSession('session-1').subscribe();
    const request = http.expectOne('/api/sessions/session-1');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
  });

  it('loads the overview and the deck preview', () => {
    api.overview('HSK4').subscribe((data) => expect(data.categories.length).toBe(3));
    http.expectOne('/api/categories?level=HSK4').flush(overviewFixture());

    api.preview('listening', 'HSK4').subscribe((preview) => expect(preview.unseen).toBe(114));
    http.expectOne('/api/deck/listening/preview?level=HSK4').flush({
      category: 'listening',
      total_questions: 135,
      answered: 21,
      unseen: 114,
      weak: 2,
      due: 1,
    });
  });
});
