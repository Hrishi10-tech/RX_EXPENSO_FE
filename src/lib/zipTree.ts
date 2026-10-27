/**
 * Builds the W08 preview folder tree from the export preview's `zipPaths` (the real file names the server
 * will write), and lays it out as text lines with box-drawing branches, like the prototype.
 */

export interface TreeNode {
  name: string;
  dir: boolean;
  children: TreeNode[];
}

/** A tree of folders and files, in the order the server listed them (folders keep first-seen order). */
export function buildZipTree(paths: string[]): TreeNode {
  const root: TreeNode = { name: '', dir: true, children: [] };
  for (const p of paths) {
    const parts = p.split('/').filter(Boolean);
    let node = root;
    parts.forEach((part, i) => {
      const isDir = i < parts.length - 1;
      let child = node.children.find(c => c.name === part && c.dir === isDir);
      if (!child) {
        child = { name: part, dir: isDir, children: [] };
        node.children.push(child);
      }
      node = child;
    });
  }
  // Files before folders at each level, as a file manager lists a package's top level.
  const sort = (n: TreeNode) => {
    n.children.sort((a, b) => Number(a.dir) - Number(b.dir));
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}

export interface TreeLine {
  /** Branch drawing before the name, e.g. "│   ├── " */
  prefix: string;
  name: string;
  kind: 'dir' | 'file' | 'more';
  /** "5 files" beside a folder that holds only files. */
  note?: string;
  /** Where a long name wraps (character offsets into `name`), and the branch drawing for its continuation rows. */
  breaks?: number[];
  cont?: string;
}

export interface LayoutOptions {
  /** A folder holding only files shows this many, then "… N more". */
  maxFiles?: number;
  /** Wrap names so a row (branches and name) stays within this many characters. */
  wrap?: number;
}

/**
 * Offsets where `name` wraps: after an underscore or hyphen where possible (file names are
 * <ref>_<member>_<location>_…), hard breaks only for a single piece longer than a row.
 */
export function wrapPoints(name: string, first: number, rest: number): number[] {
  const out: number[] = [];
  let start = 0;
  let width = Math.max(8, first);
  while (name.length - start > width) {
    const slice = name.slice(start, start + width);
    let cut = Math.max(slice.lastIndexOf('_'), slice.lastIndexOf('-'));
    cut = cut > 0 ? start + cut + 1 : start + width;
    out.push(cut);
    start = cut;
    width = Math.max(8, rest);
  }
  return out;
}

/** Counts the files anywhere under a node. */
export function countFiles(n: TreeNode): number {
  return n.children.reduce((s, c) => s + (c.dir ? countFiles(c) : 1), 0);
}

/** Text lines for the tree: the single top folder first, then its contents with ├── └── │ branches. */
export function layoutTree(root: TreeNode, o: LayoutOptions = {}): TreeLine[] {
  const maxFiles = o.maxFiles ?? 3;
  const lines: TreeLine[] = [];
  const push = (l: TreeLine, cont: string) => {
    if (o.wrap && l.prefix.length + l.name.length > o.wrap) {
      l.breaks = wrapPoints(l.name, o.wrap - l.prefix.length, o.wrap - cont.length);
      l.cont = cont;
    }
    lines.push(l);
  };
  const onlyFiles = (n: TreeNode) => n.children.length > 0 && n.children.every(c => !c.dir);
  const walk = (n: TreeNode, indent: string) => {
    let kids = n.children;
    let hidden = 0;
    if (onlyFiles(n) && kids.length > maxFiles) {
      hidden = kids.length - (maxFiles - 1);
      kids = kids.slice(0, maxFiles - 1);
    }
    kids.forEach((c, i) => {
      const last = i === kids.length - 1 && hidden === 0;
      const inner = indent + (last ? '    ' : '│   ');
      push({
        prefix: indent + (last ? '└── ' : '├── '),
        name: c.dir ? `${c.name}/` : c.name,
        kind: c.dir ? 'dir' : 'file',
        note: c.dir && onlyFiles(c) ? `${c.children.length} file${c.children.length === 1 ? '' : 's'}` : undefined,
      }, inner);
      if (c.dir) walk(c, inner);
    });
    if (hidden) lines.push({ prefix: indent + '└── ', name: `… ${hidden} more`, kind: 'more' });
  };
  // A package normally has one top folder; show it as the first line.
  if (root.children.length === 1 && root.children[0].dir) {
    const top = root.children[0];
    push({ prefix: '', name: `${top.name}/`, kind: 'dir' }, '');
    walk(top, '');
  } else {
    walk(root, '');
  }
  return lines;
}

/** The rows of a (possibly wrapped) line: the name cut at its break points. */
export function lineRows(l: TreeLine): Array<{ from: number; to: number }> {
  const cuts = [0, ...(l.breaks ?? []), l.name.length];
  return cuts.slice(1).map((to, i) => ({ from: cuts[i], to }));
}

/** Splits a name around "_PROVISIONAL" so the marker can be highlighted. */
export function splitProvisional(name: string): Array<{ text: string; prov: boolean }> {
  const out: Array<{ text: string; prov: boolean }> = [];
  const re = /_PROVISIONAL/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(name))) {
    if (m.index > last) out.push({ text: name.slice(last, m.index), prov: false });
    out.push({ text: m[0], prov: true });
    last = m.index + m[0].length;
  }
  if (last < name.length) out.push({ text: name.slice(last), prov: false });
  return out;
}
