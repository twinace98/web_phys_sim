import type { SimPage } from '../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { polar } from './polar';
import { fibre, refraction } from './refraction';

const page: SimPage = { chapter: 33, scenes: [polar, refraction, fibre], i18n: { ko, en } };
export default page;
