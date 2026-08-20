/**
 * SYNCHRONOUS read of `Vectura.Scene3D.SurfaceFill.hlStage` (surface-fill.js:276
 * / the `get hlStage()` export next to it) — for `describe.skip` gating.
 *
 * WHY THIS EXISTS. Vitest decides `describe` vs `describe.skip` at file
 * COLLECTION time, which is synchronous. Every other reader of the runtime
 * (`loadVecturaRuntime`) is async — it boots a full JSDOM window and runs the
 * whole script list through `vm.runInContext`, which cannot resolve before
 * `describe()` has already been called. Reading `hlStage` off that runtime
 * inside a `beforeAll` is too late to gate a `describe`.
 *
 * HOW. `surface-fill.js` is written to be dependency-free at load time — every
 * `Geometry3D` helper it uses falls back to an inline closure (`G3.finite ||
 * (...)`) specifically so the module can load before `Geometry3D` has. That
 * means the file can be evaluated in a bare `vm` context, no JSDOM and no
 * sibling scripts required, and `Vectura.Scene3D.SurfaceFill.hlStage` comes back
 * correct. This reads the SAME file the real runtime loads (no values are
 * restated here), so it cannot drift from what `loadVecturaRuntime` would see.
 *
 * Verified byte-for-byte equal to `runtime.window.Vectura.Scene3D.SurfaceFill
 * .hlStage` (see `tests/unit/scene3d-hl-stage-roster.test.js`, which checks
 * both).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SURFACE_FILL_PATH = path.resolve(__dirname, '../../src/core/scene3d/surface-fill.js');

const readHlStageSync = () => {
  const code = fs.readFileSync(SURFACE_FILL_PATH, 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: SURFACE_FILL_PATH });
  const hl = sandbox.Vectura
    && sandbox.Vectura.Scene3D
    && sandbox.Vectura.Scene3D.SurfaceFill
    && sandbox.Vectura.Scene3D.SurfaceFill.hlStage;
  if (!hl) {
    throw new Error('read-hl-stage-sync: Vectura.Scene3D.SurfaceFill.hlStage did not register — surface-fill.js may have moved or changed shape.');
  }
  return hl;
};

module.exports = { readHlStageSync, SURFACE_FILL_PATH };
