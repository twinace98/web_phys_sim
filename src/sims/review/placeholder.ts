// Placeholder page for an addition under review that has not been built yet.
import type { Scene, SimPage } from '../../core/types';

const scene = (id: string): Scene => ({
  id,
  title: 'review.placeholder',
  params: {},
  world: () => ({ x: [0, 1], y: [0, 1], aspect: 'contain' }),
  init: () => ({ t: 0 }),
  draw: () => {},
  info: { goals: ['review.placeholder'], observe: [] },
});

export const placeholderPage = (chapter: number, id: string): SimPage => ({
  chapter,
  scenes: [scene(id)],
  i18n: { ko: { 'review.placeholder': '준비 중' }, en: { 'review.placeholder': 'In preparation' } },
});
