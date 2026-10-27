/** W04·d the trip's complete story by day, newest first, filterable by kind of event (FR-START-06, NFR-11). */
import { useState } from 'react';
import type { FinanceTrip, TimelineItem } from '../../api/types';
import { Card, EmptyState, Feed, Loading, Segs } from '../../components/ui';
import { dayHeading, fmtTime } from '../../lib/format';
import { dayGroups, timelineLook, timelineText } from './helpers';

type G = 'all' | 'life' | 'exp' | 'bud' | 'ver' | 'mem';

export function TimelineTab({ timeline, loading }: { t: FinanceTrip; timeline: TimelineItem[] | undefined; loading: boolean }) {
  const [g, setG] = useState<G>('all');
  if (loading) return <Card><Loading /></Card>;
  const items = [...(timeline ?? [])].reverse().filter(a => g === 'all' || timelineLook(a).group === g);
  const days = dayGroups(items);
  return (
    <>
      <div className="toolbar">
        <Segs label="Show" value={g} onChange={setG} options={[['all', 'Everything'], ['life', 'Starts and ends'], ['exp', 'Expenses'], ['bud', 'Budgets'], ['ver', 'Verification'], ['mem', 'Members']]} />
        <span className="sm-note" style={{ marginLeft: 'auto' }}>Times in IST · source shown for each event</span>
      </div>
      <Card>
        {days.length === 0 ? <EmptyState icon="history" title="Nothing here yet">Events of this kind appear as they happen.</EmptyState> : days.map(([day, list]) => (
          <div key={day} style={{ display: 'grid', gap: 4 }}>
            <div className="sm-note" style={{ fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', fontSize: 11, paddingTop: 6 }}>{dayHeading(day)}</div>
            <Feed items={list.map(a => {
              const look = timelineLook(a), tx = timelineText(a);
              return { key: a.id, icon: look.icon, tone: look.tone, title: tx.title, sub: tx.sub, time: fmtTime(a.at) };
            })} />
          </div>
        ))}
      </Card>
    </>
  );
}
