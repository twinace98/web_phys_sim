import type { SimPage } from '../../core/types';
import { decayScene } from './decay';
import en from './i18n.en.json';
import ko from './i18n.ko.json';

const page: SimPage = { chapter: 42, scenes: [decayScene], i18n: { ko, en } };
export default page;
