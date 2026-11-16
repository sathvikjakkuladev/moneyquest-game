import { CREATURES } from '../data/v2.ts';
import { assetUrl } from '../game/stage.ts';

/** A speaker's portrait from the art set: an NPC id, or `boss:<id>` / `mon:<species>/<look>` for a creature. */
export function portraitUrl(id: string): string | null {
  if (id.startsWith('boss:')) return assetUrl(`boss/${id.slice(5)}/portrait.webp`);
  if (id.startsWith('mon:')) return assetUrl(`mon/${id.slice(4)}-portrait.webp`);
  return CREATURES.npcs[id] ? assetUrl(`npc/${id}/portrait.webp`) : null;
}

/** A character's portrait, `size` CSS px square. */
export function Portrait({ id, size = 112, alt }: { id: string; size?: number; alt: string }) {
  const url = portraitUrl(id);
  if (!url) return <div role="img" aria-label={alt} style={{ width: size, height: size }} />;
  return <img src={url} alt={alt} width={size} height={size} draggable={false} style={{ width: size, height: size, objectFit: 'contain' }} />;
}
