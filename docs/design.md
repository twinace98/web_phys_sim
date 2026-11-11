# 공통 UI·엔진 설계

- 작성일: 2026-11-10
- 상태: 설계 (구현 전)
- 상위 문서: [curriculum.md](curriculum.md) (장별 시뮬레이션 명세)
- 범위: 모든 시뮬레이션이 공유하는 셸 (화면 틀), 코어, 엔진 E0–E7, 시뮬레이션 계약

---

## 0. 설계 원칙

- 화면 최소 표시: 스테이지·그래프에는 물리 대상과 꼭 필요한 라벨·수치만. 설명 문구·모델 가정·축척 안내·경고 문구 없음
- 시뮬레이션 작성자는 물리와 그림만 작성. 버튼·드롭다운·그래프·언어 전환은 셸이 담당
- 물리 계산은 DOM과 분리된 순수 모듈 → Node 단위 테스트로 해석해와 대조
- 모든 장이 같은 화면 틀, 같은 조작, 같은 색 의미 → 한 장에서 익힌 사용법이 전체에 통용
- 수치 오차가 가짜 물리로 보이지 않도록 설계 (보존량 시연에는 심플렉틱 적분기, 테스트로 보장)
- 외부 CDN 없음 → 오프라인·폐쇄망 강의실에서 동작

---

## 1. 기술 스택

| 항목 | 선택 | 근거 |
|---|---|---|
| 언어 | TypeScript (strict) | 파라미터 스키마·시뮬레이션 계약을 타입으로 강제 |
| UI 프레임워크 | 없음 (vanilla TS + 소형 DOM 헬퍼) | 셸 UI가 스키마 자동 생성이라 상태 관리 단순. 의존성·학습 비용 최소 |
| 렌더링 | Canvas 2D, 필요 시 WebGL (E3 2D 파동장) | 2D flat 그림에 충분 |
| 그래프 | 자체 구현 (Canvas 2D) | 접선·넓이·공유 커서 오버레이가 핵심이라 범용 라이브러리 부적합 |
| 수식 | KaTeX (번들 포함) | 정보 패널·축 라벨 HTML 오버레이 |
| 글꼴 | Pretendard (OFL, 번들 포함), 시스템 글꼴 대체 | 한·영 혼용 가독성 |
| 빌드 | Vite, 상대 경로 base (`base: './'`) | 정적 파일 한 폴더 → 어떤 웹서버든 배포 |
| 배포 | 1차 GitHub Pages → 2차 학과 웹서버 | 상대 경로 + 해시 라우트 → 하위 경로·서버 재작성 규칙 없이 같은 빌드 결과물을 두 곳에 사용 |
| CI | GitHub Actions: 테스트 → 빌드 → Pages 배포 (`main` push 시) | 학과 서버는 같은 `dist/` 폴더 복사 |
| 테스트 | Vitest | 물리 모듈 단위 테스트 |
| WASM | 사용 안 함 | 최대 계산량 (입자 약 1000개, 1D 격자 약 1000점) JS로 실시간 처리 가능 |

---

## 2. 화면 구성

### 2.1 데스크톱 (폭 1024 px 이상)

```
┌───────────────────────────────────────────────────────────────────┐
│ ☰  Ch 4 · 2차원 운동    [포물선 운동 | 등속원운동]      KO/EN  ⓘ  🔗 │ 헤더
├────────────────────────────────────────────┬──────────────────────┤
│                                            │ x(t)                 │
│                                            │ ───────────────      │
│              스테이지 (canvas)               │ v_x(t)               │
│                                            │ ───────────────      │
│                                            │ y(t)                 │
│                                            │ ───────────────      │
├────────────────────────────────────────────┤ v_y(t)               │
│ ▶ ⏭ ↺  1×▾  t = 1.23 s │ 프리셋: 지구▾  ⫼   │ ───────────────      │ 조작 바
├────────────────────────────────────────────┴──────────────────────┤
│ v₀ = 20.0 m/s · θ = 45° · 사거리 R = 40.8 m · 최고점 H = 10.2 m     │ 수치 줄
└───────────────────────────────────────────────────────────────────┘
```

