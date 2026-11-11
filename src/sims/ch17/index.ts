import type { SimPage } from '../../core/types';
import { beats } from './beats';
import { doppler } from './doppler';
import en from './i18n.en.json';
import ko from './i18n.ko.json';

const page: SimPage = { chapter: 17, scenes: [beats, doppler], i18n: { ko, en } };
export default page;
