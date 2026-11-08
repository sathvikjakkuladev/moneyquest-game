// Other players on this screen: the same wizard sprite, with their hat and pet, moving smoothly
// (drawn RENDER_DELAY ms in the past, interpolated). Only created when multiplayer is on.
import type * as Phaser from 'phaser';
import { bridge } from '../net/bridge.ts';
import { RENDER_DELAY, sampleAt } from '../net/interp.ts';
import { FACES } from '../net/protocol.ts';
import { item } from '../data/items.ts';
import { addChar, pose } from './chars.ts';
import { HAT_ART } from '../data/hats.ts';
import { Hat } from './hats.ts';
import { Follower, petArt, queuePet } from './pet.ts';

interface View {
  sprite: Phaser.GameObjects.Sprite;
  hat: Hat | null;
  hatId: string | null;
  pet: Follower | null;
  petId: string | null;
  last: { x: number; y: number };
}

const knownHat = (id: string | null) => !!id && item(id)?.kind === 'hat' && !!HAT_ART[item(id)!.art];
const knownPet = (id: string | null) => !!id && item(id)?.kind === 'pet' && !!petArt(id);

export class RemotePlayers {
  private scene: Phaser.Scene;
  private charId: string;
  private views = new Map<number, View>();

  constructor(scene: Phaser.Scene, charId: string) {
    this.scene = scene;
    this.charId = charId;
  }

  update(dtMs: number): void {
    const now = performance.now();
    for (const [id, r] of bridge.remotes) {
      let v = this.views.get(id);
      if (!v) {
        v = { sprite: addChar(this.scene, this.charId, r.x, r.y), hat: null, hatId: null, pet: null, petId: null, last: { x: r.x, y: r.y } };
        this.views.set(id, v);
      }
      const at = sampleAt(r.samples, now - RENDER_DELAY) ?? { x: r.x, y: r.y };
      const moving = Math.hypot(at.x - v.last.x, at.y - v.last.y) > 0.2;
      v.last = at;
      v.sprite.setPosition(at.x, at.y).setDepth(at.y);
      pose(v.sprite, this.charId, moving ? 'walk' : 'idle', FACES[r.f]);

      if (r.h !== v.hatId) {
        v.hat?.destroy();
        v.hat = knownHat(r.h) ? new Hat(this.scene, v.sprite, r.h!) : null;
        v.hatId = r.h;
      }
      v.hat?.update();

      if (r.p !== v.petId) {
        v.pet?.destroy();
        v.pet = null;
        v.petId = r.p;
        if (knownPet(r.p)) this.loadPet(id, r.p!);
      }
      v.pet?.update([at.x, at.y], moving, dtMs);
      bridge.labels.set(id, { x: at.x, y: at.y - v.sprite.displayHeight * v.sprite.originY - (v.hat ? 10 : 0) }); // above the hat
    }
    for (const [id, v] of this.views) if (!bridge.remotes.has(id)) this.remove(id, v);
  }

  /** The classmate drawn at (x, y), the front-most one if they overlap. */
  hit(x: number, y: number): number | undefined {
    let best: [number, number] | undefined;
    for (const [id, v] of this.views) if (v.sprite.getBounds().contains(x, y) && (!best || v.sprite.depth > best[1])) best = [id, v.sprite.depth];
    return best?.[0];
  }

  /** Pet art loads on demand (only the player's own pet is preloaded). */
  private loadPet(id: number, petId: string): void {
    const make = () => {
      const v = this.views.get(id);
      const art = petArt(petId);
      if (v && v.petId === petId && art && this.scene.textures.exists(art.key)) v.pet = new Follower(this.scene, petId, [v.last.x, v.last.y]);
    };
    const art = petArt(petId)!;
    if (this.scene.textures.exists(art.key)) return make();
    queuePet(this.scene, petId);
    this.scene.load.once('complete', make);
    this.scene.load.start();
  }

  private remove(id: number, v: View): void {
    v.sprite.destroy();
    v.hat?.destroy();
    v.pet?.destroy();
    this.views.delete(id);
    bridge.labels.delete(id);
  }

  destroy(): void {
    for (const [id, v] of this.views) this.remove(id, v);
    bridge.labels.clear();
  }
}
