// Save codes (no account needed). "Get a save code" sends the open slot to the server, which answers
// with a code like SUNNY-OTTER-482173; from then on the slot is backed up as it changes (a little
// after each change, and when the tab is hidden). Typing the code on another device brings the slot
// back. The nickname and class membership never leave the device: they're removed before sending,
// and a restored slot asks for a nickname. "Play offline" pauses backing up. Only loaded with VITE_MP_URL.
import type { Slot } from '../core/save.ts';
import { migrate, SAVE_VERSION } from '../core/save.ts';
import { useSave } from '../state/save.ts';
import { api, ApiError } from './api.ts';
import { MP_URL } from './config.ts';

/** What's sent: the slot without anything personal or secret. */
const wire = (s: Slot) => ({ version: SAVE_VERSION, slot: { ...s, nickname: '', online: null, backup: null } });

/** Make a save code for the open slot and remember it there. */
export async function makeSaveCode(): Promise<string> {
  const st = useSave.getState();
  const s = st.active === null ? null : st.slots[st.active];
  if (!s) throw new Error('No save open');
  const { code } = await api<{ code: string }>('/api/backup', { body: wire(s) });
  useSave.getState().edit((x) => ({ ...x, backup: { url: MP_URL, code } }));
  lastSent = '';
  return code;
}

/** Look a code up and return the slot it holds (upgraded to this version of the game), named `nickname`. */
export async function restoreSaveCode(code: string, nickname: string): Promise<Slot> {
  const r = await api<{ version: number; slot: Slot }>('/api/backup/restore', { body: { code } });
  const up = migrate({ version: r.version, active: 0, slots: [r.slot, null, null] }, r.version).slots[0];
  if (!up) throw new ApiError(0, 'bad-save', 'That save couldn’t be read. Ask for help.');
  return { ...up, nickname, online: null, backup: { url: MP_URL, code: code.trim().toUpperCase().replace(/\s+/g, '-') }, playedAt: new Date().toISOString() };
}

// ── Backing up as you play ──
let lastSent = '';
let timer: ReturnType<typeof setTimeout> | null = null;
let sending = false;

function due(): { code: string; body: string } | null {
  const st = useSave.getState();
  const s = st.active === null ? null : st.slots[st.active];
  if (!s?.backup || s.backup.url !== MP_URL || s.settings.playOffline) return null;
  const body = JSON.stringify({ code: s.backup.code, ...wire(s) });
  return body === lastSent ? null : { code: s.backup.code, body };
}

async function send(keepalive = false): Promise<void> {
  const d = due();
  if (!d || sending) return;
  sending = true;
  try {
    const res = await fetch(`${MP_URL}/api/backup`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: d.body, credentials: 'omit', keepalive });
    if (res.ok) lastSent = d.body;
    else if (res.status === 404) {
      // The code was deleted (unused for over a year): forget it, so the player can make a new one.
      useSave.getState().edit((x) => (x.backup?.code === d.code ? { ...x, backup: null } : x));
    }
  } catch {
    /* offline: the next change or the next visit tries again */
  } finally {
    sending = false;
  }
}

export function startBackupSync(): void {
  useSave.subscribe(() => {
    if (!due()) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void send(), 20_000); // after things settle, not on every coin
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void send(true);
  });
  void send();
}
