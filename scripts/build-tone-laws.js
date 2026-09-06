#!/usr/bin/env node
/**
 * Regenerates src/config/scene3d-tone-laws.js — the SINGLE source of truth
 * for the Scene 3D tone-law catalog consumed by (future) UI surfaces that
 * let a user pick among the 48 measured tone laws.
 *
 * Usage: node scripts/build-tone-laws.js
 *
 * Source of truth for the DATA: docs/tone-laws/laws.json (48 entries under
 * `.laws`, keyed 0-47; `.families` gives {label, idea} for the 9 family ids).
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
  onePenDown: 'One Pen Down',

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

// ── 3. Tier split — §2.1 of the tone-integration plan: 37 production, 11 library.
// Demotion is LABELLING, not removal: all 48 stay selectable and keep their
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

if (IDS.length !== 48) {
  throw new Error(`[build-tone-laws] Expected 48 law ids, got ${IDS.length}.`);
}
if (PRODUCTION.length !== 37 || LIBRARY.length !== 11) {
  throw new Error(`[build-tone-laws] Expected 37 production / 11 library, got ${PRODUCTION.length}/${LIBRARY.length}.`);
}

// ── 5b. The fill-roster COLLAPSE table (U0 of the picker collapse — see
// docs/3d-audit/lane-reports/W-22-24-W-18-plan.md). `IDS` above stays the
// full 48-id ENGINE vocabulary forever — nothing is ever removed from it.
// This table is a separate, curated PRESENTATION decision: a survivor id
// (still a member of IDS) names the ONE sub-control that lets a user reach
// every id it folds. Hand-curated here beside LABELS/LIBRARY_IDS above —
// exactly the precedent those two set for presentation-tier decisions that
// are not derivable from laws.json.
//
// Shape: `COLLAPSE[survivorId]` is an array of descriptors (almost always
// length 1; `contFieldSigmoid`, U5, is the one two-descriptor survivor).
// Each descriptor is `{ key, label, default, options }`; each option is
// `{ value, label, law }` where `law` is the INTERNAL id
// (`Vectura.Scene3D.Params.resolveToneLaw` returns) that option resolves to.
// The option whose `value === default` names the survivor's OWN bare law
// (never an alias — see the ALIASES derivation below, which skips it on
// purpose); every OTHER option's `law` is a folded id that becomes an
// ALIASES entry.
//
// EMPTY in U0 — the whole point of this foundation unit is that with no
// rows here, PICKER_IDS === IDS and ALIASES === {}: a provable byte-identical
// no-op. U1…U8 each add exactly one row (their own audit cluster, C-01…C-08).
const COLLAPSE = {};

// ── 5c. Derive ALIASES + PICKER_IDS + STYLE_PARAMS from COLLAPSE ───────────
// ALIASES: folded id -> { into: survivor, params: { [descriptor.key]: value } }.
// This is what `Params.resolveToneLaw` and `normalizeStyle`'s migration shim
// both read to turn a legacy/alias id back into (survivor, params) or
// straight into the internal id it already names.
const ALIASES = {};
Object.keys(COLLAPSE).forEach((survivor) => {
  const descriptors = COLLAPSE[survivor];
  descriptors.forEach((d) => {
    d.options.forEach((opt) => {
      if (opt.value === d.default) return; // the survivor's own bare id, not an alias
      if (ALIASES[opt.law]) {
        throw new Error(`[build-tone-laws] "${opt.law}" is aliased twice (descriptor "${d.key}" of survivor "${survivor}").`);
      }
      ALIASES[opt.law] = { into: survivor, params: { [d.key]: opt.value } };
    });
  });
});
// PICKER_IDS: the flat option list the UI actually offers — IDS minus every
// folded id. The survivor itself STAYS (it is not its own alias).
const PICKER_IDS = IDS.filter((id) => !ALIASES[id]);
// STYLE_PARAMS: the COLLAPSE table verbatim — it drives the UI's generic
// sub-control AND is read back by ALIASES above, so the two can never drift.
const STYLE_PARAMS = COLLAPSE;

// Integrity throws (§2.1 of the plan) — the collapse table can never
// silently corrupt the engine vocabulary or name a law the roster forgot.
Object.keys(ALIASES).forEach((aliasId) => {
  if (IDS.indexOf(aliasId) === -1) {
    throw new Error(`[build-tone-laws] ALIASES key "${aliasId}" is not a roster id.`);
  }
  if (PICKER_IDS.indexOf(ALIASES[aliasId].into) === -1) {
    throw new Error(`[build-tone-laws] ALIASES["${aliasId}"].into ("${ALIASES[aliasId].into}") is not a PICKER_IDS survivor.`);
  }
});
Object.keys(COLLAPSE).forEach((survivor) => {
  COLLAPSE[survivor].forEach((d) => {
    d.options.forEach((opt) => {
      if (IDS.indexOf(opt.law) === -1) {
        throw new Error(`[build-tone-laws] COLLAPSE["${survivor}"] descriptor "${d.key}" option "${opt.value}" law "${opt.law}" is not a roster id.`);
      }
    });
  });
});
{
  const union = new Set(PICKER_IDS.concat(Object.keys(ALIASES)));
  if (union.size !== IDS.length || IDS.some((id) => !union.has(id))) {
    throw new Error('[build-tone-laws] PICKER_IDS ∪ keys(ALIASES) must equal IDS exactly.');
  }
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
const pickerIdsJson = JSON.stringify(PICKER_IDS, null, 2);
const aliasesJson = JSON.stringify(ALIASES, null, 2);
const styleParamsJson = JSON.stringify(STYLE_PARAMS, null, 2);

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

  // Fill-roster collapse (see docs/3d-audit/lane-reports/W-22-24-W-18-plan.md).
  // IDS above is the full 48-id ENGINE vocabulary and never shrinks; these
  // three are the PICKER-tier presentation cut, derived from the hand-curated
  // COLLAPSE table in scripts/build-tone-laws.js:
  //   PICKER_IDS   — the flat option list the UI actually offers.
  //   ALIASES      — folded id -> { into: survivor, params: {...} }, read by
  //                   Vectura.Scene3D.Params.resolveToneLaw and by
  //                   normalizeStyle's migration shim.
  //   STYLE_PARAMS — survivor id -> its collapse sub-control descriptor(s),
  //                   the COLLAPSE table verbatim; drives the UI directly.
  // All three are empty/full-identity in U0 (no cluster has been folded
  // yet): PICKER_IDS.length === IDS.length, ALIASES === {}.
  const PICKER_IDS = ${pickerIdsJson};
  const ALIASES = ${aliasesJson};
  const STYLE_PARAMS = ${styleParamsJson};

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
    PICKER_IDS,
    ALIASES,
    STYLE_PARAMS,
    FAMILIES,
    BY_ID,
    selectGroups,
  };
})();
`;

fs.writeFileSync(OUTPUT_PATH, output, 'utf8');
console.log(`[build-tone-laws] Wrote ${IDS.length} law(s) (${PRODUCTION.length} production / ${LIBRARY.length} library) to src/config/scene3d-tone-laws.js`);
console.log(`[build-tone-laws] PICKER_IDS ${PICKER_IDS.length}, ALIASES ${Object.keys(ALIASES).length}`);
console.log(`[build-tone-laws] VERSION = ${VERSION}`);
