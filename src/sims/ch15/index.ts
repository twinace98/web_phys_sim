import type { SimPage } from '../../core/types';
import en from './i18n.en.json';
import ko from './i18n.ko.json';
import { pendulum } from './pendulum';
import { shm } from './shm';

const page: SimPage = { chapter: 15, scenes: [shm, pendulum], i18n: { ko, en } };
export default page;
