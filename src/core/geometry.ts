// Walk areas for overworld screens (640×360 coordinates).
export type Pt = [number, number];
export type Poly = Pt[];

export function inPoly([x, y]: Pt, poly: Poly): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside a walk polygon and outside every block polygon. */
export const canStand = (p: Pt, walk: readonly Poly[], block: readonly Poly[]) => walk.some((w) => inPoly(p, w)) && !block.some((b) => inPoly(p, b));

/** Step by (dx, dy), sliding along walls: the full step, else each axis alone, else stay. */
export function step(from: Pt, dx: number, dy: number, ok: (p: Pt) => boolean): Pt {
  for (const p of [[from[0] + dx, from[1] + dy], [from[0] + dx, from[1]], [from[0], from[1] + dy]] as Pt[]) if ((p[0] !== from[0] || p[1] !== from[1]) && ok(p)) return p;
  return from;
}
