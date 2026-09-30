# W-07b-2-SWEEP: Clause C full identity sweep

Verdict: **Clause C CONFIRMED on the full population.** 1521 of 1536 cells are byte-identical between 5eb81cfb^ and 5eb81cfb. The 15 differing cells all belong to `deepFillTSP`, which is in scope.

## The claim
W-07b-2 plan, Clause C (around line 157): "byte identity for every other law". It is an md5 of `JSON.stringify(generate())`, 5eb81cfb^ against 5eb81cfb. The plan reported 1504/1504 identical for 47 laws x 4 primitives x 8 mappers. `deepFillTSP` itself was 17/32 identical. The reviewer re-ran only 72 cells (contention). This sweep runs the whole population.

## Fixture (same for every number)
- Script: `scripts/audit/w07b2-identity-sweep.js` (committed). Result JSON: `docs/3d-audit/fill-audit/after/W-07b-2/sweep-{base-vs-new,new-vs-head}.json`.
- Rig: direct `algo.generate(params, null, null, bounds)` via `tests/helpers/load-vectura-runtime`. There is no addLayer or create UI rig.
- Camera: `Scene3D.Params.DEFAULT_CAMERA`. Ground DISABLED. Backdrop disabled. Tone enabled.
- Light: one directional sun, azimuth 135, elevation 45, intensity 1, no shadows.
- Density: fillDensity 50, fillAngle 45. Bounds 1200x1000, margin 20, pen 0.3.
- Object: one, primitive defaults, identity transform.
- Population: every id in `SCENE3D_TONE_LAWS.IDS` at 5eb81cfb (48, so 47 plus `deepFillTSP`) x {sphere, torus, cone, box} x {none, hatch, wireframe, crosshatch, contour, spiral, stipple, contourSlice} = **1536 cells**. Sweep fraction: 1536/1536 (100%). Zero `generate()` errors.
- Revisions: base 4d3501f7 (5eb81cfb^), new 5eb81cfb, head f52f2fd5. Each is a `git archive` export loaded as `rootDir`. The working tree is never touched.
- Per-cell fixture is printed on every log line (law, primitive, mapper, density, ground=off).

## Result 1: Clause C test (5eb81cfb^ vs 5eb81cfb)
- Identical: **1521**. Differing: **15**.
- Non-deepFillTSP: 1504/1504 identical (47 laws x 32). This matches the plan exactly. There are **no findings**.
- deepFillTSP: 17/32 identical (all of none, wireframe, contourSlice, all of box) and 15 differing. This matches the plan.
- The 15 differing cells, all `deepFillTSP`: sphere, torus and cone x {hatch, crosshatch, contour, spiral, stipple}. This is the intended change. Hatch, crosshatch and contour get the new ramp. Spiral and stipple change because `isEvenLadder` now includes `deepFillTSP`, so they become Ladder-identical (see `CURVED_SPIRAL_STIPPLE_INERT`).

## Result 2: information only (5eb81cfb vs HEAD f52f2fd5)
- Identical 1527, differing 9. All 9 are law `mkTick`: sphere, torus and cone x {hatch, crosshatch, contour}. Box and other mappers are unchanged.
- Laws other than `mkTick`: zero change after 5eb81cfb. `deepFillTSP` is unchanged since 5eb81cfb.
- Source of the 9: the only later commits touching `src/` are the mkTick series: 94fb314f, 1d7a4182 (T2-7); 3c312359 (T2-8); 00de9b00, 9d217ed0, 8d11044d, cfde2206, b274d395, 1b08298d, ac5c98b6, 9d2d3f54, 267ccae2 (T2-8b). e26a7788 is a version bump. Per-commit bisection of the 9 cells was not done.

## Runtime (6 parallel shards, 256 cells each, 3 revisions per cell, 14-core machine, load about 3)
| shard | seconds |
|---|---|
| 0/6 | 218 |
| 1/6 | 423 |
| 2/6 | 212 |
| 3/6 | 442 |
| 4/6 | 280 |
| 5/6 | 409 |

The `[FillBoolean] polygon union failed on degenerate geometry` stack traces on stderr are the pre-existing noise the reviewer noted. They do not change results.

## Re-run
```
for i in 0 1 2 3 4 5; do node scripts/audit/w07b2-identity-sweep.js --shard $i/6 --out /tmp/sw/r$i.json & done; wait
node scripts/audit/w07b2-identity-sweep.js --merge /tmp/sw/r0.json,...,/tmp/sw/r5.json --base base --new new
```
