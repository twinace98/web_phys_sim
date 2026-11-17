// Addition under review: damped and forced oscillations (→ Ch 15).
import type { SimPage } from '../../../core/types';
import { drivenScene } from './driven';
import { freeScene } from './free';
import en from './i18n.en.json';
import ko from './i18n.ko.json';

const page: SimPage = { chapter: 108, scenes: [freeScene, drivenScene], i18n: { ko, en } };
export default page;
