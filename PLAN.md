# MoneyQuest — Plan (fresh build, 2026-11-07)

Status: **approved 2026-11-07.** All six decisions in §9 went with the recommendation:
§7 missing-asset plan approved (ask before each PixelLab generation); bosses 2× in battle and 1× on
the overworld; customization is hats and pets only; keep the question overrides; the empty
top-level `.git` was deleted and the repo lives in `game/`; host on Netlify.
Paths are relative to `DECA MoneyQuest/`.

---

## 1. Step 0: done

- Old build moved (not deleted) to `_archive/game-old-2026-11-07/`, with its own `.git` inside.
  Its last commit is `851f624` (Phase 2 on the new pack).
- Copied into the new `game/`, and nothing else:
  - `src/rewards/rewardCodes.ts`, `src/rewards/rewardSecret.ts`. SHA-256 matches the originals in
    `/Users/jakkula/MakeBank/client/src/data/` (`1bf2fb3a…` and `cb372707…`).
  - `tests/fixtures/reward-cards/W-2026-10-07-14-36.csv` (100 codes) and `C-2026-10-07-14-37.csv`
    (10). These will be gitignored and never committed.
  - `src/data/question-overrides.json` (98 drafted fixes). Whether to keep it is decision 4.
- `MakeBank Assets/` is an empty folder again (it was deleted on 2026-11-06 and has reappeared).
  I'm leaving it alone.
- The top-level `DECA MoneyQuest/.git` is still empty (no commits). See decision 5.

## 2. Inputs

**Question bank** (`make-bank-question-bank.csv`): 180 rows, 15 per topic per band, 6 topics, K-5
and 6-8. Correct letters lean D (D 58, B 47, C 46, A 29), so options are shuffled at every showing.
Last time I found the longest option was the answer in 129/180 questions; the archived overrides
bring that to 52/180.

**Asset pack** (`MoneyQuest Assets/`, read-only):

| Part | Contents |
|---|---|
| `locations/` | 11 locations, 2–4 screens each (320×180), `battle_bg.png` for every location except the Academy, and a `rooms.json` per location (640×360 coordinates) |
| `monsters/` | All 40 monsters: 64×64 regular, 96×96 bosses. Each sheet has idle 4, attack 6, hit 4, defeat 5 frames, in 80 px cells (bosses 128 px) |
| `monsters/piggybank_village/ai_animations/` | Checked: each file is a single 64×64 image, the first frame of a PixelLab animation. The other frames sit behind download links, which would be a network fetch, so I'll use the sheet rows |
| `characters/player_coin_wizard/` | 8 rotations; walk (S, N, E, 6 frames), idle (S, E, 4), cast (E, 6), hit (E, 6) |
| `characters/mentor_piggybank_village/` | Penny Meadows the gnome: 8 rotations; walk (S, E, N), idle (S) |
| `monsters/monster_attacks.json` | The only source of monster data |

What the locations contain:

| Location | Screens (start first) | Mentor spot | Monster spots | Boss on |
|---|---|---|---|---|
| coin_academy | great_hall, library | merchant (great hall), headmaster (library) | — | — |
| piggybank_village | gate, plaza, market, cottages | cottages (+ a shopkeeper in the market) | market 2, cottages 2 | gate |
| borrowers_bridges | docks, bridge, toll | bridge | docks 2, bridge 2 | toll |
| guildworks | lemonade_lane, workshop_square, bakery_smithy | workshop_square | 2 + 2 | bakery_smithy |
| compound_orchard | orchard_gate, sapling_rows, great_tree | sapling_rows | 2 + 2 | great_tree |
| stormwatch_coast | beach, cliff_path, lighthouse | cliff_path | 2 + 2 | lighthouse |
| crossroads_observatory | crossroads, observatory, portal_ring | crossroads | crossroads 2 | observatory |
| 4 bonus zones | portal screen, middle screen, landmark | none | 2 + 2 | landmark |

