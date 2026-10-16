import { HERO_AXIS, HERO_DATA_URL, HERO_SRC_H, HERO_SRC_W } from '../assets/hero';

/**
 * Cartoon 3D hero — cut-out puppet rig.
 *
 * The artwork is used *exactly as supplied*; nothing is repainted. At load we
 * slice the single image into body / arm / shoulder-cap layers using the
 * character's measured anatomy, then animate those slices with transforms.
 *
 *  • Arms are cut on a circle centred on the shoulder, so however far they
 *    swing the joint stays perfectly flush — no gaps, no rubber seams.
 *  • Only one arm needs cutting: the relaxed one. Mirroring it gives the
 *    opposite arm, which is why both arms can swing (and salute) in turn.
 *  • Legs are cut above the hip and hidden behind the torso, so they can
 *    swing and lift without ever showing a seam.
 */

const PAD = 18;
const OUTLINE_R = 12;
const OUTLINE_COLOR = 'rgba(10,18,36,0.88)';

// ---- measured anatomy, in source pixels ------------------------------------
const PIV_RX = 166; // shoulder of the relaxed arm (image right)
const PIV_RY = 200;
const PIV_LX = 55; // mirrored shoulder (image left)
const PIV_LY = 200;
const CAP_R = 27; // shoulder cap radius
const ARM_CUT = 25; // arm is everything beyond this radius
const ARM_Y0 = 196;
const ARM_Y1 = 310;
const LEG_TOP = 292; // legs are cut here…
const TORSO_BOT = 316; // …and the torso is drawn down to here, hiding the cut
const HIP_Y = 300;
const HIP_LX = 84;
const HIP_RX = 137;

/** erase window for the raised/waving arm, which the rig replaces */
const eraseEdge = (y: number) => (y < 115 ? 48 : y < 173 ? 58 : 63);

export interface HeroPose {
  sx: number;
  sy: number;
  rot: number;
  /** rotation pivot height above the feet */
  pivotY: number;
  /** body bob, source px (negative = up) */
  bob: number;
  /** 0..1 run cycle */
  step: number;
  /** leg lift amplitude, source px */
  legAmp: number;
  /** leg swing amplitude, radians */
  legSwing: number;
  /** both legs tucked up */
  tuck: number;
  /** arm rotations in local (mirrored) space, radians */
  armR: number;
  armL: number;
  alpha: number;
}

export function basePose(): HeroPose {
  return {
    sx: 1,
    sy: 1,
    rot: 0,
    pivotY: 0,
    bob: 0,
    step: 0,
    legAmp: 0,
    legSwing: 0,
    tuck: 0,
    armR: 0,
    armL: 0,
    alpha: 1,
  };
}

type Layer = { art: HTMLCanvasElement; ink: HTMLCanvasElement };

class HeroSprite {
  ready = false;
  readonly aspect = HERO_SRC_W / HERO_SRC_H;
  private img: HTMLImageElement | null = null;
  private body: Layer | null = null;
  private arm: Layer | null = null;
  private cap: Layer | null = null;
  private cw = 0;
  private ch = 0;

