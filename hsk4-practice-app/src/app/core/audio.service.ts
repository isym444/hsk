import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { TestId } from '../data/models';
import { clipFileUrl, clipFor } from '../data/audio-clips';

/**
 * Plays the real-voice listening recordings.
 *
 * The app used to read every listening transcript out loud with the browser's
 * `speechSynthesis`. It now plays a clip cut from the official HSK4 recording
 * for that exact question instead, so what the learner hears is the same voice
 * and pace as the real exam.
 *
 * One shared `HTMLAudioElement` is reused, so starting a new question always
 * stops the previous one. Missing clips are reported through `failed` rather
 * than thrown, because a question whose recording is unavailable should still
 * be answerable.
 */
@Injectable({ providedIn: 'root' })
export class AudioService {
  private readonly doc = inject(DOCUMENT);

  private element: HTMLAudioElement | null = null;

  /** URL of the clip currently loaded, or null when nothing has played yet. */
  readonly activeUrl = signal<string | null>(null);

  /** True while a clip is audibly playing. */
  readonly playing = signal(false);

  /** Set when the last clip could not be loaded or played. */
  readonly failed = signal(false);

  /** Whether the browser can play audio at all. */
  get supported(): boolean {
    return typeof this.doc.defaultView?.Audio === 'function';
  }

  /** Play the recording for one listening question; a no-op if it has none. */
  playQuestion(paper: TestId, n: number): void {
    const clip = clipFor(paper, n);
    if (!clip) {
      this.failed.set(true);
      return;
    }
    this.playClip(clip.file);
  }

  /** Play one file from `public/audio/`. */
  playClip(file: string): void {
    if (!this.supported) {
      this.failed.set(true);
      return;
    }
    const audio = this.ensureElement();
    const url = clipFileUrl(file);
    this.failed.set(false);
    // Always restart, so pressing the button again replays from the beginning.
    audio.pause();
    audio.currentTime = 0;
    if (audio.src !== new URL(url, this.doc.baseURI).href) {
      audio.src = url;
    }
    this.activeUrl.set(url);
    void audio.play().catch(() => {
      this.failed.set(true);
      this.playing.set(false);
    });
  }

  /** Stop whatever is playing — used when leaving a quiz or moving on. */
  stop(): void {
    const audio = this.element;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    this.playing.set(false);
  }

  private ensureElement(): HTMLAudioElement {
    if (this.element) {
      return this.element;
    }
    const audio = new this.doc.defaultView!.Audio();
    audio.preload = 'none';
    audio.addEventListener('play', () => this.playing.set(true));
    audio.addEventListener('pause', () => this.playing.set(false));
    audio.addEventListener('ended', () => this.playing.set(false));
    audio.addEventListener('error', () => {
      this.playing.set(false);
      this.failed.set(true);
    });
    this.element = audio;
    return audio;
  }
}
