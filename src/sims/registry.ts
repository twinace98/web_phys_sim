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
  c(2, 1, '직선 운동', 'Motion Along a Straight Line', '위치, 속도, 가속도 그래프', 'Position, velocity, and acceleration graphs', () => import('./ch02').then((m) => m.default)),
  c(3, 1, '벡터', 'Vectors', '벡터 성분, 벡터 합', 'Vector components, vector sum', () => import('./ch03').then((m) => m.default)),
  c(4, 1, '2차원·3차원 운동', 'Motion in Two and Three Dimensions', '포물선 운동', 'Projectile motion'),
  c(5, 1, '힘과 운동 I', 'Force and Motion I', '뉴턴 법칙, 관성계', "Newton's laws, inertial frames"),
  c(6, 1, '힘과 운동 II', 'Force and Motion II', '마찰력, 원운동', 'Friction, circular motion'),
  c(7, 1, '운동에너지와 일', 'Kinetic Energy and Work', '일, 운동에너지', 'Work, kinetic energy'),
  c(8, 1, '퍼텐셜에너지와 에너지 보존', 'Potential Energy and Conservation of Energy', '보존력, 에너지 도표', 'Conservative forces, energy diagrams'),
  c(9, 1, '질량중심과 선운동량', 'Center of Mass and Linear Momentum', '충돌, 운동량 보존', 'Collisions, momentum conservation'),
  c(10, 1, '회전', 'Rotation', '관성모멘트', 'Rotational inertia'),
  c(11, 1, '굴림, 토크, 각운동량', 'Rolling, Torque, and Angular Momentum', '각운동량 보존', 'Angular momentum conservation'),
  c(13, 1, '중력', 'Gravitation', '궤도, 탈출속도', 'Orbits, escape speed'),
  c(14, 1, '유체', 'Fluids', '연속방정식, 베르누이 원리', "Continuity equation, Bernoulli's principle"),
  c(15, 1, '진동', 'Oscillations', '단순조화운동', 'Simple harmonic motion'),
  c(16, 1, '파동 I', 'Waves I', '반사파, 정상파', 'Reflected and standing waves'),
  c(17, 1, '파동 II', 'Waves II', '맥놀이, 도플러 효과', 'Beats, Doppler effect'),
  c(18, 2, '온도, 열, 열역학 제1법칙', 'Temperature, Heat, and the First Law of Thermodynamics', '열, 일, 내부에너지', 'Heat, work, internal energy'),
  c(19, 2, '기체 운동론', 'The Kinetic Theory of Gases', '분자 충돌, 압력', 'Molecular collisions, pressure'),
  c(20, 2, '엔트로피와 열역학 제2법칙', 'Entropy and the Second Law of Thermodynamics', '엔트로피, 미시상태', 'Entropy, microstates'),
  c(22, 3, '전기장', 'Electric Fields', '점전하, 전기장', 'Point charges, electric field'),
  c(23, 3, '가우스 법칙', "Gauss' Law", '가우스면, 전기 선속', 'Gaussian surfaces, electric flux'),
  c(24, 3, '전위', 'Electric Potential', '등전위선', 'Equipotential lines'),
  c(25, 3, '전기용량', 'Capacitance', '평행판 축전기, 유전체', 'Parallel-plate capacitor, dielectrics'),
  c(26, 3, '전류와 저항', 'Current and Resistance', '전자 산란, 비저항', 'Electron scattering, resistivity'),
  c(27, 3, '회로', 'Circuits', 'RC 회로', 'RC circuits'),
  c(28, 3, '자기장', 'Magnetic Fields', '로렌츠 힘, 사이클로트론', 'Lorentz force, cyclotron'),
  c(29, 3, '전류가 만드는 자기장', 'Magnetic Fields Due to Currents', '비오-사바르 법칙, 앙페르 법칙', "Biot-Savart law, Ampère's law"),
  c(30, 3, '유도와 인덕턴스', 'Induction and Inductance', '패러데이 법칙, 맥스웰 방정식', "Faraday's law, Maxwell's equations"),
  c(31, 3, '전자기 진동과 교류', 'Electromagnetic Oscillations and Alternating Current', 'RLC 회로, 위상차', 'RLC circuits, phase'),
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
  c(42, 5, '핵물리', 'Nuclear Physics', '방사성 붕괴, 반감기', 'Radioactive decay, half-life'),
];

export const chapterMeta = (ch: number) => CHAPTERS.find((m) => m.ch === ch);