Each zone has 4 monster spots for 3 monsters (Crossroads has only 2, so its third monster needs a
spot I'll pick). The portal ring has four portals into the bonus zones; bonus-zone exits point back
with `crossroads_observatory/portal_ring`.

**One correction to the brief:** the printed reward codes look like `MB-W1234-ABCDE`. The reward
letter is joined to the serial (`MB-W` + 4 characters), not `MB-W-XXXX-XXXXX`, and the copied
`parseCode` rejects the dashed form. `redeem.ts` will accept both spellings, so a kid who types the
extra dash still gets in. The printed QR codes contain the bare code, not a link.

## 3. Decisions carried over from the archive (already approved)

- Hits to win: **regular 5, boss 7** (Lunar Hydra: 7 split 2/2/3 across its heads). Bosses
  alternate their two attacks; the four bonus bosses have one attack and repeat it.
- Player HP 100 + 10 per level. Monster damage comes from the JSON, ×0.75 for Explorer. Monster HP
  scales with level so hit counts stay the same.
- Coins: +2 per right answer go into a battle pot, paid on victory. Regular win 10 coins and 20 XP,
  boss 30 and 60. A rematch pays half.
- Fainting is gentle: back to the zone's first screen with full HP, nothing lost.
- Timers: never for Explorer (timer effects get a non-timer version). Adventurer only when a
  monster effect forces one.
- Spells: Budget Beam 10 (starter), Save Shield 7 + an 8-point shield, Credit Cleanse 8 + removes
  debuffs, Paycheck Strike 9 + 3 coins to the pot, Compound Burst 6 + 3 per right answer in a row,
  Insurance Barrier 6 + blocks the next hit over 12, Wise Choice 8 + removes one wrong option next
  question.
- Every monster effect becomes a data rule (the archive's effect table, §4.3, is the starting
  point), each with a unit test. That includes the Stormwatch fix: the mentor sells an "Insurance
  Scroll" for 15 coins, because Insurance Barrier is unlocked only by beating that zone's boss.
- Pets give a small assist: +2 damage per right answer, +4 for legendary pets. Crash Treant can
  knock a pet out for the rest of the battle.
- Questions: shuffled bag per topic and band, no repeat until it's used up; a miss comes back 3–5
  questions later until it's answered right; accuracy tracked per topic.
- Money Check: 12 questions, 2 per topic, fixed forms A and B per band, assigned at random to pre or
  post, and held out of battles (11 questions per topic and band remain for battles). Forms use
  questions 03 and 11 of each topic for A, 07 and 15 for B; that pick is a draft for your review.
- 3 save slots per device. Nickname only (2–12 letters and numbers).
- Mentor tips are drafted by me and marked for your review.

## 4. Rendering

- Internal resolution **640×360**, Phaser `pixelArt: true` (nearest-neighbour filtering everywhere).
- The canvas is zoomed by a **whole number** to fit the window and letterboxed: 2× at 1280×720, 3×
  at 1920×1080. At 1024×768 the zoom is 1× (640×360) unless the window is at least 1280 wide, so I'll
  add a fallback: if 2× doesn't fit, use the largest integer that fits, and if only 1× fits, scale
  1× to fit the window with CSS `image-rendering: pixelated` (slightly uneven pixels, still sharp).
  I'll show you how 1024×768 looks in Phase 2.
- Screens (320×180) drawn at 2× fill the canvas. Sprites are drawn at 1×, so the 64 px player is
  about 1/6 of the screen. `rooms.json` coordinates are used as they are.
- All text and buttons are React, in real CSS pixels (Fredoka, bundled, 18 px or more), laid over
  the canvas. In iPad portrait the canvas sits at the top and the question card goes below it.

## 5. Architecture

```
game/
  tools/import-assets.ts     MoneyQuest Assets → public/assets/ (atlases, WebP) + src/assets/manifest.json + ASSET_REPORT.md
  tools/import-questions.ts  CSV + overrides → src/data/questions.json (fails loudly, writes nothing on error)
  src/core/        pure TypeScript, unit-tested: rng, questions, battle engine, effects, spells,
                   progression, money check, rewards, save + migrations, room geometry
  src/data/        questions.json (generated), rooms/<zone>.json (game-side layouts + collision),
                   effect rules, mentor tips (draft), money-check forms, shop
  src/game/        Phaser scenes: Boot, Room (one screen), WorldMap, Battle; dev map editor (?dev=1)
  src/ui/          React: title, onboarding, question card, HUD, dialogue, shop, progress,
                   settings, redeem, money check, celebration
  src/state/       Zustand: save (persisted, versioned) and session
  src/rewards/     rewardCodes.ts + rewardSecret.ts (verbatim), redeem.ts
  src/audio.ts     no-op sfx(id) and music(id), with call sites in place
```

The battle engine is a pure state machine, `(state, action) → (state, events)`. Phaser animates the
events and React shows the card, so every rule is testable without a browser.

**Packages (pinned):** vite 8.3.6, typescript 7.0.2, phaser 4.2.1, react and react-dom 19.3.1,
zustand 5.1.0, tailwindcss and @tailwindcss/vite 4.3.5, vitest 5.1.0, @playwright/test 1.65.0
(run against the installed Google Chrome, so no browser download), @vitejs/plugin-react 6.2.1,
sharp 0.35.5 (importer only), @fontsource/fredoka 5.3.0.

## 6. Overworld

- One Room scene per screen. Walking into an exit strip fades (or slides, with full motion on) to
  the target screen at `enter_at`. Cross-zone exits (`crossroads_observatory/portal_ring`) work the
  same way.
- Controls: arrow keys or WASD, click or tap to walk, and an on-screen D-pad on touch screens. Space,
  Enter or a tap talks to NPCs. Walking into an unbeaten monster starts the battle.
- The pet follows a few steps behind the player.
- `src/data/rooms/<zone>.json` holds each screen's layout (from `rooms.json`) plus a first pass of
  walkable and blocked polygons that I draw from the art. The `?dev=1` editor (Phase 3) edits and
  saves these files through a small dev-server endpoint, which runs in dev only and never in the
  build.

## 7. Missing assets: my proposal

| Missing | Proposal | Why |
|---|---|---|
| **Bull Calf** (reward pet) | **(b)** Pixelize the archived v1 Bull Calf, which already has walk frames in four directions, at 32 px | Free, has walking animation, and matches the v1 design on the printed card |
| **Laurel Wreath** (reward hat) | **(c)** A small pixel wreath drawn in code, worn on the wizard's head in every frame (head position found from each frame's pixels), plus a pixelized v1 icon for the shop and popup | The player is one fixed sprite, so hats have to be overlays; a code-drawn one lines up exactly |
| Headmaster, merchant | **(a)** PixelLab, 2 of the 5 generations left: one character each with 8 rotations (they stand still, with a gentle bob) | They're on screen in every session, so they should match the pack |
| Other 5 mentors | **(a)** PixelLab with the free daily bonus (5 a day), one or two a day before Phase 4; fallback **(b)** | Same reason; each needs only rotations |
| Shopkeeper (market), townsfolk | Reuse the merchant for the shopkeeper; leave townsfolk out | Not needed for gameplay |
| Other pets (7 shop pets) | **(b)** Pixelize the v1 pets at 32 px; tamed bonus monsters use their own sprites at half size | Free; pets are half the player's height |
| Spells and effects | **(c)** Pixel particles and tweens in code (beams, sparkles, shield bubble, coin bursts) | Matches the pixel style, and is tiny |
| UI | **(c)** React panels and buttons styled to the pixel look, Fredoka text | Readable for young kids |
| World map | **(b)** Pixelize the archived v1 world map to 640×360, with code-drawn markers and locks; fallback **(c)** a drawn node map | The v1 map already shows all 11 islands in the right layout |

