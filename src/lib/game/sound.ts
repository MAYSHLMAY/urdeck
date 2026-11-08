/* Tiny synthesized sounds (no files to load). */
let ctx: AudioContext | null = null, musicT: any = null, on = true;
const ac = () => { if (!ctx) { try { ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { return null; } } if (ctx!.state === 'suspended') ctx!.resume(); return ctx; };
function tone(f: number, d = 0.12, type: OscillatorType = 'sine', at = 0, vol = 0.12) {
  const c = ac(); if (!c || !on) return;
  const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + at;
  o.type = type; o.frequency.value = f; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + d + 0.02);
}
export const setSound = (v: boolean) => { on = v; if (!v) stopMusic(); };
export const sfx = {
  join: () => { tone(660, 0.1); tone(880, 0.12, 'sine', 0.09); },
  tick: () => tone(520, 0.05, 'square', 0, 0.05),
  go: () => { tone(523, 0.1, 'triangle'); tone(784, 0.18, 'triangle', 0.1); },
  right: () => { tone(660, 0.1, 'triangle'); tone(880, 0.1, 'triangle', 0.1); tone(1175, 0.2, 'triangle', 0.2); },
  wrong: () => { tone(240, 0.22, 'sawtooth', 0, 0.08); tone(180, 0.3, 'sawtooth', 0.18, 0.08); },
  fanfare: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', i * 0.14, 0.12)),
};
export function startMusic() {
  stopMusic(); if (!on) return;
  const notes = [392, 494, 587, 494, 440, 523, 659, 523]; let i = 0;
  musicT = setInterval(() => { tone(notes[i++ % notes.length] / 2, 0.28, 'triangle', 0, 0.045); }, 320);
}
export function stopMusic() { if (musicT) clearInterval(musicT); musicT = null; }
