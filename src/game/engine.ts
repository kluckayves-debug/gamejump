import {
  BRICK_COLORS,
  FIREWORK_COLORS,
  GOAL_M,
  PALETTE,
  PHYS,
  PLAYER,
  RAINBOW,
  WORLD,
  type Rocket,
  type Brick,
  type Coin,
  type Particle,
  type Phase,
  type Pit,
  type Popup,
  type RunResult,
  type Saw,
  type Spike,
} from './constants';
import { sfx } from './audio';
import { basePose, hero, type HeroPose } from './hero';

// ---------------------------------------------------------------- helpers --
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));

const shadeCache = new Map<string, string>();
function mix(hex: string, amt: number): string {
  const key = hex + amt;
  const hit = shadeCache.get(key);
  if (hit) return hit;
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amt > 0) {
    r += (255 - r) * amt;
    g += (255 - g) * amt;
    b += (255 - b) * amt;
  } else {
    r *= 1 + amt;
    g *= 1 + amt;
    b *= 1 + amt;
  }
  const out = `rgb(${r | 0},${g | 0},${b | 0})`;
  shadeCache.set(key, out);
  return out;
}

export interface EngineHooks {
  onGameOver: (r: RunResult) => void;
  onWin: (r: RunResult) => void;
  onPhase: (p: Phase) => void;
}

interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  jumps: number;
  coyote: number;
  buffer: number;
  diving: boolean;
  diveFrom: number;
  sx: number;
  sy: number;
  runT: number;
  rot: number;
  /** extra tumble rotation (double jump flip / death spin) */
  spin: number;
  spinVel: number;
  fade: number;
  alive: boolean;
}

const FIXED = 1 / 60;
const TILE = 60;

