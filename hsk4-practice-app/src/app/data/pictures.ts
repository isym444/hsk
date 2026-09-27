/**
 * Picture options for HSK3 listening part 1 (and anything else whose answer is
 * an image). The files are extracted from the source PDFs into
 * `public/images/`, which Angular copies into the bundle verbatim — the same
 * arrangement the audio clips use.
 */

/** Folder the option pictures are served from. */
export const PICTURE_BASE = 'images/';

/** URL for one picture file, as named in a question's `options` array. */
export function pictureUrl(file: string): string {
  return `${PICTURE_BASE}${file}`;
}
