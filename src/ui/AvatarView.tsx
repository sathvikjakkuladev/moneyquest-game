import { useEffect, useRef, useState } from 'react';
import type { Look } from '../core/look.ts';
import type { ClipName, Get } from '../game/avatarBake.ts';
import { avatarSources, bakeSheet, clipRate } from '../game/avatarBake.ts';
import { assetUrl, RENDER } from '../game/stage.ts';
import { reducedMotion } from '../game/motion.ts';
import { useSlot } from '../state/save.ts';

const images = new Map<string, Promise<HTMLImageElement>>();
const loaded = new Map<string, HTMLImageElement>();
function load(rel: string): Promise<HTMLImageElement> {
  let p = images.get(rel);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => (loaded.set(rel, im), resolve(im));
      im.onerror = reject;
      im.src = assetUrl(rel);
    });
    images.set(rel, p);
  }
  return p;
}
const get: Get = (rel) => loaded.get(rel)!;

/**
 * The avatar outside the game canvas (character creator, shop, bag): the same baked sheet the game
 * draws, shown on a small canvas. It plays the clip unless motion is reduced.
 */
export function AvatarView({ look, hat, clip = 'idle', tall = 110, label }: { look: Look; hat: string | null; clip?: ClipName; tall?: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const calm = reducedMotion(useSlot()?.settings.reducedMotion ?? null);
  const [ready, setReady] = useState(0);
  const key = `${Object.values(look).join('.')}|${hat ?? ''}|${clip}`;
  useEffect(() => {
    let live = true;
    void Promise.all(avatarSources(look, hat, [clip]).map(load)).then(() => live && setReady((n) => n + 1), () => undefined);
    return () => void (live = false);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const c = ref.current;
    if (!c || !avatarSources(look, hat, [clip]).every((r) => loaded.has(r))) return;
    const b = bakeSheet(get, look, hat, clip, tall);
    c.width = b.cellW;
    c.height = b.cellH;
    const g = c.getContext('2d')!;
    const draw = (f: number) => {
      g.clearRect(0, 0, c.width, c.height);
      g.drawImage(b.canvas, (f % b.cols) * b.cellW, Math.floor(f / b.cols) * b.cellH, b.cellW, b.cellH, 0, 0, b.cellW, b.cellH);
    };
    draw(b.order[0]!);
    if (calm) return;
    const { rate } = clipRate(clip);
    let i = 0;
    const t = setInterval(() => draw(b.order[(i = (i + 1) % b.order.length)]!), 1000 / rate);
    return () => clearInterval(t);
  }, [ready, key, tall, calm]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} role="img" aria-label={label} style={{ height: (tall * 1.45) | 0, width: 'auto', maxWidth: '100%' }} data-render={RENDER} />;
}
