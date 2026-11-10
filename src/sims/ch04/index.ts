import type { SimPage } from '../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { projectile } from './scene';

const page: SimPage = { chapter: 4, scenes: [projectile], i18n: { ko, en } };
export default page;
