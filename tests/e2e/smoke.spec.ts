// Smoke test: title → nickname → character creator → Ledgerhold → shop → world map → Coinfall Docks →
// battle with one wrong answer, then right ones → win and capture → save and reload. `?e2e` turns on window.__mq (see src/testHooks.ts).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

interface Hooks {
  session: () => { prompt: string | null; battle: { phase: string } | null; scene: { kind: string } | null };
  save: () => { slots: ({ nickname: string; progress: { coins: number; defeated: string[] }; inventory: { owned: string[] }; look: { hair: number }; questions: { accuracy: Record<string, { answered: number }> }; moneyCheck: { pre: { total: number } | null } } | null)[] };
  correct: () => number;
  where: () => { screen: string | null; at: [number, number] | null };
  teleport: (x: number, y: number) => void;
}
const mq = <T,>(page: Page, fn: (h: Hooks) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__mq)`) as Promise<T>;
const shots = process.env.SHOTS === '1';
const shot = async (page: Page, name: string) => void (shots && (await page.screenshot({ path: `test-results/shots/${name}.png` })));

async function closeDialogue(page: Page) {
  const d = page.getByRole('dialog', { name: /says/ });
  while (await d.isVisible()) await d.getByRole('button', { name: /Next|OK/ }).click();
}
/** Wait for the screen to load, then put the player at (x, y). */
async function teleport(page: Page, x: number, y: number) {
  await expect.poll(() => mq(page, (h) => h.where().at !== null)).toBe(true);
  await page.evaluate(([x, y]) => (window as unknown as { __mq: Hooks }).__mq.teleport(x!, y!), [x, y]);
}
/** Walk from (x, y) by holding a key for a moment. */
async function walk(page: Page, x: number, y: number, key: string, ms = 800) {
  await teleport(page, x, y);
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}
const screen = (page: Page) => mq(page, (h) => h.where().screen);

test('new game to a won battle, then save and reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto('./?e2e');
  await shot(page, '01-title');
  await page.getByRole('button', { name: 'New game' }).first().click();
  await closeDialogue(page); // Headmaster's welcome
  await page.getByLabel('Nickname').fill('TestFox');
  await shot(page, '02-nickname');
  await page.getByRole('button', { name: 'Next' }).click();
  // The character creator: pick a hairstyle, or let the dice choose.
  await expect(page.getByRole('heading', { name: 'Make your wizard' })).toBeVisible();
  await page.getByRole('button', { name: /Surprise me/ }).click();
  await page.getByRole('radio', { name: 'Box Braids' }).click();
  await expect(page.getByRole('img', { name: 'Your character' })).toBeVisible();
  await shot(page, '02a-creator');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('radio', { name: /Adventurer/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  // Money Check 1: 12 questions, scores at the end.
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  for (let i = 1; i <= 12; i++) {
    await expect(page.getByText(`Question ${i} of 12`)).toBeVisible();
    await page.keyboard.press(String((i % 4) + 1));
  }
  await expect(page.getByRole('heading', { name: /You got \d+ of 12!/ })).toBeVisible();
  await shot(page, '02b-money-check');
  await page.getByRole('button', { name: 'Start the adventure' }).click();
  await closeDialogue(page);
  await expect(page.getByText('TestFox')).toBeVisible();
  expect(await mq(page, (h) => h.save().slots[0]?.look.hair)).toBe(2);
  await shot(page, '03-ledgerhold');

  // You arrive at Ledgerhold's waystone. Walk north to the plaza and talk to the Headmaster.
  await expect.poll(() => screen(page)).toBe('2-1');
  await walk(page, 320, 30, 'ArrowUp');
  await expect.poll(() => screen(page)).toBe('1-1');
  await teleport(page, 392, 262);
  await expect.poll(() => mq(page, (h) => h.session().prompt)).toContain('Headmaster');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: /Headmaster/ })).toBeVisible();
  await shot(page, '04-plaza');
  await closeDialogue(page);

  // West to the hat shop, and talk to the shopkeeper with the keyboard.
  await walk(page, 30, 240, 'ArrowLeft');
  await expect.poll(() => screen(page)).toBe('1-0');
  await teleport(page, 297, 276);
  await expect.poll(() => mq(page, (h) => h.session().prompt)).toContain('Shopkeeper Bix');
  await page.keyboard.press('Space');
  await expect(page.getByRole('dialog', { name: /Shopkeeper Bix says/ })).toBeVisible();
  await closeDialogue(page);
  // Then the shop opens: hats by rarity. Reward-card prizes are shown, never sold; pets aren't sold at all.
  const shop = page.getByRole('dialog', { name: /Hats/ });
  await expect(shop).toBeVisible();
  await expect(shop.getByText('Coin Crown')).toBeVisible();
  await expect(shop.getByText('Legendary').first()).toBeVisible();
  await expect(shop.getByText(/Winner cards only/)).toBeVisible();
  await expect(shop.getByText(/^Bull Calf$/)).toHaveCount(0);
  await shot(page, '04b-shop');
  await page.keyboard.press('Escape');
  await expect(shop).toBeHidden();

  // The world map: only the first district is open. Travel teleports you to its waystone.
  await page.getByRole('button', { name: 'World map' }).click();
  await expect(page.getByRole('button', { name: /^Coinfall Docks/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: /The Sprawl, locked/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Phish Fens, opens after six bosses/ })).toBeDisabled();
  await shot(page, '05-world');
  await page.getByRole('button', { name: /^Coinfall Docks/ }).click();

  // The guide greets you; walk south into the wilds and into Budget Breaker.
  await expect(page.getByRole('dialog', { name: /Dockmaster Penny/ })).toBeVisible();
  await shot(page, '06-docks');
  await closeDialogue(page);
  await expect.poll(() => screen(page)).toBe('0-0');
  await walk(page, 320, 335, 'ArrowDown');
  await expect.poll(() => screen(page)).toBe('1-0');
  await shot(page, '07-wilds');
  await walk(page, 200, 225, 'ArrowUp', 600);
  await expect.poll(() => mq(page, (h) => h.session().battle?.phase)).toBe('ask');
  await shot(page, '08-battle');

  // One wrong answer: the monster attacks, then the explanation stays up until "Got it".
  const wrong = ((await mq(page, (h) => h.correct())) + 1) % 4;
  await page.keyboard.press(String(wrong + 1));
  await expect(page.getByText('Why:')).toBeVisible();
  await expect(page.getByRole('button', { name: /, wrong$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /, correct$/ })).toBeVisible();
  await shot(page, '09-explain');
  await page.getByRole('button', { name: 'Got it' }).click();

  // Right answers: the spell plays and the explanation shows briefly. Five win the battle.
  for (let i = 0; i < 5; i++) {
    await expect.poll(() => mq(page, (h) => h.session().battle?.phase)).toMatch(/^(ask|won)$/);
    if ((await mq(page, (h) => h.session().battle?.phase)) === 'won') break;
    const right = await mq(page, (h) => h.correct());
    await page.getByRole('button', { name: new RegExp(`^${'ABCD'[right]}:`) }).click();
    await expect.poll(() => mq(page, (h) => h.session().battle?.phase)).toMatch(/^(right|won)$/);
    if (i === 0) await shot(page, '10-right');
    if ((await mq(page, (h) => h.session().battle?.phase)) === 'right') await page.getByRole('button', { name: 'Next' }).click();
  }
  await expect(page.getByText('You beat Budget Breaker!')).toBeVisible();
  // The first win captures the monster as a pet.
  await expect(page.getByText(/Budget Breaker joins you/)).toBeVisible();
  await shot(page, '11-victory');
  await page.getByRole('button', { name: 'Carry on' }).click();
  await expect.poll(() => screen(page)).toBe('1-0');

  // Autosave: reload, and the save is still there with the win and the answers recorded.
  const before = await mq(page, (h) => h.save().slots[0]);
  expect(before?.progress.defeated).toContain('mon_budget_breaker');
  expect(before?.inventory.owned).toContain('tame:mon_budget_breaker');
  expect(before?.questions.accuracy['Spending and Saving']?.answered).toBeGreaterThanOrEqual(6);
  await page.reload();
  await expect(page.getByText('TestFox')).toBeVisible();
  const after = await mq(page, (h) => h.save().slots[0]);
  expect(after?.progress).toEqual(before?.progress);
  expect(after?.moneyCheck.pre?.total).toBeGreaterThanOrEqual(0);
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByText('TestFox')).toBeVisible();
  await shot(page, '12-reloaded');

  expect(errors).toEqual([]);
});
