import type { SimPage } from '../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { puckScene } from './puck';
import { track } from './track';

const page: SimPage = { chapter: 9, scenes: [track, puckScene], i18n: { ko, en } };
export default page;
