<!-- Copied from ../assets_v2 by tools/import-assets.ts. Do not edit. -->
# Avatar update (2026-11-15)

This zip replaces the avatar, hat and avatar-animation parts of `assets_v2`. Copy its folders over your copy of `assets_v2`, letting them replace what's there. Everything else in `assets_v2` (monsters, bosses, districts, UI, VFX, world map) is unchanged.

## What's new

- **One unisex body:** `avatars/unisex/`, front and back. It replaces the male and female bodies. Body types are gone.
- **Customizer pieces:** these sit next to the body in `avatars/unisex/`:
  - `rig/` holds the head templates every layer is measured against.
  - `layers/` holds the hair (7 styles, front and back) and the faces (6).
  - `options.json` lists skin, eye and hair colours, style names and faces.
  - `_tools/overlay.py` is the reference compositor.
- **Long hair covers the ears:** long-straight, box braids and afro.
- **Nine animation clips for the unisex body:** `animations/avatars/unisex/` has idle, walk, attack, hit, cheer, nod, victory, defeat and walk-back. Each clip comes as WebM with alpha, a 16-frame sheet, JSON and the green-screen master. Each JSON has a per-frame head track (`head.frames`), so the game can draw hair, face and hat on every frame.
- **25 hats, one design each:** `accessories/head/<hat>/hat-<hat>.json`. Each hat was redrawn worn on the unisex head. The JSON gives:
  - `rarity` (common, rare, epic or legendary), shown in the shop.
  - `hairRule`: **swap** means a covering hat draws the neat under-hat cut; **show** means an ornament keeps the player's hair, the way Prodigy does it.
  - `rewardOnly`: true for the Laurel Wreath.
- **8 costume colour sets:** `avatars/costume-sets/`. `costume_sets.json` recolours the cape, tunic, trim and boots by hue. It works on stills, clip frames or sheets at load time; `_tools/recolor.py` is the reference version. `stills/` has a front and back of each set for the shop.

## Draft decisions to check

- **Rarity labels.** Each hat's rarity label is my draft. Change `rarity` in the hat JSON to match the game's price table.
- **Colour-set names.** The names (Ember Knight, Frost Guard and so on) are drafts too.

## Moved, not deleted

`_set-aside/` holds the male and female stills and clips, every hat's common, epic and legendary tiers, the male and female hat fits, and the old fitting tools. It is in a separate zip.

## Look first

- `_review/headgear-unisex-all.jpg` shows all 25 hats, front and back, on different looks.
- `_review/avatar-unisex-clips-looks.jpg` shows one frame of each clip with a different hair, face, colour set and hat.
- `_review/costume-sets.jpg` shows the 8 colour sets.

`QA_REPORT.md` (last section) lists what was checked, what was fixed, and the small known issues.
