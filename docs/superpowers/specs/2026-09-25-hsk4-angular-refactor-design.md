# HSK4 Practice App — Angular Refactor Design

Date: 2026-09-25
Status: Approved by user, ready for implementation planning

## Purpose

`hsk4-practice.html` is a single-file (1092-line) HTML/CSS/vanilla-JS quiz app
for HSK4 Chinese practice. It works correctly but everything — three test
banks' worth of question data, all styling, and all DOM-manipulation logic —
lives in one file. The goal of this refactor is purely organizational: port
the app to a proper Angular project with separated concerns (data, state,
components, styles), with **no visual or behavioral changes**. This is a
like-for-like port, not a redesign.

## Current behavior (source of truth)

Read directly from `hsk4-practice.html` (kept in the repo, untouched, as a
reference and fallback):

- **Data**: `TESTS` object with three test banks (`H41001`, `H41002`,
  `H41003`), each with `listening` (parts 1–3), `reading` (parts 1–3), and
  `writing` (parts 1–2) sections. Helper constructors `T/B/Q/F/O/W/P` build
  the raw records.
- **Flattening**: `buildUnits(testId, sectionKey)` turns a section's nested
  parts into a flat array of "units," each tagged with a `kind`: `tf`, `mc`,
  `fill`, `order`, `build`, `open`.
- **Flow**: Home (list of 3 tests × 3 sections) → Quiz (one unit at a time,
  sticky header with back button / progress bar / running score) → Summary
  (final score + open-question completion count).
- **Six question renderers**, one per `kind`, each: renders its prompt,
  handles the user's interaction, marks correct/wrong, shows a feedback
  block (and transcript for listening items), and adds a "next" button.
- **Speech**: `speak(text)` wraps `window.speechSynthesis`, selects a
  `zh-CN` voice when available, used for listening prompts (`tf.audio`,
  `mc.speak` passages).
- **Theming**: CSS custom properties on `:root`, light/dark via
  `prefers-color-scheme` and `data-theme` override; each section
  (listening/reading/writing) has its own accent color applied via a `--c`
  custom property.

## Target structure

