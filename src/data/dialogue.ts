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

export const headmasterTalk = (cleared: readonly string[], postDone = false): string[] => {
  const n = ['piggybank_village', 'borrowers_bridges', 'guildworks', 'compound_orchard', 'stormwatch_coast', 'crossroads_observatory'].filter((z) => cleared.includes(z)).length;
  if (postDone) return ['The portals at the Crossroads Observatory are open. Bonus zones mix every topic, and any monster you beat there is tamed as a pet!', 'Check your progress (📊) to see how much you have grown.'];
  if (n === 0) return ['Money monsters have taken over the villages around the academy.', 'Go out through the Great Hall doors to the world map, and start with Piggybank Village.'];
  if (n < 6) return [`You have cleared ${n} of 6 zones. Wonderful work!`, 'Each boss you beat teaches you a new spell and opens the next zone on the world map.'];
  return ['You beat all six zone bosses!'];
};

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

export interface Mentor { speaker: Speaker; hello: string[]; tips: string[] }

/** Each topic zone's mentor. All tips are DRAFTS for the student to review for accuracy. */
export const MENTORS: Record<string, Mentor> = {
  piggybank_village: { speaker: PENNY, hello: PENNY_HELLO, tips: PENNY_TIPS },
  borrowers_bridges: {
    speaker: { name: 'Bridgekeeper Bram', sprite: 'mentor_borrowers_bridges' },
    hello: ['Ahoy! Debt Slime, Interest Imp and Late Fee Troll have the bridges tangled up.', 'Beat all three, and the Loan Shark Lord will show himself at the toll booth.'],
    tips: [
      'Tip: interest is the extra money you pay for borrowing. The longer you take to pay it back, the more interest you usually pay.',
      'Tip: paying bills on time builds a good credit history, which can make borrowing cheaper later.',
      'Tip: only borrow what you can pay back. Paying just the minimum on a credit card can keep you in debt for a long time.',
    ],
  },
  guildworks: {
    speaker: { name: 'Foreman Rosa', sprite: 'mentor_guildworks' },
    hello: ['Welcome to the Guildworks! Tax Gremlin, Slacker Golem and Gig Goblin are making a mess of payday.', 'Clear them out and Burnout Blaze will come out of the smithy.'],
    tips: [
      'Tip: gross pay is what you earn before taxes. Net pay, or take-home pay, is what is left after taxes and other deductions.',
      'Tip: learning new skills can help you earn more, because many jobs pay more for skills that are hard to find.',
      'Tip: income can come from a job, from a business you run, or from what your savings and investments earn.',
    ],
  },
  compound_orchard: {
    speaker: { name: 'Orchard Keeper Olive', sprite: 'mentor_compound_orchard' },
    hello: ['Shh, the saplings are growing! Hype Hornet, Bubble Beetle and Panic Bear keep scaring them.', 'Beat all three, and Crash Treant will wake up by the great tree.'],
    tips: [
      'Tip: with compound interest you earn interest on your interest too, so money saved early has more time to grow.',
      "Tip: don't put all your eggs in one basket. Spreading money across many investments, called diversifying, lowers your risk.",
      'Tip: investments that can earn more usually carry more risk. Their value can go down as well as up.',
    ],
  },
  stormwatch_coast: {
    speaker: { name: 'Keeper Gale', sprite: 'mentor_stormwatch_coast' },
    hello: ['Storm coming in! Risk Squall, Mishap Crab and Flood Eel are loose on the coast.', 'Beat them, and Catastrophe Leviathan will rise by the lighthouse.'],
    tips: [
      'Tip: an emergency fund is money saved for surprises, like a broken bike or a doctor visit. Many experts suggest saving a few months of expenses.',
      "Tip: insurance means paying a small amount regularly, called a premium, so one big loss doesn't fall all on you.",
      'Tip: a deductible is the part of a loss you pay yourself before insurance starts to pay.',
    ],
  },
  crossroads_observatory: {
    speaker: { name: 'Stargazer Sol', sprite: 'mentor_crossroads_observatory' },
    hello: ['Every path meets here, and so do Scam Serpent, Inflation Balloon and Doubt Wraith.', 'Beat them all, and Chaos Sphinx waits at the observatory. The portals beyond open after every boss is beaten.'],
    tips: [
      'Tip: every choice has an opportunity cost: the next best thing you give up when you choose.',
      'Tip: if a deal sounds too good to be true, it probably is. Take time to check before you hand over money.',
      'Tip: compare prices and think about needs and wants before you decide. A budget helps you plan ahead.',
    ],
  },
};
