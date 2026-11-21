import { useEffect, useRef, useState } from 'react';
import { Market } from './Market.tsx';
import { Wheel } from './Wheel.tsx';
import { MONSTERS } from '../core/monsters.ts';
import { buy, equip, grantReward, petLooks, restyle, SCROLL, setPetLook } from '../core/shop.ts';
import type { Item } from '../data/items.ts';
import { BULL_CALF, item, ITEMS, shopItems, tamedMonster } from '../data/items.ts';
import type { Rarity } from '../data/v2.ts';
import { art, hatArt } from '../data/v2.ts';
import { placeName } from '../data/zones.ts';
import { assetUrl } from '../game/stage.ts';
import { REDEEM_MESSAGES, REWARD_ONLY_ITEMS, redeem } from '../rewards/redeem.ts';
import { sfx } from '../audio.ts';
import { useSave, useSlot } from '../state/save.ts';
import { useSession } from '../state/session.ts';
import { AvatarView } from './AvatarView.tsx';
import { LookEditor } from './LookEditor.tsx';
import { MoneyCheck } from './MoneyCheck.tsx';
import { Progress } from './Progress.tsx';

/** An item's picture: a hat's icon, or a pet's portrait (in a district's look, if given). */
export function itemImage(it: Item, look?: string | null): string | null {
  if (it.kind === 'hat') return hatArt(it.id) ? assetUrl(hatArt(it.id)!.icon) : null;
  if (it.id === 'pet-bull') return assetUrl(art.monster(BULL_CALF.species, BULL_CALF.look, 'portrait'));
  const m = MONSTERS[tamedMonster(it.id) ?? ''];
  if (!m) return null;
  return assetUrl(m.boss ? art.boss(m.art, 'portrait') : art.monster(m.art, look ?? m.zone, 'portrait'));
}
export function ItemArt({ it, size = 72, look }: { it: Item; size?: number; look?: string | null }) {
  const url = itemImage(it, look);
  if (!url) return <div style={{ width: size, height: size }} role="img" aria-label={it.name} />;
  return <img src={url} alt={it.name} width={size} height={size} draggable={false} style={{ width: size, height: size, objectFit: 'contain' }} />;
}

