import type { SimPage } from '../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { stringScene } from './string';

const page: SimPage = { chapter: 11, scenes: [stringScene], i18n: { ko, en } };
export default page;
