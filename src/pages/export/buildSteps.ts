/** The build steps shown in W08·b, from the server's export.progress events (`phase` and `subject`). */
import type { ExportPhase, ExportRow } from '../../api/types';

type Phase = ExportPhase;
const ORDER: Phase[] = ['read', 'pdf', 'xlsx', 'zip'];

export interface StepRow { key: string; title: string; icon: 'fileText' | 'fileSheet' | 'fileZip' | 'layers'; idle: string; state: '' | 'run' | 'done'; running: string }

export interface StepProgress {
  step: string;
  detail?: string;
  /** read, pdf, xlsx or zip; older servers sent only the step text, which is read as a fallback. */
  phase?: Phase;
  /** The member whose statement is being built, or null for the trip's own. */
  subject?: { userId: string; name: string } | null;
}

/** The phase from the step text, for progress without a `phase` (a build that started before an upgrade). */
const phaseFromText = (step: string): Phase => (/Packing the ZIP/i.test(step) ? 'zip' : /Excel workbook/i.test(step) ? 'xlsx' : /statement PDF/i.test(step) ? 'pdf' : 'read');

/**
 * A trip or one-member export builds its PDF, then its Excel, then packs the ZIP; the "each member" scopes
 * build a statement pair per member first, shown as one Statements step naming whose statement is building.
 */
export function buildSteps(x: Pick<ExportRow, 'scope' | 'formats'>, p: StepProgress): StepRow[] {
  const fm = x.formats;
  const zip = fm.includes('zip');
  const phase: Phase = p.phase ?? phaseFromText(p.step);
  const who = p.subject?.name ?? (p.phase ? undefined : /^(.+): /.exec(p.step)?.[1]);
  const detail = p.detail;
  const stateOf = (k: Phase): StepRow['state'] => (ORDER.indexOf(k) < ORDER.indexOf(phase) ? 'done' : k === phase ? 'run' : '');
  const rows: StepRow[] = [];
  if (x.scope === 'each' || x.scope === 'trip_and_each') {
    const what = phase === 'xlsx' ? 'Excel workbook' : 'statement PDF';
    rows.push({
      key: 'stmts', icon: 'layers', title: x.scope === 'each' ? 'Member statements' : 'Statements',
      idle: x.scope === 'each' ? 'A PDF and an Excel workbook for each member' : 'The trip statement, then a PDF and an Excel workbook per member',
      state: phase === 'zip' ? 'done' : phase === 'read' ? '' : 'run',
      running: `${who ? `${who}: ${what}` : `Trip ${what}`}${detail ? ` · ${detail}` : ''}`,
    });
  } else {
    if (fm.includes('pdf') || zip) rows.push({ key: 'pdf', icon: 'fileText', title: 'Statement PDF', idle: 'Header, budgets, claims, expenses, verification, appendix', state: stateOf('pdf'), running: `${who ? `${who} · ` : ''}Rows and receipt pages${detail ? ` · ${detail}` : ''}` });
    if (fm.includes('xlsx') || zip) rows.push({ key: 'xlsx', icon: 'fileSheet', title: 'Excel workbook', idle: 'One row per expense, summary, budget and member sheets', state: stateOf('xlsx'), running: `${who ? `${who} · ` : ''}One row per expense, summary, budget and member sheets` });
  }
  if (zip) rows.push({ key: 'zip', icon: 'fileZip', title: 'Packing the ZIP', idle: 'Every attachment from the mobile app and the web app, in folders per SRS §8.3', state: phase === 'zip' ? 'run' : '', running: `${detail ? `${detail} · ` : ''}from the mobile app and the web app` });
  return rows;
}
