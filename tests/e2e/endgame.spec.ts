// The end of the main game: Money Check 2 from the Headmaster, the CSV export, Phish Fens opening on
// the world map, the Debt Dragon's gate, and capturing a monster there.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const TOPICS = ['Spending and Saving', 'Credit and Debt', 'Employment and Income', 'Investing', 'Risk and Insurance', 'Financial Decision Making'];
const pre = { date: '2026-11-07', band: 'K-5', form: 'A', perTopic: Object.fromEntries(TOPICS.map((t, i) => [t, i % 2])), total: 3 };
const DISTRICTS = ['coinfall-docks', 'the-sprawl', 'frostvault', 'credit-citadel', 'compound-rift', 'the-exchange'];
const BEATEN = ['mon_budget_breaker', 'mon_subscription_swarm', 'boss_overspend_kraken', 'mon_impulse_wisp', 'mon_splurge_hound', 'boss_splurge_peacock', 'mon_inflation_shade', 'mon_overdraft_golem', 'boss_frostfang_mammoth', 'mon_late_fee_raptor', 'mon_minimum_payment_leech', 'boss_collector_scorpion', 'mon_apr_serpent', 'mon_rug_pull_mimic', 'boss_compound_leviathan', 'mon_hype_bull', 'mon_panic_bear', 'boss_volatility_roc'];
const save = JSON.stringify({
  version: 4,
  state: {
    version: 4, active: 0, slots: [{
      nickname: 'EndFox', band: 'K-5', createdAt: '2026-11-07T00:00:00Z',
      progress: { level: 6, xp: 1600, coins: 200, coinsEarned: 900, defeated: BEATEN, zonesCleared: DISTRICTS, spells: ['budget_beam', 'save_shield', 'credit_cleanse', 'paycheck_strike', 'compound_burst', 'insurance_barrier', 'wise_choice'], spell: 'budget_beam', tamed: BEATEN },
      inventory: { owned: BEATEN.map((m) => `tame:${m}`), hat: null, pet: null, petLook: null }, look: { skin: 3, eyes: 0, hair: 0, hairColour: 1, face: 0, costume: 0 },
      questions: { bags: {}, last: {}, drawn: {}, misses: [], accuracy: {} },
      moneyCheck: { firstForm: 'A', pre, post: null }, redeemed: [], settings: { readAloud: false, reducedMotion: true, playOffline: false }, online: null,
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

test('Money Check 2, CSV export, Phish Fens and capturing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((s) => localStorage.getItem('moneyquest-save') || localStorage.setItem('moneyquest-save', s), save);
  await page.goto('./?e2e');
  await page.getByRole('button', { name: 'Play' }).click();

  type Go = { __mq: { session: () => { go: (r: object) => void } } };
  // Phish Fens stays locked on the world map before Money Check 2.
  await page.evaluate(() => (window as unknown as Go).__mq.session().go({ kind: 'world' }));
  await expect(page.getByRole('button', { name: /Phish Fens, opens after six bosses and Money Check 2/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^The Exchange, cleared/ })).toBeEnabled();

  // The Debt Dragon sleeps until every district boss is beaten; the Arena Master says how many are left.
  await page.evaluate(() => (window as unknown as Go).__mq.session().go({ kind: 'room', zone: 'ledgerhold', screen: '0-1' }));
  await teleport(page, 382, 250);
  await page.keyboard.press('Space');
  await expect(page.getByRole('dialog', { name: /Arena Master/ })).toContainText('1 to go');
  await closeDialogue(page);

  // The Headmaster, in the plaza, offers Money Check 2.
  await page.evaluate(() => (window as unknown as Go).__mq.session().go({ kind: 'room', zone: 'ledgerhold', screen: '1-1' }));
  await teleport(page, 392, 262);
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

  // Now Phish Fens is open: travel there, and its guide says hello.
  await page.getByRole('button', { name: 'World map' }).click();
  await page.getByRole('button', { name: /^Phish Fens/ }).click();
  await expect(page.getByRole('dialog', { name: /Marshwarden Ines/ })).toBeVisible();
  await closeDialogue(page);

  // Beat the Phish Lurker: its questions mix the topics, and the win captures it.
  await page.evaluate(() => (window as unknown as { __mq: { session: () => { fight: (id: string, b: object) => void } } }).__mq.session().fight('mon_phish_lurker', { kind: 'room', zone: 'phish-fens', screen: '1-0' }));
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
  await expect(page.getByText(/Phish Lurker joins you/)).toBeVisible();
  const slot = await page.evaluate(() => JSON.parse(localStorage.getItem('moneyquest-save')!).state.slots[0]);
  expect(slot.progress.tamed).toEqual([...BEATEN, 'mon_phish_lurker']);
  expect(slot.inventory.owned).toContain('tame:mon_phish_lurker');
  expect(errors).toEqual([]);
});
