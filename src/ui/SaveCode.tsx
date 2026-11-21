// Settings → Save code: back up this save and continue on another device, no account needed.
// Only built into the game when VITE_MP_URL is set.
import { useState } from 'react';
import { ApiError } from '../net/api.ts';
import { makeSaveCode } from '../net/backup.ts';
import { useSlot } from '../state/save.ts';

export default function SaveCode() {
  const s = useSlot()!;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const make = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await makeSaveCode();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-xl">Save code</legend>
      {s.backup ? (
        <>
          <p className="text-lg">Your save code. Write it down somewhere safe: type it on any device to keep playing from here.</p>
          <p className="panel select-all self-start px-4 py-2 font-mono text-2xl font-bold tracking-wider" aria-label={`Save code ${s.backup.code.split('-').join(' ')}`}>{s.backup.code}</p>
          <p className="text-lg">{s.settings.playOffline ? 'Play offline is on, so your progress isn’t being backed up right now.' : 'Your progress is backed up as you play.'} Anyone with this code can load your progress, so only share it with a grown-up.</p>
        </>
      ) : (
        <>
          <p className="text-lg">Want to play on another device too? Get a save code: it backs up your progress, and you type it on the other device to carry on. No account, no email. Your nickname stays on this device.</p>
          <button className="btn btn-quiet self-start" disabled={busy || s.settings.playOffline} onClick={() => void make()}>{busy ? 'Making your code…' : 'Get a save code'}</button>
          {s.settings.playOffline && <p className="text-lg">Turn off Play offline to get a save code.</p>}
        </>
      )}
      {msg && <p className="text-lg t-bad" role="alert">{msg}</p>}
    </fieldset>
  );
}
