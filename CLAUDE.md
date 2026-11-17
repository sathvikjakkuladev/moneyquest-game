# CLAUDE.md — MoneyQuest

Browser RPG teaching personal finance to grades K–8 (DECA Financial Literacy Project). Kids explore
Vaultspire (the hub city Ledgerhold and seven money-themed districts) one screen at a time and battle
"money monsters" by answering multiple-choice questions. It must be accurate, demo-ready for judges, run on school Chromebooks and
iPads, and deploy as a static website. **Hosting: the game is on Vercel at `https://play.nhsqa.org`
(decided 2026-11-09); the domain `nhsqa.org` is registered at Porkbun, and the root `nhsqa.org` is
NHSQA's own site, which must keep working.** Optional multiplayer runs on a Cloudflare
Worker (`server/`): production `https://mp.nhsqa.org`, staging `https://mp-staging.nhsqa.org`; DNS
for nhsqa.org is on Cloudflare since 2026-11-10 (PLAN.md §10). Design and every decision: `PLAN.md` (the assets_v2 rebuild:
§12). Asset facts: `ASSET_REPORT.md`, and reference copies of the art set's docs in `docs/assets_v2/`.
The old build and its archive were deleted on 2026-11-07 at the user's request; the v1 art
(`assets-src/v1/`) is kept untouched as the only copy, though the game no longer draws it.

## Commands

```sh
npm run dev | build | preview
npm run typecheck          # tsc, strict, must be clean
npm test                   # Vitest, must pass
npm run e2e                # Playwright (uses the installed Google Chrome)
npm run import:questions   # ../make-bank-question-bank.csv + src/data/question-overrides.json → src/data/questions.json
npm run import:assets      # ../assets_v2 → public/assets/v2/ (WebP), src/assets/v2.json, src/data/v2/*.json, docs/assets_v2/, ASSET_REPORT.md
npm run import:monsters    # ../MoneyQuest Assets/monsters/monster_attacks.json + src/data/monster-roster.json → src/data/monster_attacks.json
node tools/seed-rooms.ts <place>   # first version of src/data/rooms/<place>.json from ../assets_v2 (never overwrites without --force)
npm run dev:all            # multiplayer: local server (wrangler, :8787) + game with VITE_MP_URL (:5173)
npm run server:typecheck   # the server package (game/server/), separate from the game build
npm run server:test        # server tests (Node SQLite with the real D1 migrations)
```

Multiplayer server: `server/README.md` (settings, secrets, Vercel variables). In the game, multiplayer
code loads only behind `import.meta.env.VITE_MP_URL ? … : …` (see `App.tsx`, `Hud.tsx`);
`src/net/bridge.ts` is the network-free meeting point between the scenes and that code, and
`src/net/protocol.ts` is the wire format both sides validate with. Emotes and phrases
(`src/net/says.ts`) travel as list indexes and reports store them: only append to those lists.
World mode (`src/net/world.ts`) reuses the same connection class for one world screen at a time;
world players have negative ids in the game, and names from a teacher's list never leave the class. The game's `npm run
build` never builds or type-checks `server/`; `.vercelignore` keeps it out of Vercel uploads.

The three importers read folders next to the repo (`../assets_v2`, `../MoneyQuest Assets/`, the CSV),
so they only run on Sathvik's Mac or where those are copied in. Everything the game and the tests need
is exported into the repo, so `npm test`, `npm run typecheck` and the build work on a plain clone; tests
that need an input skip with a message when it's missing.

Node 26 runs `tools/*.ts` directly (type stripping): use `import type`, explicit `.ts` extensions,
no enums, namespaces or constructor parameter properties.

## Hard rules

- **Inputs are read-only. Never edit, move, commit or write into them:** `../assets_v2/` (the art
  set, 1.4 GB of masters), `../make-bank-question-bank.csv`, `../MoneyQuest Assets/`, and
  `assets-src/v1/` (the only copy of the v1 art). Fix questions only through
  `src/data/question-overrides.json`, and every override needs a `reason`.
- **`src/rewards/rewardCodes.ts` and `rewardSecret.ts` are byte-identical copies** of
  `/Users/jakkula/MakeBank/client/src/data/` (a test checks their SHA-256). 110 cards are printed
  with them. Never edit them or make a new secret; game rules go in `src/rewards/redeem.ts`. The
  printed code lists (`tests/fixtures/reward-cards/`) are gitignored and never committed.
