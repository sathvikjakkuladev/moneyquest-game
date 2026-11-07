// Draws a screen's fronts (src/core/fronts.ts): pieces of the background cut out and drawn at their
// base line, so the player, pets, NPCs and monsters (all depth = feet y) go behind them when higher up.
import type * as Phaser from 'phaser';
import type { Front } from '../core/fronts.ts';
import { cutFront } from '../core/fronts.ts';

const cuts = new Map<string, { x: number; y: number } | null>(); // texture key → where it goes (null: nothing kept)

/** `brighten` matches the white ADD overlay drawn on dark screens (0–1). */
export function addFronts(scene: Phaser.Scene, bgKey: string, fronts: readonly Front[] | undefined, brighten = 0): void {
  if (!fronts?.length) return;
  const img = scene.textures.get(bgKey).getSourceImage() as HTMLImageElement;
  const [w, h] = [img.width, img.height];
  const scale = 640 / w;
  let src: Uint8ClampedArray | null = null;
  for (const f of fronts) {
    const key = `front:${bgKey}:${JSON.stringify(f)}:${brighten}`; // edits in the map editor make a new key
    if (!cuts.has(key)) {
      if (!src) {
        const ctx = Object.assign(document.createElement('canvas'), { width: w, height: h }).getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);
        src = ctx.getImageData(0, 0, w, h).data;
      }
      const c = cutFront(src, w, h, f);
      if (!c.kept) {
        cuts.set(key, null);
        continue;
      }
      if (brighten) for (let i = 0; i < c.rgba.length; i += 4) if (c.rgba[i + 3]) for (let k = 0; k < 3; k++) c.rgba[i + k] = c.rgba[i + k]! + brighten * 255;
      const canvas = Object.assign(document.createElement('canvas'), { width: c.w, height: c.h });
      canvas.getContext('2d')!.putImageData(new ImageData(c.rgba as Uint8ClampedArray<ArrayBuffer>, c.w, c.h), 0, 0);
      scene.textures.addCanvas(key, canvas);
      cuts.set(key, { x: c.x, y: c.y });
    }
    const at = cuts.get(key);
    if (!at || !scene.textures.exists(key)) continue;
    scene.add.image(at.x * scale, at.y * scale, key).setOrigin(0).setScale(scale).setDepth(f.base);
  }
}
