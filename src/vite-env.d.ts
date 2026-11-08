/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Multiplayer server, e.g. https://mp.nhsqa.org. Unset = multiplayer off (no network at all). */
  readonly VITE_MP_URL?: string;
}
