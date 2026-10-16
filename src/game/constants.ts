// ---------------------------------------------------------------------------
// BLOX RUSH — shared tuning constants & types
// A blocky obby-runner. All gameplay happens in "world units" where the
// ground surface sits at y = GROUND_Y and gravity pulls +y.
// ---------------------------------------------------------------------------

export const WORLD = {
  groundY: 420,
  groundH: 160,
  lavaY: 468,
  deathY: 540,
  /** vertical span of the "design" viewport */
  viewH: 540,
  minViewW: 560,
  maxViewW: 1320,
};

export const PHYS = {
  gravity: 2550,
  fallGravity: 3150,
  jumpVel: -900,
  doubleJumpVel: -800,
  cutJump: 0.42,
  coyote: 0.1,
  buffer: 0.14,
  diveVel: 1680,
  maxFall: 1700,
  baseSpeed: 390,
  speedRamp: 10.5,
  maxSpeed: 880,
  nudgeFast: 1.32,
  nudgeSlow: 0.66,
};

export const PLAYER = {
  /** collision box — deliberately slimmer than the art so hits feel fair */
  w: 26,
  h: 52,
  /** rendered height of the 3D character art (head sits above the hitbox) */
  drawH: 72,
};

/** Classic obby rainbow */
export const BRICK_COLORS = [
  '#FF5C5C',
  '#FF9F3D',
  '#FFE14A',
  '#5BE37A',
  '#3FA9FF',
  '#B36BFF',
];

export const PALETTE = {
  skyTop: '#0a2a66',
  skyMid: '#1a74d4',
  skyLow: '#6fc8ff',
  sun: '#fff3b0',
  hillFar: '#2b5fa8',
  hillNear: '#2f8f5b',
  hillNearDark: '#226b44',
  cloud: '#ffffff',
  robux: '#FFD53D',
  robuxDark: '#E0A21A',
  lava: '#ff5d1f',
  lavaHot: '#ffd166',
  steel: '#9fb1c7',
  steelDark: '#5e7286',
  ink: '#0b1220',
};

export type Phase = 'menu' | 'playing' | 'paused' | 'dying' | 'dead' | 'winning' | 'won';

/** finish line — reach this distance to beat the game */
export const GOAL_M = 1000;

/** firework palette: yellow, red, green, blue, purple, orange + rainbow */
export const FIREWORK_COLORS = [
  '#FFE14A',
  '#FF4D4D',
  '#4BE36B',
  '#4FB9FF',
  '#B36BFF',
  '#FF9F3D',
];
export const RAINBOW = ['#FF4D4D', '#FF9F3D', '#FFE14A', '#4BE36B', '#4FB9FF', '#5B6BFF', '#B36BFF'];

export interface Rocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fuse: number;
  color: string;
  rainbow: boolean;
  trail: number;
}

export interface Brick {
  x: number;
  y: number;
  w: number;
  h: number;
  c: string;
  ground: boolean;
  /** thin floating slabs can be jumped through from below */
  oneWay: boolean;
}

export interface Spike {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Saw {
  x: number;
  y: number;
  baseY: number;
  r: number;
  amp: number;
  phase: number;
  spd: number;
  rot: number;
  dead: boolean;
}

export interface Coin {
  x: number;
  y: number;
  t: number;
  taken: boolean;
}

export interface Pit {
  x: number;
  w: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  c: string;
  g: number;
  rot: number;
  vr: number;
  shape: 0 | 1 | 2; // 0 square, 1 circle, 2 ring
  fade: number;
}

export interface Popup {
  x: number;
  y: number;
  vy: number;
  life: number;
  text: string;
  c: string;
  size: number;
}

export interface RunResult {
  score: number;
  coins: number;
  distance: number;
  bestCombo: number;
}
