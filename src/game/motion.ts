/** The player's reduced-motion setting, else the device's. */
export function reducedMotion(setting: boolean | null | undefined): boolean {
  if (setting !== null && setting !== undefined) return setting;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
