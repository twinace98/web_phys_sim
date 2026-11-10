import type { SimPage } from '../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { freefall } from './freefall';
import { kinematics } from './scene';

const page: SimPage = { chapter: 2, scenes: [kinematics, freefall], i18n: { ko, en } };
export default page;
