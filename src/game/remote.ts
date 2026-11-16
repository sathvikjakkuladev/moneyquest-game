// Other players on this screen: their own look, hat and pet, moving smoothly (drawn RENDER_DELAY ms
// in the past, interpolated). Only created when multiplayer is on. A classmate's look arrives as
// list indexes; their art loads on demand and is dropped when the screen closes.
import type * as Phaser from 'phaser';
import type { Look } from '../core/look.ts';
import { DEFAULT_LOOK, lookFromList } from '../core/look.ts';
import { item } from '../data/items.ts';
import { hatArt } from '../data/v2.ts';
import { ZONES } from '../data/zones.ts';
import { bridge } from '../net/bridge.ts';
import { RENDER_DELAY, sampleAt } from '../net/interp.ts';
import { FACES } from '../net/protocol.ts';
import { Avatar, dropAvatars, OVERWORLD_CLIPS, queueAvatar } from './avatar.ts';
import { SIZE } from './creature.ts';
import { Follower, queuePet } from './pet.ts';
import { whenLoaded } from './stage.ts';

interface Seen {
  avatar: Avatar | null;
  style: string; // look + hat, as text, to spot changes
  pet: Follower | null;
  petKey: string;
  last: { x: number; y: number };
}

const knownHat = (id: string | null) => (id && hatArt(id) ? id : null);
const knownPet = (id: string | null) => !!id && item(id)?.kind === 'pet';
const petLook = (i: number | undefined) => (i !== undefined && i >= 0 ? (ZONES[i]?.id ?? null) : null);

export class RemotePlayers {
  private scene: Phaser.Scene;
  private views = new Map<number, Seen>();
  private baked = new Set<string>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  update(dtMs: number): void {
    const now = performance.now();
    for (const [id, r] of bridge.remotes) {
      let v = this.views.get(id);
      if (!v) this.views.set(id, (v = { avatar: null, style: '', pet: null, petKey: '', last: { x: r.x, y: r.y } }));
      const at = sampleAt(r.samples, now - RENDER_DELAY) ?? { x: r.x, y: r.y };
      const moving = Math.hypot(at.x - v.last.x, at.y - v.last.y) > 0.2;
      v.last = at;

      const look: Look = lookFromList(r.a) ?? DEFAULT_LOOK;
      const hat = knownHat(r.h);
      const style = `${r.a?.join('.') ?? ''}|${hat ?? ''}`;
      if (style !== v.style) {
        v.style = style;
        whenLoaded(this.scene, queueAvatar(this.scene, look, hat, OVERWORLD_CLIPS), () => {
          const w = this.views.get(id);
          if (!w || w.style !== style) return;
          if (w.avatar) w.avatar.restyle(look, hat);
          else w.avatar = new Avatar(this.scene, w.last.x, w.last.y, look, hat, SIZE.player);
          for (const k of w.avatar.keys) this.baked.add(k);
        });
      }
      if (v.avatar) {
        const face = FACES[r.f];
        v.avatar.sprite.setPosition(at.x, at.y).setDepth(at.y);
        if (moving) v.avatar.show(face === 'north' ? 'walk-back' : 'walk', face === 'west');
        else if (face === 'north') (v.avatar.show('walk-back'), v.avatar.sprite.anims.pause(v.avatar.sprite.anims.currentAnim?.frames[0]));
        else v.avatar.show('idle', face === 'west');
      }

      const petKey = knownPet(r.p) ? `${r.p}|${petLook(r.pl) ?? ''}` : '';
      if (petKey !== v.petKey) {
        v.pet?.destroy();
        v.pet = null;
        v.petKey = petKey;
        if (petKey) {
          const pl = petLook(r.pl);
          whenLoaded(this.scene, queuePet(this.scene, r.p, pl), () => {
            const w = this.views.get(id);
            if (w && w.petKey === petKey && !w.pet) w.pet = new Follower(this.scene, r.p!, pl, [w.last.x, w.last.y]);
          });
        }
      }
      v.pet?.update([at.x, at.y], moving, dtMs);
      bridge.labels.set(id, { x: at.x, y: at.y - SIZE.player - (hat ? 18 : 8) }); // above the hair or hat
    }
    for (const [id, v] of this.views) if (!bridge.remotes.has(id)) this.remove(id, v);
  }

  /** The classmate drawn at (x, y), the front-most one if they overlap. */
  hit(x: number, y: number): number | undefined {
    let best: [number, number] | undefined;
    for (const [id, v] of this.views) if (v.avatar && v.avatar.sprite.getBounds().contains(x, y) && (!best || v.avatar.sprite.depth > best[1])) best = [id, v.avatar.sprite.depth];
    return best?.[0];
  }

  private remove(id: number, v: Seen): void {
    v.avatar?.destroy();
    v.pet?.destroy();
    this.views.delete(id);
    bridge.labels.delete(id);
  }

  /** `keep`: baked textures still in use (the player's own). */
  destroy(keep: ReadonlySet<string> = new Set()): void {
    for (const [id, v] of this.views) this.remove(id, v);
    bridge.labels.clear();
    dropAvatars(this.scene, [...this.baked].filter((k) => !keep.has(k)));
  }
}
