// Title → "Have a save code?": bring a backed-up save onto this device. Only built with VITE_MP_URL.
import { useState } from 'react';
import { randomNickname, SLOTS, validNickname } from '../core/save.ts';
import { ApiError } from '../net/api.ts';
import { restoreSaveCode } from '../net/backup.ts';
import { useSave } from '../state/save.ts';

export default function RestoreSave({ onDone, onClose }: { onDone: (slot: number) => void; onClose: () => void }) {
  const slots = useSave((s) => s.slots);
  const free = slots.findIndex((x) => !x);
  const [code, setCode] = useState('');
  const [name, setName] = useState(() => randomNickname(Math.random));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const go = async () => {
    if (!validNickname(name)) return setMsg('Nicknames use 2 to 12 letters or numbers.');
    setBusy(true);
    setMsg(null);
    try {
      const slot = await restoreSaveCode(code, name);
      useSave.getState().create(free, slot);
      onDone(free);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="restore-title">
      <form className="panel flex w-[min(30rem,100%)] flex-col gap-3 p-5" onSubmit={(e) => (e.preventDefault(), void go())}>
        <h2 id="restore-title" className="text-2xl font-bold">Load a save code</h2>
        {free < 0 ? (
          <p className="text-lg">All {SLOTS} save slots are full. Delete one first, then load your code into it.</p>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-lg">
              Save code
              <input className="min-h-12 field px-3 font-mono text-xl uppercase tracking-wider" value={code} onChange={(e) => setCode(e.target.value)} placeholder="SUNNY-OTTER-482173" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={40} required autoFocus />
            </label>
            <label className="flex flex-col gap-1 text-lg">
              Your nickname on this device
              <input className="min-h-12 field px-3 text-xl" value={name} onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9]/g, ''))} maxLength={12} required />
            </label>
            {msg && <p className="text-lg t-bad" role="alert">{msg}</p>}
          </>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
          {free >= 0 && <button className="btn" disabled={busy || code.trim().length < 8}>{busy ? 'Loading…' : 'Load my save'}</button>}
        </div>
      </form>
    </div>
  );
}
