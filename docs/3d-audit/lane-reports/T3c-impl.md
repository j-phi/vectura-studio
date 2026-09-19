STATUS: DONE

# T3c (round 4, lane fill-audit-a4) — mkDashRamp: bound dash LENGTH at low density so dashes read as discrete marks riding the rulings, not broken rulings

- **Lane:** fill-audit-a4
- **Worktree:** `.claude/worktrees/fill-audit-a4`
- **Branch:** `3d-scene/fill-audit-a4`
- **Base sha:** `75777240` (T2-5, HEAD before this unit)
- **Port:** 8475 (confirmed `curl` 200, `APP_VERSION` 1.4.2, matches `package.json`)
- **Finding this unit closes (`T3b-review.md` condition 3):** T3b made `mkDashRamp` single-pass below
  `MK_BAND_ONSET_D=35`, killing the multi-line "tile" bundle — but the reviewer found and quantified a
  SECOND, T4-inherited defect that survives: a single pass can still occupy its own ENTIRE period
  (`each === sv.P`, "L=P is an unbroken ruling" per `layMark`'s own dissolution-ramp comment), so
  consecutive dashes ABUT with no gap. The reviewer's own duty-cycle proxy measured ~94–96% fill of each
  dash's own "room" at d=1/5/10, virtually unchanged pre/post T3b — governed entirely by T4's own
  `mkAsk`/period mechanism, which T3b never touched. `STILL-OPEN.md`'s W-06b row (`user-reports/10.png`):
  "discrete dashes riding rulings at every density, never row-wide tiles."

## Which half of Jay's phrase this unit gates

"Riding rulings" (a dash must sit ON its ruling, unbroken) is T3/T3b's own territory and is **not**
re-derived here. **"Discrete"** — a dash must be visually separated from its neighbour by a real gap — is
what this unit adds. `mkTick`'s own `lenChan` branch reads the same duty proxy `g` as an input
(`surface-fill.js`, `solveAt`) but consumes it completely differently (LENGTH is the tone channel there,
not elongation-at-fixed-period); this unit never touches `g`'s own definition, so `mkTick` is provably
unaffected (confirmed below, byte-identical).

## MEASURE FIRST — RED baseline (re-derived after an incident-14 kill, reproducible, deterministic)

`Vectura.AlgorithmRegistry.scene3d.generate` driven directly, `PRIMITIVE_PARAM_DEFAULTS` (addLayer rig)
and `PRIMITIVE_CREATE_DEFAULTS` (create rig), `DEFAULT_CAMERA` (angle 'a'), sun az135/el45, mapper
`hatch`, fillAngle 45, penWidth 0.3, ground disabled. Per-mark `L`/`P` sampled via a throwaway probe
(not shipped) at `layMark`'s morph branch, sphere/hatch/addLayer:

| d  | marks | L/P: min | p50 | max | mean | frac(L/P>=1) |
|---|---|---|---|---|---|---|
| 1  | 56 | 0.175 | **1.000** | 1.000 | 0.935 | 47/56 (83.9%) |
| 5  | 56 | 0.175 | **2.000** | 2.000 | 1.628 | 47/56 (83.9%) |
| 10 | 72 | 0.089 | **2.000** | 2.000 | 1.534 | 63/72 (87.5%) |
| 25 | 76 | 0.261 | **2.000** | 5.000 | 2.548 | 62/76 (81.6%) |
| 35 | 75 | 0.214 | **1.000** | 6.000 | 2.456 | 59/75 (78.7%) |
| 50 | 94 | 0.032 | **1.000** | 4.000 | 1.769 | 74/94 (78.7%) |

At d=1 the MEDIAN mark's drawn length is exactly its own period (L/P=1.0, zero gap, abutting) — the
reviewer's finding, reproduced numerically. `nn` (parallel-pass count) is irrelevant to this: all `nn`
passes of one mark share the SAME along-row extent `each`, so the gap to the NEXT mark is `P − each`
regardless of how many passes are stacked.

## First design tried and REJECTED (kept as the record, per stop-and-report)

Scaling `capOf`'s morph branch by a fraction `X` (`capOf(per) = bandN*per*X`) in `solveAt`, gated to
`bandOnsetCap(density) < MK_BAND_MAX_PASSES`. **Measured, X=0.5, sphere/addLayer:**

| d | 1 | 5 | 10 | 25 | 50 |
|---|---|---|---|---|---|
| marks (expected, T3b's O11) | 46 | 46 | 62 | 63 | 73 |
| marks (X=0.5 capOf scaling) | **34** | **41** | **48** | **48** | 73 |

**Rejected** — this touches `scene3d-mkdashramp-single-pass.test.js`'s O11 exact array, a file this unit
is FORBIDDEN to edit. Diagnosed with a probe: scaling the CAP shrinks `L`, which shrinks `nn`
(`Math.ceil(sv.L/sv.P)`) — but `nn` (stacked-pass count) is the ONLY thing keeping `tot` (`place()`'s own
`MIN_MARK_MM=0.6mm` survival gate, summed across all `nn` passes) above the floor at this fixture's many
foreshortened, small-local-`P` samples (died marks: `P` as low as 0.37mm, `each` after the cut as low as
0.139mm). A second gate variant (`bandN < MAX` instead of `bandOnsetCap(d) < MAX`) also leaked the cap
into d=50/d=220 territory (`bandN` itself falls below `MK_BAND_MAX_PASSES` at high density too, for the
unrelated packing-floor reason — `0.90*bandPitch/w`) — corrupting O13's own byte-identity there
(md5 mismatch at d=50 and d=220, confirmed and then fixed).

## Shipped design (GREEN)

`surface-fill.js`, `layMark`'s `law.shape === 'morph'` branch **only** (`MK.dashRamp`'s own sink, per the
brief's scope). `nn`/`bandN`/`n0`/`each` computed **exactly** as T3b left them — untouched. **After** `nn`
is fixed, each pass's own along-row length is separately bounded:

```js
const dashOnset = bandOnsetCap(opts.fillDensity);
const dashLenFloor = MIN_MARK_MM * 1.05;
const dashLenTarget = MK_DASH_LEN_FRAC * sv.P;   // MK_DASH_LEN_FRAC = 0.5
const eachDrawn = (dashOnset < MK_BAND_MAX_PASSES && each > dashLenFloor && each > dashLenTarget)
  ? Math.min(each, Math.max(dashLenFloor, dashLenTarget))
  : each;
```

- Gated on `bandOnsetCap(density) < MK_BAND_MAX_PASSES` — the SAME onset ramp T3b's own gate already
  uses (measured true for d<32 on every {sphere,torus}×{addLayer,create} combo), **not** the
  packing-limited `bandN`. This is what keeps d=50/d=220 byte-identical without touching either of
  T4/T4b's own files.
- `MK_DASH_LEN_FRAC = 0.5` — the classic 50% dash/gap duty convention, the largest fraction that still
  guarantees a real gap (`P − each >= 0.5P`) while leaving maximum headroom above `MIN_MARK_MM`.
- The floor clause (`each > dashLenFloor` in the gate, `Math.max(dashLenFloor, ...)` in the cut) means a
  mark that would only clear `MIN_MARK_MM` via a LONGER pass is left at its own original (uncut) length
  instead of being pushed under the floor — a mark is only ever shortened when doing so cannot flip its
  own `place()` accept/reject outcome. This is what makes mark COUNT provably unchanged (re-derived
  below, sphere AND torus, both rigs — not just the one fixture T3b's own O11 pins).

New constant `MK_DASH_LEN_FRAC` placed beside `MK_BAND_ONSET_D`/`bandOnsetCap` (same file, same
neighbourhood, `mkDashRamp`-only territory).

## GREEN — average dark-third mark length (the only public per-mark-length signal `lastMarkStats` exposes for a non-tick law: `lenByThird[2]/cntByThird[2]`)

sphere/hatch/mkDashRamp, addLayer rig:

| d  | before (mm) | after (mm) | ratio |
|---|---|---|---|
| 1  | 3.329  | 1.947  | 0.585 |
| 5  | 6.085  | 3.706  | 0.609 |
| 10 | 5.834  | 3.372  | 0.578 |
| 25 | 9.585  | 5.199  | 0.542 |
| 35 | 11.446 | 11.446 | **1.000** |
| 50 | 8.305  | 8.305  | **1.000** |

Reproduced independently on torus/addLayer (ratios 0.526–0.634 inside the ramp, 1.000 at d=35) and
sphere/create (ratios 0.560–0.590 inside the ramp, 1.000 at d=35) — not just the one pinned fixture. Full
tables in `after/T3c/report.json`.

## Non-regression — mark COUNT byte-identical, all three fixtures

| fixture | d=1,5,10,25,50 before | after |
|---|---|---|
| sphere/addLayer | `[46,46,62,63,73]` | `[46,46,62,63,73]` |
| torus/addLayer | `[38,51,70,77,79]` | `[38,51,70,77,79]` |
| sphere/create | `[52,83,83,96,119]` | `[52,83,83,96,119]` |

`O10` (T3b's own): `bandMax===1`, `pens===marks` for d=1..4, sphere/hatch, addLayer rig — unchanged. T3's
own `>=40 @ d=1` and non-decreasing d=1→50 (sphere+torus) — unchanged.

## d=35/d=50/d=220 — md5 byte-identical, both primitives, both rigs

Reproduced via `loadVecturaRuntime({ scriptOverrides })` against the literal `git show 75777240:...`
source (never `git stash`, never edited in the worktree): sphere/addLayer, torus/addLayer, sphere/create
all md5-identical at d=35/50/220. `T4b`'s own `engine.addLayer` fixture re-derived independently:
1501.0636578167772mm (unchanged).

## Guards run (targeted, foreground, one file at a time, `timeout: 600000`)

| file | result |
|---|---|
| `scene3d-mkdashramp-discrete.test.js` (new, this unit) | **22/22** |
| `scene3d-mkdashramp-single-pass.test.js` (T3b's own oracle, NOT edited) | **20/20**, unchanged |
| `scene3d-mkdashramp-low-end.test.js` (T3's own oracle) | **13/13**, unchanged |
| `scene3d-mkdashramp-dark-end.test.js` (T4b's own CI guard) | **4/4**, unchanged |
| `scene3d-mark-laws-draw.test.js` (T4's O8/G4 oracle) | **30/30**, unchanged from T4's own count |
| `scene3d-mktick-wedge.test.js` | **58/58**, byte-identical |
| `scene3d-mktick-runaway.test.js` | **37/37**, byte-identical |
| `scene3d-ribbon-width-bar.test.js` | **10/10** |
| `scene3d-ribbon-width-create-rig.test.js` | **12/12** |
| `scene3d-ribbon-f1b-streaks.test.js` | **44/44** |
| `scene3d-ribbon-wall-coverage.test.js` | **36/36** |
| `scene3d-ribbon-fill-depth-count.test.js` | **12/12** |
| `scene3d-crosshatch-cell-shape-b.test.js` | **11/11** |
| `scene3d-curved-density-floor.test.js` | **15/15** |
| `scene3d-curved-density-sparse-end.test.js` | **20/20** |

`[FillBoolean] polygon union failed on degenerate geometry` on stderr in several ribbon-file runs is
documented pre-existing noise (T3/T3b/T4-impl.md), not a regression. One run (`ribbon-fill-depth-count` +
`crosshatch-cell-shape-b` together) surfaced a single benign
`[vitest-worker]: Timeout calling "onTaskUpdate"` RPC warning (exit code non-zero on that combined run,
but 23/23 individual tests passed) — documented pre-existing shared-machine noise per
`ROUND3-RESUME-BRIEFS.md` §0b, not a regression; re-run individually both files are clean.

## What I saw (native-resolution crops, per protocol)

Captured from the worktree (`docs/3d-audit/fill-audit/after/T3c/`), both `--rig create` and
`--rig addLayer`. "Before" is a **scratch `git archive` export of this unit's own base sha (`75777240`)**,
captured with the identical rig/cell/camera — **not** the top-level gallery baseline, which still reflects
a state from before T3/T3b/T3c (none of which are merged to main yet) and would misattribute T3+T3b's own
contribution to this unit.

**sphere/hatch/mkDashRamp/low (d=1), both rigs:** BEFORE — each of the 6 curving rows reads as one long,
mostly-continuous stroke, broken only by occasional small nicks (the reviewer's "broken ruling" reading).
AFTER — the SAME rows now read unambiguously as a series of short, clearly-separated discrete dash
segments with real gaps between them. A 2×-native crop of the lower-left (darker) region
(`sphere-low-addlayer-crop2x-darkregion-before-after.png`) makes this unambiguous: BEFORE shows long
near-continuous arcs with tiny nick-gaps; AFTER shows genuinely isolated short dashes with substantial
surrounding blank space.

**torus/hatch/mkDashRamp/low:** identical improvement in kind, both rigs.

**sphere/torus med/max, both rigs:** pixel-for-pixel unchanged from the pre-T3c state (confirmed both by
eye — `sphere-med-create-before-after.png` — and by md5) — T4's dark-end gradient is untouched.

**Plainly: yes — the sphere and torus now read as a sparse texture of discrete dashes riding the rulings
at low density, not row-wide tiles and not broken/abutting rulings.**

## Byte-identity sweep — coverage stated as a fraction

Same reachable roster T3/T3b established (`mkDotScreen`, `mkTick`, `mkScribble`, `ladder` — 4 of 12 raw
`MARK_LAWS`, the other 8 unreachable via the current roster): all 4 laws × sphere × d={1,50,220} ×
addLayer rig, md5-identical to the pre-T3c tree, in `scene3d-mkdashramp-discrete.test.js`'s own sweep —
**0 mismatches**. Structural reason, not just measurement-and-lucky: the new `dashOnset`/
`MK_DASH_LEN_FRAC` logic is only ever read inside `layMark`'s `law.shape === 'morph'` branch, unique to
`mkDashRamp` — confirmed by reading the diff (only two `surface-fill.js` regions changed: the new
`MK_DASH_LEN_FRAC` constant beside `bandOnsetCap`, and the `layMark` morph branch's poly-building step).

## Bars changed

**None.** This unit adds one new file only (`tests/unit/scene3d-mkdashramp-discrete.test.js`); no
existing threshold, tolerance, population, or pinned fingerprint in any other file was touched. The
design that WOULD have changed a bar (scaling `capOf` upstream, see above) was measured, found to break
`scene3d-mkdashramp-single-pass.test.js`'s O11, and abandoned before shipping — not shipped-then-disclosed.

## Files touched

- `src/core/scene3d/surface-fill.js` — new `MK_DASH_LEN_FRAC` constant (beside `MK_BAND_ONSET_D`/
  `bandOnsetCap`); `layMark`'s `law.shape === 'morph'` branch (new `dashOnset`/`dashLenFloor`/
  `dashLenTarget`/`eachDrawn` locals, poly-building loop now uses `eachDrawn` instead of `each`). Nothing
  else in the file changed — `solveAt`'s `capOf`/`bandN`/`L` computation (T3b's own territory) is
  byte-for-byte untouched.
- `tests/unit/scene3d-mkdashramp-discrete.test.js` (new, 22 tests).
- `docs/3d-audit/fill-audit/after/T3c/report.json` + `shots/B/*.webp` (12 mkDashRamp cells, both rigs) +
  6 before/after PNG crops.

## Open follow-ups

- `MK_DASH_LEN_FRAC=0.5` is a measured, justified starting value (the classic dash/gap duty convention,
  and the largest fraction that clears the floor-survival analysis above) but was not tuned against a
  live-app slider sweep or a second independent viewer's judgment — a future unit could retune it if 0.5
  reads as too sparse or not sparse enough once Jay sees it in the running app.
- The average-dark-third-length metric (`lenByThird[2]/cntByThird[2]`) is a PROXY (aggregate, not
  per-sample `each/P`) chosen because it is the only public signal `lastMarkStats` exposes for a
  non-tick law without adding new instrumentation to the sink. A future unit wanting an exact per-sample
  gap-fraction oracle would need a small diagnostic addition to `mkStat`.

## NOT visually verified in the live running app

Verified via re-shot `scene3d-capture.js` cells (the same headless Puppeteer pipeline the gallery uses)
and direct Read-tool inspection of the resulting PNGs, both rigs, both primitives — not via interactive
clicking in a browser tab. The dev server on 8475 is live and serving v1.4.2 for anyone who wants to
confirm by hand (fillDensity slider, mkDashRamp toneLaw, hatch mapper, sphere or torus object).

REPORT docs/3d-audit/lane-reports/T3c-impl.md — DONE — sphere/hatch d=1 avg dark-mark length 3.33->1.95mm (ratio 0.585), mark counts byte-identical, d>=35 byte-identical.
