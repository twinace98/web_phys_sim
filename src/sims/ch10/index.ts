import type { SimPage } from '../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { parallelScene } from './parallel';
import { rotorScene } from './rotor';

const page: SimPage = { chapter: 10, scenes: [rotorScene, parallelScene], i18n: { ko, en } };
export default page;
