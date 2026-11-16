<!-- Copied from ../assets_v2 by tools/import-assets.ts. Do not edit. -->
# MoneyQuest assets_v2 style guide

This guide covers the second art set for MoneyQuest (play.nhsqa.org). Every file lives in `assets_v2/`. `manifest.json` lists each one with its size, hash and metadata. Use this guide to make new art that fits the set, and to place the existing art in the game correctly.

## 1. The look

The style is flat, bold vector cartoon. Think of a kid-friendly fantasy RPG drawn as clean stickers:

- thick dark-navy outlines around every shape (about 3% of the sprite height)
- flat cel shading with one shadow tone and one highlight tone, and no soft airbrush gradients
- big readable silhouettes, chunky proportions, friendly faces (monsters can look grumpy but never gory)
- a three-quarter view seen slightly from above for everything on the overworld, and a side view for battle backgrounds
- no text in any image: no letters on signs, banners, books or screens. Words are always drawn by the game in Fredoka.

## 2. Palette

| Token | Hex | Use |
|---|---|---|
| navy-950 | `#070F22` | outlines, deepest shadow |
| navy-900 | `#0B1630` | screen background |
| navy-800 | `#12224A` | panels |
| navy-700 | `#1B3166` | raised panels |
| slate-600 | `#3A4D73` | stone, metal shadow, disabled |
| slate-400 | `#8A9CC0` | stone, metal |
| glacier-50 | `#F2F8FF` | text, snow, highlights |
| glacier-200 | `#D6F4FF` | ice |
| cyan-400 | `#00E5FF` | magic, glow, primary buttons, player HP |
| violet-400 | `#965CFF` | magic accents, XP, wrong-answer border |
| **acid** | `#9CFF3A` | **money and success only** |
| **gold** | `#FFC83C` | **sharp accents only** |
| fire | `#FF8A1E` | fire looks, enemy HP |

Two hard rules:

1. **Acid green means money or success.** Use it for coins, correct answers, cleared map pins, Buy buttons and the heal effect. Nowhere else. Leaves, grass and slime are teal or blue-green, never acid. The QA pass flags sprites where more than 2% of the visible pixels are acid-like green.
2. **Gold is a sharp accent.** It goes on spire tips, trims, legendary badges and coins. It never fills a large area, and gold text never sits on a light background.

A wrong answer is never red. It uses violet, a dashed border and a ✗ icon.

## 3. World structure

The continent of **Vaultspire** has the wizard city **Ledgerhold** at its centre and seven districts around it. Each district has a boss and two monster species. They are listed in play order, and the world map goes clockwise from the bottom-left.

| # | District | Theme | Boss (animal) | Monsters |
|---|---|---|---|---|
| 1 | Coinfall Docks | rainy night harbour, sea teal | Overspend Kraken (octopus) | budget-breaker, subscription-swarm |
| 2 | The Sprawl | violet night market, lanterns | Splurge Peacock (peacock) | impulse-wisp, splurge-hound |
| 3 | Frostvault | glacier vault city, ice white | Frostfang Mammoth (mammoth) | inflation-shade, overdraft-golem |
| 4 | Credit Citadel | obsidian fortress, violet storm | Collector Scorpion (scorpion) | late-fee-raptor, minimum-payment-leech |
| 5 | Compound Rift | floating islands, cosmic rings | Compound Leviathan (whale/manta) | apr-serpent, rug-pull-mimic |
| 6 | The Exchange | storm trading spire, steel blue | Volatility Roc (thunderbird) | hype-bull, panic-bear |
| 7 | Phish Fens | foggy glitch marsh, deep teal | Phish Queen (spider) | phish-lurker, identity-wraith |
| final | Ledgerhold arena | wizard city, violet and cyan sky | Debt Dragon (dragon) | none |

Bosses are designed to look unlike their district's monsters. Each one is built on a different animal and a different silhouette.

## 4. Asset families and how to place them

**Monsters** (`monsters/<species>/<look>/`). There are 14 species with 8 looks each: their home district, the other six districts, and `fire` (classic orange fire). Each look has front, back, left and right views, a portrait, and a `green-1024` master that is not shipped. Anchor them at the bottom centre. Motion is code-only, defined in `monsters/motion-spec.json` (idle, follow, attack, hit, shatter). Monsters double as pets.

**Bosses** (`bosses/<boss>/`). There are front, back, left and right views and a portrait. Animated idle and attack clips are in `animations/bosses/<boss>/<clip>/` as WebM with alpha, a 16-frame sheet and JSON. Draw bosses at 1× (96 px) on the overworld and 2× (192 px) in battle.

**NPCs** (`npcs/`, `animations/npcs`). These have views, portraits and talk clips.

**The avatar** (`avatars/unisex/`, `animations/avatars/unisex/`). There is one unisex body (front and back). The game builds a player's look in layers: the body or a clip frame, then the hair, the face and any hat on top. `avatars/unisex/options.json` lists the skin tones, eye colours, hair colours, the 7 hairstyles and the 6 faces. Hair layers are grey and get tinted (pixel / 215 × hair colour). Every layer is stored in head-template coordinates (`rig/front/head.png`, `rig/back/head.png`). To place one, scale it by head width / template head width and line it up on the crown and centre line. Each clip's JSON carries a per-frame head track (`head.frames` holds the top, centre x and width for each frame), so hair and hats follow the head through all 9 clips: idle, walk, attack, hit, cheer, nod, victory, defeat and walk-back. Long hair (long-straight, box braids, afro) covers the ears.

