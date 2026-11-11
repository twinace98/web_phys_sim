import type { SimPage } from '../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { reflect } from './reflect';
import { resonanceScene } from './resonance';

const page: SimPage = { chapter: 16, scenes: [reflect, resonanceScene], i18n: { ko, en } };
export default page;
