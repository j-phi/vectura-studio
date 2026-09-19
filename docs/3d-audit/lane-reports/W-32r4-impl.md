STATUS: DONE/FU

# W-32 Rank 4 — refine the fill BORDER to the true silhouette (implementer report)

**Lane:** border-4 · **Worktree:** `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/border-4`
**Branch:** `3d-scene/border-4` · **Port:** 8470 · **Base sha:** `b43fa4e3` (v1.4.2)
**Checkpoint (unverified, orchestrator-made after a rate-limit kill):** `e47afc16`
**Final commit:** see below, on top of `e47afc16`, no amend.

This run was interrupted once by a rate limit while the Tier-1 `scene3d-tone-law-collapse.test.js`
guard was running in the background. The orchestrator checkpointed the dirty tree as `e47afc16` and
resumed me. Per the resume instructions I re-verified that checkpoint (re-ran the new oracle file
and both re-pinned guard files — 420/420 green, byte-for-byte the same as before the kill) before
continuing, and re-measured the perspective-camera and two-sphere-occluder numbers from scratch
(§3.7 and §3.5 below) rather than trusting pre-kill notes. Everything reproduced identically.

## Summary

The plan's finding held under independent re-measurement: the fill was already correct (≤0.01 pen
of the TRUE analytic silhouette on every cell); the DRAWN outline — the projected mesh silhouette, a
chord polygon inscribed in the true one — fell short by up to 0.72 pen (ellipsoid), which is what
Jay saw as ruling ends breaking out past the grey border. Shipped Rank 1: the silhouette/boundary
edge chain is refined onto the analytic silhouette (`F=0 ∧ ∇F·v=0`, Newton, reusing
`sliceSurfaceFG`), gated to convex charted primitives. Worst overshoot **0.72 → 0.02 pen** (my
own measured worst on `create·med` is actually ≤0.02, matching the plan); **111 endpoints over the
0.5-pen bar → 0**; fill ink **byte-identical** (0.000% on every cell, confirmed by md5 at 9dp);
**48/48 faceted/unsupported cells byte-identical**; **torus excluded** (non-convex — a refined point
leaves the tessellated hull and is cut by the object's own occluder faces, confirmed by reproducing
the RED on both contiguity guards with the gate open and green again with it closed).

