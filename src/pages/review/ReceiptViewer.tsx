/**
 * The receipt beside its expense (FR-WEB-05): zoom, rotate, open the stored original, several attachments
 * side by side or one at a time, and the W06·i placeholder while a photo is still on the member's phone.
 */
import { useEffect, useState } from 'react';
import type { Attachment, ReviewExpense } from '../../api/types';
import { Icon } from '../../components/Icon';
import { toast } from '../../components/Toasts';
import { Btn, Spinner } from '../../components/ui';
import { openOriginal, useBlobUrl } from '../../lib/blobs';
import { fmtDayTimeComma, fmtTime, plural } from '../../lib/format';
import { downloadAttachment } from '../trip/DocumentsTab';

const isImage = (a: Attachment) => a.mime.startsWith('image/');
const isPdf = (a: Attachment) => a.mime === 'application/pdf';

/** Receipts first, then files sent with replies, then finance documents on the expense. */
export function orderedFiles(e: ReviewExpense): Attachment[] {
  const rank = (a: Attachment) => (a.kind === 'document' ? 2 : a.messageId ? 1 : 0);
  return [...e.attachments].sort((a, b) => rank(a) - rank(b));
}

function FileView({ a, zoom, rot, caption }: { a: Attachment; zoom: number; rot: number; caption?: string }) {
  const img = useBlobUrl(isImage(a) ? a.url : null, 1600);
  const pdf = useBlobUrl(isPdf(a) ? a.url : null);
  const frame = { transform: `scale(${zoom}) rotate(${rot}deg)` };
  let inner;
  if (isImage(a)) inner = img.isLoading ? <Spinner size={24} label="Loading the receipt" /> : img.error ? <span className="sm-note">Couldn’t load this image. {(img.error as Error).message}</span> : <img className="receipt" src={img.data} alt={`Receipt ${a.name}`} />;
  else if (isPdf(a)) inner = pdf.isLoading ? <Spinner size={24} label="Loading the PDF" /> : pdf.data ? <iframe className="pdf" src={pdf.data} title={a.name} /> : <span className="sm-note">Couldn’t load this PDF.</span>;
  else inner = <div className="rph" style={{ minHeight: 200 }}><span className="big" style={{ background: 'var(--sunken)', color: 'var(--ink-2)' }}><Icon name="file" size={28} /></span><b>{a.name}</b><Btn kind="sec" size="sm" icon="download" onClick={() => a.url && void downloadAttachment(a.url, a.name)}>Download</Btn></div>;
  return (
    <div style={{ display: 'grid', justifyItems: 'center' }}>
      {caption && <div className="cap">{caption}</div>}
      <div className="frame" style={frame}>{inner}</div>
    </div>
  );
}

