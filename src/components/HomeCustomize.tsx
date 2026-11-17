'use client';
import { Sheet, SheetFrame, Ic } from './ui';
import { HOME_SECTIONS, HOME_DEF, PRESETS, SHORTCUTS, resetHome, setHome, type HomeCfg } from '@/lib/look';

const Seg = ({ v, opts, on }: { v: string | number; opts: [string | number, string][]; on: (k: any) => void }) => (
  <div className="cz-seg" role="radiogroup">{opts.map(([k, l]) => <button key={String(k)} type="button" role="radio" aria-checked={v === k} className={v === k ? 'on' : ''} onClick={() => on(k)}>{l}</button>)}</div>
);
const Sw = ({ on, label, set }: { on: boolean; label: string; set: (v: boolean) => void }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} className={'cz-sw' + (on ? ' on' : '')} onClick={() => set(!on)}><i /></button>
);

export function HomeCustomize({ open, onClose, cfg }: { open: boolean; onClose: () => void; cfg: HomeCfg }) {
  const move = (id: string, d: number) => { const o = [...cfg.order], i = o.indexOf(id), j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; setHome({ order: o }); };
  const vis = (id: string, v: boolean) => setHome({ hidden: v ? cfg.hidden.filter(x => x !== id) : [...cfg.hidden, id] });
  const sc = (id: string) => setHome({ short: cfg.short.includes(id) ? cfg.short.filter(x => x !== id) : [...cfg.short, id] });
  const isPreset = (p: typeof PRESETS[number]) => JSON.stringify({ ...HOME_DEF, ...p.cfg }) === JSON.stringify(cfg);
  return (
    <Sheet open={open} onClose={onClose} className="sheet cz">
      <SheetFrame title="Customize home" onClose={onClose}>
        <div className="cz-b">
          <h4 className="cz-h">Presets</h4>
          <div className="cz-pre">
            {PRESETS.map(p => <button key={p.id} type="button" className={isPreset(p) ? 'on' : ''} onClick={() => setHome({ ...HOME_DEF, ...p.cfg })}><b>{p.name}</b><small>{p.note}</small></button>)}
          </div>

          <h4 className="cz-h">Sections</h4>
          <ol className="cz-list">
            {cfg.order.map((id, i) => {
              const s = HOME_SECTIONS.find(x => x[0] === id)!, shown = !cfg.hidden.includes(id);
              return (
                <li key={id} className={shown ? '' : 'off'}>
                  <span className="cz-t"><b>{s[1]}</b><small>{s[2]}</small></span>
                  <button type="button" className="cz-mv" aria-label={'Move ' + s[1] + ' up'} disabled={i === 0} onClick={() => move(id, -1)}><Ic n="chevD" className="flipv" /></button>
                  <button type="button" className="cz-mv" aria-label={'Move ' + s[1] + ' down'} disabled={i === cfg.order.length - 1} onClick={() => move(id, 1)}><Ic n="chevD" /></button>
                  <Sw on={shown} label={'Show ' + s[1]} set={v => vis(id, v)} />
                </li>
              );
            })}
          </ol>

          <h4 className="cz-h">Top of the page</h4>
          <div className="cz-row"><span>Hero</span><Seg v={cfg.hero} opts={[['deck', 'Card deck'], ['compact', 'Compact']]} on={v => setHome({ hero: v })} /></div>
          <div className="cz-row"><span>Daily tip</span><Sw on={cfg.tip} label="Show the daily tip" set={v => setHome({ tip: v })} /></div>

          <h4 className="cz-h">Shortcuts</h4>
          <div className="cz-chips">{SHORTCUTS.map(([id, n]) => <button key={id} type="button" aria-pressed={cfg.short.includes(id)} className={cfg.short.includes(id) ? 'on' : ''} onClick={() => sc(id)}>{cfg.short.includes(id) && <Ic n="check" />}{n}</button>)}</div>
          <div className="cz-row"><span>Study modes</span><Seg v={cfg.qa} opts={[['grid', 'Tiles'], ['row', 'Scroll row']]} on={v => setHome({ qa: v })} /></div>

          <h4 className="cz-h">Wide screens</h4>
          <div className="cz-row"><span>Columns</span><Seg v={cfg.cols} opts={[[1, 'One'], [2, 'Two']]} on={v => setHome({ cols: v })} /></div>

          <div className="cz-f"><button type="button" className="ghost" onClick={resetHome}>Reset to default</button><button type="button" className="solid" onClick={onClose}>Done</button></div>
        </div>
      </SheetFrame>
    </Sheet>
  );
}
