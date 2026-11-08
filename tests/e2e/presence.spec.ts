// Multiplayer Phase 2, against the local server (`npm run dev:all`, then
// MP_E2E=1 E2E_URL=http://localhost:5173 npx playwright test presence):
// two classmates on the same screen see each other (name labels, smooth movement), a third on
// another screen sees nobody, the battle icon shows, and an unreachable server changes nothing.
import { expect, test } from '@playwright/test';
import { makeClass as newClass, net, player, saveWith } from './mp.ts';

const makeClass = async (n: number) => (await newClass(n)).members;

test.skip(!process.env.MP_E2E, 'needs the local multiplayer server (npm run dev:all) and MP_E2E=1');

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
