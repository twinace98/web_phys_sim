import type { SimPage } from '../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { magnet } from './magnet';
import { origin } from './origin';

const page: SimPage = { chapter: 32, scenes: [origin, magnet], i18n: { ko, en } };
export default page;
