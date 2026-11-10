// Chapter list (docs/curriculum.md §2). `load` is set once a chapter is implemented.
import type { SimPage } from '../core/types';

type L = { ko: string; en: string };

export interface ChapterMeta {
  ch: number;
  part: 1 | 2 | 3 | 4 | 5;
  title: L;
  summary: L;
  load?: () => Promise<SimPage>;
}

export const PARTS: Record<ChapterMeta['part'], L> = {
  1: { ko: '역학', en: 'Mechanics' },
  2: { ko: '열역학', en: 'Thermodynamics' },
  3: { ko: '전자기학', en: 'Electromagnetism' },
  4: { ko: '광학', en: 'Optics' },
  5: { ko: '현대물리', en: 'Modern Physics' },
};

const c = (ch: number, part: ChapterMeta['part'], ko: string, en: string, sko: string, sen: string, load?: ChapterMeta['load']): ChapterMeta => ({
  ch,
  part,
  title: { ko, en },
  summary: { ko: sko, en: sen },
  load,
});

export const CHAPTERS: ChapterMeta[] = [
  c(2, 1, '직선 운동', 'Motion Along a Straight Line', '기울기와 넓이로 잇는 x, v, a 그래프', 'Linking x, v, a graphs by slope and area', () => import('./ch02').then((m) => m.default)),
  c(3, 1, '벡터', 'Vectors', '성분 분해와 좌표축 선택', 'Components and the choice of axes'),
  c(4, 1, '2차원·3차원 운동', 'Motion in Two and Three Dimensions', '포물선 운동 = x 등속 + y 등가속', 'Projectile = uniform x + accelerated y'),
  c(5, 1, '힘과 운동 I', 'Force and Motion I', '뉴턴 법칙과 관성계', "Newton's laws and inertial frames"),
  c(6, 1, '힘과 운동 II', 'Force and Motion II', '정지·운동 마찰, 원운동의 알짜힘', 'Static and kinetic friction, net force in circular motion'),
  c(7, 1, '운동에너지와 일', 'Kinetic Energy and Work', '힘-위치 그래프의 넓이와 운동에너지 변화', 'Area under F(x) and the change in kinetic energy'),
  c(8, 1, '퍼텐셜에너지와 에너지 보존', 'Potential Energy and Conservation of Energy', '경로 독립성과 에너지 도표', 'Path independence and energy diagrams'),
  c(9, 1, '질량중심과 선운동량', 'Center of Mass and Linear Momentum', '충돌 전후 운동량 보존', 'Momentum conservation in collisions'),
  c(10, 1, '회전', 'Rotation', '관성모멘트와 축까지의 거리', 'Rotational inertia and distance from the axis'),
  c(11, 1, '굴림, 토크, 각운동량', 'Rolling, Torque, and Angular Momentum', '회전 반경 변화와 각운동량 보존', 'Changing radius and angular momentum conservation'),
  c(13, 1, '중력', 'Gravitation', '초기 위치·속도에 따른 궤도와 탈출', 'Orbits and escape from initial position and velocity'),
  c(14, 1, '유체', 'Fluids', '연속방정식과 베르누이 원리', "Continuity equation and Bernoulli's principle"),
  c(15, 1, '진동', 'Oscillations', '단순조화운동과 등속원운동', 'Simple harmonic motion and uniform circular motion'),
  c(16, 1, '파동 I', 'Waves I', '반사파와 정상파', 'Reflection and standing waves'),
  c(17, 1, '파동 II', 'Waves II', '맥놀이와 도플러 효과', 'Beats and the Doppler effect'),
  c(18, 2, '온도, 열, 열역학 제1법칙', 'Temperature, Heat, and the First Law of Thermodynamics', '열, 일, 내부에너지', 'Heat, work, and internal energy'),
  c(19, 2, '기체 운동론', 'The Kinetic Theory of Gases', '분자 충돌의 합으로서의 압력', 'Pressure as the sum of molecular collisions'),
  c(20, 2, '엔트로피와 열역학 제2법칙', 'Entropy and the Second Law of Thermodynamics', '미시상태 수와 비가역성', 'Microstate counting and irreversibility'),
  c(22, 3, '전기장', 'Electric Fields', '전하 배치와 벡터장', 'Charge arrangements and vector fields'),
  c(23, 3, '가우스 법칙', "Gauss' Law", '닫힌 면의 플럭스와 내부 전하', 'Flux through a closed surface and enclosed charge'),
  c(24, 3, '전위', 'Electric Potential', '등전위선과 전기장', 'Equipotentials and the electric field'),
  c(25, 3, '전기용량', 'Capacitance', '평행판 넓이·간격·유전체', 'Plate area, gap, and dielectrics'),
  c(26, 3, '전류와 저항', 'Current and Resistance', '전자 산란과 저항', 'Electron scattering and resistance'),
  c(27, 3, '회로', 'Circuits', 'RC 충전과 방전', 'RC charging and discharging'),
  c(28, 3, '자기장', 'Magnetic Fields', '로렌츠 힘과 사이클로트론', 'Lorentz force and the cyclotron'),
  c(29, 3, '전류가 만드는 자기장', 'Magnetic Fields Due to Currents', '비오-사바르 법칙과 앙페르 법칙', "Biot-Savart and Ampère's laws"),
  c(30, 3, '유도와 인덕턴스', 'Induction and Inductance', '패러데이·렌츠 법칙과 맥스웰 방정식', "Faraday's and Lenz's laws, Maxwell's equations"),
  c(31, 3, '전자기 진동과 교류', 'Electromagnetic Oscillations and Alternating Current', 'RLC 진동과 위상차', 'RLC oscillations and phase'),
  c(32, 3, '맥스웰 방정식, 물질의 자성', "Maxwell's Equations; Magnetism of Matter", '자성의 기원과 스핀 정렬', 'Origin of magnetism and spin alignment'),
  c(33, 3, '전자기파', 'Electromagnetic Waves', '편광, 굴절, 전반사', 'Polarization, refraction, total internal reflection'),
  c(34, 4, '상', 'Images', '렌즈와 거울의 광선 작도', 'Ray diagrams for lenses and mirrors'),
  c(35, 4, '간섭', 'Interference', '이중슬릿 간섭 무늬', 'Double-slit interference'),
  c(36, 4, '회절', 'Diffraction', '단일슬릿 회절의 원인', 'Why a single slit diffracts'),
  c(37, 5, '상대성 이론', 'Relativity', '두 관측자의 시간 팽창과 길이 수축', 'Time dilation and length contraction for two observers'),
  c(38, 5, '광자와 물질파', 'Photons and Matter Waves', '파속과 드브로이 파장', 'Wave packets and the de Broglie wavelength'),
  c(39, 5, '물질파 심화', 'More About Matter Waves', '1차원 퍼텐셜 우물의 양자화', 'Quantization in 1D potential wells'),
  c(40, 5, '원자', 'All About Atoms', '슈테른-게를라흐 실험', 'Stern-Gerlach experiment'),
  c(41, 5, '고체의 전기 전도', 'Conduction of Electricity in Solids', '띠 간격과 금속·반도체·절연체', 'Band gaps: metals, semiconductors, insulators'),
  c(42, 5, '핵물리', 'Nuclear Physics', '확률적 붕괴와 반감기', 'Random decay and half-life'),
];

export const chapterMeta = (ch: number) => CHAPTERS.find((m) => m.ch === ch);
