/**
 * W04·b finance documents on the trip, a member's claim or one expense (FR-WEB-06), and W04·c the upload
 * drawer: where it is attached decides who sees it and where it is filed in exports (§3.7, §8.3).
 */
import { type DragEvent, useMemo, useRef, useState } from 'react';
import { api, queryClient, useMe } from '../../app/core';
import { keys } from '../../api/keys';
import type { DocScope, DocType, FinanceTrip, TripDocument } from '../../api/types';
import { Icon } from '../../components/Icon';
import { Drawer, Modal } from '../../components/Overlay';
import { toast } from '../../components/Toasts';
import { Banner, Btn, Card, EmptyState, Feed, Field, FileRow, FileType, Impact, Pill, Ropt, Select, Spinner, Tbl, TextArea, fileKind } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { saveBlob } from '../../lib/download';
import { firstName, fmtBytes, fmtDayTime, istToday, plural, slug } from '../../lib/format';
import { DOC_TYPE } from '../../lib/labels';
import { claimPath } from '../../lib/links';
import { refreshTrip } from './dialogs';

const MAX = 20 * 1024 * 1024;
const OK_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
const OK_EXT = /\.(pdf|jpe?g|png|webp|xlsx?|docx?)$/i;

/** Refused before upload with the limit named (W04·c). */
export function fileProblem(f: File): string | null {
  const typeOk = OK_TYPES.includes(f.type) || (!f.type && OK_EXT.test(f.name));
  const big = f.size > MAX;
  if (!typeOk && big) return `${fmtBytes(f.size)} · not a supported type and over 20 MB`;
  if (!typeOk) return 'Not a supported type. Use PDF, an image, Excel or Word.';
  if (big) return `${fmtBytes(f.size)} · over the 20 MB limit`;
  return null;
}

export async function downloadAttachment(url: string, name: string) {
  try {
    const r = await api.blob(url, { download: 1 });
    saveBlob(r.blob, r.filename && r.filename !== 'content' ? r.filename : name);
  } catch (e) {
    toast((e as Error).message || 'Couldn’t download the file', { tone: 'bad' });
  }
}

interface Pending { key: string; file: File; problem: string | null; state: 'ready' | 'uploading' | 'done' | 'error'; message?: string }

const DOC_FILE_LABEL: Record<DocType, string> = { payment_proof: 'Payment-proof', invoice: 'Invoice', approval_note: 'Approval-note', bank_statement: 'Bank-statement', other: 'Document' };

