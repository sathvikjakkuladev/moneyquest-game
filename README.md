# MoneyQuest

A pixel-art browser RPG that teaches personal finance to kids in grades K–8 (DECA Financial
Literacy Project). See `PLAN.md` for the design, `CLAUDE.md` for project rules, `ASSET_REPORT.md`
for every art file, and `docs/AI_USE.md` for the AI-use disclosure.

```sh
npm install
npm run dev          # local dev server
npm run build        # type-check + static build into dist/
npm test             # unit tests
npm run e2e          # Playwright smoke test (Google Chrome)
```

## Data pipeline

The question bank and asset pack live one folder up and are never modified.

```sh
npm run import:questions   # ../make-bank-question-bank.csv + src/data/question-overrides.json → src/data/questions.json
npm run import:assets      # ../MoneyQuest Assets/ → public/assets/, src/assets/manifest.json, ASSET_REPORT.md
```

Generated files are committed, so a hosting service can build without the asset pack. The printed
reward-card lists used by the tests (`tests/fixtures/reward-cards/`) are kept out of git on purpose.
