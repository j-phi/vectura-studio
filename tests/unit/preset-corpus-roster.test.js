/**
 * Preset corpus roster (R-34).
 *
 * 1. src/config/user-presets.js is in sync with user-presets/: the bundler,
 *    run now into a temp file, writes the committed bundle byte for byte.
 * 2. Every user-presets/<system>/*.vectura file is a preset the bundler takes
 *    (it has a layer of type <system>) and the folder-import loader
 *    (PresetSync.parseDoc) accepts it.
 * 3. The four preset-corpus-*.test.js files together name every preset system
 *    in the bundle exactly once, so no preset escapes the corpus canary.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const PRESET_DIR = path.join(ROOT, 'user-presets');
const BUNDLE = path.join(ROOT, 'src/config/user-presets.js');

// Files that are NOT presets and the bundler skips (it logs "Skipping ...").
// shape_pack/hexagonal_mosaic.vectura is a full v1.1.61 project file in a
// directory that matches no layer type; shapePack/hexagonal-mosaic.vectura is
// the real preset. Kept as a legacy-format fixture (tests/fixtures/legacy-vectura).
const NOT_PRESETS = new Set(['shape_pack/hexagonal_mosaic.vectura']);
const RESERVED_DIRS = new Set(['wallpaper']);

const presetFiles = () => fs.readdirSync(PRESET_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !RESERVED_DIRS.has(d.name))
  .flatMap((d) => fs.readdirSync(path.join(PRESET_DIR, d.name))
    .filter((f) => f.endsWith('.vectura'))
    .map((f) => `${d.name}/${f}`))
  .sort();

const loadBundle = () => {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(BUNDLE, 'utf8'), sandbox, { filename: BUNDLE });
  return sandbox.window.Vectura.PRESETS;
};

const loadPresetSync = () => {
  const sandbox = { window: { Vectura: {} } };
  vm.createContext(sandbox);
  const file = path.join(ROOT, 'src/ui/preset-sync.js');
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  return sandbox.window.Vectura.PresetSync;
};

describe('preset corpus roster', () => {
  test('src/config/user-presets.js matches a fresh bundle of user-presets/', () => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vectura-presets-')), 'user-presets.js');
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/build-user-presets.js')], {
      cwd: ROOT,
      env: { ...process.env, VECTURA_USER_PRESETS_OUT: out },
      stdio: 'pipe',
    });
    const fresh = fs.readFileSync(out, 'utf8');
    expect(fresh === fs.readFileSync(BUNDLE, 'utf8'),
      'src/config/user-presets.js is stale: run npm run user-presets:bundle and commit the result').toBe(true);
  });

  test('every preset file is a bundled preset the folder loader accepts', () => {
    const PresetSync = loadPresetSync();
    const files = presetFiles();
    expect(files.length).toBeGreaterThan(100);
    const rejected = [];
    files.forEach((rel) => {
      if (NOT_PRESETS.has(rel)) return;
      const system = rel.split('/')[0];
      const doc = JSON.parse(fs.readFileSync(path.join(PRESET_DIR, rel), 'utf8'));
      const hasLayer = Array.isArray(doc.layers) && doc.layers.some((l) => l && l.type === system);
      const parsed = PresetSync.parseDoc(system, doc, path.basename(rel, '.vectura'), 0);
      if (!hasLayer || !parsed || !parsed.params) rejected.push(rel);
    });
    expect(rejected).toEqual([]);
    NOT_PRESETS.forEach((rel) => expect(fs.existsSync(path.join(PRESET_DIR, rel)), `${rel} is gone: drop it from NOT_PRESETS`).toBe(true));
  });

  test('the corpus files cover every bundled preset system exactly once', () => {
    const { presetIdsFor } = require('../helpers/preset-corpus');
    const dir = path.join(ROOT, 'tests/integration');
    const named = fs.readdirSync(dir)
      .filter((f) => /^preset-corpus-.*\.test\.js$/.test(f))
      .flatMap((f) => {
        const src = fs.readFileSync(path.join(dir, f), 'utf8');
        const match = src.match(/definePresetCorpusSuite\([^,]+,\s*(\[[^\]]*\])/);
        expect(match, `${f} does not call definePresetCorpusSuite(label, [systems])`).toBeTruthy();
        return JSON.parse(match[1].replace(/'/g, '"'));
      });
    const systems = [...new Set(loadBundle().map((p) => p.preset_system))].sort();
    expect([...named].sort()).toEqual(systems);
    expect(presetIdsFor(systems).length).toBe(loadBundle().length);
  });
});
