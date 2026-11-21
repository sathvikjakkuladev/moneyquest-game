# AI use disclosure

MoneyQuest was made with help from AI tools. DECA requires this list of which tool made what. It is
updated at the end of every build phase.

| Part of the project | Made with | What the student did |
|---|---|---|
| Pixel art for all 11 locations (screens and battle backgrounds), the player wizard and the Piggybank mentor (`MoneyQuest Assets/`) | **PixelLab** (AI pixel-art generator). Every job is listed in `MoneyQuest Assets/locations/_job_log.txt` | Wrote the prompts, chose the results, planned the screen layouts |
| Headmaster, merchant and three zone mentors, pixel characters (`assets-src/pixellab/`) | **PixelLab** (standard mode, 2026-11-07; character IDs in `assets-src/pixellab/README.md`) | Approved the prompts and the generations |
| Monster sprite sheets (`MoneyQuest Assets/monsters/`) | Made by a script (`_tools/make_monster_sheets.py`) from monster art originally generated with **Meta AI**; no new art generated | Created the original art with Meta AI, ran the script |
| Pets, the Bull Calf, the Laurel Wreath icon, the world map, and stand-in Stormwatch and Crossroads mentors; 32 px tamed-pet versions of the bonus monsters | Originally generated with **Meta AI** (v1 art), turned into pixel art by the asset importer's code (`tools/import-assets.ts`, written by Claude Code) | Created the original art with Meta AI |
| Question bank: 180 questions with answers and explanations (`make-bank-question-bank.csv`) | **Claude** (Anthropic) | Chose the topics and grade bands, reviewed the questions |
| Question fixes (`src/data/question-overrides.json`, 98 entries) | **Claude Code**, drafted for student review | Reviews and approves every change |
| Mentor tips and NPC lines (`src/data/dialogue.ts`) | **Claude Code**, drafted for student review | Reviews for accuracy |
| Spell effects drawn in code (the first build's code-drawn hats were replaced by the art set's hats) | **Claude Code** | Approved the look |
| Monster attack effects and spell effects drawn in code (`src/game/attackFx.ts`: one effect per attack and per spell); charged-spell costs and damage (`src/core/spells.ts`) | **Claude Code**, from the student's requests (2026-11-17) | Asked for them, chose "spells cost more" and "charge is kept", playtests the look and balance |
| Monster effect rules (`src/data/effectRules.ts`) | **Claude Code**, from the effect table the student approved | Approved the rules |
| Room layouts (`src/data/rooms/*.json`): seeded from the art set's exits and collision; NPC, monster and waystone placement | **Claude Code** (`tools/seed-rooms.ts`) | Playtests the result |
| Multiplayer server (`server/`), the /teacher page and the class-join flow | **Claude Code**, from the student's multiplayer brief (`MULTIPLAYER_PROMPT.md`) and decisions | Wrote the brief, made the decisions (server address, sign-in, world-mode default, leaderboards, retention, names, reports), tests each phase |
| Open world for players without a class (guest tokens, `server/src/guests.ts`, `src/net/session.ts`) and its privacy-policy wording | **Claude Code**, at the student's request (2026-11-17); policy text drafted for NHSQA to review | Chose the open world over class-only world mode, deploys the server |
| Avatar walk steadying and hair-seam fixes in the avatar baker (`src/game/avatarBake.ts`) | **Claude Code**, at the student's request (2026-11-21) | Judged the walk from before/after recordings and chose the step speed |
| Public-name word lists (`src/net/names.ts`) | **Claude Code**, drafted for student review | Reviews the words |
| Emotes and preset phrases (`src/net/says.ts`) | **Claude Code**, drafted for student review | Reviews the wording |
| Privacy policy and teacher notice (`public/privacy/`, `public/teacher-notice/`) | **Claude Code**, drafted for NHSQA to review; not legal advice | NHSQA reviews them (contact: nhsqa01@gmail.com) |
| Vaultspire art set (`../assets_v2`: screens, props, monsters, bosses, NPCs, the avatar, hats, VFX, UI kit; the 2026-11-16 rebuild) | **Higgsfield** (GPT Image 2 for images, Seedance for the clips), directed by **Claude**; cut-outs, recolours and packing by scripts Claude wrote | Chose the style ("Style A"), approved every set of prompts and reviewed the results |
| Monster names come from the art set; their attack text and lessons (`src/data/monster-roster.json`) | **Claude Code**, drafted for student review | Reviews for accuracy |
| Topic-to-district mapping, hat rarities and prices, colour-set names | **Claude Code**, drafted for student review | Reviews and can change them |
| Game code, build tools, tests, documentation (`game/`) | **Claude Code** (Anthropic) | Wrote the design brief, made the gameplay decisions, playtests each phase |
| Reward-card codes (`src/rewards/rewardCodes.ts`, `rewardSecret.ts`) | Copied unchanged from the student's earlier MakeBank project (also built with Claude Code) | Printed and handed out the 110 cards |

## Not AI-made

- Font: [Fredoka](https://fonts.google.com/specimen/Fredoka) (SIL Open Font License), bundled locally.
- Libraries: Phaser, React, Zustand, Tailwind CSS, Vite, Vitest, Playwright, sharp (all open source).
- The old pixel art (PixelLab and pixelized Meta AI art) is no longer shipped; it stays in git history
  and in `assets-src/v1/`.

## How accuracy is checked

- The question importer rejects any malformed row (field count, IDs, topic, band, answer letter,
  duplicate options) and writes nothing if anything is wrong.
- All 110 printed reward codes are tested against the code checker.
- Money Check scoring and the CSV export are unit-tested; the export contains only nicknames.
- Every screen is checked with axe (WCAG 2.1 AA) for contrast, labels and roles.
- The student reviews all AI-written learning text before the demo.
