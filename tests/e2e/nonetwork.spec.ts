// With no VITE_MP_URL (the live site until multiplayer is switched on), the game and the /teacher
// page make no requests to any other site, show no class features, and break no CSP rule.
// Runs against the production build (`vite preview` serves vercel.json's headers, CSP included).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.skip(!!process.env.VITE_MP_URL, 'only meaningful for a build without multiplayer');

const save = JSON.stringify({
  version: 3,
  state: {
    version: 3, active: 0, slots: [{
      nickname: 'Quiet', band: 'K-5', createdAt: '2026-11-07T00:00:00Z',
      progress: { level: 2, xp: 120, coins: 50, coinsEarned: 50, defeated: [], zonesCleared: ['piggybank_village'], spells: ['budget_beam'], spell: 'budget_beam', tamed: [] },
      inventory: { owned: [], hat: null, pet: null }, questions: { bags: {}, last: {}, drawn: {}, misses: [], accuracy: {} },
      moneyCheck: { firstForm: 'A', pre: null, post: null }, redeemed: [], settings: { readAloud: false, reducedMotion: true, playOffline: false }, online: null,
    }, null, null],
  },
});

function watch(page: Page, origin: string) {
  const foreign: string[] = [];
  const csp: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol !== 'data:' && u.protocol !== 'blob:' && u.origin !== origin) foreign.push(r.url());
  });
  page.on('console', (m) => /Content Security Policy|Refused to (load|connect|execute|apply)/i.test(m.text()) && csp.push(m.text()));
  return { foreign, csp };
}

test('no requests to other sites, no class features, no CSP violations', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const w = watch(page, origin);
  await page.addInitScript((s) => localStorage.getItem('moneyquest-save') || localStorage.setItem('moneyquest-save', s), save);
  await page.goto('./?e2e');
  await page.getByRole('button', { name: 'Play' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __mq: { where: () => { at: unknown } } }).__mq.where().at !== null)).toBe(true);

  // Settings has no Class section.
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await expect(page.getByText('Join a class')).toHaveCount(0);
  await page.getByRole('button', { name: 'Done' }).click();

  // A battle (Phaser effects, audio) and walking about.
  await page.evaluate(() => (window as unknown as { __mq: { session: () => { fight: (i: string, b: object) => void } } }).__mq.session().fight('mon_spendling', { kind: 'room', zone: 'piggybank_village', screen: 'market' }));
  await expect.poll(() => page.evaluate(() => (window as unknown as { __mq: { session: () => { battle: { phase: string } | null } } }).__mq.session().battle?.phase)).toBe('ask');
  await page.keyboard.press('1');
  await page.waitForTimeout(1500);

  // The teacher page says class features are off, and calls nothing.
  await page.goto('./teacher/');
  await expect(page.getByText('aren’t switched on')).toBeVisible();

  expect(w.foreign).toEqual([]);
  expect(w.csp).toEqual([]);
});

test('the privacy pages are served, marked as drafts, with no CSP violations', async ({ page, baseURL }) => {
  const w = watch(page, new URL(baseURL!).origin);
  for (const [path, heading] of [['./privacy/', 'MoneyQuest privacy policy'], ['./teacher-notice/', 'Notice for teachers']] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(page.getByText('DRAFT for NHSQA to review')).toBeVisible();
  }
  expect(w.foreign).toEqual([]);
  expect(w.csp).toEqual([]);
});
