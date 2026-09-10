STATUS: DONE

# W-30d impl — shadow projector F2a (torus caster hull HOLE accuracy) + thin-torus blank-void fix

Lane: fill-collapse-2. Worktree: `.claude/worktrees/fill-collapse-2` (branch `3d-scene/fill-collapse-2`).
Base sha: `2d931b1a` (U8, this lane's HEAD at the W-30d briefing). New sha: `9aad87b8`
(`83d1e021` F2a, `54816268` thin-torus blank-void fix, `9aad87b8` evidence script).
Port 8482 (own dev server, used only for evidence capture — foreground, killed on exit).
No push, no merge, no version bump (hook cannot fire in a worktree; verified
`package.json`/`version.js`/`index.html` byte-unchanged `2d931b1a..HEAD`, and identical
across both `git archive` scratch exports used for pins).

`git status --short -- . ':!graphify-out'` clean before starting and after every commit.
`git stash list` showed only pre-existing unrelated agent-worktree stashes (untouched).
Read first, per the brief: `AGENT-PROTOCOL.md`, `W-30c-plan.md` (F2a section), `W-30c-impl.md`
(why F2a was parked), `W-30c-review.md` (the thin-torus blank-void finding, "secretary flag 1"),
`W-30b-review.md` condition 5, Unit D reports (phase-lock 9.8e-15, density 3.0x). `shadows.js`
was byte-untouched by W-30c/handoff-c this round — verified clean before editing it here.

## Scope

Two defects, two commits, matching the brief exactly:

1. **F2a (R2)** — `casterSilhouetteLoops`'s hardcoded `y=0` bail (shadows.js, parked at W-30c's
   own stop condition) generalized to the receiving plane's own anchor/normal, so a holed caster
   (a torus) projects its real hole into `buildFaceFootprint`'s flat-face shadow-receive path,
   not just `build()`'s ground-shadow path.
2. **Thin-torus blank-void** — the W-30c reviewer's finding that F2b's "emit no inside pass when
   no occluded sample is found" fallback can leave a genuine shadow entirely blank on a thin
   torus. Fixed as a follow-on to F2a's own restructuring (the fallback now walks a graded, not
   fixed, set of inward fractions).

## Commit 1 — F2a (R2): torus hull HOLE preserved · `83d1e021`

### Design

**`src/core/scene3d/shadows.js`:**
- New `planeSignedDist(P, anchor, normal)` helper. `GROUND_ANCHOR`/`GROUND_NORMAL` constants
  reproduce the old hardcoded ground plane exactly.
- `casterHull`/`casterSilhouetteLoops` generalized to accept optional `planeAnchor`/`planeNormal`
  (default = ground), replacing the raw `P.y` check with `planeSignedDist(...) < -1e-6`. With the
  defaults, `planeSignedDist(P, {0,0,0}, {0,1,0}) === P.y` exactly — `build()`'s existing call
  sites pass no plane args, so this is byte-identical for the ground-shadow path (confirmed:
  `scene3d-shadows.test.js` 18/18 unchanged, including the I25 annular-ground-shadow test).
- `lightFaceSign`/`lightClassifyEdges` — previously private closures inside `build()`, closing
  over its own `positional`/`lightPosition`/`lightDir` locals — hoisted to module scope as
  `lightFaceSignFor`/`lightClassifyEdgesFor`, parameterized by a `ctx` object. `build()` itself
  now builds `lightCtx0` from its own locals and calls the hoisted functions through it — same
  values, same call signature, so `build()`'s own behavior is unchanged by construction (not just
  by assertion — confirmed via `scene3d-shadows.test.js` and `scene3d-shadow-footprint-
  direction.test.js`, both fully green).
- New export `Shadows.footprintRings(record, projectVertex, light, planeAnchor, planeNormal,
  fallbackDir)`: builds a light ctx from `light`/`fallbackDir` (mirroring `projectLightToPlane`'s
  own positional detection, kept independent since the caller's `projectVertex` already encodes
  the actual projection), calls `casterSilhouetteLoops`. **Key design decision beyond the plan's
  own sketch**: only uses the TRUE silhouette rings when it finds **more than one loop** (a
  genuine hole); a single loop (or none) falls through to the plain `casterHull` result. Reason,
  found empirically (see "What broke" below): a mesh commonly stores a duplicate copy of "the
  same" world corner once per adjacent face, and the hull's sort-based vertex selection can pick
  a different (1-ULP-different) copy of that corner than the silhouette loop's edge-chain-based
  selection, even though the polygon SHAPE is identical — so using the loop unconditionally for a
  convex caster breaks byte-identity at the 14th decimal digit. Using the hull unconditionally
  for the single-loop case sidesteps this entirely and keeps every convex caster's footprint
  bit-identical to before this fix, while a genuine multi-loop hole (which the hull cannot
  represent regardless) always uses the true rings.