export class Engine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private hooks: EngineHooks;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = true;

  phase: Phase = 'menu';

  // view
  private dpr = 1;
  private cssW = 800;
  private cssH = 450;
  private scale = 1;
  private viewW = 960;
  private viewH = 540;
  private camX = 0;
  private camY = 0;
  private anchorX = 200;
  private skyGrad: CanvasGradient | null = null;

  // world
  private bricks: Brick[] = [];
  private spikes: Spike[] = [];
  private saws: Saw[] = [];
  private coins: Coin[] = [];
  private pits: Pit[] = [];
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private genX = 0;
  private lastChunk = -1;
  /** menu backdrop: safe flat terrain so the hero can jog forever */
  private menuScene = false;
  private menuHopT = 1.2;

  // run state
  private p: PlayerState = this.makePlayer(0);
  private speed = PHYS.baseSpeed;
  private elapsed = 0;
  private startX = 0;
  score = 0;
  coinsGot = 0;
  dist = 0;
  private combo = 0;
  private comboTimer = 0;
  private bestCombo = 1;
  private nextMilestone = 250;

  // feel
  private trauma = 0;
  private shakeX = 0;
  private shakeY = 0;
  private freeze = 0;
  private timeScale = 1;
  private flash = 0;
  private flashColor = '255,255,255';
  private banner = '';
  private bannerT = 0;
  private deathT = 0;
  private winT = 0;
  private rockets: Rocket[] = [];
  private fwTimer = 0;
  private goalX = 0;
  private t = 0;
  private scoreShown = 0;
  private scorePulse = 0;
  private coinPulse = 0;

  // input
  private nudge = 0;
  private holdJump = false;
  private hintT = 0;
  private hintUsed = false;
  /** set by the host so the on-screen hint matches the device */
  touch = false;

  constructor(canvas: HTMLCanvasElement, hooks: EngineHooks) {
    this.canvas = canvas;
    this.hooks = hooks;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    hero.load();
    this.resize();
    this.reset(true);
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------- lifecycle --
  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  resize() {
    const parent = this.canvas.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;
    this.cssW = Math.max(240, w);
    this.cssH = Math.max(200, h);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    let scale = this.cssH / WORLD.viewH;
    let vw = this.cssW / scale;
    if (vw < WORLD.minViewW) scale = this.cssW / WORLD.minViewW;
    else if (vw > WORLD.maxViewW) scale = this.cssW / WORLD.maxViewW;
    this.scale = scale;
    vw = this.cssW / scale;
    this.viewW = vw;
    this.viewH = this.cssH / scale;
    this.camY = WORLD.viewH + 30 - this.viewH;
    this.anchorX = clamp(this.viewW * 0.27, 110, 300);
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    const g = this.ctx.createLinearGradient(0, this.camY, 0, this.camY + this.viewH);
    g.addColorStop(0, PALETTE.skyTop);
    g.addColorStop(0.45, PALETTE.skyMid);
    g.addColorStop(1, PALETTE.skyLow);
    this.skyGrad = g;
  }

  private makePlayer(x: number): PlayerState {
    return {
      x,
      y: WORLD.groundY - PLAYER.h,
      vx: PHYS.baseSpeed,
      vy: 0,
      grounded: true,
      jumps: 0,
      coyote: 0,
      buffer: 0,
      diving: false,
      diveFrom: 0,
      sx: 1,
      sy: 1,
      runT: 0,
      rot: 0,
      spin: 0,
      spinVel: 0,
      fade: 1,
      alive: true,
    };
  }

  reset(menu = false) {
    this.menuScene = menu;
    this.menuHopT = 1.1;
    this.bricks.length = 0;
    this.spikes.length = 0;
    this.saws.length = 0;
    this.coins.length = 0;
    this.pits.length = 0;
    this.particles.length = 0;
    this.popups.length = 0;
    this.camX = 0;
    this.genX = -400;
    this.lastChunk = -1;
    this.addGround(-400, 1500);
    this.genX = 1100;
    this.addCoinLine(420, 980, WORLD.groundY - 78);
    this.generate();
    this.p = this.makePlayer(this.anchorX);
    this.startX = this.p.x;
    this.goalX = this.startX + GOAL_M * 50;
    this.rockets.length = 0;
    this.fwTimer = 0;
    this.winT = 0;
    this.speed = PHYS.baseSpeed;
    this.elapsed = 0;
    this.score = 0;
    this.scoreShown = 0;
    this.coinsGot = 0;
    this.dist = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.bestCombo = 1;
    this.nextMilestone = 250;
    this.trauma = 0;
    this.freeze = 0;
    this.timeScale = 1;
    this.flash = 0;
    this.banner = '';
    this.bannerT = 0;
    this.deathT = 0;
    this.nudge = 0;
    this.holdJump = false;
    this.hintT = menu ? 0 : 1;
    this.hintUsed = false;
    this.setPhase(menu ? 'menu' : 'playing');
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.hooks.onPhase(p);
  }

  startRun() {
    this.reset(false);
    this.banner = 'GO!';
    this.bannerT = 1;
    sfx.ui();
  }

  pause() {
    if (this.phase === 'playing') {
      this.setPhase('paused');
      sfx.ui();
    }
  }

  resume() {
    if (this.phase === 'paused') {
      this.last = performance.now();
      this.acc = 0;
      this.setPhase('playing');
      sfx.ui();
    }
  }

  togglePause() {
    if (this.phase === 'playing') this.pause();
    else if (this.phase === 'paused') this.resume();
  }

  toMenu() {
    this.reset(true);
  }

  // ---------------------------------------------------------------- input --
  pressJump() {
    this.holdJump = true;
    if (this.phase !== 'playing') return;
    this.p.buffer = PHYS.buffer;
    this.hintUsed = true;
  }

  releaseJump() {
    this.holdJump = false;
    if (this.phase !== 'playing') return;
    if (this.p.vy < -240) this.p.vy *= PHYS.cutJump;
  }

  pressDive() {
    if (this.phase !== 'playing') return;
    const p = this.p;
    if (!p.grounded && !p.diving) {
      p.diving = true;
      p.diveFrom = p.y;
      p.vy = Math.max(p.vy, PHYS.diveVel);
      p.sx = 0.76;
      p.sy = 1.3;
      sfx.jump();
      for (let i = 0; i < 8; i++) {
        this.spawnParticle(
          p.x + PLAYER.w / 2,
          p.y + PLAYER.h,
          rand(-90, 90),
          rand(-180, -40),
          0.3,
          rand(3, 6),
          '#bfe8ff',
          600,
          1,
        );
      }
    }
  }

  setNudge(n: number) {
    this.nudge = n;
  }

  /** Screen-space tap → true when it landed on the HUD pause button. */
  hitPauseButton(cssX: number, cssY: number) {
    const x = cssX / this.scale;
    const y = cssY / this.scale;
    // button body is drawn at (viewW-54, 52) sized 38x34 — generous touch pad
    return x > this.viewW - 70 && x < this.viewW - 2 && y > 38 && y < 102;
  }

  // ------------------------------------------------------------ generation --
  private addGround(x: number, w: number) {
    this.bricks.push({ x, y: WORLD.groundY, w, h: WORLD.groundH, c: '', ground: true, oneWay: false });
  }

  private addPlatform(x: number, y: number, w: number, h = 26) {
    const c = BRICK_COLORS[Math.floor(Math.abs(x) / 97) % BRICK_COLORS.length];
    this.bricks.push({ x, y, w, h, c, ground: false, oneWay: h <= 40 });
  }

  private addSpikes(x: number, n: number, y = WORLD.groundY) {
    for (let i = 0; i < n; i++) this.spikes.push({ x: x + i * 26, y, w: 26, h: 26 });
  }

  private addSaw(x: number, y: number, amp = 0, r = 28) {
    this.saws.push({
      x,
      y,
      baseY: y,
      r,
      amp,
      phase: Math.random() * 6.28,
      spd: rand(1.1, 1.8),
      rot: 0,
      dead: false,
    });
  }

  private addCoinLine(x0: number, x1: number, y: number) {
    const n = Math.max(1, Math.round((x1 - x0) / 46));
    for (let i = 0; i < n; i++) {
      this.coins.push({ x: x0 + i * 46, y, t: Math.random() * 6.28, taken: false });
    }
  }

  private addCoinArc(x0: number, x1: number, peak: number, baseY = WORLD.groundY - 72) {
    const n = Math.max(2, Math.round((x1 - x0) / 46));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.coins.push({
        x: x0 + (x1 - x0) * t,
        y: baseY - Math.sin(Math.PI * t) * peak,
        t: Math.random() * 6.28,
        taken: false,
      });
    }
  }

  private get diff() {
    return clamp((this.speed - PHYS.baseSpeed) / (PHYS.maxSpeed - PHYS.baseSpeed), 0, 1);
  }

  private generate() {
    const limit = this.camX + this.viewW + 900;
    let guard = 0;
    while (this.genX < limit && guard++ < 40) this.chunk();
  }

  private chunk() {
    if (this.menuScene) {
      const len = rand(380, 520);
      this.addGround(this.genX, len);
      this.addCoinLine(this.genX + 70, this.genX + len - 70, WORLD.groundY - 96);
      this.genX += len;
      return;
    }
    // keep the approach to the finish line clean so the win feels earned
    if (this.genX > this.goalX - 620) {
      const len = rand(340, 440);
      this.addGround(this.genX, len);
      if (this.genX + len < this.goalX - 60) this.addCoinLine(this.genX + 50, this.genX + len - 50, WORLD.groundY - 80);
      this.genX += len;
      return;
    }
    const d = this.diff;
    const weights: Array<[number, number]> = [
      [0, 20], // flat
      [1, 18 + d * 16], // gap
      [2, 10 + d * 16], // islands
      [3, 16 + d * 8], // sky platforms
      [4, d > 0.08 ? 12 + d * 16 : 0], // saws
      [5, d > 0.2 ? 10 + d * 12 : 0], // stairs
    ];
    let total = 0;
    for (const w of weights) total += w[1];
    let r = Math.random() * total;
    let pick = 0;
    for (const [id, w] of weights) {
      r -= w;
      if (r <= 0) {
        pick = id;
        break;
      }
    }
    if (pick === this.lastChunk && Math.random() < 0.6) pick = 0;
    this.lastChunk = pick;
    const g = WORLD.groundY;

    switch (pick) {
      case 1: {
        // --- lava gap -------------------------------------------------
        const pre = rand(170, 260);
        this.addGround(this.genX, pre);
        this.genX += pre;
        const gap = rand(140, 180) + d * 130;
        this.pits.push({ x: this.genX, w: gap });
        this.addCoinArc(this.genX + 20, this.genX + gap - 20, 90 + d * 30);
        this.genX += gap;
        const post = rand(230, 340);
        this.addGround(this.genX, post);
        this.genX += post;
        break;
      }
      case 2: {
        // --- floating islands over lava --------------------------------
        const n = randInt(2, 3);
        const first = rand(130, 190);
        this.addGround(this.genX, first);
        this.genX += first;
        for (let i = 0; i < n; i++) {
          const gap = rand(125, 160) + d * 85;
          this.pits.push({ x: this.genX, w: gap });
          this.genX += gap;
          const iw = rand(130, 190);
          const lift = i % 2 === 0 ? rand(40, 90) : 0;
          if (lift > 0) {
            this.addPlatform(this.genX, g - lift, iw, 28);
            this.pits.push({ x: this.genX, w: iw });
            this.addCoinLine(this.genX + 22, this.genX + iw - 10, g - lift - 60);
          } else {
            this.addGround(this.genX, iw);
            this.addCoinLine(this.genX + 22, this.genX + iw - 10, g - 70);
          }
          this.genX += iw;
        }
        const tail = rand(200, 300);
        this.addGround(this.genX, tail);
        this.genX += tail;
        break;
      }
      case 3: {
        // --- sky platforms with hazards below ---------------------------
        const len = rand(520, 700);
        this.addGround(this.genX, len);
        const n = randInt(2, 3);
        let px = this.genX + 70;
        for (let i = 0; i < n; i++) {
          const pw = rand(110, 165);
          const py = g - rand(118, 172) - (i % 2) * 50;
          this.addPlatform(px, py, pw);
          this.addCoinLine(px + 20, px + pw - 10, py - 54);
          if (d > 0.12 && Math.random() < 0.55) this.addSpikes(px + rand(20, 60), randInt(1, 2));
          px += pw + rand(110, 150);
          if (px > this.genX + len - 120) break;
        }
        this.genX += len;
        break;
      }
      case 4: {
        // --- buzz saws ---------------------------------------------------
        const len = rand(470, 630);
        this.addGround(this.genX, len);
        const n = d > 0.45 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const sx = this.genX + 150 + i * rand(200, 265);
          if (Math.random() < 0.45) {
            // hangs high enough to always sprint underneath — don't jump!
            const base = rand(152, 208);
            this.addSaw(sx, g - base, rand(14, 30));
            this.addCoinLine(sx - 60, sx + 60, g - 34);
          } else {
            // sits on the path — hop it (the coin arc shows the line)
            this.addSaw(sx, g - 26, 0);
            this.addCoinArc(sx - 100, sx + 100, 112);
          }
        }
        this.genX += len;
        break;
      }
      case 5: {
        // --- stairway ----------------------------------------------------
        const steps = randInt(2, 3);
        const sw = rand(98, 122);
        const base = this.genX;
        const runW = 150 + steps * sw + 150;
        this.addGround(base, runW);
        let sxp = base + 150;
        for (let i = 1; i <= steps; i++) {
          const h = i * 50;
          this.addPlatform(sxp, g - h, sw, h + 24);
          this.addCoinLine(sxp + 26, sxp + sw - 18, g - h - 56);
          sxp += sw;
        }
        this.genX = base + runW;
        const drop = rand(150, 190) + d * 80;
        this.pits.push({ x: this.genX, w: drop });
        this.addCoinArc(this.genX, this.genX + drop, 60);
        this.genX += drop;
        this.addGround(this.genX, 280);
        this.genX += 280;
        break;
      }
      default: {
        // --- flat run ------------------------------------------------------
        const len = rand(360, 520);
        this.addGround(this.genX, len);
        if (d > 0.1 && Math.random() < 0.6 + d * 0.3) {
          const n = randInt(1, d > 0.5 ? 3 : 2);
          const sx = this.genX + len * 0.45;
          this.addSpikes(sx, n);
          this.addCoinArc(sx - 110, sx + n * 26 + 110, 120);
        } else {
          this.addCoinLine(this.genX + 60, this.genX + len - 60, g - 76);
        }
        this.genX += len;
      }
    }
  }

  private cull() {
    const left = this.camX - 320;
    while (this.bricks.length && this.bricks[0].x + this.bricks[0].w < left) this.bricks.shift();
    while (this.spikes.length && this.spikes[0].x + 26 < left) this.spikes.shift();
    while (this.coins.length && this.coins[0].x + 30 < left) this.coins.shift();
    while (this.pits.length && this.pits[0].x + this.pits[0].w < left) this.pits.shift();
    while (this.saws.length && this.saws[0].x + 60 < left) this.saws.shift();
  }

  // --------------------------------------------------------------- effects --
  private spawnParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    c: string,
    g = 1400,
    shape: 0 | 1 | 2 = 0,
  ) {
    if (this.particles.length > 700) return;
    this.particles.push({
      x,
      y,
      vx,
      vy,
      life,
      max: life,
      size,
      c,
      g,
      rot: Math.random() * 6.28,
      vr: rand(-12, 12),
      shape,
      fade: 1,
    });
  }

  private burst(x: number, y: number, n: number, colors: string[], power = 300, shape: 0 | 1 | 2 = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(0.3, 1) * power;
      this.spawnParticle(
        x,
        y,
        Math.cos(a) * s,
        Math.sin(a) * s - 60,
        rand(0.3, 0.75),
        rand(3, 8),
        colors[randInt(0, colors.length - 1)],
        1500,
        shape,
      );
    }
  }

  private popup(x: number, y: number, text: string, c = '#fff', size = 22) {
    this.popups.push({ x, y, vy: -90, life: 0.9, text, c, size });
  }

  private shake(v: number) {
    this.trauma = clamp(this.trauma + v, 0, 1);
  }

  // ----------------------------------------------------------------- loop --
  private loop(ts: number) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    let dt = (ts - this.last) / 1000;
    this.last = ts;
    if (dt > 0.2) dt = 0.2;
    if (this.phase === 'paused') {
      this.render();
      return;
    }
    this.acc += dt;
    let steps = 0;
    while (this.acc >= FIXED && steps < 5) {
      this.step(FIXED);
      this.acc -= FIXED;
      steps++;
    }
    if (steps >= 5) this.acc = 0;
    this.render();
  }

  private step(dtRaw: number) {
    const dt = dtRaw * this.timeScale;
    this.t += dtRaw;

    // ambient / shared updates (death plays out in slow motion)
    this.updateEffects(this.phase === 'dying' ? dtRaw * this.timeScale : dtRaw);

    if (this.phase === 'menu') {
      this.camX += 215 * dtRaw;
      this.generate();
      this.cull();
      for (const c of this.coins) c.t += dtRaw * 3;

      // --- scripted hero jog across the flat menu terrain -----------------
      const p = this.p;
      const floorY = WORLD.groundY - PLAYER.h;
      p.alive = true;
      p.fade = 1;
      p.spin = 0;
      p.rot = 0;
      p.x = this.camX + this.anchorX;
      if (p.grounded) {
        p.y = floorY;
        p.runT += dtRaw * 9.5;
        this.menuHopT -= dtRaw;
        if (this.menuHopT <= 0) {
          this.menuHopT = rand(1.9, 3.4);
          p.vy = -720;
          p.grounded = false;
          p.sx = 0.78;
          p.sy = 1.26;
          for (let i = 0; i < 6; i++)
            this.spawnParticle(
              p.x + PLAYER.w / 2 + rand(-10, 10),
              WORLD.groundY,
              rand(-120, 40),
              rand(-110, -20),
              0.35,
              rand(3, 6),
              'rgba(255,255,255,0.85)',
              900,
              1,
            );
        } else if (Math.random() < 0.22) {
          this.spawnParticle(
            p.x + 2,
            WORLD.groundY - 2,
            rand(-120, -40),
            rand(-60, -10),
            0.3,
            rand(2, 5),
            'rgba(255,255,255,0.7)',
            500,
            1,
          );
        }
      } else {
        p.vy += PHYS.gravity * dtRaw;
        p.y += p.vy * dtRaw;
        if (p.y >= floorY) {
          p.y = floorY;
          p.vy = 0;
          p.grounded = true;
          p.sx = 1.26;
          p.sy = 0.78;
          for (let i = 0; i < 8; i++)
            this.spawnParticle(
              p.x + PLAYER.w / 2 + rand(-12, 12),
              WORLD.groundY,
              rand(-170, 170),
              rand(-150, -30),
              0.35,
              rand(3, 7),
              'rgba(255,255,255,0.85)',
              1200,
              1,
            );
        }
      }
      p.sx += (1 - p.sx) * Math.min(1, dtRaw * 10);
      p.sy += (1 - p.sy) * Math.min(1, dtRaw * 10);

      // pick up the menu coins for sparkle
      const ccx = p.x + PLAYER.w / 2;
      const ccy = p.y + PLAYER.h / 2;
      for (const c of this.coins) {
        if (c.taken) continue;
        if (Math.abs(c.x - ccx) < 30 && Math.abs(c.y - ccy) < 40) {
          c.taken = true;
          this.burst(c.x, c.y, 6, [PALETTE.robux, '#fff6c2', '#ffffff'], 180, 1);
        }
      }
      return;
    }

    if (this.phase === 'winning' || this.phase === 'won') {
      this.winT += dtRaw;
      const p = this.p;
      // skid to a triumphant stop, then celebrate
      p.vx *= Math.max(0, 1 - dtRaw * 2.6);
      if (p.vx < 24) p.vx = 0;
      p.x += p.vx * dtRaw;
      p.vy = Math.min(PHYS.maxFall, p.vy + PHYS.fallGravity * dtRaw);
      p.y += p.vy * dtRaw;
      const floor = WORLD.groundY - PLAYER.h;
      if (p.y >= floor) {
        if (!p.grounded && p.vy > 200) {
          p.sx = 1.25;
          p.sy = 0.8;
        }
        p.y = floor;
        p.vy = 0;
        p.grounded = true;
      }
      p.runT += dtRaw * 9;
      p.sx += (1 - p.sx) * Math.min(1, dtRaw * 9);
      p.sy += (1 - p.sy) * Math.min(1, dtRaw * 9);
      this.camX += (p.x - this.anchorX - this.camX) * Math.min(1, dtRaw * 2.4);

      this.fwTimer -= dtRaw;
      if (this.fwTimer <= 0) {
        this.fwTimer = rand(0.22, 0.5);
        this.launchRocket();
        if (Math.random() < 0.45) this.launchRocket(0.14);
      }
      this.updateFireworks(dtRaw);
      for (const c of this.coins) c.t += dtRaw * 3;
      if (this.phase === 'winning' && this.winT > 2.1) {
        this.setPhase('won');
        this.hooks.onWin({
          score: Math.round(this.score),
          coins: this.coinsGot,
          distance: Math.round(this.dist),
          bestCombo: this.bestCombo,
        });
      }
      return;
    }

    if (this.phase === 'dying' || this.phase === 'dead') {
      this.deathT += dtRaw;
      this.timeScale += (1 - this.timeScale) * dtRaw * 1.2;
      // the character gets launched and tumbles away in slow motion
      const corpse = this.p;
      const cdt = dtRaw * this.timeScale;
      corpse.vy = Math.min(PHYS.maxFall, corpse.vy + 2300 * cdt);
      corpse.x += corpse.vx * cdt;
      corpse.y += corpse.vy * cdt;
      corpse.spin += corpse.spinVel * cdt;
      corpse.sx += (1 - corpse.sx) * Math.min(1, cdt * 6);
      corpse.sy += (1 - corpse.sy) * Math.min(1, cdt * 6);
      corpse.fade = clamp(1 - (this.deathT - 0.5) * 1.6, 0, 1);
      if (this.phase === 'dying' && this.deathT > 0.75) {
        this.setPhase('dead');
        this.hooks.onGameOver({
          score: Math.round(this.score),
          coins: this.coinsGot,
          distance: Math.round(this.dist),
          bestCombo: this.bestCombo,
        });
      }
      for (const c of this.coins) c.t += dtRaw * 3;
      return;
    }

    if (this.freeze > 0) {
      this.freeze -= dtRaw;
      return;
    }

    // ------------------------------------------------------------ playing --
    this.elapsed += dt;
    this.speed = Math.min(PHYS.maxSpeed, PHYS.baseSpeed + this.elapsed * PHYS.speedRamp);
    const p = this.p;

    // horizontal
    const target = this.speed * (this.nudge > 0 ? PHYS.nudgeFast : this.nudge < 0 ? PHYS.nudgeSlow : 1);
    p.vx += (target - p.vx) * Math.min(1, dt * 12);
    const prevX = p.x;
    const prevY = p.y;
    p.x += p.vx * dt;

    // gravity — floatier while the jump button is held (classic runner feel)
    const rising = p.vy < 0;
    const g = p.diving
      ? PHYS.gravity
      : rising
        ? PHYS.gravity * (this.holdJump ? 0.86 : 1)
        : PHYS.fallGravity;
    p.vy = Math.min(PHYS.maxFall, p.vy + g * dt);
    p.y += p.vy * dt;

    // input timers (jump is resolved after collisions so buffered presses
    // landing on the same frame still count as grounded jumps)
    if (p.buffer > 0) p.buffer -= dt;
    if (p.coyote > 0) p.coyote -= dt;

    // ---- collisions -----------------------------------------------------
    const px = p.x;
    const py = p.y;
    const pw = PLAYER.w;
    const ph = PLAYER.h;
    let grounded = false;
    let blocked = false;
    for (const b of this.bricks) {
      if (b.x > px + pw || b.x + b.w < px) continue;
      // vertical
      if (py + ph > b.y && py < b.y + b.h) {
        if (p.vy >= 0 && prevY + ph <= b.y + 6) {
          p.y = b.y - ph;
          const impact = p.vy;
          p.vy = 0;
          grounded = true;
          if (!p.grounded) this.onLand(impact);
        } else if (!b.oneWay && p.vy < 0 && prevY >= b.y + b.h - 6) {
          p.y = b.y + b.h;
          p.vy = 60;
          this.burst(p.x + pw / 2, p.y, 6, ['#ffffff', '#cfe6ff'], 160, 0);
        }
      }
    }
    // horizontal pass (after vertical resolve) — thin slabs never block
    for (const b of this.bricks) {
      if (b.oneWay) continue;
      if (p.y + ph <= b.y + 2 || p.y >= b.y + b.h) continue;
      if (p.x + pw > b.x && p.x < b.x + b.w && prevX + pw <= b.x + 2) {
        p.x = b.x - pw;
        p.vx = Math.min(p.vx, this.speed * 0.2);
        blocked = true;
      }
    }
    if (blocked) {
      if (this.t % 0.12 < FIXED) {
        this.burst(p.x + pw, p.y + ph * 0.5, 3, ['#ffd9a0', '#ffffff'], 140, 0);
        sfx.bump();
      }
      this.shake(0.1);
      // wall contact = recovery window, never a guaranteed death
      p.coyote = Math.max(p.coyote, 0.09);
      if (p.jumps > 1) p.jumps = 1;
    }

    if (grounded) {
      p.coyote = PHYS.coyote;
      p.jumps = 0;
      p.rot = 0;
      p.runT += dt * (6 + this.speed / 110);
      if (Math.random() < 0.3)
        this.spawnParticle(
          p.x + 4,
          p.y + ph - 2,
          rand(-130, -40),
          rand(-70, -10),
          0.3,
          rand(2, 5),
          'rgba(255,255,255,0.8)',
          500,
          1,
        );
    } else {
      // walked off a ledge: burn the ground jump once coyote time runs out
      if (p.jumps === 0 && p.coyote <= 0) p.jumps = 1;
      p.rot += ((p.diving ? 0.45 : clamp(p.vy / 1800, -0.35, 0.4)) - p.rot) * Math.min(1, dt * 10);
    }
    p.grounded = grounded;

    // ---- jump (buffered + coyote) ---------------------------------------
    if (p.buffer > 0) {
      if (p.grounded || p.coyote > 0) {
        p.vy = PHYS.jumpVel;
        p.jumps = 1;
        p.grounded = false;
        p.coyote = 0;
        p.buffer = 0;
        p.diving = false;
        p.sx = 0.74;
        p.sy = 1.3;
        sfx.jump();
        for (let i = 0; i < 7; i++)
          this.spawnParticle(
            p.x + PLAYER.w / 2 + rand(-10, 10),
            p.y + PLAYER.h,
            rand(-140, 60),
            rand(-120, -20),
            0.35,
            rand(3, 7),
            '#ffffff',
            900,
            1,
          );
      } else if (p.jumps < 2) {
        p.vy = PHYS.doubleJumpVel;
        p.jumps = 2;
        p.buffer = 0;
        p.diving = false;
        p.sx = 0.7;
        p.sy = 1.36;
        p.rot = -0.4;
        // full cartoon front-flip
        p.spin = 0;
        p.spinVel = Math.PI * 2 * 2.4;
        sfx.doubleJump();
        this.burst(p.x + PLAYER.w / 2, p.y + PLAYER.h * 0.6, 14, ['#8ef0ff', '#ffffff', '#3FA9FF'], 260, 1);
        this.spawnParticle(p.x + PLAYER.w / 2, p.y + PLAYER.h * 0.6, 0, 0, 0.35, 26, '#9fe9ff', 0, 2);
      }
    }

    // squash & stretch easing
    p.sx += (1 - p.sx) * Math.min(1, dt * 11);
    p.sy += (1 - p.sy) * Math.min(1, dt * 11);

    // flip: spin out the remaining rotation, then snap cleanly upright
    if (p.spinVel > 0) {
      p.spin += p.spinVel * dt;
      if (p.spin >= Math.PI * 2) {
        p.spin = 0;
        p.spinVel = 0;
      }
    }
    if (p.grounded && p.spinVel === 0) p.spin = 0;

    // camera
    this.camX += this.speed * dt;
    const screenX = p.x - this.camX;
    const maxX = this.viewW * 0.62;
    if (screenX > maxX) p.x = this.camX + maxX;

    // ---- pickups & hazards ---------------------------------------------
    const cx = p.x + pw / 2;
    const cy = p.y + ph / 2;
    for (const c of this.coins) {
      c.t += dtRaw * 3.2;
      if (c.taken) continue;
      if (Math.abs(c.x - cx) < 30 && Math.abs(c.y - cy) < 36) this.collect(c);
    }

    for (const s of this.saws) {
      s.rot += s.spd * dt * 9;
      s.y = s.baseY + Math.sin(this.t * s.spd * 1.6 + s.phase) * s.amp;
      if (s.dead) continue;
      const dx = Math.max(Math.abs(cx - s.x) - pw / 2 + 6, 0);
      const dy = Math.max(Math.abs(cy - s.y) - ph / 2 + 8, 0);
      if (dx * dx + dy * dy < s.r * s.r) this.die('SLICED');
    }

    for (const sp of this.spikes) {
      if (sp.x > p.x + pw - 5 || sp.x + sp.w < p.x + 5) continue;
      if (p.y + ph > sp.y - sp.h + 8) this.die('OUCH!');
    }

    if (p.y > WORLD.lavaY - ph * 0.6) {
      let inPit = false;
      for (const pit of this.pits) {
        if (cx > pit.x && cx < pit.x + pit.w) {
          inPit = true;
          break;
        }
      }
      if (inPit || p.y > WORLD.deathY) this.die('MELTED');
    }
    if (p.x - this.camX < 32) this.die('LEFT BEHIND');

    // ---- score -----------------------------------------------------------
    if (this.hintT > 0) this.hintT = Math.max(0, this.hintT - dt * (this.hintUsed ? 2.2 : 0.2));
    this.dist = (p.x - this.startX) / 50;
    this.score += this.speed * dt * 0.08;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
    if (this.dist >= GOAL_M) {
      this.win();
      return;
    }
    if (this.dist >= this.nextMilestone) {
      this.nextMilestone += 250;
      this.banner = 'SPEED UP!';
      this.bannerT = 1.4;
      this.flash = 0.25;
      this.flashColor = '120,200,255';
      this.shake(0.25);
      this.score += 100;
      sfx.milestone();
    }

    this.generate();
    this.cull();
    this.ambientLava(dtRaw);
  }

  private ambientLava(dt: number) {
    if (Math.random() > dt * 14) return;
    const visible = this.pits.filter((p) => p.x + p.w > this.camX && p.x < this.camX + this.viewW);
    if (!visible.length) return;
    const pit = visible[randInt(0, visible.length - 1)];
    this.spawnParticle(
      pit.x + Math.random() * pit.w,
      WORLD.lavaY + 4,
      rand(-20, 20),
      rand(-220, -90),
      rand(0.5, 1),
      rand(3, 7),
      Math.random() < 0.5 ? PALETTE.lavaHot : PALETTE.lava,
      420,
      1,
    );
  }

  private onLand(impact: number) {
    const p = this.p;
    const power = clamp(impact / 1200, 0.15, 1);
    p.sx = 1 + power * 0.42;
    p.sy = 1 - power * 0.34;
    const n = 4 + Math.round(power * 12);
    for (let i = 0; i < n; i++) {
      this.spawnParticle(
        p.x + PLAYER.w / 2 + rand(-14, 14),
        p.y + PLAYER.h,
        rand(-200, 200) * power,
        rand(-230, -40) * power,
        rand(0.25, 0.5),
        rand(3, 8),
        'rgba(255,255,255,0.9)',
        1300,
        1,
      );
    }
    if (p.diving) {
      const fall = p.y - p.diveFrom;
      p.diving = false;
      this.shake(0.5);
      this.freeze = 0.06;
      sfx.slam();
      this.spawnParticle(p.x + PLAYER.w / 2, p.y + PLAYER.h, 0, 0, 0.4, 40, '#ffe14a', 0, 2);
      this.burst(p.x + PLAYER.w / 2, p.y + PLAYER.h, 18, ['#ffe14a', '#ffffff', '#ff9f3d'], 420, 0);
      let killed = 0;
      for (const s of this.saws) {
        if (s.dead) continue;
        if (Math.abs(s.x - p.x) < 150 && Math.abs(s.y - p.y) < 130) {
          s.dead = true;
          killed++;
          this.burst(s.x, s.y, 16, [PALETTE.steel, '#ffffff', PALETTE.steelDark], 380, 0);
          this.popup(s.x, s.y - 20, '+75', '#8ef0ff', 20);
          this.score += 75;
        }
      }
      if (fall > 90 || killed) {
        const bonus = 40 + killed * 10;
        this.score += bonus;
        this.popup(p.x + PLAYER.w / 2, p.y - 10, killed ? 'SMASH!' : 'SLAM!', '#ffe14a', 26);
      }
    } else {
      this.shake(power * 0.16);
      if (power > 0.3) sfx.land(power);
    }
  }

  private collect(c: Coin) {
    c.taken = true;
    this.coinsGot++;
    this.combo++;
    this.comboTimer = 2.6;
    const mult = clamp(1 + Math.floor(this.combo / 5), 1, 8);
    this.bestCombo = Math.max(this.bestCombo, mult);
    const gain = 10 * mult;
    this.score += gain;
    this.scorePulse = 1;
    this.coinPulse = 1;
    sfx.coin(Math.min(14, this.combo));
    this.burst(c.x, c.y, 7, [PALETTE.robux, '#fff6c2', '#ffffff'], 190, 1);
    if (mult > 1 && this.combo % 5 === 0) {
      this.popup(c.x, c.y - 24, `x${mult}`, '#8ef0ff', 26);
      this.shake(0.12);
      this.spawnParticle(c.x, c.y, 0, 0, 0.4, 30, '#8ef0ff', 0, 2);
    } else {
      this.popup(c.x, c.y - 14, `+${gain}`, '#ffe14a', 18);
    }
  }

  // ------------------------------------------------------------- victory --
  private win() {
    if (this.phase !== 'playing') return;
    this.setPhase('winning');
    this.winT = 0;
    this.banner = 'YOU WIN!';
    this.bannerT = 3.2;
    this.flash = 0.55;
    this.flashColor = '255,240,160';
    this.shake(0.5);
    this.score += 2500;
    this.popup(this.p.x + PLAYER.w / 2, this.p.y - 24, '+2500', '#ffe14a', 30);
    sfx.victory();
    for (let i = 0; i < 5; i++) this.launchRocket(i * 0.12);
  }

  private launchRocket(delay = 0) {
    const rainbow = Math.random() < 0.26;
    this.rockets.push({
      x: this.camX + rand(this.viewW * 0.08, this.viewW * 0.92),
      y: WORLD.groundY + 30 + delay * 400,
      vx: rand(-40, 40),
      vy: rand(-760, -610),
      fuse: rand(0.72, 1.05) + delay,
      color: FIREWORK_COLORS[randInt(0, FIREWORK_COLORS.length - 1)],
      rainbow,
      trail: 0,
    });
    sfx.rocket();
  }

  private explode(r: Rocket) {
    const n = 46;
    const ring = rand(220, 330);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.05, 0.05);
      const sp = ring * rand(0.55, 1);
      const c = r.rainbow ? RAINBOW[i % RAINBOW.length] : r.color;
      this.spawnParticle(
        r.x,
        r.y,
        Math.cos(a) * sp,
        Math.sin(a) * sp,
        rand(0.75, 1.45),
        rand(3, 6.5),
        c,
        150,
        1,
      );
    }
    // inner sparkle + shock ring
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(40, 150);
      this.spawnParticle(r.x, r.y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.4, 0.9), rand(2, 4), '#ffffff', 90, 1);
    }
    this.spawnParticle(r.x, r.y, 0, 0, 0.45, 46, r.rainbow ? '#ffffff' : r.color, 0, 2);
    this.flash = Math.max(this.flash, 0.1);
    this.flashColor = '255,255,255';
    this.shake(0.12);
    sfx.boom();
  }

  private updateFireworks(dt: number) {
    const rs = this.rockets;
    for (let i = rs.length - 1; i >= 0; i--) {
      const r = rs[i];
      r.fuse -= dt;
      r.vy += 620 * dt;
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.trail -= dt;
      if (r.trail <= 0) {
        r.trail = 0.016;
        this.spawnParticle(
          r.x,
          r.y,
          rand(-20, 20),
          rand(10, 60),
          0.34,
          rand(2.5, 4.5),
          Math.random() < 0.4 ? '#ffffff' : r.color,
          120,
          1,
        );
      }
      if (r.fuse <= 0 || r.vy > -40) {
        this.explode(r);
        rs[i] = rs[rs.length - 1];
        rs.pop();
      }
    }
  }

  private die(reason: string) {
    if (this.phase !== 'playing') return;
    const p = this.p;
    p.alive = false;
    this.setPhase('dying');
    this.deathT = 0;
    this.timeScale = 0.25;
    this.freeze = 0.1;
    this.trauma = 1;
    this.flash = 0.75;
    this.flashColor = '255,255,255';
    this.banner = reason;
    this.bannerT = 2.5;
    // launch the character into a tumble
    p.vx = -90;
    p.vy = -760;
    p.spinVel = (Math.random() < 0.5 ? -1 : 1) * Math.PI * 2 * 1.6;
    p.sx = 1.2;
    p.sy = 0.85;
    p.diving = false;
    sfx.death();
    // confetti tinted to the character's own palette
    const colors = ['#F2C13D', '#A8CBE8', '#D9453F', '#ffffff', '#2b2b2b'];
    for (let i = 0; i < 34; i++) {
      const a = rand(-Math.PI, 0);
      const s = rand(120, 620);
      this.spawnParticle(
        p.x + PLAYER.w / 2 + rand(-12, 12),
        p.y + PLAYER.h / 2 + rand(-20, 20),
        Math.cos(a) * s,
        Math.sin(a) * s,
        rand(0.6, 1.3),
        rand(5, 13),
        colors[randInt(0, colors.length - 1)],
        1700,
        0,
      );
    }
    this.spawnParticle(p.x + PLAYER.w / 2, p.y + PLAYER.h / 2, 0, 0, 0.5, 44, '#ffffff', 0, 2);
  }

  private updateEffects(dt: number) {
    // shake
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    const amp = this.trauma * this.trauma * 26;
    this.shakeX = rand(-amp, amp);
    this.shakeY = rand(-amp, amp);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.2);
    if (this.bannerT > 0) this.bannerT = Math.max(0, this.bannerT - dt);
    if (this.scorePulse > 0) this.scorePulse = Math.max(0, this.scorePulse - dt * 3.2);
    if (this.coinPulse > 0) this.coinPulse = Math.max(0, this.coinPulse - dt * 3);
    this.scoreShown += (this.score - this.scoreShown) * Math.min(1, dt * 9);

    // particles
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const q = ps[i];
      q.life -= dt;
      if (q.life <= 0) {
        ps[i] = ps[ps.length - 1];
        ps.pop();
        continue;
      }
      q.vy += q.g * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.rot += q.vr * dt;
      q.fade = q.life / q.max;
    }
    const us = this.popups;
    for (let i = us.length - 1; i >= 0; i--) {
      const u = us[i];
      u.life -= dt;
      u.y += u.vy * dt;
      u.vy *= 0.94;
      if (u.life <= 0) {
        us[i] = us[us.length - 1];
        us.pop();
      }
    }
  }

  // --------------------------------------------------------------- render --
  private render() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.scale(this.scale, this.scale);

    const shaking = this.phase !== 'paused';
    const ox = shaking ? this.shakeX : 0;
    const oy = shaking ? this.shakeY : 0;

    this.drawSky(ctx);
    ctx.save();
    ctx.translate(-this.camX + ox, -this.camY + oy);
    this.drawParallax(ctx);
    this.drawLava(ctx);
    this.drawBricks(ctx);
    this.drawGoal(ctx);
    this.drawSpikes(ctx);
    this.drawCoins(ctx);
    this.drawSaws(ctx);
    this.drawPlayer(ctx);
    this.drawParticles(ctx);
    this.drawRockets(ctx);
    this.drawPopups(ctx);
    ctx.restore();

    this.drawForeground(ctx);
    if (this.phase !== 'menu') this.drawHud(ctx);
  }

  private drawSky(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(0, -this.camY);
    ctx.fillStyle = this.skyGrad ?? PALETTE.skyMid;
    ctx.fillRect(0, this.camY, this.viewW, this.viewH);
    // sun — kept near the horizon so tall screens stay composed
    const sx = this.viewW * 0.78;
    const sy = Math.max(this.camY + 80, WORLD.groundY - 340);
    ctx.fillStyle = 'rgba(255,245,180,0.16)';
    ctx.beginPath();
    ctx.arc(sx, sy, 92, 0, 6.2832);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,248,200,0.3)';
    ctx.beginPath();
    ctx.arc(sx, sy, 58, 0, 6.2832);
    ctx.fill();
    ctx.fillStyle = PALETTE.sun;
    ctx.beginPath();
    ctx.arc(sx, sy, 34, 0, 6.2832);
    ctx.fill();
    ctx.restore();
  }

  private drawParallax(ctx: CanvasRenderingContext2D) {
    const top = this.camY;
    // clouds
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const cloudPeriod = 520;
    const cloudOff = (this.camX * 0.18) % cloudPeriod;
    const startC = this.camX - cloudOff - cloudPeriod;
    for (let i = 0; i < Math.ceil(this.viewW / cloudPeriod) + 3; i++) {
      const bx = startC + i * cloudPeriod + (i % 3) * 60;
      const by = Math.max(top + 36, WORLD.groundY - 180 - ((i * 97) % 230));
      ctx.fillRect(bx, by, 86, 24);
      ctx.fillRect(bx + 22, by - 18, 54, 22);
      ctx.fillRect(bx + 54, by - 6, 40, 18);
    }
    // far hills
    const fp = 400;
    const fo = (this.camX * 0.38) % fp;
    const startF = this.camX - fo - fp;
    ctx.fillStyle = PALETTE.hillFar;
    for (let i = 0; i < Math.ceil(this.viewW / fp) + 3; i++) {
      const bx = startF + i * fp;
      const h = 150 + ((i * 71) % 90);
      ctx.fillRect(bx, WORLD.groundY - h, 170, h + 40);
      ctx.fillRect(bx + 170, WORLD.groundY - h * 0.6, 120, h);
      ctx.fillStyle = mix(PALETTE.hillFar, 0.12);
      ctx.fillRect(bx, WORLD.groundY - h, 170, 10);
      ctx.fillStyle = PALETTE.hillFar;
    }
    // near trees
    const np = 300;
    const no = (this.camX * 0.62) % np;
    const startN = this.camX - no - np;
    for (let i = 0; i < Math.ceil(this.viewW / np) + 3; i++) {
      const bx = startN + i * np + ((i * 53) % 90);
      const scale = 0.8 + ((i * 37) % 40) / 100;
      const th = 54 * scale;
      ctx.fillStyle = '#7a4a2b';
      ctx.fillRect(bx, WORLD.groundY - th, 16 * scale, th);
      ctx.fillStyle = PALETTE.hillNearDark;
      ctx.fillRect(bx - 22 * scale, WORLD.groundY - th - 46 * scale, 60 * scale, 46 * scale);
      ctx.fillStyle = PALETTE.hillNear;
      ctx.fillRect(bx - 22 * scale, WORLD.groundY - th - 46 * scale, 60 * scale, 12 * scale);
    }
  }

  private drawLava(ctx: CanvasRenderingContext2D) {
    const bottom = WORLD.groundY + WORLD.groundH;
    for (const pit of this.pits) {
      if (pit.x + pit.w < this.camX - 60 || pit.x > this.camX + this.viewW + 60) continue;
      ctx.fillStyle = '#1a0a12';
      ctx.fillRect(pit.x, WORLD.groundY, pit.w, bottom - WORLD.groundY);
      const y = WORLD.lavaY;
      ctx.fillStyle = PALETTE.lava;
      ctx.fillRect(pit.x, y, pit.w, bottom - y);
      // wavy hot top
      ctx.fillStyle = PALETTE.lavaHot;
      const step = 14;
      for (let x = pit.x; x < pit.x + pit.w; x += step) {
        const w = Math.min(step, pit.x + pit.w - x);
        const h = 5 + Math.sin(this.t * 3.4 + x * 0.06) * 3;
        ctx.fillRect(x, y - h * 0.5, w, h);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(pit.x, y + 10, pit.w, 3);
    }
  }

  private drawTile(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = mix(c, 0.26);
    ctx.fillRect(x, y, w, 7);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x, y + h - 6, w, 6);
    ctx.fillRect(x + w - 5, y, 5, h);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x, y, 1.5, h);
  }

  private drawStuds(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, c: string) {
    const n = Math.max(1, Math.round(w / 30));
    const gap = w / n;
    ctx.fillStyle = mix(c, 0.34);
    for (let i = 0; i < n; i++) {
      const sx = x + gap * (i + 0.5);
      ctx.beginPath();
      ctx.arc(sx, y - 3, 7, 0, 6.2832);
      ctx.fill();
    }
    ctx.fillStyle = mix(c, 0.08);
    for (let i = 0; i < n; i++) {
      const sx = x + gap * (i + 0.5);
      ctx.beginPath();
      ctx.arc(sx, y - 1.5, 7, 0, 6.2832);
      ctx.fill();
    }
  }

  private drawBricks(ctx: CanvasRenderingContext2D) {
    const left = this.camX - 80;
    const right = this.camX + this.viewW + 80;
    for (const b of this.bricks) {
      if (b.x > right || b.x + b.w < left) continue;
      if (b.ground) {
        const x0 = Math.max(b.x, left);
        const x1 = Math.min(b.x + b.w, right);
        const first = Math.floor((x0 - b.x) / TILE);
        const count = Math.ceil((x1 - x0) / TILE) + 1;
        for (let i = first; i < first + count; i++) {
          const tx = b.x + i * TILE;
          if (tx >= b.x + b.w) break;
          const tw = Math.min(TILE, b.x + b.w - tx);
          const c = BRICK_COLORS[Math.abs(Math.round((tx + 6000) / TILE)) % BRICK_COLORS.length];
          this.drawTile(ctx, tx, b.y, tw, b.h, c);
          this.drawStuds(ctx, tx, b.y, tw, c);
        }
      } else {
        this.drawTile(ctx, b.x, b.y, b.w, b.h, b.c);
        this.drawStuds(ctx, b.x, b.y, b.w, b.c);
      }
    }
  }

  /** Rainbow finish arch at the end of the run. */
  private drawGoal(ctx: CanvasRenderingContext2D) {
    if (this.phase === 'menu') return;
    const gx = this.goalX;
    if (gx < this.camX - 160 || gx > this.camX + this.viewW + 220) return;
    const g = WORLD.groundY;
    const topY = g - 230;

    // pillars
    for (const px of [gx - 86, gx + 58]) {
      ctx.fillStyle = PALETTE.steelDark;
      ctx.fillRect(px, topY + 26, 28, g - topY - 26);
      ctx.fillStyle = PALETTE.steel;
      ctx.fillRect(px, topY + 26, 10, g - topY - 26);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = BRICK_COLORS[i % BRICK_COLORS.length];
        ctx.fillRect(px + 2, g - 26 - i * 30, 24, 12);
      }
    }
    // banner
    const bw = 172;
    ctx.fillStyle = '#0c182f';
    ctx.fillRect(gx - 86, topY - 10, bw, 46);
    const cell = 14;
    for (let i = 0; i * cell < bw; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#111a2e';
      ctx.fillRect(gx - 86 + i * cell, topY - 10, Math.min(cell, bw - i * cell), 10);
      ctx.fillStyle = i % 2 === 0 ? '#111a2e' : '#ffffff';
      ctx.fillRect(gx - 86 + i * cell, topY + 26, Math.min(cell, bw - i * cell), 10);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 25px "Trebuchet MS", system-ui, sans-serif';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(8,14,28,0.9)';
    ctx.strokeText('FINISH', gx - 86 + bw / 2, topY + 13);
    const grad = ctx.createLinearGradient(gx - 86, 0, gx + 86, 0);
    RAINBOW.forEach((c, i) => grad.addColorStop(i / (RAINBOW.length - 1), c));
    ctx.fillStyle = grad;
    ctx.fillText('FINISH', gx - 86 + bw / 2, topY + 13);

    // shimmering ribbon
    ctx.globalAlpha = 0.45 + Math.sin(this.t * 5) * 0.18;
    ctx.fillStyle = '#ffe14a';
    ctx.fillRect(gx - 58, topY + 36, 116, 4);
    ctx.globalAlpha = 1;
  }

  private drawRockets(ctx: CanvasRenderingContext2D) {
    for (const r of this.rockets) {
      ctx.fillStyle = '#fff6c2';
      ctx.beginPath();
      ctx.arc(r.x, r.y, 4, 0, 6.2832);
      ctx.fill();
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x - r.vx * 0.03, r.y - r.vy * 0.045);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private drawSpikes(ctx: CanvasRenderingContext2D) {
    const left = this.camX - 60;
    const right = this.camX + this.viewW + 60;
    for (const s of this.spikes) {
      if (s.x > right || s.x + s.w < left) continue;
      ctx.fillStyle = PALETTE.steelDark;
      ctx.fillRect(s.x + 1, s.y - 5, s.w - 2, 6);
      ctx.beginPath();
      ctx.moveTo(s.x + 2, s.y - 4);
      ctx.lineTo(s.x + s.w / 2, s.y - s.h - 6);
      ctx.lineTo(s.x + s.w - 2, s.y - 4);
      ctx.closePath();
      ctx.fillStyle = PALETTE.steel;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s.x + s.w / 2, s.y - s.h - 6);
      ctx.lineTo(s.x + s.w / 2 + 5, s.y - 4);
      ctx.lineTo(s.x + s.w - 2, s.y - 4);
      ctx.closePath();
      ctx.fillStyle = PALETTE.steelDark;
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(s.x + s.w / 2 - 3, s.y - s.h + 2, 2, 8);
    }
  }

  private drawCoins(ctx: CanvasRenderingContext2D) {
    const left = this.camX - 50;
    const right = this.camX + this.viewW + 50;
    for (const c of this.coins) {
      if (c.taken || c.x > right || c.x + 30 < left) continue;
      const bob = Math.sin(c.t) * 4;
      const sx = Math.abs(Math.cos(c.t * 0.9));
      const y = c.y + bob;
      ctx.save();
      ctx.translate(c.x, y);
      ctx.scale(0.35 + sx * 0.65, 1);
      // Robux-ish hexagon token
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        const px = Math.cos(a) * 15;
        const py = Math.sin(a) * 15;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = PALETTE.robux;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = PALETTE.robuxDark;
      ctx.stroke();
      ctx.fillStyle = mix(PALETTE.robux, 0.5);
      ctx.fillRect(-4.5, -5, 9, 10);
      ctx.fillStyle = PALETTE.robuxDark;
      ctx.fillRect(-2, -2.5, 4, 5);
      ctx.restore();
    }
  }

  private drawSaws(ctx: CanvasRenderingContext2D) {
    const left = this.camX - 70;
    const right = this.camX + this.viewW + 70;
    for (const s of this.saws) {
      if (s.dead || s.x > right || s.x < left) continue;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.beginPath();
      const teeth = 10;
      for (let i = 0; i < teeth * 2; i++) {
        const a = (Math.PI / teeth) * i;
        const r = i % 2 === 0 ? s.r : s.r * 0.78;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = PALETTE.steel;
      ctx.fill();
      ctx.strokeStyle = PALETTE.steelDark;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#ff5c5c';
      ctx.beginPath();
      ctx.arc(0, 0, s.r * 0.34, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-2, -s.r * 0.22, 4, s.r * 0.44);
      ctx.restore();
    }
  }

  /** Builds the puppet pose for the 3D character from the live player state. */
  private heroPose(alpha = 1): HeroPose {
    const p = this.p;
    const spd = this.speed;
    const grounded = p.grounded && p.alive;
    const rising = p.vy < -40;
    const pose = basePose();
    pose.alpha = alpha;
    pose.sx = p.sx;
    pose.sy = p.sy;
    pose.step = p.runT / 6.2832;

    const swing = Math.sin(p.runT);

    if (this.phase === 'winning' || this.phase === 'won') {
      // ---- VICTORY: both arms thrown up, waving ------------------------
      const cheer = Math.sin(this.t * 7.5);
      const settle = clamp(this.winT * 2.2, 0, 1);
      const up = -2.38 * settle;
      pose.armR = up + cheer * 0.26 * settle;
      pose.armL = up - cheer * 0.26 * settle;
      pose.rot = Math.sin(this.t * 3.6) * 0.045 * settle;
      pose.bob = grounded ? -Math.abs(Math.sin(this.t * 6.5)) * 7 * settle : 0;
      pose.legAmp = grounded ? 3 * (1 - settle) + Math.abs(Math.sin(this.t * 6.5)) * 6 * settle : 0;
      pose.legSwing = 0.07 * settle;
      pose.tuck = grounded ? 0 : 4;
      return pose;
    }

    if (!p.alive) {
      // ---- WIPEOUT: arms flail --------------------------------------
      pose.rot = p.rot * 0.55 + p.spin;
      pose.armR = -2.1 + Math.sin(this.t * 19) * 0.45;
      pose.armL = -1.5 + Math.cos(this.t * 16) * 0.5;
      pose.tuck = 7;
      pose.legAmp = 0;
      pose.pivotY = PLAYER.drawH * 0.46;
      return pose;
    }

    const lean = clamp((spd - PHYS.baseSpeed) / 2600, 0, 0.14);
    pose.rot = p.rot * 0.55 + p.spin + lean;
    pose.pivotY = clamp(Math.abs(p.spin) * 2.2, 0, 1) * PLAYER.drawH * 0.46;

    if (grounded) {
      // ---- RUN: arms swing forward / back in turn ---------------------
      const power = 0.42 + clamp((spd - PHYS.baseSpeed) / 900, 0, 0.26);
      pose.armR = swing * power;
      pose.armL = -swing * power;
      pose.bob = -Math.abs(swing) * 3.4;
      pose.legAmp = 4.2 + clamp((spd - PHYS.baseSpeed) / 140, 0, 3.2);
      pose.legSwing = 0.1 + clamp((spd - PHYS.baseSpeed) / 2600, 0, 0.07);
      pose.tuck = 0;
    } else if (p.diving) {
      // ---- SLAM: both arms raised to hammer down ----------------------
      pose.armR = -1.95;
      pose.armL = -1.95;
      pose.tuck = 11;
    } else {
      // ---- AIRBORNE: arms up on the way up, out on the way down -------
      const t = rising ? 1 : 0.35;
      pose.armR = -0.5 - t * 0.5 + swing * 0.12;
      pose.armL = -0.5 - t * 0.5 - swing * 0.12;
      pose.tuck = rising ? 7 : 2.5;
      pose.legAmp = 2;
    }
    return pose;
  }

  private drawPlayer(ctx: CanvasRenderingContext2D) {
    const p = this.p;
    const w = PLAYER.w;
    const h = PLAYER.h;
    const dh = PLAYER.drawH;
    const cx = p.x + w / 2;
    const by = p.y + h;

    // ---- contact shadow on the closest surface below ---------------------
    if (p.alive) {
      let surf = WORLD.lavaY;
      for (const b of this.bricks) {
        if (b.x > cx || b.x + b.w < cx || b.y + 2 < by) continue;
        if (b.y < surf) surf = b.y;
      }
      const drop = clamp((surf - by) / 220, 0, 1);
      ctx.fillStyle = `rgba(0,0,0,${0.3 * (1 - drop * 0.75)})`;
      ctx.beginPath();
      ctx.ellipse(cx, surf + 4, 17 * (1 - drop * 0.45), 5.5 * (1 - drop * 0.4), 0, 0, 6.2832);
      ctx.fill();
    }

    if (hero.ready) {
      // motion trail — ghosted copies of the character itself
      if (this.speed > 520 && this.phase === 'playing' && p.alive) {
        const ghost = this.heroPose(0.16);
        hero.draw(ctx, cx - 20, by, dh, ghost, false);
        ghost.alpha = 0.08;
        hero.draw(ctx, cx - 40, by, dh, ghost, false);
      }
      hero.draw(ctx, cx, by, dh, this.heroPose(p.fade));
      return;
    }

    // ------------------------------------------------------- fallback art --
    if (!p.alive) return;
    ctx.save();
    ctx.translate(cx, by);
    ctx.scale(p.sx, p.sy);
    ctx.rotate(p.rot * 0.5);
    ctx.translate(0, -h);

    const swing = p.grounded ? Math.sin(p.runT) : -0.8;
    const swing2 = p.grounded ? Math.sin(p.runT + Math.PI) : -0.5;

    // back arm
    ctx.save();
    ctx.translate(-4, 20);
    ctx.rotate(swing2 * 0.9);
    ctx.fillStyle = '#132040';
    ctx.fillRect(-5, 0, 9, 17);
    ctx.fillStyle = '#FFD93B';
    ctx.fillRect(-5, 15, 9, 6);
    ctx.restore();

    // back leg
    ctx.save();
    ctx.translate(-3, 36);
    ctx.rotate(swing2 * 0.75);
    ctx.fillStyle = '#20304f';
    ctx.fillRect(-5, 0, 10, 17);
    ctx.restore();

    // front leg
    ctx.save();
    ctx.translate(5, 36);
    ctx.rotate(swing * 0.75);
    ctx.fillStyle = '#2b4470';
    ctx.fillRect(-5, 0, 10, 17);
    ctx.fillStyle = '#e8f1ff';
    ctx.fillRect(-5, 13, 10, 4);
    ctx.restore();

    // torso
    ctx.fillStyle = '#1b2a4a';
    ctx.fillRect(-11, 18, 22, 20);
    ctx.fillStyle = '#2f6fd0';
    ctx.fillRect(-11, 18, 22, 6);
    ctx.fillStyle = '#e8f1ff';
    ctx.fillRect(-4, 25, 8, 8);
    ctx.fillStyle = '#2f6fd0';
    ctx.fillRect(-2, 27, 4, 4);

    // head
    ctx.fillStyle = '#FFD93B';
    ctx.fillRect(-10, 0, 20, 18);
    ctx.fillStyle = mix('#FFD93B', 0.28);
    ctx.fillRect(-10, 0, 20, 4);
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(-6, 6, 3, 4);
    ctx.fillRect(3, 6, 3, 4);
    ctx.fillRect(-4, 12, 8, 2);
    ctx.fillRect(-5, 10, 2, 2);
    ctx.fillRect(3, 10, 2, 2);
    // hair block
    ctx.fillStyle = '#3a2a1c';
    ctx.fillRect(-11, -4, 22, 6);

    // front arm
    ctx.save();
    ctx.translate(6, 20);
    ctx.rotate(swing * 0.9 - (p.diving ? 1.6 : 0));
    ctx.fillStyle = '#20355f';
    ctx.fillRect(-4, 0, 9, 17);
    ctx.fillStyle = '#FFD93B';
    ctx.fillRect(-4, 15, 9, 6);
    ctx.restore();

    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    for (const q of this.particles) {
      ctx.globalAlpha = Math.min(1, q.fade * 1.4);
      ctx.fillStyle = q.c;
      if (q.shape === 1) {
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.size * q.fade, 0, 6.2832);
        ctx.fill();
      } else if (q.shape === 2) {
        ctx.strokeStyle = q.c;
        ctx.lineWidth = 4 * q.fade;
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.size * (1.6 - q.fade), 0, 6.2832);
        ctx.stroke();
      } else {
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(q.rot);
        const s = q.size * (0.5 + q.fade * 0.5);
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawPopups(ctx: CanvasRenderingContext2D) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const u of this.popups) {
      const a = clamp(u.life * 2, 0, 1);
      const pop = u.life > 0.75 ? 1 + (u.life - 0.75) * 1.6 : 1;
      ctx.globalAlpha = a;
      ctx.font = `900 ${u.size * pop}px "Trebuchet MS", system-ui, sans-serif`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(8,14,28,0.85)';
      ctx.strokeText(u.text, u.x, u.y);
      ctx.fillStyle = u.c;
      ctx.fillText(u.text, u.x, u.y);
    }
    ctx.globalAlpha = 1;
  }

  private drawForeground(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(0, -this.camY);
    // speed lines
    if (this.speed > 560 && this.phase === 'playing') {
      const n = 5;
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 2;
      for (let i = 0; i < n; i++) {
        const y = this.camY + ((this.t * (420 + i * 90) + i * 173) % this.viewH);
        const len = 60 + (i % 3) * 40;
        const x = (this.viewW * ((i * 0.23 + this.t * 1.3) % 1)) - len;
        ctx.beginPath();
        ctx.moveTo(x + len, y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(${this.flashColor},${this.flash})`;
      ctx.fillRect(0, this.camY, this.viewW, this.viewH);
    }
    ctx.restore();
  }

  private rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
    ctx.fill();
  }

  private drawHud(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(0, -this.camY);
    const top = this.camY;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    // score
    const pulse = 1 + this.scorePulse * 0.14;
    ctx.save();
    ctx.translate(20, top + 16);
    ctx.scale(pulse, pulse);
    ctx.font = '900 40px "Trebuchet MS", system-ui, sans-serif';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(8,14,28,0.75)';
    const s = String(Math.round(this.scoreShown));
    ctx.strokeText(s, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(s, 0, 0);
    ctx.restore();

    ctx.font = '700 15px "Trebuchet MS", system-ui, sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(8,14,28,0.7)';
    const sub = `${Math.round(this.dist)} / ${GOAL_M} m`;
    ctx.strokeText(sub, 21, top + 60);
    ctx.fillStyle = '#bfe3ff';
    ctx.fillText(sub, 21, top + 60);

    // progress to the finish line
    const pw = Math.min(190, this.viewW * 0.32);
    const prog = clamp(this.dist / GOAL_M, 0, 1);
    ctx.fillStyle = 'rgba(8,14,28,0.55)';
    this.rrect(ctx, 21, top + 80, pw, 9, 4.5);
    const pg = ctx.createLinearGradient(21, 0, 21 + pw, 0);
    RAINBOW.forEach((c, i) => pg.addColorStop(i / (RAINBOW.length - 1), c));
    ctx.fillStyle = pg;
    this.rrect(ctx, 21, top + 80, Math.max(5, pw * prog), 9, 4.5);
    // runner pip + flag
    ctx.fillStyle = '#ffffff';
    this.rrect(ctx, 21 + pw * prog - 2, top + 77, 4, 15, 2);
    ctx.font = '900 13px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillStyle = '#ffe14a';
    ctx.fillText('⚑', 21 + pw + 6, top + 77);

    // coins
    const cp = 1 + this.coinPulse * 0.2;
    ctx.save();
    ctx.translate(this.viewW - 76, top + 24);
    ctx.scale(cp, cp);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      const px = Math.cos(a) * 11;
      const py = Math.sin(a) * 11;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = PALETTE.robux;
    ctx.fill();
    ctx.strokeStyle = PALETTE.robuxDark;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    ctx.textAlign = 'right';
    ctx.font = '900 22px "Trebuchet MS", system-ui, sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(8,14,28,0.75)';
    ctx.strokeText(String(this.coinsGot), this.viewW - 92, top + 13);
    ctx.fillStyle = '#ffe14a';
    ctx.fillText(String(this.coinsGot), this.viewW - 92, top + 13);

    // pause button (hidden once the run is over)
    const bx = this.viewW - 54;
    const by = top + 16;
    if (this.phase === 'playing' || this.phase === 'paused') {
      ctx.fillStyle = 'rgba(10,18,36,0.55)';
      this.rrect(ctx, bx, by + 36, 38, 34, 9);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx + 12, by + 44, 5, 18);
      ctx.fillRect(bx + 21, by + 44, 5, 18);
    }

    // combo
    const mult = clamp(1 + Math.floor(this.combo / 5), 1, 8);
    if (this.combo > 0 && this.comboTimer > 0) {
      const cxp = this.viewW / 2;
      const alpha = clamp(this.comboTimer * 2, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.font = '900 26px "Trebuchet MS", system-ui, sans-serif';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(8,14,28,0.8)';
      const label = `x${mult}  COMBO`;
      ctx.strokeText(label, cxp, top + 18);
      ctx.fillStyle = mult > 1 ? '#8ef0ff' : '#ffffff';
      ctx.fillText(label, cxp, top + 18);
      const bw = 140;
      ctx.fillStyle = 'rgba(8,14,28,0.5)';
      this.rrect(ctx, cxp - bw / 2, top + 50, bw, 8, 4);
      ctx.fillStyle = '#8ef0ff';
      this.rrect(ctx, cxp - bw / 2, top + 50, Math.max(4, (bw * this.comboTimer) / 2.6), 8, 4);
      ctx.globalAlpha = 1;
    }

    // first-run control hint
    if (this.hintT > 0 && this.phase === 'playing') {
      const a = clamp(this.hintT * 1.8, 0, 1) * (0.7 + Math.sin(this.t * 6) * 0.22);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      const fs = Math.min(21, this.viewW / 28);
      ctx.font = `900 ${fs}px "Trebuchet MS", system-ui, sans-serif`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(8,14,28,0.8)';
      const txt = this.touch ? 'TAP TO JUMP — TAP AGAIN TO DOUBLE JUMP' : 'SPACE TO JUMP — AGAIN TO DOUBLE JUMP';
      const hy = top + this.viewH * 0.58;
      ctx.strokeText(txt, this.viewW / 2, hy);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(txt, this.viewW / 2, hy);
      ctx.globalAlpha = 1;
    }

    // banner
    if (this.bannerT > 0 && this.banner) {
      const k = this.bannerT;
      const sc = Math.min(1.5, k > 1.2 ? 1 + (k - 1.2) * 1.2 : 1);
      ctx.save();
      ctx.translate(this.viewW / 2, top + this.viewH * 0.3);
      ctx.scale(sc, sc);
      ctx.globalAlpha = clamp(k, 0, 1);
      ctx.textAlign = 'center';
      ctx.font = `900 ${Math.min(46, this.viewW / 12)}px "Trebuchet MS", system-ui, sans-serif`;
      ctx.lineWidth = 9;
      ctx.strokeStyle = 'rgba(8,14,28,0.85)';
      ctx.strokeText(this.banner, 0, 0);
      ctx.fillStyle = '#ffe14a';
      ctx.fillText(this.banner, 0, 0);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}
