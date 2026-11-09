// /teacher: sign up or log in, make classes and share their codes. Open a class for its dashboard:
// students with progress and who's online, Money Check averages and the CSV, the weekly goal,
// settings, mute/remove/device codes and reports. The NHSQA admin account also gets password resets.
// Sessions are bearer tokens kept in sessionStorage for this tab only (PLAN.md §10).
import { useEffect, useState } from 'react';
import { api, ApiError } from '../net/api.ts';
import { MP_URL } from '../net/config.ts';
import type { CheckSummary } from '../net/progress.ts';
import { EMOTES, PHRASES } from '../net/says.ts';
import { TOPICS } from '../core/types.ts';
import { ZONES } from '../data/zones.ts';
import { averages, classCsv } from './report.ts';

interface TeacherInfo { email: string; admin: boolean; mustChange: boolean }
interface ClassInfo { id: string; code: string; name: string; namesMode: 'generated' | 'list'; worldMode: boolean; members: number }
interface ProgressInfo { level: number; xp: number; coinsEarned: number; zones: string[]; accuracy: Record<string, { answered: number; correct: number }>; mcForm: string; mcPre: CheckSummary | null; mcPost: CheckSummary | null; updatedAt: number }
interface MemberInfo { id: string; name: string; muted: boolean; joined: number; lastSeen: number; deviceCodeWaiting: boolean; online: { screen: string; busy: boolean } | null; progress: ProgressInfo | null }
interface ClassDetail { class: ClassInfo & { goalTarget: number; leaderboardHidden: boolean; names: string[] }; goal: { n: number; of: number }; onlineKnown: boolean; members: MemberInfo[]; reports: ReportInfo[] }
interface ReportInfo { id: string; at: number; targetId: string | null; target: string | null; reporter: string | null; history: { kind: 'emote' | 'phrase'; i: number; at: number; screen: string }[] }

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
      <main className="panel mx-auto flex max-w-4xl flex-col gap-4 p-6">
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
          <Classes token={token} email={me.email} admin={me.admin} onSignedOut={signOut} />
        )}
        <footer className="text-base text-[#5a3620]">
          Students never type anything other players can see, and no ads or trackers are used. <a className="underline" href="/privacy/">Privacy policy</a> · <a className="underline" href="/teacher-notice/">Teacher notice</a> · <a className="underline" href="../">Back to the game</a>
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

function Classes({ token, email, admin, onSignedOut }: { token: string; email: string; admin: boolean; onSignedOut: () => void }) {
  const [classes, setClasses] = useState<ClassInfo[] | null>(null);
  const [name, setName] = useState('');
  const [names, setNames] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
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

  if (openId) return <ClassView token={token} classId={openId} onBack={() => (setOpenId(null), void load())} onSignedOut={onSignedOut} />;

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
                <button className="btn" onClick={() => setOpenId(c.id)} aria-label={`Open ${c.name}`}>Open</button>
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
      {admin && <Admin token={token} />}
    </section>
  );
}

const when = (t: number) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const place = (screen: string) => screen.split('/').map((w) => w.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())).join(' · ');
const said = (h: ReportInfo['history'][number]) => (h.kind === 'emote' ? `${EMOTES[h.i]?.e ?? '?'} (${EMOTES[h.i]?.label ?? 'unknown emote'})` : `“${PHRASES[h.i] ?? 'unknown phrase'}”`);

const REFRESH_MS = 30_000;
const zoneName = (id: string) => ZONES.find((z) => z.id === id)?.name ?? id;
const MAIN_ZONES = ZONES.filter((z) => !z.bonus).map((z) => z.id);
const num = (n: number | null) => (n === null ? '–' : n.toFixed(1));

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function overall(p: ProgressInfo): number | null {
  const v = Object.values(p.accuracy);
  const answered = v.reduce((n, a) => n + a.answered, 0);
  return answered ? Math.round((v.reduce((n, a) => n + a.correct, 0) / answered) * 100) : null;
}

