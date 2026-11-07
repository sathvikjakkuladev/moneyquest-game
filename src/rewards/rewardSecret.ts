/**
 * rewardSecret.ts
 * ---------------
 * The secret word mixed into every reward code's check value (see
 * rewardCodes.ts). Codes printed with one secret only work with that same
 * secret, so:
 *   - Don't change it after you've printed cards, or those cards stop working.
 *   - If a batch of codes leaks, change it and print new cards.
 *
 * This is NOT real security: the secret is inside the game's JavaScript, so a
 * determined person could find it. It keeps made-up codes from working, and
 * the class server makes each card work only once.
 */
export const REWARD_SECRET = 'nUQx65OQbX4ASt4H';