PixelLab balance today: **5 generations left plus the 5-per-day bonus**, $0 credit. Each new image
uses generations, so I'll ask before every PixelLab call.

## 8. Phases

Each phase ends with `tsc` clean, Vitest passing, a commit, a phase-log entry, an update to
`docs/AI_USE.md`, and a stop for you to test.

1. **Setup and pipelines.** Scaffold, both importers with tests, reward codes with the 110-code
   test, first ASSET_REPORT.md, CLAUDE.md.
2. **Hub and Piggybank Village playable.** Academy (two screens, headmaster, merchant), placeholder
   world map, all four Piggybank screens with Penny Meadows, Spendling, Impulse Magpie, Jar Muncher
   and King Splurge. Real question card, Save Shield unlock, autosave, opening flow (Money Check 1
   as a placeholder until Phase 5). Playwright smoke test: title, nickname, hub, battle, one right
   and one wrong answer, then save and reload.
3. **Rest of the overworld.** All 11 locations connected, the dev map editor, collision for every
   screen, pet following, the world map.
4. **All six topic zones.** All 24 topic-zone monsters and their effects (tested), all 7 spells,
   XP and levels, unlock order, shop (Laurel Wreath and Bull Calf never for sale, tested), reward
   redemption (typed, camera QR, `#/redeem/` link, once per save, celebration).
