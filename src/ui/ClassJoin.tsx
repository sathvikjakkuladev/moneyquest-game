// Settings → Class: join a class with the teacher's code and pick a public name (never typed), or
// leave it. Only built into the game when VITE_MP_URL is set (see src/net/config.ts).
import { useState } from 'react';
import { isClassCode, isDeviceCode, normalizeCode } from '../net/codes.ts';
import { api, ApiError } from '../net/api.ts';
import { MP_URL } from '../net/config.ts';
import { useSave, useSlot } from '../state/save.ts';
import { useNet } from '../net/bridge.ts';

type Step = { kind: 'idle' } | { kind: 'code' } | { kind: 'names'; code: string; className: string; choices: string[] };

export default function ClassJoin() {
  const s = useSlot()!;
  const status = useNet((n) => n.status);
  const removed = useNet((n) => n.removed);
  const offline = s.settings.playOffline;
  const setOffline = (playOffline: boolean) => useSave.getState().edit((x) => ({ ...x, settings: { ...x.settings, playOffline } }));
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const setOnline = (online: typeof s.online) => useSave.getState().edit((x) => ({ ...x, online }));

  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await f();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const lookUp = () =>
    run(async () => {
      const c = normalizeCode(code);
      if (isDeviceCode(c)) {
        // A device code from the teacher: this device takes over the student's name and progress.
        const r = await api<{ token: string; publicName: string; className: string; classCode: string }>('/api/rejoin', { body: { code: c } });
        setOnline({ url: MP_URL, classCode: r.classCode, className: r.className, token: r.token, publicName: r.publicName });
        useNet.setState({ removed: false });
        setStep({ kind: 'idle' });
        setCode('');
        return;
      }
      if (!isClassCode(c)) return setMsg('Class codes have 6 letters and numbers. Check the code with your teacher.');
      const r = await api<{ className: string; classCode: string; choices: string[] }>('/api/join', { body: { code: c } });
      if (!r.choices.length) return setMsg('There are no names left in this class. Ask your teacher.');
      setStep({ kind: 'names', code: r.classCode, className: r.className, choices: r.choices });
    });

  const join = (code: string, name: string) =>
    run(async () => {
      const r = await api<{ token: string; publicName: string; className: string; classCode: string }>('/api/join/confirm', { body: { code, name } });
      setOnline({ url: MP_URL, classCode: r.classCode, className: r.className, token: r.token, publicName: r.publicName });
      useNet.setState({ removed: false });
      setStep({ kind: 'idle' });
      setCode('');
    });

  const leave = () =>
    run(async () => {
      const m = s.online!;
      try {
        await api('/api/leave', { body: {}, token: m.token, base: m.url });
      } catch (e) {
        // Already removed by the teacher (or the class was deleted): just forget it here.
        if (!(e instanceof ApiError && e.status === 401)) throw e;
      }
      setOnline(null);
    });

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-xl">Class</legend>
      {s.online ? (
        <>
          <p className="text-lg">
            You’re in <strong>{s.online.className}</strong>. Classmates see you as <strong>{s.online.publicName}</strong>.
          </p>
          <label className="flex min-h-12 items-center gap-3 text-xl">
            <input type="checkbox" className="h-7 w-7" checked={offline} onChange={(e) => setOffline(e.target.checked)} />
            Play offline (no classmates, and nothing is sent to your class until you turn this off)
          </label>
          <p className="text-lg" role="status">
            {offline ? 'Playing offline. Your class stays saved: untick the box to see classmates and send your progress.' : status === 'online' ? '🟢 Connected: classmates on your screen can see you.' : status === 'connecting' ? 'Connecting…' : status === 'offline' ? 'Offline right now. The game works as usual and reconnects by itself.' : ''}
          </p>
          <button className="btn btn-quiet self-start" disabled={busy} onClick={leave}>Leave class</button>
          <a className="text-lg underline" href="/privacy/" target="_blank" rel="noreferrer">What your class can see (privacy)</a>
        </>
      ) : step.kind === 'idle' ? (
        <>
          {removed && <p className="text-lg" role="status">You’re not in this class on this device any more. Your teacher may have removed you, moved you to another device, or deleted the class. Ask your teacher for a code to join again.</p>}
          <p className="text-lg">Got a class code from your teacher? Join to see your classmates in the game.</p>
          <button className="btn btn-quiet self-start" onClick={() => setStep({ kind: 'code' })}>Join a class</button>
        </>
      ) : step.kind === 'code' ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => (e.preventDefault(), lookUp())}>
          <label className="flex flex-col text-lg">
            Class code or device code
            <input
              className="min-h-12 w-56 rounded-md border-[3px] border-frame bg-white px-3 text-2xl uppercase tracking-widest"
              value={code}
              onChange={(e) => setCode(e.target.value.slice(0, 12))}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              autoFocus
            />
          </label>
          <button className="btn" disabled={busy || !code.trim()}>Next</button>
          <button type="button" className="btn btn-quiet" onClick={() => (setStep({ kind: 'idle' }), setMsg(null))}>Cancel</button>
        </form>
      ) : (
        <>
          <p className="text-lg">
            Joining <strong>{step.className}</strong>. Pick the name your classmates will see:
          </p>
          <div className="flex flex-wrap gap-2">
            {step.choices.map((n) => (
              <button key={n} className="btn" disabled={busy} onClick={() => join(step.code, n)}>{n}</button>
            ))}
          </div>
          <button className="btn btn-quiet self-start" onClick={() => (setStep({ kind: 'idle' }), setMsg(null))}>Cancel</button>
        </>
      )}
      {msg && <p className="text-lg font-semibold text-[#9b2c1c]" role="alert">{msg}</p>}
    </fieldset>
  );
}
