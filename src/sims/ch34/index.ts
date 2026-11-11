import type { SimPage } from '../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { lensScene, mirrorScene } from './scene';

const page: SimPage = { chapter: 34, scenes: [lensScene, mirrorScene], i18n: { ko, en } };
export default page;