5. **Bonus zones and polish.** Portals, taming, weighted mixed questions, both Money Checks with CSV
   export, Progress screen, accessibility pass, lazy loading, size budget, 4× CPU throttle profile.
6. **Deploy** to the host you pick, then play through the live URL at 1024×768, 1920×1080 and iPad
   portrait.

**Budgets:** first load under 10 MB, whole game under 40 MB (the pack imports to about 1.5 MB, so
this should be easy), 60 fps on a mid-range Chromebook at 4× CPU throttle.

## 9. Decisions I need from you

1. **Missing assets:** approve §7, or change any row.
2. **Boss size.** Bosses are 96 px next to the 64 px player (1.5×). Options: 1× everywhere; 2× (192
   px, 3×) everywhere; or **2× in battle and 1× on the overworld** (my recommendation: 192 px is
   more than half the 360 px screen, which crowds the small rooms, but in battle it gives the
   "big boss" feel you asked for).
3. **Customization:** hats and pets only (recommended; works with the fixed wizard), or also plan
   preset characters later.
4. **Question overrides:** keep the 98 drafted fixes (recommended; they cut the "longest answer is
   right" giveaway from 129 to 52 questions). They still need your review before the demo.
5. **The empty git repo in `DECA MoneyQuest/`:** I recommend deleting that empty `.git` and starting
   a new repo inside `game/`. A top-level repo would contain the archive's own `.git` (a repo inside
   a repo) and the asset pack.
6. **Hosting:** I recommend **Netlify**. It deploys from a private repo or a plain folder upload.
   Free GitHub Pages needs a public repo, which would publish the reward secret's source file and
   make printed codes easy to fake.

## 10. Phase log

### Phase 1 — setup and pipelines (done 2026-11-07)
- Step 0 done (§1). The empty top-level `.git` was deleted; the new repo lives in `game/`.
- Scaffold with pinned packages (§5). `tsconfig` is strict, plus no unused locals or parameters.
- **Question importer** (`npm run import:questions`): 180 questions, 98 overrides applied. The
  longest option is the right answer in 52/180 (129 without overrides). It rejects bad field counts,
  duplicate IDs, unknown topics or bands, band letters that don't match the ID, bad answer letters,
  duplicate or empty options, and overrides without a reason or that touch locked fields.
