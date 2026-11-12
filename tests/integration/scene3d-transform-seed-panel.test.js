const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Transform & Seed section on a Scene 3D layer.
 *  - the DEFAULT scene (surface-locked ladder hatch + ground shadow) draws from the Seed, so the field is live;
 *  - a scene-tree child (object / light / ground) is placed by its Scene, so its Pos / Scale / Rotation rows are hidden with
 *    a reason instead of taking input that never reaches the ink; the Scene itself keeps them.
 */

const FULL_STACK = {
  includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true,
};

describe('Scene 3D Transform & Seed panel', () => {
  let runtime; let window; let document;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
  });
  afterAll(() => runtime.cleanup());

  const rowsHidden = () => ['inp-pos-x', 'inp-scale-x'].map((id) => document.getElementById(id).closest('.grid').style.display);
  const rotHidden = () => document.getElementById('inp-rotation').parentElement.style.display;

  test('the default surface-locked scene keeps its Seed live', () => {
    const ACP = window.Vectura.UI.AlgoConfigPanel;
    const eng = new window.Vectura.VectorEngine();
    const gid = eng.addLayer('scene3d');
    const g = eng.getLayerById(gid);
    g.params.seedMode = 'seeded';
    eng.computeAllDisplayGeometry(); // publishes _sceneAssembled, as the app does
    expect(ACP.layerSeedLive(g)).toBe(true);
    ACP.applySeedReach(g);
    expect(document.getElementById('inp-seed').disabled).toBe(false);
    expect(document.getElementById('btn-rand-seed').disabled).toBe(false);
  });

  test('scene children hide the inert Transform rows (with a reason); the Scene keeps them', () => {
    const ACP = window.Vectura.UI.AlgoConfigPanel;
    const eng = new window.Vectura.VectorEngine();
    const gid = eng.addLayer('scene3d');
    eng.computeAllDisplayGeometry();
    const kids = eng.getLayerDescendants(gid);
    const obj = kids.find((l) => l.type === 'object3d');
    const light = kids.find((l) => l.type === 'sceneLight3d');
    const group = eng.getLayerById(gid);

    ACP.toggleSeedControls('object3d', obj);
    expect(rowsHidden()).toEqual(['none', 'none']);
    expect(rotHidden()).toBe('none');
    expect(document.getElementById('seed-controls').style.display).toBe('');
    expect(document.querySelector('.scene-child-xform-note').textContent).toMatch(/placed by the 3D Scene/);

    ACP.toggleSeedControls('sceneLight3d', light);
    expect(document.getElementById('seed-controls').style.display).toBe('none');
    expect(document.querySelectorAll('.scene-child-xform-note').length).toBe(1);

    ACP.toggleSeedControls('scene3d', group);
    expect(rowsHidden()).toEqual(['', '']);
    expect(rotHidden()).toBe('');
    expect(document.getElementById('seed-controls').style.display).toBe('');
    expect(document.querySelector('.scene-child-xform-note')).toBeFalsy();
  });
});
