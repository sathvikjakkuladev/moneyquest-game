// Multiplayer Phase 3, against the local server (see mp.ts): emotes and phrases in speech bubbles,
// muting a classmate on your device, reporting them (the teacher sees what they said), teacher mute
// and remove (both live), and the Play offline switch.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { api, makeClass, net } from './mp.ts';
import { player } from './mp.ts';

test.skip(!process.env.MP_E2E, 'needs the local multiplayer server (npm run dev:all) and MP_E2E=1');

async function say(page: Page, button: string | RegExp) {
  await page.getByRole('button', { name: 'Say something to classmates' }).click();
  const picker = page.getByRole('dialog', { name: 'Say something' });
  await picker.getByRole('button', { name: button, exact: typeof button === 'string' }).click();
  await expect(picker).toBeHidden();
}

test('emotes and phrases, mute, report, teacher mute and remove, play offline', async ({ browser }) => {
  test.setTimeout(90_000);
  const { teacher, cls, members: [ma, mb] } = await makeClass(2);
  const A = await player(browser, 'AliceNick', ma, 'plaza', [220, 250]);
  const B = await player(browser, 'BobNick', mb, 'plaza', [430, 250]);
  for (const p of [A, B]) await expect.poll(async () => (await net(p.page)).people.length, { timeout: 10_000 }).toBe(1);

  // A says "Hi!": a bubble over A for both of them, and only the picked text exists.
  await say(A.page, 'Hi!');
  await expect(B.page.getByRole('status', { name: `${ma!.publicName} said Hi!` })).toBeVisible();
  await expect(A.page.getByRole('status', { name: 'You said Hi!' })).toBeVisible();
  // Saying again at once: the picker asks to wait (the server allows one every 3 s).
  await A.page.getByRole('button', { name: 'Say something to classmates' }).click();
  await expect(A.page.getByText('Wait a moment')).toBeVisible();
  await expect(A.page.getByRole('button', { name: 'Wave' })).toBeDisabled();
  await A.page.keyboard.press('Escape');
  await expect(B.page.getByRole('status', { name: /said Hi!/ })).toBeHidden({ timeout: 6000 }); // bubbles fade after 4 s

  // B taps A's name tag and mutes A on B's device: A's next emote doesn't show for B.
  await B.page.getByRole('button', { name: `${ma!.publicName}: open menu` }).click();
  const menu = B.page.getByRole('dialog', { name: ma!.publicName });
  await menu.getByRole('button', { name: `🔇 Mute ${ma!.publicName}` }).click();
  await menu.getByRole('button', { name: 'Close' }).click();
  await say(A.page, 'Wave');
  await expect.poll(async () => (await net(B.page)).says[(await net(B.page)).people[0]!.id]?.k).toBe('e'); // it arrived…
  await expect(B.page.getByRole('status', { name: /said Wave/ })).toHaveCount(0); // …but isn't shown

  // B reports A. The teacher sees the report with what A said, in order.
  await B.page.getByRole('button', { name: `${ma!.publicName}: open menu` }).click();
  await menu.getByRole('button', { name: /Report to your teacher/ }).click();
  await menu.getByRole('button', { name: 'Report', exact: true }).click();
  await expect(menu.getByText('Thanks for telling us')).toBeVisible();
  await menu.getByRole('button', { name: 'Close' }).click();
  const detail = async () => api('GET', `/api/teacher/classes/${cls.id}`, undefined, teacher) as Promise<{ members: { id: string; name: string; muted: boolean }[]; reports: { target: string; reporter: string; history: { kind: string; i: number }[] }[] }>;
  await expect.poll(async () => (await detail()).reports.length).toBe(1);
  const r = (await detail()).reports[0]!;
  expect(r).toMatchObject({ target: ma!.publicName, reporter: mb!.publicName });
  expect(r.history.map((h) => [h.kind, h.i])).toEqual([['phrase', 0], ['emote', 0]]);

  // The teacher page shows it, decoded, and the teacher mutes A from there: A's picker says so at once.
  const T = await browser.newContext();
  const tp = await T.newPage();
  await tp.addInitScript((t) => sessionStorage.setItem('mq-teacher-session', t), teacher);
  await tp.goto('./teacher/');
  await tp.getByRole('button', { name: 'Open Room 7' }).click();
  const report = tp.getByRole('list', { name: 'Reports' }).getByRole('listitem').filter({ hasText: 'was reported by' });
  await expect(report).toContainText(`${ma!.publicName} was reported by ${mb!.publicName}`);
  await expect(report).toContainText('“Hi!” · Piggybank Village · Plaza');
  await expect(report).toContainText('👋 (Wave)');
  await report.getByRole('button', { name: `Mute ${ma!.publicName}` }).click();
  await expect(tp.getByRole('button', { name: `Unmute ${ma!.publicName}` }).first()).toBeVisible();
  await expect.poll(async () => (await net(A.page)).muted).toBe(true);
  await A.page.getByRole('button', { name: 'Say something to classmates' }).click();
  await expect(A.page.getByText('Your teacher turned off emotes and phrases for you')).toBeVisible();
  await A.page.keyboard.press('Escape');
  await report.getByRole('button', { name: 'Close report' }).click();
  await expect(tp.getByText('No open reports.')).toBeVisible();

  // A switches to Play offline: B stops seeing A; switching back reconnects.
  await A.page.getByRole('button', { name: 'Settings' }).click();
  const offline = A.page.getByRole('checkbox', { name: /Play offline/ });
  await offline.check();
  await expect.poll(async () => (await net(A.page)).status).toBe('off');
  await expect.poll(async () => (await net(B.page)).people.length).toBe(0);
  await offline.uncheck();
  await expect.poll(async () => (await net(B.page)).people.length, { timeout: 10_000 }).toBe(1);
  await expect.poll(async () => (await net(A.page)).muted).toBe(true); // still muted after reconnecting
  await A.page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Done' }).click();

  // The teacher removes B: B is disconnected at once and the game forgets the class.
  tp.on('dialog', (d) => void d.accept());
  await tp.getByRole('button', { name: `Remove ${mb!.publicName}` }).click();
  await expect(tp.getByRole('list', { name: 'Students' }).getByRole('listitem')).toHaveCount(1);
  await expect.poll(async () => (await net(B.page)).status).toBe('off');
  await expect.poll(async () => (await net(A.page)).people.length).toBe(0);
  expect(await B.page.evaluate(() => (window as unknown as { __mq: { save: () => { slots: { online: unknown }[] } } }).__mq.save().slots[0]!.online)).toBeNull();
  await B.page.getByRole('button', { name: 'Settings' }).click();
  await expect(B.page.getByText('You’re not in this class on this device any more')).toBeVisible();

  for (const p of [A, B]) expect(p.errors).toEqual([]);
  for (const c of [A.ctx, B.ctx, T]) await c.close();
});
