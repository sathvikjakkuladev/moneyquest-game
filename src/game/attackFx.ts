// Monster attack effects: one per attack in monster_attacks.json, drawn in code (glowing particles,
// shockwaves, trails and outlined icons) on top of the boss's attack clip or a regular monster's
// code-driven motion. Nothing here is art from the set; the icons are drawn on canvases at load.
import type * as Phaser from 'phaser';

// ── Soft textures and outlined icons, drawn once per game ───────────────────────────────────
const INK = '#1d1530';

function mk(scene: Phaser.Scene, key: string, w: number, h: number, draw: (x: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, w, h);
  if (!t) return;
  const x = t.getContext();
  x.lineJoin = 'round';
  x.lineCap = 'round';
  draw(x);
  t.refresh();
}

function radial(x: CanvasRenderingContext2D, r: number, stops: [number, string][]): void {
  const g = x.createRadialGradient(r, r, 0, r, r, r);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  x.fillStyle = g;
  x.fillRect(0, 0, r * 2, r * 2);
}

/** Fill a path with a colour and a thick dark outline, like the art set's flat cartoon style. */
function inked(x: CanvasRenderingContext2D, path: () => void, fill: string, lw = 4): void {
  x.beginPath();
  path();
  x.fillStyle = fill;
  x.fill();
  x.lineWidth = lw;
  x.strokeStyle = INK;
  x.stroke();
}

