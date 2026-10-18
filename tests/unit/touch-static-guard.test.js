/**
 * TUX-060 static touch guard (ratchet baseline).
 *
 * Scans src/**\/*.js (not src/vendor), src/ui/skin/*.css and index.html with the
 * detectors in touch-static-guard-rules.js and compares per-file counts with
 * touch-static-guard-baseline.json. Keys are "<rule>|<repo-relative file>". A missing
 * key means 0, so any new hit fails. The baseline only ratchets DOWN.
 *
 * RED PROTOCOL for lanes that consume a rule:
 *   To observe RED for your rule, lower its baseline key to the target value first,
 *   run the named test, record the failure, then fix the source.
 *   (Example: set "R7|src/ui/skin/components.css" to 0, run
 *   `npx vitest run tests/unit/touch-static-guard.test.js -t "no bare 100vh"`.)
 *
 * Ratchet down after a fix:
 *   VECTURA_UPDATE_TOUCH_GUARD=1 npx vitest run tests/unit/touch-static-guard.test.js
 * Update mode lowers or deletes keys only. If a count went up it refuses and prints
 * "raising requires a hand edit + TUX-WAIVER: line in the commit body".
 * (Seeding is the one exception: an empty or absent baseline may be filled.)
 * After merges, regenerate the baseline with update mode. Do not hand-merge it.
 */
const fs = require('fs');
const path = require('path');
const R = require('./touch-static-guard-rules.js');

const ROOT = path.resolve(__dirname, '../..');
const BASELINE = path.join(__dirname, 'touch-static-guard-baseline.json');
const UPDATE = process.env.VECTURA_UPDATE_TOUCH_GUARD === '1';
const RATCHET_HINT = 'or run VECTURA_UPDATE_TOUCH_GUARD=1 npx vitest run tests/unit/touch-static-guard.test.js';
const TOUCH_OK_CAP = 10;
const TOUCH_ALT_CAP = 25;

const rel = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');
const listFiles = (dir, test, skip = () => false) => {
  const out = [];
  const visit = (d) => {
    fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!skip(rel(p))) visit(p); } else if (test(e.name)) out.push(p);
    });
  };
  if (fs.existsSync(dir)) visit(dir);
  return out.sort();
};

// touch-alt v2 (batch G): every new marker cites its touch equivalent. These files still hold
// old-format markers (count per file). The allowlist may only shrink.
const LEGACY_TOUCH_ALT = {
  'src/ui/ui-text-panel.js': 6,
  'src/ui/panels/algo-config-panel.js': 2,
  'src/ui/panels/noise-rack-panel.js': 1,
  'src/ui/panels/mirror-panel.js': 1,
  'src/ui/panels/scene3d-panel.js': 1,
  'src/ui/panels/pens-panel.js': 1,
  'src/ui/components/slider.js': 2,
  'src/ui/components/angle-dial.js': 1,
  'src/ui/components/harmonograph-motion-rack.js': 2,
};

let hits = [];
let sources = [];
let markers = { touchOk: [], touchAlt: [] };
let baseline = {};
let counts = {};

const readBaseline = () => {
  if (!fs.existsSync(BASELINE)) return {};
  const raw = fs.readFileSync(BASELINE, 'utf8').trim();
  return raw ? JSON.parse(raw) : {};
};
const serialize = (obj) => {
  const keys = Object.keys(obj).sort();
  if (!keys.length) return '{}\n';
  return `{\n${keys.map((k) => `  ${JSON.stringify(k)}: ${obj[k]}`).join(',\n')}\n}\n`;
};
const keyOf = (h) => `${h.rule}|${h.file}`;