const RARITY_LABEL: Record<Rarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
const RARITY_STYLE: Record<Rarity, string> = { common: 'bg-[#e9ecef] text-[#212529]', rare: 'bg-[#d0ebff] text-[#0b3c6e]', epic: 'bg-[#e5dbff] text-[#3b1d8f]', legendary: 'bg-[#ffec99] text-[#5c3d00]' };
/** Rarity is always written out, never shown by colour alone. The labels are drafts. */
function RarityTag({ r }: { r: Rarity }) {
  return <span className={`rounded-sm border-2 border-frame px-1.5 text-lg font-semibold leading-tight ${RARITY_STYLE[r]}`}>{RARITY_LABEL[r]}</span>;
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/55 p-3" role="dialog" aria-label={title}>
      <div className={`panel flex max-h-full w-full flex-col gap-3 overflow-auto p-4 ${wide ? 'max-w-[46rem]' : 'max-w-[32rem]'}`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-3xl font-bold">{title}</h2>
          <button className="btn btn-quiet" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Panels() {
  const panel = useSession((s) => s.panel);
  const celebrate = useSession((s) => s.celebrate);
  const close = () => useSession.getState().setPanel(null);
  return (
    <>
      {panel === 'shop' && <Shop onClose={close} />}
      {panel === 'bag' && <Bag onClose={close} />}
      {panel === 'pets' && <Bag onClose={close} only="pet" />}
      {panel === 'style' && <Style onClose={close} />}
      {panel === 'redeem' && <Redeem onClose={close} />}
      {panel === 'progress' && <Progress onClose={close} />}
      {panel === 'check' && <MoneyCheck which="post" onDone={close} />}
      {panel === 'wheel' && (
        <Modal title="Daily Wheel" onClose={close}>
          <Wheel />
        </Modal>
      )}
      {panel === 'market' && (
        <Modal title="Stock Board" onClose={close} wide>
          <Market />
        </Modal>
      )}
      {celebrate && <Celebrate items={celebrate} />}
    </>
  );
}

// Only built when VITE_MP_URL is set: without it, cards are checked on the device only.
const claimOnce = import.meta.env.VITE_MP_URL ? () => import('../net/redeemCheck.ts') : null;

function Shop({ onClose }: { onClose: () => void }) {
  const s = useSlot()!;
  const [msg, setMsg] = useState('');
  const [tryOn, setTryOn] = useState<string | null>(s.inventory.hat);
  const items = shopItems(REWARD_ONLY_ITEMS);
  const laurel = item('hat-laurel')!;
  const doBuy = (it: Item) => {
    const r = buy(s, it.id);
    if (!r.ok) return setMsg(r.reason === 'coins' ? `You need ${it.price! - s.progress.coins} more coins. Battles and saving up will get you there!` : 'You can’t buy that.');
    sfx('coins');
    useSave.getState().edit(() => equip(r.slot, it.kind, it.id));
    setMsg(`You bought the ${it.name} and put it on!`);
  };
  const picked = tryOn ? item(tryOn) : undefined;
  return (
    <Modal title="Shopkeeper Bix’s Hats" onClose={onClose} wide>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex shrink-0 flex-col items-center gap-1 self-center rounded-md bg-paper-dark px-4 py-2 sm:sticky sm:top-0 sm:self-start">
          <AvatarView look={s.look} hat={tryOn} tall={110} label={picked ? `You, trying on the ${picked.name}` : 'You, with no hat'} />
          <p className="text-lg font-semibold" role="status">{picked ? `Trying on: ${picked.name}` : 'No hat'}</p>
          <p className="text-xl"><strong>🪙 {s.progress.coins}</strong> coins</p>
        </div>
        <ul className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3">
          {items.map((it) => {
            const owned = s.inventory.owned.includes(it.id);
            return (
              <li key={it.id} className={`flex flex-col items-center gap-1 rounded-sm border-2 card p-2 text-center ${tryOn === it.id ? 'border-[#7DF3FF] outline outline-2 outline-[#7DF3FF]' : 'border-frame'}`}>
                <button className="flex flex-col items-center" onClick={() => setTryOn(it.id)} aria-label={`Try on the ${it.name}`}><ItemArt it={it} /></button>
                <p className="text-lg font-semibold leading-tight">{it.name}</p>
                {it.rarity && <RarityTag r={it.rarity} />}
                {owned ? <button className="btn btn-quiet w-full" onClick={() => (useSave.getState().edit((x) => equip(x, 'hat', it.id)), setTryOn(it.id), setMsg(`You put on the ${it.name}.`))}>{s.inventory.hat === it.id ? '✓ Wearing' : '✓ Owned · wear'}</button> : <button className="btn w-full" onClick={() => doBuy(it)} disabled={s.progress.coins < it.price!}>🪙 {it.price}</button>}
              </li>
            );
          })}
          <li className="flex flex-col items-center gap-1 rounded-sm border-2 border-frame card p-2 text-center">
            <button className="flex flex-col items-center" onClick={() => setTryOn(laurel.id)} aria-label={`Try on the ${laurel.name}`}><ItemArt it={laurel} /></button>
            <p className="text-lg font-semibold leading-tight">{laurel.name}</p>
            <RarityTag r="legendary" />
            <p className="text-lg leading-tight">{s.inventory.owned.includes(laurel.id) ? '✓ Yours' : '🎁 Winner cards only'}</p>
          </li>
        </ul>
      </div>
      <p className="text-lg">The Laurel Wreath and the Bull Calf can’t be bought: they come only from winner cards. Pets aren’t sold either: every monster you beat becomes one.</p>
      {msg && <p className="text-lg font-semibold" role="status">{msg}</p>}
    </Modal>
  );
}

/** The bag: hats and pets you own. `only="pet"` is the Pet Trader's view. Prizes you don't have yet show as locked. */
function Bag({ onClose, only }: { onClose: () => void; only?: 'hat' | 'pet' }) {
  const s = useSlot()!;
  const owned = s.inventory.owned.map(item).filter((x): x is Item => !!x);
  const set = (kind: 'hat' | 'pet', id: string | null) => useSave.getState().edit((x) => equip(x, kind, id));
  const scroll = s.inventory.owned.includes(SCROLL);
  const pet = s.inventory.pet ? item(s.inventory.pet) : undefined;
  const looks = petLooks(s.progress.zonesCleared);
  const canDress = !!pet?.tamed && !pet.legendary;
  return (
    <Modal title={only === 'pet' ? 'Your pets' : 'Your bag'} onClose={onClose} wide>
      {(['hat', 'pet'] as const).filter((k) => !only || k === only).map((kind) => {
        const mine = owned.filter((i) => i.kind === kind);
        const prize = ITEMS.find((i) => i.kind === kind && i.price === null)!;
        return (
          <section key={kind} className="flex flex-col gap-2">
            <h3 className="text-2xl font-bold">{kind === 'hat' ? 'Hats' : 'Pets'}</h3>
            {kind === 'pet' && <p className="text-lg">The first time you beat a monster, it joins you. A pet adds +2 damage to your spells; a boss or the Bull Calf adds +4.</p>}
            <div className="flex flex-wrap gap-2">
              <button className={`btn ${s.inventory[kind] === null ? '' : 'btn-quiet'}`} aria-pressed={s.inventory[kind] === null} onClick={() => set(kind, null)}>{s.inventory[kind] === null ? '✓ ' : ''}None</button>
              {mine.map((it) => (
                <button key={it.id} className={`btn flex items-center gap-2 px-2 ${s.inventory[kind] === it.id ? '' : 'btn-quiet'}`} aria-pressed={s.inventory[kind] === it.id} onClick={() => set(kind, it.id)}>
                  <ItemArt it={it} size={44} look={kind === 'pet' && s.inventory.pet === it.id ? s.inventory.petLook : null} />
                  {s.inventory[kind] === it.id ? '✓ ' : ''}{it.name}{it.legendary ? ' ★' : ''}
                </button>
              ))}
              {!mine.some((i) => i.id === prize.id) && (
                <span className="flex min-h-12 items-center gap-2 rounded-md border-[3px] border-frame bg-[#3A4D73] px-2 text-[1.15rem] font-semibold text-[#C7D3EA]" aria-label={`${prize.name}: locked. It comes only from a ${kind === 'hat' ? 'Winner' : 'Champion'} card.`}>
                  <span className="opacity-60"><ItemArt it={prize} size={44} /></span>🔒 {prize.name}
                </span>
              )}
            </div>
            {!mine.length && <p className="text-lg">None yet. {kind === 'hat' ? 'Visit Shopkeeper Bix in Ledgerhold.' : 'Beat a monster and it becomes your first pet.'}</p>}
            {kind === 'pet' && canDress && (
              <div className="flex flex-col gap-1">
                <h4 className="text-xl font-bold">{pet!.name}’s look</h4>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Pet look">
                  <button role="radio" aria-checked={s.inventory.petLook === null} className={`btn ${s.inventory.petLook === null ? '' : 'btn-quiet'}`} onClick={() => useSave.getState().edit((x) => setPetLook(x, null))}>{s.inventory.petLook === null ? '✓ ' : ''}Home</button>
                  {looks.map((l) => (
                    <button key={l} role="radio" aria-checked={s.inventory.petLook === l} className={`btn flex items-center gap-2 px-2 ${s.inventory.petLook === l ? '' : 'btn-quiet'}`} onClick={() => useSave.getState().edit((x) => setPetLook(x, l))}>
                      <ItemArt it={pet!} size={40} look={l} />{s.inventory.petLook === l ? '✓ ' : ''}{placeName(l)}
                    </button>
                  ))}
                </div>
                <p className="text-lg">Each district boss you beat unlocks that district’s look for your pets.</p>
              </div>
            )}
          </section>
        );
      })}
      {scroll && !only && <p className="text-lg">📜 You carry an Insurance Scroll: it pays out once, against the Volatility Roc’s Perfect Storm.</p>}
    </Modal>
  );
}

/** The Stylist: change your look for free, as often as you like. */
function Style({ onClose }: { onClose: () => void }) {
  const s = useSlot()!;
  return (
    <Modal title="Stylist Juno" onClose={onClose} wide>
      <LookEditor look={s.look} hat={s.inventory.hat} cleared={s.progress.zonesCleared} onChange={(l) => useSave.getState().edit((x) => restyle(x, l))} />
      <p className="text-lg">Changing your look is free. New costume colours unlock when you beat district bosses.</p>
    </Modal>
  );
}

/** Reward cards: type the code, scan the QR code with the camera, or arrive through a #/redeem/ link. */
function Redeem({ onClose }: { onClose: () => void }) {
  const preset = useSession((s) => s.redeemCode);
  const [code, setCode] = useState(preset ?? '');
  const [msg, setMsg] = useState('');
  const [scanning, setScanning] = useState(false);

  const [checking, setChecking] = useState(false);
  const submit = async (text: string) => {
    const s = useSave.getState();
    const cur = s.active === null ? null : s.slots[s.active];
    if (!cur || checking) return;
    const r = redeem(text, cur.redeemed);
    if (!r.ok) return setMsg(REDEEM_MESSAGES[r.reason]);
    if (claimOnce) {
      // With class features on, each printed card works once across all devices.
      setChecking(true);
      const v = await (await claimOnce()).claimOnce(r.code);
      setChecking(false);
      if (v === 'used') return setMsg('This card has already been used on another device. Each card works once.');
    }
    s.edit((x) => grantReward(x, r.code, r.items));
    useSession.getState().setRedeemCode(null);
    useSession.getState().setPanel(null);
    useSession.getState().setCelebrate([...r.items]);
  };
  useEffect(() => {
    if (preset) void submit(preset);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal title="Redeem a card" onClose={() => (useSession.getState().setRedeemCode(null), onClose())}>
      <p className="text-lg">Won a Make Bank card? Type the code under the QR code, or scan it with the camera.</p>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => (e.preventDefault(), void submit(code))}>
        <input autoFocus aria-label="Card code" placeholder="MB-W1234-ABCDE" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="min-h-12 flex-1 field px-3 font-mono text-2xl tracking-wider" />
        <button type="submit" className="btn" disabled={!code.trim() || checking}>{checking ? 'Checking…' : 'Redeem'}</button>
      </form>
      {scanning ? <Scanner onCode={(c) => (setScanning(false), setCode(c), void submit(c))} onStop={() => setScanning(false)} /> : <button className="btn btn-quiet" onClick={() => setScanning(true)}>📷 Scan the QR code</button>}
      {msg && <p className="text-lg font-semibold t-bad" role="alert">✗ {msg}</p>}
      <p className="text-lg">Each card works once per save. The camera stays on this device: nothing is sent anywhere.</p>
    </Modal>
  );
}

interface Detector { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> }

/** Camera QR scanner: the browser's BarcodeDetector where it exists (Chromebooks), else the bundled jsQR (iPad Safari). */
function Scanner({ onCode, onStop }: { onCode: (code: string) => void; onStop: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stopped) return;
        video.current!.srcObject = stream;
        await video.current!.play();
        const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
        const detector = BD ? new BD({ formats: ['qr_code'] }) : null;
        const jsQR = detector ? null : (await import('jsqr')).default;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        const tick = async () => {
          if (stopped) return;
          const v = video.current!;
          if (v.readyState >= 2) {
            let text: string | null = null;
            if (detector) text = (await detector.detect(v))[0]?.rawValue ?? null;
            else if (jsQR) {
              canvas.width = v.videoWidth;
              canvas.height = v.videoHeight;
              ctx.drawImage(v, 0, 0);
              text = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data ?? null;
            }
            if (text) return onCode(text);
          }
          raf = requestAnimationFrame(() => void tick());
        };
        void tick();
      } catch {
        setErr('The camera isn’t available. You can type the code instead.');
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);
  return (
    <div className="flex flex-col gap-2">
      {err ? <p className="text-lg" role="alert">{err}</p> : <video ref={video} className="max-h-64 w-full rounded-md border-4 border-frame bg-black object-cover" muted playsInline aria-label="Camera view" />}
      <button className="btn btn-quiet" onClick={onStop}>Stop scanning</button>
    </div>
  );
}

/** Confetti and the prize, with a button to wear it or bring it along. */
function Celebrate({ items }: { items: string[] }) {
  const its = items.map(item).filter((x): x is Item => !!x);
  const done = () => useSession.getState().setCelebrate(null);
  const use = () => {
    for (const it of its) useSave.getState().edit((x) => equip(x, it.kind, it.id));
    done();
  };
  useEffect(() => sfx('victory'), []);
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center overflow-hidden bg-black/60 p-3" role="dialog" aria-label="You unlocked a prize">
      <div className="confetti" aria-hidden>{Array.from({ length: 40 }, (_, i) => <span key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 10) * 0.12}s`, background: ['#ffd43b', '#63e6be', '#f783ac', '#74c0fc'][i % 4] }} />)}</div>
      <div className="panel relative flex w-[min(30rem,100%)] flex-col items-center gap-3 p-5 text-center">
        <h2 className="title-text text-4xl font-bold">You unlocked a prize!</h2>
        {its.map((it) => (
          <div key={it.id} className="flex flex-col items-center gap-2">
            <div className="flex h-28 items-end"><ItemArt it={it} size={112} /></div>
            <p className="text-2xl font-bold">{it.name}</p>
            <p className="text-lg">{it.kind === 'hat' ? 'A winner’s crown of laurel leaves.' : 'A loyal legendary companion: +4 damage in battle.'}</p>
          </div>
        ))}
        <div className="flex gap-2">
          <button className="btn" autoFocus onClick={use}>{its.some((i) => i.kind === 'hat') ? 'Wear it now' : 'Bring it along'}</button>
          <button className="btn btn-quiet" onClick={done}>Later</button>
        </div>
      </div>
    </div>
  );
}
