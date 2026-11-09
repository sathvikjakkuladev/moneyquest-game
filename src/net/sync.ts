// Uploads this save's progress summary to its class. A change (a battle, a Money Check) is sent a few
// seconds later; if that fails it retries with backoff. Each upload is the whole summary and the server
// counts increases from running totals, so a retry or a late upload never counts anything twice.
// Paused by Play offline: progress stays on the device and goes up when the switch is turned off.
// Only loaded when VITE_MP_URL is set.
import { useSave } from '../state/save.ts';
import { api, ApiError } from './api.ts';
import { publishGoal } from './bridge.ts';
import { MP_URL } from './config.ts';
import type { Goal } from './bridge.ts';
import { summarize } from './progress.ts';

const SETTLE_MS = 3000;
const MAX_RETRY_MS = 5 * 60_000;

export function startSync(notMember: () => void): void {
  let sent = ''; // `${token}|${summary}` last accepted by the server (empty after a reload: upload once)
  let timer: ReturnType<typeof setTimeout> | null = null;
  let busy = false;
  let failures = 0;

  /** What should be on the server right now, or null if nothing should be uploaded. */
  const wanted = () => {
    const st = useSave.getState();
    const s = st.active === null ? null : (st.slots[st.active] ?? null);
    const m = s?.online;
    if (!s || !m || m.url !== MP_URL || s.settings.playOffline) return null;
    const summary = summarize(s);
    return { token: m.token, url: m.url, summary, key: `${m.token}|${JSON.stringify(summary)}` };
  };

  const schedule = (ms: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void upload(), ms);
  };

  const upload = async () => {
    timer = null;
    const w = wanted();
    if (!w || w.key === sent) return;
    if (busy) return schedule(SETTLE_MS);
    busy = true;
    try {
      const r = await api<{ goal: Goal }>('/api/progress', { body: { summary: w.summary }, token: w.token, base: w.url });
      sent = w.key;
      failures = 0;
      publishGoal(r.goal);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) notMember();
      else if (e instanceof ApiError && e.status === 400) sent = w.key; // refused as invalid: retrying won't help
      else schedule(Math.min(MAX_RETRY_MS, 15_000 * 2 ** failures++));
    } finally {
      busy = false;
    }
  };

  const check = () => {
    const w = wanted();
    if (!w || w.key === sent || timer) return;
    schedule(SETTLE_MS);
  };
  useSave.subscribe(check);
  check();
}
