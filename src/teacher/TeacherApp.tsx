// /teacher: sign up or log in, make classes and share their codes (Phase 1). The dashboard (roster,
// progress, Money Check CSV, mute/remove, world mode, goals) arrives in Phase 4.
// Sessions are bearer tokens kept in sessionStorage for this tab only (PLAN.md §10).
import { useEffect, useState } from 'react';
import { api, ApiError } from '../net/api.ts';
import { MP_URL } from '../net/config.ts';

interface TeacherInfo { email: string; admin: boolean; mustChange: boolean }
interface ClassInfo { id: string; code: string; name: string; namesMode: 'generated' | 'list'; worldMode: boolean; members: number }

const KEY = 'mq-teacher-session';
const store = {
  get: () => { try { return sessionStorage.getItem(KEY); } catch { return null; } },
  set: (t: string | null) => { try { if (t) sessionStorage.setItem(KEY, t); else sessionStorage.removeItem(KEY); } catch { /* private mode: session lasts until reload */ } },
};

const input = 'min-h-12 w-full rounded-md border-[3px] border-frame bg-white px-3 text-lg';

export function TeacherApp() {
  const [token, setToken] = useState<string | null>(() => store.get());
  const [me, setMe] = useState<TeacherInfo | null>(null);
  const [checking, setChecking] = useState(!!token);

  useEffect(() => {
    if (!token || !MP_URL) return;
    api<{ teacher: TeacherInfo }>('/api/teacher/me', { token })
      .then((r) => setMe(r.teacher))
      .catch(() => (store.set(null), setToken(null)))
      .finally(() => setChecking(false));
  }, [token]);

  const signedIn = (t: string, info: TeacherInfo) => (store.set(t), setToken(t), setMe(info));
  const signOut = () => {
    if (token) void api('/api/teacher/logout', { body: {}, token }).catch(() => {});
    store.set(null);
    setToken(null);
    setMe(null);
  };

  return (
    <div className="h-full overflow-auto bg-[#2a1c12] p-4">
      <main className="panel mx-auto flex max-w-3xl flex-col gap-4 p-6">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-3xl font-bold">MoneyQuest for teachers</h1>
          {me && <button className="btn btn-quiet" onClick={signOut}>Log out</button>}
        </header>
        {!MP_URL ? (
          <p className="text-xl">Class features aren’t switched on for this copy of MoneyQuest yet. The game itself works without them.</p>
        ) : checking ? (
          <p className="text-xl">Loading…</p>
        ) : !me || !token ? (
          <SignIn onDone={signedIn} />
        ) : me.mustChange ? (
          <ChangePassword token={token} onDone={() => setMe({ ...me, mustChange: false })} />
        ) : (
          <Classes token={token} email={me.email} onSignedOut={signOut} />
        )}
        <footer className="text-base text-[#5a3620]">
          Students never type anything other players can see, and no ads or trackers are used. <a className="underline" href="../">Back to the game</a>
        </footer>
      </main>
    </div>
  );
}

function SignIn({ onDone }: { onDone: (token: string, me: TeacherInfo) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ token: string; teacher: TeacherInfo }>(`/api/teacher/${mode}`, { body: { email, password } });
      onDone(r.token, r.teacher);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => (e.preventDefault(), void submit())}>
      <h2 className="text-2xl font-bold">{mode === 'login' ? 'Log in' : 'Create a teacher account'}</h2>
      <label className="flex flex-col gap-1 text-lg">Email<input className={input} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label className="flex flex-col gap-1 text-lg">
        Password {mode === 'signup' && <span className="text-base">(at least 10 characters)</span>}
        <input className={input} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'signup' ? 10 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {mode === 'signup' && <p className="text-base">Your email is only your login name: MoneyQuest never sends email. If you forget your password, ask the NHSQA admin to reset it.</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={busy}>{mode === 'login' ? 'Log in' : 'Create account'}</button>
        <button type="button" className="btn btn-quiet" onClick={() => (setMode(mode === 'login' ? 'signup' : 'login'), setMsg(null))}>
          {mode === 'login' ? 'New here? Create an account' : 'I have an account'}
        </button>
      </div>
      {msg && <p className="text-lg font-semibold text-[#9b2c1c]" role="alert">{msg}</p>}
    </form>
  );
}

