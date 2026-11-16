// The seven spells (PLAN.md §3). Budget Beam is the starter; each topic zone's boss unlocks one.
// Phase 2 plays Budget Beam and Save Shield; the extras of the other five arrive in Phase 4.

export type SpellId = 'budget_beam' | 'save_shield' | 'credit_cleanse' | 'paycheck_strike' | 'compound_burst' | 'insurance_barrier' | 'wise_choice';

export interface Spell { id: SpellId; name: string; damage: number; shield?: number; blurb: string; color: number }

export const SPELLS: Record<SpellId, Spell> = {
  budget_beam: { id: 'budget_beam', name: 'Budget Beam', damage: 10, blurb: 'A steady beam of smart planning.', color: 0xffd43b },
  save_shield: { id: 'save_shield', name: 'Save Shield', damage: 7, shield: 8, blurb: 'Less damage, but a shield blocks 8 from the next hit.', color: 0x4dabf7 },
  credit_cleanse: { id: 'credit_cleanse', name: 'Credit Cleanse', damage: 8, blurb: 'Washes away bad effects.', color: 0x63e6be },
  paycheck_strike: { id: 'paycheck_strike', name: 'Paycheck Strike', damage: 9, blurb: 'Adds 3 coins to the battle pot.', color: 0x8ce99a },
  compound_burst: { id: 'compound_burst', name: 'Compound Burst', damage: 6, blurb: 'Grows with every right answer in a row.', color: 0xf783ac },
  insurance_barrier: { id: 'insurance_barrier', name: 'Insurance Barrier', damage: 6, blurb: 'Blocks the next big hit completely.', color: 0x91a7ff },
  wise_choice: { id: 'wise_choice', name: 'Wise Choice', damage: 8, blurb: 'Removes one wrong answer next question.', color: 0xb197fc },
};

/** Spell unlocked by beating each topic district's boss: the spell that matches its topic. */
export const ZONE_SPELL: Record<string, SpellId> = {
  'coinfall-docks': 'save_shield', // Spending and Saving
  'the-sprawl': 'wise_choice', // Financial Decision Making
  frostvault: 'paycheck_strike', // Employment and Income
  'credit-citadel': 'credit_cleanse', // Credit and Debt
  'compound-rift': 'compound_burst', // Investing
  'the-exchange': 'insurance_barrier', // Risk and Insurance
};
