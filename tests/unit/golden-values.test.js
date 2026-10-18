/**
 * R-18: tests/helpers/golden-values.js (committed drift-guard goldens) and the
 * `npm run test:update` file list (scripts/test-update-baselines.js).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const HELPER = require.resolve('../helpers/golden-values');
const ARCH = process.arch === 'arm64' ? 'arm64' : 'x64';
const OTHER = ARCH === 'arm64' ? 'x64' : 'arm64';

// A fresh copy of the helper, reading and writing goldens in a temp dir. `env` sets (or, with
// undefined, clears) extra variables while the helper loads: CI, VECTURA_GOLDEN_NODE_MAJOR.
const loadHelper = (dir, update, env = {}) => {
  const vars = { VECTURA_GOLDEN_VALUES_DIR: dir, VECTURA_UPDATE_BASELINES: update ? '1' : undefined, VECTURA_GOLDEN_NODE_MAJOR: undefined, ...env };
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  delete require.cache[HELPER];
  try {
    return require(HELPER);
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    delete require.cache[HELPER];
  }
};

describe('golden-values helper', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-values-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('a missing golden file fails loudly', () => {
    expect(() => loadHelper(dir, false).goldenValues('missing').expect('k', 1)).toThrow(/is missing/);
  });

  test('update mode writes this architecture and keeps the other one', () => {
    const file = path.join(dir, 'arch.json');
    fs.writeFileSync(file, JSON.stringify({ [OTHER]: { k: 'other-arch' } }));
    loadHelper(dir, true).goldenValues('arch').expect('k', [1, 2]);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ [OTHER]: { k: 'other-arch' }, [ARCH]: { k: [1, 2] } });
  });

  test('compare mode passes on a match, fails on drift and on a missing key or section', () => {
    fs.writeFileSync(path.join(dir, 'cmp.json'), JSON.stringify({ [ARCH]: { k: 'abc' } }));
    fs.writeFileSync(path.join(dir, 'noarch.json'), JSON.stringify({ [OTHER]: { k: 'abc' } }));
    const { goldenValues } = loadHelper(dir, false);
    const g = goldenValues('cmp');
    expect(() => g.expect('k', 'abc')).not.toThrow();
    if (Number(process.versions.node.split('.')[0]) === 20) expect(() => g.expect('k', 'abd')).toThrow(/Golden drift/);
    expect(() => g.expect('nope', 'abc')).toThrow(/Golden key "nope" is missing/);
    expect(() => goldenValues('noarch').expect('k', 'abc')).toThrow(new RegExp(`no ${ARCH} section`));
  });

  test('off Node 20 a check fails in CI, warns once and passes unchecked locally, and update mode refuses to write', () => {
    fs.writeFileSync(path.join(dir, 'node.json'), JSON.stringify({ [ARCH]: { k: 'abc' } }));
    // On Node 20 the check is enforced with or without CI.
    expect(() => loadHelper(dir, false, { VECTURA_GOLDEN_NODE_MAJOR: '20', CI: 'true' }).goldenValues('node').expect('k', 'abd')).toThrow(/Golden drift/);
    // CI on another major: loud failure, even on a matching value.
    expect(() => loadHelper(dir, false, { VECTURA_GOLDEN_NODE_MAJOR: '22', CI: 'true' }).goldenValues('node').expect('k', 'abc')).toThrow(/Node 20 only; this is Node 22\. CI must run golden checks on Node 20/);
    // Locally on another major: one warning line per process, no failure.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const local = loadHelper(dir, false, { VECTURA_GOLDEN_NODE_MAJOR: '22', CI: undefined }).goldenValues('node');
      expect(() => local.expect('k', 'abd')).not.toThrow();
      expect(() => local.expect('k', 'abe')).not.toThrow();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/WARNING: Golden values hold on Node 20 only; this is Node 22\. Golden checks are NOT enforced/);
    } finally {
      warn.mockRestore();
    }
    // Update mode on another major writes nothing.
    const before = fs.readFileSync(path.join(dir, 'node.json'), 'utf8');
    expect(() => loadHelper(dir, true, { VECTURA_GOLDEN_NODE_MAJOR: '22', CI: undefined }).goldenValues('node').expect('k', 'new')).toThrow(/Refusing to write/);
    expect(fs.readFileSync(path.join(dir, 'node.json'), 'utf8')).toBe(before);
  });
});

describe('npm run test:update file list', () => {
  const { goldenValueFiles, targets } = require('../../scripts/test-update-baselines');

  test('refuses to regenerate on a Node major other than 20', () => {
    const { nodeRefusal } = require('../../scripts/test-update-baselines');
    expect(nodeRefusal('20.20.2')).toBeNull();
    expect(nodeRefusal('22.1.0')).toMatch(/refusing to regenerate goldens on Node 22\.1\.0/);
    expect(nodeRefusal('18.0.0')).toMatch(/refusing/);
  });

  test('covers tests/visual and every test file that reads golden values', () => {
    const files = goldenValueFiles();
    expect(files).toEqual(expect.arrayContaining([
      'tests/unit/scene3d-mkdashramp-discrete.test.js',
      'tests/unit/scene3d-shadow-footprint-wiring.test.js',
    ]));
    expect(files).not.toContain('tests/unit/golden-values.test.js');
    expect(targets([])).toEqual(['tests/visual', ...files]);
    expect(targets(['tests/unit/x.test.js'])).toEqual(['tests/unit/x.test.js']);
  });

  test('every golden file is read by a test, and every reader has a golden file with both architectures', () => {
    const dir = path.resolve(__dirname, '../baselines/golden-values');
    const goldens = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
    const readers = goldenValueFiles().map((f) => {
      const src = fs.readFileSync(path.resolve(__dirname, '../..', f), 'utf8');
      return (src.match(/goldenValues\('([^']+)'\)/) || [])[1];
    }).sort();
    expect(readers).toEqual(goldens);
    goldens.forEach((name) => {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'));
      expect(Object.keys(doc).sort(), name).toEqual(['arm64', 'x64']);
      expect(Object.keys(doc.arm64).sort(), name).toEqual(Object.keys(doc.x64).sort());
    });
  });
});
