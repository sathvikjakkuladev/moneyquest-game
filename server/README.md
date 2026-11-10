# MoneyQuest multiplayer server

A Cloudflare Worker with a D1 database. It's optional: the game works without it, and it's
switched on only when the game is built with `VITE_MP_URL`. Design and decisions: `../PLAN.md` §10.

## Run it locally

From `game/`:

```sh
npm run dev:all        # the server on http://localhost:8787 and the game on http://localhost:5173
```

`dev:all` does two things:
- It applies the D1 migrations to a local database (in `server/.wrangler/`, never committed).
- It starts the game with `VITE_MP_URL=http://localhost:8787`.

Teachers sign up at http://localhost:5173/teacher/. Students join in the game under Settings → Join a class.

Tests (no Cloudflare account needed: they run against Node's built-in SQLite with the real migrations):

```sh
npm run server:test
npm run server:typecheck
MP_E2E=1 E2E_URL=http://localhost:5173 npx playwright test class-join   # with dev:all running
```

## Settings

| What | Where | Value |
|---|---|---|
| `ALLOWED_ORIGINS` | `wrangler.toml` vars (per environment) | Exact origins allowed to call the API: production `https://play.nhsqa.org` (the game's address; the root `nhsqa.org` is NHSQA's own site); dev `http://localhost:5173,http://localhost:4173` |
| `PREVIEW_ORIGIN_PATTERN` | `wrangler.toml` vars (staging only) | A regex for this project's Vercel preview URLs, set in Phase 6; empty everywhere else |
| `ADMIN_EMAIL` | **secret**: `wrangler secret put ADMIN_EMAIL --env production` | The NHSQA admin account's email |
| `PEPPER` | **secret**: `wrangler secret put PEPPER --env production` | A long random string, for example from `openssl rand -base64 32`. Never change it after teachers sign up, or their passwords stop working. |

Secrets never go in the repo or in any `VITE_` variable (those end up in the public game bundle).

## Vercel settings for the game (Phase 6)

In the Vercel project, under Settings → Environment Variables:

| Variable | Environment | Value |
|---|---|---|
| `VITE_MP_URL` | Production | `https://mp.nhsqa.org` |
| `VITE_MP_URL` | Preview | The staging server: first `https://moneyquest-mp-staging.<account>.workers.dev`, later `https://mp-staging.nhsqa.org` |

**Leaving it unset keeps multiplayer off.** That's the case today: the live game makes no requests to the server.

The game's CSP (`vercel.json`) already allows `mp.nhsqa.org` and `mp-staging.nhsqa.org`. A `workers.dev` staging address gets added there in Phase 6.

## Security notes

- **Teacher sessions:**
  - Bearer tokens, kept in the /teacher tab's sessionStorage and valid for 12 hours. No cookies, so it also works from staging and preview sites.
  - D1 stores only a SHA-256 of each token.
- **Passwords:**
  - PBKDF2-SHA256 at 100,000 iterations (the Workers limit), with a 16-byte salt, then HMAC with `PEPPER`.
  - 5 wrong tries lock that email (and that IP) for 15 minutes.
- **Origins:** every API call must come from an allowlisted origin (CORS never uses `*`), and state changes must be JSON (CSRF defense in depth). WebSockets check the same allowlist on upgrade.
- **Live presence (`/ws/class/<code>`):**
  - One `ClassRoom` Durable Object per class, using the hibernation API.
  - The first message must be `hello` with the membership token, within 5 seconds.
  - Every message is validated (`src/net/protocol.ts`, shared with the game): at most 512 bytes, real screens only, in bounds, walking speed, rate-limited.
  - Local `wrangler dev` (`ENVIRONMENT=development`) loosens the HTTP rate limits 50×.
- **Emotes and phrases (`src/net/says.ts`):**
  - They travel as numbers into lists built into the game; anything else is refused. One every
    3 seconds per player.
  - The server keeps each player's last 10, so a report carries what the reported player really said.
  - Reports: 3 a minute per player.
- **Teacher actions:**
  - Mute, remove and class deletion update D1 first. Then the Worker posts to the class room's
    `/admin` path so they apply live (it mutes, or closes the student's socket with 4003).
  - Only the Worker can reach `/admin`: it forwards nothing to a room except `/ws/class/<code>` upgrades.
  - If the room can't be reached, the action still holds, because every connect checks D1.
- **Students:**
  - A class membership with a random token (D1 stores only its hash) and a public name from the generator or the teacher's list. Free text is refused.
  - Wrong class or device codes are limited to 20 per IP per 10 minutes. Correct codes don't count, so a whole class can join at once from one school IP.
- **Admin account:**
  - Whoever holds the `ADMIN_EMAIL` account gets password resets in /teacher. There's no email verification, so **create that account first on a new database, and only then set the secret.** If sign-up says the email is taken, someone got there first: stop and pick another address.
  - Admin routes answer 404 to everyone else.
- **Progress uploads (`src/net/progress.ts`):**
  - Summaries only, strictly validated; the save itself stays on the device.
  - The class goal counts increases in a student's all-time correct answers, at most 100 per upload. The first upload only sets a baseline.
  - Scores come from the student's own device, so a determined student could inflate them; the caps limit that and the teacher can hide the leaderboard.
- **Device codes:** 8 characters, one use, 24 hours, stored only as hashes. Making one signs the student's old device out.
- **Retention (daily cron):** classes idle for 12 months are deleted with all their data; reports go after 90 days, along with expired sessions and old rate-limit rows.
