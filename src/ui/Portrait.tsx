import { useEffect, useState } from 'react';
import { manifest } from '../game/manifest.ts';

type Frames = Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
const cache = new Map<string, Promise<{ frames: Frames; size: { w: number; h: number } }>>();
const load = (json: string) => {
  let p = cache.get(json);
  if (!p) cache.set(json, (p = fetch(manifest.basePath + json).then((r) => r.json()).then((j) => ({ frames: j.frames, size: j.meta.size }))));
  return p;
};

/** A character's front-facing sprite as crisp pixel art, cropped to the character, `scale` × size. */
export function Portrait({ id, scale = 2, alt }: { id: string; scale?: number; alt: string }) {
  const c = manifest.characters[id];
  const [data, setData] = useState<{ frames: Frames; size: { w: number; h: number } } | null>(null);
  useEffect(() => {
    let live = true;
    if (c) void load(c.json).then((d) => live && setData(d));
    return () => void (live = false);
  }, [c]);
  if (!c || !data) return <div role="img" aria-label={alt} style={{ width: 64 * scale, height: 64 * scale }} />;
  const f = data.frames[c.rotations.south!]!.frame;
  const top = c.foot - c.height; // crop the empty space above the head
  return (
    <div
      role="img"
      aria-label={alt}
      style={{
        width: f.w * scale,
        height: c.height * scale,
        backgroundImage: `url(${manifest.basePath + c.image})`,
        backgroundSize: `${data.size.w * scale}px ${data.size.h * scale}px`,
        backgroundPosition: `${-f.x * scale}px ${-(f.y + top) * scale}px`,
        imageRendering: 'pixelated',
      }}
    />
  );
}
