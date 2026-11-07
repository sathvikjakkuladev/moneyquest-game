import * as Phaser from 'phaser';
import { sfx } from '../../audio.ts';
import type { Pt } from '../../core/geometry.ts';
import { canStand, step } from '../../core/geometry.ts';
import { monster, zoneRegulars } from '../../core/monsters.ts';
import { bossReady } from '../../core/progression.ts';
import { HEADMASTER, headmasterTalk, MENTORS, MERCHANT, MERCHANT_TALK, SHOPKEEPER_TALK } from '../../data/dialogue.ts';
import { canEnter } from '../../core/unlocks.ts';
import { zoneById } from '../../data/zones.ts';
import { Follower, queuePet } from '../pet.ts';
import { Hat } from '../hats.ts';
import { MONSTER_FACES_RIGHT } from '../../data/monsterFacing.ts';
import type { Facing, Screen } from '../../data/rooms.ts';
import { exitAt, exitTarget, PORTAL_REACH, portalSpot, ROOMS } from '../../data/rooms.ts';
import { slot, useSave } from '../../state/save.ts';
import { buyScroll, SCROLL, SCROLL_PRICE } from '../../core/shop.ts';
import type { SceneReq } from '../../state/session.ts';
import { useSession } from '../../state/session.ts';
import { addChar, pose } from '../chars.ts';
import { pad, roomActions } from '../input.ts';
import { manifest, monsterAnims, queueCharacter, queueMonster, queueScreens, screenKey } from '../manifest.ts';
import { reducedMotion } from '../motion.ts';
import { currentRoom } from '../current.ts';

export const PLAYER = 'player_coin_wizard';
const SPEED = 120; // px per second on the 640×360 canvas
const DARK_SCREENS = new Set(['piggybank_village/cottages', 'borrowers_bridges/toll']); // brightened (pack README)

interface Thing { kind: 'npc' | 'monster'; id: string; name: string; x: number; y: number; range: number; sprite: Phaser.GameObjects.Sprite; charId?: string; beaten?: boolean }

const greeted = new Set<string>(); // each mentor says hello once per session
const tips: Record<string, number> = {};

/** One screen of a location: background, NPCs, monsters, exits and the walking player. */
export class RoomScene extends Phaser.Scene {
  private req!: Extract<SceneReq, { kind: 'room' }>;
  private zone = '';
  private screenName = '';
  private screen!: Screen;
  private player: Phaser.GameObjects.Sprite | null = null;
  private face: Facing = 'north';
  private target: Pt | null = null;
  private pending: Thing | null = null;
  private things: Thing[] = [];
  private near: Thing | null = null;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private inExit = false;
  private touching = new Set<string>();
  private wasBlocked = true;
  private pressed = false;
  private leaving = false;
  private pet: Follower | null = null;
  private hat: Hat | null = null;
  private atPortal: string | null = null;

  constructor() {
    super('room');
  }

  init(req: Extract<SceneReq, { kind: 'room' }>): void {
    this.req = req;
    this.zone = req.zone;
    const rooms = ROOMS[req.zone]!;
    this.screenName = req.screen && rooms.screens[req.screen] ? req.screen : rooms.start;
    this.screen = rooms.screens[this.screenName]!;
    Object.assign(this, { player: null, things: [], target: null, pending: null, near: null, face: 'north', wasBlocked: true, pressed: false, leaving: false, touching: new Set(), pet: null, hat: null, atPortal: null });
  }

  preload(): void {
    queueScreens(this, this.zone);
    for (const n of this.screen.npcs) if (manifest.characters[n.sprite]) queueCharacter(this, n.sprite);
    for (const m of this.screen.monsters) queueMonster(this, m.id);
    queueCharacter(this, PLAYER);
    if (!this.req.attract) queuePet(this, slot().inventory.pet);
  }

