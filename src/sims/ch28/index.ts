import type { SimPage } from '../../core/types';
import { cyclotronScene } from './cyclotron';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { lorentzScene } from './lorentz';

const page: SimPage = { chapter: 28, scenes: [lorentzScene, cyclotronScene], i18n: { ko, en } };
export default page;
