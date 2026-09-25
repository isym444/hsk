import { SectionKey } from './models';

export interface SectionMeta {
  label: string;
  color: string;
  speak: boolean;
}

/** Same map as the original file's `SECTION_META`. */
export const SECTION_META: Record<SectionKey, SectionMeta> = {
  listening: { label: '听力', color: 'var(--listen)', speak: true },
  reading: { label: '阅读', color: 'var(--read)', speak: false },
  writing: { label: '写作', color: 'var(--write)', speak: false },
};

/** Order sections appear in on the home screen, as in the original `renderHome`. */
export const SECTION_ORDER: SectionKey[] = ['listening', 'reading', 'writing'];
