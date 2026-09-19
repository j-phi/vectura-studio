STATUS: REJECT

# W-32 Rank 4 — adversarial review (border-4, `b43fa4e3..76a77f22`)

**Reviewer setup.** Read-only in `.claude/worktrees/border-4` (never edited/stashed/checked out).
Scratch exports under `/private/tmp/claude-501/scratch-W32r4/`: `pre` = `git archive b43fa4e3`,
`post` = `git archive 76a77f22`, both with `node_modules` symlinked from MAIN, Node v20.20.2,
package.json 1.4.2 in both. A third scratch copy (`post-disabled`, deleted after use) had
`SIL_PROTO_ON` hard-patched to `() => false` for an independent mutation check. All vitest runs
foreground, one file per command, `timeout: 600000` where needed. No files left behind in the
worktree or the repo; probe copies lived only under my private scratch dir and were deleted.

## 1. RED/GREEN + mutation — PASS

- Copied the new oracle file (`tests/unit/scene3d-fill-silhouette-overshoot.test.js`, byte-identical
  between pre/post export) into the `pre` scratch tree and ran it there: **45 failed / 356 passed /
  401 total**, exactly matching the impl report's claim. Worst failure:
  `ellipsoid·hatch·a·max (create)` → `expected 0.2172222694982199 to be less than or equal to 0.15`
  = **0.7241 pen**, matching the plan's/impl's quoted 0.72 pen to 4 significant figures.
  Breakdown by clause: **24× O1** (impl said 23×), **1× O1 mutation**, **19× O2** (impl said 20×),
  **1× O5 mutation**. Total is exactly 45 either way — the impl's 23/20 vs my measured 24/19 is a
  minor, harmless mislabelling of which named cell falls in which clause, not a count error.
- Ran the same file on `post`: **401/401 passed**, confirming GREEN independently.
- **The measurement is against an independently-built analytic reference, not the chart or the
  drawn mesh polygon**: `trueHullFor()` builds a *separate* mesh via `Scene.buildPrimitiveMesh` at
  `detail = 200` and hulls its projected vertices — built entirely outside `silhouetteProjectLocal`/
  `silRefine`, so the fix cannot move its own yardstick. Confirmed by reading the test file.
- **Independent mutation, done my own way (not just the test's built-in `__SIL_PROTO_OFF` toggle):**
  in a scratch copy of `post`, hard-replaced `const SIL_PROTO_ON = () => !(...)` with
  `const SIL_PROTO_ON = () => false;` at the source level and reran the full oracle file:
  **45 failed / 356 passed / 401 total — byte-identical failure count to the `pre` baseline.** This
  is a stronger proof than the test's own window-flag toggle (which only proves the toggle works,
  not that disabling the mechanism at its actual gate reproduces the base-sha defect).
- **Which half of Jay's complaint this gates:** confirmed from the file's own header and the O1/O2
  bar — it gates ONLY "a ruling end sticks out past the grey outline" (`osDrawn`). It says nothing
  about rulings stopping short of the surface (`scene3d-fill-boundary-ends`'s territory, read-only,
  reproduced 41/41 myself on `post`) or about raggedness (W-35's stair-step, unclosed by design,
  correctly disclosed as a follow-up).

## 2. SCOPE — PASS

`git diff b43fa4e3..76a77f22 -- src/core/algorithms/scene3d.js` has exactly 3 hunks at
`@@ -663,6 +663,63 @@`, `@@ -3926,6 +3983,147 @@`, `@@ -5170,7 +5368,14 @@` — matching the plan's
four named sites (`silhouetteProjectLocal`+`SIL_NEWTON_ITERS`+`SIL_PROTO_ON` colocated in the first
hunk; the convex-chart gate + `silRefine` closure after `Edges.classifyEdges` in the second; the
clip-call change in the third). None fall inside the contourSlice pass (`:4650-4800` old numbering)
or the border-emphasis helpers (`:3492-3800`) — confirmed by line position. `git diff --stat` for
the full commit range touches only `scene3d.js`, the two disclosed re-pin test files, the new test
file, `CHANGELOG.md`, `plans.md`. **`hlr.js`, `surface-fill.js`, `surface-fill-mono.js`,
`mappers.js`, `edges.js`, `params.js` are all untouched** — confirmed with a targeted `git diff
--stat` against each. The torus exclusion (`convexChart = rChart && (rChart.mode !== 'torus' ||
torusGateOpen)`) is an explicit, commented gate exactly as claimed.

