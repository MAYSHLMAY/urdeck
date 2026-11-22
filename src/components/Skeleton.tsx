import { SiteNav } from './SiteChrome';
/** Calm placeholders shown while the app wakes up: same shapes as the real screen, so nothing jumps when it arrives. */
const B = ({ w, h, r, c = '' }: { w?: number | string; h: number | string; r?: number; c?: string }) => <i className={'sk ' + c} style={{ width: w, height: h, borderRadius: r }} aria-hidden="true" />;

export function HomeSkeleton() {
  return (
    <>
    <SiteNav owner={false} onSettings={() => {}} />
    <div className="hm skw" role="status" aria-busy="true" aria-label="Loading">
      <div className="sk-tabs"><B h={44} r={16} /></div>
      <div className="sk-card">
        <div className="sk-row"><B w="42%" h={16} /><span style={{ flex: 1 }} /><B w={44} h={44} r={22} /></div>
        <B h={46} r={23} />
        <B w="88%" h={34} /><B w="62%" h={34} />
        <B w="55%" h={14} />
        <B h={170} r={24} c="sk-fan" />
        <div className="sk-row"><B w={150} h={52} r={18} /><B w={52} h={52} r={26} /></div>
      </div>
      <div className="sk-trio"><B h={78} r={22} /><B h={78} r={22} /><B h={78} r={22} /></div>
      <B w="38%" h={20} />
      <div className="sk-rail"><B h={120} r={22} /><B h={120} r={22} /><B h={120} r={22} /><B h={120} r={22} /></div>
    </div>
    </>
  );
}
export function StudySkeleton() {
  return (
    <div className="wrap skw" role="status" aria-busy="true" aria-label="Loading">
      <div className="sk-row"><B w={36} h={36} r={18} /><B w="46%" h={22} /><span style={{ flex: 1 }} /><B w={36} h={36} r={18} /><B w={36} h={36} r={18} /></div>
      <div className="sk-row"><B w={74} h={30} r={15} /><B w={74} h={30} r={15} /><B w={74} h={30} r={15} /></div>
      <B h={4} r={2} />
      <StageSkeleton />
    </div>
  );
}
export function StageSkeleton() {
  return (
    <section id="stage" role="status" aria-busy="true" aria-label="Loading cards" className="skw">
      <div className="sk-card"><B w="30%" h={14} /><B w="92%" h={26} /><B w="70%" h={26} />
        <div className="sk-opts"><B h={54} r={16} /><B h={54} r={16} /><B h={54} r={16} /><B h={54} r={16} /></div></div>
    </section>
  );
}
export function ListSkeleton({ n = 4, h = 64 }: { n?: number; h?: number }) {
  return <div className="skw sk-list" role="status" aria-busy="true" aria-label="Loading">{Array.from({ length: n }, (_, i) => <B key={i} h={h} r={16} />)}</div>;
}
