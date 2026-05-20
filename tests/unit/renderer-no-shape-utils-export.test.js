// Arch-6 regression: the renderer module historically registered a
// `window.Vectura.ShapeUtils` namespace with five shape helpers. Nothing in
// src/, tests/, or docs/ ever consumed them, so the export was deleted to
// stop advertising a misleading public-API surface. This test guards against
// re-introducing the dead export.
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Renderer: no dead Vectura.ShapeUtils export (Arch-6)', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  it('does not expose Vectura.ShapeUtils on the global namespace', () => {
    const { Vectura } = runtime.window;
    expect(Vectura).toBeDefined();
    expect(Vectura.ShapeUtils).toBeUndefined();
  });

  it('still exposes the legitimate Renderer export', () => {
    expect(runtime.window.Vectura.Renderer).toBeDefined();
  });
});
