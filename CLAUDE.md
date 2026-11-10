# CLAUDE.md — MoneyQuest

Browser RPG teaching personal finance to grades K–8 (DECA Financial Literacy Project). Kids explore a
wizard school and money-themed zones one screen at a time and battle "money monsters" by answering
multiple-choice questions. It must be accurate, demo-ready for judges, run on school Chromebooks and
iPads, and deploy as a static website. **Hosting: the game is on Vercel at `https://play.nhsqa.org`
(decided 2026-11-09); the domain `nhsqa.org` is registered at Porkbun, and the root `nhsqa.org` is
NHSQA's own site, which must keep working.** Optional multiplayer runs on a Cloudflare
Worker (`server/`, planned at `mp.nhsqa.org`; PLAN.md §10). Design and every decision: `PLAN.md`. Asset facts:
`ASSET_REPORT.md`. The old build and its archive were deleted on 2026-11-07 at the user's request;
the only thing kept from it is the v1 art the importer still needs (`assets-src/v1/`).

## Commands

```sh
npm run dev | build | preview
npm run typecheck          # tsc, strict, must be clean
npm test                   # Vitest, must pass
npm run e2e                # Playwright (uses the installed Google Chrome)
npm run import:questions   # ../make-bank-question-bank.csv + src/data/question-overrides.json → src/data/questions.json
npm run import:assets      # ../MoneyQuest Assets/ + assets-src/pixellab/ (+ pixelized v1 gaps from assets-src/v1/) → public/assets/, src/assets/manifest.json, ASSET_REPORT.md
node tools/seed-rooms.ts <zone>   # first version of src/data/rooms/<zone>.json (never overwrites without --force)
npm run dev:all            # multiplayer: local server (wrangler, :8787) + game with VITE_MP_URL (:5173)
npm run server:typecheck   # the server package (game/server/), separate from the game build
npm run server:test        # server tests (Node SQLite with the real D1 migrations)
```