## 3. RE-PINS — PASS

**`scene3d-hlr-spatial-index-identity.test.js`:** substituted the OLD `EXPECTED` block into the
`post` tree (script-verified, not hand-typed) and reran: **`curvedOverlap-perspective-mixed-xray`
and `denseMixed-8obj-shadows` FAIL** (both `|settled` rows, matching the disclosed hash/pointCount
deltas), **`facetedOverlap-orthographic-hatch` still PASSES** — 4 passed / 2 failed of 6, exactly
the scoped-gate proof the disclosure claims. The OLD pins reproduced 6/6 GREEN on unpatched `pre`.
The file's own "indexed matches brute-force linear-scan, same run" tests (its "contrast mutation" —
these don't depend on the pinned literals) stayed green throughout, including with the old pins
substituted, confirming the acceleration structure and the refinement compose correctly rather than
the fingerprint check going vacuous.

**`scene3d-curves.test.js`:** substituted the OLD assertion body back into `post`: **1 failed / 12
passed (13)** — exactly the one named test, `expected 0.2172...` style mismatch on the 2-point-chord
assertion. OLD assertion passes 13/13 on unpatched `pre`. NEW assertion passes 13/13 on `post`. The
disclosure is accurate: only this one test moves, the other 12 (including "Curves ON chains...")
are untouched.

Both re-pins are proven, correctly scoped, and honestly disclosed. **No problem found here.**

## 4. BYTE-IDENTITY — PASS

O4 (fill) and O5 (excluded-set + torus + ground) both ran green on `post` as part of the 401/401 in
§1 — fill ink 0.000% on every measured cell, 48/48 faceted cells + torus (8/8 mappers) + ground
byte-identical, with the torus mutation proof (`window.__SIL_PROTO_TORUS_ON`) confirmed moving
`sceneEdge` when I read the failing-at-base-sha run (the O5 mutation test is RED at base sha for the
structurally correct reason: no gate exists yet to bypass).

