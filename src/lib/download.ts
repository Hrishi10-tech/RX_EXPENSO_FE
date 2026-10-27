/** Saving files in the browser: protected downloads arrive as blobs, then save under their real name. */

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** One CSV cell, quoted when it needs to be. */
export function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows to CSV text with a BOM, so Excel opens ₹ and names correctly. */
export function toCsv(rows: unknown[][]): string {
  return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}

export function saveCsv(filename: string, rows: unknown[][]) {
  saveBlob(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }), filename);
}