Multiplayer server: `server/README.md` (settings, secrets, Vercel variables). In the game, multiplayer
code loads only behind `import.meta.env.VITE_MP_URL ? … : …` (see `App.tsx`, `Hud.tsx`);
`src/net/bridge.ts` is the network-free meeting point between the scenes and that code, and
`src/net/protocol.ts` is the wire format both sides validate with. Emotes and phrases
(`src/net/says.ts`) travel as list indexes and reports store them: only append to those lists. The game's `npm run
build` never builds or type-checks `server/`; `.vercelignore` keeps it out of Vercel uploads.

Node 26 runs `tools/*.ts` directly (type stripping): use `import type`, explicit `.ts` extensions,
no enums, namespaces or constructor parameter properties.

## Hard rules

- **Inputs are read-only. Never edit, move or write into them:** `../make-bank-question-bank.csv`,
  `../MoneyQuest Assets/`, and `assets-src/v1/` (the only copy of the v1 art). Fix questions only through
  `src/data/question-overrides.json`, and every override needs a `reason`.
- **`src/rewards/rewardCodes.ts` and `rewardSecret.ts` are byte-identical copies** of
  `/Users/jakkula/MakeBank/client/src/data/` (a test checks their SHA-256). 110 cards are printed
  with them. Never edit them or make a new secret; game rules go in `src/rewards/redeem.ts`. The
  printed code lists (`tests/fixtures/reward-cards/`) are gitignored and never committed.
- **The Laurel Wreath (`hat-laurel`) and Bull Calf (`pet-bull`) are reward-only:** they must exist
  and be visible in the game, and can never be bought (`buy()` refuses them; tested).
- **Never put a printed card code in the repo** (tests, docs, examples). Tests generate codes with
  `makeCode()` for serials that were never printed; docs use `MB-W1234-ABCDE`.
- **Generated files are never hand-edited:** `src/data/questions.json`, `src/data/monster_attacks.json`,
  `src/assets/manifest.json`, `public/assets/**`, `ASSET_REPORT.md`. Re-run the importer. Room
  layouts in `src/data/rooms/<zone>.json` are game-side and edited by hand or the `?dev=1` editor.
- **Monster data comes only from `monster_attacks.json`.** Effect rules map onto it in code.
- **Kids' privacy.** Originally "no accounts or network calls"; **reversed 2026-11-07 by the user
  for multiplayer** (PLAN.md §10). The rules now:
  - **The game works with no server.** Single-player and the local save never depend on the
    network. With no `VITE_MP_URL` at build time, multiplayer code isn't loaded and the game makes
    no requests (except optional reward-code checking). If the server is unreachable, the game
    quietly carries on.
  - **Students never type text another student sees.** No chat, no free-text names. Public names
    come from the generator or the teacher's list; emotes and preset phrases travel as numbers
    and are drawn from lists built into the game. The private nickname never leaves the device.
  - **Minimal data.** Students: class membership, public name, token hash, progress summaries. No
    real names, emails, birthdays, photos or location. Only teachers have accounts (email +
    PBKDF2 password hash). Retention: idle classes deleted after 12 months, reports after 90 days.
  - **No third parties:** no analytics, ads or trackers (Vercel Analytics and Speed Insights stay
    off). Fonts and libraries are bundled locally.
  - **Secrets** live in `wrangler secret`, never in the repo or any `VITE_` variable (those end up
    in the public bundle).
  - **Teachers stay in control:** classes, mute/remove, world mode (off by default), data deletion.
- **Mark drafts:** learning text written by AI (mentor tips, overrides, explanations) is a draft
  for the user to review.
- **PixelLab costs generations** (trial account): ask the user before every generation.
- **Ask on real decisions** (gameplay rules, cutting features, missing assets). Small ones: pick
  something sensible and note it in `PLAN.md`.

## Dev tools (`?dev=1`, dev server only)

All zones open, a map editor (Save writes `src/data/rooms/<zone>.json` through a dev-only Vite
endpoint and reloads into the same room) and a test panel (jump to any screen, equip a pet, coins).
None of it is in the production build.

## Rendering (pixel art throughout)

- Internal resolution 640×360, Phaser `pixelArt: true`, nearest-neighbour everywhere. The canvas
  fills the browser window (16:9 kept, thin bars only on the longer side) with CSS
  `image-rendering: pixelated` (`src/ui/useStage.ts`); Settings has a Full screen button. iPad
  portrait: canvas on top, UI below.
- The player's feet stay 58 px from the top and 12 px from the sides (`standable()` in
  `src/data/rooms.ts`) except at exits, so the sprite never leaves the screen.
- Screen art (320×180) drawn at 2×; sprites at 1× (the player is 64 px). `rooms.json` coordinates
  (640×360) are used as they are. Bosses: 1× (96 px) on the overworld, 2× (192 px) in battle.
- All text is React in Fredoka at 18 px or more, never pixel text.
- **Depth:** every sprite's depth is its feet y. Scenery the player walks behind (trees, signs,
  lamps, pillars, arches) is a room's `fronts`: outlines cut out of the screen art at runtime
  (`src/core/fronts.ts`, drawn by `src/game/fronts.ts`) at the depth of their `base` line. Blocks
  are footprints (trunk, post, base), not the whole picture. Outlines must enclose the object with
  some ground around it; use `trim` where the object shares colours with the ground (leaves and
  grass), `keep` for plain rectangles, `dark` on near-black floors. Tests check every front keeps
  pixels and that blocks never cut off an exit, entry, NPC, monster or portal.

## Gameplay rules already decided (PLAN.md §3)

Options shuffled every showing; regular monsters take 5 hits, bosses 7; bosses alternate attacks;
Explorer never sees a timer; no repeats until a pool runs out and misses return 3–5 questions later;
Money Check = 12 questions with fixed A/B forms per band, held out of battles (Money Check 1 in the
opening flow, Money Check 2 after the sixth boss; the bonus portals need both); pets +2 damage
(+4 legendary); fainting loses nothing; 3 save slots; customization is hats and pets only; the
first win over a bonus-zone monster tames it. The save schema is versioned (`src/core/save.ts`):
any change bumps `SAVE_VERSION` and adds a migration with a test.

## Accessibility

Text ≥ 18 px, contrast ≥ 4.5:1, buttons ≥ 48 px, ✓/✗ icons with colour, read-aloud on every
question and explanation (on-device voices only), full keyboard play (1–4 / A–D to answer),
`prefers-reduced-motion` respected.

## Workflow

- Phases are in PLAN.md §8. Stop after each one for the user to test.
- Before each commit: typecheck clean and tests passing. One commit per phase, plus a PLAN.md
  phase-log entry and an update to `docs/AI_USE.md`.
- Budgets: first load < 10 MB, whole game < 40 MB, 60 fps on a mid-range Chromebook at 4× CPU throttle.