export function UploadDrawer({ t, initial, onClose, fixed }: { t: FinanceTrip; initial: File[]; onClose: () => void; fixed?: { scope: DocScope; memberUserId?: string; expenseId?: string; docType?: DocType } }) {
  const [items, setItems] = useState<Pending[]>(() => initial.map((f, i) => ({ key: `${Date.now()}-${i}`, file: f, problem: fileProblem(f), state: 'ready' })));
  const accepted = t.members.filter(m => m.joinStatus === 'accepted');
  const [scope, setScope] = useState<DocScope>(fixed?.scope ?? 'trip');
  const [member, setMember] = useState(fixed?.memberUserId ?? accepted[0]?.userId ?? '');
  const [expense, setExpense] = useState(fixed?.expenseId ?? t.expenses[0]?.id ?? '');
  const [docType, setDocType] = useState<DocType | ''>(fixed?.docType ?? '');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const more = useRef<HTMLInputElement>(null);
  const ready = items.filter(i => !i.problem && i.state !== 'done');
  const exp = t.expenses.find(e => e.id === expense);
  const who = scope === 'claim' ? t.members.find(m => m.userId === member)?.name : scope === 'expense' ? exp?.userName : null;
  const lockedClaim = who ? t.members.find(m => m.name === who)?.claimStatus === 'reimbursed' : false;

  const add = (fs: FileList | null) => {
    if (!fs) return;
    setItems(prev => [...prev, ...[...fs].map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, file: f, problem: fileProblem(f), state: 'ready' as const }))]);
  };
  const upload = async () => {
    if (!docType) { setErr('Choose the document type.'); return; }
    if (!ready.length) { setErr('Add a file to upload.'); return; }
    setErr(null); setBusy(true);
    let okCount = 0;
    for (const it of ready) {
      setItems(prev => prev.map(x => (x.key === it.key ? { ...x, state: 'uploading', message: undefined } : x)));
      const form = new FormData();
      form.append('file', it.file, it.file.name);
      form.append('tripId', t.trip.id);
      form.append('scope', scope);
      form.append('docType', docType);
      if (note.trim()) form.append('note', note.trim());
      if (scope === 'claim') form.append('memberUserId', member);
      if (scope === 'expense') form.append('expenseId', expense);
      try {
        await api.postForm('/finance/documents', form);
        okCount++;
        setItems(prev => prev.map(x => (x.key === it.key ? { ...x, state: 'done' } : x)));
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : 'Upload failed. Retry.';
        setItems(prev => prev.map(x => (x.key === it.key ? { ...x, state: 'error', message: msg } : x)));
      }
    }
    setBusy(false);
    refreshTrip(t.trip.id);
    void queryClient.invalidateQueries({ queryKey: keys.trip(t.trip.id) });
    if (okCount) {
      toast(`${plural(okCount, 'file')} uploaded to ${scope === 'trip' ? 'the trip' : scope === 'claim' ? `${who}’s claim` : `${exp?.description}`}${scope === 'trip' ? ' · finance only' : ` · ${firstName(who)} can see ${okCount === 1 ? 'it' : 'them'}`}`);
    }
    if (okCount === ready.length) onClose();
  };
  const fileName = `${t.trip.ref}_${scope === 'trip' ? 'Trip' : slug(who ?? 'Member')}_${docType ? DOC_FILE_LABEL[docType] : 'Type'}_${istToday()}.pdf`;
  return (
    <Drawer title="Upload documents" sub={`${t.trip.name.split(' · ')[0]} · ${t.trip.ref}`} onClose={onClose} width={560}
      footer={<><Btn kind="sec" onClick={onClose}>Cancel</Btn><Btn kind="pri" icon="upload" busy={busy} onClick={upload} locked={!ready.length ? 'Add a supported file first.' : null}>{`Upload ${plural(ready.length, 'file')}`}</Btn></>}>
      {err && <Banner tone="bad" icon="alert" title={err} />}
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map(it => (
          <FileRow key={it.key} kind={fileKind(it.file.type || it.file.name)} name={it.file.name}
            meta={it.problem ? <span style={{ color: 'var(--bad)', fontWeight: 700 }}>{it.problem}</span> : it.state === 'error' ? <span style={{ color: 'var(--bad)', fontWeight: 700 }}>{it.message}</span> : `${fmtBytes(it.file.size)} · ${it.state === 'done' ? 'uploaded' : it.state === 'uploading' ? 'uploading…' : 'ready to upload'}`}
            actions={it.state === 'done' ? <span style={{ color: 'var(--ok)' }}><Icon name="checkCircle" size={20} title="Uploaded" /></span>
              : it.state === 'uploading' ? <Spinner />
                : <Btn kind="ghost" size="xs" icon="x" ariaLabel={`Remove ${it.file.name}`} onClick={() => setItems(prev => prev.filter(x => x.key !== it.key))} />} />
        ))}
        <div>
          <input ref={more} type="file" multiple hidden onChange={e => { add(e.target.files); e.target.value = ''; }} accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.docx,.doc" />
          <Btn kind="ghost" size="sm" icon="plus" onClick={() => more.current?.click()}>{items.length ? 'Add more files' : 'Choose files'}</Btn>
        </div>
      </div>
      {!fixed && (
        <Field label="Attach to" required>
          <div className="radio-list" role="radiogroup" aria-label="Attach to">
            <Ropt on={scope === 'trip'} onClick={() => setScope('trip')} title="The trip" sub="Kept by finance. Members don’t see trip-level documents." />
            <Ropt on={scope === 'claim'} onClick={() => setScope('claim')} title="A member’s claim" sub={`${who && scope === 'claim' ? `${who} · visible to ${firstName(who)} in the app` : 'Visible to that member in the app'}`}
              extra={scope === 'claim' ? <span onClick={e => e.stopPropagation()} style={{ minWidth: 170 }}><Select aria-label="Member" value={member} onChange={e => setMember(e.target.value)} options={accepted.map(m => [m.userId, m.name])} /></span> : undefined} />
            <Ropt on={scope === 'expense'} onClick={() => setScope('expense')} title="One expense" sub="Pick an expense; shown on it in the app" />
            {scope === 'expense' && (
              <Select aria-label="Expense" value={expense} onChange={e => setExpense(e.target.value)}
                options={t.expenses.map(e => [e.id, `${e.userName} · ${e.description} · ₹${(e.amountPaise / 100).toLocaleString('en-IN')}`])} />
            )}
          </div>
        </Field>
      )}
      <Field label="Document type" required htmlFor="docType" help="Payment proof · Invoice · Approval note · Bank statement extract · Other">
        <Select id="docType" value={docType} onChange={e => { setDocType(e.target.value as DocType); setErr(null); }} placeholder="Choose a type" options={Object.entries(DOC_TYPE)} error={!!err && !docType} />
      </Field>
      <Field label="Note (optional)" htmlFor="docNote" help={`What the document is about. ${scope === 'trip' ? 'Seen by finance.' : `${firstName(who) || 'The member'} sees it with the document.`}`}>
        <TextArea id="docNote" value={note} maxLength={500} onChange={e => setNote(e.target.value)} placeholder="Sales head approval for the extra night in Mysuru" wrapStyle={{ minHeight: 64 }} />
      </Field>
      {lockedClaim && <Banner tone="warn" icon="lock" title="This claim is reimbursed and locked">Documents can’t be added to a reimbursed claim. Reopen the claim first, or attach to the trip.</Banner>}
      <Impact title="After upload" items={[
        ['eye', scope === 'trip' ? 'Only finance sees trip-level documents.' : `${firstName(who) || 'The member'} sees it on ${scope === 'claim' ? 'their claim' : 'the expense'} in the app (claim and expense documents are visible to the member).`],
        ['fileZip', `Filed in exports as ${fileName.replace(/\.pdf$/, '')}.<ext>, under Finance-documents/${scope === 'trip' ? 'Trip' : slug(who ?? 'Member')}/.`],
        ['trash', scope === 'trip' ? 'You can delete it any time; other finance users can only download it.' : `You can delete it until ${firstName(who) || 'the member'}’s claim is reimbursed.`],
      ]} />
    </Drawer>
  );
}

