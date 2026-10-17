const fs = require('fs');
const path = require('path');
const L = require('../e2e/touch/journey-ledger-file.js');

/**
 * TUX-059 ledger per platform (PR #102 CI): the step-pinned ledger was measured on darwin.
 * Linux CI (other WebKit build, slower runner) fails other cells, so linux reads its own
 * ledger file, and while that file is missing every linux cell is informational (record-only),
 * the same rule as the TUX-058 linux target baseline.
 */
describe('journey ledger file per platform', () => {
  it('darwin reads journey-status.json; linux reads journey-status.linux.json', () => {
    expect(path.basename(L.ledgerFile('darwin'))).toBe('journey-status.json');
    expect(path.basename(L.ledgerFile('linux'))).toBe('journey-status.linux.json');
    expect(L.platformOf('darwin')).toBe('darwin');
    expect(L.platformOf('linux')).toBe('linux');
    expect(L.platformOf('win32')).toBe('linux');
  });

  it('a missing ledger reads as null (record-only), never as an empty pass list', () => {
    const darwin = L.readLedger('darwin');
    expect(Array.isArray(darwin.projects)).toBe(true);
    expect(darwin.projects.length).toBe(8);
    const linuxFile = L.ledgerFile('linux');
    if (!fs.existsSync(linuxFile)) expect(L.readLedger('linux')).toBeNull();
    else expect(Array.isArray(L.readLedger('linux').projects)).toBe(true);
  });

  it('the journeys spec and the ledger merge both use the per-platform file', () => {
    const spec = fs.readFileSync(path.join(__dirname, '../e2e/touch/journeys.spec.js'), 'utf8');
    const merge = fs.readFileSync(path.join(__dirname, '../e2e/touch/merge-ledger.js'), 'utf8');
    expect(spec).toContain("require('./journey-ledger-file')");
    expect(spec).not.toContain("path.join(__dirname, 'journey-status.json')");
    expect(merge).toContain("require('./journey-ledger-file')");
    expect(merge).not.toContain("path.join(__dirname, 'journey-status.json')");
  });
});
