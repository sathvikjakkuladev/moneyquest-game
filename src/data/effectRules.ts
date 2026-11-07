// What each monster attack's special effect does, as data (PLAN.md §3, from the archive's approved
// effect table). Attack names, effect text and damage come from monster_attacks.json; this file only
// maps each attack to a rule, so it can be reviewed on its own. One entry per attack, in JSON order
// (a boss's second attack is index 1). ★ marks a rule that interprets or simplifies the text.

export type EffectRule =
  | { kind: 'plain' }
  /** On a hit, take coins from the wallet (never below zero). */
  | { kind: 'stealCoins'; amount: number }
  /** Adventurer: if the answer takes longer than `seconds`, the monster strikes once first. Explorer: nothing. */
  | { kind: 'slowStrike'; seconds: number }
  /** On a hit, eat the player's shield; with no shield up, take `elseCoins` coins instead. */
  | { kind: 'eatShield'; elseCoins: number }
  /** On a hit, strike `hits` times (with `chance` < 1, only sometimes). */
  | { kind: 'multiHit'; hits: number; chance?: number }
  /** Adventurer: a `seconds` timer next turn (running out counts as wrong). Explorer: next hit +`explorerBonus`. */
  | { kind: 'rushNextTurn'; seconds: number; explorerBonus: number }
  /** If still alive after `turns` turns, a second copy appears: +50% HP and hits ×1.5. */
  | { kind: 'split'; turns: number }
  /** Each wrong answer (the monster "ignored") permanently adds `step` damage. */
  | { kind: 'rampOnMiss'; step: number }
  /** Adventurer: +`extra` damage if the answer took longer than `seconds`. ★ Explorer: nothing (no slow penalty for young readers). */
  | { kind: 'latePenalty'; seconds: number; extra: number }
  /** ★ Next turn one random answer is chained and needs 3 taps to free (a chained *wrong* answer would be a free hint). */
  | { kind: 'lockAnswer' }
  /** Takes `percent`% of this battle's coin pot. */
  | { kind: 'potTax'; percent: number }
  /** ★ Next turn you're napping: a right answer only wakes you (no damage). With `chance`, only sometimes. */
  | { kind: 'napNext'; chance?: number }
  /** Damage is random from `min` to `max`. */
  | { kind: 'randomDamage'; min: number; max: number }
  /** Each turn: +`step` damage, but the monster loses `selfDamage` HP. */
  | { kind: 'burnRamp'; step: number; selfDamage: number }
  /** ★ One free strike when the battle starts. */
  | { kind: 'attacksFirst' }
  /** ★ A wrong answer grows the bubble (no damage); at `popAt` it pops for full damage. A right answer shrinks it. */
  | { kind: 'bubble'; popAt: number }
  /** Your next spell does `percent`% damage. */
  | { kind: 'weakenSpell'; percent: number }
  /** Knocks your pet out for the rest of the battle; with no pet, +`elseExtra` damage. */
  | { kind: 'hitsPet'; elseExtra: number }
  /** ★ Spells do 25% less damage for `turns` turns. */
  | { kind: 'slow'; turns: number }
  /** ★ Breaks your shield and hits +`extra` harder, unless you're insured (scroll or Insurance Barrier). */
  | { kind: 'breakShieldUninsured'; extra: number }
  /** Washes away one of your buffs (shield, barrier, Wise Choice, streak). */
  | { kind: 'removeBuff' }
  /** ★ A huge hit cut to `insuredDamage` if you're insured (Insurance Scroll or Insurance Barrier). */
  | { kind: 'catastrophe'; insuredDamage: number }
  /** Next turn the answer buttons swap places once, 2 seconds in (keys follow what you see). */
  | { kind: 'shuffleAnswers' }
  /** Next turn a flashy fake "FREE TIP" points at a wrong answer, labelled "Too good to be true?". */
  | { kind: 'fakeHint' }
  /** Each wrong answer shrinks this battle's coin pot by `percent`% (to no less than half). */
  | { kind: 'inflation'; percent: number }
  /** ★ Next turn one answer is hidden in fog; tap it to clear (the text stays readable when shown). */
  | { kind: 'fogAnswer' }
  /** Next question is a RIDDLE: a wrong answer does double damage. */
  | { kind: 'riddle' }
  /** Both health bars move halfway toward their average percentage. */
  | { kind: 'balanceHp' }
  /** After the hit, you burn for `damage` at the start of each of the next `turns` turns (never down to 0). */
  | { kind: 'burn'; damage: number; turns: number }
  /** ★ Next turn the answers appear 2 seconds late (fading text would break contrast for young readers). */
  | { kind: 'glare' }
  /** Hard to hit: always takes half spell damage. */
  | { kind: 'halfSpells' }
  /** `chance` of a critical hit for ×`mult` damage. */
  | { kind: 'crit'; chance: number; mult: number }
  /** ★ It raises a shield for itself: your next spell does `percent`% damage. */
  | { kind: 'runeShield'; percent: number }
  /** Blocks your next spell completely. */
  | { kind: 'blockSpell' }
  /** Every `n`th turn its attack hits ×`mult` (the card counts down). */
  | { kind: 'everyNth'; n: number; mult: number }
  /** ★ Next turn one answer's letters scramble and settle back over 3 seconds (read-aloud reads the real text). */
  | { kind: 'scramble' }
  /** After hitting, it heals `amount` HP. */
  | { kind: 'healSelf'; amount: number }
  /** Several heads that fall after `split` hits each (in order); every living head bites once, so beating a head removes its bite. */
  | { kind: 'hydra'; split: number[] };

