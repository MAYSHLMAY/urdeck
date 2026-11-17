'use client';
import { useEffect } from 'react';
import { engine } from '@/lib/engine';
import { apiUrl, isNative } from '@/lib/base';

const FLAG = 'ud-splash-v1', MUTE = 'ud-splash-mute', MIN = 2300, MIN_RM = 700, SLOW = 1200, HARD = 8000, API_TO = 4000;
const AC: any = typeof window !== 'undefined' ? ((window as any).AudioContext || (window as any).webkitAudioContext) : null;

/** Behaviour for the inline splash: a short generated chime (after the first tap), real loading work with progress,
 *  skip, keyboard, and a timeout with a clear message. Animation itself is pure CSS (transform and opacity). */
export function SplashBoot() {
  useEffect(() => {
    const root = document.documentElement, el = document.getElementById('ud-splash');
    if (!el || root.getAttribute('data-splash') !== '1') return;
    const $ = (id: string) => document.getElementById(id) as HTMLElement;
    const msg = $('us-msg'), bar = $('us-bar'), mute = $('us-mute'), skip = $('us-skip'), logo = $('us-logo'), sr = $('us-sr');
    const rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let loaded = false, muted = false, ctx: AudioContext | null = null, done = false, played = false, steps = 0, failed = '';
    try { muted = localStorage.getItem(MUTE) === '1'; } catch { /* ignore */ }
    mute.setAttribute('aria-pressed', String(muted)); mute.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on');
    const say = (t: string, announce = true) => { msg.textContent = t; if (announce) sr.textContent = t; };
    const prog = () => { bar.style.transform = 'scaleX(' + Math.min(1, 0.06 + steps / 3 * 0.94) + ')'; };

    /* ---- sound: generated, no file to load. Browsers keep audio locked until a tap, so the chime plays on the first touch. ---- */
    const tone = (f: number, t0: number, len: number, vol = 0.16) => {
      if (!ctx) return; const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t0); g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t0 + len);
      o.start(ctx.currentTime + t0); o.stop(ctx.currentTime + t0 + len + 0.05);
    };
    const chime = (small = false) => {
      if (muted || !AC) return;
      try {
        if (!ctx) ctx = new AC();
        const run = () => { if (small) { tone(880, 0, 0.18); tone(1320, 0.07, 0.22, 0.1); } else { tone(523.25, 0, 0.35); tone(659.25, 0.12, 0.35); tone(783.99, 0.24, 0.55); } };
        if (ctx!.state === 'suspended') ctx!.resume().then(run).catch(() => { /* locked */ }); else run();
      } catch { /* no audio */ }
    };
    const unlock = () => { if (!played) { played = true; chime(); } };
    const first = () => { unlock(); el.removeEventListener('pointerdown', first); };
    el.addEventListener('pointerdown', first);

    mute.onclick = (ev) => { ev.stopPropagation(); muted = !muted; try { localStorage.setItem(MUTE, muted ? '1' : '0'); } catch { /* ignore */ } mute.setAttribute('aria-pressed', String(muted)); mute.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on'); if (!muted) chime(true); else { try { ctx?.suspend(); } catch { /* ignore */ } } };
    logo.onclick = (ev) => {
      ev.stopPropagation(); played = true; chime(true);
      logo.classList.remove('pop'); void logo.offsetWidth; logo.classList.add('pop');
      el.querySelectorAll('.us-c').forEach(c => { c.classList.remove('fly'); void (c as HTMLElement).offsetWidth; c.classList.add('fly'); });
    };

    /* ---- finish ---- */
    const finish = () => {
      if (done) return; done = true; clearTimeout(hard);
      try { localStorage.setItem(FLAG, '1'); } catch { /* ignore */ }
      removeEventListener('keydown', key);
      el.classList.add('out');
      const end = () => { root.removeAttribute('data-splash'); dispatchEvent(new Event('ud-splash-done')); };
      if (rm) end(); else setTimeout(end, 340);
    };
    skip.onclick = (ev) => { ev.stopPropagation(); finish(); };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') { ev.preventDefault(); finish(); return; }
      const t = ev.target as HTMLElement; if ((ev.key === 'Enter' || ev.key === ' ') && (!t || t === document.body || t === el)) { ev.preventDefault(); finish(); }
    };
    addEventListener('keydown', key);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('go')));

    /* ---- real work while it plays ---- */
    const t0 = performance.now();
    const slowT = setTimeout(() => { if (!done && !loaded) { el.classList.add('slow'); prog(); } }, SLOW);
    const hard = setTimeout(() => {
      if (done) return;
      failed = failed || 'Loading is taking longer than usual.';
      el.classList.add('err'); say(failed + ' Opening the app with your saved cards.');
      setTimeout(finish, 1800);
    }, HARD);
    const timeout = <T,>(p: Promise<T>, ms: number) => new Promise<T>((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });

    const fonts = (async () => { try { await timeout(Promise.all([document.fonts.load('800 1em "Plus Jakarta Sans"'), document.fonts.load('600 1em "Plus Jakarta Sans"')]), 2500); } catch { /* fall back to system font */ } steps++; prog(); })();
    const data = (async () => { say('Loading your cards'); try { await timeout(engine().init(), 6000); } catch { failed = 'Could not load saved data.'; } steps++; prog(); })();
    const net = (async () => {
      try {
        const ac = new AbortController(), t = setTimeout(() => ac.abort(), API_TO);
        const r = await fetch(apiUrl('/api/health'), { cache: 'no-store', signal: ac.signal }); clearTimeout(t);
        if (!r.ok) throw new Error('bad');
      } catch { if (!failed) failed = (typeof navigator !== 'undefined' && navigator.onLine === false) || isNative() ? 'You are offline. Saved cards still work.' : 'Could not reach the server. Saved cards still work.'; }
      steps++; prog();
    })();

    Promise.all([fonts, data, net]).then(async () => {
      loaded = true; el.classList.remove('slow');
      if (done) return;
      say(failed ? failed : 'Ready');
      if (failed) el.classList.add('err');
      const wait = Math.max(0, (rm ? MIN_RM : MIN) - (performance.now() - t0)) + (failed ? 900 : 0);
      setTimeout(finish, wait);
    });
    return () => { clearTimeout(slowT); clearTimeout(hard); removeEventListener('keydown', key); };
  }, []);
  return null;
}
