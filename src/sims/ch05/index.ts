import type { SimPage } from '../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { frames } from './frames';
import { newton } from './newton';
import { third } from './third';

const page: SimPage = { chapter: 5, scenes: [newton, third, frames], i18n: { ko, en } };
export default page;