- **The Laurel Wreath (`hat-laurel`) and Bull Calf (`pet-bull`) are reward-only:** they must exist
  and be visible in the game, and can never be bought (`buy()` refuses them; tested). The Laurel
  Wreath keeps the id `hat-laurel` (its art is the set's `laurel-wreath` folder); the Bull Calf is
  the Hype Bull's `fire` look, which no other pet can wear.
- **Never put a printed card code in the repo** (tests, docs, examples). Tests generate codes with
  `makeCode()` for serials that were never printed; docs use `MB-W1234-ABCDE`.
- **Generated files are never hand-edited:** `src/data/questions.json`, `src/data/monster_attacks.json`,
  `src/assets/v2.json`, `src/data/v2/**`, `public/assets/**`, `docs/assets_v2/**`, `ASSET_REPORT.md`.
  Re-run the importer. Room layouts in `src/data/rooms/<place>.json` are game-side and edited by
  hand or the `?dev=1` editor; `src/data/monster-roster.json` (names and draft text) is edited by hand.
- **Monster data comes only from `monster_attacks.json`.** Effect rules map onto it in code
  (`src/data/effectRules.ts`); each Vaultspire monster keeps the rule of the first-build monster it
  takes its mechanics from. The battle engine's tests use frozen first-build fixtures
  (`src/core/battleFixtures.ts`) so every rule kind stays tested.
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
- **Mark drafts:** learning text written by AI (mentor tips, overrides, explanations, monster
  attack text and lessons, the topic-to-district mapping, hat rarities and prices, colour-set
  names) is a draft for the user to review.
- **Paid generators** (PixelLab, Higgsfield): no longer used by the game. If art is ever needed
  again, ask the user before every generation.
- **Ask on real decisions** (gameplay rules, cutting features, missing assets). Small ones: pick
  something sensible and note it in `PLAN.md`.

## Dev tools (`?dev=1`, dev server only)

All districts open, a map editor (Save writes `src/data/rooms/<place>.json` through a dev-only Vite
endpoint and reloads into the same room; it moves NPCs, monsters, the waystone, exits and collision)
and a test panel (jump to any screen, equip any pet, coins, clear all districts).
None of it is in the production build.

## Rendering (smooth vector art, PLAN.md §12)

- The art is the `assets_v2` set: bold flat vector cartoon ("Style A"). Game logic runs on a
  **640×360 stage**; the canvas draws it at **1280×720** (camera zoom 2, `src/game/stage.ts`) with
  smooth filtering (`pixelArt: false`, antialiasing on, no `image-rendering: pixelated`). The canvas
  fills the browser window (16:9 kept, thin bars only on the longer side, `src/ui/useStage.ts`);
  Settings has a Full screen button. iPad portrait: canvas on top, UI below.
- Art is exported at 2× its on-stage size, so a texture drawn at scale ½ is pixel-for-pixel. The
  importer divides every assets_v2 coordinate (1920×1080 screens) by 3 onto the stage.
- Sizes on the stage (`SIZE` in `src/game/creature.ts`): player 64 px tall (108 in battle), pets 40
  (bosses 50), monsters 56 (100 in battle), bosses 96 (180 in battle), NPCs 66.
- The player's feet stay 66 px from the top and 12 px from the sides (`standable()` in
  `src/data/rooms.ts`) except at exits, so the sprite, hair and hat never leave the screen.
- All text is React in Fredoka at 18 px or more. The game UI uses the art set's UI kit (navy
  surfaces, thick outline, cyan main action, acid green only for money and right answers), scoped
  to `.mq-game` in `src/styles.css`; the teacher pages keep their light style.
- **Depth:** every sprite's depth is its feet y. Props are separate sprites placed from the art
  set's `objects.json` and sorted by their anchor, so the player walks behind a lamp above its base
  and in front of it below. A screen's `overhang` layer (when it has one) draws above everything.
  Collision comes from the art set's footprints (`block` polygons in the room files).
- **Clips are sprite sheets**, never WebM (WebM with alpha doesn't play in iPad Safari). The avatar
  is baked per look (`src/game/avatarBake.ts`): body frames recoloured for skin and costume set,
  then hair, face and hat drawn from each clip's per-frame head track. React previews use the same
  baker (`src/ui/AvatarView.tsx`). Monsters and pets are single images moved by code
  (`src/data/v2/motion.json`); bosses and NPCs have clip sheets.

## Gameplay rules already decided (PLAN.md §3)

Options shuffled every showing; regular monsters take 5 hits, bosses 7; bosses alternate attacks;
Explorer never sees a timer; no repeats until a pool runs out and misses return 3–5 questions later;
Money Check = 12 questions with fixed A/B forms per band, held out of battles (Money Check 1 in the
opening flow, Money Check 2 with the Headmaster after the sixth topic boss; Phish Fens needs both);
the Debt Dragon fights after all seven district bosses; pets +2 damage (+4 legendary: bosses and the
Bull Calf); fainting loses nothing; 3 save slots. **PLAN.md §12:** places are joined only by the world
map (HUD button or a waystone); the first win over any monster captures it as a pet; customization is
the look (skin, eyes, hair, hair colour, face, costume colour set; free at the Stylist), hats (bought,
priced by rarity) and pets; costume sets are earned, one per district boss. The save schema is versioned (`src/core/save.ts`):
any change bumps `SAVE_VERSION` and adds a migration with a test.

## Accessibility

Text ≥ 18 px, contrast ≥ 4.5:1, buttons ≥ 48 px, ✓/✗ icons with colour, read-aloud on every
question and explanation (on-device voices only), full keyboard play (1–4 / A–D to answer),
`prefers-reduced-motion` respected.

## Workflow

- Phases are in PLAN.md §8 (the assets_v2 rebuild: §12). Stop after each one for the user to test,
  unless the user says otherwise (for the assets_v2 rebuild they asked for no stops).
- Before each commit: typecheck clean and tests passing. One commit per phase, plus a PLAN.md
  phase-log entry and an update to `docs/AI_USE.md`.
- Budgets: first load < 10 MB, whole game < 40 MB, 60 fps on a mid-range Chromebook at 4× CPU throttle.
