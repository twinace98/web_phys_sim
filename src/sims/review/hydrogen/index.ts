// Review page 102 (→ Ch 39): the hydrogen atom.
import type { SimPage } from '../../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { series, transitions } from './scene';

const page: SimPage = { chapter: 102, scenes: [transitions, series], i18n: { ko, en } };
export default page;
