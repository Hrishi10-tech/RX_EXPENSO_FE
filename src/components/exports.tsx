/** Export log pieces shared by the trip's Exports tab (W04·e) and the export centre (W08·d). */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, queryClient } from '../app/core';
import { useExportProgress } from '../app/realtime';
import { keys } from '../api/keys';
import type { ExportFile, ExportRow } from '../api/types';
import { saveBlob } from '../lib/download';
import { FORMAT_LABEL } from '../lib/labels';
import { toast } from './Toasts';
import { Bar, Btn, Pill } from './ui';

export async function downloadExportFile(f: ExportFile) {
  if (!f.url) return;
  try {
    const r = await api.blob(f.url);
    saveBlob(r.blob, r.filename || f.name);
    toast(`Downloading ${r.filename || f.name}`, { icon: 'download' });
  } catch (e) {
    toast((e as Error).message || 'Couldn’t download the file', { tone: 'bad' });
  }
}

/** The main file first: the ZIP when there is one. */
export const mainFile = (x: ExportRow) => x.files.find(f => f.format === 'zip' && f.url) ?? x.files.find(f => f.url) ?? null;

export function ExportStatus({ x, withFinal = true }: { x: ExportRow; withFinal?: boolean }) {
  const live = useExportProgress(x.status === 'building' ? x.id : null);
  if (x.status === 'building' || x.status === 'queued') {
    const pct = live?.pct ?? x.progress?.pct ?? (x.status === 'queued' ? 0 : 1);
    return (
      <div style={{ display: 'grid', gap: 4, minWidth: 130 }}>
        <Pill tone="acc" icon="loader">{x.status === 'queued' ? 'Queued' : `Building ${pct}%`}</Pill>
        <Bar pct={pct} tone="pool" label={`Building ${pct}%`} />
        {(live?.step ?? x.progress?.step) && <span className="t2">{live?.step ?? x.progress?.step}{live?.detail ? ` · ${live.detail}` : ''}</span>}
      </div>
    );
  }
  if (x.status === 'failed') return <><Pill tone="bad" icon="alert">Failed</Pill>{x.error && <span className="t2">{x.error}</span>}</>;
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {withFinal && <Pill tone="ok">Ready</Pill>}
      {x.provisional ? <Pill tone="warn">Provisional</Pill> : <Pill tone={withFinal ? 'line' : 'ok'}>Final</Pill>}
    </span>
  );
}

export function useRetryExport() {
  return useMutation({
    mutationFn: (id: string) => api.post<ExportRow>(`/finance/exports/${id}/retry`),
    onSuccess: x => {
      queryClient.setQueryData(keys.export(x.id), x);
      void queryClient.invalidateQueries({ queryKey: keys.exportsAll });
      void queryClient.invalidateQueries({ queryKey: keys.trip(x.tripId) });
      toast('Retrying the export. It builds in the background.');
    },
    onError: (e: unknown) => toast((e as Error).message, { tone: 'bad' }),
  });
}

export function useCancelExport() {
  return useMutation({
    mutationFn: (x: ExportRow) => api.del(`/finance/exports/${x.id}`),
    onSuccess: (_r, x) => {
      void queryClient.invalidateQueries({ queryKey: keys.exportsAll });
      void queryClient.invalidateQueries({ queryKey: keys.trip(x.tripId) });
      toast('Export cancelled. Nothing was logged.');
    },
    onError: (e: unknown) => toast((e as Error).message, { tone: 'bad' }),
  });
}

/** Download, Retry or Cancel for one export row. */
export function ExportActions({ x }: { x: ExportRow }) {
  const retry = useRetryExport();
  const cancel = useCancelExport();
  const [more, setMore] = useState(false);
  if (x.status === 'failed') return <Btn kind="sec" size="xs" icon="refresh" busy={retry.isPending} onClick={() => retry.mutate(x.id)}>Retry</Btn>;
  if (x.status === 'building' || x.status === 'queued') return <Btn kind="ghost" size="xs" icon="x" busy={cancel.isPending} onClick={() => cancel.mutate(x)}>Cancel</Btn>;
  const main = mainFile(x);
  if (!main) {
    const onDevice = x.files.some(f => f.onDevice);
    return <span className="sm-note">{onDevice ? 'On the member’s phone' : 'No files'}</span>;
  }
  const others = x.files.filter(f => f.url && f !== main);
  return (
    <div className="acts" style={{ flexWrap: more ? 'wrap' : 'nowrap', justifyContent: 'flex-end' }}>
      <Btn kind="sec" size="xs" icon="download" onClick={() => void downloadExportFile(main)} title={main.name} ariaLabel={`Download the ${FORMAT_LABEL[main.format]}`}>{more ? FORMAT_LABEL[main.format] : 'Download'}</Btn>
      {others.length > 0 && (more
        ? others.map(f => <Btn key={f.format} kind="ghost" size="xs" icon="download" onClick={() => void downloadExportFile(f)} title={f.name} ariaLabel={`Download the ${FORMAT_LABEL[f.format]}`}>{FORMAT_LABEL[f.format]}</Btn>)
        : <Btn kind="ghost" size="xs" onClick={() => setMore(true)} ariaLabel={`Show the other ${others.length === 1 ? 'file' : `${others.length} files`}`} title={others.map(f => f.name).join('\n')}>{`+${others.length}`}</Btn>)}
    </div>
  );
}
