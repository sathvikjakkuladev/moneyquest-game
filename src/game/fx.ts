// Spell and battle effects built in code from pixel squares and tweens (no art needed).
import type * as Phaser from 'phaser';

const tween = (scene: Phaser.Scene, cfg: Phaser.Types.Tweens.TweenBuilderConfig) => new Promise<void>((r) => scene.tweens.add({ ...cfg, onComplete: () => r() }));
export const wait = (scene: Phaser.Scene, ms: number) => new Promise<void>((r) => scene.time.delayedCall(ms, r));

/** A beam of pixel squares from (x0,y) to (x1,y) in the spell's colour, with a white core. */
export async function beam(scene: Phaser.Scene, x0: number, x1: number, y: number, color: number, fast: boolean): Promise<void> {
  const g = scene.add.graphics().setDepth(900);
  const len = x1 - x0;
  const draw = (k: number) => {
    g.clear();
    const end = x0 + len * k;
    for (let x = x0; x < end; x += 4) {
      const wob = Math.round(Math.sin((x + scene.time.now / 20) / 9) * 2);
      g.fillStyle(color, 1).fillRect(x, y - 4 + wob, 4, 8);
      g.fillStyle(0xffffff, 1).fillRect(x, y - 1 + wob, 4, 2);
    }
  };
  const o = { k: 0 };
  await tween(scene, { targets: o, k: 1, duration: fast ? 120 : 260, onUpdate: () => draw(o.k) });
  await tween(scene, { targets: g, alpha: 0, duration: fast ? 80 : 200 });
  g.destroy();
}

/** A burst of pixel squares (sparkles, coins, hit sparks). */
export function burst(scene: Phaser.Scene, x: number, y: number, color: number, n = 10, spread = 26, fast = false): void {
  for (let i = 0; i < n; i++) {
    const sq = scene.add.rectangle(x, y, 3, 3, i % 3 === 0 ? 0xffffff : color).setDepth(950);
    const a = (i / n) * Math.PI * 2;
    scene.tweens.add({ targets: sq, x: x + Math.cos(a) * spread, y: y + Math.sin(a) * spread, alpha: 0, duration: fast ? 200 : 450, ease: 'Quad.easeOut', onComplete: () => sq.destroy() });
  }
}

/** A pixel-ring shield around a point; returns it so it can be popped later. */
export function shieldRing(scene: Phaser.Scene, x: number, y: number, r: number, color: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(800);
  for (let a = 0; a < Math.PI * 2; a += 0.12) {
    g.fillStyle(color, 0.9).fillRect(Math.round(x + Math.cos(a) * r) - 1, Math.round(y + Math.sin(a) * r * 1.1) - 1, 2, 2);
  }
  g.fillStyle(color, 0.15).fillCircle(x, y, r);
  scene.tweens.add({ targets: g, alpha: 0.6, duration: 500, yoyo: true, repeat: -1 });
  return g;
}

/** Coins flying from one point to another. */
export async function coinsFly(scene: Phaser.Scene, from: [number, number], to: [number, number], fast: boolean): Promise<void> {
  const coins = [0, 1, 2].map((i) => scene.add.rectangle(from[0] + i * 3, from[1], 4, 4, 0xfcc419).setStrokeStyle(1, 0xb8860b).setDepth(960));
  await Promise.all(coins.map((c, i) => tween(scene, { targets: c, x: to[0], y: to[1], delay: i * 60, duration: fast ? 150 : 420, ease: 'Quad.easeInOut' })));
  coins.forEach((c) => c.destroy());
}

export { tween };
