const fs = require('fs');
const path = require('path');
const { loadScene3dAuditRuntime } = require('../helpers/scene3d-audit-runtime');

const SOURCE = 'src/core/scene3d/surface-fill.js';
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };
const SUN = { id: 'sun', type: 'directional', azimuth: 200, elevation: 55, castShadows: false };
const clone = (value) => JSON.parse(JSON.stringify(value));

describe('Scene3D tone-law dispatch — known module-default dispatch mutant', () => {
  test('mark-law dispatch guard distinguishes the shipped code from a module-default capture', async () => {
    const root = path.resolve(__dirname, '..', '..');
    const source = fs.readFileSync(path.join(root, SOURCE), 'utf8');
    const needle = "const TONE_ALGO = (askedLaw && (!TONE_LAWS || TONE_LAWS.indexOf(askedLaw) !== -1)\n      && askedLaw !== 'none') ? askedLaw : TONE_ALGO_DEFAULT;";
    expect(source.split(needle)).toHaveLength(2);
    const mutant = source.replace(needle, 'const TONE_ALGO = TONE_ALGO_DEFAULT;');
    const runtime = await loadScene3dAuditRuntime({ scriptOverrides: { [SOURCE]: mutant } });
    try {
      const V = runtime.window.Vectura;
      const defaults = V.ALGO_DEFAULTS.scene3d;
      const params = clone(defaults);
      params.objects = [{
        id: 'o1', name: 'sphere', primitive: 'sphere', params: { radius: 40, detail: 20 },
        transform: { x: 0, y: 50, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
      }];
      params.ground = { enabled: false };
      params.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
      params.styleTable = { scene: { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: 60 } }, byObject: {}, byFace: {} };
      params.tone = { ...clone(defaults).tone, enabled: true };
      params.lights = [SUN];
      const SF = V.Scene3D.SurfaceFill;
      let opts;
      const original = SF.buildObject;
      SF.buildObject = function capture(callOpts) {
        const out = original.call(this, callOpts);
        if (!opts || out.length > opts.count) opts = { value: callOpts, count: out.length };
        return out;
      };
      try { V.AlgorithmRegistry.scene3d.generate(params, null, null, BOUNDS); }
      finally { SF.buildObject = original; }
      const baseline = SF.buildObject({ ...opts.value, toneLaw: 'ladder' });
      const mutantOutput = SF.buildObject({ ...opts.value, toneLaw: 'mkTick' });
      // This equality is the negative proof: the mutant makes mkTick collapse
      // to ladder, so the routine lane's `.not.toEqual` assertion would fail.
      expect(mutantOutput).toEqual(baseline);
    } finally {
      await runtime.cleanup();
    }
  }, 120000);
});
