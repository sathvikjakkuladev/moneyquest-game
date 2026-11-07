// Cosmetics: hats (worn on the wizard) and pets (follow you, small battle assist). The shop arrives
// in Phase 4; prices are drafts. The Laurel Wreath and Bull Calf are reward-card prizes only and can
// never be bought (src/rewards/redeem.ts REWARD_ONLY_ITEMS, tested).

export interface Item { id: string; kind: 'hat' | 'pet'; name: string; price: number | null; art: string; legendary?: boolean }

export const ITEMS: Item[] = [
  { id: 'hat-laurel', kind: 'hat', name: 'Laurel Wreath', price: null, art: 'laurel' },
  { id: 'pet-bull', kind: 'pet', name: 'Bull Calf', price: null, art: 'pet_bull_calf', legendary: true },
  { id: 'pet-coin-sprite', kind: 'pet', name: 'Coin Sprite', price: 60, art: 'pet_coin_sprite' },
  { id: 'pet-sapling-fox', kind: 'pet', name: 'Sapling Fox', price: 80, art: 'pet_sapling_fox' },
  { id: 'pet-star-kitten', kind: 'pet', name: 'Star Kitten', price: 80, art: 'pet_star_kitten' },
  { id: 'pet-gem-turtle', kind: 'pet', name: 'Gem Turtle', price: 100, art: 'pet_gem_turtle' },
  { id: 'pet-piggy-dragonling', kind: 'pet', name: 'Piggy Dragonling', price: 120, art: 'pet_piggy_dragonling' },
  { id: 'pet-vault-bot', kind: 'pet', name: 'Vault Bot', price: 120, art: 'pet_vault_bot' },
  { id: 'pet-professor-owl', kind: 'pet', name: 'Professor Owl', price: 150, art: 'pet_professor_owl', legendary: true },
];
export const item = (id: string) => ITEMS.find((i) => i.id === id);