export function ReceiptViewer({ e, first, onRemind, reminding }: { e: ReviewExpense; first: string; onRemind: () => void; reminding: boolean }) {
  const files = orderedFiles(e);
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rot, setRot] = useState(0);
  const [sideBySide, setSideBySide] = useState(true);
  useEffect(() => { setIdx(0); setZoom(1); setRot(0); setSideBySide(true); }, [e.id]);
  const cur = files[Math.min(idx, files.length - 1)];
  const pending = files.filter(f => f.status !== 'uploaded');
  const uploadedImages = files.filter(f => f.status === 'uploaded' && isImage(f));
  const pair = sideBySide && files.length === 2 && uploadedImages.length === 2;
  const caption = (a: Attachment) => (a.kind === 'document' ? `Finance document · ${a.name}${a.note ? ` · “${a.note}”` : ''}` : a.messageId ? `From ${first}’s reply · ${a.name}` : a.name);

  let body;
  if (!files.length) {
    body = (
      <div className="rph">
        <span className="big" style={e.paidBy === 'company' ? { background: 'var(--sunken)', color: 'var(--ink-2)' } : undefined}><Icon name={e.paidBy === 'company' ? 'building' : 'receipt'} size={28} /></span>
        <b>{e.paidBy === 'company' ? 'Company-paid, no receipt needed' : 'No receipt attached'}</b>
        <span>{e.paidBy === 'company' ? 'Counts in trip cost, draws no budget and isn’t reimbursed.' : 'A self-paid expense needs a receipt. Query the member for one.'}</span>
      </div>
    );
  } else if (cur && cur.status !== 'uploaded') {
    body = (
      <div className="rph">
        <span className="big"><Icon name="cloudOff" size={28} /></span>
        <b>The receipt hasn’t reached the server</b>
        <span>{first}’s phone saved {plural(pending.length, 'photo')}{cur.capturedAt ? ` at ${fmtDayTimeComma(cur.capturedAt)}` : ''} but hasn’t uploaded {pending.length === 1 ? 'it' : 'them'} yet. It uploads the next time the phone is online with Expenso open.</span>
        <Btn kind="sec" size="sm" icon="bellRing" busy={reminding} onClick={onRemind}>{`Remind ${first}`}</Btn>
      </div>
    );
  } else if (pair) {
    body = <div className="split2">{uploadedImages.map(a => <FileView key={a.id} a={a} zoom={zoom} rot={rot} caption={caption(a)} />)}</div>;
  } else if (cur) {
    body = <FileView a={cur} zoom={zoom} rot={rot} />;
  }

  const label = !files.length ? 'No attachment'
    : pending.length && cur?.status !== 'uploaded' ? `${files.length - pending.length} of ${plural(files.length, 'attachment')} on the server`
      : pair ? `${files.length} attachments side by side` : `Attachment ${Math.min(idx, files.length - 1) + 1} of ${files.length}`;
  const canZoom = files.length > 0 && (!cur || cur.status === 'uploaded');

  return (
    <div className="rv-view">
      <div className="rv-tools">
        <Icon name="paperclip" size={15} />
        <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label}{files.length > 0 && <> · <span className="mono" style={{ fontSize: 12 }}>{pair ? uploadedImages.map(a => a.name).join(', ') : cur?.name}</span></>}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center', flex: 'none' }}>
          {files.length === 2 && uploadedImages.length === 2 && <Btn kind="ghost" size="xs" icon={pair ? 'maximize' : 'split'} onClick={() => setSideBySide(v => !v)}>{pair ? 'One at a time' : 'Side by side'}</Btn>}
          <Btn kind="ghost" size="xs" icon="minus" ariaLabel="Zoom out" locked={!canZoom ? 'Nothing to zoom yet' : null} onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))} />
          <span className="num" style={{ fontSize: 12, fontWeight: 700, minWidth: 38, textAlign: 'center' }} aria-live="polite">{Math.round(zoom * 100)}%</span>
          <Btn kind="ghost" size="xs" icon="plus" ariaLabel="Zoom in" locked={!canZoom ? 'Nothing to zoom yet' : null} onClick={() => setZoom(z => Math.min(3, +(z + 0.25).toFixed(2)))} />
          <Btn kind="ghost" size="xs" icon="rotate" ariaLabel="Rotate 90 degrees" locked={!canZoom ? 'Nothing to rotate yet' : null} onClick={() => setRot(r => (r + 90) % 360)} />
          <Btn kind="ghost" size="xs" icon="external" locked={!cur || cur.status !== 'uploaded' ? 'The original isn’t on the server yet' : null}
            onClick={() => cur?.url && openOriginal(cur.url).catch(err => toast((err as Error).message, { tone: 'bad' }))}>Original</Btn>
        </span>
      </div>
      <div className="rv-img" onDoubleClick={() => setZoom(z => (z === 1 ? 1.5 : 1))}>
        {body}
      </div>
      {files.length > 1 && !pair && (
        <div className="rv-thumbs" role="tablist" aria-label="Attachments">
          {files.map((a, i) => <Thumb key={a.id} a={a} on={i === idx} onClick={() => { setIdx(i); setZoom(1); setRot(0); }} />)}
        </div>
      )}
      {cur && cur.uploadedAt && cur.capturedAt && Math.abs(new Date(cur.uploadedAt).getTime() - new Date(cur.capturedAt).getTime()) > 30 * 60_000 && (
        <div className="sm-note" style={{ padding: '6px 14px', background: 'var(--surface)', borderTop: '1px solid var(--line)' }}>Captured {fmtDayTimeComma(cur.capturedAt)} · reached the server {fmtTime(cur.uploadedAt)}</div>
      )}
    </div>
  );
}

function Thumb({ a, on, onClick }: { a: Attachment; on: boolean; onClick: () => void }) {
  const img = useBlobUrl(isImage(a) && a.status === 'uploaded' ? a.url : null, 160);
  return (
    <button type="button" role="tab" aria-selected={on} aria-current={on} aria-label={a.name} title={a.name} onClick={onClick}>
      {a.status !== 'uploaded' ? <Icon name="cloudOff" size={18} /> : img.data ? <img src={img.data} alt="" /> : <Icon name={isPdf(a) ? 'fileText' : 'file'} size={18} />}
    </button>
  );
}
