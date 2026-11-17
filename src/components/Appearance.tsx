'use client';

/** Settings entry for the home layout. Card design and font are fixed, so the only choices are layout choices. */
export function Appearance({ onArrange }: { onArrange: () => void }) {
  return (
    <section className="scard ap"><h4>Home layout</h4>
      <p className="n" style={{ margin: '0 0 10px' }}>Choose a preset, pick which sections show, change their order and choose your shortcuts.</p>
      <button type="button" className="wl-btn" style={{ width: '100%' }} onClick={() => { onArrange(); setTimeout(() => dispatchEvent(new Event('ud-arrange')), 250); }}>Customize home</button>
    </section>
  );
}
