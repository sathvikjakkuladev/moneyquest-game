<!-- Copied from ../assets_v2 by tools/import-assets.ts. Do not edit. -->
# MoneyQuest v2 UI kit (UI as code)

No UI images: every panel, button, bar, pin and icon is CSS plus inline SVG, so it stays sharp at any size and is easy to theme.

- `tokens.json`: the source of truth. `tokens.css` and `tokens.ts` are generated from it.
- `mq-ui.css`: the component styles (`.mq-panel`, `.mq-btn`, `.mq-answer`, `.mq-bar`, `.mq-pips`, `.mq-coins`, `.mq-dialog`, `.mq-toast`, `.mq-badge`, `.mq-pin`).
- `components/kit.tsx`: React components (Panel, Button, ReadAloudButton, AnswerOption, AnswerGrid with 1–4 / A–D keys, Bar, HitPips, CoinCounter, Dialogue, Toast, Badge, MapPin). They have no dependencies besides React and pass a strict `tsc` check.
- `components/icons.tsx`: the ✓, ✗, coin, speaker and lock icons.
- `contrast-audit.json`: WCAG contrast ratios for every text/background pair used. All of them are 7:1 or higher.
- `preview/index.html`: a static preview. Fredoka woff2 files are included only so the preview renders; the game already bundles its own copy.

Colour rules:
- Acid green (#9CFF3A) is only for money and success: coins, correct answers, cleared pins, Buy buttons.
- Gold is only for sharp accents.
- A wrong answer uses violet with a dashed border and a ✗. It is never red and never relies on colour alone.
- HP is cyan for the player and fire orange for enemies. XP is violet.

Accessibility:
- Text is at least 18px and every target is at least 48px.
- Focus rings are visible.
- `prefers-reduced-motion` turns off every animation and transition.
- Read-aloud uses on-device `speechSynthesis` only.
