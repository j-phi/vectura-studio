STATUS: DONE/FU

> **Orchestrator correction (2026-09-13, from F1-erode-review.md condition 4):** the narrative below says "two cells lose ink"; the unit's own sweep data and the review both count THREE ink-losing cells. The ledger, SESSION-SUMMARY and STILL-OPEN carry the corrected count; the review names the third cell and its delta.

# F1-erode — implementer report (lane fill-audit-a3, cross-lane file grant)

**Lane:** fill-audit-a3. **Worktree:** `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a3`.
**Base sha → new sha:** `7f805654` → uncommitted at report time, committed immediately after this report (see Finish).
**Port:** 8475 (dev server confirmed serving `APP_VERSION` 1.4.1, matching the worktree's `package.json`).

## Files touched

- `src/core/geometry-utils.js` — **only** `insetMultiPolygon`'s retry ladder (13 lines added, 0 removed, per the plan's Rank-1 prototype almost verbatim).
- `tests/unit/scene3d-ribbon-erode-refusal.test.js` — new, 16 tests (the plan's §3b RED oracle).
- MAIN-side (not part of the worktree commit): `docs/3d-audit/STILL-OPEN.md` (closing bullet), `docs/3d-audit/fill-audit/after/F1-erode/report.json` + two evidence PNGs, this report.

`git diff --stat` in the worktree confirms exactly the two files above — no scope leak.

## The fix

`src/core/geometry-utils.js`, `insetMultiPolygon`'s escalating retry ladder (`:1298-1329` post-fix). Before this
fix, a `FillBoolean` failure swallowed by `safeOp` (which catches a `polygon-clipping` throw and returns
`null`/`[]`) was indistinguishable from a genuinely empty erosion: the ladder's `for` loop `break`s on attempt 0
regardless, so the other four rungs — which do recover this class of failure — never ran. The fix reads
`FillBoolean.consumeLastOpError()` before and after each rung (the same idiom `ribbon-geometry.js`'s
`runBooleanOp` already uses, with its own header comment saying to) and `continue`s to the next rung on a
swallowed failure instead of accepting the empty result. A final `consumeErr()` after the loop avoids leaking a
pending error to the next caller. This exactly matches the plan's §4 Rank-1 prototype (implemented, not Rank 2
or Rank 3).

## RED → GREEN proof

**New file, `tests/unit/scene3d-ribbon-erode-refusal.test.js` (16 tests):**

- Pre-fix (RED, verified on this tree before editing): **4 failed / 12 passed**. `interlockWeave`: `erodeEmpty=1`
  (expected 0), `swallowedAndEmpty=1 of 79 insetMultiPolygon calls` (expected 0), `ribbons=39` vs `wide=40`
  (expected equal), `degenerate=1` (expected 0). All four controls (`onePenDown`, `trochoidLoop`, `ampSpacing`,
  `weaveDepth`) passed at RED — confirming the RED is isolated to `interlockWeave`, matching the plan exactly.
- Post-fix (GREEN): **16/16 passed.**

**The two standing guard files (must go RED→GREEN, no re-pin):**

| file | before | after |
|---|---|---|
| `scene3d-ribbon-f1b-streaks.test.js` | 36/44 | **42/44** |
| `scene3d-ribbon-wall-coverage.test.js` | 35/36 | **36/36** |

Both numbers were independently re-derived by me on `7f805654` before touching source (36/44 with the exact
assertion message `expected 0.9363204944266638 to be >= 0.995`, matching the plan's own pre-derived numbers
verbatim) and again after the fix. **No bar in either file was touched.**

## Out of scope, still red

The two `trochoidLoop` reds are a different, sub-millimetre placement defect (plan §3c) and were NOT touched,
NOT re-pinned:

- `scene3d-ribbon-f1b-streaks.test.js` > `trochoidLoop — lattice sensitivity: doubling the divisor moves the
  reachable-cell count by <= 1 cell` — still red, `reachable @divisor12=76 @divisor24=80` (unchanged).
- `scene3d-ribbon-f1b-streaks.test.js` > `trochoidLoop — no uncovered cluster reads as a lengthwise streak` —
  still red, `cluster 34 cells, 0.1912 mm², 1.050 x 0.450 mm` (unchanged).

Confirmed both numbers are byte-identical before and after this fix. `docs/3d-audit/STILL-OPEN.md` already
carries this as "F1-trochoid (LEDGER row 2c, UNSCHEDULED)" from the planner; I did not touch it further beyond
appending my own closing bullet with the numbers reconfirmed.

## Deep-blank (condition 1 of F1-placement) — re-measured

