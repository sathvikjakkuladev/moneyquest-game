// The end of the main game: Money Check 2 from the Headmaster, the CSV export, the portals opening,
// and taming a bonus-zone monster.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const TOPICS = ['Spending and Saving', 'Credit and Debt', 'Employment and Income', 'Investing', 'Risk and Insurance', 'Financial Decision Making'];
const pre = { date: '2026-11-07', band: 'K-5', form: 'A', perTopic: Object.fromEntries(TOPICS.map((t, i) => [t, i % 2])), total: 3 };
const save = JSON.stringify({
  version: 2,
  state: {
    version: 2, active: 0, slots: [{
      nickname: 'EndFox', band: 'K-5', createdAt: '2026-11-07T00:00:00Z',
      progress: { level: 6, xp: 1600, coins: 200, defeated: [], zonesCleared: ['piggybank_village', 'borrowers_bridges', 'guildworks', 'compound_orchard', 'stormwatch_coast', 'crossroads_observatory'], spells: ['budget_beam', 'save_shield', 'credit_cleanse', 'paycheck_strike', 'compound_burst', 'insurance_barrier', 'wise_choice'], spell: 'budget_beam', tamed: [] },
      inventory: { owned: [], hat: null, pet: null }, questions: { bags: {}, last: {}, drawn: {}, misses: [], accuracy: {} },
      moneyCheck: { firstForm: 'A', pre, post: null }, redeemed: [], settings: { readAloud: false, reducedMotion: true },
    }, null, null],
  },
});

const mq = <T,>(page: Page, fn: string): Promise<T> => page.evaluate(`(${fn})(window.__mq)`) as Promise<T>;
async function teleport(page: Page, x: number, y: number) {
  await expect.poll(() => mq(page, '(h) => h.where().at !== null')).toBe(true);
  await page.evaluate(([x, y]) => (window as unknown as { __mq: { teleport: (a: number, b: number) => void } }).__mq.teleport(x!, y!), [x, y]);
}
async function closeDialogue(page: Page) {
  const d = page.getByRole('dialog', { name: /says/ });
  while ((await d.isVisible()) && (await d.getByRole('button', { name: /Next|OK/ }).isVisible())) await d.getByRole('button', { name: /Next|OK/ }).click();
}

test('Money Check 2, CSV export, portals and taming', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((s) => localStorage.getItem('moneyquest-save') || localStorage.setItem('moneyquest-save', s), save);
  await page.goto('./?e2e');
  await page.getByRole('button', { name: 'Play' }).click();

  // Portals stay sealed before Money Check 2.
  await page.evaluate(() => (window as unknown as { __mq: { session: () => { go: (r: object) => void } } }).__mq.session().go({ kind: 'room', zone: 'crossroads_observatory', screen: 'portal_ring', entry: 'from_crossroads' }));
  await expect(page.getByRole('dialog', { name: /Stargazer Sol/ })).toBeVisible(); // first-visit hello
  await closeDialogue(page);
  await teleport(page, 250, 175);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowUp');
  await expect(page.getByRole('dialog', { name: /says/ })).toContainText('Money Check 2');
  await closeDialogue(page);

  // The Headmaster offers Money Check 2.
  await page.evaluate(() => (window as unknown as { __mq: { session: () => { go: (r: object) => void } } }).__mq.session().go({ kind: 'room', zone: 'coin_academy', screen: 'library', entry: 'from_great_hall' }));
  await teleport(page, 450, 215);
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Take Money Check 2' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  for (let i = 1; i <= 12; i++) {
    await expect(page.getByText(`Question ${i} of 12`)).toBeVisible();
    await page.keyboard.press('1');
  }
  await expect(page.getByText(/first Money Check/)).toBeVisible(); // wording depends on the (random) score
  await page.getByRole('button', { name: 'Continue' }).click();

  // Progress shows both checks; the CSV downloads with both rows.
  await page.getByRole('button', { name: 'Progress and Money Check' }).click();
  await expect(page.getByRole('dialog', { name: 'Progress' })).toContainText('Total');
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export results/ }).click()]);
  const csv = await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8'));
  const lines = csv.trim().split('\r\n');
  expect(lines[0]).toBe(['nickname', 'test', 'date', 'band', 'form', ...TOPICS, 'total', 'improvement'].join(','));
  expect(lines[1]).toMatch(/^EndFox,pre,2026-11-07,K-5,A,/);
  expect(lines[2]).toMatch(/^EndFox,post,\d{4}-\d{2}-\d{2},K-5,B,/);
  await page.getByRole('button', { name: 'Close' }).click();

  // Now the purple portal leads to Nebula Grove.
  await page.evaluate(() => (window as unknown as { __mq: { session: () => { go: (r: object) => void } } }).__mq.session().go({ kind: 'room', zone: 'crossroads_observatory', screen: 'portal_ring', entry: 'from_crossroads' }));
  await teleport(page, 110, 185);
  await page.keyboard.down('ArrowUp');
  await expect.poll(() => mq(page, '(h) => h.where().screen'), { timeout: 8000 }).toBe('forest_portal');
  await page.keyboard.up('ArrowUp');

  // Beat Starmoth: it's tamed.
  await page.evaluate(() => (window as unknown as { __mq: { session: () => { fight: (id: string, b: object) => void } } }).__mq.session().fight('mon_starmoth', { kind: 'room', zone: 'nebula_grove', screen: 'forest_portal' }));
  for (let i = 0; i < 12; i++) {
    await expect.poll(() => mq<string>(page, '(h) => h.session().battle?.phase')).toMatch(/^(ask|won|right|explain)$/);
    const phase = await mq<string>(page, '(h) => h.session().battle?.phase');
    if (phase === 'won') break;
    if (phase === 'right' || phase === 'explain') {
      await page.keyboard.press('Enter');
      continue;
    }
    const right = await mq<number>(page, '(h) => h.correct()');
    const pos = await mq<number>(page, `(h) => h.session().battle.order.indexOf(${right})`);
    await page.keyboard.press(String(pos + 1));
  }
  await expect(page.getByText(/Starmoth is tamed/)).toBeVisible();
  const slot = await page.evaluate(() => JSON.parse(localStorage.getItem('moneyquest-save')!).state.slots[0]);
  expect(slot.progress.tamed).toEqual(['mon_starmoth']);
  expect(slot.inventory.owned).toContain('tame:mon_starmoth');
  expect(errors).toEqual([]);
});
