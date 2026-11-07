// What NPCs say. Mentor tips are learning text written by Claude Code: DRAFT for the student to review.

export interface Speaker { name: string; sprite: string } // sprite = character id (portrait = its south rotation)

export const HEADMASTER: Speaker = { name: 'Headmaster Goldwhisker', sprite: 'headmaster' };
export const MERCHANT: Speaker = { name: 'Banker Bix', sprite: 'merchant' };
export const PENNY: Speaker = { name: 'Penny Meadows', sprite: 'mentor_piggybank_village' };

export const WELCOME = [
  'Welcome to Coin Academy, young wizard!',
  'Here we learn money magic. Answer a question right and you cast a spell.',
  'Get one wrong and the monster gets a turn, but I will always show you why.',
  'First, tell me what to call you.',
];

export const headmasterTalk = (cleared: readonly string[]) =>
  cleared.includes('piggybank_village')
    ? ['You beat King Splurge! Piggybank Village is safe again.', 'More villages open soon. Keep practising your Save Shield!']
    : ['Money monsters have taken over the villages around the academy.', 'Go out through the Great Hall doors to the world map, and start with Piggybank Village.'];

export const MERCHANT_TALK = ['Welcome, welcome! My shop opens soon.', 'Save the coins you win in battles and come back to see me.'];
export const SHOPKEEPER_TALK = ['Fresh coins, shiny jars! The real shop is at the academy.', 'Careful out there: the monsters here love impulse buys.'];

export const PENNY_HELLO = [
  'Oh, thank goodness you are here! These monsters feed on impulse buys.',
  'Beat Spendling, Impulse Magpie and Jar Muncher, and King Splurge will come out to fight.',
];

/** DRAFT for review: Spending and Saving tips. */
export const PENNY_TIPS = [
  'Tip: before you buy something, wait a day. If you still want it tomorrow, it is less likely to be an impulse buy.',
  'Tip: pay yourself first. When you get money, put some into savings before you spend the rest.',
  'Tip: a need is something you must have, like food or a warm coat. A want is nice to have. Cover your needs first.',
];