**`src/core/algorithms/scene3d.js` (`buildFaceFootprint`, ~:1411-1470, and the outside/inside hatch
pass, ~:2522-2605):**
- `buildFaceFootprint` now calls `Shadows.footprintRings` per other object instead of building one
  `Shadows.convexHull` ring; each returned ring is clipped individually to the face, and the
  surviving clipped rings are collected as a **GROUP** (array) — `footprintPolys` is now an array
  of groups (one per other object), not a flat array of rings. Falls back to the old
  convexHull-only single-ring-group construction if `Shadows.footprintRings` is absent (defensive).
- Outside pass: `outsideRings = [asCCW(scaf.uv)].concat(...footprintPolys)` — spreads every
  group's rings into one flat even-odd call, unchanged mechanism, now hole-aware by construction
  (an inner ring re-admits the outside pitch inside a hole).
- Inside pass: `footprintPolys.forEach((group) => ...)` now hatches each **GROUP together**
  (`Shadows.hatchRingsEvenOdd(group, ...)`), not each ring independently — this is what actually
  re-opens the hole in the shadowed pass too, not just the unshadowed one. Centroid/occlusion-gate
  logic unchanged in kind (per-group instead of per-ring), `firstOccludedSample` restructured to
  walk every ring in the group (not just one).

### What broke first, and the fix

My first pass used the true silhouette loop unconditionally whenever it existed (not gated on
`loops.length > 1`). `scene3d-shadow-footprint-wiring.test.js`'s directional-light md5
byte-identity guard (a BOX caster) failed — diffing the two trees' emitted paths found the first
divergence was a floating-point value differing in the 14th significant digit
(`194.14256644935054` vs `...48`), traced to the silhouette loop's own vertex objects being a
different (but geometrically identical) copy of a shared mesh corner than the hull's. Fixed by
gating `footprintRings`'s use of the true loops on `loops.length > 1` (see design above) — reran
the guard, 5/5 green, byte-identical confirmed.

Second: the W-30c torus-visibility test's own "current tree" assertions (probing the footprint
CENTROID, which — per that unit's own R3 finding — lands IN the torus's real hole) now correctly
read as UNSHADOWED post-F2a, where they read shadowed (ratio 2.869/3.021, matching W-30c-impl.md's
own numbers) under F2b alone. This is the intentional, disclosed R2 fix working as designed, not a
regression — see "Stale-assertion update" below.

### RED/GREEN (new file `tests/unit/scene3d-shadow-footprint-torus-hole-accuracy.test.js`, 6/6)

Rig: torus `sx=40/sy=12/sz=40` at `(60,30,0)`, 500mm plane receiver, `shadowReceiveOnObjects: true`
(the exact W-30c rig). Probe = the footprint's own measured centroid (directional `-4.34,0`; point
`150.07,0`), reused verbatim from `scene3d-shadow-footprint-torus-visibility.test.js`, not
re-derived.

| | directional | point |
|---|---|---|
| RED @ `2d931b1a` (hole over-covered, bar `>= 1.3`) | **2.869** | **3.021** |
| GREEN @ current (hole correctly unshadowed, bar `< 1.3`) | **0.916** | **1.000** |
| Solid annulus band still genuinely shadowed (max-scan bar `>= 1.5`) | **2.669** | **2.741** |

RED reproduced independently via `VECTURA_PRE_W30D_HOLE=1 npx vitest run
tests/unit/scene3d-shadow-footprint-torus-hole-accuracy.test.js` — the two pinned assertions fail
at exactly 2.869/3.021 as documented in the file, matching W-30c-impl.md's own GREEN-for-F2b
numbers to the full float. Convex-caster invariance verified by pixel diff, not just test count:
`PIL.ImageChops.difference` on all four `hole-{sphere,box}-{point,directional}-{before,after}.png`
evidence PNGs → `bbox: None`, zero differing pixels, in every case (see Evidence).

