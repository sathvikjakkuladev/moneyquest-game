// The multiplayer switch. VITE_MP_URL is set at build time (Vercel project settings). When it's
// unset, MP_URL is '' and the game is exactly the single-player game: no multiplayer requests.
// To keep multiplayer code out of the bundle entirely, guard imports with
// `import.meta.env.VITE_MP_URL ? … : …` (a build-time constant), as src/ui/Hud.tsx does.
export const MP_URL: string = (import.meta.env.VITE_MP_URL ?? '').replace(/\/+$/, '');
