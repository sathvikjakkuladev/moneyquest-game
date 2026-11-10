import { describe, expect, it } from 'vitest';
import type { ClientMsg } from '../../src/net/protocol.ts';
import { MAX_MESSAGE, parseClient, parseServer, plausibleMove, take } from '../../src/net/protocol.ts';
import { Hub, MAX_STRIKES } from '../src/hub.ts';
import { WorldHub } from '../src/worldHub.ts';
import { WORLD_VISIBLE, worldName } from '../../src/net/world.ts';
import { isGeneratedName } from '../../src/net/names.ts';

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

describe('emotes, phrases, mute and reports', () => {
  it('says go to the screen only (not back to the sayer), one every 3 s with a burst of 2', () => {
    const { hub, a, b } = room();
    expect(hub.handle(a, { t: 'say', k: 'e', i: 0 }, 0).out).toEqual([{ to: b, msg: { t: 'say', id: a, k: 'e', i: 0 } }]);
    expect(hub.handle(a, { t: 'say', k: 'p', i: 3 }, 100).out).toHaveLength(1);
    expect(hub.handle(a, { t: 'say', k: 'p', i: 4 }, 200).out).toEqual([]); // over the limit
    expect(hub.handle(a, { t: 'say', k: 'p', i: 4 }, 3300).out).toHaveLength(1); // a new token after 3 s
  });
  it('a teacher-muted player still moves, but their says reach nobody; they are told', () => {
    const { hub, a, b } = room();
    expect(hub.setMuted('A', true)).toEqual({ out: [{ to: a, msg: { t: 'muted', on: true } }], pids: [a] });
    expect(hub.handle(a, { t: 'say', k: 'e', i: 1 }, 0).out).toEqual([]);
    hub.handle(a, { t: 'move', x: 310, y: 200, f: 2 }, 250);
    expect(hub.flush()).toEqual([{ to: b, msg: { t: 'state', m: [[a, 310, 200, 2]] } }]);
    hub.setMuted('A', false);
    expect(hub.handle(a, { t: 'say', k: 'e', i: 1 }, 5000).out).toHaveLength(1);
  });
  it('a member muted before connecting hears so in their welcome', () => {
    const hub = new Hub();
    const out = hub.hello(hub.newPid(), { id: 'M', public_name: 'QuietOwl1', muted: 1 }, hello(PLAZA), 0);
    expect(out[1]).toEqual({ to: 1, msg: { t: 'muted', on: true } });
  });
  it('reports carry the reported player’s last 10 says as the server saw them', () => {
    const { hub, a, b } = room();
    for (let i = 0; i < 12; i++) hub.handle(a, { t: 'say', k: 'p', i }, i * 3000);
    const r = hub.handle(b, { t: 'report', id: a }, 40_000);
    expect(r.out).toEqual([{ to: b, msg: { t: 'reported', id: a } }]);
    expect(r.report!.targetMemberId).toBe('A');
    expect(r.report!.history).toHaveLength(10);
    expect(r.report!.history[0]).toEqual({ kind: 'phrase', i: 2, at: 6000, screen: PLAZA });
    expect(hub.handle(b, { t: 'report', id: b }, 40_000).report).toBeUndefined(); // not yourself
    expect(hub.handle(b, { t: 'report', id: 99 }, 40_000).report).toBeUndefined(); // not here
    hub.handle(b, { t: 'report', id: a }, 40_000);
    expect(hub.handle(b, { t: 'report', id: a }, 40_000).report).toBeUndefined(); // 3 a minute
  });
  it('finds the connections to close when a student is removed or the class is deleted', () => {
    const { hub, a, b, c } = room();
    expect(hub.pidsOf('A')).toEqual([a]);
    expect(hub.pidsOf(null)).toEqual([a, b, c]);
  });
});

