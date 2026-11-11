import type { SimPage } from '../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { phasor } from './phasor';
import { singleSlit } from './single';

const page: SimPage = { chapter: 36, scenes: [singleSlit, phasor], i18n: { ko, en } };
export default page;
