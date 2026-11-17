// Cosmetics show up as soon as they're equipped: buying in the Shop or switching in the Bag while
// standing in a room puts the hat on the wizard and brings the pet along, without changing screens.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

interface Layer { key: string; depth: number; x: number; y: number; w: number; h: number }
interface Hooks {
  session: () => { go: (r: object) => void; setPanel: (p: string | null) => void };
  where: () => { screen: string | null; at: [number, number] | null };
  teleport: (x: number, y: number) => void;
  layers: () => Layer[];
}
type W = { __mq: Hooks };
const mq = <T,>(page: Page, fn: (h: Hooks) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__mq)`) as Promise<T>;

const save = JSON.stringify({
  version: 4,
  state: {
    version: 4, active: 0, slots: [{
      nickname: 'Style', band: 'K-5', createdAt: '2026-11-16T00:00:00Z',
      progress: { level: 2, xp: 120, coins: 400, coinsEarned: 400, defeated: ['mon_budget_breaker'], zonesCleared: [], spells: ['budget_beam'], spell: 'budget_beam', tamed: ['mon_budget_breaker'] },
      inventory: { owned: ['tame:mon_budget_breaker'], hat: null, pet: null, petLook: null }, look: { skin: 3, eyes: 0, hair: 0, hairColour: 1, face: 0, costume: 0 },
      questions: { bags: {}, last: {}, drawn: {}, misses: [], accuracy: {} },
      moneyCheck: { firstForm: 'A', pre: null, post: null }, redeemed: [], settings: { readAloud: false, reducedMotion: true, playOffline: false }, online: null,
    }, null, null],
  },
});

/** What's drawn on the player: the baked avatar texture (its key holds the look and the hat), and the pet. */
const look = (page: Page) =>
  mq(page, (h) => {
    const ls = h.layers();
    const me = ls.find((l) => l.key.startsWith('av:'));
    const pet = ls.find((l) => l.key.startsWith('mon/budget-breaker/'));
    const [, style] = me ? me.key.split(':') : [];
    const parts = style?.split('.') ?? [];
    return { hat: parts[6] && parts[6] !== '-' ? parts[6] : null, hair: parts[2] ?? null, pet: pet ? { x: pet.x + pet.w / 2, y: pet.y + pet.h } : null };
  });

test('a hat, a pet and a new look appear as soon as they are chosen, and the pet follows', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((s) => localStorage.getItem('moneyquest-save') || localStorage.setItem('moneyquest-save', s), save);
  await page.goto('./?e2e');
  await page.getByRole('button', { name: 'Play' }).click();

  await page.evaluate(() => (window as unknown as W).__mq.session().go({ kind: 'room', zone: 'ledgerhold', screen: '1-1' }));
  await expect.poll(() => mq(page, (h) => h.where().at !== null)).toBe(true);
  await expect.poll(async () => (await look(page)).hair).toBe('0');
  expect(await look(page)).toEqual({ hat: null, hair: '0', pet: null });

  // Buy in the Shop: the hat is put on at once and shows up in the room behind the panel.
  await page.evaluate(() => (window as unknown as W).__mq.session().setPanel('shop'));
  const shop = page.getByRole('dialog', { name: /Hats/ });
  await shop.getByRole('listitem').filter({ hasText: 'Banker Top Hat' }).getByRole('button', { name: '🪙 80' }).click();
  await expect.poll(async () => (await look(page)).hat).toBe('hat-top-hat');
  await shop.getByRole('button', { name: 'Close' }).click();

  // The Bag: bring the captured Budget Breaker along (its art isn't preloaded).
  await page.evaluate(() => (window as unknown as W).__mq.session().setPanel('bag'));
  const bag = page.getByRole('dialog', { name: 'Your bag' });
  await bag.getByRole('button', { name: /Budget Breaker/ }).click();
  await expect.poll(async () => (await look(page)).pet !== null).toBe(true);
  await bag.getByRole('button', { name: 'Close' }).click();

  // The pet trails the player when they walk. (Headless Chrome draws few frames, so walk a while.)
  await page.evaluate(() => (window as unknown as W).__mq.teleport(180, 250));
  await page.waitForTimeout(300);
  const start = (await look(page)).pet!.x;
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(2500);
  await page.keyboard.up('ArrowLeft');
  const at = (await mq(page, (h) => h.where().at))!;
  const pet = (await look(page)).pet!;
  expect(at[0]).toBeLessThan(160);
  expect(pet.x).toBeLessThan(start); // it came along
  expect(pet.x).toBeGreaterThan(at[0]); // a few steps behind

  // The Stylist: a new hairstyle shows at once. A covering hat draws the neat cut, but the look keeps the choice.
  await page.evaluate(() => (window as unknown as W).__mq.session().setPanel('style'));
  const style = page.getByRole('dialog', { name: 'Stylist Juno' });
  await style.getByRole('radio', { name: 'Afro' }).click();
  await expect.poll(async () => (await look(page)).hair).toBe('5');
  await style.getByRole('button', { name: 'Close' }).click();

  // Switch in the Bag: take the hat off, put it back on, then send the pet home.
  await page.evaluate(() => (window as unknown as W).__mq.session().setPanel('bag'));
  await bag.getByRole('button', { name: /None/ }).first().click();
  await expect.poll(async () => (await look(page)).hat).toBe(null);
  await bag.getByRole('button', { name: /Banker Top Hat/ }).click();
  await expect.poll(async () => (await look(page)).hat).toBe('hat-top-hat');
  await bag.getByRole('button', { name: /None/ }).nth(1).click();
  await expect.poll(async () => (await look(page)).pet).toBe(null);
  expect(errors).toEqual([]);
});
