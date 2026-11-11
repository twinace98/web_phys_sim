import type { SimPage } from '../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { angle, sequential, single } from './scene';

const page: SimPage = { chapter: 40, scenes: [single, sequential, angle], i18n: { ko, en } };
export default page;
