// Tiny WebAudio synth — every sound is generated, so nothing needs loading.
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  resume() {
    if (!this.ctx) {
      const AC: typeof AudioContext =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol = 0.5,
    slideTo?: number,
    delay = 0,
  ) {
    if (this.muted || !this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol = 0.4, hp = 400, delay = 0) {
    if (this.muted || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.master);
    src.start(t0);
  }

  jump() {
    this.tone(330, 0.16, 'square', 0.28, 640);
  }
  doubleJump() {
    this.tone(520, 0.18, 'triangle', 0.3, 900);
    this.noise(0.12, 0.12, 900);
  }
  coin(step: number) {
    const base = 880 * Math.pow(1.0595, Math.min(18, step * 2));
    this.tone(base, 0.09, 'square', 0.22);
    this.tone(base * 1.5, 0.12, 'square', 0.14, undefined, 0.045);
  }
  land(power: number) {
    this.noise(0.1 + power * 0.08, 0.1 + power * 0.22, 240);
    this.tone(120, 0.1, 'sine', 0.2 * power, 60);
  }
  slam() {
    this.noise(0.3, 0.5, 120);
    this.tone(190, 0.3, 'sawtooth', 0.3, 40);
  }
  bump() {
    this.tone(150, 0.08, 'square', 0.2, 90);
  }
  death() {
    this.noise(0.5, 0.45, 180);
    this.tone(420, 0.5, 'sawtooth', 0.32, 60);
    this.tone(220, 0.7, 'square', 0.22, 40, 0.06);
  }
  milestone() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, 'square', 0.2, undefined, i * 0.07));
  }
  ui() {
    this.tone(640, 0.07, 'square', 0.18, 820);
  }
  best() {
    [659, 784, 988, 1318].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.24, undefined, i * 0.1));
  }
  /** triumphant fanfare when the finish line is crossed */
  victory() {
    const notes: Array<[number, number]> = [
      [523, 0],
      [659, 0.12],
      [784, 0.24],
      [1046, 0.36],
      [784, 0.56],
      [1046, 0.68],
      [1318, 0.82],
    ];
    for (const [f, d] of notes) {
      this.tone(f, 0.26, 'square', 0.2, undefined, d);
      this.tone(f * 0.5, 0.26, 'triangle', 0.13, undefined, d);
    }
  }
  rocket() {
    this.tone(220, 0.55, 'sine', 0.1, 1250);
    this.noise(0.5, 0.05, 1600);
  }
  boom() {
    this.noise(0.42, 0.34, 220);
    this.tone(150, 0.3, 'sine', 0.2, 50);
    // crackle
    for (let i = 0; i < 5; i++) this.noise(0.07, 0.07, 2600, 0.1 + i * 0.06);
  }
}

export const sfx = new Sfx();
