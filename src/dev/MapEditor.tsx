// ?dev=1 map editor: edit the current screen's walkable and blocked polygons, and drag entry, NPC,
// monster, waystone and exit markers. Saves the whole zone to src/data/rooms/<zone>.json through the
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
  | { kind: 'npc' | 'monster'; i: number }
  | { kind: 'waystone' }
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
      else if (s.kind === 'waystone') x.waystone = p;
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
        {shapes.monsters.map((m, i) => (
          <g key={`m${i}`} {...handle({ kind: 'monster', i })}>
            <circle cx={m.x} cy={m.y} r={sq} fill={m.id.startsWith('boss') ? '#c92a2a' : '#f06595'} stroke="#000" />
            <text x={m.x + 8} y={m.y} fontSize={8} fill="#fff" stroke="#000" strokeWidth={0.3}>{m.id.replace(/^(mon|boss)_/, '')}</text>
          </g>
        ))}
        {shapes.waystone && (
          <g {...handle({ kind: 'waystone' })}>
            <circle cx={shapes.waystone[0]} cy={shapes.waystone[1]} r={sq} fill="#fff" stroke="#000" />
            <text x={shapes.waystone[0] + 8} y={shapes.waystone[1]} fontSize={8} fill="#fff" stroke="#000" strokeWidth={0.3}>waystone</text>
          </g>
        )}
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