- **Asset importer** (`npm run import:assets`): 11 locations, 40 monster sheets, the player and
  Penny Meadows → 1.6 MB in `public/assets/`. It also copies `monster_attacks.json` into
  `src/data/`. Gaps filled by pixelizing the archived v1 art (§7): 8 pets at 32 px, the Bull Calf
  walk cycle (4 directions × 4 frames, with real right-facing frames), the Laurel Wreath icon, and the
  world map at 640×360. `ASSET_REPORT.md` lists all 296 pack files and the 3 known rough spots.
- **Reward codes:** the two files are byte-identical (tested by SHA-256). All 110 printed codes
  redeem for the right prize; the dashed spelling, lower case, spaces and links also work; each
  code works once per save; the Laurel Wreath and Bull Calf are flagged reward-only.
- **Rendering check:** a temporary page shows every screen at true size with the player, mentor
  and each zone's monsters on their `rooms.json` spots. 1280×720 is a clean 2×; 1024×768 falls
  back to 1.6× scale-to-fit (still sharp).
- Facing check, for Phase 4: most monsters face left. Late Fee Troll and Slacker Golem look like
  they face right; five sprites still need checking. The flip list goes in data then.
- Tests: 31 (question parsing and validation, image helpers, the generated manifest, reward codes,
  canvas zoom).

### Phase 2 — the hub and Piggybank Village, playable (done 2026-11-07)
- **PixelLab (with your OK):** Headmaster and merchant, standard mode, 1 generation each (2 of the
  5 trial generations; 3 left plus the daily bonus). Same settings as the pack's characters. Saved
  in `assets-src/pixellab/` and imported like the pack. They stand still with a 1-pixel bob; the
  shopkeeper in the Piggybank market reuses the merchant sprite.
- **Rooms:** `src/data/rooms/coin_academy.json` and `piggybank_village.json`, seeded by
  `tools/seed-rooms.ts` from the pack's `rooms.json` (640×360, used as-is) plus first-pass collision.
  Placed by hand where rooms.json only describes a spot: merchant by the potion counter, Headmaster
  beside his desk (behind it would need an occlusion layer), Penny Meadows by the cottages,
  Spendling and Jar Muncher in the market, Impulse Magpie by the cottages (one cottages spot is
  spare), King Splurge on the gate's boss spot.
- **Overworld:** walk with arrows/WASD, click or tap to walk, an on-screen arrow pad on touch
  screens; Space/Enter or a tap talks. Exits fade to the next screen. Walking into an unbeaten
  monster starts a battle; beaten ones show ✓ and can be re-fought with Space (half rewards). The
  boss shows 🔒 until the three monsters are beaten. The two darker screens get a slight brighten.
  Facing: west mirrors east; diagonals use the nearest drawn direction; no drawn animation for a
  facing falls back to that rotation image.
- **Battle:** Piggybank battle background at 2×; the wizard's idle, cast and hit animations; the
  monster sheet rows (idle, attack, hit, defeat); King Splurge at 2×. Spells and effects are code
  (pixel beam, sparks, shield ring, flying coins). Damage numbers are real text. A right answer
  shows ✓ and the explanation for 3.5 s (or tap Next); a wrong one shows ✗, the right answer and
  "Why", until "Got it". Piggybank effects: Spendling takes 5 coins, Impulse Magpie's 10 s timer
  (Adventurer only), Jar Muncher eats a shield or takes 3 coins, King Splurge's double hit and his
  8 s rush timer (Explorer: +4 damage instead). Save Shield unlocks by beating King Splurge.
- **Opening flow:** title (3 save slots) → Headmaster's welcome → nickname → level (changeable in
  Settings) → a Money Check placeholder screen (the real test is Phase 5; each save already gets a
  random first form, A or B) → the Great Hall.
- **Settings:** auto read-aloud, quest level, motion (device / less / full), save and quit.
  Read-aloud uses on-device voices only. Sound: no-op `sfx()` and `music()` with call sites in place.
