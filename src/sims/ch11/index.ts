import type { SimPage } from '../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { rollScene } from './roll';
import { spinScene } from './spin';

const page: SimPage = { chapter: 11, scenes: [spinScene, rollScene], i18n: { ko, en } };
export default page;