**Independently re-ran the planner's own `measure.js`** (unmodified) against my own `post` export
(not the planner's pre-built scratch dir) with `PROTO=on/off`, `RIGS=create`:
- **create·med, worst osDrawn per primitive, paired by identical (primitive,mapper,angle) cell**
  (not by independently-selected "worst" per side, which I initially got wrong and corrected):
  ellipsoid **0.71→0.01**, sphere **0.52→0.00**, cone **0.48→0.02**, capsule **0.25→0.01**, cylinder
  **0.12→0.00** — matches the plan/impl table exactly.
- **create·max:** ellipsoid **0.72→0.01**, sphere **0.52→0.00**, cone **0.52→0.02** — matches.
- **Edge-ink delta per matched cell (create·med):** capsule +0.137…+0.141%, sphere +0.123…+0.129%,
  ellipsoid +0.171…+0.179%, cylinder +0.042%, cone +0.196…**+1.564%** — matches the plan's claimed
  "+0.03…+1.56%" range and the cone-largest-correction claim, to two decimal places.

*(MERGE r4 item 30/R4-2 annotation: harness rule D-equivalent — the planner's `measure.js`/`raster.js`
build a bare scene with `q.ground = { enabled: false }` set explicitly (no ground child ever
constructed), so every ink/osDrawn number above EXCLUDES ground-plane ink. Fixture: rig create,
density med/max as labelled, camera create-tier default, no non-default style params beyond the
`PROTO=on/off` silhouette toggle under test.)*
- Torus: unchanged, confirmed via the passing O5 torus byte-identity + mutation-proof tests.

## 5. GUARDS — REJECT (three undisclosed broken guards found; everything else clean)

**Clean (all reproduced by me on `post`, or on the worktree read-only where a scratch export
lacked `.git` for a `git show HEAD` self-test):**

| file | result |
|---|---|
| `scene3d-fill-boundary-ends` | 41/41 |
| `scene3d-silhouette-contiguity` | 6/6 |
| `scene3d-border-contiguity` | 7/7 |
| `scene3d-hlr` | 11/11 |
| `scene3d-contour-slice` | 67/67 |
| `scene3d-slice-end-overlap` (worktree — scratch export's `git show HEAD` self-test fails outside a real repo, harmlessly) | 30/30 |
| `scene3d-appdefault-facet-fill` + `-lit-floor` | 11 passed, 1 skipped (pre-existing) |
| `scene3d-shadow-anatomy` | 23/23 |
| `scene3d-mkdashramp-low-end`, `scene3d-shadow-receive-lighttypes`, `vectura-geometry-algorithms` (found via my own grep for other pinned-hash files touching curved primitives) | 13/13, 8/8, 33/33 |

**Cross-object occluder scene (§3.5), reproduced with the planner's own unmodified `occl.js`
against `post`:** worst gap before **0.00 pen**, worst gap after **−0.39 pen** (exact match),
median range **−0.07 to −0.14 pen** (impl claimed −0.07…−0.13; matches within the wider mapper/
density sweep I ran), **0 of the swept cuts under −0.5 pen** — matches the "hlr.js not needed"
conclusion.

**Frame cost:** 5-run mean, ellipsoid·crosshatch·d220, `computeAllDisplayGeometry`, fix OFF vs ON:
284ms → 281ms, **−1.06%** (ON was marginally *faster*, i.e. inside noise) — confirms ≤1% claim.

**Broken and undisclosed — found by grepping the test suite for other files pinning golden
hashes/fingerprints over `sphere`/`cone`/`ellipsoid`/`capsule`/`cylinder`, per binding rule 4
("grep for pins on that law and check the fixture"), which neither the plan's §5.1 guard table nor
the impl's own guard table names:**

1. **`tests/unit/scene3d-facet-min-rulings.test.js` — T1's pinned golden fingerprints.**
   `post`: **12 failed / 67 passed (79)**. `pre` (unpatched, base sha): **79/79 pass.** All 12
   failures are `sphere / {hatch,crosshatch} / d{1,50,220} / a{20,45}` — every `sphere` cell in the
   T1 sweep, and *only* `sphere` (box/solid/pyramid/plane all still pass). T1 fingerprints
   `group.scenePaths` in full (fill **and** edge ink), so a legitimately-moved sphere silhouette
   changes the pin — the same class of change this unit already re-pinned in
   `scene3d-hlr-spatial-index-identity.test.js`, just in a file nobody checked.
2. **`tests/unit/scene3d-box-density-bearing.test.js` — the byte-identity guard's `sphere`
   fingerprints.** `post`: **1 failed / 3 passed (4)** — the single "BYTE-IDENTITY GUARD" test
   fails at `expect(fingerprint(50, 'sphere')).toBe('6c237f90:23012')` (`received
   '56fa048b:29028'`); the assertion short-circuits before reaching the `d150` sphere line, which is
   very likely also stale. `pre`: **4/4 pass.** box/solid/plane fingerprints (10 assertions) are
   unaffected — same "curved primitive only" signature as above.
3. **`tests/unit/scene3d-mktick-wedge.test.js` — the bare-wedge oracle's pinned `pathSignature`
   goldens.** `post`: **8 failed / 50 passed (58)** — `sphere` and `cone`, `hatch` and `contour`,
   both `test rig` and `create rig` (4 cells × 2 rigs). `pre`: **58/58 pass.**

All three are confirmed **not pre-existing** (100% green on unpatched `b43fa4e3`) and confirmed
**caused by this unit specifically** (only the curved/charted primitives this unit refines are
affected; faceted primitives in the same files are untouched, matching this unit's own claimed
scope exactly). This is not evidence the fix is wrong — the underlying geometry change is the same
legitimate one already proven in §3 above — but it means **the tree at `76a77f22` currently carries
at least 21 RED tests in guards nobody ran, with zero entries in `## Bars changed` and zero mention
in the impl report's guard table.** Per `AGENT-PROTOCOL.md`: *"A bar change with no entry is treated
as a hidden regression and REJECTS the unit"* — and per binding rule 4, a pinned fingerprint's
fixture (not just its law name) has to be checked before a unit can claim the guard sweep is
complete. Three separate files were missed, not one.

## 6. PICTURES

- Looked at `ellipsoid-hatch-d220-equator-crop-before-after.png` at native resolution myself. Both
  panels (before | after, split by the red divider) show a similar thin diagonal grey/black
  silhouette; I could **not** independently confirm the impl's described "kink/elbow" vs. "smoother
  curve" distinction at this specific crop — which matches what the impl report itself already
  disclosed ("I did not find an isolated black ruling tip sitting clearly outside the grey line at
  this specific crop location... the crop is offered as qualitative corroboration"). Not a false
  claim, just a weak one, honestly flagged as weak by its own author.
- Looked at `live-app-ellipsoid-hatch-d220.png`: the object renders correctly through the real app
  (v1.4.2, sidebar/toolbar/canvas all normal, no visible console-adjacent artifacts in the capture).
  At this zoom level ruling ends read as flush with the border; **no visible kink or double line** —
  consistent with the impl's own disclosure that the ~0.22 mm defect is below what a normal-zoom
  canvas screenshot can resolve, and that the offline raster (not this screenshot) is the real
  instrument.
- All 10 named evidence cells verified present on disk (`shots/A/*.webp` ×9, `shots/B/*.webp` ×1).

## Verdict: REJECT

**The mechanism is sound and every one of its own claims independently reproduces to the digit**
(§1–4, §6): RED/GREEN/mutation proof is real, the diff is scoped exactly as planned, both disclosed
re-pins are correctly proven and correctly scoped, the byte-identity and per-primitive overshoot
numbers reproduce exactly under my own re-run of the planner's instrument, and the cross-object/
perf claims reproduce within measurement noise. If the guard sweep in §5 had also been complete,
this would be an unqualified ACCEPT.

**It is a REJECT, not ACCEPT-WITH-FOLLOWUPS, because the tree proposed for merge is not actually
green.** `scene3d-facet-min-rulings.test.js` (12 failures), `scene3d-box-density-bearing.test.js`
(≥1, likely 2), and `scene3d-mktick-wedge.test.js` (8 failures) are RED right now, on `76a77f22`,
for a reason that is legitimate and easy to fix (they need exactly the same treatment as the two
already-disclosed re-pins) — but they were not run, not disclosed, and are not fixed. Shipping this
as-is would merge a commit with 21+ known-red tests under a report that claims a clean guard sweep.

**To convert to ACCEPT:** re-pin the `sphere` (and `cone`, in `mktick-wedge`) goldens in these three
files with the same before/after proof discipline already used for the two existing re-pins (RED at
base sha reproduced, GREEN with the fix, the geometric reason stated, `## Bars changed` updated in
both the impl report and the commit body), then re-run all three to confirm no further breakage,
and grep once more across the full `tests/` tree for any remaining pinned-hash file over a curved
primitive that neither the plan nor this review caught. Everything else in this unit — the fix
itself, the new oracle, the two re-pins already made, the evidence — needs no rework.
