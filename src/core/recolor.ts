// Pixel passes for the avatar, ported from the art set's reference scripts (docs/assets_v2/):
// recolor.py (costume colour sets), overlay.py (the skin test and the hair tint) and fit2.py
// (skin tones). Pure functions over RGBA byte arrays, so they are unit-tested without a browser.
import type { CostumeSet } from '../data/v2.ts';

export type Rgb = [number, number, number];
export const hexRgb = (hex: string): Rgb => { const n = parseInt(hex.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/** overlay.py's skin test: warm, r > g > b. */
export const isSkin = (r: number, g: number, b: number, a: number) => r > g && g > b && r - b > 40 && r > 80 && a > 128;

export interface Groups { groups: Record<string, { h: [number, number]; s: [number, number]; v: [number, number] }>; order: string[] }

/**
 * One pass over a body image: skin pixels move from the drawn skin tone (`skinBase`) to `skin`, and
 * costume pixels (grouped by hue, checked in `order`) shift to the colour set. Rows above `neckY(x)`
 * keep their colours apart from skin, which protects the rim light on the head.
 */
export function paintBody(data: Uint8ClampedArray, width: number, height: number, o: { skin: Rgb | null; skinBase: Rgb; set: CostumeSet | null; spec: Groups; protectAbove: (x: number, y: number) => boolean }): void {
  const map = o.set?.map ?? {};
  const groups = o.spec.order.filter((g) => map[g]).map((g) => ({ ...o.spec.groups[g]!, t: map[g]! }));
  const anyGroup = o.spec.order.map((g) => o.spec.groups[g]!);
  const k = o.skin ? [o.skin[0] / o.skinBase[0], o.skin[1] / o.skinBase[1], o.skin[2] / o.skinBase[2]] : null;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3]!;
      if (a === 0) continue;
      const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
      if (isSkin(r, g, b, a)) {
        if (k) { data[i] = r * k[0]!; data[i + 1] = g * k[1]!; data[i + 2] = b * k[2]!; }
        continue;
      }
      if (!groups.length || o.protectAbove(x, y)) continue;
      // RGB → HSV (h in degrees, s and v 0–1)
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      const v = mx / 255, s = mx > 0 ? d / mx : 0;
      let h = 0;
      if (d > 0) h = 60 * (mx === r ? (((g - b) / d) % 6 + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4);
      // recolor.py takes each pixel for the first group (in order) that contains it, mapped or not.
      const first = anyGroup.find((q) => h >= q.h[0] && h <= q.h[1] && s >= q.s[0] && s <= q.s[1] && v >= q.v[0] && v <= q.v[1]);
      const hit = first && groups.find((q) => q.h === first.h && q.s === first.s && q.v === first.v);
      if (!hit) continue;
      const nh = (((hit.t.h ?? 0) % 360) + 360) % 360 / 60;
      const ns = Math.min(1, Math.max(0, s * (hit.t.s_mul ?? 1) + (hit.t.s_add ?? 0)));
      const nv = Math.min(1, Math.max(0, v * (hit.t.v_mul ?? 1)));
      const f = nh - Math.floor(nh), p = nv * (1 - ns), q = nv * (1 - ns * f), t = nv * (1 - ns * (1 - f));
      const [R, G, B] = [[nv, t, p], [q, nv, p], [p, nv, t], [p, q, nv], [t, p, nv], [nv, p, q]][Math.floor(nh) % 6]!;
      data[i] = R! * 255 + 0.5; data[i + 1] = G! * 255 + 0.5; data[i + 2] = B! * 255 + 0.5;
    }
  }
}

/** Hair layers are drawn grey: colour = pixel / base × hair colour. */
export function tint(data: Uint8ClampedArray, colour: Rgb, base: number): void {
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    data[i] = (data[i]! / base) * colour[0]; data[i + 1] = (data[i + 1]! / base) * colour[1]; data[i + 2] = (data[i + 2]! / base) * colour[2];
  }
}
/** Iris layers take the eye colour flat. */
export function fill(data: Uint8ClampedArray, colour: Rgb): void {
  for (let i = 0; i < data.length; i += 4) if (data[i + 3]) { data[i] = colour[0]; data[i + 1] = colour[1]; data[i + 2] = colour[2]; }
}
/** Skin pixels of a layer (the face) move to the chosen skin tone. */
export function reskin(data: Uint8ClampedArray, skin: Rgb, base: Rgb): void {
  for (let i = 0; i < data.length; i += 4) if (isSkin(data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!)) { data[i] = (data[i]! * skin[0]) / base[0]; data[i + 1] = (data[i + 1]! * skin[1]) / base[1]; data[i + 2] = (data[i + 2]! * skin[2]) / base[2]; }
}
