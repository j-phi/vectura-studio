// TUX-059 ledger file per platform. darwin: journey-status.json (measured on macOS).
// linux: journey-status.linux.json. Linux CI runs another WebKit build on a slower runner and
// fails other cells, so it keeps its own ledger. While the linux file is missing, every linux
// cell is informational (record-only), like the TUX-058 linux target baseline. Seed it with
// `npm run test:e2e:touch:journeys:ledger` on linux (manual workflow_dispatch run, docs/testing.md).
'use strict';

const fs = require('fs');
const path = require('path');

const platformOf = (p = process.platform) => (p === 'darwin' ? 'darwin' : 'linux');
const ledgerFile = (p = process.platform) => path.join(__dirname, platformOf(p) === 'darwin' ? 'journey-status.json' : 'journey-status.linux.json');
const readLedger = (p = process.platform) => {
  const f = ledgerFile(p);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
};

module.exports = { platformOf, ledgerFile, readLedger };
