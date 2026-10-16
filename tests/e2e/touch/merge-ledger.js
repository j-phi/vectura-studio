// Merge the per-cell results written by `JOURNEY_LEDGER_WRITE=1 playwright test ... journeys.spec.js`
// (test-results/journey-ledger/<project>__<J>.json) into tests/e2e/touch/journey-status.json.
// One entry per line, sorted by project then journey number, so lane merges stay textual.
// Run through: npm run test:e2e:touch:journeys:ledger
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const RESULTS = path.join(ROOT, 'test-results', 'journey-ledger');
const LEDGER = path.join(__dirname, 'journey-status.json');
const PRIMARY = [
  'touch-ipad-landscape', 'touch-ipad-portrait', 'touch-iphone-landscape', 'touch-iphone-portrait',
  'webkit-ipad-landscape', 'webkit-ipad-portrait', 'webkit-iphone-landscape', 'webkit-iphone-portrait',
];
const num = (j) => parseInt(String(j).replace(/\D/g, ''), 10);

function main() {
  if (!fs.existsSync(RESULTS)) {
    console.error(`no results in ${RESULTS}: run the ledger npm script first`);
    process.exit(1);
  }
  const cells = fs.readdirSync(RESULTS).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(RESULTS, f), 'utf8')));
  const seen = new Set(cells.map((c) => `${c.project}|${c.journey}`));
  const expected = PRIMARY.length * 12;
  const have = cells.filter((c) => PRIMARY.includes(c.project)).length;
  if (have !== expected) console.warn(`warning: ${have} of ${expected} primary cells measured; unmeasured cells keep their old entry`);
  let old = [];
  try { old = JSON.parse(fs.readFileSync(LEDGER, 'utf8')).entries || []; } catch (e) { /* first run */ }
  const kept = old.filter((e) => !seen.has(`${e.project}|${e.journey}`));
  // The triage (`tux`: the owning requirement and the product defect) is human-made: keep it while the cell still
  // fails at the same step. A new or moved failure has no `tux`, and the static spec rejects it until it is triaged.
  const triage = (c) => { const o = old.find((e) => e.project === c.project && e.journey === c.journey && e.failsAt === c.failsAt); return o && o.tux ? { tux: o.tux } : {}; };
  const fresh = cells.filter((c) => PRIMARY.includes(c.project) && c.failsAt).map((c) => ({ project: c.project, journey: c.journey, failsAt: c.failsAt, reason: c.reason, ...triage(c) }));
  const entries = [...kept, ...fresh].sort((a, b) => (a.project < b.project ? -1 : a.project > b.project ? 1 : num(a.journey) - num(b.journey)));
  const lines = entries.map((e) => `    ${JSON.stringify({ project: e.project, journey: e.journey, failsAt: e.failsAt, reason: e.reason, ...(e.tux ? { tux: e.tux } : {}) })}`);
  // Cells whose steps used the sanctioned programmatic scroll (WebKit has no trusted touch scroll). A passing cell there
  // proves the taps, not the finger scroll: label it, one line per cell.
  const unprovenCells = cells.filter((c) => /^webkit-/.test(c.project) && (c.programmaticScrolls || []).length)
    .sort((a, b) => (a.project < b.project ? -1 : a.project > b.project ? 1 : num(a.journey) - num(b.journey)));
  const unproven = unprovenCells.map((c) => `    ${JSON.stringify({ project: c.project, journey: c.journey, label: 'WebKit finger-scroll unproven', steps: c.programmaticScrolls })}`);
  const body = `{\n  "projects": ${JSON.stringify(PRIMARY)},\n  "entries": [\n${lines.join(',\n')}${lines.length ? '\n' : ''}  ],\n  "unproven": [\n${unproven.join(',\n')}${unproven.length ? '\n' : ''}  ]\n}\n`;
  fs.writeFileSync(LEDGER, body);
  const byProject = {};
  entries.forEach((e) => { byProject[e.project] = (byProject[e.project] || 0) + 1; });
  console.log(`ledger: ${entries.length} failing cells of ${expected}`);
  Object.keys(byProject).sort().forEach((p) => console.log(`  ${p}: ${byProject[p]}`));
}

main();
