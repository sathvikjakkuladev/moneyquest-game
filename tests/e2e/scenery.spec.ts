// Scenery layering: the player goes behind lamps, signs and trees when standing above their base, in
// front when below it, and can't walk through the lamp post.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

interface Layer { key: string; depth: number; x: number; y: number; w: number; h: number }
interface Hooks {
  session: () => { go: (r: object) => void };
  where: () => { screen: string | null; at: [number, number] | null };
  teleport: (x: number, y: number) => void;
  layers: () => Layer[];
}
const mq = <T,>(page: Page, fn: (h: Hooks) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__mq)`) as Promise<T>;

const save = JSON.stringify({
  version: 2,
  state: {
    version: 2, active: 0, slots: [{
      nickname: 'Layer', band: 'K-5', createdAt: '2026-11-07T00:00:00Z',
      progress: { level: 2, xp: 120, coins: 0, defeated: [], zonesCleared: ['piggybank_village'], spells: ['budget_beam'], spell: 'budget_beam', tamed: [] },
      inventory: { owned: [], hat: null, pet: null }, questions: { bags: {}, last: {}, drawn: {}, misses: [], accuracy: {} },
      moneyCheck: { firstForm: 'A', pre: null, post: null }, redeemed: [], settings: { readAloud: false, reducedMotion: true },
    }, null, null],
  },
});

async function go(page: Page, screen: string) {
  await page.evaluate((s) => (window as unknown as { __mq: Hooks }).__mq.session().go({ kind: 'room', zone: 'piggybank_village', screen: s }), screen);
  await expect.poll(() => mq(page, (h) => h.where().screen)).toBe(screen);
  await expect.poll(() => mq(page, (h) => h.where().at !== null)).toBe(true);
  const d = page.getByRole('dialog', { name: /says/ });
  await page.waitForTimeout(500); // the mentor's hello appears after a moment
  while (await d.isVisible()) await d.getByRole('button', { name: /Next|OK/ }).click();
}
/** Is the player covered by a front (a cut-out drawn above them)? */
async function covered(page: Page, x: number, y: number): Promise<boolean> {
  await page.evaluate(([x, y]) => (window as unknown as { __mq: Hooks }).__mq.teleport(x!, y!), [x, y]);
  await page.waitForTimeout(100);
  return mq(page, (h) => {
    const ls = h.layers();
    const p = ls.find((l) => l.key.startsWith('chr:player'))!;
    return ls.some((l) => l.key === 'front' && l.depth > p.depth && l.x < p.x + p.w && l.x + l.w > p.x && l.y < p.y + p.h && l.y + l.h > p.y);
  });
}

test('the player walks behind scenery above its base and in front of it below', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((s) => localStorage.getItem('moneyquest-save') || localStorage.setItem('moneyquest-save', s), save);
  await page.goto('./?e2e');
  await page.getByRole('button', { name: 'Play' }).click();

  await go(page, 'gate');
  expect(await covered(page, 398, 296), 'behind the lamp').toBe(true);
  expect(await covered(page, 380, 334), 'in front of the lamp').toBe(false);
  expect(await covered(page, 290, 280), 'under the gate arch').toBe(true);
  expect(await covered(page, 140, 270), 'behind the tree').toBe(true);

  // The market lamp post is solid now: walking up into it stops at its base.
  await go(page, 'market');
  await page.evaluate(() => (window as unknown as { __mq: Hooks }).__mq.teleport(568, 185));
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(600);
  await page.keyboard.up('ArrowUp');
  const at = await mq(page, (h) => h.where().at);
  expect(at![1]).toBeGreaterThanOrEqual(158);
  expect(errors).toEqual([]);
});

test('the plaza paths lead to the market and the cottages, and nobody walks off the top', async ({ page }) => {
  await page.addInitScript((s) => localStorage.getItem('moneyquest-save') || localStorage.setItem('moneyquest-save', s), save);
  await page.goto('./?e2e');
  await page.getByRole('button', { name: 'Play' }).click();
  const walk = async (x: number, y: number, key: string, ms: number) => {
    await go(page, 'plaza');
    await page.evaluate(([x, y]) => (window as unknown as { __mq: Hooks }).__mq.teleport(x!, y!), [x, y]);
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
  };
  // Along the middle and the bottom of the path, not just its top edge.
  await walk(440, 178, 'ArrowRight', 2400);
  await expect.poll(() => mq(page, (h) => h.where().screen)).toBe('market');
  await walk(200, 186, 'ArrowLeft', 2400);
  await expect.poll(() => mq(page, (h) => h.where().screen)).toBe('cottages');
  // Up past the fountain: the player stops with their whole sprite still on screen.
  await walk(400, 140, 'ArrowUp', 1500);
  const at = await mq(page, (h) => h.where().at);
  expect(at![1]).toBeGreaterThanOrEqual(58);
});
