// The live site, after a deploy (LIVE_URL=https://play.nhsqa.org npx playwright test live). It creates
// nothing on the server: the only server call is one wrong class code, which proves the game can reach
// the server through the CSP and the origin allowlist.
import { expect, test } from '@playwright/test';

const LIVE = process.env.LIVE_URL;
test.skip(!LIVE, 'set LIVE_URL to check a deployed site');

const save = JSON.stringify({
  version: 3,
  state: {
    version: 3, active: 0, slots: [{
      nickname: 'LiveCheck', band: 'K-5', createdAt: '2026-11-10T00:00:00Z',
      progress: { level: 1, xp: 0, coins: 0, coinsEarned: 0, defeated: [], zonesCleared: [], spells: ['budget_beam'], spell: 'budget_beam', tamed: [] },
      inventory: { owned: [], hat: null, pet: null }, questions: { bags: {}, last: {}, drawn: {}, misses: [], accuracy: {} },
      moneyCheck: { firstForm: 'A', pre: null, post: null }, redeemed: [], settings: { readAloud: false, reducedMotion: true, playOffline: false }, online: null,
    }, null, null],
  },
});

test('the live game and teacher page: only its own server, no CSP violations', async ({ page }) => {
  const live = new URL(LIVE!);
  const server = live.hostname.replace(/^play\./, 'mp.');
  const other: string[] = [], csp: string[] = [], hosts = new Set<string>();
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol === 'data:' || u.protocol === 'blob:') return;
    hosts.add(u.hostname);
    if (u.hostname !== live.hostname && u.hostname !== server) other.push(r.url());
  });
  page.on('console', (m) => /Content Security Policy|Refused to/i.test(m.text()) && csp.push(m.text()));
  await page.addInitScript((s) => localStorage.getItem('moneyquest-save') || localStorage.setItem('moneyquest-save', s), save);
  await page.goto(`${LIVE}/?e2e`);
  await page.getByRole('button', { name: 'Play' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __mq?: { where: () => { at: unknown } } }).__mq?.where().at ?? null), { timeout: 20_000 }).not.toBeNull();
  const hello = page.getByRole('dialog', { name: /says/ });
  await hello.waitFor({ timeout: 4000 }).catch(() => {});
  while (await hello.isVisible()) await hello.getByRole('button', { name: /Next|OK/ }).click();

  // Class features are built in; a wrong code reaches the server and gets its answer.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Join a class' }).click();
  await page.getByLabel('Class code or device code').fill('ZZZZZZ');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('alert')).toContainText('no class with that code');

  await page.goto(`${LIVE}/teacher/`);
  await expect(page.getByRole('heading', { name: 'MoneyQuest for teachers' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
  await page.goto(`${LIVE}/privacy/`);
  await expect(page.getByText('nhsqa01@gmail.com')).toBeVisible();

  expect(other).toEqual([]);
  expect(csp).toEqual([]);
  expect([...hosts].sort()).toEqual([live.hostname, server].sort());
});
