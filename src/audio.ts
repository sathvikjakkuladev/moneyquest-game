// Sound is not in the game yet. Call sites are already in place so it can be added later.
export type SfxId = 'battle-start' | 'right' | 'wrong' | 'cast' | 'hit' | 'hurt' | 'coins' | 'victory' | 'faint' | 'step' | 'talk' | 'door';
export type MusicId = 'title' | 'academy' | 'piggybank_village' | 'battle' | 'boss';
export function sfx(_id: SfxId): void {}
export function music(_id: MusicId | null): void {}