  create(): void {
    Object.assign(currentRoom, { zone: this.zone, screen: this.screenName });
    this.add.image(0, 0, screenKey(this.zone, this.screenName)).setOrigin(0).setScale(2);
    if (DARK_SCREENS.has(`${this.zone}/${this.screenName}`)) this.add.rectangle(0, 0, 640, 360, 0xffffff, 0.08).setOrigin(0).setBlendMode(Phaser.BlendModes.ADD);
    // NPCs whose art isn't made yet are skipped (noted in ASSET_REPORT.md).
    for (const n of this.screen.npcs) if (manifest.characters[n.sprite]) this.addNpc(n.id, n.sprite, n.x, n.y, n.face);
    this.addMonsters();

    if (!this.req.attract) {
      const at = this.req.at ?? this.screen.entries[this.req.entry ?? ''] ?? this.portalArrival() ?? Object.values(this.screen.entries)[0] ?? [320, 300];
      this.player = addChar(this, PLAYER, at[0], at[1]);
      this.face = at[1] > 180 ? 'north' : 'south';
      pose(this.player, PLAYER, 'idle', this.face);
      this.inExit = exitAt(this.screen, at) !== null;
      for (const t of this.things) if (t.kind === 'monster' && this.dist(at, t) < t.range) this.touching.add(t.id);
      this.atPortal = this.portalNear(at);
      const petId = slot().inventory.pet;
      if (petId && manifest.v1px.pets) this.pet = new Follower(this, petId, at);
      const hatId = slot().inventory.hat;
      if (hatId) this.hat = new Hat(this, this.player, hatId);
    }

    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      up: kb.addKey(K.UP, false), down: kb.addKey(K.DOWN, false), left: kb.addKey(K.LEFT, false), right: kb.addKey(K.RIGHT, false),
      w: kb.addKey(K.W, false), a: kb.addKey(K.A, false), s: kb.addKey(K.S, false), d: kb.addKey(K.D, false),
    };
    // Listen to key-down itself: polling "just pressed" misses taps shorter than a frame.
    const press = () => (this.pressed = true);
    kb.on('keydown-SPACE', press);
    kb.on('keydown-ENTER', press);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.tap(p.worldX, p.worldY));
    roomActions.interact = () => !this.blocked() && this.near && this.interact(this.near);
    this.events.once('shutdown', () => {
      roomActions.interact = () => {};
      useSession.getState().setPrompt(null);
    });
    this.cameras.main.fadeIn(this.fast() ? 60 : 200, 0, 0, 0);
    if (!this.req.attract) this.greet();
  }

  private fast(): boolean {
    return reducedMotion(this.req.attract ? null : slot().settings.reducedMotion);
  }

  private dist(p: Pt | { x: number; y: number }, t: { x: number; y: number }): number {
    const [x, y] = Array.isArray(p) ? p : [p.x, p.y];
    return Math.hypot(x - t.x, (y - t.y) * 1.4);
  }

  private addNpc(id: string, charId: string, x: number, y: number, face: Facing): void {
    const s = addChar(this, charId, x, y);
    pose(s, charId, 'idle', face);
    if (!manifest.characters[charId]!.anims.idle) this.tweens.add({ targets: s, y: y - 1, duration: 700, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [1] }); // gentle bob
    const name = id === 'headmaster' ? HEADMASTER.name : id === 'merchant' ? MERCHANT.name : id === 'shopkeeper' ? 'Shopkeeper' : (MENTORS[this.zone]?.speaker.name ?? 'Mentor');
    this.things.push({ kind: 'npc', id, name, x, y, range: 56, sprite: s, charId });
  }

  private addMonsters(): void {
    const defeated = this.req.attract ? [] : slot().progress.defeated;
    for (const pm of this.screen.monsters) {
      const info = manifest.monsters[pm.id]!;
      const def = monster(pm.id);
      monsterAnims(this, pm.id);
      // Overworld: everything at 1× (bosses are 96 px here, 2× in battle).
      const s = this.add.sprite(pm.x, pm.y, info.atlas).setOrigin(0.5, info.baseline / info.cell).setDepth(pm.y).play(`${pm.id}_idle`);
      if (MONSTER_FACES_RIGHT.has(pm.id)) s.setFlipX(true);
      const top = pm.y - info.size - 4;
      const beaten = defeated.includes(pm.id);
      const badge = beaten ? '✓' : def.boss && !bossReady(zoneRegulars(def.zone), defeated) ? '🔒' : null;
      if (badge) this.add.text(pm.x, top, badge, { fontFamily: 'Fredoka', fontSize: '16px', color: '#ffffff', stroke: '#1b1410', strokeThickness: 3, resolution: 3 }).setOrigin(0.5, 1).setDepth(pm.y + 1);
      this.things.push({ kind: 'monster', id: pm.id, name: def.name, x: pm.x, y: pm.y, range: def.boss ? 80 : 56, sprite: s, beaten });
    }
  }

  /** The zone's mentor says hello on your first visit this session, until you've beaten something there. */
  private greet(): void {
    const m = MENTORS[this.zone];
    if (!m || greeted.has(this.zone) || !manifest.characters[m.speaker.sprite]) return;
    greeted.add(this.zone);
    if (!slot().progress.defeated.some((id) => monster(id).zone === this.zone)) this.time.delayedCall(400, () => useSession.getState().say(m.speaker, [...m.hello, m.tips[0]!]));
  }

  /** Keeper Gale sells an Insurance Scroll: a premium now, so a disaster later only costs the deductible. */
  private offerScroll(speaker: { name: string; sprite: string }, tipLine: string): void {
    const s = useSession.getState();
    const sl = slot();
    if (sl.inventory.owned.includes(SCROLL)) return s.say(speaker, [tipLine, 'You already carry an Insurance Scroll. It pays out once, when disaster strikes.']);
    const pitch = [tipLine, `Want an Insurance Scroll? It costs ${SCROLL_PRICE} coins: that's your premium. If Catastrophe Leviathan's Perfect Storm hits you, you only pay a 6-point deductible, and Mishap Crab can't break your shield.`];
    if (sl.progress.coins < SCROLL_PRICE) return s.say(speaker, [...pitch, `Come back when you've saved ${SCROLL_PRICE} coins.`]);
    s.say(speaker, pitch, undefined, [
      { label: `Buy it (${SCROLL_PRICE} coins)`, run: () => { const r = buyScroll(slot()); if (r.ok) { useSave.getState().edit(() => r.slot); s.say(speaker, ['Smart choice. Insurance is a small cost now that protects you from a big loss later.']); } } },
      { label: 'No, thanks', run: () => s.say(speaker, ["Fair enough. Remember: without insurance, you pay for the whole disaster yourself."]) },
    ]);
  }

  /** Coming back out of a bonus zone: stand in front of its portal. */
  private portalArrival(): Pt | null {
    const from = this.req.entry?.replace(/^from_/, '');
    const p = this.screen.portals?.find((x) => x.to === from);
    return p ? [portalSpot(p)[0], portalSpot(p)[1] + 30] : null;
  }

  private portalNear(at: Pt): string | null {
    return this.screen.portals?.find((p) => Math.hypot(at[0] - portalSpot(p)[0], at[1] - portalSpot(p)[1]) < PORTAL_REACH)?.to ?? null;
  }

  private blocked(): boolean {
    const s = useSession.getState();
    return !this.player || this.leaving || s.screen !== 'play' || s.dialogue !== null || s.battle !== null || s.editing || s.panel !== null || s.celebrate !== null;
  }

  private tap(x: number, y: number): void {
    if (this.blocked()) return;
    const hit = this.things.find((t) => t.sprite.getBounds().contains(x, y));
    this.pending = hit ?? null;
    this.target = hit ? [hit.x, hit.y + 6] : [x, y];
  }

  private interact(t: Thing): void {
    const s = useSession.getState();
    const p = this.player!;
    this.target = null;
    this.pending = null;
    if (t.kind === 'npc') {
      const dx = p.x - t.x, dy = p.y - t.y;
      pose(t.sprite, t.charId!, 'idle', Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'west' : 'east') : dy < 0 ? 'north' : 'south');
      sfx('talk');
      if (t.id === 'headmaster') s.say(HEADMASTER, headmasterTalk(slot().progress.zonesCleared));
      else if (t.id === 'merchant') s.say(MERCHANT, MERCHANT_TALK, () => s.setPanel('shop'));
      else if (t.id === 'shopkeeper') s.say({ name: 'Shopkeeper', sprite: 'merchant' }, SHOPKEEPER_TALK, () => s.setPanel('shop'));
      else {
        const m = MENTORS[this.zone]!;
        const i = (tips[this.zone] = ((tips[this.zone] ?? 0) + 1) % m.tips.length);
        if (this.zone === 'stormwatch_coast') this.offerScroll(m.speaker, m.tips[i]!);
        else s.say(m.speaker, [m.tips[i]!]);
      }
      return;
    }
    const def = monster(t.id);
    if (def.boss) {
      const regs = zoneRegulars(def.zone);
      const done = regs.filter((id) => slot().progress.defeated.includes(id)).length;
      const guide = MENTORS[this.zone]?.speaker ?? HEADMASTER;
      if (done < regs.length) return s.say(guide, [`${def.name} won't fight yet. Beat the other monsters first (${done} of ${regs.length} done).`]);
    }
    s.fight(t.id, { kind: 'room', zone: this.zone, screen: this.screenName, at: [p.x, p.y] });
  }

  private travel(to: SceneReq): void {
    this.leaving = true;
    useSession.getState().setPrompt(null);
    sfx('door');
    this.cameras.main.fadeOut(this.fast() ? 60 : 180, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => useSession.getState().go(to));
  }

  /** Test hooks. */
  where(): { screen: string; at: Pt | null } {
    return { screen: this.screenName, at: this.player && this.sys.isActive() ? [this.player.x, this.player.y] : null };
  }
  teleport(x: number, y: number): void {
    this.player?.setPosition(x, y);
    this.target = null;
  }

  override update(_t: number, dtMs: number): void {
    const pressed = this.pressed;
    this.pressed = false;
    this.hat?.update();
    if (this.blocked()) {
      if (this.player && !this.leaving) pose(this.player, PLAYER, 'idle', this.face);
      this.wasBlocked = true;
      return;
    }
    const fresh = !this.wasBlocked; // the key press that closed a dialogue mustn't start another
    this.wasBlocked = false;
    const p = this.player!;
    const k = this.keys;
    let vx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0) + pad.dx;
    let vy = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0) + pad.dy;
    if (vx || vy) [this.target, this.pending] = [null, null];
    else if (this.target) {
      if (this.pending && this.dist(p, this.pending) < this.pending.range) return this.interact(this.pending);
      const dx = this.target[0] - p.x, dy = this.target[1] - p.y, d = Math.hypot(dx, dy);
      if (d < 3) this.target = null;
      else [vx, vy] = [dx / d, dy / d];
    }

    if (vx || vy) {
      const len = Math.hypot(vx, vy), dist = (SPEED * dtMs) / 1000;
      const next = step([p.x, p.y], (vx / len) * dist, (vy / len) * dist, (q) => canStand(q, this.screen.walk, this.screen.block));
      if (next[0] === p.x && next[1] === p.y) this.target = null;
      p.setPosition(next[0], next[1]);
      this.face = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 'west' : 'east') : vy < 0 ? 'north' : 'south'; // diagonals: nearest drawn direction
      pose(p, PLAYER, 'walk', this.face);
    } else pose(p, PLAYER, 'idle', this.face);
    p.setDepth(p.y);
    currentRoom.player = [p.x, p.y];
    this.pet?.update([p.x, p.y], Boolean(vx || vy), dtMs);

    // Bonus-zone portals on the Crossroads portal ring.
    const portal = this.portalNear([p.x, p.y]);
    if (portal && portal !== this.atPortal) {
      this.atPortal = portal;
      if (canEnter(portal, slot().progress.zonesCleared, true)) return this.travel({ kind: 'room', zone: portal, entry: 'from_crossroads_observatory/portal_ring' });
      useSession.getState().say(MENTORS.crossroads_observatory!.speaker, [`The ${zoneById(portal).name} portal is still sealed. It opens after you beat all six zone bosses.`]);
      return;
    }
    if (!portal) this.atPortal = null;

    const exit = exitAt(this.screen, [p.x, p.y]);
    if (exit && !this.inExit) {
      const t = exitTarget(this.zone, exit);
      // Arrival: the exit's enter_at, else (crossing into another zone) that screen's "from_<zone>" spot.
      return this.travel(t.kind === 'world' ? { kind: 'world' } : { kind: 'room', zone: t.zone, screen: t.screen, at: exit.enterAt ?? undefined, entry: exit.enterAt ? undefined : `from_${this.zone}` });
    }
    this.inExit = exit !== null;

    // Walking into a monster you haven't beaten starts the battle.
    for (const t of this.things) {
      if (t.kind !== 'monster') continue;
      const close = this.dist(p, t) < t.range * 0.6;
      if (close && !this.touching.has(t.id)) {
        this.touching.add(t.id);
        if (!t.beaten) return this.interact(t);
      } else if (!close) this.touching.delete(t.id);
    }

    let best: Thing | null = null;
    for (const t of this.things) if (this.dist(p, t) < t.range && (!best || this.dist(p, t) < this.dist(p, best))) best = t;
    this.near = best;
    useSession.getState().setPrompt(best ? `${best.kind === 'npc' ? 'Talk to' : best.beaten ? 'Rematch' : 'Battle'} ${best.name}` : null);
    if (pressed && fresh && best) this.interact(best);
  }
}
