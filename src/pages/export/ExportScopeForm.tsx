/**
 * W08 left column: what to export (four scopes, SRS §8.2), formats, and an optional limit to one location
 * or a date range (FR-EXPT-11). "Each member" scopes always deliver a ZIP (the server adds it).
 */
import type { ExportFormat, ExportScope, LocationRow } from '../../api/types';
import { Card, Field, Ropt, Segs, TextInput } from '../../components/ui';
import { firstName, fmtCalShort } from '../../lib/format';
import { EXPORT_SCOPE } from '../../lib/labels';

export interface ExportChoice {
  scope: ExportScope;
  memberUserId: string;
  formats: ExportFormat[];
  limit: 'all' | 'loc' | 'dates';
  locationId: string;
  dateFrom: string;
  dateTo: string;
}

export const zipForced = (scope: ExportScope) => scope === 'each' || scope === 'trip_and_each';

/** Formats actually built: ZIP is added for the "each member" scopes. */
export function effectiveFormats(c: Pick<ExportChoice, 'scope' | 'formats'>): ExportFormat[] {
  const s = new Set(c.formats);
  if (zipForced(c.scope)) s.add('zip');
  return (['pdf', 'xlsx', 'zip'] as const).filter(f => s.has(f));
}

/** Request body / preview query for a choice. */
export function exportParams(c: ExportChoice) {
  return {
    scope: c.scope,
    memberUserId: c.scope === 'member' ? c.memberUserId || undefined : undefined,
    formats: effectiveFormats(c),
    locationId: c.limit === 'loc' ? c.locationId || undefined : undefined,
    dateFrom: c.limit === 'dates' ? c.dateFrom || undefined : undefined,
    dateTo: c.limit === 'dates' ? c.dateTo || undefined : undefined,
  };
}

const FORMAT_ROWS: Array<[ExportFormat, string, string, 'fileText' | 'fileSheet' | 'fileZip']> = [
  ['pdf', 'PDF statement', 'Header, budgets, claims, expense table, categories, verification and payments, attachment appendix, declaration', 'fileText'],
  ['xlsx', 'Excel workbook', 'One row per expense with every field and each attachment’s file name; summary, budget and member sheets', 'fileSheet'],
  ['zip', 'ZIP package', 'Every attachment from the mobile app and the web app, in folders, with the PDF and Excel of this export', 'fileZip'],
];

export function ExportScopeForm({ value, onChange, members, locations, window }: {
  value: ExportChoice;
  onChange: (c: ExportChoice) => void;
  members: Array<{ userId: string; name: string }>;
  locations: LocationRow[];
  window?: { from: string; to: string };
}) {
  const set = (p: Partial<ExportChoice>) => onChange({ ...value, ...p });
  const forced = zipForced(value.scope);
  const on = (f: ExportFormat) => (f === 'zip' && forced) || value.formats.includes(f);
  const toggle = (f: ExportFormat) => {
    if (f === 'zip' && forced) return;
    set({ formats: value.formats.includes(f) ? value.formats.filter(x => x !== f) : [...value.formats, f] });
  };
  const badDates = value.limit === 'dates' && !!value.dateFrom && !!value.dateTo && value.dateFrom > value.dateTo;
  return (
    <>
      <Card title="What to export" icon="layers">
        <div className="radio-list" role="radiogroup" aria-label="What to export">
          {(['trip', 'member', 'each', 'trip_and_each'] as const).map(s => (
            <div key={s} style={{ display: 'grid', gap: 8 }}>
              <Ropt on={value.scope === s} onClick={() => set({ scope: s, memberUserId: s === 'member' && !value.memberUserId ? members[0]?.userId ?? '' : value.memberUserId })} title={EXPORT_SCOPE[s].label} sub={EXPORT_SCOPE[s].sub} />
              {s === 'member' && value.scope === 'member' && (
                <div style={{ padding: '0 4px 4px 34px' }}>
                  <Segs label="Member" value={value.memberUserId} onChange={v => set({ memberUserId: v })} options={members.map(m => [m.userId, firstName(m.name)] as [string, string])} />
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
      <Card title="Formats" icon="file">
        <div className="radio-list" role="group" aria-label="Formats">
          {FORMAT_ROWS.map(([f, t, sub, ic]) => (
            <Ropt key={f} checkbox role="checkbox" on={on(f)} onClick={() => toggle(f)} title={t} icon={ic}
              sub={f === 'zip' && forced ? `${sub}. Always included when exporting each member.` : sub} locked={f === 'zip' && forced} />
          ))}
        </div>
        {!effectiveFormats(value).length && <div className="errtxt" role="alert" style={{ marginTop: 10 }}>Choose at least one format.</div>}
      </Card>
      <Card title="Limit to" icon="sliders">
        <Segs label="Limit the export" value={value.limit} onChange={v => set({ limit: v, locationId: v === 'loc' && !value.locationId ? locations[0]?.id ?? '' : value.locationId })}
          options={[['all', 'Whole trip'], ['loc', 'One location'], ['dates', 'Date range']]} />
        {value.limit === 'loc' && (
          <div style={{ marginTop: 10 }}>
            <Segs label="Location" value={value.locationId} onChange={v => set({ locationId: v })} options={locations.map(l => [l.id, `${l.city}${l.venue ? ` · ${l.venue}` : ''}`] as [string, string])} />
          </div>
        )}
        {value.limit === 'dates' && (
          <div className="grid2" style={{ gap: 12, marginTop: 10 }}>
            <Field label="From" htmlFor="xFrom" help={window ? `Trip dates: ${fmtCalShort(window.from)} to ${fmtCalShort(window.to)}` : undefined}>
              <TextInput id="xFrom" type="date" icon="calendar" value={value.dateFrom} min={window?.from} max={window?.to} onChange={e => set({ dateFrom: e.target.value })} />
            </Field>
            <Field label="To" htmlFor="xTo" error={badDates ? 'The start date is after the end date.' : null}>
              <TextInput id="xTo" type="date" icon="calendar" value={value.dateTo} min={window?.from} max={window?.to} error={badDates} onChange={e => set({ dateTo: e.target.value })} />
            </Field>
          </div>
        )}
        {value.limit === 'all' && <div className="sm-note" style={{ marginTop: 8 }}>Restrict to one location or a date range when finance needs part of a trip (FR-EXPT-11).</div>}
      </Card>
    </>
  );
}
