import { SectionKey } from './models';

export interface SectionMeta {
  label: string;
  color: string;
  speak: boolean;
}

/**
 * Same map as the original file's `SECTION_META`, with the labels shown in the
 * UI. Only the labels are English: the question content they describe stays in
 * Chinese.
 */
export const SECTION_META: Record<SectionKey, SectionMeta> = {
  listening: { label: 'Listening', color: 'var(--listen)', speak: true },
  reading: { label: 'Reading', color: 'var(--read)', speak: false },
  writing: { label: 'Writing', color: 'var(--write)', speak: false },
};

/** Order sections appear in on the home screen, as in the original `renderHome`. */
export const SECTION_ORDER: SectionKey[] = ['listening', 'reading', 'writing'];
