const fs = require('fs');
const path = require('path');

/**
 * `src/config/smart-guides.js` now ships via a <script> tag in index.html (the
 * phase integrator added it at Phase-1 merge), so loadVecturaRuntime loads it
 * with the rest of the runtime. This helper remains for tests that want to
 * (re)assert the config's presence or restore it after a fallback-path test
 * deletes `window.Vectura.SMART_GUIDES`; re-evaling the guarded IIFE is a no-op
 * beyond ensuring the global exists.
 */
const injectSmartGuidesConfig = (runtime) => {
  const configPath = path.resolve(__dirname, '../../src/config/smart-guides.js');
  const code = fs.readFileSync(configPath, 'utf8');
  runtime.window.eval(code);
  return runtime.window.Vectura.SMART_GUIDES;
};

module.exports = { injectSmartGuidesConfig };