- **Layouts checked:** 1280×720 (2×), 1024×768 (fit), iPad portrait (bars and card below the game).
- **Tests:** 55 unit tests (battle rules and every Piggybank effect, question bags and the miss
  queue, Money Check forms, saves and migrations, rooms: every entry standable and every exit
  reachable). The Playwright smoke test plays title → nickname → Adventurer → Great Hall (talk to
  the merchant) → library (Headmaster) → world map → gate → plaza → market → walks into Spendling →
  one wrong and five right answers → win → reload, with no console errors.
- Build: 3.6 MB (`dist/`), of which art is 1.7 MB.

### Phase 3 — the whole overworld and every monster (done 2026-11-07)
- **All 11 locations connected** (33 screens): room files for the nine other locations, seeded from
  their `rooms.json` with first-pass collision drawn from the art. A checker found two top exits
  that couldn't be reached on foot (Astral Ruins island portal, Sunfire canyon portal); both fixed.
  Tests now prove every entry is standable, every exit reachable, and every exit leads to a real
  screen.
- **All 40 monsters placed** on their zones' spots (you asked to add them now). Moved by hand where
  rooms.json put a spot on lava, water or a prop: Sunfire lava crossing, Stormwatch cliff and beach,
  Nebula pond, and the Lunar Hydra (moved off the moon-pool arrival point). Crossroads had only two
  monster spots, so Doubt Wraith stands with Chaos Sphinx at the observatory. Monsters outside
  Piggybank fight with plain hits until their effects arrive in Phase 4. Facing: all 40 checked;
  none needs flipping.
- **Mentors:** PixelLab made the Borrowers' Bridges, Guildworks and Compound Orchard mentors (3
  generations, with your OK). The trial then ran out (the free daily bonus counts down with paid
  generations), so Stormwatch and Crossroads use the approved fallback: their archived v1 mentors,
  pixelized, until PixelLab can make them. Prompts are saved in `assets-src/pixellab/README.md`.
  Each new mentor has a hello and three tips: **drafts for your review** (`src/data/dialogue.ts`).
- **Portals:** the four portals on the Crossroads portal ring lead to the bonus zones. They open
  after all six bosses (Money Check 2 joins that rule in Phase 5); until then the mentor explains.
  Walking out of a bonus zone puts you back in front of its portal.
- **Bonus-zone questions** mix all six topics, weighted 1 + 2 × (1 − accuracy) toward the weakest
  (tested: a 0% topic comes up about 3× as often as a 100% one).
- **Pet following:** the equipped pet trails a few steps behind. The Bull Calf walks with its own
  4-direction cycle; other pets hop and turn. Pets become obtainable in Phase 4 (shop, reward cards).
- **World map:** each island button now shows its topic and state (★ open, ✓ cleared, 🔒 locked,
  🌀 bonus via the portals).
- **Dev tools (`?dev=1`, dev server only):** every zone open; a **map editor** (draw walk and
  blocked polygons, drag points, entry, NPC, monster, portal and exit markers, then Save, which
  writes `src/data/rooms/<zone>.json` through a dev-only endpoint and reloads back into the same
  room); and a test panel (jump to any screen, equip any pet, +500 coins).
- Tests: 63 unit tests; the smoke test still passes (its walks were lengthened after one flaky run
  on a slow frame rate).

### Phase 4 — all six topic zones, spells, shop and reward cards (done 2026-11-07)
- **Every topic-zone monster effect** is a data rule (`src/data/effectRules.ts`, from the approved
  archive table) run by a rewritten battle engine, with a unit test for each of the 24 monsters:
  coin steals, timers (never for Explorer), splitting, ramping damage, late fees, a chained answer
  (3 taps to free), pot tax, napping, random damage, burn ramp, attacking first, the bubble, a
  weakened spell, pet knock-out, slow, shield breaking, washing away buffs, the catastrophe hit, a
  Whirlpool that swaps the answer buttons, a fake "free tip", inflation, fog, the riddle (double
  damage) and balancing health bars. Burnout Blaze's Anvil Drop is the only plain hit (its effect
  text is "Big single hit"). Bonus-zone effects come with Phase 5.
