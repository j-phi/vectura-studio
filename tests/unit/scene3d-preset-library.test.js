const fs = require('fs');
const path = require('path');
const vm = require('vm');

/*
 * I2 — file-based scene3d presets.
 *
 * The three curated scene3d presets authored under user-presets/scene3d/ must
 * survive `npm run user-presets:bundle` and land in window.Vectura.PRESETS with
 * their stable ids, preset_system 'scene3d', and non-empty params. This pins the
 * bundler contract (dir name == layer type == preset_system) for scene3d.
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

describe('scene3d preset library (I2)', () => {
  const V = loadVectura();
  const PRESETS = Array.isArray(V.PRESETS) ? V.PRESETS : [];
  const byId = new Map(PRESETS.map((p) => [p.id, p]));

  const EXPECTED = [
    'scene3d-studio-shadows',
    'scene3d-shape-grid',
    'scene3d-cad-wireframe',
  ];

  test.each(EXPECTED)('%s is bundled with preset_system scene3d + non-empty params', (id) => {
    const preset = byId.get(id);
    expect(preset).toBeTruthy();
    expect(preset.preset_system).toBe('scene3d');
    expect(preset.params && typeof preset.params === 'object').toBe(true);
    expect(Array.isArray(preset.params.objects)).toBe(true);
    expect(preset.params.objects.length).toBeGreaterThan(0);
  });

  test('the no-ground/no-sun presets ship ground disabled and zero lights', () => {
    for (const id of ['scene3d-shape-grid', 'scene3d-cad-wireframe']) {
      const p = byId.get(id);
      expect(p.params.ground).toEqual({ enabled: false });
      expect(Array.isArray(p.params.lights)).toBe(true);
      expect(p.params.lights.length).toBe(0);
    }
  });

  test('the studio preset keeps a shadow-casting sun and the ground', () => {
    const p = byId.get('scene3d-studio-shadows');
    expect(p.params.ground).toEqual({ enabled: true });
    expect(p.params.lights.some((l) => l.type === 'directional' && l.castShadows !== false)).toBe(true);
  });
});
