// Review page 103 (→ Ch 39): potential well, transitions between two levels.
import type { SimPage } from '../../../core/types';
import hen from '../hydrogen/i18n.en.json';
import hko from '../hydrogen/i18n.ko.json';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { welljump } from './scene';

// Region names (X-ray, UV, IR) come from the hydrogen page's dictionary.
const regions = (d: Record<string, string>) => Object.fromEntries(Object.entries(d).filter(([k]) => k.startsWith('hyd.region.')));

const page: SimPage = { chapter: 103, scenes: [welljump], i18n: { ko: { ...regions(hko), ...ko }, en: { ...regions(hen), ...en } } };
export default page;
