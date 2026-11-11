import type { SimPage } from '../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { superposition, wells } from './scene';

const page: SimPage = { chapter: 39, scenes: [wells, superposition], i18n: { ko, en } };
export default page;
