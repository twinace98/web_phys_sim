import type { SimPage } from '../../core/types';
import fieldEn from '../field/i18n.en.json';
import fieldKo from '../field/i18n.ko.json';
import { ampere } from './ampere';
import { biot } from './biot';
import en from './i18n.en.json';
import ko from './i18n.ko.json';

const page: SimPage = { chapter: 29, scenes: [biot, ampere], i18n: { ko: { ...fieldKo, ...ko }, en: { ...fieldEn, ...en } } };
export default page;
