/*
 * TUX-062: contract for docs/touch-audit/device-checklist.md (real-device checklist and release gate).
 * Pure helpers live in this file. Each runs on inline fixtures first, then on the real files.
 * Table cells are read by header name, never by column index. Cells are trimmed and backticks removed.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const STATUSES = ['open', 'pass', 'fail', 'deferred-by-Jay'];
// Worst first: fail > open > deferred-by-Jay > pass.
const SEVERITY = ['fail', 'open', 'deferred-by-Jay', 'pass'];

const cleanCell = (s) => s.replace(/`/g, '').trim();
const splitRow = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cleanCell);

/**
 * Parse every GFM pipe table in `md`.
 * Contract: a header line, then a separator line (---), then zero or more body lines.
 * Returns [{ headers: string[], rows: object[] }]. Rows are keyed by header name.
 */
function parseTables(md) {
  const lines = md.split('\n');
  const tables = [];
  for (let i = 0; i < lines.length - 1; i += 1) {
    const isHeader = /^\s*\|.*\|\s*$/.test(lines[i]);
    const isSep = /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1]) && lines[i + 1].includes('-');
    if (!isHeader || !isSep) continue;
    const headers = splitRow(lines[i]);
    const rows = [];
    let j = i + 2;
    while (j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j])) {
      const cells = splitRow(lines[j]);
      const row = {};
      headers.forEach((h, k) => { row[h] = cells[k] === undefined ? '' : cells[k]; });
      rows.push(row);
      j += 1;
    }
    tables.push({ headers, rows });
    i = j - 1;
  }
  return tables;
}

// A table is picked by the header names it must hold.
const findTable = (md, names) => {
  const t = parseTables(md).find((tb) => names.every((n) => tb.headers.includes(n)));
  if (!t) throw new Error(`No table with columns: ${names.join(', ')}`);
  return t;
};

/**
 * Walk the requirements doc. Track the current "#### TUX-0xx" heading.
 * Count a line only when it holds [DEVICE] AND starts with "- [ ]" or "- **DoD:**".
 * Returns [{ tux: '044', n: 1 }] where n counts clauses inside one TUX section.
 */