- 헤더: 장 메뉴 (☰), 장 제목, 장면 탭, 언어 전환, 정보 패널 (ⓘ), 현재 설정 링크 복사 (🔗)
- 스테이지: 시뮬레이션 그림. 축척 막대는 길이 척도 자체가 학습 내용인 장면만 (Ch 38 등)
- 그래프 열: 시간축 공유, 세로 정렬. 장면당 그래프 최대 4개
- 조작 바: 재생/일시정지, 한 단계, 초기화, 배속, 시뮬레이션 시각, 프리셋, 주 파라미터 1–2개, 상세 설정 (⫼)
- 수치 줄: 핵심 측정값 최대 3개. 구현에서는 조작 바 오른쪽 끝에 배치 (좁은 화면에서는 줄바꿈)
- 배치 2종 (`Scene.layout`): `side` (스테이지 왼쪽, 그래프 오른쪽) / `stack` (위쪽 스테이지 띠, 아래 그래프). 그래프가 주인공인 장면 (Ch 2 등)은 `stack`
- ⫼ 상세 설정 (세로 슬라이더 아이콘): 오른쪽에서 열리는 서랍, 그래프 열을 덮음
- ⓘ 정보 패널: 학습 목표 · 관찰할 점 · 핵심 수식 · 가정과 근사 · 조작 설명 · 단축키
- 사이드 패널 공통 규칙 (설정 서랍, 정보 패널): 같은 틀·머리·본문, 가장자리 드래그로 크기 조절 (넓은 화면: 왼쪽 가장자리 → 너비, 좁은 화면: 위쪽 가장자리 → 높이), 크기 하나를 공유해 브라우저에 저장
- 조작 종류 (`NumberParam.control`)
  - 슬라이더 (`slider`): 연속적으로 바뀔 수 있는 값 (각도, 길이, 속력, 질량, 장의 세기, 진동수, 온도, 비율 등). 오른쪽에 현재 값과 단위, 소수 자릿수는 `step`에 맞춤
  - 스테퍼 (`stepper`): 1씩 바뀌는 정수 개수 (양자수 $n$, 우물 개수 등). − / + 버튼, 범위 끝에서 버튼 비활성
  - 드롭다운 (`select`): 범주·프리셋 (재질, 입자, 동위원소, 모드)과 본래 불연속인 값 묶음 (예: $N$ = 4, 10, 100, 1000)
- 모든 조작: 왼쪽에 짧은 라벨, 마우스를 올리면 한 줄 설명 (`ParamSpec.desc`). 같은 설명을 설정 서랍과 정보 패널 "조작"에도 표시
- 스테이지 패널 (`Scene.overlay`): 스테이지 좌상단의 테두리 있는 TeX 패널. 우하단 모서리 드래그로 패널과 글자를 함께 확대·축소, 스테이지 폭을 넘지 않게 자동 축소, 장면별로 브라우저에 저장

### 2.2 좁은 화면 (폭 768 px 미만)

```
┌──────────────────────────┐
│ ☰ Ch 4 · 2차원 운동  KO ⓘ │
│ [포물선 운동 | 원운동]    │
├──────────────────────────┤
│        스테이지           │
├──────────────────────────┤
│ ▶ ⏭ ↺ 1×▾  t=1.23 s  ⫼  │
├──────────────────────────┤
│ 수치 줄 (가로 스크롤)     │
├──────────────────────────┤
│ 그래프 (세로 스크롤)      │
└──────────────────────────┘
```

- 서랍·정보 패널: 하단 시트로 전환
- 드래그 핸들: 터치 반경 24 px 이상

### 2.3 강의 모드

- 헤더 토글 또는 `F` 키
- 글자 1.3배, 선 굵기 1.5배, 수치 줄 확대, 서랍 숨김
- 프로젝터 대비 고려: 밝은 배경 고정

### 2.4 상호작용 규칙

- 시작 상태: 일시정지, $t = 0$ 초기 상태 표시. 재생 버튼 강조
- 파라미터 변경 규칙
  - `live` 파라미터: 실행 중 즉시 반영 (예: 배속, 표시 토글, 외부 자기장)
  - 구조 파라미터: 변경 시 자동 초기화, 별도 알림 없음 (예: 입자 수, 퍼텐셜 종류)
- 시간 되감기 (scrub): 일시정지 중 그래프 위 마우스 이동 → 공유 커서 이동, 스테이지에 해당 시각 상태 표시
- 그래프 ↔ 스테이지 강조 연동: 그래프 선에 마우스 → 대응 물체·벡터 강조
- 단축키: `Space` 재생/정지, `→` 한 단계, `R` 초기화, `L` 언어, `I` 정보 패널, `F` 강의 모드
- `prefers-reduced-motion`: 자동 애니메이션 없음, 전환 효과 제거