function attachedTo(d: TripDocument, t: FinanceTrip) {
  if (d.docScope === 'expense') { const e = t.expenses.find(x => x.id === d.expenseId); return e ? `Expense · ${e.description} (${firstName(e.userName)})` : 'Expense'; }
  if (d.docScope === 'claim') { const m = t.members.find(x => x.userId === d.memberUserId); return `Claim · ${m?.name ?? 'member'}`; }
  return 'Trip';
}

export function DocumentsTab({ t, uploadOpen, setUpload }: { t: FinanceTrip; uploadOpen: boolean; setUpload: (v: boolean) => void }) {
  const me = useMe();
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const [del, setDel] = useState<TripDocument | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const receipts = t.expenses.flatMap(e => e.attachments.filter(a => a.kind === 'receipt').map(a => ({ a, e })));
  const receiptPeople = [...new Set(receipts.map(r => r.e.userId))];
  const firstWith = t.members.find(m => receiptPeople.includes(m.userId));
  const open = (fs: File[]) => { setFiles(fs); setUpload(true); };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) open([...e.dataTransfer.files]); };
  const sorted = useMemo(() => [...t.documents], [t.documents]);

  const remove = async () => {
    if (!del) return;
    setDelBusy(true);
    try {
      await api.del(`/finance/documents/${del.id}`);
      toast(`${del.name} deleted`);
      refreshTrip(t.trip.id);
      setDel(null);
    } catch (e) {
      toast((e as Error).message, { tone: 'bad' });
    } finally { setDelBusy(false); }
  };

  return (
    <>
      <div className={`drop ${over ? 'over' : ''}`} role="button" tabIndex={0} aria-label="Upload documents: drop files here or choose files"
        onClick={() => input.current?.click()} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
        onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
        <input ref={input} type="file" multiple onChange={e => { if (e.target.files?.length) open([...e.target.files]); e.target.value = ''; }} accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.docx,.doc" />
        <Icon name="upload" size={26} />
        <b style={{ color: 'var(--ink)' }}>Drop files here or choose files</b>
        <span>PDF, images, Excel or Word · up to 20 MB each · attach to the trip, a member’s claim or one expense</span>
      </div>
      <Card title="Finance documents" icon="file" flush sub={plural(t.documents.length, 'file')} right={<Btn kind="pri" size="sm" icon="upload" onClick={() => open([])}>Upload</Btn>}>
        {sorted.length ? (
          <Tbl label="Finance documents" heads={[['File'], ['Attached to'], ['Type'], ['Member sees it'], ['Uploaded'], ['Size', 'r'], ['', 'r']]}>
            {sorted.map(d => {
              const seer = d.visibleToMember ? t.members.find(m => m.userId === d.memberUserId)?.name : null;
              return (
                <tr key={d.id}>
                  <td>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><FileType kind={fileKind(d.mime || d.name)} small /><b style={{ fontFamily: 'var(--f-mono)', fontSize: 12, fontWeight: 500, wordBreak: 'break-all' }}>{d.name}</b></div>
                    {d.note && <span className="t2" style={{ marginTop: 4 }}>“{d.note}”</span>}
                  </td>
                  <td>{attachedTo(d, t)}</td>
                  <td><Pill tone="line">{d.docType ? DOC_TYPE[d.docType] : 'Document'}</Pill></td>
                  <td>{d.visibleToMember ? `Yes, ${firstName(seer)}` : <span className="faint">No · trip level</span>}</td>
                  <td>{d.uploadedBy === me.id ? 'You' : d.uploadedByName} · {d.uploadedAt ? fmtDayTime(d.uploadedAt) : ''}</td>
                  <td className="r">{fmtBytes(d.size)}</td>
                  <td className="r"><div className="acts">
                    {d.url && <Btn kind="ghost" size="xs" icon="download" ariaLabel={`Download ${d.name}`} onClick={() => void downloadAttachment(d.url!, d.name)} />}
                    {d.canDelete && <Btn kind="ghost" size="xs" icon="trash" ariaLabel={`Delete ${d.name}`} onClick={() => setDel(d)} />}
                  </div></td>
                </tr>
              );
            })}
          </Tbl>
        ) : <EmptyState icon="file" title="No finance documents yet">Approval notes, vendor invoices and payment proofs belong here, with the trip they are about.</EmptyState>}
      </Card>
      <Card title="From the mobile app" icon="smartphone">
        <Feed items={receipts.length ? [{ key: 'r', icon: 'image', title: `${plural(receipts.length, 'receipt image')} from ${plural(receiptPeople.length, 'member')}`, sub: `Open them beside each expense in claim review${t.totals.pendingUploads ? ` · ${t.totals.pendingUploads} still on a phone` : ''}`, to: firstWith ? claimPath(t.trip, firstWith) : undefined }] : []}
          empty={<p className="sm-note" style={{ margin: 0 }}>No receipts yet.</p>} />
      </Card>
      <Banner tone="neutral" icon="fileZip" title="Everything here goes into the ZIP">
        Finance documents are filed under Finance-documents/Trip or Finance-documents/&lt;member&gt;, receipts under Members/&lt;member&gt;/Receipts, all with the naming rule in SRS §8.3.
      </Banner>
      {uploadOpen && <UploadDrawer t={t} initial={files} onClose={() => { setUpload(false); setFiles([]); }} />}
      {del && (
        <Modal icon="trash" tone="bad" title={`Delete ${del.name}?`} onClose={() => setDel(null)}
          lead="It disappears from the trip and from future exports. Exports already made keep their copy."
          footer={<><Btn kind="sec" onClick={() => setDel(null)}>Keep it</Btn><Btn kind="dangerfill" icon="trash" busy={delBusy} onClick={remove}>Delete</Btn></>} />
      )}
    </>
  );
}
