// ?dev=1 test helpers: jump to any screen, equip a pet, add coins. Not shown in normal play.
import { useState } from 'react';
import { ITEMS } from '../data/items.ts';
import { ROOMS } from '../data/rooms.ts';
import { useSave, useSlot } from '../state/save.ts';
import { useSession } from '../state/session.ts';

export function DevPanel() {
  const s = useSlot();
  const [open, setOpen] = useState(false);
  if (!s) return null;
  const pets = ITEMS.filter((i) => i.kind === 'pet');
  const edit = useSave.getState().edit;
  if (!open) return <button className="btn btn-quiet pointer-events-auto absolute bottom-2 right-36 text-base" onClick={() => setOpen(true)}>🧪 Dev</button>;
  return (
    <div className="panel pointer-events-auto absolute bottom-2 right-2 flex max-h-[80%] w-72 flex-col gap-2 overflow-auto p-2 text-base">
      <p className="font-bold">Dev tools (?dev=1: every zone is open)</p>
      <label className="flex flex-col gap-1">
        Go to screen
        <select className="min-h-10 rounded border-2 border-frame bg-white px-1" defaultValue="" onChange={(e) => {
          const [zone, screen] = e.target.value.split('/');
          if (zone && screen) useSession.getState().go({ kind: 'room', zone, screen });
        }}>
          <option value="">Choose…</option>
          {Object.values(ROOMS).flatMap((r) => Object.keys(r.screens).map((sc) => <option key={`${r.zone}/${sc}`} value={`${r.zone}/${sc}`}>{r.zone} / {sc}</option>))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        Pet
        <select className="min-h-10 rounded border-2 border-frame bg-white px-1" value={s.inventory.pet ?? ''} onChange={(e) => edit((x) => ({ ...x, inventory: { ...x.inventory, pet: e.target.value || null } }))}>
          <option value="">None</option>
          {pets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <p className="text-sm">Pick a pet, then walk to another screen to see it follow.</p>
      <button className="btn btn-quiet px-2 text-base" onClick={() => edit((x) => ({ ...x, progress: { ...x.progress, coins: x.progress.coins + 500 } }))}>+500 coins</button>
      <button className="btn px-2 text-base" onClick={() => setOpen(false)}>Close</button>
    </div>
  );
}
