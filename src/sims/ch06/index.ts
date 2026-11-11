import type { SimPage } from '../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { circular } from './circular';
import { friction } from './friction';

const page: SimPage = { chapter: 6, scenes: [friction, circular], i18n: { ko, en } };
export default page;
