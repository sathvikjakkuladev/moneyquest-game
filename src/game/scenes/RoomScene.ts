import * as Phaser from 'phaser';
import { canSpin, today } from '../../core/wheel.ts';
import { sfx } from '../../audio.ts';
import type { Pt } from '../../core/geometry.ts';
import { step } from '../../core/geometry.ts';
import { lookToList } from '../../core/look.ts';
import { monster, zoneRegulars } from '../../core/monsters.ts';
import { ALL_DISTRICTS, bossReady, TOPIC_ZONE_ORDER } from '../../core/progression.ts';
import { postCheckReady } from '../../core/moneyCheck.ts';
import { buyScroll, SCROLL, SCROLL_PRICE } from '../../core/shop.ts';
import { finaleOpen } from '../../core/unlocks.ts';
import type { Speaker } from '../../data/dialogue.ts';
import { ARENA_MASTER, BANKER, BANKER_TALK, HEADMASTER, headmasterTalk, MENTORS, MERCHANT, MERCHANT_TALK, PET_TRADER, PET_TRADER_TALK, QUEST_KEEPER, QUEST_KEEPER_TALK, STYLIST, STYLIST_TALK, TOWNSFOLK } from '../../data/dialogue.ts';
import type { Facing, Screen } from '../../data/rooms.ts';
import { exitAt, exitTarget, ROOMS, standable } from '../../data/rooms.ts';
import { art, CREATURES, LOCATIONS } from '../../data/v2.ts';
import { FINALE, HUB_ID } from '../../data/zones.ts';
import { bridge, useNet } from '../../net/bridge.ts';
import type { Face } from '../../net/protocol.ts';
import { FACES } from '../../net/protocol.ts';
import { slot, useSave } from '../../state/save.ts';
import type { SceneReq } from '../../state/session.ts';
import { useSession } from '../../state/session.ts';
import { Avatar, OVERWORLD_CLIPS, queueAvatar } from '../avatar.ts';
import { addCreature, breathe, monsterImage, SIZE } from '../creature.ts';
import { currentRoom } from '../current.ts';
import { pad, roomActions } from '../input.ts';
import { reducedMotion } from '../motion.ts';
import { Follower, queuePet } from '../pet.ts';
import { RemotePlayers } from '../remote.ts';
import { queue, queueSheet, RENDER, STAGE_H, STAGE_W, stageCamera, whenLoaded } from '../stage.ts';

const SPEED = 120; // px per second on the 640×360 stage
const OVER_DEPTH = 5000; // the overhang layer draws above everything

interface Thing { kind: 'npc' | 'monster' | 'waystone' | 'board'; id: string; name: string; x: number; y: number; range: number; sprite?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image; npc?: string; beaten?: boolean }

const greeted = new Set<string>(); // each guide says hello once per session
const tips: Record<string, number> = {};
const npcAnim = (npc: string) => `npc:${npc}:talk`;

/** One screen of a place: ground, props, NPCs, monsters, exits and the walking player. */
export class RoomScene extends Phaser.Scene {
  private req!: Extract<SceneReq, { kind: 'room' }>;
  private zone = '';
  private screenName = '';
  private screen!: Screen;
  private player: Avatar | null = null;
  private face: Facing = 'south';
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
  private style = ''; // the look and hat drawn now (see syncLook)
  private petKey = '';
  private talking: string | null = null;
  private remotes: RemotePlayers | null = null; // classmates on this screen (multiplayer)

  constructor() {
    super('room');
  }

  init(req: Extract<SceneReq, { kind: 'room' }>): void {
    this.req = req;
    this.zone = ROOMS[req.zone] ? req.zone : HUB_ID;
    const rooms = ROOMS[this.zone]!;
    this.screenName = req.screen && rooms.screens[req.screen] ? req.screen : rooms.start;
    this.screen = rooms.screens[this.screenName]!;
    Object.assign(this, { player: null, things: [], target: null, pending: null, near: null, face: 'south', wasBlocked: true, pressed: false, leaving: false, touching: new Set(), pet: null, style: '', petKey: '', talking: null, remotes: null });
  }

  private get art() {
    return LOCATIONS[this.zone]!.screens[this.screenName]!;
  }

