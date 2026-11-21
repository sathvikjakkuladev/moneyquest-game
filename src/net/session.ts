// Decides when to be connected: a save that has joined a class on this server, isn't set to
// "Play offline", and is being played. A save that hasn't joined a class joins the open world as a
// guest instead: one shared world where everyone sees everyone (emotes and preset phrases only). Feeds the connection the player's look and battle state.
// With world mode on (the class room says so), also keeps a connection to the world screen the
// player is on, opening a new one on each screen change. Only loaded when VITE_MP_URL is set.
import type { Slot } from '../core/save.ts';
import { lookToList } from '../core/look.ts';
import { ALL_DISTRICTS } from '../core/progression.ts';
import type { Look } from './protocol.ts';
import { useSave } from '../state/save.ts';
import { useSession } from '../state/session.ts';
import { bridge, publishPeople, useNet } from './bridge.ts';
import { ClassConnection } from './client.ts';
import { MP_URL } from './config.ts';
import { startBackupSync } from './backup.ts';
import { api } from './api.ts';
import type { Membership } from '../core/save.ts';
import { startSync } from './sync.ts';

let conn: ClassConnection | null = null;
let key = '';
let world: ClassConnection | null = null;
let worldKey = ''; // `${token}|${screen}` of the open world connection
let screen = ''; // the screen the player is on ('' = none), from RoomScene's reports

// ── Open-world guests ──
// The guest token is kept on this device (not in a save), so every save without a class shares it.
const GUEST_KEY = 'mq-guest';
interface Guest { url: string; token: string; name: string }
let guest: Guest | null = (() => {
  try {
    const g = JSON.parse(localStorage.getItem(GUEST_KEY) ?? 'null') as Guest | null;
    return g && g.url === MP_URL && typeof g.token === 'string' ? g : null;
  } catch {
    return null;
  }
})();
let asking = false;
let guestRetry = 0;
function needGuest(): void {
  if (guest || asking || Date.now() < guestRetry) return;
  asking = true;
  api<{ token: string; name: string }>('/api/guest', { body: {} })
    .then((r) => {
      guest = { url: MP_URL, token: r.token, name: r.name };
      try {
        localStorage.setItem(GUEST_KEY, JSON.stringify(guest));
      } catch {
        /* private mode: this visit only */
      }
    })
    .catch(() => (guestRetry = Date.now() + 60_000)) // offline or busy: try again in a minute
    .finally(() => ((asking = false), check()));
}
/** The server forgot this guest (cleaned up after 90 days): drop the token and get a new one. */
function lostGuest(): void {
  guest = null;
  try {
    localStorage.removeItem(GUEST_KEY);
  } catch {
    /* ignore */
  }
  check();
}
const guestMembership = (g: Guest): Membership => ({ url: g.url, classCode: '', className: '', token: g.token, publicName: g.name });
/** Playing without a class, online: the open world. */
const wantsGuest = () => {
  const s = openSlot();
  return !!s && !s.online && !s.settings.playOffline && useSession.getState().screen === 'play';
};

/** The teacher removed this student (or moved them to another device, or deleted the class). */
const notMember = () => (useNet.setState({ removed: true }), useSave.getState().edit((x) => ({ ...x, online: null })));

const openSlot = () => {
  const st = useSave.getState();
  return st.active === null ? null : (st.slots[st.active] ?? null);
};

function check(): void {
  const s = openSlot();
  const ss = useSession.getState();
  const m = s?.online;
  const want = !!m && m.url === MP_URL && !s!.settings.playOffline && ss.screen === 'play';
  const k = want ? `${m!.url}|${m!.classCode}|${m!.token}` : '';
  if (k !== key) {
    conn?.stop();
    conn = null;
    key = k;
    bridge.on = !!k;
    bridge.remotes.clear();
    publishPeople();
    if (!k) useNet.setState({ status: 'off', says: {}, open: null, muted: false, goal: null, world: false });
    else conn = new ClassConnection(m!, { notMember, world: (on) => (useNet.setState({ world: on }), check()) });
  }
  const kind = ss.scene?.kind;
  if (kind === 'world') screen = ''; // on the world map: off every screen
  const asGuest = !k && wantsGuest();
  if (asGuest) needGuest();
  if (!k) {
    bridge.on = asGuest && !!guest;
    if (asGuest && guest) useNet.setState({ world: true });
    else if (!asGuest) useNet.setState({ status: 'off', world: false });
  }
  syncWorld();
  if (s && world) world.setLook(wireLook(s, kind === 'battle'));
  if (!conn || !s) return;
  const look = wireLook(s, kind === 'battle');
  conn.setLook(look);
  world?.setLook(look);
  if (kind === 'world') conn.report({ s: '', x: 0, y: 0, f: 0, moving: false });
}

/** What other players need to draw you: numbers and item ids only (PLAN.md §12, decision 7). */
function wireLook(s: Slot, busy: boolean): Look {
  return { h: s.inventory.hat, p: s.inventory.pet, b: busy, a: lookToList(s.look), pl: s.inventory.petLook ? ALL_DISTRICTS.indexOf(s.inventory.petLook as (typeof ALL_DISTRICTS)[number]) : -1 };
}

/** Open, move or close the world connection to match: world mode on, connected, and on a screen. */
function syncWorld(): void {
  const cls = openSlot()?.online;
  const g = !conn && wantsGuest() && guest ? guestMembership(guest) : null;
  const m = conn ? cls : g;
  const k = m && useNet.getState().world && screen ? `${m.token}|${screen}` : '';
  if (k === worldKey) return;
  world?.stop();
  world = null;
  worldKey = k;
  if (!k) return void useNet.setState({ worldStatus: 'off', ...(g || conn ? {} : { status: 'off' }) });
  world = new ClassConnection(m!, { notMember: g ? lostGuest : () => {} }, { screen, guest: !!g });
  const s = openSlot()!;
  world.setLook(wireLook(s, useSession.getState().scene?.kind === 'battle'));
}

export function startMultiplayer(): void {
  bridge.report = (r) => {
    if (r.s !== screen) (screen = r.s), syncWorld();
    conn?.report(r);
    world?.report(r);
  };
  bridge.say = (k, i) => void ((conn ? conn.say(k, i) : true) && world?.say(k, i));
  bridge.flag = (id) => (id < 0 ? world?.flag(-id) : conn?.flag(id)); // world players have negative ids
  useSave.subscribe(check);
  useSession.subscribe(check);
  check();
  startSync(notMember);
  startBackupSync();
}