## Commit 2 — thin-torus blank-void fix · `54816268`

### Root cause, confirmed by instrumentation before fixing

Reproduced the review's finding on the actual (now-annular) F2a geometry, not just the old
hull-based one: `firstOccludedSample` walked each ring vertex at a single **fixed fraction (0.9)**
of the way toward the group centroid. That fraction is relative to the RING RADIUS, not an
absolute distance. Empirically, the W-30c-review's own `sy=3`/`sy=1.5` repro (both floor-clamp to
the *same* 1mm tube radius in `topoTorus` — `Math.max(1, Math.min(sy,sz)*0.28)` — so they are
literally the same mesh) no longer blanks under F2a's true-ring representation alone (ratio ~1.94,
visible) — the extra candidate directions from searching both rings already helped. But scaling
the SAME floor-clamped 1mm tube radius against a much larger ring (`sx=100`→major 75mm, `sx=180`→
major 135mm) reproduces a genuine blank void: **ratio drops to ~1.054** (indistinguishable from
noise) at `sx=180`, confirmed via a max-density scan across the torus.

### Fix

`INWARD_FRACTIONS` widened from `[0.9]` to a graded series (`0.99, 0.97, 0.94, 0.9, 0.85, 0.78,
0.7, 0.6, 0.5, 0.35, 0.2`), tried at every ring vertex (outer and any hole rings) before giving up
— dense near the boundary, where a thin band's solid material actually is.

### RED/GREEN (new file `tests/unit/scene3d-shadow-footprint-torus-thin-blank.test.js`, 4/4)

Rig: torus `sx=180/sy=3/sz=180` (tube radius floor-clamped to 1mm against a 135mm ring radius — a
1:135 band) at `(60,30,0)`, same 500mm plane receiver, directional SUN.

| | razor-thin torus (bar `>= 1.8`) | regression guard: wide torus sy=12 (bar `>= 2.5`) |
|---|---|---|
| RED @ `83d1e021` (F2a done, single 0.9 fraction) | **1.054** (blank) | 2.914 (unaffected) |
| GREEN @ current (graded fractions) | **2.095** (visible) | 2.914 (unaffected) |

RED reproduced independently via `VECTURA_PRE_W30D_THIN=1 npx vitest run
tests/unit/scene3d-shadow-footprint-torus-thin-blank.test.js` — thin-torus assertion fails at
1.0536038817613673 vs the 1.8 bar; the regression guard still passes at 2.9139664548343926,
proving the blank-void bug was real specifically on the thin rig, not a general regression from
F2a.

## Guards (foreground, one file at a time)

| Suite | Result |
|---|---|
| `scene3d-shadow-footprint-torus-hole-accuracy.test.js` (new, W-30d) | 6/6 |
| `scene3d-shadow-footprint-torus-thin-blank.test.js` (new, W-30d) | 4/4 |
| `scene3d-shadow-footprint-torus-visibility.test.js` (W-30c, 2 assertions updated) | 4/4 |
| `scene3d-shadow-footprint-direction.test.js` (W-30) | 17/17 |
| `scene3d-shadow-footprint-wiring.test.js` (W-30b, directional md5 byte-identity) | 5/5 |
| `scene3d-shadow-receive.test.js` (Unit D — phase-lock, density bar) | 17/17 |
| `scene3d-shadows.test.js` (incl. I25 annular ground-shadow) | 18/18 |
| `scene3d-lighting.test.js` | 18/18 |
| `scene3d-hlr-spatial-index-identity.test.js` | 6/6 |
| `scene3d-ladder-uniform-field-spacing.test.js` | 9/9 |
| `scene3d-appdefault-facet-fill.test.js` | 7/7 |
| `scene3d-tone-law-collapse.test.js` (U0 48-law byte-identity sweep) | **87/87** |

