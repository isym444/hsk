/**
 * Persisted UI preferences that are not part of a practice session.
 *
 * Only one preference so far: whether the live per-question response timer is
 * shown while practising. It defaults to hidden — a clock ticking next to a
 * flashcard is distracting — and learners who want the timing feedback can
 * turn it back on. The choice is remembered on this device in `localStorage`,
 * so `reset()` on a session never changes it.
 */

import { Injectable, signal } from '@angular/core';

/** Versioned so a future format change can ignore old values. */
const STORAGE_KEY = 'hsk4:prefs:show-response-timer';

/** Reads the stored value, treating "storage unavailable" as the default. */
function readStored(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

@Injectable({ providedIn: 'root' })
export class PreferencesService {
  /** Whether the live "time on this question" readouts are shown. */
  readonly showResponseTimer = signal(readStored());

  toggleResponseTimer(): void {
    this.setResponseTimer(!this.showResponseTimer());
  }

  setResponseTimer(show: boolean): void {
    this.showResponseTimer.set(show);
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, show ? 'true' : 'false');
    } catch {
      // Private mode / disabled storage: the preference simply does not persist.
    }
  }
}
