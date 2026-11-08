// Smoothing other players' movement: positions arrive a few times a second, so each remote player
// is drawn a little in the past, interpolated between the two updates around that moment.

export interface Sample { t: number; x: number; y: number }

/** How far behind real time remote players are drawn (ms): one server batch plus some jitter. */
export const RENDER_DELAY = 250;
const KEEP = 10;

export function addSample(buf: Sample[], s: Sample): void {
  buf.push(s);
  if (buf.length > KEEP) buf.splice(0, buf.length - KEEP);
}

/** Where to draw at time `t`: between the samples around it, or the nearest end. */
export function sampleAt(buf: readonly Sample[], t: number): { x: number; y: number } | null {
  if (!buf.length) return null;
  if (t <= buf[0]!.t) return { x: buf[0]!.x, y: buf[0]!.y };
  for (let i = 1; i < buf.length; i++) {
    const a = buf[i - 1]!, b = buf[i]!;
    if (t <= b.t) {
      const k = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
  }
  const last = buf[buf.length - 1]!;
  return { x: last.x, y: last.y };
}
