// Chapter list (docs/curriculum.md §2). `load` is set once a chapter is implemented.
// `summary` names what the page contains, as a short noun phrase.
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
  c(2, 1, '직선 운동', 'Motion Along a Straight Line', '위치, 속도, 가속도 그래프, 자유낙하', 'Position, velocity, and acceleration graphs; free fall', () => import('./ch02').then((m) => m.default)),
  c(3, 1, '벡터', 'Vectors', '벡터 성분, 벡터 합', 'Vector components, vector sum', () => import('./ch03').then((m) => m.default)),
  c(4, 1, '2차원·3차원 운동', 'Motion in Two and Three Dimensions', '포물선 운동, 등속원운동, 상대운동', 'Projectile, uniform circular, and relative motion', () => import('./ch04').then((m) => m.default)),
  c(5, 1, '힘과 운동 I', 'Force and Motion I', '뉴턴 제1·2법칙, 뉴턴 제3법칙, 관성계', "Newton's first, second, and third laws; inertial frames", () => import('./ch05').then((m) => m.default)),
  c(6, 1, '힘과 운동 II', 'Force and Motion II', '마찰력, 원운동', 'Friction, circular motion', () => import('./ch06').then((m) => m.default)),
  c(7, 1, '운동에너지와 일', 'Kinetic Energy and Work', '일-운동에너지 정리', 'Work-kinetic energy theorem', () => import('./ch07').then((m) => m.default)),
  c(8, 1, '퍼텐셜에너지와 에너지 보존', 'Potential Energy and Conservation of Energy', '경로와 일, 에너지 도표', 'Work and path, energy diagrams', () => import('./ch08').then((m) => m.default)),
  c(9, 1, '질량중심과 선운동량', 'Center of Mass and Linear Momentum', '1차원 충돌, 2차원 충돌', '1D and 2D collisions', () => import('./ch09').then((m) => m.default)),
  c(10, 1, '회전', 'Rotation', '관성모멘트, 평행축 정리', 'Rotational inertia, parallel-axis theorem', () => import('./ch10').then((m) => m.default)),
  c(11, 1, '굴림, 토크, 각운동량', 'Rolling, Torque, and Angular Momentum', '각운동량 보존, 회전의자', 'Angular momentum conservation, spinning chair', () => import('./ch11').then((m) => m.default)),
  c(13, 1, '중력', 'Gravitation', '궤도, 탈출속도', 'Orbits, escape speed', () => import('./ch13').then((m) => m.default)),
  c(14, 1, '유체', 'Fluids', '벤투리관, 연속방정식, 베르누이 원리', "Venturi tube: continuity and Bernoulli's principle", () => import('./ch14').then((m) => m.default)),
  c(15, 1, '진동', 'Oscillations', '단순조화운동, 단진자', 'Simple harmonic motion, simple pendulum', () => import('./ch15').then((m) => m.default)),
  c(16, 1, '파동 I', 'Waves I', '반사파, 정상파, 공명', 'Reflection, standing waves, resonance', () => import('./ch16').then((m) => m.default)),
  c(17, 1, '파동 II', 'Waves II', '맥놀이, 도플러 효과', 'Beats, Doppler effect', () => import('./ch17').then((m) => m.default)),
  c(18, 2, '온도, 열, 열역학 제1법칙', 'Temperature, Heat, and the First Law of Thermodynamics', '열역학 과정, 경로 비교, 순환 과정', 'Thermodynamic processes, path comparison, and cycles', () => import('./ch18').then((m) => m.default)),
  c(19, 2, '기체 운동론', 'The Kinetic Theory of Gases', '분자 충돌과 압력, 속력 분포', 'Molecular collisions, pressure, and speed distribution', () => import('./ch19').then((m) => m.default)),
  c(20, 2, '엔트로피와 열역학 제2법칙', 'Entropy and the Second Law of Thermodynamics', '자유 팽창, 열 흐름, 카르노 순환', 'Free expansion, heat flow, and the Carnot cycle', () => import('./ch20').then((m) => m.default)),
  c(22, 3, '전기장', 'Electric Fields', '점전하, 전기장', 'Point charges, electric field'),
  c(23, 3, '가우스 법칙', "Gauss' Law", '가우스면, 전기 선속', 'Gaussian surfaces, electric flux'),
  c(24, 3, '전위', 'Electric Potential', '등전위선', 'Equipotential lines'),
  c(25, 3, '전기용량', 'Capacitance', '평행판 축전기, 유전체, 전원 연결·분리', 'Parallel-plate capacitor, dielectrics, battery connected or disconnected', () => import('./ch25').then((m) => m.default)),
  c(26, 3, '전류와 저항', 'Current and Resistance', '전자 산란, 드리프트, 비저항', 'Electron scattering, drift, and resistivity', () => import('./ch26').then((m) => m.default)),
  c(27, 3, '회로', 'Circuits', 'RC 충전·방전', 'RC charging and discharging', () => import('./ch27').then((m) => m.default)),
  c(28, 3, '자기장', 'Magnetic Fields', '자기장 속 하전입자, 사이클로트론', 'Charges in a magnetic field, cyclotron', () => import('./ch28').then((m) => m.default)),
  c(29, 3, '전류가 만드는 자기장', 'Magnetic Fields Due to Currents', '비오-사바르 법칙, 앙페르 법칙', "Biot-Savart law, Ampère's law"),
  c(30, 3, '유도와 인덕턴스', 'Induction and Inductance', '패러데이 법칙, 맥스웰 방정식', "Faraday's law, Maxwell's equations"),
  c(31, 3, '전자기 진동과 교류', 'Electromagnetic Oscillations and Alternating Current', 'LC·RLC 자유 진동, 교류 회로', 'Free LC and RLC oscillation, AC circuits', () => import('./ch31').then((m) => m.default)),
  c(32, 3, '맥스웰 방정식, 물질의 자성', "Maxwell's Equations; Magnetism of Matter", '자기 모멘트, 스핀 정렬', 'Magnetic moments, spin alignment'),
  c(33, 3, '전자기파', 'Electromagnetic Waves', '편광, 굴절, 전반사', 'Polarization, refraction, total internal reflection'),
  c(34, 4, '상', 'Images', '렌즈, 거울', 'Lenses, mirrors'),
  c(35, 4, '간섭', 'Interference', '이중슬릿 간섭', 'Double-slit interference'),
  c(36, 4, '회절', 'Diffraction', '단일슬릿 회절', 'Single-slit diffraction'),
  c(37, 5, '상대성 이론', 'Relativity', '시간 팽창, 길이 수축', 'Time dilation, length contraction'),
  c(38, 5, '광자와 물질파', 'Photons and Matter Waves', '파속, 드브로이 파장', 'Wave packets, de Broglie wavelength'),
  c(39, 5, '물질파 심화', 'More About Matter Waves', '퍼텐셜 우물, 에너지 준위', 'Potential wells, energy levels'),
  c(40, 5, '원자', 'All About Atoms', '슈테른-게를라흐 실험', 'Stern-Gerlach experiment'),
  c(41, 5, '고체의 전기 전도', 'Conduction of Electricity in Solids', '에너지 띠, 반도체', 'Energy bands, semiconductors'),
  c(42, 5, '핵물리', 'Nuclear Physics', '방사성 붕괴, 반감기', 'Radioactive decay, half-life', () => import('./ch42').then((m) => m.default)),
];

export const chapterMeta = (ch: number) => CHAPTERS.find((m) => m.ch === ch);
