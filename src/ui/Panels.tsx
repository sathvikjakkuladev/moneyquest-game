import { useEffect, useRef, useState } from 'react';
import { buy, equip, grantReward, SCROLL } from '../core/shop.ts';
import { HAT_ART } from '../data/hats.ts';
import type { Item } from '../data/items.ts';
import { item, shopItems } from '../data/items.ts';
import { manifest } from '../game/manifest.ts';
import { pixelMapCanvas } from '../game/pixelMap.ts';
import { REDEEM_MESSAGES, REWARD_ONLY_ITEMS, redeem } from '../rewards/redeem.ts';
import { sfx } from '../audio.ts';
import { useSave, useSlot } from '../state/save.ts';
import { useSession } from '../state/session.ts';
import { MoneyCheck } from './MoneyCheck.tsx';
import { Progress } from './Progress.tsx';

type Frames = Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
const atlasCache = new Map<string, Promise<{ frames: Frames; size: { w: number; h: number } }>>();
const loadAtlas = (json: string) => {
  let p = atlasCache.get(json);
  if (!p) atlasCache.set(json, (p = fetch(manifest.basePath + json).then((r) => r.json()).then((j) => ({ frames: j.frames, size: j.meta.size }))));
  return p;
};

/** An item's pixel art: hats from their code pixel maps, pets from the pixelized pet sheet. */
export function ItemArt({ it, scale = 2 }: { it: Item; scale?: number }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [atlas, setAtlas] = useState<{ frames: Frames; size: { w: number; h: number } } | null>(null);
  const src = it.kind === 'pet' ? (it.tamed ? manifest.tamed : it.art === 'pet_bull_calf' ? manifest.v1px.pet_bull_calf_walk : manifest.v1px.pets) : null;
  useEffect(() => {
    if (it.kind === 'hat' && canvasRef.current) {
      const c = pixelMapCanvas(HAT_ART[it.art]!, scale * 2);
      c.style.imageRendering = 'pixelated';
      canvasRef.current.replaceChildren(c);
    }
    if (src) void loadAtlas(src.json).then(setAtlas);
  }, [it, scale, src]);
  if (it.kind === 'hat') return <div ref={canvasRef} role="img" aria-label={it.name} className="flex h-16 items-center justify-center" />;
  const f = atlas?.frames[it.art === 'pet_bull_calf' ? 'down_0' : it.art]?.frame;
  if (!src || !atlas || !f) return <div className="h-16 w-16" role="img" aria-label={it.name} />;
  return (
    <div role="img" aria-label={it.name} style={{ width: f.w * scale, height: f.h * scale, backgroundImage: `url(${manifest.basePath + src.image})`, backgroundSize: `${atlas.size.w * scale}px ${atlas.size.h * scale}px`, backgroundPosition: `${-f.x * scale}px ${-f.y * scale}px`, imageRendering: 'pixelated' }} />
  );
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
      {panel === 'redeem' && <Redeem onClose={close} />}
      {panel === 'progress' && <Progress onClose={close} />}
      {panel === 'check' && <MoneyCheck which="post" onDone={close} />}
      {celebrate && <Celebrate items={celebrate} />}
    </>
  );
}

function Shop({ onClose }: { onClose: () => void }) {
  const s = useSlot()!;
  const [msg, setMsg] = useState('');
  const items = shopItems(REWARD_ONLY_ITEMS);
  const doBuy = (it: Item) => {
    const r = buy(s, it.id);
    if (!r.ok) return setMsg(r.reason === 'coins' ? `You need ${it.price! - s.progress.coins} more coins. Battles and saving up will get you there!` : 'You can’t buy that.');
    sfx('coins');
    useSave.getState().edit(() => equip(r.slot, it.kind, it.id));
    setMsg(`You bought the ${it.name}${it.kind === 'hat' ? ' and put it on' : ', and it’s following you now'}!`);
  };
  return (
    <Modal title="Banker Bix’s Shop" onClose={onClose} wide>
      <p className="text-xl">You have <strong>🪙 {s.progress.coins} coins</strong>. Pets help in battle (+2 damage, legendary +4).</p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((it) => {
          const owned = s.inventory.owned.includes(it.id);
          return (
            <li key={it.id} className="flex flex-col items-center gap-1 rounded-sm border-2 border-frame bg-white/60 p-2 text-center">
              <div className="flex h-20 items-end"><ItemArt it={it} /></div>
              <p className="text-lg font-semibold leading-tight">{it.name}{it.legendary ? ' ★' : ''}</p>
              {owned ? <p className="text-lg">✓ Owned</p> : <button className="btn w-full" onClick={() => doBuy(it)} disabled={s.progress.coins < it.price!}>🪙 {it.price}</button>}
            </li>
          );
        })}
      </ul>
      <p className="text-lg">The Laurel Wreath and the Bull Calf can’t be bought: they come only from winner cards.</p>
      {msg && <p className="text-lg font-semibold" role="status">{msg}</p>}
    </Modal>
  );
}

