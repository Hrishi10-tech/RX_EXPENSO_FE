/**
 * Members and timing chart (prototype gantt()): each member's actual start and end against the scheduled
 * window, with early starts hatched, time past the planned end in amber and a red line at now.
 */
import { addDays, fmtCalShort, istDate, istDayStart } from '../lib/format';

export interface GanttRow { key: string; name: string; sub: string; start: string | null; end: string | null }

export function Gantt({ scheduledStart, tentativeEnd, rows, now }: { scheduledStart: string; tentativeEnd: string; rows: GanttRow[]; now: number }) {
  const W0 = new Date(scheduledStart).getTime(), W1 = new Date(tentativeEnd).getTime();
  const times = [W0, W1, ...rows.flatMap(r => [r.start ? new Date(r.start).getTime() : null, r.end ? new Date(r.end).getTime() : null]).filter((x): x is number => x != null)];
  const anyRunning = rows.some(r => r.start && !r.end);
  if (anyRunning) times.push(now);
  const minT = Math.min(...times), maxT = Math.max(...times);
  const from = istDayStart(addDays(istDate(minT), -1));
  const to = istDayStart(addDays(istDate(maxT), 2));
  const span = to - from;
  const P = (t: number) => `${(((t - from) / span) * 100).toFixed(3)}%`;
  const W = (a: number, b: number) => `${(((b - a) / span) * 100).toFixed(3)}%`;
  const days: string[] = [];
  for (let d = istDate(from); istDayStart(d) < to; d = addDays(d, 1)) days.push(d);
  const every = days.length > 28 ? 4 : days.length > 16 ? 2 : 1;
  const nowIn = now >= from && now <= to;
  return (
    <div className="gantt" role="img" aria-label="Members’ actual start and end against the scheduled window">
      {rows.map(r => {
        const segs: Array<[number, number, string]> = [];
        if (r.start) {
          const s = new Date(r.start).getTime();
          const e = r.end ? new Date(r.end).getTime() : now;
          if (s < W0) segs.push([s, Math.min(e, W0), 'early']);
          if (e > W0 && s < W1) segs.push([Math.max(s, W0), Math.min(e, W1), r.end ? 'done' : '']);
          if (e > W1) segs.push([Math.max(s, W1), e, 'ext']);
        }
        return (
          <div className="g-row" key={r.key}>
            <span>{r.name}<small>{r.sub}</small></span>
            <div className="g-track">
              <span className="g-win" style={{ left: P(W0), width: W(W0, W1) }} />
              {segs.map(([a, b, c], i) => <span key={i} className={`g-bar ${c}`} style={{ left: P(a), width: W(a, Math.max(b, a + span / 400)) }} />)}
              {nowIn && <span className="g-now" style={{ left: P(now) }} title="Now" />}
            </div>
          </div>
        );
      })}
      <div className="g-axis" aria-hidden="true">
        {days.map((d, i) => (i % every === 0 ? <span key={d} style={{ left: P(istDayStart(d)) }}>{fmtCalShort(d)}</span> : null))}
      </div>
      <div className="g-legend">
        <span><i style={{ background: 'color-mix(in srgb,var(--accent) 20%,transparent)', border: '1.5px dashed var(--accent)' }} />Scheduled window</span>
        <span><i className="g-bar early" style={{ position: 'static', display: 'inline-block' }} />Started early</span>
        <span><i style={{ background: 'var(--bar-ok)' }} />Running</span>
        <span><i style={{ background: 'color-mix(in srgb,var(--ink-3) 70%,transparent)' }} />Ended</span>
        <span><i style={{ background: 'var(--bar-warn)' }} />Past the planned end</span>
        <span><i style={{ background: 'var(--bad)', width: 3 }} />Now</span>
      </div>
    </div>
  );
}
