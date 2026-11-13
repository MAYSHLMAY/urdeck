'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet, SheetFrame, useEngine, Ic } from './ui';
import { qText } from '@/lib/cardimg';
import { shuf } from '@/lib/engine';

const plain = (t: string) => String(t).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const lang = (t: string) => (/[ሀ-፿]/.test(t) ? 'am-ET' : 'en-US');
/** Open from anywhere:  window.dispatchEvent(new Event('fr-listen')) */
export const openListen = () => window.dispatchEvent(new Event('fr-listen'));

/** Listen mode: the app reads cards aloud, with a pause to think. Does not change your schedule. */
export function Listen() {
  const e = useEngine();
  const [open, setOpen] = useState(false), [play, setPlay] = useState(false), [i, setI] = useState(0), [rate, setRate] = useState(1), [think, setThink] = useState(5);
  const [choices, setChoices] = useState(false), [rand, setRand] = useState(false), [step, setStep] = useState<'q' | 'a'>('q'), [order, setOrder] = useState<string[]>([]);
  const T = useRef<any>(0), ok = typeof window !== 'undefined' && 'speechSynthesis' in window;
  useEffect(() => { const f = () => setOpen(true); window.addEventListener('fr-listen', f); return () => window.removeEventListener('fr-listen', f); }, []);
  useEffect(() => { if (open && e.ready) { setOrder((rand ? shuf(e.pool()) : e.pool()).map(q => String(q.id))); setI(0); setStep('q'); } }, [open, rand, e.ready]); // eslint-disable-line
  const card = useMemo(() => (open && order.length ? e.qById(order[i]) : null), [open, order, i, e.qver]); // eslint-disable-line
  const stop = () => { clearTimeout(T.current); try { speechSynthesis.cancel(); } catch { /* ignore */ } };
  useEffect(() => { if (!open) { stop(); setPlay(false); } }, [open]);
  useEffect(() => () => stop(), []);
  const say = (text: string, done: () => void) => {
    const u = new SpeechSynthesisUtterance(text); u.lang = lang(text); u.rate = rate; u.onend = done; u.onerror = done; speechSynthesis.speak(u);
  };
  useEffect(() => {
    if (!play || !card || !ok) return; stop();
    if (step === 'q') {
      const opts = choices ? ' Choices: ' + shuf([card.c, ...card.w]).map((t, k) => (k + 1) + ', ' + plain(t)).join('. ') + '.' : '';
      say(plain(qText(card.q)) + '.' + opts, () => { T.current = setTimeout(() => setStep('a'), think * 1000); });
    } else {
      say('Answer: ' + plain(card.c), () => { T.current = setTimeout(() => { if (i + 1 < order.length) { setI(i + 1); setStep('q'); } else setPlay(false); }, 1200); });
    }
    return stop;
  }, [play, card, step, rate, think, choices]); // eslint-disable-line
  const go = (d: number) => { stop(); setStep('q'); setI(v => Math.min(order.length - 1, Math.max(0, v + d))); };
  return (
    <Sheet open={open} onClose={() => setOpen(false)} className="sheet listen">
      <SheetFrame title={<span className="ttl"><Ic n="bell" /> Listen</span>} onClose={() => setOpen(false)}>
        <div className="sc">
          {!ok && <p className="err">This browser cannot read text aloud.</p>}
          {!order.length && <p className="info">No cards in your current selection.</p>}
          {card && <div className="lcard"><small>{i + 1} / {order.length}</small>
            <h3>{plain(qText(card.q))}</h3>
            <p className={'lans' + (step === 'a' ? ' show' : '')}>{plain(card.c)}</p></div>}
          <div className="row lctl">
            <button className="ghost" onClick={() => go(-1)} disabled={i === 0} aria-label="Previous">‹</button>
            <button className="solid" onClick={() => { if (play) { stop(); setPlay(false); } else setPlay(true); }} disabled={!ok || !card}>{play ? 'Pause' : 'Play'}</button>
            <button className="ghost" onClick={() => go(1)} disabled={i >= order.length - 1} aria-label="Next">›</button>
          </div>
          <label className="cl">Speed {rate.toFixed(1)}×<input type="range" min={0.6} max={1.6} step={0.1} value={rate} onChange={ev => setRate(+ev.target.value)} /></label>
          <label className="cl">Time to think: {think}s<input type="range" min={2} max={15} step={1} value={think} onChange={ev => setThink(+ev.target.value)} /></label>
          <label className="pickr"><input type="checkbox" checked={choices} onChange={ev => setChoices(ev.target.checked)} /><span>Read the choices too</span></label>
          <label className="pickr"><input type="checkbox" checked={rand} onChange={ev => setRand(ev.target.checked)} /><span>Shuffle</span></label>
          <p className="n">Reads the cards of your current selection. Amharic is read only if your device has an Amharic voice.</p>
        </div>
      </SheetFrame>
    </Sheet>
  );
}