/** One class: goal and settings, Money Check results, reports, and the students. */
function ClassView({ token, classId, onBack, onSignedOut }: { token: string; classId: string; onBack: () => void; onSignedOut: () => void }) {
  const [data, setData] = useState<ClassDetail | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [code, setCode] = useState<{ name: string; code: string } | null>(null);
  const call = async <T,>(f: () => Promise<T>): Promise<T | undefined> => {
    setMsg(null);
    try {
      return await f();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onSignedOut();
      setMsg(e instanceof ApiError ? e.message : 'Something went wrong.');
    }
  };
  const load = () => call(() => api<ClassDetail>(`/api/teacher/classes/${classId}`, { token })).then((r) => r && setData(r));
  useEffect(() => {
    void load();
    const t = setInterval(() => document.visibilityState === 'visible' && void load(), REFRESH_MS); // who's online, new reports
    return () => clearInterval(t);
  }, [classId]); // eslint-disable-line react-hooks/exhaustive-deps

  const mute = async (m: { id: string; name: string }, muted: boolean) => {
    if (await call(() => api(`/api/teacher/classes/${classId}/members/${m.id}/mute`, { body: { muted }, token }))) await load();
  };
  const removeStudent = async (m: { id: string; name: string }) => {
    if (!confirm(`Remove ${m.name} from the class? Their class membership and progress summary are deleted, and they're disconnected now. They can join again with the class code.`)) return;
    if (await call(() => api(`/api/teacher/classes/${classId}/members/${m.id}`, { method: 'DELETE', token }))) await load();
  };
  const resolve = async (r: ReportInfo) => {
    if (await call(() => api(`/api/teacher/classes/${classId}/reports/${r.id}/resolve`, { body: {}, token }))) await load();
  };
  const newDeviceCode = async (m: MemberInfo) => {
    if (!confirm(`Make a device code for ${m.name}? Their current device is signed out of the class now. The code moves their name and progress to a new device.`)) return;
    const r = await call(() => api<{ code: string }>(`/api/teacher/classes/${classId}/members/${m.id}/device-code`, { body: {}, token }));
    if (r) {
      setCode({ name: m.name, code: r.code });
      await load();
    }
  };

  if (!data) return <p className="text-lg">{msg ?? 'Loading…'}</p>;
  const byId = new Map(data.members.map((m) => [m.id, m]));
  const avg = averages(data.members);
  const onlineCount = data.members.filter((m) => m.online).length;
  const goalPct = Math.min(100, Math.round((data.goal.n / data.goal.of) * 100));
  const hasChecks = avg.preCount + avg.postCount > 0;
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button className="btn btn-quiet" onClick={onBack}>← All classes</button>
        <button className="btn btn-quiet" onClick={() => void load()}>↻ Refresh</button>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-bold">{data.class.name}</h2>
        <p className="text-3xl font-bold tracking-[0.25em]" aria-label={`Class code ${[...data.class.code].join(' ')}`}>{data.class.code}</p>
      </div>
      {msg && <p className="text-lg font-semibold text-[#9b2c1c]" role="alert">{msg}</p>}

      <div className="flex flex-col gap-1 rounded-md border-[3px] border-frame bg-white p-3">
        <h3 className="text-xl font-bold">This week’s class goal</h3>
        <p className="text-lg">{data.goal.n} of {data.goal.of} correct answers{data.goal.n >= data.goal.of ? ': reached! 🎉' : ''}</p>
        <span role="progressbar" aria-label="Class goal this week" aria-valuenow={data.goal.n} aria-valuemin={0} aria-valuemax={data.goal.of} className="block h-5 overflow-hidden rounded-sm border-2 border-frame bg-white">
          <span className="block h-full bg-[#2f9e44]" style={{ width: `${goalPct}%` }} />
        </span>
      </div>

      <h3 className="text-xl font-bold">Money Check</h3>
      <div className="flex flex-col gap-2 rounded-md border-[3px] border-frame bg-white p-3">
        {!hasChecks ? <p className="text-lg">Nobody has taken a Money Check yet.</p> : (
          <dl className="grid grid-cols-1 gap-2 text-lg sm:grid-cols-3">
            <div><dt>First check average</dt><dd className="text-2xl font-bold">{num(avg.preAvg)} / 12</dd><dd>{avg.preCount} student{avg.preCount === 1 ? '' : 's'}</dd></div>
            <div><dt>Second check average</dt><dd className="text-2xl font-bold">{num(avg.postAvg)} / 12</dd><dd>{avg.postCount} student{avg.postCount === 1 ? '' : 's'}</dd></div>
            <div><dt>Average change</dt><dd className="text-2xl font-bold">{avg.matchedChange === null ? '–' : `${avg.matchedChange >= 0 ? '+' : ''}${avg.matchedChange.toFixed(1)}`}</dd><dd>{avg.matchedCount} who took both</dd></div>
          </dl>
        )}
        <button className="btn self-start" disabled={!hasChecks} onClick={() => download(`moneyquest-${data.class.code}-money-check-${new Date().toISOString().slice(0, 10)}.csv`, classCsv(data.members))}>⬇ Download Money Check CSV</button>
      </div>

      <h3 className="text-xl font-bold">Reports {data.reports.length > 0 && `(${data.reports.length})`}</h3>
      {data.reports.length === 0 ? <p className="text-lg">No open reports.</p> : (
        <ul className="flex flex-col gap-2" aria-label="Reports">
          {data.reports.map((r) => {
            const m = r.targetId ? byId.get(r.targetId) : undefined;
            return (
              <li key={r.id} className="flex flex-col gap-2 rounded-md border-[3px] border-[#9b2c1c] bg-white p-3">
                <p className="text-lg"><strong>{r.target ?? 'A student who has left'}</strong> was reported by <strong>{r.reporter ?? 'a student who has left'}</strong> · {when(r.at)}</p>
                {r.history.length === 0 ? <p className="text-lg">They hadn’t said anything recently.</p> : (
                  <>
                    <p className="text-lg">What they said recently (newest last):</p>
                    <ol className="ml-6 list-decimal text-lg">
                      {r.history.map((h, i) => <li key={i}>{said(h)} · {place(h.screen)} · {when(h.at)}</li>)}
                    </ol>
                  </>
                )}
                <div className="flex flex-wrap gap-2">
                  {m && <button className="btn" onClick={() => void mute(m, !m.muted)}>{m.muted ? 'Unmute' : 'Mute'} {m.name}</button>}
                  {m && <button className="btn btn-danger" onClick={() => void removeStudent(m)}>Remove {m.name}</button>}
                  <button className="btn btn-quiet" onClick={() => void resolve(r)}>Close report</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <h3 className="text-xl font-bold">Students ({data.members.length}){data.onlineKnown ? ` · ${onlineCount} online` : ''}</h3>
      {code && (
        <div className="flex flex-col gap-1 rounded-md border-[3px] border-[#2f9e44] bg-white p-3" role="status">
          <p className="text-lg">Device code for <strong>{code.name}</strong>. In the game: Settings (⚙) → Join a class → type this code. It works once, for one day, and isn’t shown again.</p>
          <p className="text-3xl font-bold tracking-[0.25em]">{code.code}</p>
          <button className="btn btn-quiet self-start" onClick={() => setCode(null)}>Done</button>
        </div>
      )}
      {data.members.length === 0 ? <p className="text-lg">Nobody has joined yet. Students join in the game: Settings (⚙) → Join a class → type the code.</p> : (
        <ul className="flex flex-col gap-2" aria-label="Students">
          {data.members.map((m) => {
            const p = m.progress;
            const acc = p ? overall(p) : null;
            const main = p ? p.zones.filter((z) => MAIN_ZONES.includes(z)).length : 0;
            return (
              <li key={m.id} className="flex flex-col gap-2 rounded-md border-[3px] border-frame bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xl font-semibold">{m.name}{m.muted && ' 🔇'}</p>
                    <p className="text-lg">
                      {m.online ? `🟢 ${m.online.busy ? 'In a battle' : 'Online'}${m.online.screen ? ` · ${place(m.online.screen)}` : ' · World map'}` : `Last played ${when(m.lastSeen)}`}
                      {m.muted ? ' · emotes and phrases off' : ''}{m.deviceCodeWaiting ? ' · device code waiting' : ''}
                    </p>
                    <p className="text-lg">
                      {p ? <>Level {p.level} · 🪙 {p.coinsEarned} earned · {main} of {MAIN_ZONES.length} zones · {acc === null ? 'no questions yet' : `${acc}% correct`} · Money Check {p.mcPre ? `${p.mcPre.total}/12` : '–'} → {p.mcPost ? `${p.mcPost.total}/12` : '–'}</> : 'No progress yet.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn" onClick={() => void mute(m, !m.muted)} aria-label={`${m.muted ? 'Unmute' : 'Mute'} ${m.name}`}>{m.muted ? 'Unmute' : 'Mute'}</button>
                    <button className="btn btn-quiet" onClick={() => void newDeviceCode(m)} aria-label={`New device code for ${m.name}`}>Device code</button>
                    <button className="btn btn-danger" onClick={() => void removeStudent(m)} aria-label={`Remove ${m.name}`}>Remove</button>
                  </div>
                </div>
                {p && (
                  <details className="text-lg">
                    <summary className="cursor-pointer font-semibold">Accuracy by topic and zones</summary>
                    <table className="mt-1 w-full text-left">
                      <thead><tr><th className="font-semibold">Topic</th><th className="font-semibold">Accuracy</th><th className="font-semibold">Check 1</th><th className="font-semibold">Check 2</th></tr></thead>
                      <tbody>
                        {TOPICS.map((t) => {
                          const a = p.accuracy[t];
                          return <tr key={t}><td>{t}</td><td>{a && a.answered ? `${Math.round((a.correct / a.answered) * 100)}% of ${a.answered}` : 'not tried'}</td><td>{p.mcPre ? `${p.mcPre.perTopic[t]}/2` : '–'}</td><td>{p.mcPost ? `${p.mcPost.perTopic[t]}/2` : '–'}</td></tr>;
                        })}
                      </tbody>
                    </table>
                    <p className="mt-1">Zones cleared: {p.zones.length ? p.zones.map(zoneName).join(', ') : 'none yet'}.</p>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-lg">Mute turns off a student’s emotes and phrases for everyone; they can still play. Remove takes them out of the class straight away. A device code moves a student to a new device and keeps their progress.</p>

      <ClassSettings key={data.class.id} token={token} detail={data} call={call} reload={load} />
    </section>
  );
}

/** The weekly goal, the leaderboard switch and the class's list of public names. */
function ClassSettings({ token, detail, call, reload }: { token: string; detail: ClassDetail; call: <T>(f: () => Promise<T>) => Promise<T | undefined>; reload: () => Promise<unknown> }) {
  const id = detail.class.id;
  const [target, setTarget] = useState(String(detail.class.goalTarget));
  const [names, setNames] = useState(detail.class.names.join('\n'));
  const [hidden, setHiddenBox] = useState(detail.class.leaderboardHidden);
  const [saved, setSaved] = useState<string | null>(null);
  const done = async (text: string) => (setSaved(text), await reload());
  const saveGoal = async () => {
    if (await call(() => api(`/api/teacher/classes/${id}`, { method: 'PATCH', body: { goalTarget: Number(target) }, token }))) await done('Weekly goal saved.');
  };
  const setHidden = async (leaderboardHidden: boolean) => {
    setHiddenBox(leaderboardHidden); // tick the box at once; put it back if saving fails
    if (await call(() => api(`/api/teacher/classes/${id}`, { method: 'PATCH', body: { leaderboardHidden }, token }))) await done(leaderboardHidden ? 'Leaderboard hidden.' : 'Leaderboard shown.');
    else setHiddenBox(!leaderboardHidden);
  };
  const saveNames = async () => {
    const list = names.split('\n').map((n) => n.trim()).filter(Boolean);
    if (await call(() => api(`/api/teacher/classes/${id}/names`, { method: 'PUT', body: { names: list }, token }))) await done(list.length ? 'Name list saved.' : 'Students will pick generated names.');
  };
  return (
    <details className="rounded-md border-[3px] border-dashed border-frame p-3">
      <summary className="cursor-pointer text-xl font-bold">Class settings</summary>
      <div className="mt-2 flex flex-col gap-3">
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => (e.preventDefault(), void saveGoal())}>
          <label className="flex flex-col gap-1 text-lg">Weekly goal (correct answers)<input className={`${input} w-40`} type="number" min={10} max={100000} value={target} onChange={(e) => setTarget(e.target.value)} required /></label>
          <button className="btn">Save goal</button>
        </form>
        <label className="flex min-h-12 items-center gap-3 text-lg">
          <input type="checkbox" className="h-7 w-7" checked={hidden} onChange={(e) => void setHidden(e.target.checked)} />
          Hide the class leaderboard from students
        </label>
        <form className="flex flex-col gap-2" onSubmit={(e) => (e.preventDefault(), void saveNames())}>
          <label className="flex flex-col gap-1 text-lg">
            Your list of public names, one per line (empty: students pick generated names). Students who already joined keep their name.
            <textarea className={`${input} min-h-24 py-2`} value={names} onChange={(e) => setNames(e.target.value)} />
          </label>
          <button className="btn self-start">Save names</button>
        </form>
        {saved && <p className="text-lg" role="status">{saved}</p>}
      </div>
    </details>
  );
}

/** The NHSQA admin account: teacher password resets (MoneyQuest never sends email). */
function Admin({ token }: { token: string }) {
  const [list, setList] = useState<{ id: string; email: string; created: number; lastLogin: number | null; classes: number }[] | null>(null);
  const [temp, setTemp] = useState<{ email: string; password: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    api<{ teachers: NonNullable<typeof list> }>('/api/admin/teachers', { token }).then((r) => setList(r.teachers)).catch(() => setMsg('Couldn’t load the teachers.'));
  }, [token]);
  const reset = async (t: { id: string; email: string }) => {
    if (!confirm(`Reset the password for ${t.email}? They're signed out now and must choose a new password at their next login.`)) return;
    setMsg(null);
    try {
      const r = await api<{ tempPassword: string }>(`/api/admin/teachers/${t.id}/reset`, { body: {}, token });
      setTemp({ email: t.email, password: r.tempPassword });
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Something went wrong.');
    }
  };
  return (
    <section className="flex flex-col gap-2 rounded-md border-[3px] border-frame bg-white p-3" aria-label="Admin">
      <h2 className="text-2xl font-bold">Admin: teacher accounts</h2>
      {temp && (
        <div role="status" className="flex flex-col gap-1">
          <p className="text-lg">Temporary password for <strong>{temp.email}</strong>. Give it to them privately: it isn’t shown again.</p>
          <p className="break-all text-2xl font-bold">{temp.password}</p>
        </div>
      )}
      {list === null ? <p className="text-lg">{msg ?? 'Loading…'}</p> : (
        <ul className="flex flex-col gap-2">
          {list.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-lg"><strong>{t.email}</strong> · {t.classes} class{t.classes === 1 ? '' : 'es'} · last login {t.lastLogin ? when(t.lastLogin) : 'never'}</p>
              <button className="btn btn-quiet" onClick={() => void reset(t)} aria-label={`Reset password for ${t.email}`}>Reset password</button>
            </li>
          ))}
        </ul>
      )}
      {msg && list !== null && <p className="text-lg font-semibold text-[#9b2c1c]" role="alert">{msg}</p>}
    </section>
  );
}
