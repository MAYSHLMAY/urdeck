/* Optional cloud AI (Groq or xAI Grok). The key lives only in this browser (localStorage, never synced, never in backups).
   Calls go straight from the browser to the provider; if the browser blocks that, they pass through /api/ai, a stateless relay
   that forwards the key for that one request and stores nothing. Everything here is optional: without a key the offline layer does the work. */
import { plain } from './text';
import { qText } from '../cardimg';
import type { Grade } from './grade';

const K = 'fr-ai-v1';
export type Prov = 'groq' | 'xai';
export const PROV: Record<Prov, { name: string; base: string; pref: RegExp[]; skip: RegExp; keys: string }> = {
  groq: { name: 'Groq', base: 'https://api.groq.com/openai/v1', pref: [/^llama-3\.3-70b/, /gpt-oss-120b/, /gpt-oss-20b/, /^llama-3\.1-8b/], skip: /whisper|guard|tts|playai|orpheus|compound|safeguard/i, keys: 'https://console.groq.com/keys' },
  xai: { name: 'Grok (xAI)', base: 'https://api.x.ai/v1', pref: [/fast/], skip: /image|imagine|vision-|embed|video/i, keys: 'https://console.x.ai/team/default/api-keys' }
};
export const provOf = (key: string): Prov | null => /^gsk_[A-Za-z0-9]{20,}$/.test(key) ? 'groq' : /^xai-[A-Za-z0-9_\-]{20,}$/.test(key) ? 'xai' : null;
export interface AICfg { key: string; model: string; relay?: boolean; p?: Prov }
type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

export const aiGet = (): AICfg | null => { try { const c = JSON.parse(localStorage.getItem(K) || 'null'); return c && c.key ? c : null; } catch { return null; } };
export const aiSet = (c: AICfg) => { try { localStorage.setItem(K, JSON.stringify(c)); } catch { /* ignore */ } window.dispatchEvent(new Event('fr-ai')); };
export const aiClear = () => { try { localStorage.removeItem(K); } catch { /* ignore */ } window.dispatchEvent(new Event('fr-ai')); };
export const cleanKey = (s: string) => s.replace(/^\s*(export\s+)?(XAI_API_KEY\s*=\s*)?["']?/i, '').replace(/["']?\s*$/, '').trim();
export const looksLikeKey = (s: string) => !!provOf(s);

async function raw(c: AICfg, path: 'chat' | 'models', body?: unknown): Promise<{ res: Response; relay: boolean }> {
  const P = c.p || provOf(c.key) || 'xai', url = PROV[P].base + (path === 'chat' ? '/chat/completions' : '/models');
  const init = (): RequestInit => path === 'chat'
    ? { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.key }, body: JSON.stringify(body) }
    : { headers: { Authorization: 'Bearer ' + c.key } };
  if (!c.relay) { try { return { res: await fetch(url, init()), relay: false }; } catch { /* blocked by the browser: use the relay */ } }
  const res = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ai-key': c.key }, body: JSON.stringify({ path, p: P, body }) });
  return { res, relay: true };
}
const why = async (r: Response) => {
  let m = ''; try { const j = await r.json(); m = j?.error?.message || j?.error || j?.message || ''; } catch { /* ignore */ }
  if (r.status === 401 || r.status === 403) return 'That key was not accepted. Check it was copied whole.';
  if (r.status === 429) return 'Rate limit or no credits left on this key. Check your provider console.';
  return 'The provider said ' + r.status + (m ? ': ' + String(m).slice(0, 120) : '');
};

/** Check a key and pick a model: lists what the key can use and prefers a good free-tier one. */
export async function aiConnect(key: string, model = ''): Promise<AICfg> {
  const P = provOf(key); if (!P) throw Error('Keys start with gsk_ (Groq) or xai- (xAI). Copy the whole key.');
  const c: AICfg = { key, model, p: P };
  let out; try { out = await raw(c, 'models'); } catch { throw Error('Could not reach ' + PROV[P].name + '. Check your connection.'); }
  if (!out.res.ok) throw Error(await why(out.res));
  const j = await out.res.json().catch(() => ({})), ids = ids_(j, P);
  const pick = model && ids.includes(model) ? model : PROV[P].pref.map(r => ids.find(i => r.test(i))).find(Boolean) || ids[0] || (P === 'groq' ? 'llama-3.3-70b-versatile' : 'grok-4.1-fast');
  return { key, model: pick, relay: out.relay, p: P };
}
const ids_ = (j: any, P: Prov): string[] => (j.data || []).map((m: any) => m.id as string).filter((x: string) => (P === 'xai' ? /^grok/i.test(x) : true) && !PROV[P].skip.test(x));
export async function aiModels(c: AICfg): Promise<string[]> {
  const out = await raw(c, 'models'); if (!out.res.ok) return [];
  const j = await out.res.json().catch(() => ({})); return ids_(j, c.p || provOf(c.key) || 'xai');
}

export async function chat(msgs: Msg[], max = 400): Promise<string> {
  const c = aiGet(); if (!c) throw Error('No AI is connected.');
  let out; try { out = await raw(c, 'chat', { model: c.model, messages: msgs, max_tokens: max, temperature: 0.2 }); } catch { throw Error('Could not reach the provider.'); }
  if (out.relay && !c.relay) aiSet({ ...c, relay: true });
  if (!out.res.ok) throw Error(await why(out.res));
  const j = await out.res.json(); return String(j?.choices?.[0]?.message?.content || '').trim();
}

const card = (q: any) => 'Question: ' + plain(qText(q.q)) + '\nCorrect answer: ' + plain(q.c);
const SYS = 'You are a concise study tutor. Use only the card given; if you add outside knowledge, say so. Plain text, no markdown, no more than 90 words.';
export const aiExplain = (q: any) => chat([{ role: 'system', content: SYS }, { role: 'user', content: card(q) + '\n\nExplain why this is the answer, and give one short way to remember it.' }], 300);
export const aiHint = (q: any) => chat([{ role: 'system', content: SYS }, { role: 'user', content: card(q) + '\n\nGive a hint that nudges toward the answer WITHOUT stating it.' }], 150);

/** Second opinion on a typed answer (used for the "Close" band, where word overlap is not enough). */
export async function aiJudge(q: any, typed: string): Promise<Grade> {
  const t = await chat([{ role: 'system', content: 'You grade a student\'s typed answer against the card\'s correct answer by MEANING. Reply ONLY with JSON: {"verdict":"right"|"close"|"wrong","why":"max 14 words"}. Numbers must match. Opposite meaning is wrong. Missing a key part is close.' },
    { role: 'user', content: card(q) + '\nStudent answered: ' + typed }], 120);
  const m = /\{[\s\S]*\}/.exec(t); if (!m) throw Error('Unclear reply.');
  const j = JSON.parse(m[0]), v = ['right', 'close', 'wrong'].includes(j.verdict) ? j.verdict : 'close';
  return { verdict: v, score: v === 'right' ? 1 : v === 'close' ? 0.5 : 0, why: String(j.why || '').slice(0, 120) + ' (AI)', suggest: v === 'right' ? 2 : v === 'close' ? 1 : 0 };
}
