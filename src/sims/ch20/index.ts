import type { SimPage } from '../../core/types';
import { carnotScene } from './carnot';
import { expansionScene } from './expansion';
import { heatScene } from './heat';
import en from './i18n.en.json';
import ko from './i18n.ko.json';

const page: SimPage = { chapter: 20, scenes: [expansionScene, heatScene, carnotScene], i18n: { ko, en } };
export default page;
