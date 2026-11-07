// ?dev=1 map editor: edit the current screen's walkable and blocked polygons, and drag entry, NPC,
// monster, portal and exit markers. Saves the whole zone to src/data/rooms/<zone>.json through the
// dev server (never into the asset pack). Saving reloads the page and returns to this room.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Pt } from '../core/geometry.ts';
import type { Rooms, Screen } from '../data/rooms.ts';
import { ROOMS } from '../data/rooms.ts';
import { currentRoom } from '../game/current.ts';
import { useSession } from '../state/session.ts';
import type { Stage } from '../ui/useStage.ts';

type Sel =
  | { kind: 'walk' | 'block'; i: number; v?: number }
  | { kind: 'entry'; key: string }
  | { kind: 'npc' | 'monster' | 'portal'; i: number }
  | { kind: 'exit'; i: number; end: 0 | 1 };

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const r = (n: number) => Math.round(Math.max(0, n));

export function MapEditor({ stage }: { stage: Stage }) {
  const setEditing = useSession((s) => s.setEditing);
  const [open, setOpen] = useState(false);
  const [rooms, setRooms] = useState<Rooms | null>(null);
  const [sel, setSel] = useState<Sel | null>(null);
  const [drawing, setDrawing] = useState<{ kind: 'walk' | 'block'; pts: Pt[] } | null>(null);
  const [status, setStatus] = useState('');
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Sel | null>(null);

  useEffect(() => setEditing(open), [open, setEditing]);
  const zone = currentRoom.zone, screenName = currentRoom.screen;
  const sc: Screen | null = rooms?.screens[screenName] ?? null;

  const start = () => {
    setRooms(clone(ROOMS[currentRoom.zone]!));
    setSel(null);
    setDrawing(null);
    setStatus('');
    setOpen(true);
  };
  const toCanvas = (e: { clientX: number; clientY: number }): Pt => {
    const b = svg.current!.getBoundingClientRect();
    return [r(((e.clientX - b.left) / b.width) * 640), r(((e.clientY - b.top) / b.height) * 360)];
  };
  const edit = (fn: (s: Screen) => void) =>
    setRooms((cur) => {
      if (!cur) return cur;
      const next = clone(cur);
      fn(next.screens[screenName]!);
      return next;
    });

  const move = (s: Sel, p: Pt) =>
    edit((x) => {
      if ((s.kind === 'walk' || s.kind === 'block') && s.v !== undefined) x[s.kind][s.i]![s.v] = p;
      else if (s.kind === 'entry') x.entries[s.key] = p;
      else if (s.kind === 'npc') Object.assign(x.npcs[s.i]!, { x: p[0], y: p[1] });
      else if (s.kind === 'monster') Object.assign(x.monsters[s.i]!, { x: p[0], y: p[1] });
      else if (s.kind === 'portal') x.portals![s.i]!.at = p;
      else if (s.kind === 'exit') {
        const e = x.exits[s.i]!;
        e.range[s.end] = e.edge === 'left' || e.edge === 'right' ? p[1] : p[0];
        e.range.sort((a, b) => a - b);
      }
    });

  const del = () => {
    if (!sel) return;
    edit((x) => {
      if ((sel.kind === 'walk' || sel.kind === 'block') && sel.v !== undefined && x[sel.kind][sel.i]!.length > 3) x[sel.kind][sel.i]!.splice(sel.v, 1);
      else if (sel.kind === 'walk' || sel.kind === 'block') x[sel.kind].splice(sel.i, 1);
    });
    setSel(null);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawing(null);
      if (e.key === 'Enter' && drawing) finish();
      if ((e.key === 'Delete' || e.key === 'Backspace') && !drawing) del();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const finish = () => {
    if (drawing && drawing.pts.length >= 3) edit((x) => void x[drawing.kind].push(drawing.pts));
    setDrawing(null);
  };

  const save = async () => {
    if (!rooms) return;
    setStatus('Saving…');
    try {
      const res = await fetch(`/__dev/rooms/${zone}`, { method: 'POST', body: JSON.stringify(rooms) });
      if (!res.ok) throw new Error(await res.text());
      sessionStorage.setItem('mq-dev-return', JSON.stringify({ zone, screen: screenName, at: currentRoom.player }));
      setStatus('Saved. Reloading…');
    } catch (e) {
      setStatus(`Save failed: ${String(e)}`);
    }
  };

  const k = stage.width / 640;
  const handle = (s: Sel) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (drawing) return;
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      drag.current = s;
      setSel(s);
    },
  });
  const shapes = useMemo(() => sc, [sc]);

  if (!open)
    return (
      <button className="btn pointer-events-auto absolute bottom-2 right-2 text-base" onClick={start} disabled={!currentRoom.zone}>
        🛠 Edit map
      </button>
    );
  if (!shapes) return null;
  const sq = 5 / k + 2; // handle size in canvas pixels, ~10 CSS px
  return (
    <>
      <svg
        ref={svg}
        viewBox="0 0 640 360"
        className="pointer-events-auto absolute left-0 top-0"
        style={{ width: stage.width, height: stage.height, cursor: drawing ? 'crosshair' : 'default' }}
        onPointerDown={(e) => {
          if (drawing) setDrawing({ ...drawing, pts: [...drawing.pts, toCanvas(e)] });
          else setSel(null);
        }}
        onPointerMove={(e) => drag.current && move(drag.current, toCanvas(e))}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={() => drawing && finish()}
      >
        {/* Fronts (scenery drawn over the player; edit them in the room JSON): outline and base line. */}
        {shapes.fronts?.map((f, i) => {
          const xs = f.poly.map((p) => p[0]);
          return (
            <g key={`f${i}`} pointerEvents="none">
              <polygon points={f.poly.map((p) => p.join(',')).join(' ')} fill="none" stroke="#3bc9db" strokeWidth={1} strokeDasharray="3 2" />
              <line x1={Math.min(...xs)} x2={Math.max(...xs)} y1={f.base} y2={f.base} stroke="#da77f2" strokeWidth={1.5} />
            </g>
          );
        })}
        {(['walk', 'block'] as const).map((kind) =>
          shapes[kind].map((poly, i) => {
            const on = sel && sel.kind === kind && sel.i === i;
            const c = kind === 'walk' ? '#2f9e44' : '#e03131';
            return (
              <g key={`${kind}${i}`}>
                <polygon points={poly.map((p) => p.join(',')).join(' ')} fill={c} fillOpacity={on ? 0.35 : 0.18} stroke={c} strokeWidth={on ? 2 : 1} {...handle({ kind, i })} />
                {on && poly.map((p, v) => <rect key={v} x={p[0] - sq / 2} y={p[1] - sq / 2} width={sq} height={sq} fill="#fff" stroke={c} {...handle({ kind, i, v })} />)}
              </g>
            );
          }),
        )}
        {shapes.exits.map((e, i) => {
          const [a, b] = e.range;
          const horiz = e.edge === 'top' || e.edge === 'bottom';
          const fixed = e.edge === 'left' ? 3 : e.edge === 'right' ? 637 : e.edge === 'top' ? 3 : 357;
          const end = (j: 0 | 1) => (horiz ? [e.range[j], fixed] : [fixed, e.range[j]]) as Pt;
          return (
            <g key={`x${i}`}>
              <line x1={horiz ? a : fixed} y1={horiz ? fixed : a} x2={horiz ? b : fixed} y2={horiz ? fixed : b} stroke="#ffd43b" strokeWidth={6} />
              {([0, 1] as const).map((j) => <circle key={j} cx={end(j)[0]} cy={end(j)[1]} r={sq / 1.5} fill="#ffd43b" stroke="#000" {...handle({ kind: 'exit', i, end: j })} />)}
              <text x={(a + b) / 2 * (horiz ? 1 : 0) + (horiz ? 0 : fixed)} y={horiz ? fixed + (e.edge === 'top' ? 14 : -6) : (a + b) / 2} fontSize={9} fill="#fff" stroke="#000" strokeWidth={0.3} textAnchor="middle">→ {e.to}</text>
            </g>
          );
        })}
        {Object.entries(shapes.entries).map(([key, p]) => (
          <g key={key} {...handle({ kind: 'entry', key })}>
            <circle cx={p[0]} cy={p[1]} r={sq / 1.4} fill="#22b8cf" stroke="#000" />
            <text x={p[0] + 6} y={p[1] - 4} fontSize={8} fill="#fff" stroke="#000" strokeWidth={0.3}>{key}</text>
          </g>
        ))}
        {shapes.npcs.map((n, i) => (
          <g key={`n${i}`} {...handle({ kind: 'npc', i })}>
            <rect x={n.x - sq} y={n.y - sq} width={sq * 2} height={sq * 2} fill="#4dabf7" stroke="#000" />
            <text x={n.x + 8} y={n.y} fontSize={8} fill="#fff" stroke="#000" strokeWidth={0.3}>{n.id}</text>
          </g>
        ))}
        {shapes.monsters.map((m, i) => (
          <g key={`m${i}`} {...handle({ kind: 'monster', i })}>
            <circle cx={m.x} cy={m.y} r={sq} fill={m.id.startsWith('boss') ? '#c92a2a' : '#f06595'} stroke="#000" />
            <text x={m.x + 8} y={m.y} fontSize={8} fill="#fff" stroke="#000" strokeWidth={0.3}>{m.id.replace(/^(mon|boss)_/, '')}</text>
          </g>
        ))}
        {shapes.portals?.map((p, i) => (
          <g key={`p${i}`} {...handle({ kind: 'portal', i })}>
            <circle cx={p.at[0]} cy={p.at[1]} r={sq} fill="#fff" stroke="#000" />
            <text x={p.at[0] + 8} y={p.at[1]} fontSize={8} fill="#fff" stroke="#000" strokeWidth={0.3}>→ {p.to}</text>
          </g>
        ))}
        {drawing && <polyline points={drawing.pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={drawing.kind === 'walk' ? '#2f9e44' : '#e03131'} strokeWidth={2} strokeDasharray="4 2" />}
      </svg>
      <div className="panel pointer-events-auto absolute right-2 top-2 flex w-64 flex-col gap-2 p-2 text-base">
        <p className="font-bold">Map editor · {zone}/{screenName}</p>
        <div className="flex flex-wrap gap-1">
          <button className="btn btn-quiet px-2 text-base" onClick={() => setDrawing({ kind: 'walk', pts: [] })}>+ Walk area</button>
          <button className="btn btn-quiet px-2 text-base" onClick={() => setDrawing({ kind: 'block', pts: [] })}>+ Blocked</button>
          <button className="btn btn-quiet px-2 text-base" onClick={del} disabled={!sel || (sel.kind !== 'walk' && sel.kind !== 'block')}>Delete</button>
        </div>
        <p className="leading-snug">
          {drawing ? 'Click to add points. Enter or double-click to finish, Esc to cancel.' : 'Drag points and markers. Click a shape to select it; Delete removes a selected point or the shape. Dashed blue: scenery drawn over the player when they stand above its purple base line.'}
        </p>
        <div className="flex gap-1">
          <button className="btn flex-1 px-2 text-base" onClick={save}>Save</button>
          <button className="btn btn-quiet flex-1 px-2 text-base" onClick={() => setOpen(false)}>Close</button>
        </div>
        {status && <p role="status">{status}</p>}
      </div>
    </>
  );
}
