<!-- Copied from ../assets_v2 by tools/import-assets.ts. Do not edit. -->
# assets_v2 QA report (2026-11-15)

Checked by `_tools/qa/qa.py` on the merged tree: 4,057 files and 1.4 GB of masters. `manifest.json` indexes every file.

## Passed

- **Manifests:** every path in every pack manifest exists.
- **Naming:** all file names are lowercase kebab-case.
- **Images:** no unreadable images and no empty sprites. Every overworld sprite has a real alpha channel.
- **Contrast:** every UI text/background pair is at least 7:1 (`ui/contrast-audit.json`).
- **TypeScript:** the UI kit compiles under strict `tsc`.
- **VFX:** none of the 14 effects touches its frame edge.
- **District maps:** all 8 have exits that line up, collision maps, and a boss door and teleport arrival in `<district>.json`. I checked each preview by eye.

## Fixed during QA

- Removed stray edge fragments from 8 sprites, which were slivers of a neighbouring view left over from the sheet cut. Backups are kept outside the tree. Affected sprites:
  - budget-breaker frostvault: back, left, right
  - impulse-wisp compound-rift: front, left, right
  - splurge-hound frostvault: left, right
- `manifest-phase5-monsters-checkin.json` overlapped the newer `mlooks` packs for 20 raptor files. `manifest.json` now ignores it.

## Known minor items (not fixed)

- Six sprites still touch an edge where a thin tip was clipped in the source sheet. These are a wingtip on the Volatility Roc front view, a breath puff on budget-breaker frostvault back, the tail on impulse-wisp compound-rift back/left/right, and the tail on splurge-hound frostvault back. They read fine at game size. Regenerate those looks if they bother you.
- Three legendary hats (circlet, frost tiara, goggles) have small green gems, 2–3% of their pixels. That's within the "money and success" spirit for legendary items, but you can recolour them to cyan if you want green strictly for coins.
- 165 "edge" flags are portraits and tightly trimmed hats, which are cropped that way on purpose.
- The 4K world map was resized with Lanczos, not an AI upscaler, so it is a little soft at full size.

## Runtime budget (measured by re-encoding samples to WebP)

| Group | Shipped as | ≈ MB |
|---|---|---|
| Monster views (448) | 128 px WebP | 3.9 |
| Monster portraits (112) | 160 px | 1.2 |
| Boss views (40) | 384 px | 1.6 |
| NPC views (70) | 344 px | 1.5 |
| Hats (500) | 128 px | 3.3 |
| Props (109) | @1x | 2.8 |
| District screen layers (74) | 1080p ground + overhang | 3.7 |
| Battle bg @1x, VFX, map 720/1080, UI | as is | 4.2 |
| Animation WebM (as delivered, 720 px) | as is | 26.0 |
| **Total** | | **≈ 48** |

That total is over the 40 MB budget only because the animation clips are 720 px. Re-encoding them at 384 px (2× the 192 px battle size) brings them to about 7–8 MB, for a whole-game total of about 30 MB. The first load, which covers Ledgerhold, the avatar, starting hats, the UI, VFX and the 720p map, comes to roughly 6–8 MB. Load each district's monsters, screens and boss lazily.

In `manifest.json`, `runtime: false` marks sources, tool scripts, green-screen masters, MP4 masters, per-instance object renders (props placed from `objects.json` cover them), previews and set-aside pets.


## Avatar update (2026-11-15, later the same day)

What changed, as approved:
- **One unisex body.** It replaces the male and female bodies; body types are dropped.
- **One design per hat.** Each hat keeps its rare-tier art, with rarity shown as a UI label.
- **Prodigy-style hair rules.** Covering hats swap to the neat cut; ornaments keep the player's hair.
- **Long hair covers the ears.**
- **Hats redrawn worn on the head.**
- **Costume colour sets** replace armour.

The male and female stills and clips, and every hat's other tiers and male/female fits, moved to `_set-aside/` (not deleted).

Checked:
- **Hats on looks:** all 25 hats were composited on four looks (afro, long blonde, neat short, box braids from behind) and checked by eye. See `_review/headgear-unisex-all.jpg`.
- **Clips:** all 9 unisex clips keep the whole body in frame at the same scale. Hit and cheer were regenerated because the first takes zoomed in and cut off the feet.
- **Head track:** every clip has a head track with no missed frames. Head width varies by less than 6% across a clip.
- **Combined looks:** `_review/avatar-unisex-clips-looks.jpg` shows one frame per clip with a different hair, face, colour set and hat each, placed from the head track the way the game would.
- **Colour sets:** the colour-set recolour leaves skin, hair, gold and the charcoal trousers alone on stills and on video frames.

Fixed along the way:
- **Hat cut-outs:** stray head-outline and hair strokes from the worn renders were removed (`_tools/clean_hat.py` logic).
- **Hat bands:** notches that let hair show through hat bands were closed.
- **Afro:** it was redrawn twice so the hairline sits above the eyes, and one ear that peeked through was covered.
- **Halo:** it floats above tall hair (`placementNote` in its JSON).
- **Video marks:** a mouth and sweat drop the video model drew on the faceless head in the defeat clip were painted out.

Known minor items:
- **Ranger hat looks like the wizard hat.** Its rare-tier design is a pointed, buckled hat, close to the wizard hat. A redesign would make the shop more varied.
- **Small hair flecks.** On a few caps (bandana, beret, tricorn) a few pixels of hair show at the band edge at full size. They are invisible at the 64 px sprite size.
- **Big hair can hide raised hands.** Hair draws over the body, so the afro and braids can cover fists raised to the head in the cheer clip.
- **Chin speck in defeat.** One faint speck from the painted-out mouth remains at the chin in a few defeat frames.
- **Older hairstyles.** Curly undercut, high ponytail and spiky still use the earlier art. They don't cover the ears, which matches those styles.

Budget effect: avatar clips drop from 18 to 9 (−13 MB of WebM). Hat views drop from 500 to 50, so hats now ship at about 0.4 MB. The costume sets cost nothing extra at runtime because they are a recolour.