import type { SimPage } from '../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { orbitScene } from './orbit';

const page: SimPage = { chapter: 13, scenes: [orbitScene], i18n: { ko, en } };
export default page;