---

## 3. 시각 언어

### 3.1 색의 물리적 의미 (전 장 공통)

- 같은 물리량은 모든 장에서 같은 색 → 색만 보고 양 구분 가능
- 팔레트: Okabe-Ito. 색 외에 선 모양·라벨로도 구분

| 의미 | 색 | 선·표식 |
|---|---|---|
| 위치·변위 $x$, $\vec r$ | 파랑 `#0072B2` | 실선 |
| 속도 $v$, $\vec v$ | 주홍 `#D55E00` | 실선, 화살표 |
| 가속도 $a$, $\vec a$ | 청록 `#009E73` | 실선, 화살표 |
| 힘 $\vec F$ | 자주 `#CC79A7` | 화살표, 알짜힘은 굵게 |
| 운동에너지 $K$ | 하늘 `#56B4E9` | 막대·실선 |
| 퍼텐셜에너지 $U$ | 주황 `#E69F00` | 막대·파선 |
| 총에너지 $E$, 보존량 합 | 전경색 (검정) | 굵은 실선 |
| 양전하 / 음전하 | 주홍 / 파랑 | $+$ / $-$ 기호 병기 |
| 가상면 (가우스면, 앙페르 루프, 경로) | 주황 `#E69F00` | 파선 |
| 장 (전기장·자기장) 화살표 | 회색 계열 | 길이 로그 스케일 |
| 강조 (현재 커서, 선택) | 노랑 `#F0E442` | 채움 배경 전용 (흰 바탕 위 선 사용 금지) |

- 장 (Part) 내부에서 의미가 겹치지 않는 범위에서만 색 재사용 허용
- 다크 모드: 1차 범위 제외 (§ 10 미결)

### 3.2 형태

- 배경 흰색, 그림자·그라데이션·광택 없음
- 선 굵기: 기본 1.5 px, 강조 2.5 px (확대·축소와 무관한 화면 픽셀 기준)
- 화살표: 머리 크기 화면 픽셀 고정, 길이만 물리량에 비례
- 글자: UI는 Pretendard, 수식은 KaTeX. 변수 이탤릭, 단위 로만, 값과 단위 사이 공백

### 3.3 수치 표기

- 기본 유효숫자 3자리. 입력 정밀도 이상 자릿수 표시 금지
- SI 단위, 큰 지수는 접두어 또는 $\times 10^n$
- 축척 과장·모델 가정: 화면 표기 없음. ⓘ 정보 패널에만 한 줄 기재

---

## 4. 시뮬레이션 계약 (Scene API)

- 단위 구조: **장 페이지 (SimPage)** 1개 = **장면 (Scene)** 1개 이상 (= 탭)
- 장면 작성자 구현 항목: 파라미터 스키마, 초기화, 시간 전개, 기록, 그리기, 상호작용, 설명

```ts
// src/core/scene.ts
export interface Scene<P extends Params, S> {
  id: string;                         // 'projectile'
  title: Msg;                         // i18n key
  layout?: 'side' | 'stack';          // stage beside or above the plots
  params: ParamSchema<P>;
  presets?: Preset<P>[];
  world: WorldSpec;                   // visible region in SI units, aspect policy
  time: TimeSpec;                     // physics step h, wall→sim time scale, display unit
  init(p: P, rng: Rng): S;
  step(s: S, h: number, p: P): void;  // advance one fixed step (mutates s)
  record?(s: S, p: P): Record<string, number>;  // channels pushed to history
  snapshot?(s: S): S;                 // enables scrubbing on stage
  draw(g: Draw, s: S, p: P, ui: UiState): void;
  overlay?(s: S, p: P): string;      // TeX for the resizable stage panel
  plots?: PlotSpec[];
  readouts?: ReadoutSpec<S, P>[];
  handles?: Handle<S, P>[];           // draggable objects
  info: InfoSpec;                     // goals, things to observe, equations, assumptions
}

export interface SimPage {
  id: string;                         // 'ch04'
  chapter: number;
  title: Msg;
  scenes: Scene<any, any>[];
  related: number[];                  // linked chapters (curriculum.md §4)
}
```

### 4.1 파라미터 스키마

