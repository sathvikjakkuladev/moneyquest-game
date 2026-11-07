// What each monster attack's special effect does, as data. Attack names, effect text and damage
// come from monster_attacks.json; this file only maps each attack to a rule, so it can be reviewed
// on its own. One entry per attack, in JSON order (a boss's second attack is index 1).
// Phase 2: Piggybank Village. The other zones are added in Phase 4; until then they hit plainly.

export type EffectRule =
  | { kind: 'plain' }
  /** On a hit, take coins from the wallet (never below zero). */
  | { kind: 'stealCoins'; amount: number }
  /** Adventurer: if the answer takes longer than `seconds`, the monster strikes once first. Explorer: nothing. */
  | { kind: 'slowStrike'; seconds: number }
  /** On a hit, eat the player's shield; with no shield up, take `elseCoins` coins instead. */
  | { kind: 'eatShield'; elseCoins: number }
  /** On a hit, strike `hits` times. */
  | { kind: 'multiHit'; hits: number }
  /** On a hit: Adventurer gets a `seconds` timer next turn (running out counts as wrong). Explorer
   *  never sees timers, so the next hit does `explorerBonus` extra damage instead. */
  | { kind: 'rushNextTurn'; seconds: number; explorerBonus: number };

export const EFFECT_RULES: Record<string, EffectRule[]> = {
  mon_spendling: [{ kind: 'stealCoins', amount: 5 }],
  mon_impulse_magpie: [{ kind: 'slowStrike', seconds: 10 }],
  // Save Shield is unlocked only by clearing this zone, so here Jar Muncher usually takes coins.
  mon_jar_muncher: [{ kind: 'eatShield', elseCoins: 3 }],
  boss_king_splurge: [{ kind: 'multiHit', hits: 2 }, { kind: 'rushNextTurn', seconds: 8, explorerBonus: 4 }],
};
