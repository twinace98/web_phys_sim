import type { SimPage } from '../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { deBroglieScene, wavePacket } from './scene';

const page: SimPage = { chapter: 38, scenes: [wavePacket, deBroglieScene], i18n: { ko, en } };
export default page;
