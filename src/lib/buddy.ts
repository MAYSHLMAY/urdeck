/* The buddy: a small animated companion. Everything here is rule-based and offline: no AI, no network. */
import { useSyncExternalStore } from 'react';
import { randomKid } from '@/components/game/Avatar';

export type Pers = 'cheer' | 'calm' | 'brief';
export interface BuddyCfg { on: boolean; name: string; av: string; pers: Pers; voice: boolean; side: 'right' | 'left'; pos: { x: number; y: number } | null }
const K = 'ud-buddy-v1';
let cache: BuddyCfg | null = null, raw = '';
const def = (): BuddyCfg => ({ on: true, name: 'Zee', av: 'k:3.2.0.1.0.0.0', pers: 'cheer', voice: false, side: 'right', pos: null });
export function getBuddy(): BuddyCfg {
  let s = ''; try { s = localStorage.getItem(K) || ''; } catch { /* ignore */ }
  if (cache && s === raw) return cache;
  raw = s; let j: any = {}; try { j = JSON.parse(s || '{}'); } catch { /* ignore */ }
  const d = def(); cache = { ...d, ...j, name: String(j.name || d.name).slice(0, 14), av: j.av || d.av || randomKid() }; return cache!;
}
export function setBuddy(p: Partial<BuddyCfg>) {
  const n = { ...getBuddy(), ...p }; try { localStorage.setItem(K, JSON.stringify(n)); } catch { /* ignore */ }
  cache = null; try { dispatchEvent(new Event('ud-buddy')); } catch { /* ignore */ }
}
export const useBuddyCfg = () => useSyncExternalStore(f => { addEventListener('ud-buddy', f); return () => removeEventListener('ud-buddy', f); }, getBuddy, () => def());

/* ---- lines: three personalities ---- */
const P: Record<string, Record<Pers, string[]>> = {
  morning: { cheer: ['Good morning! Ready to learn something?', 'Morning! A few cards will wake your brain up.'], calm: ['Good morning. Take it one card at a time.'], brief: ['Morning. Cards?'] },
  day: { cheer: ['Hey! Perfect time for a quick session.', 'Hi again! Let us do a few cards.'], calm: ['Good afternoon. A short session helps.'], brief: ['Hi. Cards?'] },
  evening: { cheer: ['Good evening! A few cards before bed lock it in.', 'Evening! Short and sweet tonight?'], calm: ['Good evening. A little review before rest.'], brief: ['Evening. Cards?'] },
  due: { cheer: ['You have {n} cards waiting. Shall we?', '{n} cards are ready for you!'], calm: ['{n} cards are due when you are ready.'], brief: ['{n} due.'] },
  caught: { cheer: ['All caught up! You can browse or add new cards.'], calm: ['Nothing due. Nicely done.'], brief: ['Nothing due.'] },
  risk: { cheer: ['Your {s}-day streak needs one answer today!', 'One card keeps your {s}-day streak alive!'], calm: ['A single card keeps your {s}-day streak going.'], brief: ['Streak at risk: {s} days.'] },
  goal: { cheer: ['Goal reached! You are on fire!', 'Daily goal done! Anything more is a bonus.'], calm: ['Goal reached. Well done.'], brief: ['Goal done.'] },
  streak: { cheer: ['{s} days in a row! Amazing!'], calm: ['{s} days in a row. Steady progress.'], brief: ['{s}-day streak.'] },
  study: { cheer: ['Tip: say the answer out loud before you flip!', 'Wrong answers teach the most. Keep going!'], calm: ['Say the answer in your head first, then check.'], brief: ['Answer first, then flip.'] },
  lab: { cheer: ['Drag to spin, pinch to zoom. Try it!'], calm: ['Drag to rotate. Take your time.'], brief: ['Drag to spin.'] },
  idle: { cheer: ['Need a hand? Tap me!', 'Psst, I can show you around.'], calm: ['I am here if you need me.'], brief: ['Need help? Tap me.'] },
  hello: { cheer: ['Hi! I am {name}. Ask me anything about the app, or tap Show me how.'], calm: ['Hello, I am {name}. How can I help?'], brief: ['{name} here. Help?'] },
  unknown: { cheer: ['Hmm, I did not get that. Try one of these!'], calm: ['I am not sure. These might help.'], brief: ['Not sure. Try these.'] },
  done: { cheer: ['That is it! You did it!'], calm: ['That is all. Nice.'], brief: ['Done.'] }
};
export const line = (k: string, pers: Pers, v: Record<string, string | number> = {}) => {
  const a = (P[k] || P.idle)[pers] || P.idle.cheer; let t = a[Math.floor(Math.random() * a.length)];
  for (const x in v) t = t.split('{' + x + '}').join(String(v[x])); return t;
};