beforeAll(() => {
  const jsFiles = listFiles(path.join(ROOT, 'src'), (n) => n.endsWith('.js'), (r) => r === 'src/vendor');
  const cssFiles = listFiles(path.join(ROOT, 'src/ui/skin'), (n) => n.endsWith('.css'));
  const all = [
    ...jsFiles.map((f) => rel(f)),
    ...cssFiles.map((f) => rel(f)),
    'index.html',
  ];
  const text = {};
  all.forEach((r) => { text[r] = fs.readFileSync(path.join(ROOT, r), 'utf8'); });
  all.forEach((r) => {
    const res = R.scanFull(text[r], r);
    hits.push(...res.hits);
    markers.touchOk.push(...res.markers.touchOk.map((m) => ({ ...m, file: r })));
    markers.touchAlt.push(...res.markers.touchAlt.map((m) => ({ ...m, file: r })));
  });
  const classes = R.bridgeClasses(text['src/ui/ui-touch.js']);
  hits.push(...R.checkR12(classes, cssFiles.map((f) => ({ rel: rel(f), text: text[rel(f)] }))));
  hits.push(...R.checkR11Coverage(text['src/ui/components/slider.js'], cssFiles.map((f) => ({ rel: rel(f), text: text[rel(f)] }))));
  sources = all.map((r) => ({ rel: r, text: text[r] }));
  hits.forEach((h) => { counts[keyOf(h)] = (counts[keyOf(h)] || 0) + 1; });

  baseline = readBaseline();
  if (UPDATE) {
    const seeding = Object.keys(baseline).length === 0;
    const next = {};
    const raised = [];
    Object.keys(counts).forEach((k) => {
      const prev = baseline[k] || 0;
      if (counts[k] > prev && !seeding) raised.push(`${k}: ${prev} -> ${counts[k]}`);
      if (seeding || counts[k] <= prev) next[k] = counts[k];
    });
    if (raised.length) {
      const msg = `touch-static-guard update refused. Counts went up:\n  ${raised.join('\n  ')}\nraising requires a hand edit + TUX-WAIVER: line in the commit body`;
      console.error(msg);
      throw new Error(msg);
    }
    fs.writeFileSync(BASELINE, serialize(next));
    baseline = next;
  }
});

function ratchet(rule) {
  const prefix = `${rule}|`;
  const keys = new Set([
    ...Object.keys(counts).filter((k) => k.startsWith(prefix)),
    ...Object.keys(baseline).filter((k) => k.startsWith(prefix)),
  ]);
  const failures = [];
  [...keys].sort().forEach((k) => {
    const actual = counts[k] || 0;
    const base = baseline[k] || 0;
    if (actual > base) {
      const lines = hits.filter((h) => keyOf(h) === k)
        .map((h) => `    ${h.file}:${h.line}${h.detail ? `  ${String(h.detail).slice(0, 80)}` : ''}`).join('\n');
      failures.push(`${k}: ${actual} hits, baseline ${base}\n${lines}`);
    } else if (actual < base) {
      failures.push(`ratchet down: lower ${k} to ${actual} in touch-static-guard-baseline.json (${RATCHET_HINT})`);
    }
  });
  if (failures.length) throw new Error(`\n${failures.join('\n')}`);
}

describe('touch static guard', () => {
  test('contextmenu without TouchHold', () => ratchet('R1'));
  test('mouseenter-only open', () => ratchet('R2'));
  test('mousedown without pointerdown', () => ratchet('R3'));
  test('pointerup without pointercancel', () => ratchet('R4'));
  test('dblclick without touch alternative', () => ratchet('R5'));
  test('html5 dnd without pointer reorder', () => ratchet('R6'));
  test('no bare 100vh', () => ratchet('R7'));
  test('hover-only reveal outside (hover: hover)', () => ratchet('R8'));
  test('icon-only button without aria-label', () => ratchet('R9'));
  test('raw modifier flags outside the helper', () => ratchet('R10'));
  test('range input outside the global touch-safe controller', () => ratchet('R11'));
  test('drag handle without touch-action none', () => ratchet('R12'));

  test('opt-out cap', () => {
    const problems = [];
    markers.touchOk.filter((m) => !m.valid).forEach((m) => problems.push(`${m.file}:${m.line} touch-ok needs a reason matching /TUX-\\d{3}|Q\\d+/: ${m.text}`));
    markers.touchAlt.filter((m) => !m.valid).forEach((m) => problems.push(`${m.file}:${m.line} touch-alt must match /touch-alt:\\s*TUX-\\d{3}\\s+\\S+/: ${m.text}`));
    if (markers.touchOk.length > TOUCH_OK_CAP) problems.push(`touch-ok markers: ${markers.touchOk.length} > cap ${TOUCH_OK_CAP}`);
    if (markers.touchAlt.length > TOUCH_ALT_CAP) problems.push(`touch-alt markers: ${markers.touchAlt.length} > cap ${TOUCH_ALT_CAP}`);
    if (problems.length) throw new Error(`\n${problems.join('\n')}`);
  });

  test('touch-alt markers cite a touch equivalent that exists as code', () => {
    const problems = R.checkAltMarkers(markers.touchAlt, sources, LEGACY_TOUCH_ALT);
    if (problems.length) throw new Error(`\n${problems.join('\n')}`);
  });

  test('baseline file is flat, sorted, one key per line, no zero entries', () => {
    const raw = fs.readFileSync(BASELINE, 'utf8');
    expect(raw).toBe(serialize(JSON.parse(raw)));
    Object.values(JSON.parse(raw)).forEach((v) => expect(v).toBeGreaterThan(0));
  });
});
