// Addition under review → Ch 38: the photoelectric effect (docs/curriculum.md §6.1).
import type { SimPage } from '../../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { photoelectric } from './scene';

const page: SimPage = { chapter: 101, scenes: [photoelectric], i18n: { ko, en } };
export default page;
