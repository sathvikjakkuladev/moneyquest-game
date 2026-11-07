// Wearing a hat: each frame of a character's animation is measured once to find the top of the head,
// so the hat follows the head through walking, casting and turning.
import type * as Phaser from 'phaser';
import { HAT_ART } from '../data/hats.ts';
import { item } from '../data/items.ts';
import { pixelMapCanvas } from './pixelMap.ts';

const anchors = new Map<string, { x: number; y: number }>(); // `${atlas}|${frame}` → head-top point in frame pixels
const pixels = new Map<string, ImageData>();

function imageData(scene: Phaser.Scene, atlas: string): ImageData {
  let d = pixels.get(atlas);
  if (!d) {
    const src = scene.textures.get(atlas).getSourceImage() as HTMLImageElement;
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(src, 0, 0);
    d = ctx.getImageData(0, 0, c.width, c.height);
    pixels.set(atlas, d);
  }
  return d;
}

/** The middle of the top of the head in a frame: the first opaque row, centred over the top 6 rows. */
export function headTop(scene: Phaser.Scene, frame: Phaser.Textures.Frame): { x: number; y: number } {
  const key = `${frame.texture.key}|${frame.name}`;
  const hit = anchors.get(key);
  if (hit) return hit;
  const d = imageData(scene, frame.texture.key);
  const opaque = (x: number, y: number) => d.data[((frame.cutY + y) * d.width + frame.cutX + x) * 4 + 3]! > 0;
  let top = -1;
  for (let y = 0; y < frame.cutHeight && top < 0; y++) for (let x = 0; x < frame.cutWidth; x++) if (opaque(x, y)) { top = y; break; }
  let sum = 0, n = 0;
  for (let y = Math.max(0, top); y < Math.min(frame.cutHeight, top + 6); y++)
    for (let x = 0; x < frame.cutWidth; x++) if (opaque(x, y)) { sum += x; n++; }
  const a = { x: n ? sum / n : frame.cutWidth / 2, y: Math.max(0, top) };
  anchors.set(key, a);
  return a;
}

export function ensureHatTexture(scene: Phaser.Scene, art: string): string {
  const key = `hat:${art}`;
  if (!scene.textures.exists(key)) {
    scene.textures.addCanvas(key, pixelMapCanvas(HAT_ART[art]!));
  }
  return key;
}

/** A hat that sits on a character sprite; call update() each frame. */
export class Hat {
  private sprite: Phaser.GameObjects.Image;
  private sink: number;
  private scene: Phaser.Scene;
  private on: Phaser.GameObjects.Sprite;

  constructor(scene: Phaser.Scene, on: Phaser.GameObjects.Sprite, hatId: string, scale = 1) {
    this.scene = scene;
    this.on = on;
    const art = item(hatId)!.art;
    this.sink = HAT_ART[art]!.sink;
    this.sprite = scene.add.image(on.x, on.y, ensureHatTexture(scene, art)).setOrigin(0.5, 1).setScale(scale);
    this.update();
  }

  update(): void {
    const s = this.on, f = s.frame;
    const a = headTop(this.scene, f);
    const k = s.scaleX;
    const dx = (a.x - f.cutWidth * s.originX) * k * (s.flipX ? -1 : 1);
    const dy = (a.y - f.cutHeight * s.originY + this.sink) * s.scaleY;
    this.sprite.setPosition(Math.round(s.x + dx), Math.round(s.y + dy)).setFlipX(s.flipX).setDepth(s.depth + 0.1).setAlpha(s.alpha).setAngle(s.angle).setVisible(s.visible);
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
