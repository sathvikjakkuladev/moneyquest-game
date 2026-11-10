// Decides when to be connected: a save that has joined a class on this server, isn't set to
// "Play offline", and is being played. Feeds the connection the player's look and battle state.
// With world mode on (the class room says so), also keeps a connection to the world screen the
// player is on, opening a new one on each screen change. Only loaded when VITE_MP_URL is set.
import { useSave } from '../state/save.ts';
import { useSession } from '../state/session.ts';
import { bridge, publishPeople, useNet } from './bridge.ts';
import { ClassConnection } from './client.ts';
import { MP_URL } from './config.ts';
import { startSync } from './sync.ts';

let conn: ClassConnection | null = null;
let key = '';
let world: ClassConnection | null = null;
let worldKey = ''; // `${token}|${screen}` of the open world connection
let screen = ''; // the screen the player is on ('' = none), from RoomScene's reports

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
  syncWorld();
  if (!conn || !s) return;
  const look = { h: s.inventory.hat, p: s.inventory.pet, b: kind === 'battle' };
  conn.setLook(look);
  world?.setLook(look);
  if (kind === 'world') conn.report({ s: '', x: 0, y: 0, f: 0, moving: false });
}

/** Open, move or close the world connection to match: world mode on, connected, and on a screen. */
function syncWorld(): void {
  const m = openSlot()?.online;
  const k = conn && m && useNet.getState().world && screen ? `${m.token}|${screen}` : '';
  if (k === worldKey) return;
  world?.stop();
  world = null;
  worldKey = k;
  if (!k) return void useNet.setState({ worldStatus: 'off' });
  world = new ClassConnection(m!, { notMember: () => {} }, { screen });
  const s = openSlot()!;
  world.setLook({ h: s.inventory.hat, p: s.inventory.pet, b: useSession.getState().scene?.kind === 'battle' });
}

export function startMultiplayer(): void {
  bridge.report = (r) => {
    if (r.s !== screen) (screen = r.s), syncWorld();
    conn?.report(r);
    world?.report(r);
  };
  bridge.say = (k, i) => void (conn?.say(k, i) && world?.say(k, i));
  bridge.flag = (id) => (id < 0 ? world?.flag(-id) : conn?.flag(id)); // world players have negative ids
  useSave.subscribe(check);
  useSession.subscribe(check);
  check();
  startSync(notMember);
}
