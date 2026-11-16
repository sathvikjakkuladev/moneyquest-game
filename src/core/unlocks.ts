// What's open: the six topic districts in order, Phish Fens (mixed review) after all six bosses and
// Money Check 2, and the Debt Dragon after all seven districts. `?dev=1` opens everything for testing, on the dev server only: in the production build
// import.meta.env.DEV is false, so dev mode (and the editor code behind it) is removed entirely.
import { ALL_DISTRICTS, TOPIC_ZONE_ORDER, zoneOpen } from './progression.ts';

export const devMode = () => import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('dev');

/** Phish Fens opens after all six topic bosses and Money Check 2 (the old bonus-portal rule). */
export function bonusOpen(cleared: readonly string[], postCheckDone: boolean): boolean {
  return postCheckDone && TOPIC_ZONE_ORDER.every((z) => cleared.includes(z));
}

export function canEnter(zone: string, cleared: readonly string[], bonus: boolean, postCheckDone = false): boolean {
  if (devMode()) return true;
  return bonus ? bonusOpen(cleared, postCheckDone) : zoneOpen(zone, cleared);
}

/** The Debt Dragon, at Ledgerhold's arena gate, fights once all seven district bosses are beaten. */
export const finaleOpen = (cleared: readonly string[]) => devMode() || ALL_DISTRICTS.every((z) => cleared.includes(z));
