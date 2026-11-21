// What NPCs say. Mentor tips are learning text written by Claude Code: DRAFT for the student to review.
// `sprite` is the NPC's id in the art set (its portrait is shown beside the text).

export interface Speaker { name: string; sprite: string }

export const HEADMASTER: Speaker = { name: 'Headmaster Goldwhisker', sprite: 'mentor' };
export const MERCHANT: Speaker = { name: 'Shopkeeper Bix', sprite: 'shopkeeper' };
export const BANKER: Speaker = { name: 'Banker Vale', sprite: 'banker' };
export const STYLIST: Speaker = { name: 'Stylist Juno', sprite: 'stylist' };
export const PET_TRADER: Speaker = { name: 'Keeper Pip', sprite: 'pet-trader' };
export const QUEST_KEEPER: Speaker = { name: 'Quest Keeper Ada', sprite: 'quest-keeper' };
export const ARENA_MASTER: Speaker = { name: 'Arena Master Rook', sprite: 'arena-master' };

/** The people of Ledgerhold, by NPC id. */
export const TOWNSFOLK: Record<string, Speaker> = { mentor: HEADMASTER, shopkeeper: MERCHANT, banker: BANKER, stylist: STYLIST, 'pet-trader': PET_TRADER, 'quest-keeper': QUEST_KEEPER, 'arena-master': ARENA_MASTER };

export const WELCOME = [
  'Welcome to Ledgerhold, young wizard!',
  'Here we learn money magic. Answer a question right and you cast a spell.',
  'Get one wrong and the monster gets a turn, but I will always show you why.',
  'First, tell me what to call you.',
];

export const headmasterTalk = (topicBosses: number, postDone = false, allDone = false): string[] => {
  if (allDone) return ['Every district is safe again. Only the Debt Dragon is left, at the arena gate north of the plaza.', 'Check your progress with the Quest Keeper to see how much you have grown.'];
  if (postDone) return ['Phish Fens is open on the world map. Its monsters mix every topic.', 'Beat all seven district bosses and the Debt Dragon will face you at the arena gate.'];
  if (topicBosses === 0) return ['Money monsters have taken over the districts around Ledgerhold.', 'Open the world map (🗺️) or touch the waystone south of the plaza, and start with Coinfall Docks.'];
  if (topicBosses < 6) return [`You have cleared ${topicBosses} of the 6 topic districts. Wonderful work!`, 'Each boss you beat teaches you a new spell, gives you a new costume colour and opens the next district.'];
  return ['You beat all six topic bosses!'];
};

export const MERCHANT_TALK = ['Hats for every head, and armor, wands and potions for every adventurer! Spend the coins you’ve saved here.', 'Remember: most of this is a want, not a need. Buy it when your savings can spare it.'];
/** DRAFT for review: saving tips from the banker. */
export const BANKER_TALK = [
  'Tip: a bank keeps your money safe and can pay you interest, which is a little extra money for saving with it.',
  'Tip: set a savings goal and put a bit aside every time you get money. Small amounts add up.',
  'Tip: keep track of what comes in and what goes out. That record is the start of a budget.',
];
export const STYLIST_TALK = ['Fancy a new look? Hair, eyes, face and costume colours are free to change, as often as you like.'];
export const PET_TRADER_TALK = ['Every monster you beat becomes a friend. Pick one to walk with you, and it will help in battle.'];
export const QUEST_KEEPER_TALK = ['The quest board tracks your districts, your Money Checks and how each topic is going.'];

export interface Mentor { speaker: Speaker; hello: string[]; tips: string[] }

