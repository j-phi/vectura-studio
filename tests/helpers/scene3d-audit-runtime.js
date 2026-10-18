// The one runtime loader for tests/audit/** (judgment R-17).
//
// The audits run on a PR only when its diff matches scripts/audit-paths.js. That is sound only
// if the audits execute no source file outside that filter. So they load the explicit Scene3D
// manifest (runtime-profiles.js SCENE3D_FILES, the `feature` profile) instead of the whole app,
// and this loader refuses any evaluated script that the filter does not cover.
// tests/unit/audit-paths.test.js keeps every audit on this loader.
const { loadVecturaRuntime } = require('./load-vectura-runtime');
const { SCENE3D_FILES } = require('./runtime-profiles');
const { matches } = require('../../scripts/audit-paths');

const normalize = (src) => src.replace(/^\.\//, '').replace(/\?.*$/, '');

async function loadScene3dAuditRuntime(options = {}) {
  const runtime = await loadVecturaRuntime({ ...options, profile: 'feature', files: SCENE3D_FILES });
  const uncovered = runtime.scripts.map(normalize).filter((file) => !matches(file));
  if (uncovered.length) {
    runtime.cleanup();
    throw new Error(`Audit runtime evaluated files outside scripts/audit-paths.js: ${uncovered.join(', ')}`);
  }
  return runtime;
}

module.exports = { loadScene3dAuditRuntime };
