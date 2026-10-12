// Explicit dependency manifests for tests that do not need the browser app.
// Entries are index.html-relative paths and are always evaluated in manifest order.
const CORE_FILES = [
  'src/core/rng.js',
  'src/core/noise.js',
];

const PROFILES = Object.freeze({
  core: Object.freeze({ files: CORE_FILES, dom: 'none' }),
  feature: Object.freeze({ files: null, dom: 'none' }),
  component: Object.freeze({ files: null, dom: 'component' }),
  full: Object.freeze({ files: null, dom: 'full' }),
  legacy: Object.freeze({ files: null, dom: 'minimal' }),
});

module.exports = { PROFILES, CORE_FILES };