export function makeAttackTextures(scene: Phaser.Scene): void {
  mk(scene, 'fx_soft', 64, 64, (x) => radial(x, 32, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]));
  mk(scene, 'fx_dot', 16, 16, (x) => radial(x, 8, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]));
  mk(scene, 'fx_smoke', 48, 48, (x) => radial(x, 24, [[0, 'rgba(255,255,255,0.6)'], [0.6, 'rgba(255,255,255,0.3)'], [1, 'rgba(255,255,255,0)']]));
  mk(scene, 'fx_ring', 128, 128, (x) => {
    const g = x.createRadialGradient(64, 64, 40, 64, 64, 64);
    [[0, 'rgba(255,255,255,0)'], [0.55, 'rgba(255,255,255,0.15)'], [0.8, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']].forEach(([o, c]) => g.addColorStop(o as number, c as string));
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
  });
  mk(scene, 'fx_spark', 32, 32, (x) => {
    x.translate(16, 16);
    for (const [len, wid, a] of [[16, 2.2, 1], [9, 4, 0.6]] as const) {
      x.fillStyle = `rgba(255,255,255,${a})`;
      for (let k = 0; k < 4; k++) {
        x.rotate(Math.PI / 2);
        x.beginPath();
        x.moveTo(0, -len);
        x.lineTo(wid, 0);
        x.lineTo(-wid, 0);
        x.fill();
      }
    }
  });
  mk(scene, 'fx_streak', 48, 8, (x) => {
    const g = x.createLinearGradient(0, 0, 48, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    x.fillStyle = g;
    x.beginPath();
    x.ellipse(24, 4, 24, 4, 0, 0, Math.PI * 2);
    x.fill();
  });
  // Icons (64×64, outlined).
  mk(scene, 'ico_coin', 64, 64, (x) => {
    inked(x, () => x.arc(32, 32, 26, 0, Math.PI * 2), '#ffd43b');
    inked(x, () => x.arc(32, 32, 17, 0, Math.PI * 2), '#fab005', 3);
    x.fillStyle = '#fff9db';
    x.beginPath();
    x.ellipse(24, 22, 6, 3.5, -0.6, 0, Math.PI * 2);
    x.fill();
  });
  mk(scene, 'ico_tag', 64, 64, (x) => {
    inked(x, () => {
      x.moveTo(8, 32);
      x.lineTo(24, 12);
      x.lineTo(58, 12);
      x.lineTo(58, 52);
      x.lineTo(24, 52);
      x.closePath();
    }, '#ff4d6d');
    inked(x, () => x.arc(24, 32, 5, 0, Math.PI * 2), '#fff', 3);
    x.fillStyle = '#ffe3e3';
    x.fillRect(32, 22, 20, 5);
    x.fillRect(32, 32, 14, 5);
    x.fillRect(32, 42, 18, 4);
  });
  mk(scene, 'ico_bill', 64, 40, (x) => {
    inked(x, () => x.roundRect(4, 4, 56, 32, 5), '#69db7c');
    inked(x, () => x.arc(32, 20, 9, 0, Math.PI * 2), '#b2f2bb', 3);
    x.fillStyle = '#2b8a3e';
    x.fillRect(10, 10, 6, 6);
    x.fillRect(48, 24, 6, 6);
  });
  mk(scene, 'ico_lock', 64, 64, (x) => {
    x.lineWidth = 9;
    x.strokeStyle = INK;
    x.beginPath();
    x.arc(32, 26, 14, Math.PI, 0);
    x.stroke();
    x.lineWidth = 5;
    x.strokeStyle = '#ced4da';
    x.stroke();
    inked(x, () => x.roundRect(12, 26, 40, 32, 6), '#9b5de5');
    inked(x, () => {
      x.arc(32, 38, 5, 0, Math.PI * 2);
    }, INK, 2);
    x.fillStyle = INK;
    x.fillRect(30, 40, 4, 10);
  });
  mk(scene, 'ico_link', 48, 32, (x) => {
    x.lineWidth = 10;
    x.strokeStyle = INK;
    x.beginPath();
    x.roundRect(6, 6, 36, 20, 10);
    x.stroke();
    x.lineWidth = 5;
    x.strokeStyle = '#adb5bd';
    x.stroke();
  });
  mk(scene, 'ico_feather', 64, 64, (x) => {
    x.translate(32, 32);
    x.rotate(-0.6);
    inked(x, () => x.ellipse(0, 0, 12, 28, 0, 0, Math.PI * 2), '#9775fa');
    inked(x, () => x.ellipse(0, -10, 7, 8, 0, 0, Math.PI * 2), '#f783ac', 3);
    x.fillStyle = '#fff0f6';
    x.beginPath();
    x.arc(0, -10, 3, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = INK;
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(0, -24);
    x.lineTo(0, 30);
    x.stroke();
  });
  mk(scene, 'ico_shard', 40, 64, (x) => {
    inked(x, () => {
      x.moveTo(20, 2);
      x.lineTo(34, 30);
      x.lineTo(22, 62);
      x.lineTo(6, 30);
      x.closePath();
    }, '#a5d8ff');
    x.fillStyle = 'rgba(255,255,255,0.85)';
    x.beginPath();
    x.moveTo(20, 8);
    x.lineTo(24, 30);
    x.lineTo(20, 52);
    x.lineTo(14, 30);
    x.fill();
  });
  const arrow = (key: string, fill: string, up: boolean) => mk(scene, key, 48, 64, (x) => {
    if (!up) {
      x.translate(0, 64);
      x.scale(1, -1);
    }
    inked(x, () => {
      x.moveTo(24, 4);
      x.lineTo(44, 28);
      x.lineTo(32, 28);
      x.lineTo(32, 60);
      x.lineTo(16, 60);
      x.lineTo(16, 28);
      x.lineTo(4, 28);
      x.closePath();
    }, fill);
  });
  arrow('ico_up', '#51cf66', true);
  arrow('ico_down', '#ff4d4f', false);
  mk(scene, 'ico_hook', 48, 64, (x) => {
    x.lineWidth = 9;
    x.strokeStyle = INK;
    x.beginPath();
    x.moveTo(26, 4);
    x.lineTo(26, 40);
    x.arc(16, 40, 10, 0, Math.PI, false);
    x.lineTo(6, 32);
    x.stroke();
    x.lineWidth = 4;
    x.strokeStyle = '#e9ecef';
    x.stroke();
    inked(x, () => {
      x.moveTo(6, 26);
      x.lineTo(12, 34);
      x.lineTo(1, 34);
      x.closePath();
    }, '#e9ecef', 2);
  });
  mk(scene, 'ico_flame', 48, 64, (x) => {
    inked(x, () => {
      x.moveTo(24, 2);
      x.bezierCurveTo(44, 22, 48, 40, 40, 52);
      x.bezierCurveTo(32, 64, 16, 64, 8, 52);
      x.bezierCurveTo(0, 40, 6, 26, 16, 18);
      x.bezierCurveTo(16, 28, 22, 30, 24, 2);
    }, '#b16cff');
    inked(x, () => {
      x.moveTo(24, 26);
      x.bezierCurveTo(34, 38, 34, 50, 24, 56);
      x.bezierCurveTo(14, 50, 14, 40, 24, 26);
    }, '#f3d9fa', 2);
  });
  mk(scene, 'ico_rock', 48, 40, (x) => {
    inked(x, () => {
      x.moveTo(6, 30);
      x.lineTo(10, 12);
      x.lineTo(26, 4);
      x.lineTo(42, 14);
      x.lineTo(44, 32);
      x.lineTo(26, 38);
      x.closePath();
    }, '#868e96');
    x.fillStyle = '#ced4da';
    x.beginPath();
    x.moveTo(14, 14);
    x.lineTo(26, 8);
    x.lineTo(30, 16);
    x.lineTo(18, 20);
    x.fill();
  });
  mk(scene, 'ico_bag', 64, 64, (x) => {
    x.lineWidth = 7;
    x.strokeStyle = INK;
    x.beginPath();
    x.arc(32, 20, 10, Math.PI, 0);
    x.stroke();
    inked(x, () => x.roundRect(12, 20, 40, 38, 5), '#f06595');
    x.fillStyle = '#ffdeeb';
    x.fillRect(18, 28, 28, 5);
  });
  mk(scene, 'ico_glyph', 32, 32, (x) => {
    x.lineWidth = 5;
    x.strokeStyle = '#c5f6fa';
    x.beginPath();
    x.moveTo(6, 26);
    x.lineTo(16, 6);
    x.lineTo(26, 26);
    x.moveTo(10, 18);
    x.lineTo(22, 18);
    x.stroke();
  });
  mk(scene, 'ico_snow', 32, 32, (x) => {
    x.strokeStyle = '#ffffff';
    x.lineWidth = 3;
    x.translate(16, 16);
    for (let k = 0; k < 3; k++) {
      x.rotate(Math.PI / 3);
      x.beginPath();
      x.moveTo(0, -13);
      x.lineTo(0, 13);
      x.stroke();
    }
  });
}

// ── Building blocks ──────────────────────────────────────────────────────────────────────────
type XY = [number, number];
type Img = Phaser.GameObjects.Image;
export interface AttackCtx {
  scene: Phaser.Scene;
  foe: Img; // the attacker (a boss's sprite or a monster's image)
  player: Img; // the target
  from: XY; // the attacker's middle
  to: XY; // the target's middle
  feet: number;
  boss: boolean;
  hit: number; // which hit of a multi-hit attack (1-based)
  of: number;
  /** A boss plays its attack clip alongside the effect; resolves when it ends. */
  clip?: () => Promise<void>;
}
type Fx = (c: AttackCtx) => Promise<void>;

// Blend mode numbers (Phaser.BlendModes), written out so this file needs no Phaser code at import time.
const NORMAL = 0, ADD = 1;
const WHITE = 0xffffff;
const tw = (scene: Phaser.Scene, cfg: Phaser.Types.Tweens.TweenBuilderConfig) => new Promise<void>((r) => scene.tweens.add({ ...cfg, onComplete: () => r() }));
const pause = (scene: Phaser.Scene, ms: number) => new Promise<void>((r) => scene.time.delayedCall(ms, r));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** The art is bigger than the old pixel set, so every effect is scaled up by this. */
const K = 1.35;
/** When a boss clip's strike lands (frame 7 of 16 at 12 fps). */
const CLIP_STRIKE = 560;

function glow(s: Phaser.Scene, x: number, y: number, color: number, size: number, ms = 300, alpha = 0.85): Img {
  size *= K;
  const im = s.add.image(x, y, 'fx_soft').setTint(color).setBlendMode(ADD).setDepth(940).setAlpha(alpha).setScale(size / 160);
  s.tweens.add({ targets: im, scale: size / 64, alpha: 0, duration: ms, ease: 'Quad.easeOut', onComplete: () => im.destroy() });
  return im;
}

function ring(s: Phaser.Scene, x: number, y: number, color: number, size: number, ms = 380, flat = 1): void {
  size *= K;
  const im = s.add.image(x, y, 'fx_ring').setTint(color).setBlendMode(ADD).setDepth(939).setScale(0.1, 0.1 * flat);
  s.tweens.add({ targets: im, scaleX: size / 128, scaleY: (size / 128) * flat, alpha: 0, duration: ms, ease: 'Cubic.easeOut', onComplete: () => im.destroy() });
}

interface SparkO { n?: number; colors?: number[]; speed?: [number, number]; life?: [number, number]; size?: number; gravity?: number; angle?: [number, number]; tex?: string; add?: boolean; depth?: number; rotate?: boolean }
function sparks(s: Phaser.Scene, x: number, y: number, o: SparkO = {}): void {
  const life = o.life ?? [260, 560];
  const sp = o.speed ?? [60, 220];
  const em = s.add.particles(x, y, o.tex ?? 'fx_dot', {
    speed: { min: sp[0] * K, max: sp[1] * K },
    angle: { min: (o.angle ?? [0, 360])[0], max: (o.angle ?? [0, 360])[1] },
    lifespan: { min: life[0], max: life[1] },
    scale: { start: (o.size ?? 0.6) * K, end: 0 },
    alpha: { start: 1, end: 0 },
    rotate: o.rotate ? { min: 0, max: 360 } : 0,
    gravityY: o.gravity ?? 260,
    tint: o.colors ?? [WHITE],
    blendMode: o.add === false ? NORMAL : ADD,
    emitting: false,
  }).setDepth(o.depth ?? 950);
  em.explode(o.n ?? 14);
  s.time.delayedCall(life[1] + 80, () => em.destroy());
}

function smoke(s: Phaser.Scene, x: number, y: number, color: number, n = 6, spread = 60): void {
  const em = s.add.particles(x, y, 'fx_smoke', {
    speedX: { min: -spread * K, max: spread * K }, speedY: { min: -40, max: -5 }, lifespan: { min: 380, max: 700 },
    scale: { start: 0.4 * K, end: 1.2 * K }, alpha: { start: 0.55, end: 0 }, tint: [color], emitting: false,
  }).setDepth(905);
  em.explode(n);
  s.time.delayedCall(800, () => em.destroy());
}

function trail(s: Phaser.Scene, target: { x: number; y: number }, colors: number[], size = 0.55, tex = 'fx_dot'): () => void {
  const em = s.add.particles(0, 0, tex, {
    follow: target, lifespan: { min: 180, max: 420 }, speed: { min: 4, max: 34 }, scale: { start: size * K, end: 0 }, alpha: { start: 0.95, end: 0 },
    tint: colors, blendMode: tex.startsWith('ico_') ? NORMAL : ADD, frequency: 14, quantity: 2, rotate: tex === 'fx_spark' || tex.startsWith('ico_') ? { min: 0, max: 360 } : 0,
  }).setDepth(915);
  return () => {
    em.stop();
    s.time.delayedCall(480, () => em.destroy());
  };
}

function shake(c: AttackCtx, ms = 160, k = 0.008): void {
  c.scene.cameras.main.shake(ms, k);
}

/** A soft see-through tint over the screen (never a full-screen strobe), at most once per attack. */
function flash(c: AttackCtx, color: number, ms = 160): void {
  const s = c.scene;
  if (s.data.get('afxFlashed')) return;
  s.data.set('afxFlashed', true);
  const r = s.add.rectangle(320, 180, 640, 360, color, 0.2).setDepth(990).setBlendMode(ADD);
  s.tweens.add({ targets: r, alpha: 0, duration: ms + 160, onComplete: () => r.destroy() });
}

/** A darkened sky or tint that fades in and out over the whole fight (storms, deep water). */
async function dim(c: AttackCtx, color: number, alpha: number, ms: number): Promise<() => Promise<void>> {
  const s = c.scene;
  const r = s.add.rectangle(320, 180, 640, 360, color, 1).setDepth(880).setAlpha(0);
  await tw(s, { targets: r, alpha, duration: ms });
  return () => tw(s, { targets: r, alpha: 0, duration: 300 }).then(() => r.destroy());
}

/** The moment of impact: glow, shockwave, sparks, dust, a shake and the target knocked back. */
function hit(c: AttackCtx, color: number, power = 1, at: XY = c.to, hot = WHITE): void {
  const s = c.scene;
  glow(s, at[0], at[1], hot, 70 * power + 30, 180, 1);
  glow(s, at[0], at[1], color, 130 * power + 40, 380, 0.8);
  ring(s, at[0], at[1], color, 120 * power + 40, 380);
  sparks(s, at[0], at[1], { n: Math.round(16 * power + 6), colors: [color, hot, color], speed: [80, 260 * power + 60], size: 0.55 });
  sparks(s, at[0], at[1], { n: Math.round(5 * power + 2), colors: [hot], tex: 'fx_spark', speed: [20, 90], size: 0.7, gravity: 0, rotate: true, life: [200, 420] });
  if (power >= 0.8) {
    smoke(s, at[0], c.feet - 4, 0xd8d2c4, 5);
    shake(c, 150 + 60 * power, 0.004 + 0.004 * power);
    const p = c.player;
    if (!s.tweens.isTweening(p)) {
      const x = p.x;
      const away = c.to[0] < c.from[0] ? -1 : 1; // knocked away from the attacker
      s.tweens.add({ targets: p, x: x + 10 * power * away, duration: 70, yoyo: true, ease: 'Quad.easeOut', onComplete: () => p.setX(x) });
    }
  }
}

/** Light and sparks pull into a point (the attacker gathering power). */
function gather(c: AttackCtx, at: XY, color: number, ms = 360, r = 70): void {
  const s = c.scene;
  const g = s.add.image(at[0], at[1], 'fx_soft').setTint(color).setBlendMode(ADD).setDepth(916).setScale(1.8 * K).setAlpha(0);
  s.tweens.add({ targets: g, scale: 0.6 * K, alpha: 0.9, duration: ms, ease: 'Quad.easeIn', onComplete: () => g.destroy() });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rnd(0, 0.4);
    const rr = rnd(r * 0.7, r) * K;
    const d = s.add.image(at[0] + Math.cos(a) * rr, at[1] + Math.sin(a) * rr, 'fx_dot').setTint(i % 3 ? color : WHITE).setBlendMode(ADD).setDepth(917).setScale(0.55 * K);
    s.tweens.add({ targets: d, x: at[0], y: at[1], scale: 0.1, duration: ms * rnd(0.7, 1), ease: 'Cubic.easeIn', onComplete: () => d.destroy() });
  }
}

/** The attacker squashes down while gathering power, then springs back. */
async function windup(c: AttackCtx, color: number, ms = 240): Promise<void> {
  const f = c.foe;
  const sx = f.scaleX, sy = f.scaleY;
  gather(c, c.from, color, ms);
  await tw(c.scene, { targets: f, scaleX: sx * 1.07, scaleY: sy * 0.93, duration: ms * 0.6, ease: 'Sine.easeOut' });
  await tw(c.scene, { targets: f, scaleX: sx, scaleY: sy, duration: ms * 0.4, ease: 'Back.easeOut' });
  f.setScale(sx, sy);
}

function ghost(s: Phaser.Scene, f: Img, color: number): void {
  const im = s.add.image(f.x, f.y, f.texture.key, f.frame.name).setOrigin(f.originX, f.originY).setScale(f.scaleX, f.scaleY).setAngle(f.angle).setFlipX(f.flipX).setTint(color).setAlpha(0.5).setBlendMode(ADD).setDepth(f.depth - 1);
  s.tweens.add({ targets: im, alpha: 0, duration: 260, onComplete: () => im.destroy() });
}

interface ShotO { n?: number; scale?: number; arc?: number; spin?: number; stagger?: number; dur?: number; spreadY?: number; col: number; hot?: number; wob?: number; trailTex?: string; from?: XY; power?: number; keys?: string[] }
/** Things launched at the target: each pops out, flies with a glow and a trail, and bursts on impact. */
async function shot(c: AttackCtx, key: string, o: ShotO): Promise<void> {
  const s = c.scene;
  const n = o.n ?? 1;
  const hot = o.hot ?? WHITE;
  const runs: Promise<void>[] = [];
  for (let i = 0; i < n; i++) {
    const k = o.keys ? o.keys[i % o.keys.length]! : key;
    const sc = (o.scale ?? 0.6) * K;
    const [fx, fy] = o.from ?? c.from;
    const x0 = fx - 14, y0 = fy + rnd(-6, 6);
    const x1 = c.to[0], y1 = c.to[1] + (o.spreadY ?? 0) * (n > 1 ? i / (n - 1) - 0.5 : 0);
    const arc = (o.arc ?? 0) * rnd(0.7, 1.3);
    const dur = o.dur ?? 460;
    runs.push((async () => {
      await pause(s, (o.stagger ?? 80) * i);
      const img = s.add.image(x0, y0, k).setScale(0).setDepth(920);
      const halo = s.add.image(x0, y0, 'fx_soft').setTint(o.col).setBlendMode(ADD).setDepth(919).setAlpha(0.7).setScale(0);
      glow(s, x0, y0, o.col, 50, 220);
      const stop = trail(s, img, [o.col, hot, o.col], 0.45, o.trailTex);
      await tw(s, { targets: img, scale: sc, duration: 100, ease: 'Back.easeOut' });
      const hs = (img.displayWidth * 2) / 64;
      const p = { t: 0 };
      await tw(s, {
        targets: p, t: 1, duration: dur, ease: 'Sine.easeIn',
        onUpdate: () => {
          const x = lerp(x0, x1, p.t);
          const y = lerp(y0, y1, p.t) - arc * 4 * p.t * (1 - p.t) + Math.sin(p.t * Math.PI * 3 + i) * (o.wob ?? 0) * (1 - p.t);
          img.setPosition(x, y).setAngle(img.angle + (o.spin ?? 0));
          halo.setPosition(x, y).setScale(hs * (1 + Math.sin(p.t * 30) * 0.08));
        },
      });
      stop();
      hit(c, o.col, (o.power ?? 1) * (i === n - 1 ? 1 : 0.5), [img.x, img.y], hot);
      img.destroy();
      halo.destroy();
    })());
  }
  await Promise.all(runs);
}

/** Things falling from the sky with speed streaks, landing in dust and sparks. */
async function rain(c: AttackCtx, key: string, o: { n?: number; scale?: number; wide?: boolean; dur?: number; spin?: number; col: number; hot?: number; power?: number }): Promise<void> {
  const s = c.scene;
  const n = o.n ?? 1;
  const runs: Promise<void>[] = [];
  for (let i = 0; i < n; i++) {
    const x = o.wide ? rnd(30, 610) : c.to[0] + (n > 1 ? rnd(-46, 46) : 0);
    const y = o.wide ? c.feet - rnd(0, 30) : n > 1 ? c.feet - rnd(10, 60) : c.to[1];
    const onTarget = !o.wide || Math.abs(x - c.to[0]) < 50;
    runs.push((async () => {
      await pause(s, (o.wide ? 50 : 90) * i + rnd(0, 40));
      const img = s.add.image(x + 30, -40, key).setScale((o.scale ?? 0.6) * K).setDepth(930).setAngle(rnd(-15, 15));
      const streak = s.add.image(img.x, img.y, 'fx_streak').setTint(o.col).setBlendMode(ADD).setDepth(929).setOrigin(1, 0.5).setAngle(100).setScale(2.6, 2.4).setAlpha(0.7);
      const shadow = s.add.ellipse(x, c.feet + 2, 8, 4, 0x000000, 0.35).setDepth(c.feet - 1);
      s.tweens.add({ targets: shadow, scaleX: 4, scaleY: 3, duration: (o.dur ?? 420) });
      await tw(s, { targets: img, x, y, duration: o.dur ?? 420, ease: 'Quad.easeIn', onUpdate: () => { img.angle += o.spin ?? 0; streak.setPosition(img.x, img.y); } });
      shadow.destroy();
      streak.destroy();
      if (onTarget) hit(c, o.col, (o.power ?? 1) * (n > 1 ? 0.55 : 1), [x, y], o.hot);
      else {
        glow(s, x, y, o.col, 60, 240);
        sparks(s, x, y, { n: 7, colors: [o.col, WHITE], speed: [50, 170], angle: [200, 340], size: 0.45 });
        smoke(s, x, y, 0xd8d2c4, 3, 30);
      }
      await tw(s, { targets: img, y: y - 10, alpha: 0, angle: img.angle + 40, duration: 220, ease: 'Quad.easeOut' });
      img.destroy();
    })());
  }
  await Promise.all(runs);
}

/** A glowing energy beam that lances out, crackles while it holds, then thins away. */
async function beam(c: AttackCtx, o: { col: number; hot?: number; width?: number; jitter?: number; hold?: number; from?: XY; to?: XY; zig?: boolean }): Promise<void> {
  const s = c.scene;
  const hot = o.hot ?? WHITE;
  const [fx, fy] = o.from ?? c.from;
  const [tx, ty] = o.to ?? c.to;
  const g = s.add.graphics().setDepth(912).setBlendMode(ADD);
  const st = { k: 0, w: 1 };
  const flare = s.add.image(fx, fy, 'fx_soft').setTint(o.col).setBlendMode(ADD).setDepth(913).setScale(1.4 * K);
  const draw = () => {
    g.clear();
    const w = (o.width ?? 9) * K * st.w * (1 + Math.sin(s.time.now / 28) * 0.12);
    const xe = lerp(fx, tx, st.k), ye = lerp(fy, ty, st.k);
    const pts: XY[] = [];
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const edge = Math.sin(t * Math.PI);
      const j = (o.jitter ?? 2) * K;
      const zig = o.zig ? (i % 2 ? 1 : -1) * j * 2.2 * edge : 0;
      pts.push([lerp(fx, xe, t), lerp(fy, ye, t) + Math.sin(t * 9 + s.time.now / 40) * j * edge + rnd(-1, 1) * j * 0.4 * edge + zig]);
    }
    for (const [lw, col, a] of [[w * 3.2, o.col, 0.18], [w * 1.8, o.col, 0.45], [w, o.col, 0.9], [w * 0.4, hot, 1]] as const) {
      g.lineStyle(lw, col, a).beginPath().moveTo(pts[0]![0], pts[0]![1]);
      pts.slice(1).forEach(([x, y]) => g.lineTo(x, y));
      g.strokePath();
    }
    flare.setScale((1.1 + Math.sin(s.time.now / 22) * 0.2) * K).setAlpha(st.w);
  };
  const ev = s.time.addEvent({ delay: 16, loop: true, callback: draw });
  await tw(s, { targets: st, k: 1, duration: 160, ease: 'Cubic.easeIn' });
  hit(c, o.col, 1, [tx, ty], hot);
  const em = s.add.particles(tx, ty, 'fx_dot', { speed: { min: 60, max: 240 }, angle: { min: 110, max: 250 }, lifespan: { min: 160, max: 380 }, scale: { start: 0.6, end: 0 }, tint: [o.col, hot], blendMode: ADD, frequency: 18, quantity: 3, gravityY: 200 }).setDepth(950);
  shake(c, o.hold ?? 360, 0.004);
  await pause(s, o.hold ?? 360);
  em.stop();
  await tw(s, { targets: st, w: 0, duration: 170, ease: 'Quad.easeIn' });
  ev.remove();
  g.destroy();
  flare.destroy();
  s.time.delayedCall(400, () => em.destroy());
}

/** Lightning: a jagged, branching bolt from the sky that flickers twice. */
async function bolt(c: AttackCtx, o: { col: number; n?: number; at?: XY; spread?: number }): Promise<void> {
  const s = c.scene;
  const n = o.n ?? 1;
  for (let i = 0; i < n; i++) {
    const tx = (o.at ?? c.to)[0] + (n > 1 ? (i - (n - 1) / 2) * (o.spread ?? 40) : 0), ty = c.feet - 6;
    const path: XY[] = [];
    let x = tx + rnd(-50, 50);
    for (let y = -10; y < ty; y += 22) {
      path.push([x, y]);
      x = lerp(x, tx, 0.35) + rnd(-18, 18);
    }
    path.push([tx, ty]);
    const g = s.add.graphics().setDepth(946).setBlendMode(ADD);
    const draw = () => {
      g.clear();
      for (const [lw, col, a] of [[16, o.col, 0.22], [7, o.col, 0.8], [2.5, WHITE, 1]] as const) {
        g.lineStyle(lw, col, a).beginPath().moveTo(path[0]![0], path[0]![1]);
        path.slice(1).forEach(([px, py]) => g.lineTo(px + rnd(-1.5, 1.5), py));
        g.strokePath();
      }
      const b = path[Math.floor(path.length / 2)]!;
      g.lineStyle(2.5, o.col, 0.85).beginPath().moveTo(b[0], b[1]).lineTo(b[0] + rnd(24, 50) * (Math.random() < 0.5 ? -1 : 1), b[1] + rnd(20, 44)).strokePath();
    };
    draw();
    flash(c, o.col, 80);
    const onTarget = Math.abs(tx - c.to[0]) < 30;
    if (onTarget) hit(c, o.col, 1, [tx, c.to[1]]);
    else sparks(s, tx, ty, { n: 10, colors: [o.col, WHITE], speed: [60, 200], angle: [200, 340] });
    glow(s, tx, ty, WHITE, 160, 200);
    smoke(s, tx, ty, 0xb0b8c8, 3, 30);
    await pause(s, 60);
    g.setVisible(false);
    await pause(s, 40);
    g.setVisible(true);
    draw();
    void tw(s, { targets: g, alpha: 0, duration: 220 }).then(() => g.destroy());
    await pause(s, 90);
  }
}

/** A rolling wave with a curling crest and spray that sweeps over the target; can carry icons. */
async function wave(c: AttackCtx, o: { col: number; deep: number; height?: number; alpha?: number; carry?: string[]; ms?: number }): Promise<void> {
  const s = c.scene;
  const g = s.add.graphics().setDepth(935);
  const h = (o.height ?? 100) * K * 0.8;
  const p = { x: 720 };
  const foam = s.add.particles(0, 0, 'fx_dot', { speedX: { min: 20, max: 160 }, speedY: { min: -160, max: -20 }, lifespan: { min: 250, max: 520 }, scale: { start: 0.6, end: 0 }, tint: [WHITE, o.col], gravityY: 420, frequency: 12, quantity: 3 }).setDepth(936);
  const riders = (o.carry ?? []).map((k, i) => ({ im: s.add.image(800, 0, k).setScale(0.6 * K).setDepth(937), dx: 20 + i * 34, bob: rnd(0, 6) }));
  let struck = false;
  const draw = () => {
    g.clear();
    const t = s.time.now / 130;
    const A = o.alpha ?? 0.85;
    for (const [dx, col, a, k] of [[50, o.deep, A * 0.7, 0.7], [24, o.deep, A * 0.85, 0.86], [0, o.col, A, 1], [10, WHITE, 0.16, 0.8], [28, WHITE, 0.1, 0.55]] as const) {
      const pts: { x: number; y: number }[] = [];
      const W = 230;
      for (let i = 0; i <= 24; i++) {
        const u = i / 24;
        const crest = Math.pow(Math.sin(Math.min(1, u * 2.6) * Math.PI * 0.5), 2) * Math.pow(1 - u, 0.6);
        pts.push({ x: p.x + dx + u * W, y: c.feet + 8 - h * k * crest * 1.35 + Math.sin(u * 9 + t) * 4 });
      }
      pts.push({ x: p.x + dx + W, y: c.feet + 10 }, { x: p.x + dx, y: c.feet + 10 });
      g.fillStyle(col, a).fillPoints(pts as Phaser.Math.Vector2[], true);
      if (col !== WHITE) {
        g.lineStyle(k === 1 ? 4 : 2, WHITE, k === 1 ? 0.95 : 0.5).beginPath().moveTo(pts[0]!.x, pts[0]!.y);
        pts.slice(1, 14).forEach((q, i) => g.lineTo(q.x, q.y + Math.sin(i * 2.1 + t * 2) * 1.5));
        g.strokePath();
        if (k === 1) for (let i = 1; i < 12; i += 2) g.fillStyle(WHITE, 0.9).fillCircle(pts[i]!.x, pts[i]!.y + 1, 3 + Math.sin(i + t * 3) * 1.5);
      }
    }
    riders.forEach((r, i) => r.im.setPosition(p.x + r.dx, c.feet - h * (0.95 - i * 0.12) + Math.sin(t + r.bob) * 5).setAngle(Math.sin(t * 0.8 + i) * 18));
    foam.setPosition(p.x + 26, c.feet - h * 0.8);
    if (!struck && p.x < c.to[0] + 10) {
      struck = true;
      hit(c, o.col, 1.1, c.to);
      sparks(s, c.to[0], c.to[1], { n: 22, colors: [WHITE, o.col], speed: [80, 300], angle: [200, 340], size: 0.6, gravity: 500 });
    }
  };
  await tw(s, { targets: p, x: -260, duration: o.ms ?? 900, ease: 'Sine.easeIn', onUpdate: draw });
  foam.stop();
  g.destroy();
  riders.forEach((r) => r.im.destroy());
  s.time.delayedCall(550, () => foam.destroy());
}

/** Crescent slashes that sweep across the target and linger as glowing cuts. */
async function slash(c: AttackCtx, o: { col: number; hot?: number; n?: number; cross?: boolean; big?: number }): Promise<void> {
  const s = c.scene;
  const n = o.n ?? 3;
  const R = 36 * K * (o.big ?? 1);
  for (let i = 0; i < n; i++) {
    const g = s.add.graphics().setDepth(945).setBlendMode(ADD);
    const flip = o.cross && i % 2 ? -1 : 1;
    const off = (i - (n - 1) / 2) * 14;
    const p = { t: 0 };
    const draw = (fade: number) => {
      g.clear();
      const a0 = -2.2, a1 = lerp(a0, 0.5, p.t);
      for (const [lw, col, a] of [[12, o.col, 0.3], [6.5, o.col, 0.85], [2.6, o.hot ?? WHITE, 1]] as const) {
        g.lineStyle(lw * fade * (o.big ?? 1), col, a * fade).beginPath();
        for (let k = 0; k <= 12; k++) {
          const ang = lerp(a0, a1, k / 12);
          const r = R - Math.abs(k - 6) * 0.6;
          const x = c.to[0] + off + Math.cos(ang) * r * flip + 8 * flip, y = c.to[1] + Math.sin(ang) * r * 1.1 + 6;
          if (k === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.strokePath();
      }
    };
    void tw(s, { targets: p, t: 1, duration: 90, ease: 'Quad.easeOut', onUpdate: () => draw(1) }).then(() => {
      const f = { v: 1 };
      return tw(s, { targets: f, v: 0, duration: 260, onUpdate: () => draw(f.v) });
    }).then(() => g.destroy());
    sparks(s, c.to[0] + off, c.to[1], { n: 7, colors: [o.col, WHITE], speed: [80, 240], size: 0.45, angle: flip > 0 ? [20, 110] : [70, 160] });
    await pause(s, 85);
  }
  hit(c, o.col, 0.9, c.to, o.hot);
}

/** Glowing jaws that snap shut on the target. */
async function bite(c: AttackCtx, o: { col: number; times?: number; tooth?: number }): Promise<void> {
  const s = c.scene;
  for (let i = 0; i < (o.times ?? 1); i++) {
    const jaw = (sign: number) => {
      const g = s.add.graphics().setDepth(945);
      g.fillStyle(o.col, 0.4).fillEllipse(0, sign * -12, 120, 36);
      for (let k = 0; k < 6; k++) {
        const x = -45 + k * 18;
        const h = k === 0 || k === 5 ? 26 : 18;
        g.fillStyle(0x1d1530, 1).fillTriangle(x - 10, 0, x + 10, 0, x, sign * (h + 3));
        g.fillStyle(o.tooth ?? 0xffffff, 1).fillTriangle(x - 8, 0, x + 8, 0, x, sign * h);
      }
      g.setPosition(c.to[0], c.to[1] - sign * 70).setAlpha(0);
      return g;
    };
    const top = jaw(1), bot = jaw(-1);
    await tw(s, { targets: [top, bot], alpha: 1, duration: 80 });
    await Promise.all([tw(s, { targets: top, y: c.to[1] - 14, duration: 85, ease: 'Cubic.easeIn' }), tw(s, { targets: bot, y: c.to[1] + 14, duration: 85, ease: 'Cubic.easeIn' })]);
    hit(c, o.col, 0.9, c.to);
    await pause(s, 70);
    await Promise.all([tw(s, { targets: top, y: c.to[1] - 46, alpha: 0, duration: 130 }), tw(s, { targets: bot, y: c.to[1] + 46, alpha: 0, duration: 130 })]);
    top.destroy();
    bot.destroy();
  }
}

/** The attacker dashes at the target, leaving glowing after-images, and springs back. */
async function lunge(c: AttackCtx, o: { col: number; hot?: number; spin?: boolean; through?: boolean; swoop?: number; trailTex?: string; hitFx?: boolean; dust?: boolean; ms?: number }): Promise<void> {
  const s = c.scene;
  const f = c.foe;
  const hx = f.x, hy = f.y, ha = f.angle, sx = f.scaleX, sy = f.scaleY;
  const target = o.through ? c.to[0] - 110 : c.to[0] + (c.boss ? 120 : 70);
  await tw(s, { targets: f, x: hx + 16, scaleX: sx * 0.92, scaleY: sy * 1.06, duration: 140, ease: 'Quad.easeOut' });
  const stop = trail(s, { get x() { return f.x; }, get y() { return c.from[1] + (f.y - hy); } }, [o.col, o.hot ?? WHITE], 0.7, o.trailTex);
  const ghosts = s.time.addEvent({ delay: 28, loop: true, callback: () => ghost(s, f, o.col) });
  const dust = o.dust ? s.time.addEvent({ delay: 40, loop: true, callback: () => smoke(s, f.x + 20, c.feet, 0xe9ecef, 2, 30) }) : null;
  const p = { t: 0 };
  await tw(s, {
    targets: p, t: 1, duration: o.ms ?? 240, ease: 'Cubic.easeIn',
    onUpdate: () => {
      f.x = lerp(hx + 16, target, p.t);
      f.y = hy + (o.swoop ?? 0) * Math.sin(p.t * Math.PI);
      f.setScale(sx * (1 + 0.12 * Math.sin(p.t * Math.PI)), sy * (1 - 0.07 * Math.sin(p.t * Math.PI)));
      if (o.spin) f.angle = ha - 720 * p.t;
    },
  });
  ghosts.remove();
  dust?.remove();
  if (o.hitFx !== false) hit(c, o.col, 1.2, c.to, o.hot);
  if (o.through) {
    stop();
    f.setAlpha(0).setX(720);
    await pause(s, 120);
    f.setAlpha(1);
    await tw(s, { targets: f, x: hx, duration: 320, ease: 'Back.easeOut' });
  } else {
    await pause(s, 60);
    stop();
    await tw(s, { targets: f, x: hx, duration: 300, ease: 'Back.easeOut' });
  }
  f.setPosition(hx, hy).setAngle(ha).setScale(sx, sy);
}

/** The attacker rears up (stretching tall), then comes down. Resolves at the top. */
async function rear(c: AttackCtx, lift = 26, ms = 260): Promise<() => Promise<void>> {
  const s = c.scene;
  const f = c.foe;
  const y = f.y, sx = f.scaleX, sy = f.scaleY;
  await tw(s, { targets: f, scaleX: sx * 1.08, scaleY: sy * 0.9, duration: 110, ease: 'Quad.easeOut' });
  await tw(s, { targets: f, y: y - lift, scaleX: sx * 0.94, scaleY: sy * 1.08, angle: 4, duration: ms, ease: 'Quad.easeOut' });
  return async () => {
    await tw(s, { targets: f, y, angle: 0, scaleX: sx * 1.12, scaleY: sy * 0.88, duration: 110, ease: 'Quad.easeIn' });
    await tw(s, { targets: f, scaleX: sx, scaleY: sy, duration: 200, ease: 'Back.easeOut' });
    f.setPosition(f.x, y).setScale(sx, sy).setAngle(0);
  };
}

/** Motes spiral in around the target, then collapse onto it; optional spinning water arms. */
async function swirl(c: AttackCtx, o: { col: number; hot?: number; at?: XY; flat?: number; n?: number; ms?: number; tex?: string; arms?: number; deep?: number; spinTarget?: boolean; lift?: number }): Promise<void> {
  const s = c.scene;
  const [cx, cy] = o.at ?? c.to;
  const pool = o.arms ? s.add.graphics().setDepth(906) : null;
  const n = o.n ?? 28;
  const flat = o.flat ?? 0.8;
  const motes = Array.from({ length: n }, (_, i) => ({
    im: s.add.image(cx, cy, o.tex && i % 2 ? o.tex : 'fx_dot').setTint(o.tex && i % 2 ? WHITE : i % 3 === 0 ? o.hot ?? WHITE : o.col).setBlendMode(o.tex && i % 2 ? NORMAL : ADD).setDepth(941).setScale(o.tex && i % 2 ? rnd(0.25, 0.45) * K : rnd(0.35, 0.8) * K),
    a: (i / n) * Math.PI * 6, r: rnd(0.55, 1), sp: rnd(0.8, 1.3), h: rnd(-1, 1),
  }));
  const halo = s.add.image(cx, cy, 'fx_soft').setTint(o.col).setBlendMode(ADD).setDepth(938).setScale(0.4).setAlpha(0.7);
  const pa = c.player.angle, py = c.player.y;
  const p = { t: 0 };
  await tw(s, {
    targets: p, t: 1, duration: o.ms ?? 850, ease: 'Sine.easeIn',
    onUpdate: () => {
      const R = 74 * K * (1 - p.t * 0.88);
      for (const m of motes) {
        const a = m.a + p.t * 11 * m.sp;
        m.im.setPosition(cx + Math.cos(a) * R * m.r, cy + Math.sin(a) * R * m.r * flat + m.h * (o.lift ?? 0) * p.t).setAlpha(0.4 + 0.6 * p.t).setAngle(a * 57);
      }
      if (pool) {
        const grow = Math.min(1, p.t * 3) * (p.t > 0.85 ? (1 - p.t) / 0.15 : 1);
        const R2 = 86 * K * grow;
        pool.clear();
        pool.fillStyle(o.deep ?? o.col, 0.55 * grow).fillEllipse(cx, c.feet, R2 * 2.1, R2 * 2.1 * 0.32);
        pool.fillStyle(0x0b2545, 0.5 * grow).fillEllipse(cx, c.feet, R2 * 0.7, R2 * 0.7 * 0.32);
        for (let k = 0; k < (o.arms ?? 0); k++) {
          for (const [lw, col, al] of [[5, o.col, 0.9], [2, WHITE, 0.95]] as const) {
            pool.lineStyle(lw, col, al * grow).beginPath();
            for (let i = 0; i <= 18; i++) {
              const r = 6 + (R2 - 6) * (i / 18);
              const a = (k / (o.arms ?? 1)) * Math.PI * 2 + r * 0.07 - p.t * 16;
              const x = cx + Math.cos(a) * r, y = c.feet + Math.sin(a) * r * 0.32;
              if (i === 0) pool.moveTo(x, y);
              else pool.lineTo(x, y);
            }
            pool.strokePath();
          }
        }
      }
      halo.setScale((0.5 + p.t * 1.6) * K).setAlpha(0.3 + 0.5 * p.t);
      if (o.spinTarget) c.player.angle = pa + Math.sin(p.t * 26) * 18 * Math.sin(p.t * Math.PI);
      if (o.lift) c.player.y = py - Math.sin(p.t * Math.PI) * o.lift * 0.5;
    },
  });
  motes.forEach((m) => m.im.destroy());
  pool?.destroy();
  halo.destroy();
  c.player.setAngle(pa).setY(py);
  hit(c, o.col, 1.1, c.to, o.hot);
}

/** Things burst up out of the ground under the target (spikes, roots, ice). */
async function erupt(c: AttackCtx, key: string, o: { col: number; n?: number; scale?: number; dirt?: number[] }): Promise<void> {
  const s = c.scene;
  const n = o.n ?? 5;
  const dirt = o.dirt ?? [0x8d6e63, 0x5d4037];
  shake(c, 320, 0.005);
  for (let k = 0; k < 3; k++) {
    sparks(s, c.to[0] + rnd(-34, 34), c.feet, { n: 3, colors: dirt, speed: [40, 120], angle: [240, 300], size: 0.4, add: false, gravity: 500 });
    await pause(s, 60);
  }
  const runs: Promise<void>[] = [];
  for (let i = 0; i < n; i++) {
    const x = c.to[0] + (i - (n - 1) / 2) * 24 + rnd(-3, 3);
    const sc = (o.scale ?? 0.9) * K * rnd(0.8, 1.2);
    const im = s.add.image(x, c.feet + 8, key).setOrigin(0.5, 1).setScale(sc, 0).setDepth(c.feet + 2 + i).setAngle(rnd(-14, 14));
    runs.push((async () => {
      await pause(s, Math.abs(i - (n - 1) / 2) * 45);
      sparks(s, x, c.feet, { n: 5, colors: [...dirt, o.col], speed: [80, 220], angle: [235, 305], size: 0.45, add: false, gravity: 520 });
      await tw(s, { targets: im, scaleY: sc * 1.2, duration: 130, ease: 'Back.easeOut' });
      await tw(s, { targets: im, scaleY: sc, duration: 90 });
      await pause(s, 260);
      await tw(s, { targets: im, scaleY: 0, alpha: 0.6, duration: 200, ease: 'Quad.easeIn' });
      im.destroy();
    })());
  }
  await pause(s, 150);
  hit(c, o.col, 1.1, [c.to[0], c.feet - 22]);
  await Promise.all(runs);
}

/** Bright rays sweep out from a point (dazzle, glare). */
async function rays(c: AttackCtx, at: XY, o: { col: number; hot?: number; ms?: number; n?: number; len?: number }): Promise<void> {
  const s = c.scene;
  const g = s.add.graphics().setDepth(906).setBlendMode(ADD).setPosition(at[0], at[1]);
  const p = { t: 0 };
  const n = o.n ?? 14;
  const draw = () => {
    g.clear();
    const len = (o.len ?? 420) * Math.min(1, p.t * 2.2);
    const a = 0.45 * (1 - p.t);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + p.t * 0.9;
      const wdt = 0.07 + (i % 2) * 0.05;
      g.fillStyle(i % 2 ? o.col : o.hot ?? WHITE, a).fillTriangle(0, 0, Math.cos(ang - wdt) * len, Math.sin(ang - wdt) * len, Math.cos(ang + wdt) * len, Math.sin(ang + wdt) * len);
    }
  };
  glow(s, at[0], at[1], o.hot ?? WHITE, 220, 500, 1);
  ring(s, at[0], at[1], o.col, 500, 600);
  await tw(s, { targets: p, t: 1, duration: o.ms ?? 700, ease: 'Quad.easeOut', onUpdate: draw });
  g.destroy();
}

/** Thick tentacles that burst out of the ground around the target and lash it. */
async function tentacles(c: AttackCtx, o: { col: number; dark: number; n?: number }): Promise<void> {
  const s = c.scene;
  const n = o.n ?? 6;
  const arms = Array.from({ length: n }, (_, i) => ({ x: c.to[0] + (i - (n - 1) / 2) * 30 + rnd(-6, 6), side: i < n / 2 ? 1 : -1, ph: rnd(0, 6), h: rnd(90, 130) * K * 0.8 }));
  const g = s.add.graphics().setDepth(c.feet + 4);
  const p = { t: 0 };
  const draw = () => {
    g.clear();
    const grow = Math.min(1, p.t * 2.4) * (p.t > 0.8 ? (1 - p.t) / 0.2 : 1);
    for (const a of arms) {
      const pts: XY[] = [];
      for (let k = 0; k <= 10; k++) {
        const u = k / 10;
        const curl = Math.sin(u * 3 + p.t * 10 + a.ph) * 16 * u + a.side * u * u * 30 * Math.sin(p.t * Math.PI);
        pts.push([a.x + curl, c.feet + 6 - a.h * u * grow]);
      }
      for (const [w, col] of [[16, 0x1d1530], [12, o.col], [4, o.dark]] as const) {
        g.lineStyle(w * (1 - 0.0), col, 1).beginPath().moveTo(pts[0]![0], pts[0]![1]);
        pts.slice(1).forEach(([x, y], k) => { g.lineStyle(w * (1 - (k / 10) * 0.75), col, 1); g.lineTo(x, y); });
        g.strokePath();
      }
      for (let k = 2; k < 9; k += 2) g.fillStyle(0xc3fae8, 1).fillCircle(pts[k]![0] - a.side * 3, pts[k]![1], 2.2);
    }
  };
  for (const a of arms) sparks(s, a.x, c.feet, { n: 6, colors: [WHITE, 0x63e6be], speed: [60, 200], angle: [240, 300], size: 0.5, gravity: 500 });
  shake(c, 300, 0.006);
  let hits = 0;
  await tw(s, {
    targets: p, t: 1, duration: 900, ease: 'Linear',
    onUpdate: () => {
      draw();
      if (hits < 2 && p.t > 0.3 + hits * 0.25) {
        hits++;
        hit(c, o.col, 0.8, c.to);
      }
    },
  });
  g.destroy();
}

/** Chain links whip out in a ring around the target and pull tight; a padlock snaps shut on them. */
async function chainLock(c: AttackCtx, col: number): Promise<void> {
  const s = c.scene;
  const N = 12;
  const [cx, cy] = c.to;
  const links = Array.from({ length: N }, () => s.add.image(c.from[0], c.from[1], 'ico_link').setScale(0.5 * K).setDepth(943));
  const p = { t: 0, r: 1.6 };
  const place = () => links.forEach((l, i) => {
    const u = Math.min(1, p.t * 1.6 - i * 0.04);
    const a = (i / N) * Math.PI * 2 + p.t * 3;
    const R = 46 * K * p.r;
    const tx = cx + Math.cos(a) * R, ty = cy + Math.sin(a) * R * 0.55;
    l.setPosition(lerp(c.from[0], tx, Math.max(0, u)), lerp(c.from[1], ty, Math.max(0, u)) - Math.sin(Math.max(0, u) * Math.PI) * 40).setAngle((a * 180) / Math.PI + 90);
  });
  await tw(s, { targets: p, t: 1, duration: 520, ease: 'Cubic.easeOut', onUpdate: place });
  await tw(s, { targets: p, r: 0.85, duration: 160, ease: 'Back.easeIn', onUpdate: place });
  const lock = s.add.image(cx, cy - 40, 'ico_lock').setScale(0).setDepth(944);
  await tw(s, { targets: lock, scale: 0.75 * K, y: cy - 4, duration: 180, ease: 'Back.easeOut' });
  flash(c, col, 90);
  hit(c, col, 1.1);
  sparks(s, cx, cy, { n: 10, colors: [WHITE, 0xe599f7], tex: 'fx_spark', speed: [30, 120], gravity: 0, rotate: true });
  await pause(s, 380);
  await tw(s, { targets: [...links, lock], alpha: 0, duration: 260 });
  [...links, lock].forEach((l) => l.destroy());
}

/** A glowing web that throws out over the target, pulls tight, and glows with silk threads. */
async function web(c: AttackCtx, col: number): Promise<void> {
  const s = c.scene;
  const [cx, cy] = c.to;
  const g = s.add.graphics().setDepth(944).setBlendMode(ADD);
  const p = { r: 0, a: 0 };
  const draw = () => {
    g.clear();
    const R = p.r * 70 * K;
    const spokes = 10;
    for (const [lw, al] of [[6, 0.25], [2, 0.95]] as const) {
      g.lineStyle(lw, col, al * p.a);
      for (let k = 0; k < spokes; k++) {
        const a = (k / spokes) * Math.PI * 2;
        g.lineBetween(cx, cy, cx + Math.cos(a) * R, cy + Math.sin(a) * R * 0.9);
      }
      for (let ringI = 1; ringI <= 4; ringI++) {
        const rr = (R * ringI) / 4;
        g.beginPath();
        for (let k = 0; k <= spokes; k++) {
          const a = (k / spokes) * Math.PI * 2;
          const sag = 0.9 + 0.1 * Math.cos(k * 2);
          const x = cx + Math.cos(a) * rr * sag, y = cy + Math.sin(a) * rr * 0.9 * sag;
          if (k === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.strokePath();
      }
    }
  };
  await tw(s, { targets: p, r: 1.25, a: 1, duration: 260, ease: 'Back.easeOut', onUpdate: draw });
  await tw(s, { targets: p, r: 0.9, duration: 160, ease: 'Cubic.easeIn', onUpdate: draw });
  hit(c, col, 1.1);
  sparks(s, cx, cy, { n: 16, colors: [col, WHITE], speed: [40, 160], size: 0.5, gravity: 60 });
  await pause(s, 420);
  await tw(s, { targets: p, a: 0, duration: 300, onUpdate: draw });
  g.destroy();
}

/** A glowing lure dangles in front of the target on a thread, tempting, then the hook yanks. */
async function lure(c: AttackCtx, col: number): Promise<void> {
  const s = c.scene;
  const [cx, cy] = c.to;
  const topY = 10;
  const line = s.add.graphics().setDepth(942);
  const hook = s.add.image(cx + 40, topY, 'ico_hook').setScale(0.6 * K).setDepth(943).setOrigin(0.55, 0.1);
  const orb = s.add.image(cx + 40, topY, 'fx_soft').setTint(col).setBlendMode(ADD).setDepth(944).setScale(0.8 * K);
  const p = { y: topY, sway: 0 };
  const draw = () => {
    const x = cx + 40 + Math.sin(p.sway) * 14;
    line.clear().lineStyle(2, 0xe9ecef, 0.8).lineBetween(cx + 40, -5, x, p.y);
    hook.setPosition(x, p.y).setAngle(Math.sin(p.sway) * -10);
    orb.setPosition(x - 6, p.y + 38).setScale((0.8 + Math.sin(s.time.now / 90) * 0.15) * K);
  };
  await tw(s, { targets: p, y: cy - 60, duration: 420, ease: 'Sine.easeOut', onUpdate: draw });
  await tw(s, { targets: p, sway: Math.PI * 3, duration: 620, ease: 'Sine.easeInOut', onUpdate: draw });
  sparks(s, hook.x, hook.y + 38, { n: 12, colors: [col, WHITE], tex: 'fx_spark', speed: [20, 80], gravity: 0, rotate: true });
  await tw(s, { targets: p, y: cy - 20, duration: 90, ease: 'Cubic.easeIn', onUpdate: draw });
  hit(c, col, 1);
  await tw(s, { targets: p, y: -80, duration: 260, ease: 'Cubic.easeIn', onUpdate: draw });
  [line, hook, orb].forEach((o) => o.destroy());
}

/** A glowing balance scale appears over the target, tips back and forth, and crashes down. */
async function scales(c: AttackCtx, col: number): Promise<void> {
  const s = c.scene;
  const [cx] = c.to;
  const y0 = c.to[1] - 100;
  const g = s.add.graphics().setDepth(944);
  const p = { tilt: 0, y: y0 - 60, a: 0 };
  const draw = () => {
    g.clear();
    const y = p.y;
    const L = 56 * K;
    const ax = Math.cos(p.tilt) * L, ay = Math.sin(p.tilt) * L;
    g.fillStyle(col, 0.25 * p.a).fillCircle(cx, y, 40 * K);
    g.lineStyle(9, 0x1d1530, p.a).lineBetween(cx, y - 24, cx, y + 70).lineBetween(cx - ax, y - ay, cx + ax, y + ay);
    g.lineStyle(5, 0xffd43b, p.a).lineBetween(cx, y - 24, cx, y + 70).lineBetween(cx - ax, y - ay, cx + ax, y + ay);
    for (const sx of [-1, 1]) {
      const px = cx + sx * ax, py = y + sx * ay;
      g.lineStyle(2, 0xffd43b, p.a).lineBetween(px, py, px - 16, py + 26).lineBetween(px, py, px + 16, py + 26);
      g.fillStyle(0x1d1530, p.a).fillEllipse(px, py + 28, 40, 14);
      g.fillStyle(0xfab005, p.a).fillEllipse(px, py + 27, 34, 10);
    }
    g.fillStyle(0x1d1530, p.a).fillCircle(cx, y - 24, 7);
    g.fillStyle(0xe599f7, p.a).fillCircle(cx, y - 24, 4.5);
  };
  await tw(s, { targets: p, y: y0, a: 1, duration: 260, ease: 'Back.easeOut', onUpdate: draw });
  await tw(s, { targets: p, tilt: 0.45, duration: 200, ease: 'Sine.easeInOut', onUpdate: draw });
  await tw(s, { targets: p, tilt: -0.45, duration: 240, ease: 'Sine.easeInOut', onUpdate: draw });
  await tw(s, { targets: p, tilt: 0, duration: 160, ease: 'Back.easeOut', onUpdate: draw });
  sparks(s, cx, y0 - 24, { n: 10, colors: [col, 0xffd43b], tex: 'fx_spark', speed: [20, 90], gravity: 0, rotate: true });
  await tw(s, { targets: p, y: c.to[1] - 40, duration: 120, ease: 'Cubic.easeIn', onUpdate: draw });
  hit(c, col, 1.1);
  await tw(s, { targets: p, a: 0, duration: 240, onUpdate: draw });
  g.destroy();
}

/** A tornado funnel that spins up around the target, flinging debris. */
async function tornado(c: AttackCtx, o: { col: number; debris?: string }): Promise<void> {
  const s = c.scene;
  const [cx] = c.to;
  const g = s.add.graphics().setDepth(c.feet + 3).setBlendMode(ADD);
  const p = { t: 0 };
  const deb = Array.from({ length: 10 }, (_, i) => ({ im: s.add.image(cx, c.feet, o.debris ?? 'ico_feather').setScale(0.35 * K).setDepth(c.feet + 5), a: (i / 10) * Math.PI * 2, h: rnd(0.1, 1) }));
  const draw = () => {
    g.clear();
    const grow = Math.min(1, p.t * 3) * (p.t > 0.85 ? (1 - p.t) / 0.15 : 1);
    const H = 170 * K * grow;
    for (let k = 0; k < 14; k++) {
      const u = k / 13;
      const y = c.feet - u * H;
      const w = (14 + u * u * 70) * K * grow;
      const sway = Math.sin(u * 4 + p.t * 18) * 8 * u;
      g.lineStyle(3 + u * 4, k % 2 ? o.col : WHITE, (0.25 + 0.4 * (1 - u)) * grow).strokeEllipse(cx + sway, y, w * 2, w * 0.42);
    }
    for (const d of deb) {
      const a = d.a + p.t * 22;
      const y = c.feet - d.h * H;
      const w = (14 + d.h * d.h * 70) * K * grow;
      d.im.setPosition(cx + Math.cos(a) * w, y + Math.sin(a) * w * 0.2).setAngle(a * 60).setAlpha(grow);
    }
  };
  const py = c.player.y;
  await tw(s, {
    targets: p, t: 1, duration: 1000, ease: 'Linear',
    onUpdate: () => {
      draw();
      c.player.y = py - Math.sin(p.t * Math.PI) * 16;
      c.player.angle = Math.sin(p.t * 30) * 10 * Math.sin(p.t * Math.PI);
    },
  });
  c.player.setY(py).setAngle(0);
  hit(c, o.col, 1);
  g.destroy();
  deb.forEach((d) => d.im.destroy());
}

/** Storm clouds roll across the top of the screen with falling rain. Returns a function that clears them. */
function storm(c: AttackCtx, col: number): () => void {
  const s = c.scene;
  const clouds = Array.from({ length: 7 }, (_, i) => s.add.image(-60 + i * 110, 30 + rnd(-8, 8), 'fx_smoke').setTint(0x2b2f4a).setScale(3.8, 2).setAlpha(0).setDepth(882));
  clouds.forEach((cl, i) => s.tweens.add({ targets: cl, alpha: 0.9, x: cl.x + 30, duration: 500, delay: i * 40 }));
  const rainEm = s.add.particles(0, -10, 'fx_streak', { x: { min: 0, max: 680 }, speedY: { min: 520, max: 680 }, speedX: -120, angle: 0, rotate: 102, lifespan: 600, scale: { start: 0.7, end: 0.5 }, alpha: { start: 0.55, end: 0.2 }, tint: [col, 0xdbe4ff], frequency: 10, quantity: 3 }).setDepth(883);
  return () => {
    rainEm.stop();
    s.tweens.add({ targets: clouds, alpha: 0, duration: 400, onComplete: () => clouds.forEach((cl) => cl.destroy()) });
    s.time.delayedCall(700, () => rainEm.destroy());
  };
}

/** A big crescent sweep (a tusk, a tail) from above, with an icy or glowing trail. */
async function sweep(c: AttackCtx, o: { col: number; hot?: number; r?: number }): Promise<void> {
  const s = c.scene;
  const g = s.add.graphics().setDepth(945).setBlendMode(ADD);
  const [cx, cy] = c.to;
  const R = (o.r ?? 80) * K;
  const p = { t: 0, f: 1 };
  const draw = () => {
    g.clear();
    const a0 = -2.6, a1 = lerp(a0, 0.9, p.t);
    for (const [lw, col, a] of [[30, o.col, 0.22], [16, o.col, 0.7], [6, o.hot ?? WHITE, 1]] as const) {
      g.lineStyle(lw * p.f, col, a * p.f).beginPath();
      for (let k = 0; k <= 18; k++) {
        const ang = lerp(Math.max(a0, a1 - 1.6), a1, k / 18);
        const x = cx + 30 + Math.cos(ang) * R, y = cy - 20 + Math.sin(ang) * R;
        if (k === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokePath();
    }
  };
  await tw(s, { targets: p, t: 1, duration: 200, ease: 'Cubic.easeIn', onUpdate: draw });
  hit(c, o.col, 1.3);
  await tw(s, { targets: p, f: 0, duration: 260, onUpdate: draw });
  g.destroy();
}

/** Lingering flames that keep flickering on the target after the blast. */
function linger(c: AttackCtx, col: number, ms = 900): void {
  const s = c.scene;
  const em = s.add.particles(c.to[0], c.feet - 6, 'ico_flame', { x: { min: -26, max: 26 }, speedY: { min: -90, max: -40 }, speedX: { min: -12, max: 12 }, lifespan: { min: 300, max: 600 }, scale: { start: 0.4 * K, end: 0.05 }, alpha: { start: 1, end: 0 }, frequency: 50, quantity: 1 }).setDepth(c.feet + 6);
  const em2 = s.add.particles(c.to[0], c.feet - 10, 'fx_dot', { x: { min: -30, max: 30 }, speedY: { min: -120, max: -50 }, lifespan: 500, scale: { start: 0.6, end: 0 }, tint: [col, WHITE], blendMode: ADD, frequency: 30 }).setDepth(c.feet + 7);
  s.time.delayedCall(ms, () => {
    em.stop();
    em2.stop();
  });
  s.time.delayedCall(ms + 700, () => {
    em.destroy();
    em2.destroy();
  });
}

/** A falling line chart that zig-zags down across the screen and crashes (market drops). */
async function crashLine(c: AttackCtx, col: number): Promise<void> {
  const s = c.scene;
  const g = s.add.graphics().setDepth(944).setBlendMode(ADD);
  const pts: XY[] = [];
  let y = 40;
  for (let x = c.from[0]; x >= c.to[0] - 10; x -= 26) {
    pts.push([x, y]);
    y += rnd(-10, 34);
  }
  pts.push([c.to[0], c.to[1]]);
  const p = { k: 0 };
  await tw(s, {
    targets: p, k: pts.length - 1, duration: 520, ease: 'Quad.easeIn',
    onUpdate: () => {
      g.clear();
      const n = Math.floor(p.k);
      for (const [lw, a] of [[12, 0.25], [5, 1]] as const) {
        g.lineStyle(lw, col, a).beginPath().moveTo(pts[0]![0], pts[0]![1]);
        for (let i = 1; i <= n; i++) g.lineTo(pts[i]![0], pts[i]![1]);
        const fr = p.k - n;
        if (n + 1 < pts.length) g.lineTo(lerp(pts[n]![0], pts[n + 1]![0], fr), lerp(pts[n]![1], pts[n + 1]![1], fr));
        g.strokePath();
      }
    },
  });
  hit(c, col, 1.1);
  await tw(s, { targets: g, alpha: 0, duration: 260 });
  g.destroy();
}

/** A heavy current: dark water bands roll in slowly and a tint of slowness settles on the target. */
async function current(c: AttackCtx, col: number, deep: number): Promise<void> {
  const s = c.scene;
  const g = s.add.graphics().setDepth(c.feet + 3);
  const p = { t: 0 };
  await tw(s, {
    targets: p, t: 1, duration: 1100, ease: 'Sine.easeInOut',
    onUpdate: () => {
      g.clear();
      const grow = Math.min(1, p.t * 2.5) * (p.t > 0.8 ? (1 - p.t) / 0.2 : 1);
      for (let b = 0; b < 4; b++) {
        const y = c.feet - 6 - b * 26;
        const off = (s.time.now / 6 + b * 60) % 120;
        g.lineStyle(10 - b * 1.5, b % 2 ? deep : col, 0.55 * grow).beginPath();
        for (let x = c.to[0] + 140; x > c.to[0] - 120; x -= 8) g.lineTo(x, y + Math.sin((x + off) / 18) * 6);
        g.strokePath();
        g.lineStyle(2, WHITE, 0.5 * grow).beginPath();
        for (let x = c.to[0] + 140; x > c.to[0] - 120; x -= 8) g.lineTo(x, y - 4 + Math.sin((x + off) / 18) * 6);
        g.strokePath();
      }
      c.player.setTint(Phaser_lerpColor(0xffffff, 0x74c0fc, grow * 0.7));
    },
  });
  c.player.clearTint();
  hit(c, col, 0.8);
  g.destroy();
}

/** Blend two RGB colours (no Phaser import needed at module load). */
function Phaser_lerpColor(a: number, b: number, t: number): number {
  const ch = (sh: number) => Math.round(lerp((a >> sh) & 255, (b >> sh) & 255, t));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** A thin draining tether from the target back to the attacker, with red motes flowing along it. */
async function drain(c: AttackCtx, col: number, ms = 900): Promise<void> {
  const s = c.scene;
  const g = s.add.graphics().setDepth(942).setBlendMode(ADD);
  const motes = Array.from({ length: 12 }, (_, i) => s.add.image(0, 0, 'fx_dot').setTint(i % 2 ? col : WHITE).setBlendMode(ADD).setDepth(943).setScale(0.6 * K));
  const p = { t: 0 };
  const curve = (u: number): XY => [lerp(c.to[0], c.from[0], u), lerp(c.to[1], c.from[1], u) - Math.sin(u * Math.PI) * 30 + Math.sin(u * 12 + s.time.now / 80) * 4];
  await tw(s, {
    targets: p, t: 1, duration: ms, ease: 'Linear',
    onUpdate: () => {
      g.clear();
      const a = Math.min(1, p.t * 4) * (p.t > 0.85 ? (1 - p.t) / 0.15 : 1);
      g.lineStyle(6, col, 0.25 * a).beginPath();
      for (let k = 0; k <= 20; k++) g.lineTo(...curve(k / 20));
      g.strokePath();
      g.lineStyle(2, col, 0.9 * a).beginPath();
      for (let k = 0; k <= 20; k++) g.lineTo(...curve(k / 20));
      g.strokePath();
      motes.forEach((m, i) => m.setPosition(...curve(((p.t * 2.5 + i / motes.length) % 1))).setAlpha(a));
      if (Math.random() < 0.15) sparks(s, c.to[0], c.to[1], { n: 2, colors: [col], speed: [20, 70], size: 0.4, gravity: 0 });
    },
  });
  motes.forEach((m) => m.destroy());
  g.destroy();
  glow(s, c.from[0], c.from[1], col, 90, 300);
  hit(c, col, 0.6);
}

// ── One effect per attack ───────────────────────────────────────────────────────────────────
const GOLD = 0xfcc419, PINK = 0xf783ac, RED = 0xff4d4f, GREEN = 0x51cf66, TEAL = 0x38d9a9, CYAN = 0x66d9e8, ICE = 0xa5d8ff, DEEP = 0x1c3d7a, PURPLE = 0xb16cff, VIOLET = 0x9775fa, STORM = 0x74c0fc;

/** Where on a boss an attack comes from (relative to its middle). */
const boss = (c: AttackCtx, dx: number, dy: number): XY => [c.from[0] + dx, c.from[1] + dy];
/** The clip's strike moment, with the clip itself running alongside. */
const withClip = async (c: AttackCtx, run: () => Promise<void>, strikeAt = CLIP_STRIKE): Promise<void> => {
  const clip = c.clip ? c.clip() : Promise.resolve();
  await pause(c.scene, strikeAt);
  await Promise.all([run(), clip]);
};

const ATTACKS: Record<string, Fx> = {
  // ── Coinfall Docks ──
  'Budget Smash': async (c) => {
    // Cracks your budget open: it slams down, the ground splits and coins spill out.
    await windup(c, GOLD);
    await lunge(c, { col: GOLD, swoop: -30, hitFx: false });
    hit(c, GOLD, 1.2);
    sparks(c.scene, c.to[0], c.to[1], { n: 10, tex: 'ico_coin', add: false, colors: [WHITE], speed: [120, 260], angle: [200, 340], size: 0.35, gravity: 700, rotate: true, life: [500, 800] });
  },
  'Monthly Nibble': async (c) => {
    // A cloud of tiny bills, each taking a small bite.
    await windup(c, GREEN, 180);
    await swirl(c, { col: GREEN, hot: 0xd3f9d8, tex: 'ico_bill', n: 30, ms: 900 });
    for (let i = 0; i < 3; i++) {
      sparks(c.scene, c.to[0] + rnd(-20, 20), c.to[1] + rnd(-20, 20), { n: 4, colors: [GREEN, WHITE], speed: [40, 120], size: 0.4 });
      await pause(c.scene, 70);
    }
  },
  'Eight-Arm Spree': async (c) => {
    // The kraken's arms burst out of the dock all around you and grab everything.
    if (c.hit > 1) return tentacles(c, { col: TEAL, dark: 0x0b7285, n: 4 });
    await withClip(c, async () => {
      gather(c, boss(c, -30, 30), TEAL, 200);
      await tentacles(c, { col: TEAL, dark: 0x0b7285, n: 8 });
      sparks(c.scene, c.to[0], c.to[1], { n: 8, tex: 'ico_coin', add: false, colors: [WHITE], speed: [140, 280], angle: [200, 340], size: 0.32, gravity: 700, rotate: true, life: [500, 800] });
    }, 380);
  },
  'Flash Sale Wave': async (c) => {
    // A tidal wave of BUY NOW price tags rushes across the dock.
    const down = await rear(c, 30);
    gather(c, boss(c, 0, -30), RED, 300);
    await pause(c.scene, 200);
    void down();
    await wave(c, { col: 0x3bc9db, deep: 0x0b7285, height: 120, carry: ['ico_tag', 'ico_tag', 'ico_bag', 'ico_tag', 'ico_tag'], ms: 1000 });
  },

  // ── The Sprawl ──
  'Shiny Flicker': async (c) => {
    // Darts in a zig-zag the moment something shiny catches your eye.
    const s = c.scene;
    const f = c.foe;
    const hx = f.x, hy = f.y;
    const stop = trail(s, f, [GOLD, WHITE], 0.6, 'fx_spark');
    for (const [x, y] of [[hx - 90, hy - 60], [hx - 160, hy + 10], [hx - 240, hy - 50], [c.to[0] + 60, hy]] as XY[]) {
      ghost(s, f, GOLD);
      await tw(s, { targets: f, x, y, duration: 90, ease: 'Quad.easeOut' });
      sparks(s, f.x, f.y - 30, { n: 5, colors: [GOLD, WHITE], tex: 'fx_spark', speed: [20, 80], gravity: 0, rotate: true });
    }
    hit(c, GOLD, 1);
    stop();
    await tw(s, { targets: f, x: hx, y: hy, duration: 300, ease: 'Back.easeOut' });
  },
  'Deal Chase': async (c) => {
    // A bounding dash that snatches something and runs off with it.
    await lunge(c, { col: 0xffa94d, dust: true, swoop: -20, through: true });
    const tag = c.scene.add.image(c.to[0], c.to[1], 'ico_tag').setScale(0.5 * K).setDepth(950);
    await tw(c.scene, { targets: tag, x: 700, y: c.to[1] - 30, angle: 360, duration: 500, ease: 'Quad.easeIn' });
    tag.destroy();
  },
  'Dazzle Fan': async (c) => {
    // The peacock's tail flares: every eye-spot blazes, rays sweep the screen, then the eyes fire.
    await withClip(c, async () => {
      const s = c.scene;
      const eyes: XY[] = Array.from({ length: 7 }, (_, i) => boss(c, -10 + Math.cos(Math.PI * (0.15 + i * 0.12)) * 90, -40 - Math.sin(Math.PI * (0.15 + i * 0.12)) * 70));
      eyes.forEach((e, i) => s.time.delayedCall(i * 30, () => glow(s, e[0], e[1], PINK, 60, 500, 1)));
      void rays(c, boss(c, 0, -40), { col: PINK, hot: 0xfff0f6, ms: 800, len: 520 });
      flash(c, PINK, 200);
      await pause(s, 260);
      await shot(c, 'fx_soft', { n: 5, col: PINK, hot: 0xfff0f6, scale: 0.45, stagger: 60, spreadY: 50, arc: 50, dur: 380, from: boss(c, -20, -60), power: 0.9 });
    }, 300);
  },
  'Trade-Off Tilt': async (c) => {
    // A balance scale appears over you and tips until both sides meet, then crashes down.
    await windup(c, VIOLET);
    void rain(c, 'ico_feather', { n: 6, col: VIOLET, scale: 0.5, spin: 4, power: 0.3, wide: true });
    await scales(c, VIOLET);
  },

  // ── Frostvault ──
  'Price Creep': async (c) => {
    // A cold fog rolls over you and every price climbs: up-arrows rise out of it.
    const s = c.scene;
    await windup(c, ICE, 200);
    for (let i = 0; i < 10; i++) smoke(s, c.to[0] + rnd(-60, 60), c.feet - rnd(0, 50), 0xd0ebff, 2, 30);
    for (let i = 0; i < 6; i++) {
      const a = s.add.image(c.to[0] + rnd(-50, 50), c.feet, 'ico_up').setScale(0.35 * K).setDepth(945).setAlpha(0);
      s.tweens.add({ targets: a, y: c.to[1] - 60, alpha: { from: 1, to: 0 }, duration: 700, delay: i * 80, ease: 'Sine.easeOut', onComplete: () => a.destroy() });
    }
    await pause(s, 500);
    hit(c, ICE, 0.8);
  },
  'Fee Chip': async (c) => {
    // The golem hurls a chunk of rock that knocks a coin off you.
    await windup(c, 0xadb5bd);
    await shot(c, 'ico_rock', { col: 0xadb5bd, scale: 0.8, arc: 60, spin: 12, dur: 420 });
    const coin = c.scene.add.image(c.to[0], c.to[1], 'ico_coin').setScale(0.4 * K).setDepth(951);
    await tw(c.scene, { targets: coin, x: c.from[0], y: c.from[1], angle: 540, duration: 520, ease: 'Sine.easeInOut' });
    coin.destroy();
  },
  'Overtime Stampede': async (c) => {
    // The mammoth charges across the ice with a storm of snow and frost behind it.
    const s = c.scene;
    const stop = trail(s, { get x() { return c.foe.x + 40; }, get y() { return c.feet - 20; } }, [WHITE, ICE], 0.8, 'ico_snow');
    await lunge(c, { col: ICE, dust: true, ms: 320 });
    stop();
    ring(s, c.to[0], c.feet, ICE, 260, 500, 0.3);
    sparks(s, c.to[0], c.to[1], { n: 10, tex: 'ico_shard', add: false, colors: [WHITE], speed: [120, 260], angle: [200, 340], size: 0.35, gravity: 600, rotate: true });
  },
  'Tusk Drop': async (c) => {
    // It rears and brings both icy tusks down in one huge swing; ice spikes burst under you.
    await withClip(c, async () => {
      await sweep(c, { col: ICE, hot: WHITE, r: 90 });
      await erupt(c, 'ico_shard', { col: ICE, n: 5, scale: 1, dirt: [0xe7f5ff, 0xa5d8ff] });
    }, 480);
  },

  // ── Credit Citadel ──
  'Late Swoop': async (c) => {
    // Dives from above with a talon slash.
    await windup(c, RED, 180);
    await lunge(c, { col: RED, swoop: -70, hitFx: false });
    await slash(c, { col: RED, n: 3 });
  },
  'Interest Drain': async (c) => {
    // Latches on and drains a little more every turn.
    await windup(c, RED, 180);
    await drain(c, RED, 900);
  },
  'Pincer Lock': async (c) => {
    // The scorpion snaps its claws forward, and chains wrap you with a padlock.
    await lunge(c, { col: PURPLE, hitFx: false, ms: 200 });
    await chainLock(c, PURPLE);
  },
  'Stinger Flurry': async (c) => {
    // Three venom jabs from the lock-tipped tail: the first plays the tail strike.
    const tail = boss(c, -10, -80);
    const jab = () => beam(c, { col: PURPLE, hot: 0xf3d9fa, width: 6, jitter: 3, hold: 110, from: tail, zig: true });
    if (c.hit > 1) return jab();
    await withClip(c, jab, 520);
  },

  // ── Compound Rift ──
  'Double Coil': async (c) => {
    // Coils around itself, and a glowing copy splits off and strikes too.
    const s = c.scene;
    const f = c.foe;
    await tw(s, { targets: f, angle: 360, duration: 360, ease: 'Cubic.easeInOut' });
    f.setAngle(0);
    const copy = s.add.image(f.x, f.y, f.texture.key, f.frame.name).setOrigin(f.originX, f.originY).setScale(f.scaleX, f.scaleY).setTint(TEAL).setAlpha(0.6).setBlendMode(ADD).setDepth(f.depth + 1);
    await tw(s, { targets: copy, y: f.y - 40, x: f.x + 20, duration: 160, ease: 'Back.easeOut' });
    await Promise.all([lunge(c, { col: TEAL }), tw(s, { targets: copy, x: c.to[0] + 40, y: c.feet, duration: 300, delay: 120, ease: 'Cubic.easeIn' })]);
    hit(c, TEAL, 0.7);
    await tw(s, { targets: copy, alpha: 0, duration: 200 });
    copy.destroy();
  },
  'Trapdoor Snap': async (c) => {
    // Looks like treasure, swells up, then snaps shut on you from below.
    const s = c.scene;
    const f = c.foe;
    const sx = f.scaleX, sy = f.scaleY;
    sparks(s, f.x, f.y - 40, { n: 10, colors: [GOLD, WHITE], tex: 'fx_spark', speed: [20, 70], gravity: 0, rotate: true });
    await tw(s, { targets: f, scaleX: sx * 1.25, scaleY: sy * 1.25, duration: 300, ease: 'Back.easeOut' });
    await tw(s, { targets: f, scaleX: sx, scaleY: sy, duration: 120 });
    const hole = s.add.ellipse(c.to[0], c.feet + 2, 10, 4, 0x0b0418, 0.9).setDepth(c.feet - 1);
    await tw(s, { targets: hole, width: 120, height: 30, duration: 200, ease: 'Back.easeOut' });
    await bite(c, { col: GOLD, tooth: 0xfff3bf });
    await tw(s, { targets: hole, width: 0, height: 0, duration: 200 });
    hole.destroy();
  },
  'Market Plunge': async (c) => {
    // The leviathan dives, and the whole rift drops with it: a crashing chart line and a water column.
    await withClip(c, async () => {
      const lift = await dim(c, DEEP, 0.3, 200);
      await crashLine(c, RED);
      await rain(c, 'fx_soft', { col: 0x4dabf7, scale: 2.4, power: 1.1 });
      sparks(c.scene, c.to[0], c.feet, { n: 30, colors: [WHITE, 0x74c0fc], speed: [120, 340], angle: [220, 320], size: 0.6, gravity: 600 });
      await lift();
    }, 520);
  },
  'Slow Tide': async (c) => {
    // A heavy, glowing current rolls in and wraps you in its spiral rings.
    const down = await rear(c, 18, 300);
    gather(c, c.from, CYAN, 300);
    await pause(c.scene, 200);
    void down();
    await Promise.all([current(c, CYAN, DEEP), swirl(c, { col: CYAN, hot: WHITE, ms: 1000, flat: 0.45, n: 24 })]);
  },

  // ── The Exchange ──
  'FOMO Charge': async (c) => {
    // Charges before you can think, a trail of green up-arrows behind it.
    await lunge(c, { col: GREEN, dust: true, trailTex: 'ico_up', ms: 200 });
  },
  'Sell-Off Slam': async (c) => {
    // A panicked swipe: red down-arrows rain on you and a claw slash lands.
    await windup(c, RED, 200);
    void rain(c, 'ico_down', { n: 5, col: RED, scale: 0.5, power: 0.4 });
    await pause(c.scene, 250);
    await slash(c, { col: RED, n: 2, cross: true, big: 1.3 });
  },
  'Perfect Storm': async (c) => {
    // The roc brings the whole storm down: clouds roll in, rain falls, and lightning strikes three times.
    const clear = storm(c, STORM);
    await withClip(c, async () => {
      await bolt(c, { col: STORM, n: 3, spread: 46 });
    }, 520);
    await pause(c.scene, 200);
    clear();
  },
  'Whirlwind': async (c) => {
    // One great wing-beat spins up a tornado around you, full of feathers.
    const down = await rear(c, 30, 220);
    const s = c.scene;
    const gust = s.add.particles(c.from[0], c.from[1], 'fx_streak', { speedX: { min: -620, max: -420 }, speedY: { min: -40, max: 40 }, lifespan: 500, scale: { start: 1.6, end: 0.4 }, alpha: { start: 0.5, end: 0 }, tint: [WHITE, STORM], blendMode: ADD, frequency: 15, quantity: 2 }).setDepth(905);
    void down();
    await tornado(c, { col: STORM, debris: 'ico_feather' });
    gust.stop();
    s.time.delayedCall(600, () => gust.destroy());
  },

  // ── Phish Fens ──
  'Too Good To Be True': async (c) => {
    // A glowing lure dangles in front of you, sways, and then the hook yanks.
    await windup(c, TEAL, 200);
    await lure(c, 0x63e6be);
  },
  'Name Scramble': async (c) => {
    // Ghostly letters are torn out of you and spun into a jumble.
    const s = c.scene;
    await windup(c, CYAN, 200);
    const glyphs = Array.from({ length: 8 }, (_, i) => s.add.image(c.to[0], c.to[1], 'ico_glyph').setScale(0.6 * K).setDepth(945).setAlpha(0).setData('a', (i / 8) * Math.PI * 2));
    const p = { t: 0 };
    await tw(s, {
      targets: p, t: 1, duration: 900, ease: 'Sine.easeInOut',
      onUpdate: () => glyphs.forEach((g, i) => {
        const a = (g.getData('a') as number) + p.t * 9;
        const R = 70 * K * Math.sin(p.t * Math.PI);
        g.setPosition(c.to[0] + Math.cos(a) * R, c.to[1] - 10 + Math.sin(a) * R * 0.6).setAngle(p.t * 720 + i * 40).setAlpha(Math.sin(p.t * Math.PI));
      }),
    });
    glyphs.forEach((g) => g.destroy());
    hit(c, CYAN, 0.9);
  },
  'Web of Lies': async (c) => {
    // The queen spins quietly, then springs the trap: her web shoots out and pulls tight.
    await withClip(c, async () => {
      await web(c, 0x3bc9db);
    }, 600);
  },

  // ── Ledgerhold ──
  'Compound Flame': async (c) => {
    // The Debt Dragon's violet lightning-fire; it keeps burning on you after the blast.
    await withClip(c, async () => {
      const mouth = boss(c, -70, -50);
      gather(c, mouth, PURPLE, 260);
      await pause(c.scene, 120);
      const flames = c.scene.add.particles(mouth[0], mouth[1], 'ico_flame', { speedX: { min: -700, max: -500 }, speedY: { min: -60, max: 90 }, lifespan: 520, scale: { start: 0.25 * K, end: 0.7 * K }, alpha: { start: 1, end: 0 }, rotate: { min: -40, max: 40 }, frequency: 16, quantity: 2 }).setDepth(912);
      await beam(c, { col: PURPLE, hot: 0xf3d9fa, width: 12, jitter: 4, hold: 420, from: mouth, zig: true });
      flames.stop();
      c.scene.time.delayedCall(600, () => flames.destroy());
      linger(c, PURPLE, 1000);
    }, 420);
  },
};

/** Plays the effect for an attack. Unknown attacks get a plain glowing lunge. */
export function playAttackFx(c: AttackCtx, attackName: string): Promise<void> {
  c.scene.data.set('afxFlashed', false);
  const fx = ATTACKS[attackName] ?? ((x: AttackCtx) => (x.clip ? withClip(x, async () => hit(x, WHITE, 1)) : lunge(x, { col: WHITE })));
  return fx(c);
}

/** Bosses whose attack clip plays inside the effect (the rest move by code). */
export const CLIP_ATTACKS = new Set(['Eight-Arm Spree', 'Dazzle Fan', 'Tusk Drop', 'Stinger Flurry', 'Market Plunge', 'Perfect Storm', 'Web of Lies', 'Compound Flame']);

/** The attack names this module draws, for tests. */
export const ATTACK_FX_NAMES = Object.keys(ATTACKS);

/** A charging spell: sparks pull into the caster and a ring grows with each charge. */
export function chargeFx(scene: Phaser.Scene, x: number, y: number, color: number, level: number): void {
  const c = { scene } as AttackCtx;
  gather(c, [x, y], color, 380, 80);
  ring(scene, x, y, color, 120 + level * 40, 500);
  glow(scene, x, y, WHITE, 70, 300, 0.9);
}

// ── The player's spells ────────────────────────────────────────────────────────────────────────
// Each spell has its own look, matching what it does. The wizard plays its cast clip meanwhile
// (BattleScene); these never move the wizard or the monster, only draw around them.
export interface SpellCtx { scene: Phaser.Scene; caster: Img; target: Img; from: XY; to: XY; feet: number; boss: boolean }

/** A circle of runes that spins up under the wizard as the spell gathers. */
async function circle(c: AttackCtx, col: number, ms = 360): Promise<void> {
  const s = c.scene;
  const g = s.add.graphics().setDepth(c.feet - 2).setBlendMode(ADD);
  const p = { t: 0 };
  const [x] = c.from;
  const y = c.feet + 2;
  gather(c, c.from, col, ms, 60);
  await tw(s, {
    targets: p, t: 1, duration: ms, ease: 'Quad.easeOut',
    onUpdate: () => {
      const R = 46 * K * p.t;
      g.clear();
      g.lineStyle(3, col, 0.9).strokeEllipse(x, y, R * 2, R * 0.6);
      g.lineStyle(2, WHITE, 0.6).strokeEllipse(x, y, R * 1.4, R * 0.42);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + p.t * 4;
        g.fillStyle(k % 2 ? col : WHITE, 0.9).fillCircle(x + Math.cos(a) * R * 0.85, y + Math.sin(a) * R * 0.26, 2.4);
      }
    },
  });
  s.tweens.add({ targets: g, alpha: 0, duration: 400, delay: 200, onComplete: () => g.destroy() });
}

const SPELL_FX: Record<string, Fx> = {
  // A golden beam of careful planning, with coins spraying off where it lands.
  budget_beam: async (c) => {
    await circle(c, GOLD);
    await beam(c, { col: GOLD, hot: 0xfff3bf, width: 9, jitter: 1.5, hold: 300 });
    sparks(c.scene, c.to[0], c.to[1], { n: 8, tex: 'ico_coin', add: false, colors: [WHITE], speed: [120, 240], angle: [200, 340], size: 0.3, gravity: 700, rotate: true, life: [500, 800] });
  },
  // Three savings orbs circle the wizard, then fly in one after another.
  save_shield: async (c) => {
    await circle(c, 0x4dabf7);
    const s = c.scene;
    const orbs = [0, 1, 2].map(() => s.add.image(c.from[0], c.from[1], 'fx_soft').setTint(0x4dabf7).setBlendMode(ADD).setDepth(921).setScale(0.6 * K));
    const p = { t: 0 };
    await tw(s, { targets: p, t: 1, duration: 420, onUpdate: () => orbs.forEach((o, i) => { const a = p.t * 9 + (i * Math.PI * 2) / 3; o.setPosition(c.from[0] + Math.cos(a) * 34 * K, c.from[1] + Math.sin(a) * 14 * K); }) });
    orbs.forEach((o) => o.destroy());
    await shot(c, 'fx_soft', { n: 3, col: 0x4dabf7, hot: 0xd0ebff, scale: 0.5, stagger: 90, arc: 30, dur: 320, spreadY: 30, power: 0.8 });
  },
  // A cleansing spiral of water rises round the wizard, then washes over the monster.
  credit_cleanse: async (c) => {
    const s = c.scene;
    await circle(c, 0x63e6be, 300);
    const up = s.add.particles(c.from[0], c.feet, 'fx_dot', { x: { min: -26, max: 26 }, speedY: { min: -220, max: -120 }, lifespan: 500, scale: { start: 0.6 * K, end: 0 }, tint: [0x63e6be, WHITE], blendMode: ADD, frequency: 12, quantity: 2 }).setDepth(921);
    await pause(s, 380);
    up.stop();
    s.time.delayedCall(600, () => up.destroy());
    await swirl(c, { col: 0x63e6be, hot: WHITE, arms: 3, deep: 0x0ca678, ms: 700, flat: 0.5, n: 20 });
    sparks(s, c.to[0], c.to[1], { n: 18, colors: [WHITE, 0x96f2d7], tex: 'fx_spark', speed: [40, 160], gravity: -40, rotate: true });
  },
  // Payday: coins and bills pour down onto the monster.
  paycheck_strike: async (c) => {
    void circle(c, 0x8ce99a);
    await pause(c.scene, 200);
    void rain(c, 'ico_bill', { n: 5, col: 0x8ce99a, scale: 0.45, spin: 6, power: 0.4 });
    await rain(c, 'ico_coin', { n: 7, col: GOLD, scale: 0.42, spin: 10, power: 0.5 });
    hit(c, GOLD, 1.2);
  },
  // Compound growth: 1 orb, then 2, then 4, each wave bigger, ending in a burst of light.
  compound_burst: async (c) => {
    await circle(c, PINK);
    for (const [n, sc] of [[1, 0.35], [2, 0.45], [4, 0.6]] as const) {
      await shot(c, 'fx_soft', { n, col: PINK, hot: 0xfff0f6, scale: sc, stagger: 50, arc: 40, dur: 300, spreadY: 40 * (n - 1) / 3, power: 0.5 });
    }
    await rays(c, c.to, { col: PINK, hot: 0xfff0f6, ms: 500, len: 260 });
    hit(c, PINK, 1.4);
  },
  // Insurance: a barrier of light shields the wizard, and pillars of light slam the monster.
  insurance_barrier: async (c) => {
    const s = c.scene;
    await circle(c, 0x91a7ff, 420);
    ring(s, c.from[0], c.from[1], 0x91a7ff, 200, 500);
    glow(s, c.from[0], c.from[1], 0x91a7ff, 160, 500, 0.7);
    await bolt(c, { col: 0x91a7ff, n: 3, spread: 26 });
    shake(c, 260, 0.008);
  },
  // Wise Choice: arcane blades cut the right path through the monster.
  wise_choice: async (c) => {
    await circle(c, 0xb197fc);
    await shot(c, 'fx_spark', { col: 0xb197fc, scale: 1.2, spin: 20, dur: 300, power: 0.4 });
    await slash(c, { col: 0xb197fc, hot: WHITE, n: 4, cross: true, big: 1.2 });
  },
};

export const SPELL_FX_NAMES = Object.keys(SPELL_FX);

/** Plays a spell's effect from the wizard to the monster. */
export function playSpellFx(c: SpellCtx, spell: string): Promise<void> {
  const ctx: AttackCtx = { scene: c.scene, foe: c.caster, player: c.target, from: c.from, to: c.to, feet: c.feet, boss: c.boss, hit: 1, of: 1 };
  c.scene.data.set('afxFlashed', false);
  return (SPELL_FX[spell] ?? SPELL_FX.budget_beam!)(ctx);
}
