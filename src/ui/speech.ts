// Read-aloud. Only on-device voices: some browser voices send the text to a server, and this game
// makes no network calls. If a device has no local voice, the read-aloud buttons are hidden.
let cached: SpeechSynthesisVoice | null | undefined;

function voice(): SpeechSynthesisVoice | null {
  if (cached !== undefined) return cached;
  if (typeof speechSynthesis === 'undefined') return (cached = null);
  const all = speechSynthesis.getVoices();
  if (!all.length) return null; // not loaded yet
  const local = all.filter((v) => v.localService && v.lang.toLowerCase().startsWith('en'));
  return (cached = local.find((v) => v.default) ?? local.find((v) => v.lang === 'en-US') ?? local[0] ?? null);
}
if (typeof speechSynthesis !== 'undefined') speechSynthesis.addEventListener?.('voiceschanged', () => (cached = undefined));

export const canSpeak = () => voice() !== null;
export function speak(text: string): void {
  const v = voice();
  if (!v) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = v;
  u.lang = v.lang;
  u.rate = 0.95;
  speechSynthesis.speak(u);
}
export function hush(): void {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}
