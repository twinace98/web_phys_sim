import type { SimPage } from '../../core/types';
import { gasScene } from './gas';
import en from './i18n.en.json';
import ko from './i18n.ko.json';

const page: SimPage = { chapter: 19, scenes: [gasScene], i18n: { ko, en } };
export default page;