**One deliberate improvement over the plan's own prototype:** the prototype computed the local view
direction `v` ONCE per record (exact for orthographic, only ~10% corrected for perspective per the
plan's own §3.7 measurement). I implemented the REQUIRED shipped behaviour from §3.7 — `v` derived
PER REFINED POINT — from the start (not as an afterthought), and re-measured camera `p`
(perspective) after: the sphere/ellipsoid/cone/capsule perspective overshoot, which the plan's own
prototype only partially fixed, is now **fully corrected** (see the perspective table below). This
also means my `curvedOverlap-perspective-mixed-xray` fingerprint hashes differ from the ones printed
in the plan (which came from the once-per-record prototype) — the `pointCount` for the SETTLED row
matches the plan's prediction exactly (1760), which is strong independent confirmation the mechanism
is the same, just more accurate under perspective.

## Files touched

- `src/core/algorithms/scene3d.js` — the four sites in `rank1-prototype.diff`, faithfully
  reimplemented with the §3.7 per-point view-direction correction (not the once-per-record
  version in the diff): `silhouetteProjectLocal` + `SIL_NEWTON_ITERS` + `SIL_PROTO_ON()` near
  `sliceAnalyticProjectLocal` (~line 665-728); the per-record `silRefine` closure after
  `Edges.classifyEdges(record, {})` (~line 3928, includes a test-only
  `window.__SIL_PROTO_TORUS_ON` override at the convexity gate, used only by this unit's O5
  mutation proof — never set by production code); the 3-line change at the clip call
  (`clipper.clipPath(refinedPts || [a, b], …)`).
- `tests/unit/scene3d-fill-silhouette-overshoot.test.js` — **new**, the RED oracle (O1-O5 below).
- `tests/unit/scene3d-hlr-spatial-index-identity.test.js` — re-pin, disclosed under `## Bars
  changed`.
- `tests/unit/scene3d-curves.test.js` — re-pin (stale assertion rewritten), disclosed under
  `## Bars changed`.
- `CHANGELOG.md`, `plans.md` — documentation contract (rendering-output change; `README.md`'s
  Release Notes section only carries CUT/shipped versions per its own convention
  (`CHANGELOG.md`'s `Unreleased` section is where in-flight work belongs until a version is cut),
  so I left it untouched rather than writing a note under the already-shipped "### 1.4.2" heading).
- `docs/3d-audit/fill-audit/after/W-32r4/` (in MAIN, not the worktree) — `report.json`, evidence
  shots, two crop images.

## RED, reproduced from a scratch `git archive` export

`mkdir -p /private/tmp/claude-501/scratch-W32r4-red && git -C <worktree> archive b43fa4e3 | tar -x -C …`,
`node_modules` symlinked from MAIN. New oracle file copied in, run there (base sha, unpatched):

**45 failed / 356 passed / 401 total** (foreground, default pool):
- 23× O1 (create rig) — worst `ellipsoid·hatch·a·d220` 0.2172 mm (0.72 pen), matches plan.
- 20× O2 (addLayer rig) — worst `sphere/ellipsoid` 0.15-0.155 mm, just over the 0.15 mm bar.
- 1× O5 mutation proof (torus-gate bypass) — RED because at base sha the gate doesn't exist yet,
  so "gate bypassed" and "gate in place" build identical geometry (no separation to detect).
- 1× O1 mutation proof (fix OFF vs ON at detail:8) — RED because with the fix OFF, both toggles
  are the same code (no fix exists), so "on" doesn't pass.

O3 (anti-cheat, true-silhouette overshoot) and O4 (fill immobility) were GREEN already at base sha
— exactly as the plan's oracle table predicts ("GREEN by construction").

## GREEN, on the patched worktree

Same file, same tree: **401/401 (later 420/420 once the two guard re-pins are counted in their own
files)**. Independently re-measured `create·med` worst-per-primitive with the planner's own
`measure.js` against my patched source (not copied from the plan): **ellipsoid 0.01, sphere 0.00,
cone 0.02, capsule 0.01, cylinder 0.00 pen** — reproduces the plan's own numbers to the hundredth.

## Perspective camera (§3.7) — re-measured after implementing the REQUIRED per-point fix

`create·med·contour`, camera `p` (`DEFAULT_CAMERA` + `projection:'perspective'`):

| primitive | before (pen) | after — THIS implementation (pen) | after — plan's own once-per-record prototype (pen, quoted from plan) |
|---|---|---|---|
| capsule | 0.09 | 0.00 | 0.01 |
| cone | 0.20 | 0.00 | 0.01 |
| cylinder | 0.00 | 0.00 | 0.00 |
| sphere | 0.19 | **-0.01** | 0.21 (barely moved) |
| ellipsoid | 0.21 | **-0.01** | 0.02 |

(Negative = worst end sits inside the drawn hull, i.e. zero overshoot.) The per-point view-direction
fix — required by the plan, not optional — measurably outperforms the plan's own once-per-record
prototype on this exact camera.

## Cross-object side effect (§3.5) — re-measured, `hlr.js` confirmed unnecessary

Two-sphere occluder scene (`occl.js`, adapted to point at this worktree), `create` rig, camera `a`,
mappers hatch/contour/crosshatch/spiral/contourSlice × density 50/220:

- Before: worst negative gap 0.00 pen (no cross-object intrusion at all pre-fix).
- After: worst negative gap **-0.39 pen**, medians **-0.07 to -0.13 pen**, **0 of the swept cuts**
  fall under -0.5 pen. Matches the plan's 0.39-pen-worst / 0.07-pen-median finding to two digits.

`hlr.js` was granted to this lane but is **confirmed unneeded and was not touched** — every
intruding ruling end sits well under the front object's own 0.3 mm stroke half-width (0.5 pen).

## Torus exclusion — measured, not assumed

With the `mode !== 'torus'` gate temporarily opened via the test-only `window.__SIL_PROTO_TORUS_ON`
override: `scene3d-silhouette-contiguity` → 5/6, `scene3d-border-contiguity` → 6/7 (dangling
endpoints 0 → 48/96/176 at detail 12/24/44) — reproducing the plan's RED. With the gate closed
(shipped state): both files back to 6/6 and 7/7, and O5's torus byte-identity checks (8/8 mappers)
are green. This is now also a **permanent, executable mutation proof** inside
`scene3d-fill-silhouette-overshoot.test.js` (O5's "bypassing the torus gate moves sceneEdge" test),
not just a one-off measurement — a reviewer can reproduce it by reading that test.

## The RED oracle shipped: `tests/unit/scene3d-fill-silhouette-overshoot.test.js`

- **O1** — overshoot past the DRAWN outline ≤ 0.15 mm (0.5 pen), `create` rig, 5 primitives ×
  4 mappers × 2 angles × 2 densities = 80 cases + 1 mutation proof.
- **O2** — same bar, `addLayer` rig, same sweep (the rig itself is the mutation per the plan).
- **O3** — anti-cheat: overshoot past the TRUE silhouette ≤ 0.05 mm, BOTH rigs, same sweep (160
  cases) + 1 documented-limitation test (an inward-clipped end would pass O1/O3 trivially — what
  rules that cheat out is O4's fill-immobility check, stated explicitly in the test).
- **O4** — `sceneFill` md5 (9dp) byte-identical with the fix ON vs OFF, 5 primitives × 4 mappers +
  1 mutation proof (perturb one fill point 0.001 mm → digest must change).
- **O5** — `sceneFill`+`sceneEdge` byte-identical on the excluded set: 6 faceted/unsupported
  primitives × 8 mappers (48 cells), torus × 8 mappers, the ground plane, + 1 mutation proof
  (bypass the torus gate → sceneEdge must move).

**Which half of Jay's complaint this gates, stated per binding rule 1:** "lines breaking out beyond
the border" is the DRAWN-outline overshoot (O1/O2). It says nothing about the OTHER half of the
same sentence read differently — rulings stopping short of the surface — which is
`scene3d-fill-boundary-ends.test.js`'s territory, read but never edited (still 41/41, before and
after). It also says nothing about raggedness/stair-stepping (W-35's own metric, which moves only
0.764 → 0.655 pen on `ellipsoid·spiral·a` — not closed by this unit, see Correction below).

**Mutation proofs, all executable in the shipped file, all reproduced by me:**
- O1: with the fix OFF, `detail:8` fails the bar by ≥3× (measured); with it ON, the same coarse
  mesh passes (the fix is analytic, so tessellation detail stops mattering — this correctly
  replaced my first draft of this mutation, which wrongly assumed detail:8 would still overshoot
  post-fix; it doesn't, because the fix has no dependency on mesh density).
- O4: perturbing one fill point by 0.001 mm changes the digest.
- O5: bypassing the torus gate (test-only flag) moves `sceneEdge`; not bypassing it does not.

`scene3d-fill-boundary-ends.test.js` — **read only, never edited.** Its own blind spot to W-32's
quantity is documented in the new file's header comment and is why 41/41 before AND after is not a
contradiction (four independent reasons, reproduced from the plan: chart-not-drawn-ink reference,
off-mask scores 0.00 = perfect, `TOL_MM=1.0` = 3.3 pen, `CELL=0.35` mm raster).

## Guards — every one run in the FOREGROUND, `timeout: 600000`, re-measured after the rate-limit
resume (not trusted from before the kill)

| file(s) | result |
|---|---|
| `scene3d-fill-boundary-ends` | 41/41 |
| `scene3d-silhouette-contiguity` | 6/6 |
| `scene3d-border-contiguity` | 7/7 |
| `scene3d-border` / `-offset` / `-offset-geometry` | 5/5, 7/7, 7/7 |
| `scene3d-hlr` | 11/11 |
| `scene3d-edge-styles` / `scene3d-object-edge-styles` | 8/8, 6/6 |
| `topoform-silhouette-plane-tracking` / `scene-delete-and-silhouette` | 5/5, 8/8 |
| `scene3d-shadows` / `scene3d-shadow-light-silhouette` | 18/18, 4/4 |
| `scene3d-mappers` | 32/32 |
| `scene3d-mark-laws-draw` | 30/30 |
| `scene3d-mkdashramp-dark-end` / `scene3d-insert-default-ink` | 4/4, 6/6 |
| `scene3d-ribbon-width-bar` / `scene3d-ribbon-width-create-rig` | 10/10, 12/12 |
| `scene3d-plot-safety` | 5 passed, 1 skipped (pre-existing) |
| `scene3d-hlr-spatial-index-identity` | **6/6 after the disclosed re-pin** (was 4/6) |
| `scene3d-curves` | **13/13 after the disclosed re-pin** (was 12/13) |
| `scene3d-shadow-anatomy` / `-receive` / `-tone-gradient` / `scene3d-cast-shadow-zones` / `scene3d-form-shadow-limb` | 77/79 (2 pre-existing skips) |
| `scene3d-tone-law-collapse` (Tier 1, singleFork) | **121/121** — backgrounded at the 600 s tool ceiling exactly as ROUND3-RESUME-BRIEFS §0b describes, read from the completion notification (757.5 s wall, exit 0) |
| `tests/integration/scene3d-fill-style-picker` | 177/177 |
| `test:visual` (all 6 files) | 99/112 total (13 pre-existing skips in `scene3d-tone-baseline`), no regressions |

Every count above was reproduced on the checkpointed tree AFTER the resume, not carried over from
memory of the pre-kill run.

**Pre-existing red at the base sha:** none observed in any file this unit runs (confirmed both
before writing the fix and again on the post-kill resume).

## `## Bars changed`

Two pinned values move, both disclosed here and in the commit body, neither deleted:

1. **`tests/unit/scene3d-hlr-spatial-index-identity.test.js:342-345`** — all FOUR curved-scenario
   rows move (not just `|settled`): `curvedOverlap-perspective-mixed-xray|settled`
   `{hash:'cf19f35d…230102', pathCount:424, pointCount:1500}` → `{hash:'24653523…c180645',
   pathCount:424, pointCount:1760}`; `|draft` `{hash:'82c40da7…fdb1924', pathCount:302,
   pointCount:604}` → `{hash:'3bfb9888…c9e984d369', pathCount:302, pointCount:773}`;
   `denseMixed-8obj-shadows|settled` `{hash:'38f2f85b…6a34f', pathCount:662, pointCount:2712}` →
   `{hash:'fe6516d1…efa86cd', pathCount:668, pointCount:3032}`; `|draft` `{hash:'8f4025c4…0cfc2f',
   pathCount:466, pointCount:932}` → `{hash:'fcfe9f21…60b8d28d5', pathCount:471, pointCount:1146}`.
   `facetedOverlap-orthographic-hatch` (box-only, no curved primitive) is **unchanged** — the proof
   the gate is scoped correctly. **Why:** both curved scenarios carry sphere/cylinder/cone
   (`curvedOverlap`) or those plus a torus (`denseMixed`), all under the scene's default `hatch`
   mapper, so their outline vertices/chords legitimately move. `curvedOverlap`'s pathCount is
   UNCHANGED at 424/302 (settled/draft) — only point density rises, my own re-derived proof that
   nothing was added/dropped/split there. `denseMixed`'s pathCount rises by a small amount
   (662→668 settled, +6; 466→471 draft, +5, both <1.5%) — a few previously-collinear-merged edge
   chains in this 8-object scene no longer weld once refined, which I verified is not a contiguity
   defect: `scene3d-silhouette-contiguity` 6/6 and `scene3d-border-contiguity` 7/7 both still pass,
   and the shadow guards (18/18, 4/4) — shadows ride FACES not edges — are unaffected. I disclose
   this pathCount move explicitly because the plan's own text only asserted pathCount-invariance
   for `curvedOverlap`, not for `denseMixed`, and I did not want a silent broadening of that claim.
   I also note my hash values legitimately differ from the plan's own printed prototype values
   (`02a2b223…242e56` etc.) because I implemented the §3.7-required per-point view direction, not
   the once-per-record prototype the plan quoted — this is a DIFFERENT, MORE ACCURATE geometry, not
   a discrepancy to be reconciled. Draft rows move because the structural edge pass that refines the
   outline is not gated by `bounds.fastPreview` (only fill density is) — draft-mode silhouettes get
   the same correction, which is intended, not a leak (`sceneFill` immobility is proven separately
   by this unit's own O4/O5 oracle).
2. **`tests/unit/scene3d-curves.test.js:135-143`** — STALE ASSERTION, rewritten, not deleted. The
   test named "RED: with Curves OFF the capsule silhouette is unsmoothable 2-point sticks" asserted
   `edges.every(p => p.length === 2)` and `edges.every(p => p.meta.straight === true)`. A refined
   silhouette/boundary edge is now legitimately a short polyline (not a 2-point chord) and correctly
   drops `meta.straight` — the same rule `emitBorderChains` already applies to a stitched strip. The
   test's actual PURPOSE — "Curves OFF must not smooth the silhouette into a fitted curve" — is kept
   intact via `curvedPaths(edges).length === 0`, which passed before this unit and still passes
   after it (a refined polyline carries no `anchors` with `in`/`out` handles, so it is not what
   `curvedPaths()` detects). Renamed to describe what it now actually asserts. The other 12 tests in
   the file, including "Curves ON chains the capsule silhouette into real curved runs" and the three
   never-curved gates (box/solid/plane), are unaffected and still pass.

No tolerance was widened. No population or fixture of an existing assertion was narrowed. The O1-O5
bars in the new file are new bars in a new file (O1/O2's 0.15 mm is W-32's own 0.5-pen bar restated
at its source; O3's 0.05 mm is W-32 §A5's O3 carried forward verbatim).

## Evidence

Captured from MAIN via `scripts/audit/scene3d-capture.js --root <worktree> --port 8470`, all 10
named cells verified present in `manifest.A.1-1.jsonl` / `manifest.B.1-5.jsonl` before naming them:
`ellipsoid__{contour,crosshatch,spiral,hatch}__ladder__{med,max}__a`, `sphere__{contour,hatch}
__ladder__med__a`, `capsule__contour__ladder__med__a`, `cylinder__contour__ladder__med__a`,
`torus__contour__ladder__med__a` (Tier A, all 9), `cone__crosshatch__ladder__med__a` (Tier B).
`torus__contour__ladder__med__a` is the byte-identical control — expected and correct, disclosed
in `identical_exceptions` in `report.json`.

**Native-resolution crop, LOOKED AT IT:** `ellipsoid-hatch-d220-equator-crop-before-after.png` —
an offline raster (grey=sceneEdge, black=sceneFill, 0.3 mm strokes, 96 px/mm, 4× nearest-neighbour
magnification, same precedent/disclosure as W-35/W-35b's own planning images) of
`ellipsoid·hatch·create·a·d220` (osDrawn 0.2172 mm/0.72 pen, 8 ends over the bar BEFORE; 0.0026 mm/
0.01 pen, 0 ends over AFTER — re-measured by me). What I see: the BEFORE panel's grey outline has a
visible kink/elbow — a short straight segment meeting the next at an angle, the tessellated mesh
chord polygon's own vertex. The AFTER panel's grey outline at the same location is a smoother,
more continuously curving line without that elbow, consistent with the analytic-silhouette
refinement. I did not find an isolated black ruling tip sitting clearly outside the grey line at
this specific crop location (the 0.22 mm defect is at the resolution limit of a hand-picked crop
region; the numeric instrument, not eyeballing, is the primary proof of the overshoot itself — the
crop is offered as qualitative corroboration of the OUTLINE SHAPE change, which is visible).

**Live app screenshot:** `live-app-ellipsoid-hatch-d220.png` — the exact same cell built and
rendered through the REAL running app (`window.app.engine` + `window.app.renderer.draw()`,
Playwright, localhost:8470, `APP_VERSION` confirmed 1.4.2) rather than the jsdom test harness or an
offline raster. No console or page errors. The object renders correctly at normal zoom; the
sub-0.22 mm defect is below what a browser canvas screenshot at normal zoom can resolve (the reason
W-35/W-35b relied on the offline raster for the fine-grained visual, which I followed).

## Deviation from the plan's literal prototype — disclosed

The plan's `rank1-prototype.diff` computes the local view direction `v` ONCE per record (at
`record.world[0]`) and its own §3.7 measurement shows this only partially corrects the perspective
camera (sphere barely moved, 0.19→0.21 pen). §3.7 states this correction is **REQUIRED in the
shipped version, not optional**, and instructs the implementer to derive `v` per refined point and
re-measure. I implemented the per-point version from the start rather than shipping the
once-per-record prototype and patching it — same mechanism, same four sites, same gating, just
`viewDirLocalAt(worldPoint)` called per vertex and per subdivided interior point instead of once
per record. This is why: (a) my HLR-spatial-index-identity hashes differ from the plan's own quoted
prototype hashes (correctly — see `## Bars changed` above), and (b) the perspective camera is fully
corrected in this implementation where the plan's own prototype only partially corrected it (see
the perspective table above).

## Stop conditions — all checked, none tripped

1. `sceneFill` moved by a digit — NO (0.000% on 132/132, O4).
2. O3 (true-silhouette overshoot) rose — NO (stays ≤0.01 pen).
3. `scene3d-fill-boundary-ends` needed touching — NO (read-only, 41/41).
4. Torus un-gated without its own RED — NOT DONE (gated; RED reproduced and disclosed).
5. Any faceted/unsupported primitive changed — NO (48/48 byte-identical).
6. Perspective correction skipped — NOT SKIPPED (implemented stronger than required, re-measured).
7. Stop-and-report needed — no; every bar was met honestly.

## Follow-ups filed, not attempted (per the plan)

- **FU-1 → Rank 2, the torus** (non-convex silhouette refinement via the W-27c
  `SELF_OCCLUDE_BIAS` precedent).
- **FU-2 → W-35b's spiral alternation** (its own FU-2) survives this fix: `ellipsoid·spiral·a`
  stair-step p90 moves only 0.764 → 0.655 pen. **Not closed by this unit** — say so at merge,
  correcting the record's earlier claim that Rank 4 "would also satisfy W-35."
- **FU-3 → wireframe crease junctions** — a vertex shared between a refined silhouette edge and an
  unrefined crease edge can move by up to 0.22 mm under a wireframe mapper specifically (creases
  are suppressed everywhere else). `scene3d-edge-styles` 8/8 and `scene3d-object-edge-styles` 6/6
  do not see it (neither exercises wireframe + this exact junction). Not measured further in this
  unit; flagged per the plan's instruction not to leave it unnamed.

## Not attempted / out of scope

`hlr.js` was granted to this lane but confirmed unnecessary by measurement (§3.5) and was not
touched. `surface-fill.js`, `surface-fill-mono.js`, `mappers.js`, the contourSlice pass, and the
fill emit block were never opened, per the plan's forbidden list.

---

## W-32r4c re-pins

**Follow-up to the REJECT verdict in `W-32r4-review.md`.** The reviewer independently reproduced
every claim of the original unit (mechanism, RED/GREEN, mutation proof, scope, the two disclosed
re-pins, byte-identity, cross-object/perf numbers) and found them all correct — the REJECT was
solely because three pinned-hash guard files, over curved primitives, were never run and were RED
on `76a77f22` with zero disclosure. This section fixes exactly that.

**Base for this follow-up:** lane HEAD at start, `fe5d67bf` (W-32r4b, which repaired
`scene3d-fill-boundary-ends.test.js`'s off-mask blind leg — **not touched here**, per the
coordinator's instruction; re-run read-only below and confirmed still 49/49 green with these
re-pins in place). Never stashed, never reset.

### Step 1 — grep the full `tests/` tree for pinned-hash/golden files over a curved primitive

Two targeted greps: (a) every file requiring `tests/helpers/path-signature.js`, (b) every file
containing a `toBe('<long hex string>')`/`EXPECTED`-map style pinned literal, both intersected
against files mentioning `sphere`/`cone`/`cylinder`/`ellipsoid`/`capsule`. Candidates not already
covered by the original unit's own guard table or the review's "Clean" list were run:
`scene3d-curved-density-sparse-end`, `scene3d-area-light-shadow-softening`,
`scene3d-ribbon-f1b-streaks`, `scene3d-ribbon-f6-self-occlusion`, `scene3d-ribbon-f7-self-occlusion`,
`scene3d-ribbon-flat-field-placement`, `scene3d-shadow-footprint-{direction,torus-hole-accuracy,
torus-thin-blank,torus-visibility,wiring}`, `scene3d-shadow-receive-lighttypes` — **all 12 files,
142/142 tests, GREEN, no further breakage found.** Combined with the review's own already-reproduced
"Clean" list (`scene3d-contour-slice` 67/67, `scene3d-slice-end-overlap` 30/30 — re-run here myself,
30/30 — `scene3d-appdefault-facet-fill`+`-lit-floor` 11+1skip, `scene3d-mkdashramp-low-end` 13/13,
`vectura-geometry-algorithms` 33/33, all re-run here myself in the same batch: **9 files, 273 passed
+ 1 pre-existing skip = 274**), the three the review found (below), and everything in the original
unit's own guard table, this is now the complete pinned-hash/golden sweep for this unit.

### Step 2 — the three broken files, re-pinned with proof

For each: OLD golden reproduced GREEN on a scratch `git archive b43fa4e3` export, and RED on a
scratch `git archive 76a77f22` export (both created fresh for this follow-up, `node_modules`
symlinked from MAIN, never via stash/reset in the worktree) — **21 failed / 120 passed / 141 total
combined on the `76a77f22` export, exactly matching the review's per-file counts (12 + 1 + 8).**
New golden computed by a probe script replicating each file's own `buildScene`/`scene`/`renderCell`
helper verbatim (not hand-typed), then substituted in with a `## Bars changed`-style comment.

1. **`tests/unit/scene3d-facet-min-rulings.test.js` — T1's `EXPECTED_T1` map, 12 `sphere` entries.**
   Geometric reason: `pathSignature`/`md5PathsAll` hash the object's WHOLE scenePaths output
   (fill + edge together); T1 builds `sphere` via `engine.addLayer('scene3d')` +
   `buildPrimitiveParams`, and this unit's structural-edge-pass refinement moves sphere's own
   `sceneEdge` ink. `box`/`solid`/`pyramid`/`plane` entries are UNCHANGED (independently
   re-derived, byte-identical to the currently-pinned values) — proof the move is scoped to the
   one curved primitive in the set, exactly as this unit claims. Re-ran the file's own T10 mutation
   guard ("forcing the floor back to the bare literal breaks T2/T3") after the re-pin: still passes
   (non-vacuous). **79/79 green after the re-pin** (was 67/79).
2. **`tests/unit/scene3d-box-density-bearing.test.js` — the `BYTE-IDENTITY GUARD` test's two
   `sphere` fingerprint lines.** Same geometric reason (the file's own `fingerprint()` hashes every
   `scenePaths` entry). `box`/`solid`/`plane` fingerprints (10 assertions in the same test) are
   independently re-derived and confirmed UNCHANGED. **4/4 green after the re-pin** (was 3/4 — the
   single test throws on its first failing `expect`, so `d=150`'s stale value was masked until now;
   both `d=50` and `d=150` are re-pinned together). This file ships NO source fix (it is a
   measurement-only guard per its own header) — the re-pin is purely test-side.
3. **`tests/unit/scene3d-mktick-wedge.test.js` — the `EXPECTED_SIGNATURE` map's `sphere`/`cone`
   entries, both rigs, both mappers (8 of 12 cells).** Same geometric reason. **The `torus/*` four
   entries are independently re-derived and confirmed BYTE-IDENTICAL, left unedited** — the
   strongest in-file proof available that the torus-exclusion gate (§torus_exclusion above) holds
   even on this file's own fixture, not just on the ones this unit's own oracle checks. **58/58
   green after the re-pin** (was 50/58).

### `## Bars changed` (W-32r4c, additive to the original unit's two disclosed re-pins)

- **`tests/unit/scene3d-facet-min-rulings.test.js:142-155`** (12 `sphere|*` entries in
  `EXPECTED_T1`) — old values (see git history) → new values computed against `3d-scene/border-4`
  HEAD by a probe replicating `buildScene()` verbatim. Why: T1's pinned fingerprint hashes the
  sphere's whole output including edge ink, which this unit legitimately moves; `box`/`solid`/
  `pyramid`/`plane` are confirmed unmoved.
- **`tests/unit/scene3d-box-density-bearing.test.js`** (the `BYTE-IDENTITY GUARD` test's
  `fingerprint(50, 'sphere')` and `fingerprint(150, 'sphere')` lines) — old `6c237f90:23012` /
  `3dc1b467:55668` → new `56fa048b:29028` / `5ea7a962:61684`. Why: same as above; `box`/`solid`/
  `plane` fingerprints in the same test are confirmed unmoved.
- **`tests/unit/scene3d-mktick-wedge.test.js`** (`EXPECTED_SIGNATURE`, 8 of 12 entries: `sphere` and
  `cone`, both rigs, both mappers) — old values (see git history) → new values computed against
  `3d-scene/border-4` HEAD by a probe replicating `renderCell()`/`buildSceneParams()` verbatim. Why:
  same mechanism; the 4 `torus/*` entries are confirmed unmoved (torus is gated out of this unit's
  refinement), which is itself part of the proof.

No tolerance was widened in any of the three files. No population/fixture of an existing assertion
was narrowed — every re-pin is a literal-value update to match a legitimately-moved fingerprint,
with the unmoved control values (faceted primitives, or torus) in the same file/test confirmed
unchanged alongside it.

### Step 3 — full guard roster re-run, all counts

| file | result |
|---|---|
| `scene3d-fill-silhouette-overshoot` (this unit's own oracle) | 401/401 |
| `scene3d-hlr-spatial-index-identity` (original re-pin) | 6/6 |
| `scene3d-curves` (original re-pin) | 13/13 |
| `scene3d-fill-boundary-ends` (W-32r4b's file — **read-only, not touched**) | 49/49 |
| `scene3d-facet-min-rulings` (W-32r4c re-pin) | 79/79 |
| `scene3d-box-density-bearing` (W-32r4c re-pin) | 4/4 |
| `scene3d-mktick-wedge` (W-32r4c re-pin) | 58/58 |
| `scene3d-curved-density-sparse-end` | part of the 12-file/142-test batch, all green |
| `scene3d-area-light-shadow-softening` | ″ |
| `scene3d-ribbon-f1b-streaks` | ″ (44/44) |
| `scene3d-ribbon-f6-self-occlusion` | ″ |
| `scene3d-ribbon-f7-self-occlusion` | ″ |
| `scene3d-ribbon-flat-field-placement` | ″ (22/22) |
| `scene3d-shadow-footprint-direction` | ″ |
| `scene3d-shadow-footprint-torus-hole-accuracy` | ″ |
| `scene3d-shadow-footprint-torus-thin-blank` | ″ |
| `scene3d-shadow-footprint-torus-visibility` | ″ |
| `scene3d-shadow-footprint-wiring` | ″ |
| `scene3d-shadow-receive-lighttypes` | ″ (also in the 9-file batch below, 8/8) |
| `scene3d-appdefault-facet-fill` | 9-file batch, all green |
| `scene3d-appdefault-lit-floor` | ″ (1 pre-existing skip) |
| `scene3d-contour-slice` | ″ (67/67) |
| `scene3d-mkdashramp-low-end` | ″ (13/13) |
| `vectura-geometry-algorithms` | ″ (33/33) |
| `scene3d-slice-end-overlap` | 30/30 (run separately) |

**Total newly-run-or-re-confirmed this follow-up: 21 files, 273 + 1 skip (9-file batch) + 142
(12-file batch) + 30 (slice-end-overlap) + 401 (oracle) + 420 (oracle+2 original re-pins, includes
the 401 again as a fresh confirmation) + 79 + 4 + 58 (three W-32r4c re-pins) + 49
(fill-boundary-ends, read-only) — every one GREEN, zero red tests remaining on this tree.**

### Live verification

Not re-done for this follow-up — it is a pure test-re-pin change (no `src/` file touched), and the
original unit's live-app verification (`live-app-ellipsoid-hatch-d220.png`, §Evidence above, zero
console/page errors) already covers the only rendering path these three files exercise
(`engine.addLayer('scene3d')` + `computeAllDisplayGeometry()`, the same entry point).

### Commit

One follow-up commit on `border-4`, on top of `fe5d67bf` (W-32r4b), touching only the three test
files. `CHANGELOG.md`/`plans.md` are unchanged (the fix and its user-facing description are
unchanged; this follow-up is guard-repair only). Never pushed.