```ts
type ParamSpec =
  | { kind: 'select'; options: { value: string; label: Msg }[]; default: string }
  | { kind: 'number'; default: number; unit?: string;
      control: 'select' | 'slider' | 'stepper';
      choices?: number[];             // for control: 'select'
      min?: number; max?: number; step?: number }
  | { kind: 'toggle'; default: boolean };

interface ParamMeta {
  label: Msg;
  desc?: Msg;                         // one line: tooltip, drawer, info panel
  group: 'main' | 'advanced';         // main → control bar (max 2), advanced → drawer
  live: boolean;                      // false → change triggers reset
  visibleIf?: (p: Params) => boolean;
}
```

- 셸이 스키마로 컨트롤 자동 생성 → 장면 코드에 DOM 코드 없음
- 프리셋: 파라미터 묶음 + 이름. 조작 바 첫 드롭다운
- 원칙: `main`은 장면당 2개 이하, 나머지는 서랍

### 4.2 상호작용 핸들

```ts
interface Handle<S, P> {
  pos(s: S, p: P): Vec2;              // world coords
  radiusPx: number;                   // hit radius, ≥ 24 on touch
  cursor?: 'move' | 'grab' | 'crosshair';
  onDrag(s: S, p: P, w: Vec2, phase: 'start' | 'move' | 'end'): void;
  enabledWhen?: 'paused' | 'always';
}
```

- 예: 전하 위치, 초기 속도 벡터 끝, 가우스면 꼭짓점, 렌즈 앞 물체
- 포인터 이벤트 통합 (마우스·터치·펜)

---

## 5. 코어 (src/core)

### 5.1 시간 루프

```
frame(now):
  wallDt = min(now - last, 0.1 s)              // tab switch guard
  acc  += wallDt * speed * time.scale          // wall → sim seconds
  while acc >= h:
    scene.step(state, h, params); t += h; acc -= h
    every k steps: history.push(scene.record(state)), snapshot ring push
  draw(state)                                  // once per animation frame
```

- 물리 스텝 고정 (`h`), 그리기는 화면 주사율. 배속 변경이 물리 결과를 바꾸지 않음
- `time.scale`: 장면별 실제 시간 ↔ 표시 시간 환산 (예: Ch 42 $^{238}\text{U}$ → 1 s = $10^9$ 년)
- 탭 숨김 시 자동 정지
- 한 단계 (`⏭`): 기록 간격 1회만큼 전진

### 5.2 기록 (History)

- 채널별 `Float64Array` 고리 버퍼, 기본 용량 10⁴ 샘플
- 용량 초과 시 오래된 절반을 2:1 솎아냄 → 긴 실행에서도 전체 구간 유지
- `snapshot` 지원 장면: 상태 사본 고리 버퍼 → 되감기 시 스테이지 복원

### 5.3 난수

- 시드 고정 PRNG (mulberry32 또는 xoshiro128)
- 초기화 시 같은 시드 → 같은 결과 재현. 서랍에 "새 시드" 버튼
- 링크 복사 시 시드 포함 → 강의 중 같은 실행 재현

### 5.4 좌표·뷰포트

- 내부 SI 단위, 세계 좌표 y 위쪽 양수
- `Viewport`: 세계 ↔ 화면 변환, DPR 반영, 종횡비 정책 (`fit` / `fill` / `fixed-x`)
- 확대·이동: 장면이 허용한 경우만 (예: Ch 13 궤도)

### 5.5 라우팅·공유

- 해시 라우트: `#/ch/04?scene=projectile&preset=moon&lang=en&v0=25`
- 기본값과 다른 파라미터만 URL에 기록 → 🔗 버튼으로 복사
- 홈: Part별 장 목록 (카드 대신 목록, 장 번호 + 제목 + 한 줄 요약)

### 5.6 i18n

- `Msg` = 문자열 키. `t(key, vars)` 치환
- 파일: 공통 `src/i18n/{ko,en}.json` + 장별 `src/sims/chNN/i18n.{ko,en}.json`
- 누락 키: 개발 모드 경고, 배포 시 다른 언어로 대체
- 용어집 `src/i18n/glossary.md`: 장 사이 용어 일관성 (알짜힘 / net force, 관성계 / inertial frame 등)
- 수식·기호·단위: 언어 무관 공통
- 언어 전환 시 상태 유지 (재초기화 없음)

---

## 6. 그리기·그래프 (E0)

### 6.1 Draw API

```ts
interface Draw {
  line(a: Vec2, b: Vec2, st?: Stroke): void;
  polyline(pts: Vec2[], st?: Stroke): void;
  arrow(from: Vec2, vec: Vec2, st: ArrowStyle & { label?: string }): void;
  circle(c: Vec2, r: number, st?: Fill & Stroke): void;
  rect(...); text(p: Vec2, s: string, st?: TextStyle): void;
  field(grid: FieldGrid, st: FieldStyle): void;      // E2
  image(buf: ImageData, region: Rect): void;          // E3 heatmaps
  scaleBar(): void;
}
```