function ChangePassword({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const submit = async () => {
    try {
      await api('/api/teacher/password', { body: { password }, token });
      onDone();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Something went wrong.');
    }
  };
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => (e.preventDefault(), void submit())}>
      <h2 className="text-2xl font-bold">Choose a new password</h2>
      <p className="text-lg">Your password was reset. Pick a new one (at least 10 characters).</p>
      <input className={input} type="password" autoComplete="new-password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} aria-label="New password" required />
      <button className="btn self-start">Save password</button>
      {msg && <p className="text-lg font-semibold text-[#9b2c1c]" role="alert">{msg}</p>}
    </form>
  );
}

function Classes({ token, email, onSignedOut }: { token: string; email: string; onSignedOut: () => void }) {
  const [classes, setClasses] = useState<ClassInfo[] | null>(null);
  const [name, setName] = useState('');
  const [names, setNames] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const call = async <T,>(f: () => Promise<T>): Promise<T | undefined> => {
    setMsg(null);
    try {
      return await f();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onSignedOut();
      setMsg(e instanceof ApiError ? e.message : 'Something went wrong.');
    }
  };
  const load = () => call(() => api<{ classes: ClassInfo[] }>('/api/teacher/classes', { token })).then((r) => r && setClasses(r.classes));
  useEffect(() => void load(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    const list = names.split('\n').map((n) => n.trim()).filter(Boolean);
    const r = await call(() => api<{ class: ClassInfo }>('/api/teacher/classes', { body: { name: name.trim(), ...(list.length ? { names: list } : {}) }, token }));
    if (r) {
      setClasses([...(classes ?? []), r.class]);
      setName('');
      setNames('');
    }
  };
  const remove = async (c: ClassInfo) => {
    if (!confirm(`Delete "${c.name}"? This deletes every student's membership and progress in it. It can't be undone.`)) return;
    if (await call(() => api(`/api/teacher/classes/${c.id}`, { method: 'DELETE', token }))) setClasses((classes ?? []).filter((x) => x.id !== c.id));
  };

  return (
    <section className="flex flex-col gap-4">
      <p className="text-lg">Logged in as <strong>{email}</strong>.</p>
      <h2 className="text-2xl font-bold">Your classes</h2>
      {classes === null ? <p className="text-lg">Loading…</p> : classes.length === 0 ? <p className="text-lg">No classes yet. Make one below.</p> : (
        <ul className="flex flex-col gap-2">
          {classes.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border-[3px] border-frame bg-white p-3">
              <div>
                <p className="text-xl font-semibold">{c.name}</p>
                <p className="text-lg">{c.members} student{c.members === 1 ? '' : 's'} · names: {c.namesMode === 'list' ? 'your list' : 'generated'} · world mode {c.worldMode ? 'on' : 'off'}</p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-3xl font-bold tracking-[0.25em]" aria-label={`Class code ${[...c.code].join(' ')}`}>{c.code}</p>
                <button className="btn btn-danger" onClick={() => void remove(c)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form className="flex flex-col gap-2 rounded-md border-[3px] border-dashed border-frame p-3" onSubmit={(e) => (e.preventDefault(), void create())}>
        <h3 className="text-xl font-bold">New class</h3>
        <label className="flex flex-col gap-1 text-lg">Class name (students see this)<input className={input} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label className="flex flex-col gap-1 text-lg">
          Optional: your own list of public names, one per line (for example “Owl 01”). Leave empty and students pick a generated name like “BraveOtter42”.
          <textarea className={`${input} min-h-24 py-2`} value={names} onChange={(e) => setNames(e.target.value)} />
        </label>
        <button className="btn self-start" disabled={!name.trim()}>Create class</button>
      </form>
      <p className="text-base">Students join in the game: Settings (⚙) → Join a class → type the code → pick a name. They never type their real name.</p>
      {msg && <p className="text-lg font-semibold text-[#9b2c1c]" role="alert">{msg}</p>}
    </section>
  );
}
