import type { SimPage } from '../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { workEnergy } from './scene';

const page: SimPage = { chapter: 7, scenes: [workEnergy], i18n: { ko, en } };
export default page;
