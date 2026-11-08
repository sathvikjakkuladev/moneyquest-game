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
| Hat pixel art (`src/data/hats.ts`) and spell effects | Drawn in code by **Claude Code** | Chose the hats and approved the look |
| Monster effect rules (`src/data/effectRules.ts`) | **Claude Code**, from the effect table the student approved | Approved the rules |
| Scenery layering: the outlines and footprints in `src/data/rooms/*.json` (which parts of each screen draw over the player) | **Claude Code**, traced by checking each screen | Reported the problem; playtests the result |
| Multiplayer server (`server/`), the /teacher page and the class-join flow | **Claude Code**, from the student's multiplayer brief (`MULTIPLAYER_PROMPT.md`) and decisions | Wrote the brief, made the decisions (server address, sign-in, world-mode default, leaderboards, retention, names, reports), tests each phase |
| Public-name word lists (`src/net/names.ts`) | **Claude Code**, drafted for student review | Reviews the words |
| Emotes and preset phrases (`src/net/says.ts`) | **Claude Code**, drafted for student review | Reviews the wording |
| Game code, build tools, tests, documentation (`game/`) | **Claude Code** (Anthropic) | Wrote the design brief, made the gameplay decisions, playtests each phase |
| Reward-card codes (`src/rewards/rewardCodes.ts`, `rewardSecret.ts`) | Copied unchanged from the student's earlier MakeBank project (also built with Claude Code) | Printed and handed out the 110 cards |

## Not AI-made

- Font: [Fredoka](https://fonts.google.com/specimen/Fredoka) (SIL Open Font License), bundled locally.
- Libraries: Phaser, React, Zustand, Tailwind CSS, Vite, Vitest, Playwright, sharp (all open source).

## How accuracy is checked

- The question importer rejects any malformed row (field count, IDs, topic, band, answer letter,
  duplicate options) and writes nothing if anything is wrong.
- All 110 printed reward codes are tested against the code checker.
- Money Check scoring and the CSV export are unit-tested; the export contains only nicknames.
- Every screen is checked with axe (WCAG 2.1 AA) for contrast, labels and roles.
- The student reviews all AI-written learning text before the demo.
