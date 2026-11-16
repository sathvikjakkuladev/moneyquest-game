// The stage: game logic runs on a 640×360 stage, and the canvas draws it at RENDER× with smooth
// filtering (PLAN.md §12, decision 1). Art is exported at RENDER× its on-stage size, so a texture
// drawn at scale 1/RENDER is pixel-for-pixel.
import type * as Phaser from 'phaser';
import v2 from '../assets/v2.json';

export const STAGE_W = 640;
export const STAGE_H = 360;
export const RENDER = (v2 as { render: number }).render;
const BASE = (v2 as { basePath: string }).basePath;
const FILES = (v2 as unknown as { files: Record<string, { w: number; h: number }> }).files;

export const assetUrl = (rel: string) => BASE + rel;
export const hasAsset = (rel: string) => rel in FILES;
/** An exported image's size on the stage. */
export const stageSize = (rel: string): { w: number; h: number } => ({ w: FILES[rel]!.w / RENDER, h: FILES[rel]!.h / RENDER });

/** Every scene looks at the whole stage through a camera zoomed RENDER×. */
export function stageCamera(scene: Phaser.Scene): void {
  scene.cameras.main.setZoom(RENDER).centerOn(STAGE_W / 2, STAGE_H / 2);
}

/** Queue an exported image once, under its path as the texture key. Returns the key. */
export function queue(scene: Phaser.Scene, rel: string): string {
  if (!scene.textures.exists(rel) && hasAsset(rel)) scene.load.image(rel, assetUrl(rel));
  return rel;
}
/** Queue a sheet of equal cells (clips, VFX strips). */
export function queueSheet(scene: Phaser.Scene, rel: string, cell: [number, number]): string {
  if (!scene.textures.exists(rel) && hasAsset(rel)) scene.load.spritesheet(rel, assetUrl(rel), { frameWidth: cell[0], frameHeight: cell[1] });
  return rel;
}
/** Run `then` once everything queued since has loaded (at once if nothing needed loading). */
export function whenLoaded(scene: Phaser.Scene, keys: string[], then: () => void): void {
  if (keys.every((k) => scene.textures.exists(k))) return then();
  scene.load.once('complete', () => scene.sys.isActive() && keys.every((k) => scene.textures.exists(k)) && then());
  scene.load.start();
}
