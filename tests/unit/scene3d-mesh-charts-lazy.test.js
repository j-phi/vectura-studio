/**
 * 4c — Scene3D.Mesh resolves the Charts namespace LAZILY (at call time), not at
 * IIFE load time.
 *
 * Before the fix mesh.js captured `const Charts = (Scene3D && Scene3D.Charts) ||
 * {}` when its IIFE ran. If charts.js ever registered AFTER mesh.js in load
 * order, mesh.js held an empty {} forever and every topo* lookup silently
 * no-op'd. The fix reads window.Vectura.Scene3D.Charts on demand.
 *
 * This is a robustness refactor with no observable change once everything is
 * loaded, so it is covered by a call-time-resolution assertion: reassigning
 * Scene3D.Charts after the module loaded must be visible to the mesh builder.
 * On the pre-fix (load-time capture) code the reassignment is invisible — the
 * spy never fires — so this fails before and passes after.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('4c — Scene3D.Mesh reads Charts lazily at call time', () => {
  let runtime;
  let V;
  let realCharts;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    realCharts = V.Scene3D.Charts;
  });
  afterAll(() => runtime.cleanup());
  afterEach(() => { V.Scene3D.Charts = realCharts; });

  test('createTopoformMesh uses a Charts namespace reassigned AFTER mesh.js loaded', () => {
    const sizes = { sx: 20, sy: 20, sz: 20 };
    let torusCalls = 0;
    // Reassign Charts on Scene3D — exactly the situation a late charts.js
    // registration would create. A lazy accessor sees this; a load-time capture
    // does not.
    V.Scene3D.Charts = Object.assign({}, realCharts, {
      topoTorus: (s) => { torusCalls += 1; return realCharts.topoTorus(s); },
    });

    const mesh = V.Scene3D.Mesh.createTopoformMesh('torus', sizes, 8);

    expect(torusCalls).toBeGreaterThan(0); // the reassigned chart was consulted
    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.faces.length).toBeGreaterThan(0);
  });

  test('a chart-backed primitive still builds normally with the real Charts', () => {
    // Behavior-preservation guard: once loaded, output is unchanged.
    const mesh = V.Scene3D.Mesh.createTopoformMesh('sphere', { sx: 20, sy: 20, sz: 20 }, 12);
    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.faces.length).toBeGreaterThan(0);
  });
});
