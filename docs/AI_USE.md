# AI use disclosure

MoneyQuest was made with help from AI tools. DECA requires this list of which tool made what. It is
updated at the end of every build phase.

| Part of the project | Made with | What the student did |
|---|---|---|
| Pixel art for all 11 locations (screens and battle backgrounds), the player wizard and the Piggybank mentor (`MoneyQuest Assets/`) | **PixelLab** (AI pixel-art generator). Every job is listed in `MoneyQuest Assets/locations/_job_log.txt` | Wrote the prompts, chose the results, planned the screen layouts |
| Headmaster and merchant pixel characters (`assets-src/pixellab/`) | **PixelLab** (standard mode, 2026-11-07; character IDs in `assets-src/pixellab/README.md`) | Approved the prompts and the generations |
| Monster sprite sheets (`MoneyQuest Assets/monsters/`) | Made by a script (`_tools/make_monster_sheets.py`) from monster art originally generated with **Meta AI**; no new art generated | Created the original art with Meta AI, ran the script |
| Pets, the Bull Calf, the Laurel Wreath icon and the world map | Originally generated with **Meta AI** (v1 art), turned into pixel art by the asset importer's code (`tools/import-assets.ts`, written by Claude Code) | Created the original art with Meta AI |
| Question bank: 180 questions with answers and explanations (`make-bank-question-bank.csv`) | **Claude** (Anthropic) | Chose the topics and grade bands, reviewed the questions |
| Question fixes (`src/data/question-overrides.json`, 98 entries) | **Claude Code**, drafted for student review | Reviews and approves every change |
| Mentor tips and NPC lines (`src/data/dialogue.ts`) | **Claude Code**, drafted for student review | Reviews for accuracy |
| Game code, build tools, tests, documentation (`game/`) | **Claude Code** (Anthropic) | Wrote the design brief, made the gameplay decisions, playtests each phase |
| Reward-card codes (`src/rewards/rewardCodes.ts`, `rewardSecret.ts`) | Copied unchanged from the student's earlier MakeBank project (also built with Claude Code) | Printed and handed out the 110 cards |

## Not AI-made

- Font: [Fredoka](https://fonts.google.com/specimen/Fredoka) (SIL Open Font License), bundled locally.
- Libraries: Phaser, React, Zustand, Tailwind CSS, Vite, Vitest, Playwright, sharp (all open source).

## How accuracy is checked

- The question importer rejects any malformed row (field count, IDs, topic, band, answer letter,
  duplicate options) and writes nothing if anything is wrong.
- All 110 printed reward codes are tested against the code checker.
- The student reviews all AI-written learning text before the demo.
