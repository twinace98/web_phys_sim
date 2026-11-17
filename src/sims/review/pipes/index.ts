// Addition under review: standing sound waves in pipes (→ Ch 17).
import type { SimPage } from '../../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { pipesScene } from './pipes';

const page: SimPage = { chapter: 109, scenes: [pipesScene], i18n: { ko, en } };
export default page;
