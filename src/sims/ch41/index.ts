import type { SimPage } from '../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { bandsScene } from './bands';
import { conduction } from './conduction';
import { doping } from './doping';
import { filling } from './filling';

const page: SimPage = { chapter: 41, scenes: [bandsScene, filling, conduction, doping], i18n: { ko, en } };
export default page;