**Costume colour sets** (`avatars/costume-sets/`). There are 8 palette swaps of the one costume: Arcane Blue (default), Ember Knight, Frost Guard, Forest Ranger, Royal Amethyst, Sunburst, Shadow Rogue and Coral Tide. `costume_sets.json` groups the cape, tunic, trim and boots by hue and shifts each group, so outlines and shading stay. Skin, hair, gold accents and the charcoal trousers are never touched. Use it at load time on stills, clip frames or sprite sheets (`_tools/recolor.py` is the reference version). The `stills/` folder has a front and back of each set for the shop.

**Hats** (`accessories/head/<hat>/`). There are 25 hats with one design each. Every hat was redrawn worn on the unisex head and cut out, so it sits on the head rather than floating above it. `hat-<hat>.json` gives its front and back views (in head-template coordinates), the `rarity` shown in the shop (common, rare, epic or legendary) and its `hairRule`. Hair rules follow Prodigy:
- **swap**: brimmed hats and caps cover the head, so the game draws the short "neat" cut under them instead of the chosen style. That way no hair pokes through the hat.
- **show**: ornaments (crowns, headbands, ears, antlers, the halo, goggles) keep the player's own hair and sit on it.

The halo floats higher over tall hair (see its `placementNote`). The Laurel Wreath (`hat-laurel`) and the Bull Calf pet are reward-only: they exist and are visible, but are never sold. The `source/` folders are not shipped.

**Districts** (`locations/<district>/`, `props/<district>/`). Each district is a 2×2 grid of screens: waystone landing (0-0), landmark square (0-1), wilds (1-0) and boss lair (1-1). `<district>.json` gives exits, the teleport arrival point, the boss door and monster spawns. Props come as @1x and @2x WebP with depth-sort anchors. Ledgerhold uses the same format.

**Battle backgrounds** (`backgrounds/battle/<district>/`). These are 16:9 side views at 2560 and 1280 px. The floor fills the bottom 30%. `battle-layout.json` gives the floor line, where the player stands (x 0.24) and where the enemy stands (x 0.74).

**World map** (`world-map/`). This is 16:9 at 4K, 1080p and 720p. `world-map.json` gives pin positions as fractions of the image, click radii, bosses and arrival screens. Pins, labels, locks and the player marker are drawn by the UI kit.

**VFX** (`vfx/`). There are 14 strips of 12 frames at 256 px, each with JSON (fps, loop, Phaser config). They are drawn in code by `_tools/vfx/vfx.py`, so the colours and outline weight match this guide exactly.

**UI** (`ui/`). The UI is code, not images: `tokens.json` (the source of truth), `tokens.css`, `mq-ui.css`, React components in `ui/components/`, a contrast audit and a preview page.

## 5. Accessibility

- Text is Fredoka at 18 px or larger. It is never baked into art.
- Contrast is at least 4.5:1. Every pairing in the UI kit measures at least 7:1 (`ui/contrast-audit.json`).
- Touch targets are at least 48 px. Answer buttons are 64 px tall.
- Every correct or wrong state has a ✓ or ✗ icon, so colour never carries the meaning alone.
- `prefers-reduced-motion` turns off UI animation. For VFX, show only the middle frame for about 200 ms.

## 6. Making new art that fits

The recipe that produced this set:

- **Model:** Higgsfield `gpt_image_2_6`, quality medium, 2k, 16:9.
- **Background:** transparent for sprites, opaque for scenes.
- **References:** always pass the master style reference (media `56f7d86e-245e-4766-8527-1abb1b7baf16`) plus one finished asset from the same family as a second reference.
- **Prompt opening:** start with *"…matching the reference images' flat bold vector cartoon style: thick dark-navy outlines, flat cel shading, cool palette"* and end with *"no text, no shadows"* for sprites.
- **Multi-view sprites:** ask for one sheet with the views spaced well apart. Then cut it with the valley-split cutter (`monsters/_tools`), which keeps a pixel margin and removes stray pieces.
- **Animation:** Seedance 2.5 omni-reference, start frame = end frame = the green-screen master, 1:1 720p 4 s, with *"every part stays fully inside the frame"*. Then key it to WebM with alpha.
- **After every batch:** run the QA script (`_tools/qa/qa.py`) and look at the `_review/` contact sheets before shipping.

## 7. Performance budget

The game budget is under 10 MB for the first load and under 40 MB in total. `assets_v2` holds full-resolution masters, about 1.4 GB, so the game must ship a runtime export, not this folder. Export plan:

- Monsters and pets: front, back, left and right as WebP at 2× display size (128 px tall). Load the 8 looks per species lazily, by district.
- Bosses: 192 px views plus the 16-frame sheet. Leave out the master MP4s.
- District screens and props: @1x WebP for 1080p screens. Load by district.
- Battle backgrounds: the 1280 version for Chromebooks and the 2560 version for iPads and large screens.
- First load: Ledgerhold, the avatar, the starting hats, the UI kit and VFX, and the 720p world map. That is well under 10 MB once exported.

The `runtime` flag in `manifest.json` marks which files are candidates for that export. `QA_REPORT.md` has the measured numbers: about 48 MB with the 720 px animation clips as delivered, and about 30 MB once the clips are re-encoded at 384 px.
