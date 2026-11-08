import { describe, expect, it } from 'vitest';
import type { ClientMsg } from '../../src/net/protocol.ts';
import { MAX_MESSAGE, parseClient, parseServer, plausibleMove, take } from '../../src/net/protocol.ts';
import { Hub, MAX_STRIKES } from '../src/hub.ts';

const PLAZA = 'piggybank_village/plaza', MARKET = 'piggybank_village/market';
const hello = (s: string, x = 300, y = 200): Extract<ClientMsg, { t: 'hello' }> => ({ t: 'hello', token: 'm_' + 'a'.repeat(43), s, x, y, f: 0, h: null, p: null, b: false });
const member = (id: string) => ({ id, public_name: `Brave${id}1`, muted: 0 });

function room() {
  const hub = new Hub();
  const a = hub.newPid(), b = hub.newPid(), c = hub.newPid();
  hub.hello(a, member('A'), hello(PLAZA), 0);
  const joinB = hub.hello(b, member('B'), hello(PLAZA, 100, 150), 0);
  hub.hello(c, member('C'), hello(MARKET), 0);
  return { hub, a, b, c, joinB };
}

describe('class room presence', () => {
  it('welcome lists only players on your screen; they hear you joined', () => {
    const { joinB, a, b } = room();
    expect(joinB[0]).toMatchObject({ to: b, msg: { t: 'welcome', you: b, players: [{ id: a, n: 'BraveA1', s: PLAZA }] } });
    expect(joinB.slice(1)).toEqual([{ to: a, msg: { t: 'join', p: expect.objectContaining({ id: b, x: 100, y: 150 }) } }]);
  });
  it('moves are batched and go only to the same screen, never back to the mover', () => {
    const { hub, a, b } = room();
    expect(hub.handle(a, { t: 'move', x: 310, y: 200, f: 2 }, 250).out).toEqual([]);
    expect(hub.handle(b, { t: 'move', x: 110, y: 150, f: 2 }, 250).out).toEqual([]);
    const out = hub.flush();
    expect(out).toEqual([
      { to: a, msg: { t: 'state', m: [[b, 110, 150, 2]] } },
      { to: b, msg: { t: 'state', m: [[a, 310, 200, 2]] } },
    ]);
    expect(hub.flush()).toEqual([]); // nothing new
  });
  it('changing screen: the old screen sees you leave, the new one sees you join, you get a snapshot', () => {
    const { hub, a, b, c } = room();
    const { out } = hub.handle(a, { t: 'screen', s: MARKET, x: 40, y: 176, f: 2 }, 1000);
    expect(out).toEqual([
      { to: b, msg: { t: 'leave', id: a } },
      { to: a, msg: { t: 'here', players: [expect.objectContaining({ id: c })] } },
      { to: c, msg: { t: 'join', p: expect.objectContaining({ id: a, s: MARKET, x: 40 }) } },
    ]);
  });
  it('rejects moves faster than walking speed, and floods; closes after too many', () => {
    const { hub, a, b } = room();
    hub.handle(a, { t: 'move', x: 600, y: 200, f: 2 }, 250); // 300 px in 0.25 s: ignored
    expect(hub.conns.get(a)!.x).toBe(300);
    hub.flush();
    for (let i = 0; i < 10; i++) hub.handle(b, { t: 'move', x: 100 + i, y: 150, f: 2 }, 300);
    expect(hub.handle(b, { t: 'move', x: 111, y: 150, f: 2 }, 300).out).toEqual([]); // over the burst: dropped
    expect(hub.conns.get(b)!.x).toBe(109);
    let closed = false;
    for (let i = 0; i < MAX_STRIKES + 1 && !closed; i++) closed = !!hub.handle(a, null, 400).close;
    expect(closed).toBe(true);
  });
  it('look changes (hat, pet, battle) go to the screen at once; leaving tells the screen', () => {
    const { hub, a, b } = room();
    expect(hub.handle(a, { t: 'look', h: 'hat-wizard', p: null, b: true }, 10).out).toEqual([{ to: b, msg: { t: 'look', id: a, h: 'hat-wizard', p: null, b: true } }]);
    expect(hub.leave(a)).toEqual([{ to: b, msg: { t: 'leave', id: a } }]);
    expect(hub.roster().map((r) => r.memberId).sort()).toEqual(['B', 'C']);
  });
  it('restored connections (after hibernation) keep their ids, and new ids come after them', () => {
    const { hub, a } = room();
    const h2 = new Hub();
    h2.restore(hub.conns.get(a)!);
    h2.reserve(7);
    expect(h2.newPid()).toBe(8);
  });
});

describe('wire format', () => {
  it('accepts well-formed client messages only', () => {
    expect(parseClient(JSON.stringify(hello(PLAZA)))).toMatchObject({ t: 'hello', s: PLAZA });
    expect(parseClient(JSON.stringify({ t: 'move', x: 10.4, y: 20, f: 1 }))).toEqual({ t: 'move', x: 10, y: 20, f: 1 });
    for (const bad of [
      '{', '[]', 'null', JSON.stringify({ t: 'chat', text: 'hi' }),
      JSON.stringify({ t: 'move', x: -1, y: 20, f: 1 }), JSON.stringify({ t: 'move', x: 700, y: 20, f: 1 }), JSON.stringify({ t: 'move', x: 1, y: 2, f: 4 }),
      JSON.stringify({ t: 'move', x: 'NaN', y: 2, f: 1 }), JSON.stringify({ ...hello(PLAZA), s: 'secret/room' }), JSON.stringify({ ...hello(PLAZA), token: 't_' + 'a'.repeat(43) }),
      JSON.stringify({ ...hello(PLAZA), h: '<img src=x>' }), JSON.stringify({ t: 'look', h: null, p: null, b: 'yes' }),
      JSON.stringify({ t: 'move', x: 1, y: 2, f: 1, pad: 'x'.repeat(MAX_MESSAGE) }),
    ]) expect(parseClient(bad), bad.slice(0, 60)).toBeNull();
  });
  it('the game drops malformed server messages and bad rows', () => {
    expect(parseServer(JSON.stringify({ t: 'state', m: [[1, 10, 20, 0], [2, 9999, 20, 0], 'x'] }))).toEqual({ t: 'state', m: [[1, 10, 20, 0]] });
    expect(parseServer(JSON.stringify({ t: 'join', p: { id: 1, n: 'x'.repeat(30), s: PLAZA, x: 1, y: 1, f: 0, h: null, p: null, b: false } }))).toBeNull();
    expect(parseServer('nope')).toBeNull();
  });
  it('movement allowance and token buckets', () => {
    expect(plausibleMove({ x: 0, y: 0 }, { x: 30, y: 0 }, 250)).toBe(true); // a normal step
    expect(plausibleMove({ x: 0, y: 0 }, { x: 60, y: 0 }, 0)).toBe(true); // bunched messages
    expect(plausibleMove({ x: 0, y: 0 }, { x: 100, y: 0 }, 250)).toBe(false);
    const b = { tokens: 2, at: 0 };
    expect([take(b, 0, 1, 2), take(b, 0, 1, 2), take(b, 0, 1, 2), take(b, 1000, 1, 2)]).toEqual([true, true, false, true]);
  });
});