export const EFFECT_RULES: Record<string, EffectRule[]> = {
  // Piggybank Village: Spending and Saving
  mon_spendling: [{ kind: 'stealCoins', amount: 5 }],
  mon_impulse_magpie: [{ kind: 'slowStrike', seconds: 10 }],
  mon_jar_muncher: [{ kind: 'eatShield', elseCoins: 3 }], // Save Shield isn't unlocked yet here, so it usually takes coins
  boss_king_splurge: [{ kind: 'multiHit', hits: 2 }, { kind: 'rushNextTurn', seconds: 8, explorerBonus: 4 }],
  // Borrowers' Bridges: Credit and Debt
  mon_debt_slime: [{ kind: 'split', turns: 3 }],
  mon_interest_imp: [{ kind: 'rampOnMiss', step: 2 }],
  mon_late_fee_troll: [{ kind: 'latePenalty', seconds: 15, extra: 5 }],
  boss_loan_shark_lord: [{ kind: 'lockAnswer' }, { kind: 'multiHit', hits: 3 }],
  // Guildworks: Employment and Income
  mon_tax_gremlin: [{ kind: 'potTax', percent: 20 }],
  mon_slacker_golem: [{ kind: 'napNext' }],
  mon_gig_goblin: [{ kind: 'randomDamage', min: 4, max: 14 }],
  boss_burnout_blaze: [{ kind: 'burnRamp', step: 3, selfDamage: 3 }, { kind: 'plain' }],
  // Compound Orchard: Investing
  mon_hype_hornet: [{ kind: 'attacksFirst' }],
  mon_bubble_beetle: [{ kind: 'bubble', popAt: 2 }],
  mon_panic_bear: [{ kind: 'weakenSpell', percent: 50 }],
  boss_crash_treant: [{ kind: 'hitsPet', elseExtra: 4 }, { kind: 'slow', turns: 2 }],
  // Stormwatch Coast: Risk and Insurance
  mon_risk_squall: [{ kind: 'multiHit', hits: 2, chance: 0.25 }],
  mon_mishap_crab: [{ kind: 'breakShieldUninsured', extra: 3 }],
  mon_flood_eel: [{ kind: 'removeBuff' }],
  boss_catastrophe_leviathan: [{ kind: 'catastrophe', insuredDamage: 6 }, { kind: 'shuffleAnswers' }],
  // Crossroads Observatory: Financial Decision Making
  mon_scam_serpent: [{ kind: 'fakeHint' }],
  mon_inflation_balloon: [{ kind: 'inflation', percent: 10 }],
  mon_doubt_wraith: [{ kind: 'fogAnswer' }],
  boss_chaos_sphinx: [{ kind: 'riddle' }, { kind: 'balanceHp' }],
  // Bonus zones (mixed review). Their bosses have a single attack.
  mon_ember_jackal: [{ kind: 'burn', damage: 3, turns: 2 }],
  mon_sunscale_basilisk: [{ kind: 'glare' }],
  mon_cinder_scarab: [{ kind: 'halfSpells' }],
  boss_solar_wyrm: [{ kind: 'burn', damage: 5, turns: 2 }],
  mon_starmoth: [{ kind: 'napNext', chance: 0.3 }],
  mon_nebula_lynx: [{ kind: 'crit', chance: 0.25, mult: 1.5 }],
  mon_void_sprout: [{ kind: 'removeBuff' }],
  boss_galaxy_stag: [{ kind: 'rampOnMiss', step: 4 }],
  mon_rune_golem: [{ kind: 'runeShield', percent: 50 }],
  mon_relic_wraith: [{ kind: 'blockSpell' }],
  mon_comet_hound: [{ kind: 'attacksFirst' }],
  boss_astral_colossus: [{ kind: 'everyNth', n: 3, mult: 2 }],
  mon_moonbat: [{ kind: 'scramble' }],
  mon_crystal_crawler: [{ kind: 'multiHit', hits: 3 }],
  mon_tide_specter: [{ kind: 'healSelf', amount: 6 }],
  // Lunar Hydra: 7 hits split 2/2/3 across three heads (PLAN.md §3).
  boss_lunar_hydra: [{ kind: 'hydra', split: [2, 2, 3] }],
};
