import type { SimPage } from '../../core/types';
import fieldEn from '../field/i18n.en.json';
import fieldKo from '../field/i18n.ko.json';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { field } from './scene';

const page: SimPage = { chapter: 22, scenes: [field], i18n: { ko: { ...fieldKo, ...ko }, en: { ...fieldEn, ...en } } };
export default page;
