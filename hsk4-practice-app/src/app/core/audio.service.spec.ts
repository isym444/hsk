import { TestBed } from '@angular/core/testing';
import { AudioService } from './audio.service';
import { AUDIO_CLIPS, clipFor, clipUrl } from '../data/audio-clips';
import { TEST_IDS } from '../data/tests.data';

/**
 * Guards the real-voice recordings that replace the old speech synthesis.
 *
 * The manifest is what the UI resolves a question to, so a missing or
 * mis-named file would silently leave a listening question with no audio. The
 * browser tests load the file over HTTP (karma serves `public/` at the root,
 * exactly like `ng serve` and nginx) and check it really is decodable audio of
 * the advertised length.
 */
describe('listening audio clips', () => {
  it('has exactly one clip for each of the 45 listening questions per paper', () => {
    expect(AUDIO_CLIPS.length).toBe(180);
    for (const paper of TEST_IDS) {
      const numbers = AUDIO_CLIPS.filter((c) => c.paper === paper)
        .map((c) => c.n)
        .sort((a, b) => a - b);
      expect(numbers).toEqual(Array.from({ length: 45 }, (_, i) => i + 1));
    }
  });

  it('gives every clip a part 1..4 and a non-zero duration', () => {
    for (const clip of AUDIO_CLIPS) {
      expect(clip.part).toBeGreaterThanOrEqual(1);
      expect(clip.part).toBeLessThanOrEqual(4);
      expect(clip.duration).toBeGreaterThan(2);
      expect(clip.file).toMatch(/^H41(?:00[123]|332)_q\d\d\.mp3$/);
    }
  });

  it('resolves a clip by paper and question number', () => {
    expect(clipFor('H41001', 1)?.file).toBe('H41001_q01.mp3');
    expect(clipFor('H41003', 45)?.file).toBe('H41003_q45.mp3');
    expect(clipFor('H41332', 1)?.file).toBe('H41332_q01.mp3');
    expect(clipFor('H41332', 45)?.file).toBe('H41332_q45.mp3');
    expect(clipFor('H41002', 46)).toBeUndefined();
    expect(clipUrl(clipFor('H41002', 20)!)).toBe('audio/H41002_q20.mp3');
  });

  it('serves every clip as decodable audio of roughly the manifest length', async () => {
    // Load the whole set concurrently; this is the check that would have
    // caught a clip cut from the wrong part of the recording.
    const results = await Promise.all(
      AUDIO_CLIPS.map(
        (clip) =>
          new Promise<{ clip: typeof clip; duration: number | null }>((resolve) => {
            const el = new Audio();
            el.preload = 'metadata';
            el.addEventListener('loadedmetadata', () => resolve({ clip, duration: el.duration }));
            el.addEventListener('error', () => resolve({ clip, duration: null }));
            el.src = clipUrl(clip);
          }),
      ),
    );

    const failed = results.filter((r) => r.duration === null).map((r) => r.clip.file);
    expect(failed).withContext(`clips that failed to load: ${failed.join(', ')}`).toEqual([]);

    const drifted = results
      .filter((r) => Math.abs((r.duration ?? 0) - r.clip.duration) > 1.5)
      .map((r) => `${r.clip.file}: manifest ${r.clip.duration}s vs audio ${r.duration?.toFixed(2)}s`);
    expect(drifted).withContext(drifted.join('; ')).toEqual([]);
  });

  it('plays the right clip through the service and exposes playback state', async () => {
    const service = TestBed.inject(AudioService);
    expect(service.playing()).toBeFalse();

    service.playQuestion('H41001', 1);
    expect(service.activeUrl()).toBe('audio/H41001_q01.mp3');
    expect(service.failed()).toBeFalse();

    // A question with no recording must not pretend to play.
    service.playQuestion('H41001', 99);
    expect(service.failed()).toBeTrue();

    service.stop();
    expect(service.playing()).toBeFalse();
  });

  it('reports unsupported browsers instead of throwing', () => {
    const service = TestBed.inject(AudioService);
    spyOnProperty(service, 'supported', 'get').and.returnValue(false);
    service.playQuestion('H41001', 1);
    expect(service.failed()).toBeTrue();
  });
});
