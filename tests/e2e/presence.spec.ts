// Multiplayer Phase 2, against the local server (`npm run dev:all`, then
// MP_E2E=1 E2E_URL=http://localhost:5173 npx playwright test presence):
// two classmates on the same screen see each other (name labels, smooth movement), a third on
// another screen sees nobody, the battle icon shows, and an unreachable server changes nothing.
import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

test.skip(!process.env.MP_E2E, 'needs the local multiplayer server (npm run dev:all) and MP_E2E=1');

const MP = 'http://localhost:8787';
const ORIGIN = 'http://localhost:5173';
type Net = { on: boolean; status: string; people: { id: number; name: string; busy: boolean }[]; remotes: { id: number; name: string; x: number; y: number; busy: boolean }[] };

async function api(path: string, body: object, token?: string) {
  const r = await fetch(MP + path, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  expect(r.status, path).toBe(200);
  return r.json() as Promise<Record<string, unknown>>;
}

/** A class with `n` students; returns their memberships. */
async function makeClass(n: number) {
  const t = await api('/api/teacher/signup', { email: `p${Date.now()}${Math.random().toString(36).slice(2, 6)}@school.test`, password: 'correct horse battery' });
  const c = (await api('/api/teacher/classes', { name: 'Room 7' }, t.token as string)).class as { code: string };
  const out = [];
  for (let i = 0; i < n; i++) {
    const o = await api('/api/join', { code: c.code });
    const j = await api('/api/join/confirm', { code: c.code, name: (o.choices as string[])[0] });
    out.push({ url: MP, classCode: c.code, className: 'Room 7', token: j.token as string, publicName: j.publicName as string });
  }
  return out;
}

function saveWith(nickname: string, online: object | null) {
  return JSON.stringify({
    version: 3,
    state: {
      version: 3, active: 0, slots: [{
        nickname, band: 'K-5', createdAt: '2026-11-07T00:00:00Z',
        progress: { level: 2, xp: 120, coins: 50, coinsEarned: 50, defeated: [], zonesCleared: ['piggybank_village'], spells: ['budget_beam'], spell: 'budget_beam', tamed: [] },
        inventory: { owned: ['hat-wizard'], hat: 'hat-wizard', pet: null }, questions: { bags: {}, last: {}, drawn: {}, misses: [], accuracy: {} },
        moneyCheck: { firstForm: 'A', pre: null, post: null }, redeemed: [], settings: { readAloud: false, reducedMotion: true, playOffline: false }, online,
      }, null, null],
    },
  });
}

const net = (p: Page) => p.evaluate(() => (window as unknown as { __mq: { net: () => Net } }).__mq.net());

async function player(browser: Browser, nickname: string, online: object | null, screen: string, at: [number, number]) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((s) => localStorage.getItem('moneyquest-save') || localStorage.setItem('moneyquest-save', s), saveWith(nickname, online));
  await page.goto('./?e2e');
  await page.getByRole('button', { name: 'Play' }).click();
  await page.evaluate(([screen, at]) => (window as unknown as { __mq: { session: () => { go: (r: object) => void } } }).__mq.session().go({ kind: 'room', zone: 'piggybank_village', screen, at }), [screen, at] as const);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __mq: { where: () => { at: unknown } } }).__mq.where().at !== null)).toBe(true);
  const d = page.getByRole('dialog', { name: /says/ });
  await page.waitForTimeout(600);
  while (await d.isVisible()) await d.getByRole('button', { name: /Next|OK/ }).click();
  return { ctx, page, errors };
}

test('classmates on the same screen see each other move; other screens see nobody', async ({ browser }) => {
  const [ma, mb, mc] = await makeClass(3);
  const A = await player(browser, 'AliceNick', ma, 'plaza', [200, 250]);
  const B = await player(browser, 'BobNick', mb, 'plaza', [450, 250]);
  const C = await player(browser, 'CaraNick', mc, 'market', [300, 250]);

  // Everyone connects; A and B see each other, C sees nobody.
  for (const p of [A, B, C]) await expect.poll(async () => (await net(p.page)).status, { timeout: 10_000 }).toBe('online');
  await expect.poll(async () => (await net(B.page)).people.map((x) => x.name)).toEqual([ma!.publicName]);
  await expect.poll(async () => (await net(A.page)).people.map((x) => x.name)).toEqual([mb!.publicName]);
  expect((await net(C.page)).people).toEqual([]);
  await expect(B.page.getByRole('listitem').filter({ hasText: ma!.publicName })).toBeVisible();
  await expect(B.page.getByText('AliceNick')).toHaveCount(0); // nicknames never travel

  // A walks right; B sees A's position follow.
  const before = (await net(B.page)).remotes[0]!.x;
  await A.page.keyboard.down('ArrowRight');
  await A.page.waitForTimeout(1200);
  await A.page.keyboard.up('ArrowRight');
  const aNow = await A.page.evaluate(() => (window as unknown as { __mq: { where: () => { at: [number, number] } } }).__mq.where().at[0]);
  await expect.poll(async () => (await net(B.page)).remotes[0]!.x, { timeout: 4000 }).toBe(Math.round(aNow));
  expect(aNow - before).toBeGreaterThan(100);

  // A starts a battle: B sees the ⚔ icon. C moves to the plaza and appears for both.
  await A.page.evaluate(() => (window as unknown as { __mq: { session: () => { fight: (i: string, b: object) => void } } }).__mq.session().fight('mon_spendling', { kind: 'room', zone: 'piggybank_village', screen: 'plaza' }));
  await expect.poll(async () => (await net(B.page)).people[0]?.busy).toBe(true);
  await expect(B.page.getByLabel('in a battle')).toBeVisible();
  await C.page.evaluate(() => (window as unknown as { __mq: { session: () => { go: (r: object) => void } } }).__mq.session().go({ kind: 'room', zone: 'piggybank_village', screen: 'plaza', at: [320, 300] }));
  await expect.poll(async () => (await net(B.page)).people.length).toBe(2);
  await expect.poll(async () => (await net(C.page)).people.length).toBe(2);

  // B leaves (closes the game): A and C stop seeing B.
  await B.ctx.close();
  await expect.poll(async () => (await net(C.page)).people.map((x) => x.name)).toEqual([ma!.publicName]);

  for (const p of [A, C]) expect(p.errors).toEqual([]);
  await A.ctx.close();
  await C.ctx.close();
});

test('if the server can’t be reached, the game plays on quietly', async ({ browser }) => {
  const [m] = await makeClass(1);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.routeWebSocket(/\/ws\//, (ws) => ws.close({ code: 1006 })); // the network drops every connection
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((s) => localStorage.getItem('moneyquest-save') || localStorage.setItem('moneyquest-save', s), saveWith('Solo', m));
  await page.goto('./?e2e');
  await page.getByRole('button', { name: 'Play' }).click();
  await expect.poll(async () => (await net(page)).status).toBe('offline');
  // Still playable: a battle starts and nothing complains.
  await page.evaluate(() => (window as unknown as { __mq: { session: () => { fight: (i: string, b: object) => void } } }).__mq.session().fight('mon_spendling', { kind: 'room', zone: 'piggybank_village', screen: 'market' }));
  await expect.poll(() => page.evaluate(() => (window as unknown as { __mq: { session: () => { battle: { phase: string } | null } } }).__mq.session().battle?.phase)).toBe('ask');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
  await ctx.close();
});