  preload(): void {
    queue(this, art.ground(this.zone, this.screenName));
    if (this.art.over) queue(this, art.over(this.zone, this.screenName));
    for (const p of this.art.props) queue(this, art.prop(this.zone, p.p));
    for (const n of this.screen.npcs) { const c = CREATURES.npcs[n.sprite]?.talk; if (c) queueSheet(this, c.image, c.cell); }
    for (const m of this.screen.monsters) queue(this, monsterImage(monster(m.id), 'front'));
    if (!this.req.attract) {
      const s = slot();
      queueAvatar(this, s.look, s.inventory.hat, OVERWORLD_CLIPS);
      queuePet(this, s.inventory.pet, s.inventory.petLook);
    }
  }

  create(): void {
    Object.assign(currentRoom, { zone: this.zone, screen: this.screenName });
    stageCamera(this);
    this.add.image(0, 0, art.ground(this.zone, this.screenName)).setOrigin(0).setDisplaySize(STAGE_W, STAGE_H).setDepth(-1000);
    // Props are separate sprites sorted by where they stand, so the player walks behind and in front of them.
    for (const p of this.art.props) this.add.image(p.x, p.y, art.prop(this.zone, p.p)).setOrigin(0.5, 1).setDisplaySize(p.w, p.h).setFlipX(Boolean(p.flip)).setDepth(p.y);
    if (this.art.over) this.add.image(0, 0, art.over(this.zone, this.screenName)).setOrigin(0).setDisplaySize(STAGE_W, STAGE_H).setDepth(OVER_DEPTH);
    for (const n of this.screen.npcs) this.addNpc(n.id, n.sprite, n.x, n.y);
    this.addMonsters();
    if (this.screen.waystone) this.things.push({ kind: 'waystone', id: 'waystone', name: 'the waystone', x: this.screen.waystone[0], y: this.screen.waystone[1], range: 46 });
    // The notice board in Ledgerhold's plaza is the Stock Board (its hotspot comes from the art set).
    for (const d of this.art.doors) if (d.kind === 'interact' && d.target === 'ui:quest-board') this.things.push({ kind: 'board', id: 'market', name: 'the Stock Board', x: d.rect[0] + d.rect[2] / 2, y: d.rect[1] + d.rect[3], range: 50 });

    if (!this.req.attract) {
      const s = slot();
      const at = this.req.at ?? this.screen.entries[this.req.entry ?? ''] ?? this.screen.entries.arrival ?? this.screen.entries.default ?? [320, 240];
      this.player = new Avatar(this, at[0], at[1], s.look, s.inventory.hat, SIZE.player);
      this.style = this.styleOf();
      this.face = this.req.entry === `from_${this.neighbour('top')}` ? 'south' : at[1] > 300 ? 'north' : 'south';
      this.pose(false);
      this.inExit = exitAt(this.screen, at) !== null;
      for (const t of this.things) if (t.kind === 'monster' && this.dist(at, t) < t.range) this.touching.add(t.id);
      this.syncLook();
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
      this.remotes?.destroy(this.player?.keys);
      this.remotes = null;
      bridge.me = null;
      roomActions.interact = () => {};
      useSession.getState().setPrompt(null);
    });
    this.cameras.main.fadeIn(this.fast() ? 60 : 200, 0, 0, 0);
    if (!this.req.attract) this.greet();
  }

  private neighbour(edge: 'top' | 'bottom' | 'left' | 'right'): string | undefined {
    return this.screen.exits.find((e) => e.edge === edge)?.to ?? undefined;
  }

  private fast(): boolean {
    return reducedMotion(this.req.attract ? null : slot().settings.reducedMotion);
  }

  private dist(p: Pt | { x: number; y: number }, t: { x: number; y: number }): number {
    const [x, y] = Array.isArray(p) ? p : [p.x, p.y];
    return Math.hypot(x - t.x, (y - t.y) * 1.4);
  }

  /** NPCs are drawn from the first frame of their talk clip, which plays while they speak. */
  private addNpc(id: string, npc: string, x: number, y: number): void {
    const c = CREATURES.npcs[npc]?.talk;
    if (!c) return;
    const s = this.add.sprite(x, y, c.image, 0).setOrigin(c.foot[0] / c.cell[0], c.foot[1] / c.cell[1]).setScale(SIZE.npc / c.foot[1]).setDepth(y);
    if (!this.anims.exists(npcAnim(npc))) this.anims.create({ key: npcAnim(npc), frames: this.anims.generateFrameNumbers(c.image, { start: 0, end: c.frames - 1 }), frameRate: 8, repeat: -1 });
    const name = id === 'guide' ? (MENTORS[this.zone]?.speaker.name ?? 'Guide') : (TOWNSFOLK[id]?.name ?? 'Friend');
    this.things.push({ kind: 'npc', id, name, x, y, range: 56, sprite: s, npc });
  }

  private locked(id: string, defeated: readonly string[]): boolean {
    const def = monster(id);
    if (id === FINALE) return !finaleOpen(slot().progress.zonesCleared);
    return def.boss && !bossReady(zoneRegulars(def.zone), defeated);
  }

  private addMonsters(): void {
    const defeated = this.req.attract ? [] : slot().progress.defeated;
    for (const pm of this.screen.monsters) {
      const def = monster(pm.id);
      const tall = def.boss ? SIZE.boss : SIZE.monster;
      const s = addCreature(this, monsterImage(def, 'front'), pm.x, pm.y, tall);
      breathe(this, s, this.fast());
      const beaten = defeated.includes(pm.id);
      const badge = beaten ? '✓' : !this.req.attract && this.locked(pm.id, defeated) ? '🔒' : null;
      if (badge) this.add.text(pm.x, pm.y - tall - 4, badge, { fontFamily: 'Fredoka', fontSize: '18px', color: '#ffffff', stroke: '#1b1410', strokeThickness: 4, resolution: RENDER * 2 }).setOrigin(0.5, 1).setDepth(pm.y + 1);
      this.things.push({ kind: 'monster', id: pm.id, name: def.name, x: pm.x, y: pm.y, range: def.boss ? 80 : 56, sprite: s, beaten });
    }
  }

  /** The district's guide says hello on your first visit this session, until you've beaten something there. */
  private greet(): void {
    const m = MENTORS[this.zone];
    if (!m || greeted.has(this.zone)) return;
    greeted.add(this.zone);
    if (!slot().progress.defeated.some((id) => monster(id).zone === this.zone)) this.time.delayedCall(400, () => useSession.getState().say(m.speaker, [...m.hello, m.tips[0]!]));
  }

  /** The Exchange's guide sells an Insurance Scroll: a premium now, so a disaster later only costs the deductible. */
  private offerScroll(speaker: Speaker, tipLine: string): void {
    const s = useSession.getState();
    const sl = slot();
    if (sl.inventory.owned.includes(SCROLL)) return s.say(speaker, [tipLine, 'You already carry an Insurance Scroll. It pays out once, when disaster strikes.']);
    const pitch = [tipLine, `Want an Insurance Scroll? It costs ${SCROLL_PRICE} coins: that's your premium. If the Volatility Roc's Perfect Storm hits you, you only pay a 6-point deductible.`];
    if (sl.progress.coins < SCROLL_PRICE) return s.say(speaker, [...pitch, `Come back when you've saved ${SCROLL_PRICE} coins.`]);
    s.say(speaker, pitch, undefined, [
      { label: `Buy it (${SCROLL_PRICE} coins)`, run: () => { const r = buyScroll(slot()); if (r.ok) { useSave.getState().edit(() => r.slot); s.say(speaker, ['Smart choice. Insurance is a small cost now that protects you from a big loss later.']); } } },
      { label: 'No, thanks', run: () => s.say(speaker, ['Fair enough. Remember: without insurance, you pay for the whole disaster yourself.']) },
    ]);
  }

  private blocked(): boolean {
    const s = useSession.getState();
    return !this.player || this.leaving || s.screen !== 'play' || s.dialogue !== null || s.battle !== null || s.editing || s.panel !== null || s.celebrate !== null || useNet.getState().open !== null;
  }

  private tap(x: number, y: number): void {
    if (this.blocked()) return;
    const who = this.remotes?.hit(x, y); // a classmate: open their menu (Mute, Report)
    if (who !== undefined) return void useNet.setState({ open: who });
    const hit = this.things.find((t) => (t.sprite ? t.sprite.getBounds().contains(x, y) : Math.hypot(x - t.x, y - (t.y - 14)) < 26));
    this.pending = hit ?? null;
    this.target = hit ? [hit.x, hit.y + (hit.kind === 'waystone' ? 20 : 6)] : [x, y];
  }

  private talk(id: string): void {
    const s = useSession.getState();
    const sl = slot();
    const cleared = sl.progress.zonesCleared;
    if (id === 'mentor') {
      if (postCheckReady(sl, TOPIC_ZONE_ORDER))
        return s.say(HEADMASTER, ['You beat all six topic bosses! Before Phish Fens opens, show me how much you’ve learned.'], undefined, [
          { label: 'Take Money Check 2', run: () => s.setPanel('check') },
          { label: 'Later', run: () => {} },
        ]);
      // After his advice, the Headmaster offers the Daily Wheel (one spin a day).
      const lines = headmasterTalk(TOPIC_ZONE_ORDER.filter((z) => cleared.includes(z)).length, sl.moneyCheck.post !== null, ALL_DISTRICTS.every((z) => cleared.includes(z)));
      if (!canSpin(sl, today())) return s.say(HEADMASTER, [...lines, 'You’ve had your spin on the Daily Wheel today. Come back tomorrow for another!']);
      return s.say(HEADMASTER, [...lines, 'Would you like your free spin on the Daily Wheel today?'], undefined, [
        { label: 'Spin the wheel!', run: () => s.setPanel('wheel') },
        { label: 'Maybe later', run: () => {} },
      ]);
    }
    if (id === 'shopkeeper') return s.say(MERCHANT, MERCHANT_TALK, () => s.setPanel('shop'));
    if (id === 'stylist') return s.say(STYLIST, STYLIST_TALK, () => s.setPanel('style'));
    if (id === 'pet-trader') return s.say(PET_TRADER, PET_TRADER_TALK, () => s.setPanel('pets'));
    if (id === 'quest-keeper') return s.say(QUEST_KEEPER, QUEST_KEEPER_TALK, () => s.setPanel('progress'));
    if (id === 'banker') return s.say(BANKER, [BANKER_TALK[(tips.banker = ((tips.banker ?? -1) + 1) % BANKER_TALK.length)]!]);
    if (id === 'arena-master') {
      const left = ALL_DISTRICTS.filter((z) => !cleared.includes(z)).length;
      return s.say(ARENA_MASTER, cleared.includes(HUB_ID) ? ['You beat the Debt Dragon. All of Vaultspire thanks you! Come back for a rematch any time.'] : left ? [`The Debt Dragon sleeps behind this gate. It wakes when every district boss is beaten: ${left} to go.`] : ['The gate is open. The Debt Dragon is waiting, and its questions mix every topic. Good luck!']);
    }
    const m = MENTORS[this.zone];
    if (!m) return;
    const i = (tips[this.zone] = ((tips[this.zone] ?? 0) + 1) % m.tips.length);
    if (this.zone === 'the-exchange') this.offerScroll(m.speaker, m.tips[i]!);
    else s.say(m.speaker, [m.tips[i]!]);
  }

  private interact(t: Thing): void {
    const s = useSession.getState();
    const p = this.player!.sprite;
    this.target = null;
    this.pending = null;
    if (t.kind === 'waystone') return this.travel({ kind: 'world' });
    if (t.kind === 'board') return (sfx('talk'), s.setPanel('market'));
    if (t.kind === 'npc') {
      sfx('talk');
      return this.talk(t.id);
    }
    const def = monster(t.id);
    if (t.id === FINALE && !finaleOpen(slot().progress.zonesCleared)) return this.talk('arena-master');
    if (def.boss && t.id !== FINALE) {
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

  private styleOf(): string {
    const s = slot();
    return `${lookToList(s.look).join('.')}|${s.inventory.hat ?? ''}`;
  }

  /** Show the current look, hat and pet, including after changing them in a panel while standing
   *  here. Art that wasn't preloaded loads on demand. */
  private syncLook(): void {
    if (!this.player) return;
    const s = slot();
    const style = this.styleOf();
    if (style !== this.style) {
      this.style = style;
      const { look } = s, hat = s.inventory.hat;
      whenLoaded(this, queueAvatar(this, look, hat, OVERWORLD_CLIPS), () => this.style === style && this.player?.restyle(look, hat));
    }
    const petKey = s.inventory.pet ? `${s.inventory.pet}|${s.inventory.petLook ?? ''}` : '';
    if (petKey !== this.petKey) {
      this.petKey = petKey;
      this.pet?.destroy();
      this.pet = null;
      const { pet, petLook } = s.inventory;
      const keys = queuePet(this, pet, petLook);
      if (pet && keys.length) whenLoaded(this, keys, () => { if (this.petKey === petKey && !this.pet && this.player) this.pet = new Follower(this, pet, petLook, [this.player.sprite.x, this.player.sprite.y]); });
    }
  }

  /** Multiplayer: draw classmates on this screen, and tell the network code where we are. */
  private syncRemotes(dtMs: number): void {
    if (this.req.attract) return;
    if (bridge.on && !this.remotes) this.remotes = new RemotePlayers(this);
    if (!bridge.on && this.remotes) (this.remotes.destroy(this.player?.keys), (this.remotes = null));
    this.remotes?.update(dtMs);
    const p = this.player;
    bridge.me = bridge.on && p ? { x: p.sprite.x, y: p.headY - (slot().inventory.hat ? 10 : 0) } : null;
  }

  private tell(moving: boolean): void {
    const p = this.player!.sprite;
    if (bridge.on) bridge.report({ s: `${this.zone}/${this.screenName}`, x: Math.round(p.x), y: Math.round(p.y), f: FACES.indexOf(this.face) as Face, moving });
  }

  /** The avatar is drawn from the front and the back: walking sideways mirrors the front walk. */
  private pose(moving: boolean): void {
    const a = this.player!;
    if (moving) return a.show(this.face === 'north' ? 'walk-back' : 'walk', this.face === 'west', false, this.face === 'east' || this.face === 'west');
    if (this.face === 'north') {
      a.show('walk-back');
      a.sprite.anims.pause(a.sprite.anims.currentAnim?.frames[0]);
    } else a.show('idle', this.face === 'west');
  }

  /** NPCs move their mouths while their line is on screen. */
  private syncTalk(): void {
    const who = useSession.getState().dialogue?.speaker.sprite ?? null;
    if (who === this.talking) return;
    this.talking = who;
    for (const t of this.things) {
      if (t.kind !== 'npc' || !(t.sprite instanceof Phaser.GameObjects.Sprite)) continue;
      if (t.npc === who && !this.fast()) t.sprite.play(npcAnim(t.npc!), true);
      else (t.sprite.anims.stop(), t.sprite.setFrame(0));
    }
  }

  /** Test hooks. */
  where(): { screen: string; at: Pt | null } {
    return { screen: this.screenName, at: this.player && this.sys.isActive() ? [this.player.sprite.x, this.player.sprite.y] : null };
  }
  teleport(x: number, y: number): void {
    this.player?.sprite.setPosition(x, y);
    this.target = null;
  }

  override update(_t: number, dtMs: number): void {
    const pressed = this.pressed;
    this.pressed = false;
    this.syncLook();
    this.syncTalk();
    this.syncRemotes(dtMs);
    if (this.blocked()) {
      if (this.player && !this.leaving) (this.pose(false), this.tell(false));
      this.wasBlocked = true;
      return;
    }
    const fresh = !this.wasBlocked; // the key press that closed a dialogue mustn't start another
    this.wasBlocked = false;
    const p = this.player!.sprite;
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
      const next = step([p.x, p.y], (vx / len) * dist, (vy / len) * dist, (q) => standable(this.screen, q));
      if (next[0] === p.x && next[1] === p.y) this.target = null;
      p.setPosition(next[0], next[1]);
      this.face = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 'west' : 'east') : vy < 0 ? 'north' : 'south'; // diagonals: nearest drawn direction
      this.pose(true);
    } else this.pose(false);
    p.setDepth(p.y);
    this.tell(Boolean(vx || vy));
    currentRoom.player = [p.x, p.y];
    this.pet?.update([p.x, p.y], Boolean(vx || vy), dtMs);

    const exit = exitAt(this.screen, [p.x, p.y]);
    if (exit && !this.inExit) {
      const t = exitTarget(this.zone, exit);
      // Arrival: the exit's enter_at, else the next screen's "from_<this screen>" spot.
      return this.travel(t.kind === 'world' ? { kind: 'world' } : { kind: 'room', zone: t.zone, screen: t.screen, at: exit.enterAt ?? undefined, entry: exit.enterAt ? undefined : `from_${this.screenName}` });
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
    useSession.getState().setPrompt(best ? (best.kind === 'waystone' ? 'Open the world map' : best.kind === 'board' ? 'Open the Stock Board' : `${best.kind === 'npc' ? 'Talk to' : best.beaten ? 'Rematch' : 'Battle'} ${best.name}`) : null);
    if (pressed && fresh && best) this.interact(best);
  }
}