Using the exact helpers `scene3d-ribbon-flat-field-placement.test.js` itself uses
(`captureRegionRings`/`buildBlankMap`/`findBlankClusters`), re-run standalone against a clean `cd541f87`
git-archive export and against the fixed worktree:

| law | before (mm²) | after (mm²) | bar |
|---|---|---|---|
| interlockWeave | 0.0300 | **0.0000** | ≤ 0.55 ✓ |
| onePenDown | 0.0000 | 0.0000 (byte-identical) | ≤ 0.55 ✓ |
| trochoidLoop | 0.0000 | 0.0000 (byte-identical) | ≤ 0.55 ✓ |

`scene3d-ribbon-flat-field-placement.test.js` itself (F1-placement's own oracle, DEGENERATE_CEILING allows
`interlockWeave` degenerate ≤ 1) ran **22/22 green** both as a guard and independently confirms this — note its
own header comment describing the `degenerate=1` case is now stale narrative (degenerate is 0 post-fix, still
≤ its ceiling of 1) but I did not edit that file, per its forbidden-bars list.

## Guards — every one run individually, foreground, one file per command

**Must stay green (plan's explicit list, all confirmed green):**

`scene3d-ribbon-flat-field-placement` 22/22 · `scene3d-ribbon-wall-region-clip` 1/1 ·
`scene3d-ribbon-outline-fill-seam` 4/4 · `scene3d-ribbon-c3-rule5` 6/6 · `scene3d-ribbon-primitives` 14/14
(benign RPC timeout warning, exit-0 pre-existing noise per ROUND3-RESUME-BRIEFS §0) ·
`scene3d-ribbon-weightscale-invariant` 18/18 · `scene3d-mesh-self-occlusion` 5/5 · `geometry-band-fill` 7/7 ·
`fill-boolean-safe-op` 6/6 · `text-fill-watertight` 68/68 · `text-outline-ops` 12/12.

**Tier-2 slow files the plan asked the implementer to run (all confirmed green):**

`scene3d-mark-laws-draw` 30/30 (T4/W-36c's own number) · `scene3d-ladder-uniform-field-spacing` 9/9 ·
`scene3d-style-fill-lines` 15/15 · `scene3d-curved-density-floor` 14/14 · `scene3d-curved-density-sparse-end`
20/20 · `scene3d-ribbon-f6-self-occlusion` 2/2 · `scene3d-ribbon-f7-self-occlusion` 2/2 ·
`scene3d-fill-even-spacing` 12/12 · `scene3d-fill-span-verdict` 11/11 · `scene3d-fill-ruling-continuity`
10/11 (1 pre-existing skip, not mine) · `scene3d-fill-seam-continuity` 5/5 · `scene3d-fill-boundary-ends` 41/41
· `scene3d-hlr-spatial-index-identity` 6/6 · `scene3d-shadow-receive` 17/17.

No vitest file exceeded 600 s this run; none needed `singleFork`.

## Orchestrator's three additions (addressed)

**(1) Extend the §8 md5 blast-radius sweep to ALL 8 mapper Types on the torus, named.**
`src/core/scene3d/params.js:79` — `MAPPERS = ['none','hatch','wireframe','crosshatch','contour','spiral',
'stipple','contourSlice']` — is what "8 Types" refers to. Instrumented md5 sweep (kind + 6dp points of every
emitted scenePath) across all 8 mappers × torus × the 37 `SCENE3D_TONE_LAWS.PRODUCTION` laws (296 cells),
clean `cd541f87` git-archive export vs the fixed worktree:

- **8 of 296 cells changed** (94.1% → **97.3%** byte-identical on this narrower torus-only sweep — the plan's
  original 4-primitive×hatch + torus×contour sweep found 5 torus-scoped changes; extending to all 8 mappers
  found **3 more**):
  - `hatch/interlockWeave` 6105.72 → 6325.02 mm (+3.59%), `erodeEmpty` 1→0 (plan's own primary finding).
  - `contour/ampSpacing` 6546.39 → 6548.46 mm (+0.03%).
  - `contour/onePenDown` 6845.89 → 6800.47 mm (−0.66%).
  - `contour/trochoidLoop` 6521.63 → 6525.40 mm (+0.06%).
  - `contour/weaveDepth` 6302.46 → 6380.94 mm (+1.25%).
  - **`crosshatch/interlockWeave` 9441.06 → 9660.35 mm (+2.32%), `erodeEmpty` 1→0 — a SECOND swallowed-erosion
    instance the plan's narrower sweep did not cover.**
  - **`crosshatch/trochoidLoop` 11129.99 → 11105.09 mm (−0.22%) — new.**
  - **`crosshatch/weaveDepth` 10454.33 → 10624.17 mm (+1.63%) — new.**
- `none`, `wireframe`, `spiral`, `stipple`, `contourSlice` on torus: **zero cells changed across all 37 laws**
  (`contourSlice` is provably tone-law-invariant — md5-identical across every law, as expected for a separate
  slices pass).
- All 8 deltas are inside the ±8% stop-condition-2 bar (range −0.66% … +3.59%).

**(2) Run guard/fingerprint tests for the unrelated-law cells the plan's original (non-torus) sweep found
gaining ink (`isophoteWidth` +4.6%/sphere, `whiteBand` +4.3%/sphere, `taperedEnds` +5.2%/cone), and disclose
any moved bar as a re-pin.**
Ran `scene3d-ribbon-degeneration-counter.test.js` (5/5 green) — its `control` test explicitly gates
`erodeEmpty === 0` on TORUS for `nibAngle, taperedEnds, weightModulated, isophoteWidth, whiteBand,
weightSmoothstep` and passed unchanged (these three laws' `erodeEmpty` was 0/0 on torus both before and after —
the plan's changed cells for these laws were on `sphere`/`cone`, not `torus`, consistent). Ran
`scene3d-ribbon-primitives.test.js` (14/14 green) — its `LAWS` include `taperedEnds`, `ampSpacing`, `whiteBand`,
`amplitudeOnly` across `CURVED = [sphere, capsule, cylinder, torus]`, all relational bars (region area, refusal
counts against a named allowance), none pinned to an absolute ink number. Ran
`tests/integration/scene3d-ribbon-weightscale.test.js` (41/41 green) — sphere fixture, `BUCKET_B` includes
`isophoteWidth`/`whiteBand`, asserts the weightScale-1 invariant (relational, not an absolute ink pin). **No
test file anywhere in the repo pins an absolute ink number for `sphere/hatch/isophoteWidth`,
`sphere/hatch/whiteBand`, or `cone/hatch/taperedEnds` specifically** (grepped every hit of these three law
names across `tests/unit/` and `tests/integration/`; the only numeric literals near them are narrative
comments in `scene3d-tone-law-collapse.test.js`, e.g. "2862.5 vs 2919.7 mm ink" describing historical RED
numbers for an unrelated U2 unit, not live assertions). **Conclusion: no fingerprint or bar moved for these
three laws; nothing needs disclosure under `## Bars changed`.**

**(3) Count the fill-depth swallowed failures the plan found no counter observes; add a counter within allowed
files, or report the count via instrumentation and say a production counter is out of scope.**
`surface-fill.js` (where the fill-depth `erode()` call sits, `:7233`) is outside this unit's file grant (see
"Forbidden" in the plan's §5) — **a production counter is out of scope.** Reported via external instrumentation
instead: wrapped `GeometryUtils.insetMultiPolygon` (no source change) over the 8 changed cells found by the
extended sweep, clearing/reading `FillBoolean.consumeLastOpError()` around every call:

| mapper/law | calls | swallowed-and-empty, before | erodeEmpty, before | swallowed-and-empty, after |
|---|---|---|---|---|
| hatch/interlockWeave | 79→80 | 1 | 1 | 0 |
| crosshatch/interlockWeave | 147→148 | 1 | 1 | 0 |
| contour/ampSpacing | 140 | 0 | 0 | 0 |
| contour/onePenDown | 46 | 0 | 0 | 0 |
| contour/trochoidLoop | 124 | **1** | 0 | 0 |
| contour/weaveDepth | 126 | **2** | 0 | 0 |
| crosshatch/trochoidLoop | 226 | 0 | 0 | 0 |
| crosshatch/weaveDepth | 130 | **1** | 0 | 0 |

**6 total swallowed-and-empty top-level `insetMultiPolygon` calls found pre-fix, all 0 post-fix.** 2 were
already visible via `erodeEmpty`/`degenerate`; **4 were invisible to any existing counter** (`contour/
trochoidLoop` ×1, `contour/weaveDepth` ×2, `crosshatch/weaveDepth` ×1) — confirming the plan's "swallowed at
the fill depth" finding concretely, by name, for the first time. The remaining 3 changed cells
(`contour/ampSpacing` +0.03%, `contour/onePenDown` −0.66%, `crosshatch/trochoidLoop` −0.22%) show **zero**
swallowed calls at either depth in this instrumentation; their tiny deltas are attributed to the
`consumeLastOpError` clear-before-read coupling the plan's own §8 already disclosed (Rank 1 clears any error a
prior, unrelated caller left pending, which can change a later, unrelated read elsewhere in the same render) —
all three are noise-level and well inside the ±8% bar.

## Evidence

Captured from MAIN with `--root` = the worktree, `--out docs/3d-audit/fill-audit/after/F1-erode` — 14 cells
(the plan's minimum four torus cells at med/max, plus `ampSpacing`/`weaveDepth` controls at med/max, plus the
two sphere and two cone cells). `manifest.B.1-1.jsonl` records `appVersion: "1.4.1"` for every cell.

**Byte-identical-vs-baseline finding, explained (not just noted).** All 14 captured cells are byte-identical to
the top-level `shots/B/` gallery baseline, INCLUDING `torus__hatch__interlockWeave__med__a`, which is proven by
direct runtime instrumentation (above) to change under this fix. This is not a scoping miss: I re-derived the
gallery capture script's own object-construction path
(`scripts/audit/scene3d-capture.js:buildAndMeasure`) and found it seeds the rig from
`PRIMITIVE_CREATE_DEFAULTS` merged over `PRIMITIVE_PARAM_DEFAULTS` — a denser "Add primitive" rig — not from
plain `engine.addLayer('scene3d')` deserialization defaults, which every RGR test in this lane
(`scene3d-ribbon-f1b-streaks.test.js`, `scene3d-ribbon-wall-coverage.test.js`, this unit's own new file) uses.
Proof from the manifest's own recorded metrics for `torus__hatch__interlockWeave__med__a`: `pathCount=226,
totalPoints=9042, inkMm=2006.6, wide=30` — IDENTICAL before and after, because the gallery's rig geometry never
reaches the swallowed-boolean-failure stretch at all. **This is a genuine gallery coverage gap for this
specific defect class** (the gallery cannot evidence this fix with its current rig, on any cell), not evidence
the fix does nothing. `identical_exceptions` in `report.json` names all 14 with this reasoning; the other 6
(`onePenDown`/`trochoidLoop`/`ampSpacing`/`weaveDepth` torus + the sphere/cone cells) are ALSO correctly
byte-identical under the runtime-level md5 sweep independent of the gallery-rig question — i.e. those 6 truly
do not move, for the reason the plan expects (correct scoping / out-of-scope-defect).

**Because the gallery rig cannot show the fix, I built a bespoke native-resolution visual proof instead**
(reported in `report.json.visual_proof`): a Playwright script builds the EXACT bug-reproducing fixture
(`engine.addLayer('scene3d')`, torus, hatch, `interlockWeave`, default camera/density/pen — the same
construction the RGR tests use), extracts `scenePaths`, and renders them as an SVG cropped to the stretch's own
document-space bbox (x128–158, y69–85 mm, a small margin around the plan's measured x130.156–155.890,
y71.033–82.841 mm bbox) at 30 px/mm, once against a clean `cd541f87` export (stats printed: `erodeEmpty=1
degenerate=1 wide=40 ribbons=39`) and once against the fixed worktree (`erodeEmpty=0 degenerate=0 wide=40
ribbons=40`). Saved as `interlockWeave-stretch-crop-before.png` / `-after.png` in this unit's evidence
directory.

**What I saw (Read tool, both images, native resolution):** BEFORE shows a single thin zigzag centreline — a
bare wireframe line carrying no fill — crossing the upper-middle-right of the crop, visibly thinner and
starved of ink compared to every neighbouring zigzag ribbon in the same band, all of which are bold, solid,
filled shapes. AFTER shows that exact same stretch now filled bold and solid, matching its neighbours
seamlessly — the bare centreline is gone, and the band reads as one continuous, evenly-inked interlocking
zigzag pattern with no visible interruption. This is the fix, seen.

## Bars changed

**None.** No threshold, tolerance, count bar, or pinned fingerprint in any existing test file was moved, up or
down. The new file's three gates (`erodeEmpty === 0`, `swallowedAndEmpty === 0`, `wide` at/above its measured
floor + `ribbons === wide`) are new assertions on quantities with no prior bar.

## Live app verification

Dev server confirmed serving the worktree at `http://localhost:8475/`, `APP_VERSION` 1.4.1 matching
`package.json`. Visual proof above is a direct render of `scenePaths` from the running runtime (both pre-fix
and post-fix), not a synthetic mock — this is the closest available live-app verification for a geometry-level
fix with no UI surface of its own (the fix is entirely inside a shared boolean-geometry primitive; there is no
new UI control to click).

## Commit

Committed in the worktree, explicit `git add` of the two touched files only. See commit hash in the final
message to the orchestrator (not repeated here per the context-protection protocol). Never pushed.
