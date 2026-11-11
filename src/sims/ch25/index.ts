import type { SimPage } from '../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { capacitor } from './scene';

const page: SimPage = { chapter: 25, scenes: [capacitor], i18n: { ko, en } };
export default page;