  load() {
    if (this.img) return;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        this.build(img);
        this.ready = true;
      } catch {
        this.ready = false;
      }
    };
    img.src = HERO_DATA_URL;
    this.img = img;
  }

  // ------------------------------------------------------------- build ----
  private build(img: HTMLImageElement) {
    const W = HERO_SRC_W;
    const H = HERO_SRC_H;
    const read = document.createElement('canvas');
    read.width = W;
    read.height = H;
    const rc = read.getContext('2d', { willReadFrequently: true });
    if (!rc) return;
    rc.drawImage(img, 0, 0, W, H);
    const src = rc.getImageData(0, 0, W, H);
    const sd = src.data;
    const opaque = (x: number, y: number) => sd[(y * W + x) * 4 + 3] > 110;

    // right-hand edge of the torso on each row (end of the first opaque run)
    const torsoEdge = new Int16Array(H);
    for (let y = 0; y < H; y++) {
      let start = -1;
      let end = W - 1;
      for (let x = 0; x < W; x++) {
        if (opaque(x, y)) {
          if (start < 0) start = x;
        } else if (start >= 0) {
          end = x - 1;
          break;
        }
      }
      torsoEdge[y] = end;
    }

    const isArm = (x: number, y: number) => {
      if (y < ARM_Y0 || y > ARM_Y1 || !opaque(x, y)) return false;
      const dx = x - PIV_RX;
      const dy = y - PIV_RY;
      return dx * dx + dy * dy > ARM_CUT * ARM_CUT && x > torsoEdge[y];
    };
    const isErased = (x: number, y: number) => opaque(x, y) && y < 215 && x < eraseEdge(y);
    const isCap = (x: number, y: number) => {
      if (!opaque(x, y)) return false;
      const dx = x - PIV_RX;
      const dy = y - PIV_RY;
      return dx * dx + dy * dy <= CAP_R * CAP_R;
    };

    this.cw = W + PAD * 2;
    this.ch = H + PAD * 2;
    this.body = this.layer(src, (x, y) => opaque(x, y) && !isArm(x, y) && !isErased(x, y));
    this.arm = this.layer(src, isArm);
    this.cap = this.layer(src, isCap);
  }

  /** Builds a padded colour canvas plus its dilated dark silhouette. */
  private layer(src: ImageData, test: (x: number, y: number) => boolean): Layer {
    const W = HERO_SRC_W;
    const H = HERO_SRC_H;
    const cut = document.createElement('canvas');
    cut.width = W;
    cut.height = H;
    const cc = cut.getContext('2d');
    const out = new ImageData(W, H);
    if (cc) {
      const s = src.data;
      const d = out.data;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          if (test(x, y)) {
            d[i] = s[i];
            d[i + 1] = s[i + 1];
            d[i + 2] = s[i + 2];
            d[i + 3] = s[i + 3];
          }
        }
      }
      cc.putImageData(out, 0, 0);
    }

    const art = document.createElement('canvas');
    art.width = this.cw;
    art.height = this.ch;
    art.getContext('2d')?.drawImage(cut, PAD, PAD);

    // dilate → tint = cartoon outline
    const ink = document.createElement('canvas');
    ink.width = this.cw;
    ink.height = this.ch;
    const ic = ink.getContext('2d');
    if (ic) {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        ic.drawImage(art, Math.cos(a) * OUTLINE_R, Math.sin(a) * OUTLINE_R);
      }
      ic.globalCompositeOperation = 'source-in';
      ic.fillStyle = OUTLINE_COLOR;
      ic.fillRect(0, 0, this.cw, this.ch);
    }
    return { art, ink };
  }

  // -------------------------------------------------------------- draw ----
  /**
   * Draws the hero with his feet at (cx, feetY) and the given world height.
   * Two passes: every silhouette first, then every colour layer, so outlines
   * can never land on top of artwork.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    cx: number,
    feetY: number,
    h: number,
    pose: HeroPose,
    outline = true,
  ): boolean {
    if (!this.body || !this.arm || !this.cap) return false;
    const s = h / HERO_SRC_H;

    ctx.save();
    if (pose.alpha < 1) ctx.globalAlpha = pose.alpha;
    ctx.translate(cx, feetY - pose.pivotY);
    if (pose.rot) ctx.rotate(pose.rot);
    ctx.scale(pose.sx * s, pose.sy * s);
    // pivotY/bob arrive in world units; inside this transform 1 unit = 1 source px
    ctx.translate(0, (pose.pivotY + pose.bob) / s);
    ctx.translate(-(PAD + HERO_AXIS * HERO_SRC_W), -(PAD + HERO_SRC_H));

    const a = pose.step * Math.PI * 2;
    const sinA = Math.sin(a);
    const liftL = -(Math.max(0, sinA) * pose.legAmp + pose.tuck);
    const liftR = -(Math.max(0, -sinA) * pose.legAmp + pose.tuck);
    const swL = pose.legSwing * sinA;
    const swR = -pose.legSwing * sinA;
    // the arm swinging back reads as "further away"
    const depthR = 1 - Math.max(0, Math.sin(pose.armR)) * 0.07;
    const depthL = 1 - Math.max(0, Math.sin(pose.armL)) * 0.07;

    const pass = (k: 'art' | 'ink') => {
      const body = this.body![k];
      const arm = this.arm![k];
      const cap = this.cap![k];
      const axis = PAD + HERO_AXIS * HERO_SRC_W;
      const legTop = PAD + LEG_TOP;
      const legH = this.ch - legTop;

      // --- legs ---------------------------------------------------------
      ctx.save();
      ctx.translate(PAD + HIP_LX, PAD + HIP_Y);
      ctx.rotate(swL);
      ctx.translate(-(PAD + HIP_LX), -(PAD + HIP_Y) + liftL);
      ctx.drawImage(body, 0, legTop, axis, legH, 0, legTop, axis, legH);
      ctx.restore();

      ctx.save();
      ctx.translate(PAD + HIP_RX, PAD + HIP_Y);
      ctx.rotate(swR);
      ctx.translate(-(PAD + HIP_RX), -(PAD + HIP_Y) + liftR);
      ctx.drawImage(body, axis, legTop, this.cw - axis, legH, axis, legTop, this.cw - axis, legH);
      ctx.restore();

      // --- torso + head (covers the hip cut) -----------------------------
      const torsoH = PAD + TORSO_BOT;
      ctx.drawImage(body, 0, 0, this.cw, torsoH, 0, 0, this.cw, torsoH);

      // --- arms -----------------------------------------------------------
      ctx.save();
      ctx.translate(PAD + PIV_RX, PAD + PIV_RY);
      ctx.rotate(pose.armR);
      ctx.scale(depthR, depthR);
      ctx.translate(-(PAD + PIV_RX), -(PAD + PIV_RY));
      ctx.drawImage(arm, 0, 0);
      ctx.restore();

      ctx.save();
      ctx.translate(PAD + PIV_LX, PAD + PIV_LY);
      ctx.scale(-1, 1);
      ctx.rotate(pose.armL);
      ctx.scale(depthL, depthL);
      ctx.translate(-(PAD + PIV_RX), -(PAD + PIV_RY));
      ctx.drawImage(arm, 0, 0);
      ctx.restore();

      // --- shoulder caps hide both joints ---------------------------------
      ctx.drawImage(cap, 0, 0);
      ctx.save();
      ctx.translate(PAD + PIV_LX, PAD + PIV_LY);
      ctx.scale(-1, 1);
      ctx.translate(-(PAD + PIV_RX), -(PAD + PIV_RY));
      ctx.drawImage(cap, 0, 0);
      ctx.restore();
    };

    if (outline) pass('ink');
    pass('art');
    ctx.restore();
    return true;
  }
}

export const hero = new HeroSprite();
export { HERO_DATA_URL };
