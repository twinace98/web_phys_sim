// Addition under review: gravitational field and equipotentials of point masses (→ Ch 13).
import type { SimPage } from '../../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { gravfield } from './scene';

const page: SimPage = { chapter: 106, scenes: [gravfield], i18n: { ko, en } };
export default page;
