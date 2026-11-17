// Addition under review (→ Ch 3): dot and cross products.
import type { SimPage } from '../../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { crossScene, dotScene } from './scene';

const page: SimPage = { chapter: 104, scenes: [dotScene, crossScene], i18n: { ko, en } };
export default page;
