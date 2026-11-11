import type { SimPage } from '../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { doubleSlit } from './scene';

const page: SimPage = { chapter: 35, scenes: [doubleSlit], i18n: { ko, en } };
export default page;
