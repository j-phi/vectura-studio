const fs = require('fs');
const path = require('path');
const vm = require('vm');

/*
 * Preset library contract. After the v-pivot to a file-only preset library
 * (presets.js deleted; user-presets/ → src/config/user-presets.js is the single
 * source of truth, with factory "Default" markers synthesized by the bundler),
 * these invariants must hold or the gallery breaks:
 *   - every ALGO_DEFAULTS[type].preset resolves to a real preset (no dangling ref)
 *   - the synthesized "<type>-default" markers exist: empty params, Classic group
 *   - curated presets keep their stable ids + non-User categories
 */
const ROOT = path.resolve(__dirname, '..', '..');

const loadVectura = () => {
  const sandbox = { window: {} };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  for (const f of ['src/config/defaults.js', 'src/config/user-presets.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }
  return sandbox.window.Vectura || {};
};

describe('Preset library contract (file-only source of truth)', () => {
  const V = loadVectura();
  const PRESETS = Array.isArray(V.PRESETS) ? V.PRESETS : [];
  const byId = new Map(PRESETS.map((p) => [p.id, p]));

  test('presets.js is gone — user-presets.js is the only library file', () => {
    expect(fs.existsSync(path.join(ROOT, 'src/config/presets.js'))).toBe(false);
    expect(PRESETS.length).toBeGreaterThan(50);
  });

  test('every algorithm default-preset id resolves to a real preset', () => {
    const dangling = [];
    for (const [type, def] of Object.entries(V.ALGO_DEFAULTS || {})) {
      if (!def || typeof def !== 'object' || typeof def.preset !== 'string') continue;
      if (!byId.has(def.preset)) dangling.push(`${type} → ${def.preset}`);
    }
    expect(dangling).toEqual([]);
  });

  test('"<type>-default" markers exist and belong to the Classic group', () => {
    const markers = PRESETS.filter((p) => /-default$/.test(p.id) && p.name === 'Default');
    expect(markers.length).toBeGreaterThanOrEqual(15);
    for (const m of markers) {
      expect(m.group).toBe('Classic');
    }
    // Each id must be unique — no duplicates from synthesized + file-based overlap.
    const ids = markers.map((m) => m.id);
    expect(ids).toEqual([...new Set(ids)]);
  });

  test('curated presets keep stable ids and non-User categories', () => {
    const rolling = byId.get('wavetable-rolling-hills');
    expect(rolling).toBeTruthy();
    expect(rolling.group).toBe('Classic');
    expect(Object.keys(rolling.params).length).toBeGreaterThan(0);
    // A spread of curated ids referenced elsewhere must survive the migration.
    for (const id of ['phylla-sunflower', 'topo-mountain-range', 'rings-ancient-redwood']) {
      expect(byId.has(id)).toBe(true);
      expect(byId.get(id).group).not.toBe('User');
    }
  });
});
