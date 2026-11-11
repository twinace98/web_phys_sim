import type { SimPage } from '../../core/types';
import fieldEn from '../field/i18n.en.json';
import fieldKo from '../field/i18n.ko.json';
import { faraday } from './faraday';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { maxwell } from './maxwell';

const page: SimPage = { chapter: 30, scenes: [faraday, maxwell], i18n: { ko: { ...fieldKo, ...ko }, en: { ...fieldEn, ...en } } };
export default page;
