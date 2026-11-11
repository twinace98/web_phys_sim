import type { SimPage } from '../../core/types';
import { cycleScene } from './cycle';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { pathsScene } from './paths';
import { processScene } from './process';

const page: SimPage = { chapter: 18, scenes: [processScene, pathsScene, cycleScene], i18n: { ko, en } };
export default page;
