import { Injectable } from '@angular/core';

/**
 * Thin wrapper around `window.speechSynthesis`, matching the original file's
 * free `speak()` function: cancel anything in flight, prefer a `zh` voice,
 * speak at 0.92 rate, and alert when the browser has no speech support.
 */
@Injectable({ providedIn: 'root' })
export class SpeechService {
  constructor() {
    this.primeVoices();
  }

  /** Whether the current browser exposes speech synthesis at all. */
  get supported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  speak(text: string): void {
    try {
      if (!this.supported) {
        alert('This browser does not support speech synthesis. You can read the transcript after answering.');
        return;
      }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.rate = 0.92;
      const voices = window.speechSynthesis.getVoices();
      const zh = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('zh'));
      if (zh) {
        u.voice = zh;
      }
      window.speechSynthesis.speak(u);
    } catch {
      /* no-op, same as the original */
    }
  }

  /** Stops any in-flight utterance — used when leaving a quiz. */
  cancel(): void {
    if (this.supported) {
      window.speechSynthesis.cancel();
    }
  }

  /** Touches `getVoices()` so the list is warm by the first play, as today. */
  private primeVoices(): void {
    if (!this.supported) {
      return;
    }
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {};
  }
}