/** Each district's guide. All tips are DRAFTS for the student to review for accuracy. */
export const MENTORS: Record<string, Mentor> = {
  'coinfall-docks': {
    speaker: { name: 'Dockmaster Penny', sprite: 'guide-coinfall-docks' },
    hello: ['Oh, thank goodness you are here! These monsters feed on spending without a plan.', 'Beat Budget Breaker and Subscription Swarm in the wilds, and the Overspend Kraken will come out to fight.'],
    tips: [
      'Tip: before you buy something, wait a day. If you still want it tomorrow, it is less likely to be an impulse buy.',
      'Tip: pay yourself first. When you get money, put some into savings before you spend the rest.',
      'Tip: a need is something you must have, like food or a warm coat. A want is nice to have. Cover your needs first.',
    ],
  },
  'the-sprawl': {
    speaker: { name: 'Stargazer Sol', sprite: 'guide-the-sprawl' },
    hello: ['Every stall in this market wants your coins, and so do Impulse Wisp and Splurge Hound.', 'Beat them both, and the Splurge Peacock will strut out of its lair.'],
    tips: [
      'Tip: every choice has an opportunity cost: the next best thing you give up when you choose.',
      'Tip: if a deal sounds too good to be true, it probably is. Take time to check before you hand over money.',
      'Tip: compare prices and think about needs and wants before you decide. A budget helps you plan ahead.',
    ],
  },
  frostvault: {
    speaker: { name: 'Foreman Rosa', sprite: 'guide-frostvault' },
    hello: ['Welcome to Frostvault! Inflation Shade and Overdraft Golem are making a mess of payday.', 'Clear them out and the Frostfang Mammoth will come down from the vault.'],
    tips: [
      'Tip: gross pay is what you earn before taxes. Net pay, or take-home pay, is what is left after taxes and other deductions.',
      'Tip: learning new skills can help you earn more, because many jobs pay more for skills that are hard to find.',
      'Tip: income can come from a job, from a business you run, or from what your savings and investments earn.',
    ],
  },
  'credit-citadel': {
    speaker: { name: 'Gatekeeper Bram', sprite: 'guide-credit-citadel' },
    hello: ['Halt! Late Fee Raptor and Minimum Payment Leech have the citadel in their grip.', 'Beat them both, and the Collector Scorpion will show itself.'],
    tips: [
      'Tip: interest is the extra money you pay for borrowing. The longer you take to pay it back, the more interest you usually pay.',
      'Tip: paying bills on time builds a good credit history, which can make borrowing cheaper later.',
      'Tip: only borrow what you can pay back. Paying just the minimum on a credit card can keep you in debt for a long time.',
    ],
  },
  'compound-rift': {
    speaker: { name: 'Rift Keeper Olive', sprite: 'guide-compound-rift' },
    hello: ['Careful on the floating paths! APR Serpent and Rug Pull Mimic are loose out here.', 'Beat them both, and the Compound Leviathan will rise from the rift.'],
    tips: [
      'Tip: with compound interest you earn interest on your interest too, so money saved early has more time to grow.',
      "Tip: don't put all your eggs in one basket. Spreading money across many investments, called diversifying, lowers your risk.",
      'Tip: investments that can earn more usually carry more risk. Their value can go down as well as up.',
    ],
  },
  'the-exchange': {
    speaker: { name: 'Keeper Gale', sprite: 'guide-the-exchange' },
    hello: ['Storm coming in! Hype Bull and Panic Bear are stampeding around the spire.', 'Beat them, and the Volatility Roc will dive from the storm.'],
    tips: [
      'Tip: an emergency fund is money saved for surprises, like a broken bike or a doctor visit. Many experts suggest saving a few months of expenses.',
      "Tip: insurance means paying a small amount regularly, called a premium, so one big loss doesn't fall all on you.",
      'Tip: a deductible is the part of a loss you pay yourself before insurance starts to pay.',
    ],
  },
  'phish-fens': {
    speaker: { name: 'Marshwarden Ines', sprite: 'guide-phish-fens' },
    hello: ['Mind the fog. Phish Lurker and Identity Wraith will try every trick, so the questions here mix every topic.', 'Beat them both, and the Phish Queen will leave her web.'],
    tips: [
      'Tip: never share passwords or personal details with someone who contacts you out of the blue, even if they sound official.',
      'Tip: scammers rush you. A real bank or shop will let you take your time and check.',
      'Tip: if a message offers free money or a prize you never entered for, it is almost always a scam.',
    ],
  },
};
