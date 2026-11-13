/* Stateless relay to Groq or xAI for browsers that block direct calls. The key arrives in a header, is used for this one request and is
   never logged or stored. The upstream is one of two fixed addresses, so this cannot be pointed at other sites. */
export const runtime = 'nodejs';
const BASES: Record<string, string> = { groq: 'https://api.groq.com/openai/v1', xai: 'https://api.x.ai/v1' };
const OK: Record<string, RegExp> = { groq: /^gsk_[A-Za-z0-9]{20,}$/, xai: /^xai-[A-Za-z0-9_\-]{20,}$/ };
export async function POST(req: Request) {
  const key = req.headers.get('x-ai-key') || '';
  let j: any; try { j = await req.json(); } catch { return Response.json({ error: 'bad request' }, { status: 400 }); }
  const P = BASES[j?.p] ? j.p : 'xai', BASE = BASES[P];
  if (!OK[P].test(key)) return Response.json({ error: 'bad key' }, { status: 401 });
  const chat = j?.path === 'chat';
  if (!chat && j?.path !== 'models') return Response.json({ error: 'bad path' }, { status: 400 });
  const b = chat ? JSON.stringify({ model: String(j.body?.model || ''), messages: j.body?.messages, max_tokens: Math.min(+j.body?.max_tokens || 400, 2000), temperature: j.body?.temperature ?? 0.2 }) : undefined;
  try {
    const r = await fetch(BASE + (chat ? '/chat/completions' : '/models'), chat
      ? { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: b }
      : { headers: { Authorization: 'Bearer ' + key } });
    return new Response(await r.text(), { status: r.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'upstream unreachable' }, { status: 502 }); }
}