/* ---- guides: the buddy walks to a real button, highlights it, and waits for you to press it ---- */
export interface Step { path?: string; sel: string; text: string; optional?: boolean }
export const GUIDES: Record<string, { title: string; steps: Step[] }> = {
  add: { title: 'Add cards', steps: [
    { path: '/study', sel: '.plus:not(.alt)', text: 'Tap the + button to add cards.' },
    { sel: '.ad-tabs', text: 'Choose Cards to paste text, Import for files, or AI to make cards from notes. Pick where they go under "Add to".' },
    { sel: '.sc textarea', text: 'Paste one card per line: question|correct|wrong1|wrong2. Then tap Add cards.', optional: true }] },
  study: { title: 'Study cards', steps: [{ path: '/', sel: '.today .go', text: 'Tap Start to review the cards that are due today.' }] },
  lab: { title: 'Open the 3D lab', steps: [{ path: '/', sel: '.qa a[href^="/lab"]', text: 'This opens the 3D lab. Drag to spin a model, pinch to zoom.' }] },
  quiz: { title: 'Join a quiz', steps: [{ path: '/', sel: '.qa a[href^="/play"]', text: 'Enter a code here to join a live quiz.' }] },
  look: { title: 'Change the look', steps: [
    { path: '/', sel: '.avatar', text: 'Tap here to open settings.' },
    { sel: '.ap', text: 'Fonts, spacing, corners and layout are here. Tap any one to try it.' }] },
  arrange: { title: 'Arrange home', steps: [{ path: '/', sel: '.hcustom', text: 'Tap here to move or hide sections on your home screen.' }] },
  account: { title: 'Sign in', steps: [
    { path: '/', sel: '.avatar', text: 'Settings are here. Your account is at the top.' },
    { sel: '.scard', text: 'Continue with Google to back up your progress and use it on any device.' }] }
};

/* ---- understanding typed or spoken text: keyword scoring, no AI ---- */
const INTENTS: [string, string[]][] = [
  ['add', ['add', 'create', 'new', 'card', 'cards', 'import', 'paste', 'upload', 'write', 'make']],
  ['study', ['study', 'review', 'practice', 'start', 'learn', 'revise', 'flashcard', 'flashcards']],
  ['lab', ['3d', 'lab', 'model', 'models', 'simulation', 'spin']],
  ['quiz', ['quiz', 'host', 'play', 'game', 'join', 'kahoot', 'live', 'code']],
  ['look', ['font', 'theme', 'dark', 'color', 'colour', 'layout', 'look', 'size', 'bigger', 'appearance', 'style']],
  ['arrange', ['arrange', 'move', 'hide', 'reorder', 'sections', 'customize', 'customise', 'home']],
  ['account', ['sign', 'login', 'log', 'google', 'account', 'sync', 'backup', 'device', 'devices']]
];
export function intent(text: string): string | null {
  const w = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean); if (!w.length) return null;
  let best: string | null = null, bs = 0;
  for (const [id, kw] of INTENTS) { let s = 0; for (const x of w) if (kw.includes(x)) s++; if (s > bs) { bs = s; best = id; } }
  return best;
}
export const ANSWERS: Record<string, string> = {
  add: 'Adding cards takes a few taps. Want me to show you?', study: 'Studying starts from the big Today card. I can point to it.',
  lab: 'The 3D lab has models and simulations you can spin. Shall I open it?', quiz: 'Live quizzes use a code from the host. I can show you where to type it.',
  look: 'You can change fonts, spacing, corners and layout. I can show you where.', arrange: 'You can reorder or hide any section of your home page.',
  account: 'Signing in with Google backs up your progress. Want to see where?'
};

/* ---- voice: speech on the website, native speech in the app; both optional ---- */
export async function speak(text: string) {
  try {
    const { isNative } = await import('./base');
    if (isNative()) { const { TextToSpeech } = await import('@capacitor-community/text-to-speech'); await TextToSpeech.stop().catch(() => { /* ignore */ }); await TextToSpeech.speak({ text, lang: 'en-US', rate: 1, pitch: 1.1 }); return; }
    const s = (window as any).speechSynthesis; if (!s) return; s.cancel(); const u = new SpeechSynthesisUtterance(text); u.pitch = 1.1; s.speak(u);
  } catch { /* voice is a bonus; never break the app */ }
}
export const canListen = () => { try { return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition); } catch { return false; } };
export function listen(done: (t: string) => void, fail: () => void) {
  try {
    const R = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition; const r = new R(); r.lang = 'en-US'; r.interimResults = false;
    r.onresult = (ev: any) => done(String(ev.results?.[0]?.[0]?.transcript || '')); r.onerror = fail; r.onend = () => { /* ended */ }; r.start();
  } catch { fail(); }
}
