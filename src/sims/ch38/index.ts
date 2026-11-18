import type { SimPage } from '../../core/types';
import { diffractionScene } from './diffraction';
import enDiff from './i18n.diff.en.json';
import koDiff from './i18n.diff.ko.json';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { wavePacket } from './scene';

const page: SimPage = { chapter: 38, scenes: [wavePacket, diffractionScene], i18n: { ko: { ...ko, ...koDiff }, en: { ...en, ...enDiff } } };
export default page;
