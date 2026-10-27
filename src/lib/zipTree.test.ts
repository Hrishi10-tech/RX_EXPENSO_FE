import { describe, expect, it } from 'vitest';
import { buildZipTree, countFiles, layoutTree, lineRows, splitProvisional, wrapPoints } from './zipTree';

const PATHS = [
  'EXP-2026-00106_MedTech-Expo_PROVISIONAL/EXP-2026-00106_Trip-statement_PROVISIONAL.pdf',
  'EXP-2026-00106_MedTech-Expo_PROVISIONAL/EXP-2026-00106_Trip-statement_PROVISIONAL.xlsx',
  'EXP-2026-00106_MedTech-Expo_PROVISIONAL/Members/Arjun-Mehta/EXP-2026-00106_Arjun-Mehta_statement.pdf',
  'EXP-2026-00106_MedTech-Expo_PROVISIONAL/Members/Arjun-Mehta/EXP-2026-00106_Arjun-Mehta_statement.xlsx',
  'EXP-2026-00106_MedTech-Expo_PROVISIONAL/Members/Arjun-Mehta/Receipts/r1.jpg',
  'EXP-2026-00106_MedTech-Expo_PROVISIONAL/Members/Arjun-Mehta/Receipts/r2.jpg',
  'EXP-2026-00106_MedTech-Expo_PROVISIONAL/Members/Arjun-Mehta/Receipts/r3.jpg',
  'EXP-2026-00106_MedTech-Expo_PROVISIONAL/Members/Arjun-Mehta/Receipts/r4.jpg',
  'EXP-2026-00106_MedTech-Expo_PROVISIONAL/Members/Divya-Raman/EXP-2026-00106_Divya-Raman_statement_PROVISIONAL.pdf',
  'EXP-2026-00106_MedTech-Expo_PROVISIONAL/Finance-documents/Trip/invoice.pdf',
];

describe('ZIP preview tree', () => {
  it('builds folders from the server’s paths, files before folders', () => {
    const root = buildZipTree(PATHS);
    expect(root.children).toHaveLength(1);
    const top = root.children[0];
    expect(top.name).toBe('EXP-2026-00106_MedTech-Expo_PROVISIONAL');
    expect(top.children.map(c => `${c.dir ? 'd' : 'f'}:${c.name}`)).toEqual([
      'f:EXP-2026-00106_Trip-statement_PROVISIONAL.pdf',
      'f:EXP-2026-00106_Trip-statement_PROVISIONAL.xlsx',
      'd:Members',
      'd:Finance-documents',
    ]);
    expect(countFiles(root)).toBe(PATHS.length);
  });

  it('draws branches and collapses long file-only folders', () => {
    const lines = layoutTree(buildZipTree(PATHS), { maxFiles: 3 });
    const text = lines.map(l => l.prefix + l.name + (l.note ? `  ${l.note}` : ''));
    expect(text[0]).toBe('EXP-2026-00106_MedTech-Expo_PROVISIONAL/');
    expect(text).toContain('├── EXP-2026-00106_Trip-statement_PROVISIONAL.pdf');
    expect(text).toContain('├── Members/');
    expect(text).toContain('│   ├── Arjun-Mehta/');
    expect(text).toContain('│   │   └── Receipts/  4 files');
    expect(text).toContain('│   │       ├── r1.jpg');
    expect(text).toContain('│   │       ├── r2.jpg');
    expect(text).toContain('│   │       └── … 2 more');
    expect(text).toContain('│   └── Divya-Raman/  1 file');
    expect(text[text.length - 1]).toBe('        └── invoice.pdf');
    expect(lines.find(l => l.name === '… 2 more')?.kind).toBe('more');
  });

  it('wraps long names after an underscore, continuing under the branch', () => {
    const name = 'EXP-2026-00106_Arjun-Mehta_Bengaluru_2026-09-21_Local-travel-cab_780_1.jpg';
    const cuts = wrapPoints(name, 40, 44);
    expect(cuts.length).toBeGreaterThan(0);
    expect(name[cuts[0] - 1]).toMatch(/[_-]/);
    const [line] = layoutTree(buildZipTree([`Top/Receipts/${name}`, 'Top/Receipts/other.jpg']), { wrap: 48 }).filter(l => l.name === name);
    expect(line.breaks?.length).toBeGreaterThan(0);
    expect(line.cont).toBe('    │   ');
    const rows = lineRows(line);
    expect(rows.map(r => name.slice(r.from, r.to)).join('')).toBe(name);
    for (const r of rows.slice(1)) expect(line.cont!.length + (r.to - r.from)).toBeLessThanOrEqual(48);
  });

  it('marks the PROVISIONAL part of a name', () => {
    expect(splitProvisional('A_PROVISIONAL.pdf')).toEqual([{ text: 'A', prov: false }, { text: '_PROVISIONAL', prov: true }, { text: '.pdf', prov: false }]);
    expect(splitProvisional('final.pdf')).toEqual([{ text: 'final.pdf', prov: false }]);
  });
});
