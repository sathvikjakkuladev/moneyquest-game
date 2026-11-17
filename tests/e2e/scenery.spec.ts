// Scenery layering: props are sprites sorted by where they stand, so the player goes behind a lamp or
// a fountain when standing above its base and in front of it when below. Exits lead where they should
// and nobody walks off the top of the screen.
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
  version: 4,
  state: {
    version: 4, active: 0, slots: [{
      nickname: 'Layer', band: 'K-5', createdAt: '2026-11-16T00:00:00Z',
      progress: { level: 2, xp: 120, coins: 0, coinsEarned: 0, defeated: [], zonesCleared: [], spells: ['budget_beam'], spell: 'budget_beam', tamed: [] },
      inventory: { owned: [], hat: null, pet: null, petLook: null }, look: { skin: 3, eyes: 0, hair: 0, hairColour: 1, face: 0, costume: 0 },
      questions: { bags: {}, last: {}, drawn: {}, misses: [], accuracy: {} },
      moneyCheck: { firstForm: 'A', pre: null, post: null }, redeemed: [], settings: { readAloud: false, reducedMotion: true, playOffline: false }, online: null,
    }, null, null],
  },
});

async function go(page: Page, zone: string, screen: string) {
  await page.evaluate(([z, s]) => (window as unknown as { __mq: Hooks }).__mq.session().go({ kind: 'room', zone: z, screen: s }), [zone, screen]);
  await expect.poll(() => mq(page, (h) => h.where().screen)).toBe(screen);
  await expect.poll(() => mq(page, (h) => h.where().at !== null)).toBe(true);
  const d = page.getByRole('dialog', { name: /says/ });
  await page.waitForTimeout(500); // a guide's hello appears after a moment
  while (await d.isVisible()) await d.getByRole('button', { name: /Next|OK/ }).click();
}
/** Is the player covered by a prop drawn above them? */
async function covered(page: Page, x: number, y: number, prop: string): Promise<boolean> {
  await page.evaluate(([x, y]) => (window as unknown as { __mq: Hooks }).__mq.teleport(x!, y!), [x, y]);
  await page.waitForTimeout(150);
  return page.evaluate((prop) => {
    const ls = (window as unknown as { __mq: Hooks }).__mq.layers();
    const p = ls.find((l) => l.key.startsWith('av:'))!;
    return ls.some((l) => l.key.includes(`/${prop}`) && l.depth > p.depth && l.x < p.x + p.w && l.x + l.w > p.x && l.y < p.y + p.h && l.y + l.h > p.y);
  }, prop);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((s) => localStorage.getItem('moneyquest-save') || localStorage.setItem('moneyquest-save', s), save);
  await page.goto('./?e2e');
  await page.getByRole('button', { name: 'Play' }).click();
});

test('the player walks behind scenery above its base and in front of it below', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Ledgerhold's plaza: the lantern east of the fountain stands at (500, 187).
  await go(page, 'ledgerhold', '1-1');
  expect(await covered(page, 506, 178, 'lantern'), 'behind the lantern').toBe(true);
  expect(await covered(page, 506, 205, 'lantern'), 'in front of the lantern').toBe(false);
  // The fountain is solid: walking up into it stops below its rim.
  await page.evaluate(() => (window as unknown as { __mq: Hooks }).__mq.teleport(320, 300));
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(900);
  await page.keyboard.up('ArrowUp');
  const at = await mq(page, (h) => h.where().at);
  expect(at![1]).toBeGreaterThan(223);
  expect(errors).toEqual([]);
});

test('the plaza paths lead east, west and north, and nobody walks off the top', async ({ page }) => {
  // Headless Chrome draws few frames a second, so each walk starts near its exit and holds the key
  // until the screen changes.
  const through = async (x: number, y: number, key: string, to: string) => {
    await go(page, 'ledgerhold', '1-1');
    await page.evaluate(([x, y]) => (window as unknown as { __mq: Hooks }).__mq.teleport(x!, y!), [x, y]);
    await page.keyboard.down(key);
    await expect.poll(() => mq(page, (h) => h.where().screen), { timeout: 15000 }).toBe(to);
    await page.keyboard.up(key);
  };
  await through(600, 250, 'ArrowRight', '1-2');
  await through(40, 250, 'ArrowLeft', '1-0');
  await through(320, 90, 'ArrowUp', '0-1');
  // Up at the side of the plaza, where there is no exit: the whole sprite stays on screen.
  await go(page, 'ledgerhold', '1-1');
  await page.evaluate(() => (window as unknown as { __mq: Hooks }).__mq.teleport(180, 95));
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(3000);
  await page.keyboard.up('ArrowUp');
  const at = await mq(page, (h) => h.where().at);
  expect(at![1]).toBeGreaterThanOrEqual(66);
});
