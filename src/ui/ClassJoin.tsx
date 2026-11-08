// Settings → Class: join a class with the teacher's code and pick a public name (never typed), or
// leave it. Only built into the game when VITE_MP_URL is set (see src/net/config.ts).
import { useState } from 'react';
import { isClassCode, normalizeCode } from '../net/codes.ts';
import { api, ApiError } from '../net/api.ts';
import { MP_URL } from '../net/config.ts';
import { useSave, useSlot } from '../state/save.ts';

type Step = { kind: 'idle' } | { kind: 'code' } | { kind: 'names'; code: string; className: string; choices: string[] };

export default function ClassJoin() {
  const s = useSlot()!;
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
      if (!isClassCode(c)) return setMsg('Class codes have 6 letters and numbers. Check the code with your teacher.');
      const r = await api<{ className: string; classCode: string; choices: string[] }>('/api/join', { body: { code: c } });
      if (!r.choices.length) return setMsg('There are no names left in this class. Ask your teacher.');
      setStep({ kind: 'names', code: r.classCode, className: r.className, choices: r.choices });
    });

  const join = (code: string, name: string) =>
    run(async () => {
      const r = await api<{ token: string; publicName: string; className: string; classCode: string }>('/api/join/confirm', { body: { code, name } });
      setOnline({ url: MP_URL, classCode: r.classCode, className: r.className, token: r.token, publicName: r.publicName });
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
          <button className="btn btn-quiet self-start" disabled={busy} onClick={leave}>Leave class</button>
        </>
      ) : step.kind === 'idle' ? (
        <>
          <p className="text-lg">Got a class code from your teacher? Join to see your classmates in the game.</p>
          <button className="btn btn-quiet self-start" onClick={() => setStep({ kind: 'code' })}>Join a class</button>
        </>
      ) : step.kind === 'code' ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => (e.preventDefault(), lookUp())}>
          <label className="flex flex-col text-lg">
            Class code
            <input
              className="min-h-12 w-44 rounded-md border-[3px] border-frame bg-white px-3 text-2xl uppercase tracking-widest"
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
