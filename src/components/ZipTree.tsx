/** The W08 ZIP folder tree, drawn from the preview's real file names (prototype .tree). */
import { Fragment, useMemo } from 'react';
import { buildZipTree, layoutTree, lineRows, splitProvisional, type TreeLine } from '../lib/zipTree';

/** One row of a name: the "_PROVISIONAL" marker highlighted, file names bold, folders in accent. */
function Row({ l, from, to }: { l: TreeLine; from: number; to: number }) {
  let at = 0;
  const parts = splitProvisional(l.name).flatMap(p => {
    const s = at;
    at += p.text.length;
    const a = Math.max(s, from);
    const b = Math.min(at, to);
    return b > a ? [{ text: l.name.slice(a, b), prov: p.prov }] : [];
  });
  return (
    <>
      {parts.map((p, k) => (p.prov ? <span key={k} className="pv">{p.text}</span> : l.kind === 'file' ? <b key={k}>{p.text}</b> : <span key={k}>{p.text}</span>))}
    </>
  );
}

export function ZipTree({ paths, maxFiles = 3, wrap = 64 }: { paths: string[]; maxFiles?: number; wrap?: number }) {
  const lines = useMemo(() => layoutTree(buildZipTree(paths), { maxFiles, wrap }), [paths, maxFiles, wrap]);
  return (
    <div className="tree" role="tree" aria-label="ZIP contents" tabIndex={0}>
      {lines.map((l, i) => (
        <span className="ln" key={i} role="treeitem" aria-level={l.prefix.length / 4 + 1} aria-label={l.name + (l.note ? `, ${l.note}` : '')}>
          {lineRows(l).map((r, k) => (
            <Fragment key={k}>
              {k === 0 ? l.prefix : `\n${l.cont ?? ''}`}
              <span className={l.kind === 'dir' ? 'd' : undefined}><Row l={l} from={r.from} to={r.to} /></span>
            </Fragment>
          ))}
          {l.note && <span className="note">{'  '}{l.note}</span>}
        </span>
      ))}
    </div>
  );
}
