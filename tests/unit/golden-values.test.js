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

// A fresh copy of the helper, reading and writing goldens in a temp dir.
const loadHelper = (dir, update) => {
  const saved = { u: process.env.VECTURA_UPDATE_BASELINES, d: process.env.VECTURA_GOLDEN_VALUES_DIR };
  process.env.VECTURA_GOLDEN_VALUES_DIR = dir;
  if (update) process.env.VECTURA_UPDATE_BASELINES = '1'; else delete process.env.VECTURA_UPDATE_BASELINES;
  delete require.cache[HELPER];
  try {
    return require(HELPER);
  } finally {
    if (saved.u === undefined) delete process.env.VECTURA_UPDATE_BASELINES; else process.env.VECTURA_UPDATE_BASELINES = saved.u;
    if (saved.d === undefined) delete process.env.VECTURA_GOLDEN_VALUES_DIR; else process.env.VECTURA_GOLDEN_VALUES_DIR = saved.d;
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
});

describe('npm run test:update file list', () => {
  const { goldenValueFiles, targets } = require('../../scripts/test-update-baselines');

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
