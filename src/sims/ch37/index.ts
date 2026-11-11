import type { SimPage } from '../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { lightClocks, rods, simultaneity, spacetime } from './scene';

const page: SimPage = { chapter: 37, scenes: [lightClocks, rods, spacetime, simultaneity], i18n: { ko, en } };
export default page;
