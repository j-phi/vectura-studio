// Explicit dependency manifests for tests that do not need the browser app.
// Entries are index.html-relative paths and are always evaluated in manifest order.
const CORE_FILES = Object.freeze([
  'src/core/rng.js',
  'src/core/noise.js',
]);

// The smallest manifest that supports the Scene3D engine/algorithm path used
// by DOM-free geometry tests. Keep this list explicit and index.html-relative:
// the loader filters the app manifest through it, preserving browser order.
// Add a dependency only when a migrated test reaches the real code path that
// needs it; do not turn this into a second copy of the whole app manifest.
const SCENE3D_FILES = Object.freeze([
  'src/config/machines.js',
  'src/config/defaults.js',
  'src/config/modifiers.js',
  'src/core/utils.js',
  'src/config/context-bar.js',
  'src/config/scene3d-tone-laws.js',
  'src/config/scene3d-fill-controls.js',
  'src/core/algorithm-utils.js',
  'src/core/algorithms/geometry3d.js',
  'src/core/rng.js',
  'src/core/noise.js',
  'src/core/noise-rack.js',
  'src/core/geometry-utils.js',
  'src/core/optimization-utils.js',
  'src/core/path-draw.js',
  'src/core/path-boolean.js',
  'src/vendor/polygon-clipping.umd.js',
  'src/core/fill-boolean.js',
  'src/core/masking.js',
  'src/core/modifiers.js',
  'src/core/scene3d/charts.js',
  'src/core/scene3d/ray-torus.js',
  'src/core/scene3d/torus-occlusion.js',
  'src/core/scene3d/mesh.js',
  'src/core/scene3d/csg.js',
  'src/core/scene3d/style-cascade.js',
  'src/core/scene3d/params.js',
  'src/core/scene3d/boolean.js',
  'src/core/scene3d/scene.js',
  'src/core/scene3d/edges.js',
  'src/core/scene3d/depth.js',
  'src/core/scene3d/hlr.js',
  'src/core/scene3d/regions.js',
  'src/core/scene3d/shadows.js',
  'src/core/scene3d/shadow-receive.js',
  'src/core/scene3d/mappers.js',
  'src/core/scene3d/ribbon-geometry.js',
  'src/core/pen-fill.js',
  'src/core/scene3d/surface-fill-mono.js',
  'src/core/scene3d/surface-fill.js',
  'src/core/algorithms/spiralizer.js',
  'src/core/algorithms/polyhedron.js',
  'src/core/algorithms/topoform.js',
  'src/core/algorithms/scene3d.js',
  'src/core/algorithms/object3d.js',
  'src/core/algorithms/booleanGroup3d.js',
  'src/core/algorithms/sceneLight3d.js',
  'src/core/algorithms/sceneGround3d.js',
  'src/core/algorithms/index.js',
  'src/core/layer.js',
  'src/core/engine.js',
]);

const PROFILES = Object.freeze({
  core: Object.freeze({ files: CORE_FILES, dom: 'none' }),
  feature: Object.freeze({ files: null, dom: 'none' }),
  component: Object.freeze({ files: null, dom: 'component' }),
  full: Object.freeze({ files: null, dom: 'full' }),
  legacy: Object.freeze({ files: null, dom: 'minimal' }),
});

module.exports = { PROFILES, CORE_FILES, SCENE3D_FILES };