- 좌표는 세계 단위, 선 굵기·글자·화살촉은 화면 픽셀 단위
- 스타일은 §3 의미 토큰으로 지정 (`'velocity'`, `'force'`, `'energyK'` ...) → 색 직접 지정 지양

### 6.2 그래프

```ts
interface PlotSpec {
  id: string;
  x: 'time' | string;                 // time axis or another channel (phase space, F(x))
  y: { channel: string; role: SemanticRole; label: string }[];
  yRange?: 'auto' | [number, number];
  overlays?: ('cursor' | 'tangent' | 'area' | 'marker' | 'reference')[];
}
```

- 공유 시간 커서: 장면 내 모든 시간축 그래프 동기
- `tangent`: 커서 시각 접선 + 기울기 값 → 연결된 그래프에 대응 점 표시 (Ch 2, 30, 31)
- `area`: 구간 넓이 음영, 부호별 색 → 누적값을 연결된 그래프에 막대로 표시 (Ch 2, 7, 18)
- 축 범위 자동: 히스테리시스 적용 → 실행 중 축 떨림 방지
- 축 라벨: HTML 오버레이 KaTeX

---

## 7. 엔진 (src/engines)

### E1 운동 적분기 (`motion/`)

- 적분기: RK4 (일반), velocity Verlet (보존계), 적응 RK45 (Ch 13 근일점 근처)
- 보존량 시연 장면 (Ch 8, 9, 11, 13, 15): 심플렉틱 적분기 필수
- 강체 2D: 질량중심 + 회전각, 관성모멘트 유틸 (고리·원판·막대·점질량 합, 평행축)
- 충돌: 1D/2D 원판, 반발계수 $e$
- 유틸: 자유물체도 힘 목록 → 알짜힘·성분 분해 (Ch 5, 6)

### E2 2D 장 렌더러 (`field/`)

- 원천: 점전하 ($1/r^2$, Ch 22, 24), 선전하·선전류 ($1/r$, Ch 23, 29)
- 계산: 격자 샘플링 $\vec E$, $V$ / $\vec B$. 원천 변경 시에만 재계산
- 장선: 원천 주변 시드 (개수 $\propto \lvert q\rvert$), RK4 유선 추적
- 등전위선: marching squares
- 적분: 다각형 경로 위 $\oint E_n\,dl$, $\oint \vec B\cdot d\vec l$ (적응 분할)
- 특이점: 화면 반경 이내 연화 처리. 가상면 꼭짓점이 원천 위에 놓이지 않도록 스냅 (경고 문구 없음)

### E3 파동 렌더러 (`wave/`)

- 1D 줄: 해석적 중첩 (입사 + 반사, Ch 16 펄스·연속파), 유한차분 파동방정식 (공명 스윕)
- 2D 점원 중첩: 진폭 $\propto r^{-1/2}$, 저해상도 격자 계산 후 확대 표시. 무거우면 WebGL 셰이더
- 스크린: 시간평균 세기 해석식 + 누적 애니메이션
- 입자 하나씩 기록 모드: 세기 분포에서 표본 추출 (Ch 35, 38)
- 오디오: Web Audio 출력 (Ch 17, 기본 꺼짐)

### E4 1D 슈뢰딩거 솔버 (`quantum/`)

- 표시 단위: nm, eV. 내부 무차원화
- 고유상태: 3점 유한차분 해밀토니안 (대칭 삼중대각), Sturm 이분법 + 역반복 → 낮은 $n$개 상태
- 시간전개: Crank-Nicolson (복소 삼중대각, Thomas 알고리즘) → 노름 보존
- 퍼텐셜 생성기: 무한·유한·조화·이중·$N$중 우물 (Ch 39, 41)
- 검증: 무한 우물 $E_n$, 조화 $E_n$ 해석해 대조

### E5 다입자·확률 (`stochastic/`)

- 강체원판: 공간 해시 충돌 검사, 벽 충격량 누적 (Ch 19)
- 무작위 산란: 지수분포 자유시간 (Ch 26)
- 몬테카를로: 격자 스핀 메트로폴리스 갱신 (Ch 32, 수식 비노출)
- 독립 확률 사건: 붕괴·측정 결과 표본 (Ch 40, 42)
- 유틸: 히스토그램, 이론 분포 중첩, 시드 PRNG (§5.3)