function parseDeviceClauses(reqMd) {
  const out = [];
  const counts = {};
  let cur = null;
  reqMd.split('\n').forEach((raw) => {
    const h = /^####\s+TUX-(\d{3})\b/.exec(raw);
    if (h) { cur = h[1]; return; }
    if (/^#{1,3}\s/.test(raw)) { cur = null; return; }
    const line = raw.trim();
    if (!cur || !line.includes('[DEVICE]')) return;
    if (!(line.startsWith('- [ ]') || line.startsWith('- **DoD:**'))) return;
    counts[cur] = (counts[cur] || 0) + 1;
    out.push({ tux: cur, n: counts[cur] });
  });
  return out;
}

/**
 * Checklist contract. Tables, found by header names:
 *   Rows:    ID | Check | TUX | Cells required | Pass when | Status
 *   Index:   Clause | Rows
 *   Results: Row | Device | iOS | Mode | Orientation | Result | Date | Build | Note | Follow-up
 */
function parseChecklist(md) {
  return {
    rows: findTable(md, ['ID', 'Check', 'TUX', 'Status']).rows,
    index: findTable(md, ['Clause', 'Rows']).rows,
    log: findTable(md, ['Row', 'Result', 'Follow-up']).rows,
  };
}

const tuxIds = (cell) => (cell.match(/\d{3}/g) || []);
const devIds = (cell) => (cell.match(/DEV-\d{2}/g) || []);
const worst = (list) => SEVERITY.find((s) => list.includes(s));

/** The release gate: when the README claims "touch-ready", no row may be open or fail. */
function evaluateGate(readme, rows) {
  if (!/touch-ready/i.test(readme)) return true;
  return rows.every((r) => r.Status !== 'open' && r.Status !== 'fail');
}

const fixtureReq = [
  '## 3. Reqs',
  '#### TUX-010 — A `P0`',
  '- **Sources:** all `[DEVICE]` notes',
  '  - [ ] `[DEVICE]` indented checkbox counts',
  '- [ ] `[DEVICE]` real one',
  '- **DoD:** D1, plus `[DEVICE]` another',
  '#### TUX-011 — B',
  '- [ ] no marker here',
  '- [ ] `[DEVICE]` one more',
].join('\n');

describe('parseDeviceClauses (fixture)', () => {
  it('counts only checkbox and DoD lines under a TUX heading', () => {
    expect(parseDeviceClauses(fixtureReq)).toEqual([
      { tux: '010', n: 1 }, { tux: '010', n: 2 }, { tux: '010', n: 3 }, { tux: '011', n: 1 },
    ]);
  });
  it('ignores text outside any TUX section', () => {
    expect(parseDeviceClauses('- [ ] `[DEVICE]` stray')).toEqual([]);
  });
});

describe('parseChecklist and evaluateGate (fixture)', () => {
  const md = [
    '| ID | Check | TUX | Cells required | Pass when | Status |',
    '|---|---|---|---|---|---|',
    '| DEV-01 | `x` | TUX-003 | a | b | open |',
    '',
    '| Clause | Requirement text (short) | Rows |',
    '|---|---|---|',
    '| TUX-003#1 | t | DEV-01 |',
    '',
    '| Row | Device | iOS | Mode | Orientation | Result | Date | Build | Note | Follow-up |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ].join('\n');
  it('reads by header name, trims, and allows a header-only log', () => {
    const c = parseChecklist(md);
    expect(c.rows[0].Check).toBe('x');
    expect(c.index[0].Rows).toBe('DEV-01');
    expect(c.log).toEqual([]);
  });
  it('fails the gate when touch-ready is claimed and a row is open', () => {
    expect(evaluateGate('This is touch-ready.', [{ Status: 'open' }])).toBe(false);
    expect(evaluateGate('This is touch-ready.', [{ Status: 'fail' }])).toBe(false);
    expect(evaluateGate('This is Touch-Ready.', [{ Status: 'pass' }, { Status: 'deferred-by-Jay' }])).toBe(true);
    expect(evaluateGate('No claim.', [{ Status: 'open' }])).toBe(true);
  });
  it('ranks severity fail > open > deferred-by-Jay > pass', () => {
    expect(worst(['pass', 'deferred-by-Jay'])).toBe('deferred-by-Jay');
    expect(worst(['pass', 'open', 'fail'])).toBe('fail');
  });
});

describe('docs/touch-audit/device-checklist.md (real files)', () => {
  const req = read('docs/touch-ux-requirements.md');
  const checklist = parseChecklist(read('docs/touch-audit/device-checklist.md'));
  const clauses = parseDeviceClauses(req);
  const rowIds = checklist.rows.map((r) => r.ID);

  it('(a) finds the known [DEVICE] clause owners', () => {
    const owners = [...new Set(clauses.map((c) => c.tux))].sort();
    expect(clauses.length).toBeGreaterThanOrEqual(22);
    expect(owners).toEqual(['002', '003', '004', '005', '007', '014', '018', '021', '028', '032', '035',
      '036', '038', '040', '042', '044', '046', '049', '053', '054', '055', '056']);
  });

  it('(b) has one index entry per [DEVICE] clause, mapped to existing rows', () => {
    const want = clauses.map((c) => `TUX-${c.tux}#${c.n}`).sort();
    const have = checklist.index.map((r) => r.Clause).sort();
    expect(have).toEqual(want);
    checklist.index.forEach((r) => {
      const ids = devIds(r.Rows);
      expect(ids.length, r.Clause).toBeGreaterThan(0);
      ids.forEach((id) => expect(rowIds, `${r.Clause} -> ${id}`).toContain(id));
    });
  });

  it('(c) mirrors every 4.2 row; extra rows start at DEV-23', () => {
    const start = req.indexOf('### 4.2 Real-device checklist');
    const section = req.slice(start);
    const t42 = findTable(section, ['#', 'Check', 'TUX', 'Pass when']).rows;
    expect(t42.length).toBeGreaterThanOrEqual(22);
    t42.forEach((r) => {
      const id = `DEV-${String(r['#']).padStart(2, '0')}`;
      const row = checklist.rows.find((x) => x.ID === id);
      expect(row, id).toBeTruthy();
      const have = tuxIds(row.TUX);
      tuxIds(r.TUX).forEach((t) => expect(have, `${id} TUX-${t}`).toContain(t));
    });
    const mirrored = t42.length;
    checklist.rows.forEach((row) => {
      const n = Number((/^DEV-(\d{2})$/.exec(row.ID) || [])[1]);
      expect(Number.isFinite(n), row.ID).toBe(true);
      if (n > mirrored) {
        expect(n, row.ID).toBeGreaterThanOrEqual(23);
      } else if (tuxIds(row.TUX).length === 0) {
        throw new Error(`${row.ID} has no TUX owner`);
      }
      if (n >= 23 && row.TUX.trim() !== '—') expect(tuxIds(row.TUX).length, row.ID).toBeGreaterThan(0);
    });
  });

  it('(d) uses only the status enum', () => {
    checklist.rows.forEach((r) => expect(STATUSES, r.ID).toContain(r.Status));
    checklist.log.forEach((r) => expect(STATUSES, `${r.Row} result`).toContain(r.Result));
  });

  it('(e) requires a TUX follow-up on every fail', () => {
    checklist.log.filter((r) => r.Result === 'fail').forEach((r) => {
      expect(r['Follow-up'], r.Row).toMatch(/TUX-\d{3}/);
    });
  });

  it('(f) rolls log results up to the row status', () => {
    checklist.log.forEach((r) => expect(rowIds, 'log row').toContain(r.Row));
    checklist.rows.forEach((row) => {
      const results = checklist.log.filter((l) => l.Row === row.ID).map((l) => l.Result);
      expect(row.Status, row.ID).toBe(results.length ? worst(results) : 'open');
    });
  });

  it('(g) holds the release gate', () => {
    expect(evaluateGate(read('README.md'), checklist.rows)).toBe(true);
  });

  it('(h) is linked from docs/testing.md', () => {
    expect(read('docs/testing.md')).toContain('touch-audit/device-checklist.md');
  });
});
