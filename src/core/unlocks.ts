// What's open: topic zones in order, bonus zones after all six bosses (and, from Phase 5, Money
// Check 2). `?dev=1` opens everything for testing, on the dev server only: in the production build
// import.meta.env.DEV is false, so dev mode (and the editor code behind it) is removed entirely.
import { TOPIC_ZONE_ORDER, zoneOpen } from './progression.ts';

export const devMode = () => import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('dev');

export function bonusOpen(cleared: readonly string[]): boolean {
  return TOPIC_ZONE_ORDER.every((z) => cleared.includes(z));
}

export function canEnter(zone: string, cleared: readonly string[], bonus: boolean): boolean {
  if (devMode()) return true;
  return bonus ? bonusOpen(cleared) : zoneOpen(zone, cleared);
}
