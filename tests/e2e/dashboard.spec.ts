// Multiplayer Phase 4, against the local server (see mp.ts): progress sync, the live class goal and
// its celebration, the leaderboard, the teacher dashboard and CSV, Play offline pausing uploads,
// device codes and admin password resets.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { api, makeClass, MP, net, ORIGIN, player } from './mp.ts';

test.skip(!process.env.MP_E2E, 'needs the local multiplayer server (npm run dev:all) and MP_E2E=1');

const TOPICS = ['Spending and Saving', 'Credit and Debt', 'Employment and Income', 'Investing', 'Risk and Insurance', 'Financial Decision Making'];
const PRE = { date: '2026-11-07T10:00:00Z', band: 'K-5', form: 'A', total: 6, perTopic: Object.fromEntries(TOPICS.map((t) => [t, 1])) };

type Hooks = { __mq: { save: () => { edit: (f: (x: Record<string, Record<string, unknown>>) => unknown) => void; slots: ({ online: unknown } | null)[] } } };
/** What a battle or a Money Check would change in the save. */
const play = (p: Page, correct: number, coinsEarned: number, pre: object | null = null) =>
  p.evaluate(([correct, coinsEarned, pre]) => (window as unknown as Hooks).__mq.save().edit((x) => ({
    ...x,
    progress: { ...x.progress, coinsEarned },
    questions: { ...x.questions, accuracy: { Investing: { answered: (correct as number) + 1, correct } } },
    moneyCheck: { ...x.moneyCheck, pre },
  })), [correct, coinsEarned, pre] as const);

interface Detail { members: { id: string; name: string; progress: { coinsEarned: number; accuracy: Record<string, { correct: number }> } | null }[] }

async function teacherPage(browser: Browser, token: string) {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('dialog', (d) => void d.accept());
  await page.addInitScript((t) => sessionStorage.setItem('mq-teacher-session', t), token);
  await page.goto('./teacher/');
  return { ctx, page };
}

