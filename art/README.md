# Source art

`hero-source.png` is the original, full-resolution 3D character render.

It is **not** loaded at runtime and is deliberately kept outside `public/` so Vite
never copies it into the build output.

The sprite the game actually uses lives in [`src/assets/hero.ts`](../src/assets/hero.ts):
the same artwork with its white background removed, auto-trimmed to the character's
bounding box, resized to 199×448 and embedded as a base64 data URL so the production
build stays a single self-contained `index.html`.

At load time [`src/game/hero.ts`](../src/game/hero.ts) slices that sprite into
body / arm / shoulder-cap / leg layers to drive the puppet animation. The artwork
itself is never repainted or restyled — all movement comes from transforms.
