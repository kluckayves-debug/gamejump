# 🏃 Blox Rush

A juicy, blocky **obby endless runner** built with React, TypeScript, Vite and HTML5 Canvas.
Run, double-jump and ground-slam your way across a rainbow brick world, grab Robux tokens,
dodge buzz saws and lava — and reach the **1000 m finish line** for a fireworks finale.

> Runs at a locked 60 FPS on desktop and mobile. No game engine, no asset downloads —
> the entire game ships as a **single self-contained `index.html`**.

---

## ▶️ Play

**Local:**

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

**Build:**

```bash
npm run build      # outputs a single self-contained dist/index.html
npm run preview    # serve the production build locally
```

Because the build inlines every asset (JS, CSS and the character sprite as base64),
you can drop `dist/index.html` onto *any* static host — or just open it from disk.

---

## 🎮 Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Jump | `Space` / `W` / `↑` | Tap the screen |
| Double jump | Press jump again mid-air | Tap again mid-air |
| Ground slam | `S` / `↓` | Swipe down, or the `⤓` button |
| Brake / Sprint | `A` / `D` (or `←` / `→`) | On-screen `◀` `▶` buttons |
| Pause | `P` / `Esc` | HUD pause button |
| Restart | `R` / `Space` | Tap |
| Mute | `M` | 🔊 toggle on the menu |

Holding jump gives a floatier, higher arc. The game has **coyote time** (0.1 s) and
**jump buffering** (0.14 s), so inputs are never eaten at ledges or on landing.

---

## 🕹️ How to play

- **Collect Robux tokens.** Every 5 in a row raises your combo multiplier (up to ×8).
  The combo bar drains in 2.6 s — keep the chain alive.
- **Ground-slam buzz saws** for +75 each. Slamming from height pays a bonus.
- **Don't fall behind.** The camera never waits; drifting off the left edge ends the run.
- **Reach 1000 m** to trigger the victory sequence: the hero throws both arms up and the
  sky fills with yellow, red, green, blue, purple, orange and rainbow fireworks.

Speed ramps from 390 px/s to 880 px/s over the run, and the level generator shifts its
chunk mix as you get faster.

---

## ✨ Features

- **Procedural levels** — six weighted chunk types (flat runs, lava gaps, floating islands,
  sky platforms, buzz saws, stairways) that evolve with difficulty, plus a clean run-in to the finish.
- **Cut-out puppet animation** — the 3D character art is sliced at load into body / arm /
  shoulder-cap / leg layers and animated with transforms: alternating arm swing while
  running, hip-swinging legs, airborne tucks, a 360° flip on double jump, a death tumble,
  and a two-handed victory cheer. Arms are cut on a circle centred on the shoulder, so the
  joint stays flush at any angle.
- **Juice** — trauma-based screen shake, hit-stop freeze frames, slow-motion death,
  squash & stretch, speed lines, ghost trails, particle bursts, floating score popups.
- **Fireworks** — rockets that whistle, trail sparks and burst into 46-particle shells,
  including rainbow shells that cycle all seven hues.
- **Procedural audio** — every sound is synthesised with the Web Audio API. Zero audio files.
- **Full game states** — start screen, pause (with auto-pause on tab blur), game over and
  victory, all with instant restart.
- **Local leaderboard** — top 7 runs in `localStorage`, with 🏆 badges for completed runs.
- **Responsive** — resolution-independent world that re-anchors to the horizon, so portrait
  phones, landscape phones and ultrawide desktops all get a well-composed view.
- **Accessible** — respects `prefers-reduced-motion`.

---

## 🧱 Tech stack

- **React 19** + **TypeScript** — UI shell, overlays and state machine
- **HTML5 Canvas 2D** — all gameplay rendering
- **Tailwind CSS 4** — menus, HUD overlays and panels
- **Vite 7** + `vite-plugin-singlefile` — single-file production build
- **Web Audio API** — procedural sound synthesis

### Project layout

```
src/
├─ App.tsx                 # state machine, keyboard input, high scores
├─ assets/hero.ts          # character sprite, inlined as base64
├─ components/
│  ├─ GameCanvas.tsx       # canvas host, pointer input, touch controls
│  ├─ Overlays.tsx         # start / pause / game-over / victory screens
│  └─ ui.tsx               # buttons, panels, score table, hero art
└─ game/
   ├─ engine.ts            # game loop, physics, level gen, rendering
   ├─ hero.ts              # cut-out puppet rig for the character
   ├─ constants.ts         # tuning values, palette, types
   ├─ audio.ts             # Web Audio synth
   └─ storage.ts           # localStorage high scores
```

### Architecture notes

The game loop uses a **fixed 60 Hz timestep with an accumulator** (max 5 substeps per frame),
so physics stay deterministic regardless of display refresh rate. Rendering is decoupled and
runs once per `requestAnimationFrame`.

Performance comes from: DPR capped at 2, swap-remove particle pooling with a hard cap,
off-screen entity culling, pre-rendered character outlines (baked once at load, not per frame),
and no canvas shadow blurs in the hot path.

---

## 📄 License

[MIT](./LICENSE)
