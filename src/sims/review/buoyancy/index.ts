// Addition under review: buoyancy, a block in a tank of fluid (→ Ch 14).
import type { SimPage } from '../../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { buoyancyScene } from './scene';

const page: SimPage = { chapter: 107, scenes: [buoyancyScene], i18n: { ko, en } };
export default page;
