// Decides when to be connected: a save that has joined a class on this server, isn't set to
// "Play offline", and is being played. Feeds the connection the player's look and battle state.
// Only loaded when VITE_MP_URL is set (see App.tsx).
import { useSave } from '../state/save.ts';
import { useSession } from '../state/session.ts';
import { bridge, publishPeople, useNet } from './bridge.ts';
import { ClassConnection } from './client.ts';
import { MP_URL } from './config.ts';

let conn: ClassConnection | null = null;
let key = '';

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
    if (!k) useNet.setState({ status: 'off' });
    else
      conn = new ClassConnection(m!, {
        // The teacher removed this student (or reset their token, or deleted the class).
        notMember: () => useSave.getState().edit((x) => ({ ...x, online: null })),
      });
  }
  if (!conn || !s) return;
  const kind = ss.scene?.kind;
  conn.setLook({ h: s.inventory.hat, p: s.inventory.pet, b: kind === 'battle' });
  if (kind === 'world') conn.report({ s: '', x: 0, y: 0, f: 0, moving: false }); // on the world map: off every screen
}

export function startMultiplayer(): void {
  bridge.report = (r) => conn?.report(r);
  useSave.subscribe(check);
  useSession.subscribe(check);
  check();
}
