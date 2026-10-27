/** Filter chips with small popovers (prototype fchip), used by trips, claims, exports, audit and users. */
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { useTrips } from '../api/hooks';
import type { TripRow } from '../api/types';
import { useDebounced } from '../lib/hooks';
import { Icon } from './Icon';
import { Popover } from './Overlay';
import { Avatar, Btn, TextInput } from './ui';

/** A chip that opens a popover; when a value is set it reads "Label: value" and offers a clear button. */
export function FilterChip({ label, value, children, onClear, width = 260, align }: { label: string; value?: string | null; children: (close: () => void) => ReactNode; onClear?: () => void; width?: number; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const on = !!value;
  return (
    <>
      <span style={{ display: 'inline-flex' }}>
        <button type="button" ref={ref} className={`fchip ${on ? 'on' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          {on ? `${label}: ${value}` : label}
          {!on && <Icon name="chevronDown" size={14} />}
        </button>
        {on && onClear && (
          <button type="button" className="fchip on fx-btn" aria-label={`Clear ${label.toLowerCase()} filter`} onClick={onClear} style={{ marginLeft: -6, borderLeft: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, paddingLeft: 6, paddingRight: 8 }}>
            <Icon name="x" size={13} />
          </button>
        )}
      </span>
      {open && <Popover anchor={ref.current} onClose={() => setOpen(false)} width={width} align={align} label={`${label} filter`}>{children(() => setOpen(false))}</Popover>}
    </>
  );
}

/** Single choice list inside a popover. */
export function ChoiceList<T extends string>({ options, value, onPick, title }: { options: Array<[T, ReactNode, ReactNode?]>; value: T | '' | null | undefined; onPick: (v: T | '') => void; title?: string }) {
  return (
    <div role="radiogroup" aria-label={title}>
      {title && <div className="pop-h">{title}</div>}
      {options.map(([v, l, n]) => (
        <button type="button" key={v} className="opt" role="radio" aria-checked={value === v} onClick={() => onPick(value === v ? '' : v)}>
          <span className="rd" />{l}{n != null && <small>{n}</small>}
        </button>
      ))}
    </div>
  );
}

/** Several choices with checkboxes. */
export function MultiList<T extends string>({ options, values, onChange, title }: { options: Array<[T, ReactNode]>; values: T[]; onChange: (v: T[]) => void; title?: string }) {
  return (
    <div role="group" aria-label={title}>
      {title && <div className="pop-h">{title}</div>}
      {options.map(([v, l]) => {
        const on = values.includes(v);
        return (
          <button type="button" key={v} className="opt" role="checkbox" aria-checked={on} onClick={() => onChange(on ? values.filter(x => x !== v) : [...values, v])}>
            <span className={`cbx ${on ? 'on' : ''}`} aria-hidden="true">{on && <Icon name="check" size={13} />}</span>{l}
          </button>
        );
      })}
    </div>
  );
}

export interface PickPerson { id: string; name: string; sub?: string }
/** Searchable list of people or trips. */
export function PersonPicker({ people, value, onPick, placeholder = 'Search names', loading }: { people: PickPerson[]; value?: string | null; onPick: (id: string | '') => void; placeholder?: string; loading?: boolean }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => people.filter(p => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()) || p.sub?.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 60), [people, q]);
  return (
    <div>
      <div className="pop-search"><TextInput icon="search" value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} data-autofocus /></div>
      {loading && <div className="sd-empty">Loading…</div>}
      {!loading && list.length === 0 && <div className="sd-empty">No match.</div>}
      <div role="radiogroup" aria-label={placeholder}>
        {list.map(p => (
          <button type="button" key={p.id} className="opt" role="radio" aria-checked={value === p.id} onClick={() => onPick(value === p.id ? '' : p.id)}>
            <Avatar name={p.name} size="sm" />
            <span style={{ display: 'grid', minWidth: 0 }}><span>{p.name}</span>{p.sub && <span className="help-inline">{p.sub}</span>}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** From and to IST calendar dates. */
export function DateRange({ from, to, onApply, onClear, fromLabel = 'From', toLabel = 'To', note }: { from?: string; to?: string; onApply: (f: string, t: string) => void; onClear: () => void; fromLabel?: string; toLabel?: string; note?: ReactNode }) {
  const [f, setF] = useState(from ?? '');
  const [t, setT] = useState(to ?? '');
  const bad = !!f && !!t && f > t;
  return (
    <div style={{ display: 'grid', gap: 10, padding: 6 }}>
      <label className="w-field"><span className="flabel">{fromLabel}</span><TextInput type="date" value={f} onChange={e => setF(e.target.value)} icon="calendar" data-autofocus /></label>
      <label className="w-field"><span className="flabel">{toLabel}</span><TextInput type="date" value={t} onChange={e => setT(e.target.value)} icon="calendar" error={bad} /></label>
      {bad && <div className="errtxt"><Icon name="alert" size={14} /><span>The start date is after the end date.</span></div>}
      {note && <div className="help">{note}</div>}
      <div className="pop-foot">
        <Btn kind="ghost" size="sm" onClick={onClear}>Clear</Btn>
        <Btn kind="pri" size="sm" onClick={() => !bad && onApply(f, t)} locked={bad ? 'The start date is after the end date.' : null}>Apply</Btn>
      </div>
    </div>
  );
}

/** The search box in a toolbar (prototype fsearch) with a clear button. */
export function SearchBox({ value, onChange, placeholder, width }: { value: string; onChange: (v: string) => void; placeholder: string; width?: number }) {
  return (
    <div className="fsearch" style={{ ...(value ? { borderColor: 'var(--accent)', color: 'var(--ink)' } : {}), ...(width ? { minWidth: width } : {}) }}>
      <Icon name="search" size={15} />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', color: 'var(--ink)', fontSize: 13 }} />
      {value && <button type="button" onClick={() => onChange('')} aria-label="Clear search" style={{ display: 'grid', placeItems: 'center' }}><Icon name="x" size={14} /></button>}
    </div>
  );
}

/** Previous and next pages. */
export function Pager({ page, pageSize, total, onPage, onSize, sizes = [20, 50, 100] }: { page: number; pageSize: number; total: number; onPage: (p: number) => void; onSize?: (n: number) => void; sizes?: number[] }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0, to = Math.min(total, page * pageSize);
  return (
    <div className="pager">
      <span>{total ? `Showing ${from}–${to} of ${total}` : 'Nothing to show'}</span>
      <span className="sp" />
      {onSize && (
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>Rows
          <select value={pageSize} onChange={e => onSize(Number(e.target.value))} className="w-in" style={{ border: '1px solid var(--line-2)', borderRadius: 8, padding: '4px 6px', background: 'var(--surface)' }}>
            {sizes.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      )}
      <Btn kind="sec" size="xs" icon="chevronLeft" onClick={() => onPage(page - 1)} disabled={page <= 1} ariaLabel="Previous page">Previous</Btn>
      <span className="num">Page {page} of {pages}</span>
      <Btn kind="sec" size="xs" iconRight="chevronRight" onClick={() => onPage(page + 1)} disabled={page >= pages} ariaLabel="Next page">Next</Btn>
    </div>
  );
}

/** Searchable list of trips by name, reference or client (for the export centre, audit log and new export). */
export function TripPicker({ value, onPick, autoFocus = true }: { value?: string | null; onPick: (t: TripRow | null) => void; autoFocus?: boolean }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 250);
  const trips = useTrips({ q: dq || undefined, pageSize: 12 });
  const list = trips.data?.items ?? [];
  return (
    <div>
      <div className="pop-search"><TextInput icon="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search trips or references" aria-label="Search trips or references" {...(autoFocus ? { 'data-autofocus': true } : {})} /></div>
      {trips.isLoading && <div className="sd-empty">Loading…</div>}
      {!trips.isLoading && list.length === 0 && <div className="sd-empty">No trip matches “{dq}”.</div>}
      <div role="radiogroup" aria-label="Trips">
        {list.map(t => (
          <button type="button" key={t.id} className="opt" role="radio" aria-checked={value === t.id || value === t.ref} onClick={() => onPick(value === t.id || value === t.ref ? null : t)}>
            <span className="rd" />
            <span style={{ display: 'grid', minWidth: 0 }}><span>{t.name}</span><span className="help-inline">{t.ref} · {t.departmentName}</span></span>
          </button>
        ))}
      </div>
    </div>
  );
}