test('progress, class goal, leaderboard, dashboard, device codes', async ({ browser }) => {
  test.setTimeout(120_000);
  const { teacher, cls, members: [ma, mb] } = await makeClass(2);
  const detail = () => api('GET', `/api/teacher/classes/${cls.id}`, undefined, teacher) as unknown as Promise<Detail>;
  const of = async (name: string) => (await detail()).members.find((m) => m.name === name)!;
  const A = await player(browser, 'AliceNick', ma, 'plaza', [220, 250]);
  const B = await player(browser, 'BobNick', mb, 'plaza', [430, 250]);

  // Both games upload a baseline; old progress doesn't count toward this week.
  await expect.poll(async () => (await detail()).members.every((m) => m.progress !== null), { timeout: 15_000 }).toBe(true);
  const barB = B.page.getByRole('progressbar', { name: 'Class goal this week' });
  await expect(barB).toHaveAttribute('aria-valuenow', '0');

  // A gets 3 right: the bar moves for B too, live.
  await play(A.page, 3, 500, PRE);
  await expect(barB).toHaveAttribute('aria-valuenow', '3', { timeout: 10_000 });

  // The dashboard shows it, and the nickname never reaches it.
  const T = await teacherPage(browser, teacher);
  await T.page.getByRole('button', { name: 'Open Room 7' }).click();
  await expect(T.page.getByText('3 of 300 correct answers')).toBeVisible();
  const row = T.page.getByRole('list', { name: 'Students' }).getByRole('listitem').filter({ hasText: ma!.publicName });
  await expect(row).toContainText('🪙 500 earned');
  await expect(row).toContainText('Money Check 6/12 → –');
  await expect(row).toContainText('🟢 Online · Piggybank Village · Plaza');
  await expect(T.page.getByText('6.0 / 12')).toBeVisible();
  await expect(T.page.getByText('AliceNick')).toHaveCount(0);

  // The CSV is the DECA impact data: one row per test, public names only.
  const [dl] = await Promise.all([T.page.waitForEvent('download'), T.page.getByRole('button', { name: /Download Money Check CSV/ }).click()]);
  const csv = readFileSync(await dl.path(), 'utf8');
  expect(csv.split('\r\n')[0]).toContain('public_name,test,date');
  expect(csv).toContain(`${ma!.publicName},pre,2026-11-07T10:00:00Z,K-5,A,1,1,1,1,1,1,6,`);
  expect(csv).not.toContain('AliceNick');

  // The teacher lowers the target; the bar follows, and reaching it celebrates for both.
  await T.page.getByText('Class settings').click();
  await T.page.getByLabel('Weekly goal').fill('10');
  await T.page.getByRole('button', { name: 'Save goal' }).click();
  await expect(barB).toHaveAttribute('aria-valuemax', '10', { timeout: 5000 });
  await play(A.page, 10, 520, PRE);
  await expect(B.page.getByText('Your class reached this week’s goal')).toBeVisible({ timeout: 10_000 });
  await expect(A.page.getByText('Your class reached this week’s goal')).toBeVisible();

  // Leaderboard: coins earned, in the Progress panel. Hiding it takes effect.
  await A.page.getByRole('button', { name: 'Progress and Money Check' }).click();
  const panel = A.page.getByRole('dialog', { name: 'Progress' });
  await expect(panel.getByRole('listitem').filter({ hasText: `1. ${ma!.publicName}` })).toContainText('520');
  await panel.getByRole('button', { name: 'Close' }).click();
  await T.page.getByLabel('Hide the class leaderboard').check();
  await expect(T.page.getByText('Leaderboard hidden.')).toBeVisible();
  await A.page.getByRole('button', { name: 'Progress and Money Check' }).click();
  await expect(panel.getByText('Your teacher turned the leaderboard off')).toBeVisible();
  await panel.getByRole('button', { name: 'Close' }).click();

  // Play offline: nothing is uploaded until it's switched off, and then nothing is lost.
  await B.page.getByRole('button', { name: 'Settings' }).click();
  const offline = B.page.getByRole('checkbox', { name: /Play offline/ });
  await offline.check();
  await play(B.page, 4, 77);
  await B.page.waitForTimeout(4500);
  expect((await of(mb!.publicName)).progress!.coinsEarned).toBe(50);
  await offline.uncheck();
  await expect.poll(async () => (await of(mb!.publicName)).progress!.coinsEarned, { timeout: 10_000 }).toBe(77);
  await B.page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Done' }).click();

  // Device code: the old device is signed out, a new one takes over the same name and progress.
  await T.page.getByRole('button', { name: `New device code for ${ma!.publicName}` }).click();
  const box = T.page.getByRole('status').filter({ hasText: 'Device code for' });
  await expect(box).toBeVisible();
  const code = (await box.locator('p').nth(1).innerText()).trim();
  expect(code).toMatch(/^[A-Z0-9]{8}$/);
  await expect.poll(async () => (await net(A.page)).status).toBe('off');
  expect(await A.page.evaluate(() => (window as unknown as Hooks).__mq.save().slots[0]!.online)).toBeNull();

  const C = await player(browser, 'NewDevice', null, 'plaza', [300, 250]);
  await C.page.getByRole('button', { name: 'Settings' }).click();
  await C.page.getByRole('button', { name: 'Join a class' }).click();
  await C.page.getByLabel('Class code or device code').fill(code);
  await C.page.getByRole('button', { name: 'Next' }).click();
  await expect(C.page.getByText(`Classmates see you as ${ma!.publicName}`)).toBeVisible();
  expect((await detail()).members).toHaveLength(2);
  await expect.poll(async () => (await net(B.page)).people.map((p) => p.name), { timeout: 10_000 }).toEqual([ma!.publicName]);

  for (const p of [A, B, C]) expect(p.errors).toEqual([]);
  for (const c of [A.ctx, B.ctx, C.ctx, T.ctx]) await c.close();
});

test('the admin account resets a teacher’s password; other teachers never see that screen', async ({ browser }) => {
  const adminEmail = 'admin@moneyquest.test', password = 'correct horse battery';
  const post = (path: string, body: object) => fetch(MP + path, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let r = await post('/api/teacher/signup', { email: adminEmail, password });
  if (r.status === 409) r = await post('/api/teacher/login', { email: adminEmail, password }); // from an earlier run
  expect(r.status).toBe(200);
  const adminToken = ((await r.json()) as { token: string }).token;
  const { teacher } = await makeClass(0);
  const email = ((await api('GET', '/api/teacher/me', undefined, teacher)).teacher as { email: string }).email;

  const plain = await teacherPage(browser, teacher);
  await expect(plain.page.getByRole('button', { name: 'Open Room 7' })).toBeVisible();
  await expect(plain.page.getByRole('region', { name: 'Admin' })).toHaveCount(0);

  const admin = await teacherPage(browser, adminToken);
  await admin.page.getByRole('button', { name: `Reset password for ${email}` }).click();
  await expect(admin.page.getByText('Temporary password for')).toBeVisible();
  const temp = (await admin.page.getByRole('status').locator('p').nth(1).innerText()).trim();
  const login = await post('/api/teacher/login', { email, password: temp });
  expect(((await login.json()) as { teacher: { mustChange: boolean } }).teacher.mustChange).toBe(true);
  const old = await fetch(`${MP}/api/teacher/me`, { headers: { Origin: ORIGIN, Authorization: `Bearer ${teacher}` } });
  expect(old.status).toBe(401);
  await plain.ctx.close();
  await admin.ctx.close();
});
