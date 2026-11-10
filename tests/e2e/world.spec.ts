// Multiplayer Phase 5, against the local server (see mp.ts): world mode. Two classes on the same
// screen see each other (blue names) once both teachers switch it on; classmates aren't shown twice;
// world reports reach the admin, who can block a student; switching off takes effect live. Plus
// printed reward cards working only once across devices.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { makeCode, MAX_SERIAL } from '../../src/rewards/rewardCodes.ts';
import { api, makeClass, MP, net, ORIGIN, player } from './mp.ts';

test.skip(!process.env.MP_E2E, 'needs the local multiplayer server (npm run dev:all) and MP_E2E=1');

const names = async (p: Page) => (await net(p)).people.map((x) => `${x.name}${x.world ? ' (world)' : ''}`).sort();

async function adminToken() {
  const post = (path: string, body: object) => fetch(MP + path, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const creds = { email: 'admin@moneyquest.test', password: 'correct horse battery' };
  let r = await post('/api/teacher/signup', creds);
  if (r.status === 409) r = await post('/api/teacher/login', creds);
  return ((await r.json()) as { token: string }).token;
}

test('world mode: other classes on the same screen, reports, blocking and the teacher switch', async ({ browser }) => {
  test.setTimeout(120_000);
  const one = await makeClass(2), two = await makeClass(1);
  const [ma, ma2] = one.members, [mb] = two.members;
  for (const c of [one, two]) await api('PATCH', `/api/teacher/classes/${c.cls.id}`, { worldMode: true }, c.teacher);

  const A = await player(browser, 'AliceNick', ma, 'plaza', [220, 250]);
  const A2 = await player(browser, 'AmirNick', ma2, 'plaza', [320, 250]);
  const B = await player(browser, 'BeaNick', mb, 'plaza', [430, 250]);

  // A sees a classmate (gold) and B from the other class (blue); nobody is shown twice.
  await expect.poll(() => names(A.page), { timeout: 15_000 }).toEqual([`${ma2!.publicName}`, `${mb!.publicName} (world)`].sort());
  await expect.poll(() => names(B.page), { timeout: 15_000 }).toEqual([`${ma!.publicName} (world)`, `${ma2!.publicName} (world)`].sort());
  await expect(A.page.getByRole('button', { name: `${mb!.publicName}, from another class: open menu` })).toBeVisible();
  await A.page.getByRole('button', { name: 'Settings' }).click();
  await expect(A.page.getByText('World mode is on')).toBeVisible();
  await A.page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Done' }).click();

  // A waves: B sees it. B reports A; the admin and A's teacher see it.
  await A.page.getByRole('button', { name: 'Say something to classmates' }).click();
  await A.page.getByRole('button', { name: 'Wave' }).click();
  await expect(B.page.getByRole('status', { name: `${ma!.publicName} said Wave` })).toBeVisible();
  await B.page.getByRole('button', { name: `${ma!.publicName}, from another class: open menu` }).click();
  const menu = B.page.getByRole('dialog', { name: ma!.publicName });
  await menu.getByRole('button', { name: /^🚩 Report$/ }).click();
  await menu.getByRole('button', { name: 'Report', exact: true }).click();
  await expect(menu.getByText('safety team will see your report')).toBeVisible();
  await menu.getByRole('button', { name: 'Close' }).click();
  const admin = await adminToken();
  type WR = { id: string; target: { id: string; name: string }; history: { kind: string; i: number }[] };
  const reports = async () => ((await api('GET', '/api/admin/reports', undefined, admin)).reports as WR[]).filter((r) => r.target?.name === ma!.publicName);
  await expect.poll(async () => (await reports()).length).toBe(1);
  expect((await reports())[0]!.history).toEqual([expect.objectContaining({ kind: 'emote', i: 0 })]);
  const forTeacher = (await api('GET', `/api/teacher/classes/${one.cls.id}`, undefined, one.teacher)).reports as { world: boolean }[];
  expect(forTeacher).toEqual([expect.objectContaining({ world: true })]);

  // The admin blocks A from world mode: B stops seeing A at once; A still sees their classmate.
  await api('POST', `/api/admin/members/${(await reports())[0]!.target.id}/world`, { blocked: true }, admin);
  await expect.poll(() => names(B.page), { timeout: 10_000 }).toEqual([`${ma2!.publicName} (world)`]);
  await expect.poll(() => names(A.page), { timeout: 10_000 }).toEqual([ma2!.publicName]);

  // Class two's teacher switches world mode off: B sees nobody, and A2 sees only A.
  await api('PATCH', `/api/teacher/classes/${two.cls.id}`, { worldMode: false }, two.teacher);
  await expect.poll(() => names(B.page), { timeout: 10_000 }).toEqual([]);
  await expect.poll(() => names(A2.page), { timeout: 10_000 }).toEqual([ma!.publicName]);

  for (const p of [A, A2, B]) expect(p.errors).toEqual([]);
  for (const p of [A, A2, B]) await p.ctx.close();
});

test('a printed card works once across all devices', async ({ browser }) => {
  // A serial far above any printed card, different on every run (the local database keeps codes).
  const code = makeCode('W', MAX_SERIAL - Math.floor(Math.random() * 1_000_000));
  const redeemOn = async (nickname: string) => {
    const p = await player(browser, nickname, null, 'plaza', [300, 250]);
    await p.page.getByRole('button', { name: 'Redeem a card' }).click();
    await p.page.getByLabel('Card code').fill(code);
    await p.page.getByRole('button', { name: 'Redeem', exact: true }).click();
    return p;
  };
  const first = await redeemOn('FirstDevice');
  await expect(first.page.getByRole('dialog', { name: 'Redeem a card' })).toBeHidden(); // it worked: the celebration replaces the panel
  const second = await redeemOn('OtherDevice');
  await expect(second.page.getByText('already been used on another device')).toBeVisible();
  for (const p of [first, second]) await p.ctx.close();
});
