import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ExportChoice, ExportScopeForm, effectiveFormats, exportParams, zipForced } from './ExportScopeForm';
import { buildSteps } from './buildSteps';
import type { LocationRow } from '../../api/types';

const members = [{ userId: 'u-arjun', name: 'Arjun Mehta' }, { userId: 'u-divya', name: 'Divya Raman' }];
const locations = [{ id: 'l-blr', city: 'Bengaluru', venue: 'BIEC' }, { id: 'l-mys', city: 'Mysuru', venue: null }] as unknown as LocationRow[];
const start: ExportChoice = { scope: 'trip', memberUserId: '', formats: ['pdf'], limit: 'all', locationId: '', dateFrom: '2026-09-21', dateTo: '2026-09-24' };

function Harness({ onChange }: { onChange?: (c: ExportChoice) => void }) {
  const [c, setC] = useState(start);
  return <ExportScopeForm value={c} onChange={n => { setC(n); onChange?.(n); }} members={members} locations={locations} window={{ from: '2026-09-21', to: '2026-09-24' }} />;
}

describe('export choices', () => {
  it('adds the ZIP for the “each member” scopes', () => {
    expect(zipForced('each')).toBe(true);
    expect(zipForced('trip_and_each')).toBe(true);
    expect(zipForced('trip')).toBe(false);
    expect(effectiveFormats({ scope: 'each', formats: ['pdf'] })).toEqual(['pdf', 'zip']);
    expect(effectiveFormats({ scope: 'trip', formats: ['xlsx', 'pdf'] })).toEqual(['pdf', 'xlsx']);
  });

  it('sends only the fields a choice needs', () => {
    expect(exportParams({ ...start, scope: 'member', memberUserId: 'u-divya', limit: 'loc', locationId: 'l-mys' })).toEqual({
      scope: 'member', memberUserId: 'u-divya', formats: ['pdf'], locationId: 'l-mys', dateFrom: undefined, dateTo: undefined,
    });
    expect(exportParams({ ...start, limit: 'dates' })).toMatchObject({ memberUserId: undefined, locationId: undefined, dateFrom: '2026-09-21', dateTo: '2026-09-24' });
  });
});

describe('ExportScopeForm', () => {
  it('offers the four scopes and locks ZIP on for “each member”', async () => {
    const u = userEvent.setup();
    let last = start;
    render(<Harness onChange={c => { last = c; }} />);
    const scopes = within(screen.getByRole('radiogroup', { name: 'What to export' })).getAllByRole('radio');
    expect(scopes.map(s => s.textContent)).toEqual([
      expect.stringContaining('Whole trip'), expect.stringContaining('One member'), expect.stringContaining('Each member separately'), expect.stringContaining('Whole trip and each member'),
    ]);
    const zip = screen.getByRole('checkbox', { name: /ZIP package/ });
    expect(zip).toHaveAttribute('aria-checked', 'false');
    await u.click(screen.getByRole('radio', { name: /Each member separately/ }));
    expect(last.scope).toBe('each');
    expect(zip).toHaveAttribute('aria-checked', 'true');
    expect(zip).toHaveAttribute('aria-disabled', 'true');
    expect(zip).toHaveTextContent('Always included when exporting each member');
    await u.click(zip);
    expect(effectiveFormats(last)).toContain('zip');
  });

  it('asks for a member when exporting one member, and names them', async () => {
    const u = userEvent.setup();
    let last = start;
    render(<Harness onChange={c => { last = c; }} />);
    await u.click(screen.getByRole('radio', { name: /One member/ }));
    expect(last.memberUserId).toBe('u-arjun');
    await u.click(screen.getByRole('button', { name: 'Divya' }));
    expect(last.memberUserId).toBe('u-divya');
  });

  it('warns when no format is chosen', async () => {
    const u = userEvent.setup();
    render(<Harness />);
    await u.click(screen.getByRole('checkbox', { name: /PDF statement/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose at least one format.');
  });

  it('limits to one location or a date range, and catches a backwards range', async () => {
    const u = userEvent.setup();
    let last = start;
    render(<Harness onChange={c => { last = c; }} />);
    await u.click(screen.getByRole('button', { name: 'One location' }));
    expect(last).toMatchObject({ limit: 'loc', locationId: 'l-blr' });
    await u.click(screen.getByRole('button', { name: 'Mysuru' }));
    expect(last.locationId).toBe('l-mys');
    await u.click(screen.getByRole('button', { name: 'Date range' }));
    const from = screen.getByLabelText('From');
    await u.clear(from);
    await u.type(from, '2026-09-24');
    const to = screen.getByLabelText('To');
    await u.clear(to);
    await u.type(to, '2026-09-22');
    expect(screen.getByRole('alert')).toHaveTextContent('The start date is after the end date.');
  });
});

describe('build steps (W08·b)', () => {
  it('walks a whole-trip export through PDF, Excel and the ZIP by phase', () => {
    const x = { scope: 'trip' as const, formats: ['pdf', 'xlsx', 'zip'] as Array<'pdf' | 'xlsx' | 'zip'> };
    const s1 = buildSteps(x, { step: 'Statement PDF', detail: '4 of 11', phase: 'pdf', subject: null });
    expect(s1.map(r => `${r.key}:${r.state}`)).toEqual(['pdf:run', 'xlsx:', 'zip:']);
    expect(s1[0].running).toBe('Rows and receipt pages · 4 of 11');
    const s2 = buildSteps(x, { step: 'Packing the ZIP', detail: '12 of 40 files', phase: 'zip', subject: null });
    expect(s2.map(r => `${r.key}:${r.state}`)).toEqual(['pdf:done', 'xlsx:done', 'zip:run']);
    expect(s2[2].running).toBe('12 of 40 files · from the mobile app and the web app');
  });

  it('names whose statement is building for the “each member” scopes', () => {
    const s = buildSteps({ scope: 'trip_and_each', formats: ['pdf', 'zip'] }, { step: 'Arjun Mehta: statement PDF', detail: '3 of 9', phase: 'pdf', subject: { userId: 'u1', name: 'Arjun Mehta' } });
    expect(s.map(r => `${r.key}:${r.state}`)).toEqual(['stmts:run', 'zip:']);
    expect(s[0].running).toBe('Arjun Mehta: statement PDF · 3 of 9');
    const trip = buildSteps({ scope: 'trip_and_each', formats: ['xlsx', 'zip'] }, { step: 'Excel workbook', phase: 'xlsx', subject: null });
    expect(trip[0].running).toBe('Trip Excel workbook');
  });

  it('falls back to the step text when a build reports no phase', () => {
    const s = buildSteps({ scope: 'member', formats: ['pdf', 'xlsx'] }, { step: 'Excel workbook' });
    expect(s.map(r => `${r.key}:${r.state}`)).toEqual(['pdf:done', 'xlsx:run']);
  });

  it('shows only the formats asked for', () => {
    expect(buildSteps({ scope: 'member', formats: ['xlsx'] }, { step: 'Reading the trip', phase: 'read' }).map(r => r.key)).toEqual(['xlsx']);
  });
});
