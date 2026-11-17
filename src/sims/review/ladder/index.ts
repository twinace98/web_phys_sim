// Addition under review (→ Ch 12): static equilibrium of a ladder, and its slip once a climber passes d_c.
import type { SimPage } from '../../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { ladderScene } from './scene';

const page: SimPage = { chapter: 105, scenes: [ladderScene], i18n: { ko, en } };
export default page;
