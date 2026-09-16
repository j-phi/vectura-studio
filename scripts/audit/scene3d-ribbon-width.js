#!/usr/bin/env node
'use strict';

/*
 * F1-width-bar JOB 1 — THE ONE canonical ribbon width/ink measurement
 * script. `ROUND3-RESUME-BRIEFS.md` §4 (BRIEF D): two independently-written
 * scripts measured `trochoidLoop`'s hatch ink delta on md5-IDENTICAL source
 * (`3bc61c32`) and disagreed — the F1-amp implementer's report says
 * `6645.83 -> 6581.01mm (-0.98%)`; F1-amp's reviewer independently got
 * `6645.828 -> 6572.712mm (-1.10%)` and could not isolate the cause. Every
 * other subject law (`interlockWeave`, `amplitudeOnly`, `onePenDown`)
 * matched EXACTLY between the two reports, both pre AND post -- which rules
 * out a rig/fixture/density difference (that would have moved all four, not
 * one). This script settles it:
 *
 *   RIG:      addLayer (see tests/helpers/scene3d-ribbon-width.js header)
 *   FIXTURE:  torus / hatch / density 50 (fillDensity untouched -- the law's
 *             own default), default camera
 *   PEN:      0.30mm (surface-fill.js's own default)
 *
 * Run it:
 *   node scripts/audit/scene3d-ribbon-width.js --sha 6e1ed52f --laws interlockWeave,trochoidLoop,amplitudeOnly,onePenDown
 *   node scripts/audit/scene3d-ribbon-width.js --sha 3bc61c32 --laws interlockWeave,trochoidLoop,amplitudeOnly,onePenDown
 *   node scripts/audit/scene3d-ribbon-width.js               # HEAD, no override
 *
 * `--sha <ref>` swaps `src/core/scene3d/surface-fill.js`'s content for
 * `git show <ref>:<path>` via `loadVecturaRuntime`'s `scriptOverrides` --
 * the SAME technique every RGR test file in this lane uses for a pre-fix
 * RED proof (`tests/helpers/load-vectura-runtime.js`'s own header) -- rather
 * than checking out another commit in this shared worktree. Every OTHER
 * file loads from the CURRENT worktree tree; if that ever matters for a
 * given comparison, this script's own `--sha` runs will disagree between
 * SHAs on more than the one law you'd expect, exactly the tell this file
 * exists to catch.
 *
 * REPRODUCED, WITH PROOF: at THIS repo's current base (`179d9218`, whose
 * `src/core/scene3d/surface-fill.js` is byte-identical to `3bc61c32` --
 * confirmed by `git diff 3bc61c32 179d9218 -- src/core/scene3d/surface-fill.js`,
 * zero lines), this script's `trochoidLoop` reading is `6572.7118mm` --
 * matching the REVIEWER's `6572.712` to 4 decimal places, not the
 * implementer's original `6581.01`. Running the identical construction
 * against a `--sha 3bc61c32` OVERRIDE (all other files at the CURRENT tree)
 * gives the exact same `6572.7118` -- so the overlay technique itself is not
 * the variable either. The other three subject laws reproduce BOTH reports'
 * numbers exactly under either construction. CONCLUSION: the reviewer's
 * `-1.10%` is the reproducible, canonical number for
 * torus/hatch/trochoidLoop/d=50 on the addLayer rig at `3bc61c32`; the
 * implementer's original `6581.01` / `-0.98%` does not reproduce from the
 * committed source under the standard construction and should be treated as
 * a measurement slip in that one script, not a legitimate second rig/
 * fixture reading -- there is no live "two right answers" ambiguity here,
 * despite the md5-identical-source framing suggesting one. (Determinism was
 * separately confirmed: three fresh runtime loads of the SAME tree gave the
 * SAME trochoidLoop figure to the last printed digit -- the LEDGER row 2c
 * "2.4694 -> 2.6606" instability noted elsewhere for this same law's
 * geometry did NOT reproduce for whole-object ink on this fixture.)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const { loadVecturaRuntime } = require(path.join(ROOT_DIR, 'tests/helpers/load-vectura-runtime.js'));
const { measureRibbonWidth } = require(path.join(ROOT_DIR, 'tests/helpers/scene3d-ribbon-width.js'));

const REL_SURFACE_FILL = 'src/core/scene3d/surface-fill.js';
const DEFAULT_LAWS = ['interlockWeave', 'trochoidLoop', 'amplitudeOnly', 'onePenDown'];
const CONTROL_LAWS = ['ampSpacing', 'weaveDepth']; // WV6 -- must stay unmoved by F1-amp

function parseArgs(argv) {
  const out = {
    sha: null, laws: DEFAULT_LAWS.concat(CONTROL_LAWS), primitive: 'torus', mapper: 'hatch', cameraAngle: 'a',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--sha') out.sha = argv[++i];
    else if (a === '--laws') out.laws = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--primitive') out.primitive = argv[++i];
    else if (a === '--mapper') out.mapper = argv[++i];
    else if (a === '--camera') out.cameraAngle = argv[++i];
    else if (a === '--json') out.json = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const opts = { includeUi: true };
  if (args.sha) {
    const src = execFileSync('git', ['-C', ROOT_DIR, 'show', `${args.sha}:${REL_SURFACE_FILL}`], { encoding: 'utf8' });
    opts.scriptOverrides = { [REL_SURFACE_FILL]: src };
  }
  const rt = await loadVecturaRuntime(opts);
  const V = rt.window.Vectura;
  const results = args.laws.map((law) => measureRibbonWidth(V, {
    law, primitive: args.primitive, mapper: args.mapper, cameraAngle: args.cameraAngle,
  }));
  await rt.cleanup();

  if (args.json) {
    console.log(JSON.stringify({ sha: args.sha || 'HEAD', results }, null, 2));
    return;
  }
  console.log(`# scene3d-ribbon-width — sha=${args.sha || 'HEAD (worktree)'} rig=addLayer fixture=${args.primitive}/${args.mapper} camera=${args.cameraAngle}`);
  console.log('law'.padEnd(16), 'penWidth'.padEnd(10), 'meanWidthMm'.padEnd(13), 'widthPen'.padEnd(10), 'ribbonInk'.padEnd(11), 'totalInk');
  results.forEach((r) => {
    console.log(
      String(r.law).padEnd(16),
      String(r.penWidth).padEnd(10),
      (r.meanRibbonWidthMm == null ? 'n/a' : r.meanRibbonWidthMm.toFixed(4)).padEnd(13),
      (r.meanRibbonWidthPen == null ? 'n/a' : r.meanRibbonWidthPen.toFixed(4)).padEnd(10),
      r.interiorFillInkMm.toFixed(3).padEnd(11),
      r.totalInkMm.toFixed(3),
    );
  });
}

main().catch((err) => { console.error(err); process.exit(1); });
