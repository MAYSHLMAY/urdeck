import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server/auth';
import { admin } from '@/lib/server/supabase';

export const dynamic = 'force-dynamic';
const fail = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });
const clip = (x: any, n: number) => String(x ?? '').slice(0, n);
const int = (x: any, lo = 0, hi = 1e9) => Math.max(lo, Math.min(hi, Math.round(Number(x) || 0)));

/** GET: the leaderboards (public). ?view=alltime | recent */
export async function GET(req: Request) {
  try {
    const db = admin(), view = new URL(req.url).searchParams.get('view') || 'alltime';
    if (view === 'recent') {
      const s = await db.from('game_sessions').select('id,pin,title,ended_at,question_count,player_count,mode').order('ended_at', { ascending: false }).limit(15);
      if (s.error) throw s.error;
      const ids = (s.data || []).map((x: any) => x.id);
      const p = ids.length ? await db.from('game_players').select('session_id,player_id,nickname,avatar,score,rank,correct,answered').in('session_id', ids).lte('rank', 3) : { data: [] as any[], error: null as any };
      if (p.error) throw p.error;
      return NextResponse.json({ games: (s.data || []).map((g: any) => ({ ...g, podium: (p.data || []).filter((x: any) => x.session_id === g.id).sort((a: any, b: any) => a.rank - b.rank) })) });
    }
    const r = await db.from('game_players').select('player_id,nickname,avatar,score,correct,answered,best_streak,rank,session_id').limit(20000);
    if (r.error) throw r.error;
    const m = new Map<string, any>();
    for (const x of r.data || []) {
      const a = m.get(x.player_id) || { player_id: x.player_id, nickname: x.nickname, avatar: x.avatar, score: 0, games: 0, wins: 0, correct: 0, answered: 0, best_streak: 0 };
      a.score += x.score; a.games++; if (x.rank === 1) a.wins++; a.correct += x.correct; a.answered += x.answered; a.best_streak = Math.max(a.best_streak, x.best_streak);
      a.nickname = x.nickname; a.avatar = x.avatar; m.set(x.player_id, a);
    }
    return NextResponse.json({ players: [...m.values()].sort((a, b) => b.score - a.score).slice(0, 100) });
  } catch (e: any) { return fail(e.message || 'Could not load the leaderboard.', 500); }
}

/** POST: the host (owner) saves a finished game. This is the only thing a game ever writes to the database. */
export async function POST(req: Request) {
  if (!requireOwner(req)) return fail('Only the owner can save game results.', 401);
  try {
    const b = await req.json(), db = admin();
    const players: any[] = Array.isArray(b.players) ? b.players.slice(0, 500) : [];
    if (!players.length) return fail('No players to save.');
    const s = await db.from('game_sessions').insert({
      pin: clip(b.pin, 12), title: clip(b.title, 120), started_at: new Date(int(b.startedAt, 0, 8.64e15) || Date.now()).toISOString(),
      question_count: int(b.questions, 0, 500), player_count: players.length, mode: clip(b.mode, 20), settings: b.settings && typeof b.settings === 'object' ? b.settings : null,
    }).select('id').single();
    if (s.error) throw s.error;
    const rows = players.map(p => ({
      session_id: s.data.id, player_id: clip(p.id, 64), nickname: clip(p.name, 24) || 'Player', avatar: clip(p.av, 80), team: p.team == null ? null : int(p.team, 0, 9),
      score: int(p.score, 0, 1e7), correct: int(p.correct, 0, 1000), answered: int(p.answered, 0, 1000), best_streak: int(p.bestStreak, 0, 1000), avg_ms: p.avgMs == null ? null : int(p.avgMs, 0, 1e6), rank: int(p.rank, 1, 1000),
    })).filter(r => r.player_id);
    const r = await db.from('game_players').insert(rows);
    if (r.error) throw r.error;
    return NextResponse.json({ ok: true, id: s.data.id });
  } catch (e: any) { return fail(e.message || 'Could not save the results.', 500); }
}
