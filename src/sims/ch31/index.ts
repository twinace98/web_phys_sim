import type { SimPage } from '../../core/types';
import { acScene } from './ac';
import { freeScene } from './free';
import en from './i18n.en.json';
import ko from './i18n.ko.json';

const page: SimPage = { chapter: 31, scenes: [freeScene, acScene], i18n: { ko, en } };
export default page;