Angular CLI project (standalone components, signal-based state — no NgRx;
the app's state graph is small: one active quiz session at a time) at
`hsk4-practice-app/`, created alongside the existing HTML file, which is
left in place.

```
hsk4-practice-app/
  src/
    styles.css                        # global theme vars, light/dark, shared classes
    app/
      app.routes.ts
      data/
        models.ts                     # Unit union type, Test/Section interfaces
        section-meta.ts                # listening/reading/writing labels + colors
        h41001.data.ts
        h41002.data.ts
        h41003.data.ts
        tests.data.ts                  # combines the three into TESTS
      core/
        speech.service.ts              # speak(), voice selection, support check
        quiz-state.service.ts          # signals: units, idx, correct, scoreable, openDone
        quiz-builder.service.ts        # buildUnits(testId, sectionKey)
        active-session.guard.ts        # CanActivate for /summary
      home/
        home.component.ts/.html/.css
      quiz-shell/
        quiz-shell.component.ts/.html/.css
      questions/
        true-false-question/
        multiple-choice-question/
        fill-blank-question/
        sentence-order-question/
        sentence-build-question/
        open-writing-question/
      summary/
        summary.component.ts/.html/.css
```

### Data layer

- `models.ts` defines a discriminated union `Unit` (by `kind`) matching the
  six shapes produced by today's `buildUnits`, plus the raw `Test`/
  `Section` interfaces matching today's `TESTS` shape.
- Each test bank (`H41001`/`H41002`/`H41003`) moves to its own data file,
  verbatim — same content, just split out of the current 1000+ line blob
  for navigability. `tests.data.ts` re-exports them combined as `TESTS`,
  matching today's shape exactly.
- `section-meta.ts` carries the same `{label, color, speak}` map keyed by
  `listening`/`reading`/`writing`.

### Services

- `QuizBuilderService.buildUnits(testId, sectionKey): Unit[]` — same
  flattening logic as today's free function, moved into an injectable
  service.
- `QuizStateService` — holds the active session as signals: `units`,
  `idx`, `correct`, `scoreable`, `openDone`, `openTotal`, `testId`,
  `sectionKey`. Exposes `start(testId, sectionKey)`, `recordAnswer(isCorrect)`,
  `goNext()`, `hasSession()`. `QuizShellComponent` and `SummaryComponent`
  both read from this service rather than passing state through routes.
- `SpeechService.speak(text: string)` — same `speechSynthesis` wrapper and
  `zh-CN` voice selection as today's `speak()`.

### Routing & components

- `/` → `HomeComponent`: renders the 3 tests × 3 section buttons (same
  content as today's `renderHome`). Clicking a section button calls
  `quizState.start(testId, sectionKey)` then navigates to
  `/quiz/:testId/:section`.
- `/quiz/:testId/:section` → `QuizShellComponent`: sticky header (back
  button, title, progress bar, running score — same markup/behavior as
  today's `.qz-top` block), subscribes to route param changes (not just
  `ngOnInit`, so retry-on-same-route works), and renders the current unit
  via `@switch (unit().kind)` into one of the six question components.
  Listens for `(answered)`/`(next)` from the active question component to
  update `QuizStateService` and either advance `idx` or navigate to
  `/summary/:testId/:section` when the section is complete.
- `/summary/:testId/:section` → `SummaryComponent`: reads the final tally
  from `QuizStateService` (same score/percentage/open-question-count
  display as today's `showSummary`). Guarded by `activeSessionGuard`
  (`CanActivate`) that redirects to `/` if `quizState.hasSession()` is
  false — covers direct URL entry/refresh, which today's app doesn't
  support either (state is in-memory only), so this is a like-for-like
  constraint, not a new limitation.
  - "重做一遍" (retry) calls `quizState.start(testId, sectionKey)` and
    navigates back to `/quiz/:testId/:section`.
  - "返回首页" (home) navigates to `/`.

### Question components

One standalone component per `kind`, each taking `unit: Unit` as an
`input()` and emitting `answered: { correct: boolean }` and `next: void`
(or a single combined event — implementer's call, matching today's
"answer then show next button" two-step interaction per kind):

- `TrueFalseQuestionComponent` (`tf`) — 对/错 buttons, optional play
  button + transcript, matching `renderTF`.
- `MultipleChoiceQuestionComponent` (`mc`) — A–D options, optional
  play-button-instead-of-passage-text when `unit.speak` is true, matching
  `renderMC`.
- `FillBlankQuestionComponent` (`fill`) — word-bank chips, matching
  `renderFill`.
- `SentenceOrderQuestionComponent` (`order`) — 6-permutation grid,
  matching `renderOrder`.
- `SentenceBuildQuestionComponent` (`build`) — shuffled word tiles +
  answer strip + undo, matching `renderBuild` (including the
  recompute-disabled-state-from-counts logic used by undo).
- `OpenWritingQuestionComponent` (`open`) — textarea + reveal-model-answer,
  matching `renderOpen` (including the "did your sentence contain the
  target word" heuristic check).

Each question component owns its local interaction state (which option
was picked, disabled/feedback flags) — this state doesn't need to live in
`QuizStateService`, only the aggregate score does.

### Styling

`src/styles.css` keeps the existing CSS custom properties (`--bg`,
`--surface`, `--ink`, `--accent`, `--listen`/`--read`/`--write`,
`--good`/`--bad`, etc.), the light/dark media query + `data-theme`
override, and the classes shared across every question type (`.card`,
`.tag`, `.playbtn`, `.feedback`, `.fbline`, `.transcript`, `.nextrow`,
`.primarybtn`, `.smallbtn`, `.optbtn` since both `tf` and `mc` use it).
Classes specific to one question type move into that component's own
scoped stylesheet (`.bank`/`.bankchip` → fill; `.ordersent`/`.permgrid`/
`.permbtn` → order; `.tilepool`/`.answerstrip`/`.rowbtns` → build;
`.opentext`/`.wordpill`/`.model`/`.usednote` → open). `HomeComponent` and
`QuizShellComponent`/`SummaryComponent` each get their own scoped
stylesheet for their unique classes (`.hero`, `.testrow`, `.sectionbtns`
→ home; `.qz-top`, `.qz-topinner`, `.progress` → quiz-shell;
`.summary-card`, `.summary-actions` → summary).

No new design tokens, no new breakpoints, no new components beyond what's
needed to mirror the six existing renderers.

## Error handling / edge cases

- Direct navigation to `/quiz/...` or `/summary/...` without an active
  session (e.g., page refresh) — today's app has no persistence either
  (in-memory `state` object), so the Angular version's guard-redirect-home
  behavior is equivalent, not a regression.
- `speechSynthesis` unsupported — same `alert(...)` fallback as today,
  moved into `SpeechService`.
- Everything else (malformed data, missing translations) is out of scope —
  the data is static and already correct in the source file.

## Testing plan

- Unit tests for `QuizBuilderService.buildUnits` against each section type
  (listening/reading/writing) to confirm unit counts and `kind` tagging
  match today's `buildUnits` output shape.
- Unit tests for `QuizStateService` (`start`, `recordAnswer`, `goNext`
  transitioning to done).
- Component tests for the trickiest interaction: `SentenceBuildQuestionComponent`'s
  undo logic (recomputing disabled tiles from `chosen` counts).
- Manual pass through all three tests × three sections in the browser to
  confirm visual and behavioral parity with `hsk4-practice.html`, including
  light/dark mode and the listening play button.
- No e2e framework is being introduced for this — out of scope/YAGNI for
  a personal practice tool.

## Out of scope

- No new features, no visual redesign, no deployment/hosting setup.
- No state persistence (localStorage, etc.) — today's app has none.
- No NgRx or other state library — signals are sufficient for one
  in-flight quiz session.
