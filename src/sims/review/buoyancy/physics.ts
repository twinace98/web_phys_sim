// Buoyancy: a cube of side a moving vertically in a square tank of fluid. SI units. DOM-free.
// The fluid volume is fixed, so the level rises as the block displaces fluid (finite tank).
// Forces on the block: weight, buoyancy ρ_f V_sub g, linear damping −b v on the submerged part,
// and the normal force of the tank floor when it rests there.

export const GRAV = 9.8; // m/s², Halliday's g (CONST.g), as on every other page
export const P0 = 101.3e3; // Pa, atmospheric pressure at the surface
/** Tank: inner width W (square cross-section W × W), wall height H, fluid depth without the block h0 [m]. */
export const TANK = { W: 0.8, H: 0.7, h0: 0.4 };
/** Damping ratio of small bobbing about the floating equilibrium. */
export const ZETA = 0.05;

export interface Block {
  /** Side [m]. */
  a: number;
  /** Density [kg/m³]. */
  rho: number;
}

export interface Fluid {
  rho: number;
}

export const tankArea = () => TANK.W * TANK.W;
export const fluidVolume = () => tankArea() * TANK.h0;
export const blockArea = (b: Block) => b.a * b.a;
export const blockVolume = (b: Block) => b.a ** 3;
export const blockMass = (b: Block) => b.rho * blockVolume(b);

/**
 * Fluid level L and submerged depth s for the block bottom at height y [m].
 * Fluid volume conservation: A_t L − A_b s = A_t h0, with s = clamp(L − y, 0, a).
 */
export function levelAt(b: Block, y: number): { L: number; s: number } {
  const At = tankArea();
  const Ab = blockArea(b);
  const Vf = fluidVolume();
  if (y >= TANK.h0) return { L: TANK.h0, s: 0 };
  const full = (Vf + Ab * b.a) / At;
  if (full - y >= b.a) return { L: full, s: b.a };
  const L = (Vf - Ab * y) / (At - Ab);
  return { L, s: L - y };
}

/** Gauge pressure ρ_f g d at depth d below the surface (0 above it) [Pa]. */
export const gauge = (f: Fluid, depth: number) => f.rho * GRAV * Math.max(0, depth);

/** Pressures on the top and bottom faces (gauge) and F_b = (p_bot − p_top) A [N]. */
export function faces(b: Block, f: Fluid, y: number): { pTop: number; pBot: number; F: number } {
  const { L } = levelAt(b, y);
  const pTop = gauge(f, L - (y + b.a));
  const pBot = gauge(f, L - y);
  return { pTop, pBot, F: (pBot - pTop) * blockArea(b) };
}

/** Buoyant force ρ_f V_sub g [N]. */
export const buoyancy = (b: Block, f: Fluid, y: number) => f.rho * blockArea(b) * levelAt(b, y).s * GRAV;
export const weight = (b: Block) => blockMass(b) * GRAV;

/**
 * Restoring stiffness of the buoyant force: dF_b/dy = −ρ_f g A_b A_t / (A_t − A_b) while partly
 * submerged (the level drops as the block rises, so the submerged depth changes faster than y).
 */
export const stiffness = (b: Block, f: Fluid) => (f.rho * GRAV * blockArea(b) * tankArea()) / (tankArea() - blockArea(b));

/** Floating equilibrium: submerged depth s = a ρ_obj/ρ_f (if ρ_obj < ρ_f). */
export const floatDepth = (b: Block, f: Fluid) => (b.a * b.rho) / f.rho;

/** Period of small bobbing without damping: T = 2π √(m/k) = 2π √(s_eq (1 − A_b/A_t) / g). */
export const bobPeriod = (b: Block, f: Fluid) => 2 * Math.PI * Math.sqrt((floatDepth(b, f) * (1 - blockArea(b) / tankArea())) / GRAV);

/** Damping coefficient b = 2 ζ √(k m) [kg/s]. */
export const dampCoef = (b: Block, f: Fluid, zeta = ZETA) => 2 * zeta * Math.sqrt(stiffness(b, f) * blockMass(b));

export interface Motion {
  /** Block bottom height [m]. */
  y: number;
  /** Velocity [m/s], up positive. */
  v: number;
}

/**
 * Top of the drawing [m]: 0.86, raised for blocks larger than 0.25 m, so that a very light block
 * released at the floor stays in view while it jumps out of the fluid (tests check the margin).
 */
export const viewTop = (a: number) => 0.86 + 1.75 * Math.max(0, a - 0.25);

/** Highest the block bottom may be dragged to [m]. */
export const yMax = (b: Block) => 0.84 - b.a;

/** Form-drag coefficient of a cube moving face-on. */
export const CD = 1.05;

/**
 * Drag while the block is in the fluid (none in air) [N]: the linear term −b v that damps small
 * bobbing, plus form drag −½ C_d ρ_f A v|v| on the submerged fraction s/a. The quadratic term
 * matters only at speed: it caps how fast a light block rises when released deep (terminal speed
 * √(2(1 − ρ_obj/ρ_f) a g / C_d), at most about 2.7 m/s for a = 0.4 m), so it leaves the surface
 * slowly enough to rise only about a block height into the air and fall back.
 */
export function drag(b: Block, f: Fluid, y: number, v: number, zeta = ZETA, cd = CD): number {
  const { s } = levelAt(b, y);
  if (s <= 0) return 0;
  return -dampCoef(b, f, zeta) * v - 0.5 * cd * f.rho * blockArea(b) * (s / b.a) * v * Math.abs(v);
}

/** Net force without the floor [N]: F_b − F_g + F_d. */
export function freeForce(b: Block, f: Fluid, y: number, v: number, zeta = ZETA, cd = CD): number {
  return buoyancy(b, f, y) - weight(b) + drag(b, f, y, v, zeta, cd);
}

/** Normal force of the floor [N] when the block rests on it, else 0. */
export function normal(b: Block, f: Fluid, m: Motion): number {
  if (m.y > 1e-9) return 0;
  return Math.max(0, weight(b) - buoyancy(b, f, 0));
}

/**
 * One RK4 step of size h. The floor stops the block (inelastic). Above the fluid the block flies
 * under gravity alone and falls back (no ceiling; the drag limits how high it gets).
 */
export function step(b: Block, f: Fluid, m: Motion, h: number, zeta = ZETA, cd = CD): void {
  const M = blockMass(b);
  const acc = (y: number, v: number) => freeForce(b, f, y, v, zeta, cd) / M;
  const k1v = acc(m.y, m.v);
  const k1y = m.v;
  const k2v = acc(m.y + (h / 2) * k1y, m.v + (h / 2) * k1v);
  const k2y = m.v + (h / 2) * k1v;
  const k3v = acc(m.y + (h / 2) * k2y, m.v + (h / 2) * k2v);
  const k3y = m.v + (h / 2) * k2v;
  const k4v = acc(m.y + h * k3y, m.v + h * k3v);
  const k4y = m.v + h * k3v;
  m.y += (h / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
  m.v += (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
  if (m.y <= 0) {
    m.y = 0;
    if (m.v < 0) m.v = 0;
  }
}