describe('world screen', () => {
  const W = 'piggybank_village/plaza';
  const wm = (id: string, cls: string) => ({ id, class_id: cls, name: `Brave${id}1`, muted: 0 });
  it('players see other classes only, nearest first, at most 15; classmates are left to the class room', () => {
    const hub = new WorldHub(W);
    const me = hub.newPid();
    hub.hello(me, wm('me', 'A'), hello(W, 300, 200), 0);
    const mate = hub.newPid();
    hub.hello(mate, wm('mate', 'A'), hello(W, 301, 200), 0);
    const far: number[] = [];
    for (let i = 0; i < 20; i++) { const p = hub.newPid(); far.push(p); hub.hello(p, wm(`o${i}`, 'B'), hello(W, 300 + (i + 1) * 10, 200), 0); }
    const sees = hub.conns.get(me)!.sees;
    expect(sees).toHaveLength(WORLD_VISIBLE);
    expect(sees).not.toContain(mate);
    expect(sees).toEqual(far.slice(0, 15)); // the 15 nearest, nearest first
  });
  it('moving nearer swaps who you see: a leave for the far one, a join for the near one', () => {
    const hub = new WorldHub(W);
    const me = hub.newPid();
    hub.hello(me, wm('me', 'A'), hello(W, 0, 200), 0);
    const ids: number[] = [];
    for (let i = 0; i < 16; i++) { const p = hub.newPid(); ids.push(p); hub.hello(p, wm(`o${i}`, 'B'), hello(W, 20 + i * 30, 200), 0); }
    const last = ids[15]!;
    expect(hub.conns.get(me)!.sees).not.toContain(last);
    hub.handle(last, { t: 'move', x: 480, y: 200, f: 3 }, 250); // nearer than the 15th (440)? no: 480 > 440
    hub.flush();
    expect(hub.conns.get(me)!.sees).not.toContain(last);
    for (let s = 1; s <= 14; s++) hub.handle(last, { t: 'move', x: 480 - s * 30, y: 200, f: 3 }, 250 + s * 250);
    const out = hub.flush();
    expect(out).toContainEqual({ to: me, msg: { t: 'join', p: expect.objectContaining({ id: last }) } });
    expect(out).toContainEqual({ to: me, msg: { t: 'leave', id: ids[14] } });
  });
  it('says and looks reach only those who see you; leaving tells them; reports name the class', () => {
    const hub = new WorldHub(W);
    const a = hub.newPid(), b = hub.newPid(), mate = hub.newPid();
    hub.hello(a, wm('a', 'A'), hello(W), 0);
    hub.hello(b, wm('b', 'B'), hello(W), 0);
    hub.hello(mate, wm('m', 'A'), hello(W), 0);
    expect(hub.handle(a, { t: 'say', k: 'e', i: 2 }, 0).out).toEqual([{ to: b, msg: { t: 'say', id: a, k: 'e', i: 2 } }]);
    const r = hub.handle(b, { t: 'report', id: a }, 10);
    expect(r.report).toMatchObject({ targetMemberId: 'a', targetClassId: 'A', history: [{ kind: 'emote', i: 2 }] });
    expect(hub.handle(a, { t: 'screen', s: 'piggybank_village/market', x: 1, y: 1, f: 0 }, 20).out).toEqual([]); // not here: a new connection instead
    expect(hub.leave(a)).toEqual([{ to: b, msg: { t: 'leave', id: a } }]);
    expect(hub.pidsOf({ classId: 'A' })).toEqual([mate]);
  });
  it('world names: generated names as they are; a teacher’s list name becomes a steady generated one', () => {
    expect(worldName('x', 'BraveOtter42')).toBe('BraveOtter42');
    const n = worldName('member-1', 'Sam Lee');
    expect(isGeneratedName(n)).toBe(true);
    expect(worldName('member-1', 'Sam Lee')).toBe(n);
    expect(worldName('member-2', 'Sam Lee')).not.toBe(n);
  });
});

describe('wire format', () => {
  it('accepts well-formed client messages only', () => {
    expect(parseClient(JSON.stringify(hello(PLAZA)))).toMatchObject({ t: 'hello', s: PLAZA });
    expect(parseClient(JSON.stringify({ t: 'move', x: 10.4, y: 20, f: 1 }))).toEqual({ t: 'move', x: 10, y: 20, f: 1 });
    expect(parseClient(JSON.stringify({ t: 'say', k: 'e', i: 7, extra: 'dropped' }))).toEqual({ t: 'say', k: 'e', i: 7 });
    expect(parseClient(JSON.stringify({ t: 'report', id: 3 }))).toEqual({ t: 'report', id: 3 });
    for (const bad of [
      '{', '[]', 'null', JSON.stringify({ t: 'chat', text: 'hi' }),
      JSON.stringify({ t: 'move', x: -1, y: 20, f: 1 }), JSON.stringify({ t: 'move', x: 700, y: 20, f: 1 }), JSON.stringify({ t: 'move', x: 1, y: 2, f: 4 }),
      JSON.stringify({ t: 'move', x: 'NaN', y: 2, f: 1 }), JSON.stringify({ ...hello(PLAZA), s: 'secret/room' }), JSON.stringify({ ...hello(PLAZA), token: 't_' + 'a'.repeat(43) }),
      JSON.stringify({ ...hello(PLAZA), h: '<img src=x>' }), JSON.stringify({ t: 'look', h: null, p: null, b: 'yes' }),
      JSON.stringify({ t: 'move', x: 1, y: 2, f: 1, pad: 'x'.repeat(MAX_MESSAGE) }),
      JSON.stringify({ t: 'say', k: 'p', i: 999 }), JSON.stringify({ t: 'say', k: 'p', i: 1.5 }), JSON.stringify({ t: 'say', k: 'x', i: 0 }),
      JSON.stringify({ t: 'say', k: 'p', text: 'hello' }), JSON.stringify({ t: 'report', id: 0 }), JSON.stringify({ t: 'report', id: 'a' }),
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
