#!/usr/bin/env node
/**
 * Regenerates src/config/scene3d-tone-laws.js — the SINGLE source of truth
 * for the Scene 3D tone-law catalog consumed by (future) UI surfaces that
 * let a user pick among the 47 measured tone laws.
 *
 * Usage: node scripts/build-tone-laws.js
 *
 * Source of truth for the DATA: docs/tone-laws/laws.json (47 entries under
 * `.laws`, keyed 0-46; `.families` gives {label, idea} for the 9 family ids).
 * That directory is tracked in git but is not served by index.html, and is
 * NOT read at runtime — this script snapshots it into a committed .js file so
 * the app never depends on docs/ existing. VERSION below records the git blob
 * sha of laws.json at generation time so a drift between the doc and the
 * snapshot is detectable, not silent.
 *
 * The human LABELS table and the PRODUCTION/LIBRARY tier split are curated
 * by hand in this script (not derived from laws.json) — see the comments
 * inline below for the reasoning behind each of the 11 library demotions.
 *
 * Regenerating with an unchanged laws.json must be a byte-identical no-op;
 * this script contains no non-deterministic input (no timestamps, no path-
 * dependent ordering) other than the git blob sha, which itself only changes
 * when laws.json's content changes.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '..');
const LAWS_JSON_PATH = path.join(REPO_ROOT, 'docs/tone-laws/laws.json');
const OUTPUT_PATH = path.join(REPO_ROOT, 'src/config/scene3d-tone-laws.js');

// ── 1. Load the source corpus ───────────────────────────────────────────────
const raw = fs.readFileSync(LAWS_JSON_PATH, 'utf8');
const doc = JSON.parse(raw);

// `laws.json` spells the Stage 0 reference "NO TONE"; the config contract
// spells it 'none' (it is also the sentinel `toneLaw: 'none'` consumers pass
// to ask for Stage 0). Map it here, once.
const mapId = (id) => (id === 'NO TONE' ? 'none' : id);

// ── 2. Hand-authored human labels for all 47 ids ────────────────────────────
// Title-Cased humanisation of the camelCase id is not good enough on its own
// (e.g. `contFieldSigmoid` -> "Cont Field Sigmoid" reads as broken English) —
// so every id gets an explicit label here. Ids that share a family prefix in
// their own spelling (bundle*, contField*, pen*, mk*) use a "Prefix · Suffix"
// form so the family reads consistently in a flat select list; ids with no
// shared lexical prefix (width/ladder/wave/mono members) get a plain
// Title-Cased label instead.
const LABELS = {
  none: 'No Tone',

  // width
  nibAngle: 'Nib Angle',
  taperedEnds: 'Tapered Ends',
  weightModulated: 'Weight Modulated',
  isophoteWidth: 'Isophote Width',
  whiteBand: 'White Band',
  weightSmoothstep: 'Weight Smoothstep',

  // ladder
  fineLadder: 'Fine Ladder',
  phaseFineLadder: 'Phase Fine Ladder',
  perceptualRamp: 'Perceptual Ramp',
  lozengeStipple: 'Lozenge Stipple',
  deepFillTSP: 'Deep Fill TSP',

  // bundle
  bundleCount: 'Bundle · Count',
  bundleSubNib: 'Bundle · Sub-Nib',
  bundleEased: 'Bundle · Eased',
  bundleDither: 'Bundle · Dither',
  bundleLozenge: 'Bundle · Lozenge',
  bundleHandoff: 'Bundle · Handoff',

  // contField
  contFieldSigmoid: 'Continuous Field · Sigmoid',
  contFieldTouch: 'Continuous Field · Touch',
  contFieldFore: 'Continuous Field · Foreshortened',
  contFieldSurface: 'Continuous Field · Surface',
  contFieldQuant: 'Continuous Field · Quantised',

  // threePen (all 6 are library — see LIBRARY_IDS)
  penInterleave: 'Pen · Interleave',
  penStipple: 'Pen · Stipple',
  penReserve: 'Pen · Reserve',
  penCross: 'Pen · Cross',
  penPitchMatch: 'Pen · Pitch Match',
  penFacing: 'Pen · Facing',

  // mark
  mkScribble: 'Mark · Scribble',
  mkTick: 'Mark · Tick',
  mkDashRamp: 'Mark · Dash Ramp',
  mkDotScreen: 'Mark · Dot Screen',

  // wave
  ampSpacing: 'Amplitude Spacing',
  weaveDepth: 'Weave Depth',
  interlockWeave: 'Interlock Weave',
  trochoidLoop: 'Trochoid Loop',
  amplitudeOnly: 'Amplitude Only',

  // mono
  etfKang: 'ETF Direction Field (Kang)',
  defectSplit: 'Defect Split',
  mezzoRegion: 'Mezzotint Region',
  originSpiral: 'Origin Spiral',
  dutyConst: 'Duty Cycle · Constant',
  endShorten: 'End Shorten',
  turingStripe: 'Turing Stripe',
  voronoiWeb: 'Voronoi Web',
  mazeFill: 'Maze Fill',
};

// ── 3. Tier split — §2.1 of the tone-integration plan: 36 production, 11 library.
// Demotion is LABELLING, not removal: all 47 stay selectable and keep their
// full measured description; the 11 below just render behind a disclosure
// with their `caveat` shown inline. Reasons (see plan §2.1 for the source
// measurements):
const LIBRARY_IDS = [
  // Simulated: penId is carried per style GROUP (scene3d.js:2613/:2628/:2644),
  // not per run, so three nibs cannot be named inside one fill — these emit
  // three stroke widths on ONE pen layer. penCross never uses its fine nib
  // (0 paths on all five measured cells).
  'penInterleave', 'penStipple', 'penReserve', 'penCross', 'penPitchMatch', 'penFacing',
  // Poor numbers are a fixture artefact, per its own caveat.
  'deepFillTSP',
  // Documented negative result — it made banding worse, not better.
  'bundleDither',
  // Refutation: it proves amplitude is NOT a viable tone channel on its own.
  'amplitudeOnly',
  // Floods totally on crosshatch; hatch-only, so it is not a general choice.
  'contFieldTouch',
  // Floods 78% of gated samples; its darkest L* is optimistic as a result.
  'bundleSubNib',
];
const SIMULATED_IDS = new Set([
  'penInterleave', 'penStipple', 'penReserve', 'penCross', 'penPitchMatch', 'penFacing',
]);

// ── 4. Family order — the 8 production-table families in the order given in
// plan §2.1, with `threePen` (entirely library-tier, so absent from that
// table) inserted at its natural position in the corpus: immediately after
// `contField` and before `mark` (law ids 23-28, between contField's 18-22
// and mark's 29-32 in laws.json's own n-ordering).
const FAMILY_ORDER = ['ref', 'width', 'ladder', 'bundle', 'contField', 'threePen', 'mark', 'wave', 'mono'];

// ── 5. Build BY_ID + group ids by family, preserving each family's laws.json
// (n-ascending) order within the group.
const BY_ID = {};
const idsByFamily = new Map(FAMILY_ORDER.map((f) => [f, []]));

for (const law of doc.laws) {
  const id = mapId(law.id);
  const label = LABELS[id];
  if (!label) {
    throw new Error(`[build-tone-laws] No LABELS entry for id "${id}" — add one before regenerating.`);
  }
  if (!idsByFamily.has(law.family)) {
    throw new Error(`[build-tone-laws] Law "${id}" has unknown family "${law.family}" — update FAMILY_ORDER.`);
  }
  idsByFamily.get(law.family).push(id);

  BY_ID[id] = {
    id,
    label,
    family: law.family,
    singleWeight: !!law.singleWeight,
    mechanism: law.mechanism || '',
    strengths: law.strengths || '',
    weaknesses: law.weaknesses || '',
    chooseWhen: law.chooseWhen || '',
    caveat: (typeof law.caveat === 'string' && law.caveat) ? law.caveat : null,
    simulated: SIMULATED_IDS.has(id),
    tier: LIBRARY_IDS.includes(id) ? 'library' : 'production',
  };
}

const FAMILIES = FAMILY_ORDER.map((fid) => {
  const fam = doc.families[fid];
  if (!fam) throw new Error(`[build-tone-laws] laws.json has no family entry for "${fid}".`);
  return { id: fid, label: fam.label, idea: fam.idea, laws: idsByFamily.get(fid) };
});

const IDS = FAMILIES.reduce((acc, fam) => acc.concat(fam.laws), []);
const PRODUCTION = IDS.filter((id) => BY_ID[id].tier === 'production');
const LIBRARY = IDS.filter((id) => BY_ID[id].tier === 'library');

if (IDS.length !== 47) {
  throw new Error(`[build-tone-laws] Expected 47 law ids, got ${IDS.length}.`);
}
if (PRODUCTION.length !== 36 || LIBRARY.length !== 11) {
  throw new Error(`[build-tone-laws] Expected 36 production / 11 library, got ${PRODUCTION.length}/${LIBRARY.length}.`);
}

// ── 6. VERSION — the git blob sha of laws.json at generation time, so a
// drift between the doc and the snapshot is detectable. Falls back to a
// content sha256 if git is unavailable (e.g. a clean checkout without .git).
let VERSION;
try {
  VERSION = execFileSync('git', ['hash-object', LAWS_JSON_PATH], { cwd: REPO_ROOT })
    .toString('utf8')
    .trim();
} catch (e) {
  VERSION = 'sha256:' + crypto.createHash('sha256').update(raw).digest('hex');
}

// ── 7. Emit ──────────────────────────────────────────────────────────────
const familiesJson = JSON.stringify(FAMILIES, null, 2);
const byIdJson = JSON.stringify(BY_ID, null, 2);
const idsJson = JSON.stringify(IDS, null, 2);
const productionJson = JSON.stringify(PRODUCTION, null, 2);
const libraryJson = JSON.stringify(LIBRARY, null, 2);

const output = `/**
 * Vectura Studio — Scene 3D tone-law catalog (generated).
 *
 * Auto-generated by \`scripts/build-tone-laws.js\` — do not hand-edit.
 * Regenerate with: node scripts/build-tone-laws.js
 *
 * Source: docs/tone-laws/laws.json (tracked in git, not served at runtime —
 * this file is a snapshot). VERSION is that file's git blob sha at generation
 * time. Every id remains selectable; PRODUCTION/LIBRARY is a display tier
 * ("36 shown, 11 disclosed"), not a removal — see tone-integration-plan §2.1.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});

  const FAMILIES = ${familiesJson};

  const BY_ID = ${byIdJson};

  const IDS = ${idsJson};
  const PRODUCTION = ${productionJson};
  const LIBRARY = ${libraryJson};

  // [{ group, options: [{ value, label }] }] — for UI.Select. Every family
  // contributes a group (even if, after filtering, it has zero options) so
  // the group count is always 9 regardless of the includeLibrary flag.
  function selectGroups(includeLibrary) {
    return FAMILIES.map((fam) => ({
      group: fam.label,
      options: fam.laws
        .filter((id) => includeLibrary || PRODUCTION.indexOf(id) !== -1)
        .map((id) => ({ value: id, label: BY_ID[id].label })),
    }));
  }

  Vectura.SCENE3D_TONE_LAWS = {
    VERSION: ${JSON.stringify(VERSION)},
    DEFAULT: 'ladder',
    IDS,
    PRODUCTION,
    LIBRARY,
    FAMILIES,
    BY_ID,
    selectGroups,
  };
})();
`;

fs.writeFileSync(OUTPUT_PATH, output, 'utf8');
console.log(`[build-tone-laws] Wrote ${IDS.length} law(s) (${PRODUCTION.length} production / ${LIBRARY.length} library) to src/config/scene3d-tone-laws.js`);
console.log(`[build-tone-laws] VERSION = ${VERSION}`);
