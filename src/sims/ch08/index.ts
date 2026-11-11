import type { SimPage } from '../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { energyScene } from './energy';
import { pathScene } from './path';

const page: SimPage = { chapter: 8, scenes: [pathScene, energyScene], i18n: { ko, en } };
export default page;