function Bag({ onClose }: { onClose: () => void }) {
  const s = useSlot()!;
  const owned = s.inventory.owned.map(item).filter((x): x is Item => !!x);
  const set = (kind: 'hat' | 'pet', id: string | null) => useSave.getState().edit((x) => equip(x, kind, id));
  const scroll = s.inventory.owned.includes(SCROLL);
  return (
    <Modal title="Your bag" onClose={onClose} wide>
      {(['hat', 'pet'] as const).map((kind) => (
        <section key={kind} className="flex flex-col gap-2">
          <h3 className="text-2xl font-bold">{kind === 'hat' ? 'Hats' : 'Pets'}</h3>
          <div className="flex flex-wrap gap-2">
            <button className={`btn ${s.inventory[kind] === null ? '' : 'btn-quiet'}`} aria-pressed={s.inventory[kind] === null} onClick={() => set(kind, null)}>{s.inventory[kind] === null ? '✓ ' : ''}None</button>
            {owned.filter((i) => i.kind === kind).map((it) => (
              <button key={it.id} className={`btn flex items-center gap-2 ${s.inventory[kind] === it.id ? '' : 'btn-quiet'}`} aria-pressed={s.inventory[kind] === it.id} onClick={() => set(kind, it.id)}>
                <span className="flex h-10 items-center [&_canvas]:max-h-10"><ItemArt it={it} scale={1} /></span>
                {s.inventory[kind] === it.id ? '✓ ' : ''}{it.name}
              </button>
            ))}
          </div>
          {!owned.some((i) => i.kind === kind) && <p className="text-lg">None yet. {kind === 'hat' ? 'Visit Banker Bix in the Great Hall.' : 'Pets are sold in the shop, and the Bull Calf comes from a Champion card.'}</p>}
        </section>
      ))}
      {scroll && <p className="text-lg">📜 You carry an Insurance Scroll: it pays out once, against Catastrophe Leviathan’s Perfect Storm.</p>}
    </Modal>
  );
}

/** Reward cards: type the code, scan the QR code with the camera, or arrive through a #/redeem/ link. */
function Redeem({ onClose }: { onClose: () => void }) {
  const preset = useSession((s) => s.redeemCode);
  const [code, setCode] = useState(preset ?? '');
  const [msg, setMsg] = useState('');
  const [scanning, setScanning] = useState(false);

  const submit = (text: string) => {
    const s = useSave.getState();
    const cur = s.active === null ? null : s.slots[s.active];
    if (!cur) return;
    const r = redeem(text, cur.redeemed);
    if (!r.ok) return setMsg(REDEEM_MESSAGES[r.reason]);
    s.edit((x) => grantReward(x, r.code, r.items));
    useSession.getState().setRedeemCode(null);
    useSession.getState().setPanel(null);
    useSession.getState().setCelebrate([...r.items]);
  };
  useEffect(() => {
    if (preset) submit(preset);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal title="Redeem a card" onClose={() => (useSession.getState().setRedeemCode(null), onClose())}>
      <p className="text-lg">Won a MoneyQuest card? Type the code under the QR code, or scan it with the camera.</p>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => (e.preventDefault(), submit(code))}>
        <input autoFocus aria-label="Card code" placeholder="MB-W1234-ABCDE" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="min-h-12 flex-1 rounded-md border-4 border-frame bg-white px-3 font-mono text-2xl tracking-wider" />
        <button type="submit" className="btn" disabled={!code.trim()}>Redeem</button>
      </form>
      {scanning ? <Scanner onCode={(c) => (setScanning(false), setCode(c), submit(c))} onStop={() => setScanning(false)} /> : <button className="btn btn-quiet" onClick={() => setScanning(true)}>📷 Scan the QR code</button>}
      {msg && <p className="text-lg font-semibold text-[#a3271f]" role="alert">✗ {msg}</p>}
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
            <div className="flex h-28 items-end">{it.id === 'hat-laurel' && manifest.v1px.laurel_icon ? <img src={manifest.basePath + manifest.v1px.laurel_icon.image} alt="Laurel Wreath" width={112} height={112} style={{ imageRendering: 'pixelated' }} /> : <ItemArt it={it} scale={3} />}</div>
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
