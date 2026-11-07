// Image helpers for the asset importer: RGBA buffers, pixelizing, and atlas packing.
import sharp from 'sharp';

export interface Img { w: number; h: number; data: Buffer } // RGBA, 4 bytes per pixel

export async function loadImg(input: string | Buffer, region?: { x: number; y: number; w: number; h: number }): Promise<Img> {
  let s = sharp(input).ensureAlpha();
  if (region) s = s.extract({ left: region.x, top: region.y, width: region.w, height: region.h });
  const { data, info } = await s.raw().toBuffer({ resolveWithObject: true });
  return { w: info.width, h: info.height, data };
}

export const toSharp = (img: Img) => sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } });

/** Bounding box of pixels with alpha above `min` (null if empty). */
export function alphaBox(img: Img, min = 0): { x: number; y: number; w: number; h: number } | null {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++)
      if (img.data[(y * img.w + x) * 4 + 3]! > min) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function crop(img: Img, b: { x: number; y: number; w: number; h: number }): Img {
  const out = Buffer.alloc(b.w * b.h * 4);
  for (let y = 0; y < b.h; y++) img.data.copy(out, y * b.w * 4, ((b.y + y) * img.w + b.x) * 4, ((b.y + y) * img.w + b.x + b.w) * 4);
  return { w: b.w, h: b.h, data: out };
}

/**
 * Turn smooth art into pixel art, the same way `MoneyQuest Assets/_tools/make_monster_sheets.py`
 * made the monster sheets: trim, fit inside maxW×maxH with Lanczos, cut alpha at a threshold
 * (no soft edges), and reduce to a small palette with no dithering.
 */
export async function pixelize(img: Img, maxW: number, maxH: number, colors = 40, alphaCut = 110): Promise<Img> {
  const box = alphaBox(img, 8);
  const src = box ? crop(img, box) : img;
  const k = Math.min(maxW / src.w, maxH / src.h);
  const w = Math.max(1, Math.round(src.w * k)), h = Math.max(1, Math.round(src.h * k));
  const small = await loadImg(await toSharp(src).resize(w, h, { kernel: 'lanczos3' }).png().toBuffer());
  const alpha = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = small.data[i * 4 + 3]! > alphaCut ? 255 : 0;
  const quant = await loadImg(await toSharp(small).png({ palette: true, colors, dither: 0, effort: 10 }).toBuffer());
  for (let i = 0; i < w * h; i++) quant.data[i * 4 + 3] = alpha[i]!;
  return quant;
}

export function flipX(img: Img): Img {
  const out = Buffer.alloc(img.data.length);
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) img.data.copy(out, (y * img.w + (img.w - 1 - x)) * 4, (y * img.w + x) * 4, (y * img.w + x) * 4 + 4);
  return { w: img.w, h: img.h, data: out };
}

/** Pad an image to w×h, anchored bottom-centre (so frames share a baseline). */
export function padBottomCenter(img: Img, w: number, h: number): Img {
  const out = Buffer.alloc(w * h * 4);
  const ox = Math.floor((w - img.w) / 2), oy = h - img.h;
  for (let y = 0; y < img.h; y++) img.data.copy(out, ((oy + y) * w + ox) * 4, y * img.w * 4, (y + 1) * img.w * 4);
  return { w, h, data: out };
}

export interface Packed { name: string; img: Img; x: number; y: number }

/** Shelf-pack images into one sheet (1 px gap so nearest-neighbour sampling never bleeds). */
export function pack(items: { name: string; img: Img }[], maxW = 1024): { w: number; h: number; placed: Packed[]; sheet: Img } {
  const sorted = [...items].sort((a, b) => b.img.h - a.img.h || b.img.w - a.img.w);
  const placed: Packed[] = [];
  let x = 1, y = 1, shelf = 0, w = 0;
  for (const it of sorted) {
    if (it.img.w + 2 > maxW) throw new Error(`${it.name} (${it.img.w}px) is wider than the ${maxW}px atlas`);
    if (x + it.img.w + 1 > maxW) {
      x = 1;
      y += shelf + 1;
      shelf = 0;
    }
    placed.push({ name: it.name, img: it.img, x, y });
    x += it.img.w + 1;
    shelf = Math.max(shelf, it.img.h);
    w = Math.max(w, x);
  }
  const h = y + shelf + 1;
  const data = Buffer.alloc(w * h * 4);
  for (const p of placed) for (let r = 0; r < p.img.h; r++) p.img.data.copy(data, ((p.y + r) * w + p.x) * 4, r * p.img.w * 4, (r + 1) * p.img.w * 4);
  return { w, h, placed, sheet: { w, h, data } };
}

/** Phaser JSON-hash atlas for packed frames. */
export function atlasJson(image: string, packed: { w: number; h: number; placed: Packed[] }) {
  const frames: Record<string, unknown> = {};
  for (const p of packed.placed)
    frames[p.name] = { frame: { x: p.x, y: p.y, w: p.img.w, h: p.img.h }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: p.img.w, h: p.img.h }, sourceSize: { w: p.img.w, h: p.img.h } };
  return { frames, meta: { app: 'moneyquest import-assets', image, size: { w: packed.w, h: packed.h }, scale: '1' } };
}