U0's sweep took 671s under confirmed heavy shared-machine contention (a second concurrent vitest
session from another worktree agent observed live via `ps` throughout the run, plus this
worktree's own two-commit test runs) — it threw one benign `[vitest-worker]: Timeout calling
onTaskUpdate` RPC-heartbeat error under that contention (documented pre-existing hazard, matches
W-30c-impl.md's own account of the identical error) with **zero test failures** — not a
regression, and no tone-law cell moved.

Unit D's own bars (phase lock, density) and the Shadows/wiring/direction guards above all passed
unmodified — no tolerance was touched anywhere in either commit.

## Perf

Torus + 500mm plane receiver, directional light, `shadowReceiveOnObjects` toggled: 3 runs each,
flag OFF `176/148/137ms`, flag ON `139/131/129ms` — **ratio 0.866x** (flag ON measured FASTER here;
both numbers are small and noise-dominated at this scale, but there is no regression). Well inside
the plan's `<=1.10x` F2 budget.

## Byte-identity — verified, not asserted

- **Every convex caster (sphere/box), all 4 light types, through the real app render pipeline**
  (not just the unit oracle): `hole-{sphere,box}-{point,directional}-{before,after}.png` are
  **pixel-identical, 0 differing pixels** (`PIL.ImageChops.difference`, `bbox=None`).
- **`scene3d-shadow-footprint-wiring.test.js`'s directional-light md5 guard**: 5/5, confirming the
  loop-vs-hull 1-ULP hazard found and fixed above did not leak into the shipped behavior.
- **`build()`'s ground-shadow path**: `scene3d-shadows.test.js` 18/18 unchanged, including I25 (the
  ground path's own annular-shadow test) — the hoist changed nothing observable there.

## Evidence

`docs/3d-audit/fill-audit/after/W-30d/` (bespoke — `shadowReceiveOnObjects` is not exercised by any
manifest cell, per W-30c-plan.md §6 and re-confirmed). Two-server true before/after via
`scripts/w30d-shadows-evidence.js`: this worktree on 8482; two SEQUENTIAL `git archive` scratch
exports on 8483 (`2d931b1a` for the hole-fix set, `83d1e021` for the thin-torus set — both killed
before/after use).

- **`w30d-footprint-hole`** (sphere/box/torus x point/directional): **LOOKED at native-resolution
  crops.**
  - Sphere & box, both light types: `bbox: None`, 0 differing pixels — pixel-diff is the stronger
    proof, not separately re-described visually.
  - **Torus, directional** (`crop-hole-torus-dir-before.png` / `-after.png`, cropped to the diff
    bbox + 40px margin): BEFORE shows a dense, solid, roughly egg-shaped blob directly below the
    torus — no hole. AFTER shows a **clear, unambiguous ANNULUS — the exact same region now reads
    as an open ring with a visibly lighter (unshadowed) centre**, matching R2's fix precisely.
  - **Torus, point** (`crop-hole-torus-point-before.png` / `-after.png`): BEFORE shows a dense,
    solid wedge-shaped patch beside the ring. AFTER shows the same wedge with a visible partial
    thinning/gap where the hole projects — less crisp than the directional donut (the point
    light's off-axis perspective projects the hole as a more oblique, partially-overlapping shape
    against the wedge's own boundary), but a real, visible difference in the correct location,
    consistent with the measured density numbers (ratio 3.021 → 1.000 at the hole centroid).
- **`w30d-thin-torus`** (razor-thin rig, before/after): **LOOKED.** BEFORE
  (`crop-thin-torus-before.png`) shows the torus's own silhouette outline with uniform,
  unbroken diagonal hatching straight through the ground plane — no shadow anywhere, the blank
  void. AFTER (`crop-thin-torus-after.png`) shows a subtle but real change: short, denser dashed
  segments appear along the periphery near the ring (most visible zoomed into the bottom-right
  region, `crop-thin-torus-zoom-{before,after}.png`) where before the lines ran unbroken — a thin
  but genuine shadow band, consistent with the measured 1.054 → 2.095 density-ratio jump. The
  effect is visually subtle because the band itself is genuinely thin (a 1:135 tube-to-ring
  ratio) — this is the correct, physically-accurate outcome, not a rendering shortfall.

`window.Vectura.APP_VERSION` was not printed per-shot by this evidence script (an oversight
relative to the W-30c script's own convention); verified equivalently by direct `package.json`
inspection instead — all three trees (this worktree HEAD, and both `git archive` scratch exports
at `2d931b1a` and `83d1e021`) read **`1.3.99`**, confirming no version drift across the range (no
version bump fired in this worktree, as expected).

## Open follow-ups

None new. The pre-existing, already-disclosed items from W-30c stand unchanged by this unit:
`scene3d-hlr-spatial-index-identity.test.js`'s golden-hash re-verification once this branch
rebases past `1193cbe1` (cross-lane, pre-existing), and the "inside pass is single-sample" area-
light penumbra-visibility gap (W-30c's own follow-up, not touched here — this unit's fixes are
purely about the FOOTPRINT'S GEOMETRY, orthogonal to that gap).

## Bars changed

None in either commit. No existing numeric threshold, tolerance, or pinned fingerprint was
widened, narrowed, or re-pinned. Two pre-existing test-assertion DIRECTIONS were updated
(disclosed in full below) — not bar changes on a surviving oracle, but a documented consequence
of a behavior this unit intentionally and correctly changed.

## Stale-assertion update — `scene3d-shadow-footprint-torus-visibility.test.js` (W-30c's own file)

That file's two "current tree" torus assertions probed the footprint CENTROID specifically
because W-30c's own R3 finding was that this point lands in the torus's real hole (which is why
F2b had to search elsewhere for an occluded sample in the first place). F2a correctly un-shadows
that exact point now (R2's fix), so the assertion direction flips (`< 1.3`, was `>= 1.3`) —
documented in the file itself as an intentional, disclosed consequence of F2a
(W-30c-plan.md §4 F2: "Non-convex casters... will change, and must"), per CLAUDE.md's
stale-assertion rule, not a regression. Its RED-proof-pin block's two torus-specific mirror
assertions were **retired** (not silently deleted): under the OLD pin (`90f3411f`, pre-F2b) AND
the current tree, the probe now reads unshadowed for two DIFFERENT reasons — the original F2b bug
predates F2a, and F2a's own hole-fix post-dates it — so a single shared assertion can no longer
discriminate the two states, and re-pointing it at the current-tree truth would make it pass
trivially under the old pin too, ceasing to prove anything about F2b. This unit's own correctly-
pinned (`2d931b1a`) file (`scene3d-shadow-footprint-torus-hole-accuracy.test.js`) carries the
accurate RED/GREEN proof for what actually changed. The sphere control in that block is untouched
and still passes both before and after.

## Suggested CHANGELOG lines (docs contract — not applied to CHANGELOG.md, per the brief; for the
orchestrator to fold in at integration)

### Fixed
- **3D scene shadow receive: a non-convex caster's own HOLE (a torus's annulus) now correctly
  re-opens as unshadowed** in the flat-face shadow-receive footprint, instead of rendering
  as a solid shadow that over-covered the caster's own geometric hole
  (`src/core/scene3d/shadows.js`, `src/core/algorithms/scene3d.js`).
- **3D scene shadow receive: a razor-thin torus (a large ring, a very thin tube) no longer casts
  a blank (invisible) shadow** — the occlusion-sample search now checks a graded range of
  positions instead of one fixed fraction (`src/core/algorithms/scene3d.js`).

## Files touched

- `src/core/scene3d/shadows.js` (F2a: `planeSignedDist`, generalized `casterHull`/
  `casterSilhouetteLoops`, hoisted `lightFaceSignFor`/`lightClassifyEdgesFor`, new export
  `footprintRings`)
- `src/core/algorithms/scene3d.js` (F2a: group-based `buildFaceFootprint` + hatch passes;
  thin-torus fix: `INWARD_FRACTIONS` widened)
- `tests/unit/scene3d-shadow-footprint-torus-hole-accuracy.test.js` (new, F2a RGR)
- `tests/unit/scene3d-shadow-footprint-torus-thin-blank.test.js` (new, thin-torus RGR)
- `tests/unit/scene3d-shadow-footprint-torus-visibility.test.js` (W-30c's file — 2 assertions
  updated to the new contract, 2 stale RED-pin mirrors retired with justification)
- `scripts/w30d-shadows-evidence.js` (new, evidence capture)
- `docs/3d-audit/fill-audit/after/W-30d/*` (evidence, in MAIN, uncommitted per W-30c precedent)

Commits (in the worktree, not pushed): `83d1e021` (F2a), `54816268` (thin-torus blank-void fix),
`9aad87b8` (evidence script).

REPORT docs/3d-audit/lane-reports/W-30d-impl.md
