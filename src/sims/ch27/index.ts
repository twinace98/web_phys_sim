import type { SimPage } from '../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { rcCircuit } from './scene';

const page: SimPage = { chapter: 27, scenes: [rcCircuit], i18n: { ko, en } };
export default page;