### E6 회로 (`circuit/`)

- 일반 회로 해석기 없음. 고정 토폴로지 (RC, LC, RLC 직렬) ODE → E1 적분기 재사용
- 위상자 유틸: 복소 임피던스, 회전 위상자 → 순간값 투영
- 회로도 그리기: 소자 기호 몇 개의 고정 배치 템플릿

### E7 광선 추적 (`ray/`)

- 광선-선분 교차, 반사, 스넬 굴절, 전반사 판정, 프레넬 계수 (세기 → 선 굵기)
- 얇은 렌즈·구면거울: 근축 요소, 주요 광선 3개 자동 작도
- 편광: 존스 벡터 (선편광자 연쇄, Ch 33)

---

## 8. 물리 충실도 규칙

- 보존량 시연: 표시 유효숫자 범위에서 보존. 단위 테스트로 보장
- 과장·축척·차원 축소 (2D 모델)·근사 (작은 각, 비점성, 근축, 이상기체): 스테이지·그래프 표기 없음. ⓘ 패널 "가정과 근사"에만 한 줄씩 기재
- 수치 불안정 영역 (특이점 근접, 큰 시간 스텝): 경고 문구 대신 입력 범위 제한
- 테스트 예시
  - Ch 4: 사거리 $R = v_0^2\sin 2\theta/g$, 상대오차 < $10^{-6}$
  - Ch 13: 타원 궤도 100주기 후 $\Delta E/E$ < $10^{-6}$
  - Ch 15: 주기 $2\pi\sqrt{m/k}$, 진폭 무관
  - Ch 23: 원 경로 플럭스 = $\lambda_\text{enc}/\varepsilon_0$, 상대오차 < $10^{-3}$
  - Ch 39: 무한 우물 $E_1$–$E_5$ 해석해 대조, 격자 수렴

---

## 9. 디렉터리 구조

```
web_phys_sim/
├─ docs/                 curriculum.md, design.md
├─ src/
│  ├─ shell/             header, control bar, drawer, info panel, router, home
│  ├─ core/              loop, history, rng, viewport, params, format, scene types
│  ├─ draw/              canvas wrapper, semantic styles, arrows, theme tokens
│  ├─ plot/              time-series plots, overlays (cursor, tangent, area)
│  ├─ engines/           motion, field, wave, quantum, stochastic, circuit, ray
│  ├─ sims/
│  │  └─ ch02/
│  │     ├─ index.ts             SimPage
│  │     ├─ slope.scene.ts       Scene (draw, handles, plots)
│  │     ├─ physics.ts           pure physics, unit-tested
│  │     └─ i18n.{ko,en}.json
│  └─ i18n/              ko.json, en.json, glossary.md
├─ tests/                physics tests per engine and chapter
└─ public/fonts/         Pretendard, KaTeX fonts
```

---

## 10. 제작 순서 (마일스톤)

| 단계 | 내용 | 대상 장 | 검증 항목 |
|---|---|---|---|
| M0 | 셸, 코어, E0 그래프, Ch 2 시제품 | 2 | 레이아웃, 공유 커서, 접선·넓이 오버레이, 되감기, i18n |
| M1 | E1 | 4–11, 13, 15, 28 | 적분기 보존성, 핸들 드래그 |
| M2 | E2 | 22–24, 29, 30 | 장 재계산 성능, 선적분 정확도 |
| M3 | E3 | 16, 17, 35, 36 | 2D 파동장 프레임률 |
| M4 | E5 | 19, 20, 26, 32, 40, 42 | 입자 1000개 60 fps |
| M5 | E4 | 38, 39, 41 | 고유값 정확도, 노름 보존 |
| M6 | E6, E7, 전용 모듈 | 3, 14, 18, 25, 27, 31, 33, 34, 37 | 해석해 대조 |

- M0이 셸·그래프 설계 검증 단계 → 이후 장은 계약에 맞춰 병렬 작성 가능

---

## 11. 미결 사항

- 강의 모드 필요 범위 (현재 설계 포함)
- 다크 모드 지원 여부 (Okabe-Ito 파랑 `#0072B2`는 검은 바탕 대비 부족 → 별도 변형 필요)
- 학습 활동 (예측 후 확인 질문) 포함 여부
- Pretendard 번들 포함 (파일 크기 약 2 MB, 부분 글꼴로 축소 가능)
