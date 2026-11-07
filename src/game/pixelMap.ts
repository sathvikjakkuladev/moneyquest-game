// Draw a pixel map (rows of palette characters, '.' = transparent) onto a canvas.
import type { HatArt } from '../data/hats.ts';

export function pixelMapCanvas(art: Pick<HatArt, 'rows' | 'palette'>, scale = 1): HTMLCanvasElement {
  const w = Math.max(...art.rows.map((r) => r.length)), h = art.rows.length;
  const c = document.createElement('canvas');
  c.width = w * scale;
  c.height = h * scale;
  const ctx = c.getContext('2d')!;
  art.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const color = art.palette[ch];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }),
  );
  return c;
}
