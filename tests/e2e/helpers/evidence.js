// Evidence screenshots (judgment R-16). Specs take review screenshots (for example
// "TUX-037 desktop parity") that no assertion reads. They are off by default, so a normal run
// writes nothing and spends no time on them.
//
//   VECTURA_E2E_EVIDENCE=1        take them, under test-results/evidence/<sub-dir>/
//   VECTURA_E2E_EVIDENCE_DIR=<p>  take them, under <p>/<sub-dir>/
//
// A spec's own TUX_EVIDENCE_DIR (an exact directory for one TUX run) also turns them on.
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../../..');

const evidenceEnabled = () => process.env.VECTURA_E2E_EVIDENCE === '1'
  || !!process.env.VECTURA_E2E_EVIDENCE_DIR || !!process.env.TUX_EVIDENCE_DIR;

// The directory for one evidence group, for example evidenceDir('TUX-037').
const evidenceDir = (...segments) => path.join(process.env.VECTURA_E2E_EVIDENCE_DIR || path.join(REPO, 'test-results', 'evidence'), ...segments);

// `target.screenshot(options)` when evidence is on; otherwise nothing. It creates the parent
// directory, so callers need no mkdir.
async function shoot(target, options) {
  if (!evidenceEnabled()) return undefined;
  if (options && options.path) fs.mkdirSync(path.dirname(options.path), { recursive: true });
  return target.screenshot(options);
}

module.exports = { REPO, evidenceDir, evidenceEnabled, shoot };