- **All 7 spells:** Save Shield, Credit Cleanse (clears every debuff and pending trick), Paycheck
  Strike (+3 coins to the pot), Compound Burst (+3 per right answer in a row), Insurance Barrier
  (blocks the next hit over 12), Wise Choice (removes a wrong answer next question). The card shows
  the current spell and its damage; ◂ ▸ or Q/E switch.
- **Insurance Scroll:** Keeper Gale (Stormwatch) offers it for 15 coins, a premium. It cuts Perfect
  Storm to the 6-point deductible (then it's used up) and stops Mishap Crab breaking your shield.
- **Pets in battle:** the equipped pet stands beside you and adds +2 damage (+4 legendary: Bull Calf,
  Professor Owl); Crash Treant can knock it out for the rest of the battle.
- **Hats:** drawn in code as pixel maps (`src/data/hats.ts`): Laurel Wreath (reward), Banker Top Hat,
  Star Wizard Hat, Coin Crown. Each animation frame is measured once to find the top of the head, so
  hats follow the head when walking, turning, casting and in battle.
- **Shop** (Banker Bix in the Great Hall, and the Piggybank shopkeeper): 3 hats and 7 pets for coins
  (prices are drafts). The Laurel Wreath and Bull Calf are never for sale: `buy()` refuses them even
  if called directly (tested). **Bag** (🎒) to wear or swap hats and pets.
- **Reward cards** (🎁): type the code, scan the QR code with the camera (BarcodeDetector on
  Chromebooks, the bundled jsQR on iPads, loaded only when the scanner opens; the camera never
  sends anything), or open a `#/redeem/<code>` link (handled once a save is open). Each code works
  once per save; a celebration shows the prize with "Wear it now" / "Bring it along".
- XP, levels and zone unlock order were already in place (Phases 2–3).
- **Housekeeping:** two unit tests had hardcoded one real printed card code. They now generate codes
  for serial numbers that were never printed, and docs use a placeholder (`MB-W1234-ABCDE`). The
  Phase 1 commit in git history still contains that one printed code (see the note to you).
- Tests: 92 unit tests; two Playwright tests (the smoke test now also checks the shop, and a new
  reward-card test covers the link, a typed dashed code, the celebration and once-per-save).

### Phase 5 — bonus zones, Money Check, progress, accessibility, performance (done 2026-11-07)
- **All 16 bonus-zone monster effects** as data rules with tests: burns over 2 turns (Ember
  Jackal, Solar Wyrm; burns can't knock you out, and Credit Cleanse puts them out), Solar Glare
  (answers appear 2 s late), Cinder Scarab takes half spell damage, Starmoth's 30% nap, Nebula
  Lynx's 25% critical hit (×1.5), Void Sprout steals a buff, Galaxy Stag charges +4, Rune Golem's
  shield (next spell half), Relic Wraith blocks your next spell, Comet Hound attacks first, Astral
  Colossus doubles every 3rd turn (with a countdown), Moonbat scrambles an answer for 3 s
  (read-aloud reads the real text), Crystal Crawler's triple hit, Tide Specter heals 6, and the
  Lunar Hydra: 7 hits, heads fall after 2, 4 and 7, each living head bites for 7.
- **Taming:** the first win over each bonus-zone monster tames it (bosses are legendary pets, +4).
  The importer makes 32 px versions (half the player's height) of all 16; tamed pets follow you and
  fight beside you like the others. Save schema **v2** adds `progress.tamed`, with a v1 → v2
  migration and a test.
- **Money Check:** Money Check 1 runs in the opening flow (after the level choice); the save is
  created first so the result is stored. Questions alternate topics, options are shuffled, nothing
  is marked right or wrong until the end, then a star score per topic and the total. Money Check 2
  opens after all six bosses: the Headmaster offers it (and the Progress screen has a button). It
  shows the improvement per topic and in total. The bonus portals open only after Money Check 2.
- **Progress screen (📊):** accuracy bar per topic, both Money Checks side by side with the change,
  and **Export results (CSV)**: one row per test for every save on the device (nickname, test, date,
  band, form, score per topic, total, improvement), saved as a file on the device.
- **Accessibility:** axe (WCAG 2.1 AA) finds no serious or critical problems on the title,
  onboarding, Money Check, hub, settings, shop, bag, progress, redeem, world map, battle card and
  explanation. A test checks every battle-card button is at least 48 px with 18 px text; the last
  16 px labels were raised to 18 px. Keyboard play covers answering (1–4/A–D by position), spells
  (Q/E), read-aloud (R), dialogue (Space/Enter) and Money Check. Reduced motion skips animations,
  screen shake and confetti.
- **Performance** (production build, measured): first load **0.74 MB** (budget 10 MB), whole game
  **3.9 MB** (budget 40 MB), **60 fps at 4× CPU throttle** on the title, while walking with a pet,
  and during a boss battle; JS heap 27 MB. Each location's screens and monsters load when you enter
  it; jsQR loads only when the camera scanner opens.
- Tests: 111 unit tests; five Playwright tests (smoke, reward cards, end game, two accessibility).

### Cleanup (2026-11-07)
- At your request, deleted the old folders: `_archive/` (the old build, its git history and 355 MB of
  node_modules and caches), the empty `MakeBank Assets/`, and `.playwright-mcp/` screenshots. About
  420 MB freed.
- Before deleting, the ~2 MB of v1 art the importer still uses was copied to `game/assets-src/v1/`
  and the importer now reads it from there. A re-import produced identical art and manifest.

### Scenery layering (2026-11-07)
- You reported walking over rocks and signs in Piggybank Village. Cause: each screen was one
  background image under every sprite, and several blocks were missing or didn't match the art.
- Every screen (all 33) now has **fronts**: outlines around trees, signs, lamps, pillars, fences,
  crystals, arches and bushes. At runtime the object's pixels are cut out of the screen art (a
  flood fill clears the ground inside the outline; black outlines stop it) and drawn at the
  object's base line, so the player, pets, NPCs and monsters go behind it when standing higher up
  the screen and in front when lower. Cut once per screen (about 4 ms, worst 25 ms) and cached.
- Blocks were reworked to match: footprints (trunk, post, base) instead of whole pictures, so you
  can walk under leaves and behind lamps; missing ones were added (the market lamp, the library
  globe and desk, crossroads crystals, rocks on the beach, mushrooms, cacti, bridge posts and more);
  misplaced ones fixed (plaza trees, the lighthouse rope). Arches (Piggybank gate, orchard gate,
  canyon and cave portals) are traced as rings, so you walk under them.
- The `?dev=1` map editor shows fronts (dashed blue) and their base line (purple); edit them in
  the room JSON.
- Tests: front sanity and cut-out unit tests, a reachability flood fill per screen (no block cuts
  off an exit, entry, NPC, monster or portal), and a Playwright test (behind/in front of the gate
  lamp, under the arch, behind a tree, the market lamp is solid). 117 unit tests, six Playwright tests.

### Plaza exits, screen edges and window size (2026-11-07)
- The plaza's left and right exits covered only the top of the path (y 124–160 on a path 130–190),
  so walking along it hit the edge without changing screen: both now cover 126–196. The cottages'
  right exit had the same problem (now 40–112).
- The player could walk behind the fountain right up to the top edge, mostly off screen. New rule
  for every screen: feet stay at least 58 px from the top and 12 px from the sides unless an exit
  leads off that edge. The reachability test now uses the same rule (everything still reachable).
- The canvas now fills the browser window instead of using whole-number zoom (pixels stay sharp
  with `image-rendering: pixelated`; a window wider than 16:9 gets thin side bars). Settings has a
  Full screen button where the browser supports it.
- Playwright test: walking the plaza path left and right changes screen; walking up stops on screen.

