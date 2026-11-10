import type { SimPage } from '../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { componentsScene, sumScene } from './scene';

const page: SimPage = { chapter: 3, scenes: [componentsScene, sumScene], i18n: { ko, en } };
export default page;
