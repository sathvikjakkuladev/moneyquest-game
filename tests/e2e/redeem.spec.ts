// Reward cards end to end: a #/redeem/ link, a typed code (dashed spelling), the celebration, wearing
// the prize, and "once per save". Codes are generated for serials that were never printed.
import { expect, test } from '@playwright/test';
import { makeCode, MAX_SERIAL } from '../../src/rewards/rewardCodes.ts';

const save = (coins: number) =>
  JSON.stringify({
    state: {
      version: 1, active: 0, slots: [{
        nickname: 'CardFox', band: 'K-5', createdAt: '2026-11-07T00:00:00Z',
        progress: { level: 1, xp: 0, coins, defeated: [], zonesCleared: [], spells: ['budget_beam'], spell: 'budget_beam' },
        inventory: { owned: [], hat: null, pet: null }, questions: { bags: {}, last: {}, drawn: {}, misses: [], accuracy: {} },
        moneyCheck: { firstForm: 'A', pre: null, post: null }, redeemed: [], settings: { readAloud: false, reducedMotion: true },
      }, null, null],
    },
    version: 1,
  });

test('reward cards: link, typed code, celebration, once per save', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((s) => localStorage.getItem('moneyquest-save') || localStorage.setItem('moneyquest-save', s), save(0));

  // A Winner card link unlocks the Laurel Wreath after choosing the save.
  const winner = makeCode('W', MAX_SERIAL);
  await page.goto(`./#/redeem/${winner}`);
  await page.getByRole('button', { name: 'Play' }).click();
  const party = page.getByRole('dialog', { name: 'You unlocked a prize' });
  await expect(party.getByText('Laurel Wreath')).toBeVisible();
  await party.getByRole('button', { name: 'Wear it now' }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('moneyquest-save')!).state.slots[0].inventory.hat)).toBe('hat-laurel');

  // A Champion code typed with an extra dash unlocks the Bull Calf.
  const champ = makeCode('C', MAX_SERIAL);
  await page.getByRole('button', { name: 'Redeem a card' }).click();
  await page.getByLabel('Card code').fill(`MB-C-${champ.slice(4)}`);
  await page.getByRole('button', { name: 'Redeem', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'You unlocked a prize' }).getByText('Bull Calf')).toBeVisible();
  await page.getByRole('button', { name: 'Bring it along' }).click();

  // The same card again: refused.
  await page.getByRole('button', { name: 'Redeem a card' }).click();
  await page.getByLabel('Card code').fill(winner);
  await page.getByRole('button', { name: 'Redeem', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('already used');

  const slot = await page.evaluate(() => JSON.parse(localStorage.getItem('moneyquest-save')!).state.slots[0]);
  expect(slot.inventory.owned.sort()).toEqual(['hat-laurel', 'pet-bull']);
  expect(slot.inventory.pet).toBe('pet-bull');
  expect(slot.redeemed).toHaveLength(2);
  expect(errors).toEqual([]);
});
