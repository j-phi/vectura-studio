STATUS: DONE

# W-27c-0a-4b — iteration-4 review follow-ups 2/3 (cone/cylinder measurement + regression guards; floor-limitation disclosure)

Lane: fill-audit-d2. Worktree: `.claude/worktrees/fill-audit-d2` (branch
`3d-scene/fill-audit-d2`). Base sha for this unit: `c6dd6130` (this lane's
HEAD, iteration 4's re-scoped whole-ring crowding cull — unchanged by this
unit). New sha after this unit's commit: see commit hash below.
`src/core/algorithms/scene3d.js` was **not touched** (measurement + tests
only, per this unit's own brief) — confirmed by `git diff --stat` showing
exactly one file, `tests/unit/scene3d-contour-slice.test.js` (+437/-0).

This unit answers review-4's blocking follow-ups 2 and 3
(`docs/3d-audit/lane-reports/W-27c-0a-review-4.md` §8 and §4/Verdict items
2-3): measure cone/cylinder contourSlice under the re-scoped crowding cull
(never measured or tested by any prior W-27c-0a report), add a permanent
regression guard, and disclose — in the test file itself — exactly what
review-4 found about the four existing torus/sphere floor+10% bars.

## 1. Measurement method

Ported the exact rig from `W-27c-0a-impl-4.md` §2 (`measureO2`,
`measureRealO2`, `measureBlobs` — unchanged logic, copied verbatim) into a
standalone Node script (no vitest harness) so it could run against
from-scratch `git archive` exports of both commits without touching the
worktree:

```
mkdir -p /private/tmp/claude-501/scratch-W27c4b-pre /private/tmp/claude-501/scratch-W27c4b-post
git -C .claude/worktrees/fill-audit-d2 archive 47a5a755 | tar -x -C /private/tmp/claude-501/scratch-W27c4b-pre
git -C .claude/worktrees/fill-audit-d2 archive c6dd6130 | tar -x -C /private/tmp/claude-501/scratch-W27c4b-post
ln -sfn .../fill-audit-d2/node_modules /private/tmp/claude-501/scratch-W27c4b-pre/node_modules
ln -sfn .../fill-audit-d2/node_modules /private/tmp/claude-501/scratch-W27c4b-post/node_modules
```

`tests/helpers/load-vectura-runtime.js`'s `rootDir` option let the script
load each export's OWN `src/core/algorithms/scene3d.js` while resolving
`jsdom`/etc. from the worktree's `node_modules` — no per-export
`node_modules` copy was actually needed (the symlink was made anyway, for
protocol conformance). Confirmed the two exports' `scene3d.js` differ
(md5 `4da80904…` vs `d9d0bcb9…`) before trusting any measurement.

Diff `47a5a755` = "pre" (iteration 3's unscoped whole-ring cull, already
shipped on main). Diff `c6dd6130` = "post" (this lane's HEAD, iteration
4's `CROWD_MIN_DISTINCT_LEVELS=2` re-scope).

## 2. Measured results (full numbers also in `after/W-27c-0a-4b/report.json`)

**Cone, unit rig (sliceCount 26, `BOUNDS.penWidth` 0.3):**

| metric | pre (iter 3) | post (iter 4) | cull-inert baseline |
|---|---|---|---|
| pathCount | 17 | 22 | 22 |
| totalInk | 626.67mm | 787.18mm | 787.18mm |
| retained | 79.6% | ~100.0% (byte-identical) | — |
| pct05 | 1.607% | 5.357% | — |
| pct1 | 7.427% | 18.936% | — |
| waist | 0.0372mm (0.124w) | 0.0372mm — BYTE-IDENTICAL to pre | — |

**Cylinder, unit rig:**

| metric | pre (iter 3) | post (iter 4) | cull-inert baseline |
|---|---|---|---|
| pathCount | 23 | 26 | 26 |
| totalInk | 950.97mm | 1075.01mm | 1075.01mm |
| retained | 88.46% | 100.0% (byte-identical) | — |
| pct05/pct1 | 0% / 0% | 0% / 0% | — |
| waist | no qualifying pair (Infinity) | same (Infinity) | — |

**Engine pipeline (`fillDensity` 50 "med" AND 220 "max" — confirmed
byte-identical to each other on both primitives, both pre and post;
contourSlice's plane count is a pure function of `sliceCount`, which
`fillDensity` never touches — same finding review-4 made for
torus/sphere/solid):**

| | cone blobCount | cone largestW | cylinder blobCount | cylinder largestW |
|---|---|---|---|---|
| pre (iter 3) | 25 | 26.3mm | 3 | 40.9mm |
| post (iter 4) | 44 | 31.3mm | 2 | 41.7mm |

**Ring count in the flat region** (device-Y thirds of each primitive's own
cull-inert bounding box; cone base = bottom third, cylinder wall = the one
band essentially all its rings fall in with this camera):

| | pre (iter 3) | post (iter 4) |
|---|---|---|
| cone base band | 8/10 | 10/10 (byte-identical to cull-inert) |
| cone mid band | 7/10 | 10/10 |
| cone apex band | 2/2 (unaffected both) | 2/2 |
| cylinder wall band | 23/26 | 26/26 (byte-identical to cull-inert) |

## 3. Finding — not a regression

Every post-iteration-4 number for cone and cylinder is **byte-identical to
that primitive's own cull-disabled ("inert") ground truth** — the
re-scoped crowding cull is now **completely inert** on both primitives at
this configuration (26 slice planes). Iteration 3's own aggressive
over-culling on cone/cylinder (79.6% / 88.46% retained) was pure
collateral damage from the unscoped whole-ring test — never disclosed,
measured, or tested by any W-27c-0a report before this unit (review-4 §8's
exact finding). Iteration 4's re-scope, whose whole point was to stop the
cull firing in genuinely flat/uncrowded regions (the torus lower band,
review-3's REJECT reason), turns out to **also** fully restore cone's flat
base region and cylinder's entire wall — the SAME class of fix already
made for torus/sphere, just discovered here for the first time.

**Why inert, mechanistically**: a cylinder's wall is a stack of parallel,
evenly-spaced circles with zero genuine multi-level convergence (no
saddle, no pole) — `CROWD_MIN_DISTINCT_LEVELS=2` can never fire there. A
cone's apex is too sparse (2 rings only, unaffected in both pre and post)
to ever produce a >=2-distinct-level pileup at 26 slice planes, and its
base/wall are otherwise as uncrowded as the cylinder's.

**No STOP was warranted.** `scene3d.js` was not touched by this unit.

## 4. Regression guards added (RGR)

New `describe('W-27c-0a-4b — cone/cylinder contourSlice under the
re-scoped crowding cull (measured for the first time)', ...)` block in
`tests/unit/scene3d-contour-slice.test.js`, 6 new tests, self-contained
(own copies of `sceneForPrimitive`/`measureO2`/`buildRealEngineFills`/
`measureBlobs`/`ringBandCounts`, matching the file's own existing pattern
of independent per-describe-block rig copies rather than a risky shared-
scope refactor of already-green tests).

**Shape**: W-26b-3 (floor/ceiling with real, generous margin — the
"envelope" — PLUS a separate tight ±10%, or ±5% for the two ring-band
tests, "fingerprint" band pinned to the exact c6dd6130-measured value) —
applied for the first time in this file, per this unit's brief, closing
the gap review-4 §4 flagged as "the audit's own strongest precedent...not
applied" for the original four torus/sphere bars.

**RED at 47a5a755** (verified via a `scene3d-contour-slice.test.js` copy
dropped into the `scratch-W27c4b-pre` export and run there, `npx vitest
run ... -t "W-27c-0a-4b"`): **4 of 6 new tests genuinely fail**:
- cone ink-survival fingerprint: `expected 626.6701491719745 to be greater
  than 669.1062185081133` (90% of the c6dd6130-measured 787.18mm)
- cylinder ink-survival fingerprint: `expected 950.9684934645634 to be
  greater than or equal to 967.509`
- cone base-band ring-count fingerprint: `expected 8 to be greater than or
  equal to 9`
- cylinder wall-band ring-count fingerprint (after tightening to ±5% — see
  `## Bars changed`): `expected 23 to be greater than or equal to 24`

The 2 that pass at pre are the intentionally loose "envelope" bars on
those same two tests (sanity-only, real headroom, not the regression
catcher) plus the engine-pipeline blobCount/largestW test (which only
asserts `med === max` and generous envelope ceilings, not a tight
fingerprint against iteration 4's exact numbers — iteration 3's own
blobCount/largestW already happen to sit under those generous ceilings,
which is fine: those two tests exist to prove med/max byte-identity and a
sane order of magnitude, not to catch this specific mechanism regression;
the tight ink/pathCount/ring-band fingerprints above are what catch it).

**GREEN at c6dd6130**: all 6 new tests pass; full file **57/57** (51
pre-existing + 6 new), run in the foreground.

## 5. `## Bars changed`

| file:line | old | new | why |
|---|---|---|---|
| `tests/unit/scene3d-contour-slice.test.js` — cylinder wall-band ring-count fingerprint (new bar, no prior value) | n/a | `Math.floor(bands.inert[wallBand] * 0.95)` | Initially wrote `* 0.90` (floor(26*0.90)=23), which happened to sit exactly AT the pre-fix measured value (23) and so passed vacuously at 47a5a755 instead of catching the regression. Tightened to `* 0.95` (floor=24) so this bar is a genuine RED/GREEN proof, not a coin. Caught by re-running the RED check after the first draft — see §4. |

No existing bar (torus/sphere or otherwise) was touched. All six new
bars are net-new (this primitive pair was never measured or asserted on
before this unit) — there is nothing else to disclose as "changed."

## 6. Floor-limitation disclosure (review-4 §4 / Verdict item 3)

Per this unit's brief, the test file now carries an explicit comment
(directly above the new `describe` block) restating review-4 §4's finding
in full: the four existing torus/sphere engine-pipeline floor+10% bars
(waist/largestW) are pinned AT their RED values because — per review-4's
own independent mutation testing across three separate mutations of
`CROWD_CULL_K`, `CROWD_MIN_ARC_MULT`, and the same-level exclusion — under
this mechanism's subtractive-only, whole-ring design, the pairwise-minimum
self-approach ("waist") can only stay the same or increase, and the
largest-merged-blob-width ("largestW") can only stay the same or shrink,
as the cull is tuned MORE aggressive. RED is a structural ceiling/floor for
those two quantities that no tuning of this mechanism's own constants can
ever cross. Those four bars therefore cannot fail from retuning this
mechanism's own knobs — their only reachable failure mode is an UNRELATED
future change to the shared projector/refinement/clipper code they also
depend on. The comment explicitly extends the same argument to the new
cone/cylinder guards added by this unit (which are byte-identical to their
own cull-inert ground truth for the identical structural reason).

## 7. Guards (foreground, one file at a time, never backgrounded)

- `tests/unit/scene3d-contour-slice.test.js`: **57/57** (51 pre-existing +
  6 new).
- `tests/unit/scene3d-mesh-self-occlusion.test.js`: **5/5** (pre-existing
  `[FillBoolean] polygon union failed on degenerate geometry` console
  noise, unrelated, per STILL-OPEN.md's Unit-F entries).
- `tests/unit/scene3d-hlr.test.js`: **11/11**.
- `tests/unit/scene3d-mappers.test.js`: **32/32**.

## 8. Evidence

Verified all four named cells exist in Tier A's manifest before capturing
(`cone__contourSlice__ladder__{med,max}__a`,
`cylinder__contourSlice__ladder__{med,max}__a` — all present in
`manifest.A.1-1.jsonl`). Captured from MAIN against the live worktree
(port 8481):

```
node scripts/audit/scene3d-capture.js --tier A --root .claude/worktrees/fill-audit-d2 \
  --port 8481 --only '^(cone|cylinder)__contourSlice__ladder__(med|max)__a$' \
  --out docs/3d-audit/fill-audit/after/W-27c-0a-4b
```

All 4 shots `ok`. `after/W-27c-0a-4b/report.json` written with full
before/after tables and visual findings.

**`med`/`max` byte-identical**: confirmed directly (identical webp file
sizes, matching md5) on both primitives, both pre and post — same
finding review-4 made for torus/sphere/solid.

**IMPORTANT gallery-hygiene correction found while preparing the "before"
comparison**: the pre-existing committed baseline shot
(`docs/3d-audit/fill-audit/shots/A/cone__contourSlice__ladder__med__a.webp`,
appVersion 1.3.98) is **stale** — it visibly shows FACETED/polygonal
rings, while both this lane's 47a5a755 and c6dd6130 exports show SMOOTH
rings. That gallery shot predates the W-27b/W-27c ring-refinement work
entirely and is **not** a valid "before" image for isolating this unit's
diff (comparing against it would have falsely attributed an unrelated,
much larger, already-shipped improvement to this unit). A true
apples-to-apples "before" was captured separately by pointing
`scene3d-capture.js`'s `--root` directly at the `scratch-W27c4b-pre`
(47a5a755) export on a second port (8482), confirmed via `lsof`/`ps` to
actually be serving from that export's directory (not a stale reused
server). Saved to `after/W-27c-0a-4b/before-47a5a755/`.

**LOOKED at native-resolution crops (no downscaling), pre-47a5a755 vs
post-c6dd6130, using the corrected apples-to-apples before**:

- **Cone, lower-half crop** (rows 350-738 of 738, full width): `before`
  shows 7 nested arcs in this band; `after` shows **8** — one additional
  ring restored near the base, consistent with the measured base-band
  count going 8/10 -> 10/10.
- **Cone apex, 3x zoom**: byte-identical-looking in both — no fused or
  defective tip either version (waist stays 0.0372mm in both, unaffected,
  as expected — a cross-ring cull structurally cannot touch a same-ring
  self-approach).
- **Cone base-rim, 3x zoom (left portion)**: no visible difference at this
  specific sub-region — the 2 restored rings sit elsewhere in the base
  band, not at this exact crop.
- **Cylinder, right-edge crop** (x=380-505/506, y=300-500, 3x zoom):
  `after` shows one additional bright/thicker band near the right
  silhouette not present in `before` — a restored ring, consistent with
  the measured wall-band count going 23/26 -> 26/26.
- **Cylinder cap rims** (top and bottom, 3x zoom): no visible difference —
  the 3 restored rings are mid-wall, not at either cap.

Harness-clean confirmed app-clean: the aggregate measurement (pathCount/
totalInk/blobCount) and the native-resolution crops agree on both the
direction (more ink survives) and the approximate magnitude (a handful of
rings, not a dramatic redraw) of the change.

## 9. Open follow-ups

None filed by this unit. Review-4's blocking follow-ups 2 and 3 are both
addressed (measurement + regression guard for cone/cylinder; the floor-
limitation disclosure is now in the test file itself, not just this
report). Follow-up 1 (§5's same-ring-vs-cross-ring root-cause correction
for `largestW`) is out of scope for this unit (it concerns W-27c-0a-2's
future planning, not a test or measurement gap) and was not touched.

REPORT docs/3d-audit/lane-reports/W-27c-0a-4b-impl.md
