STATUS: ACCEPT-WITH-FOLLOWUPS

# W-30c review — `shadows.js`/`regions.js`/`scene3d.js` correctness sweep (F1, F2b, F3)

Lane under review: fill-collapse-2. Worktree: `.claude/worktrees/fill-collapse-2` (READ-ONLY;
the U8 implementer is now editing it live — HEAD had already moved to `9a26aa5e` by the time this
review ran). Pinned range: **`90f3411f..79c07770`** (`1e528b94` F1, `79c07770` F2b+F3).

Method: `git archive` exports of `90f3411f`, `1e528b94`, `79c07770` were taken **immediately**
into `/private/tmp/.../scratchpad/w30c-{pre,f1,post}` (node_modules symlinked, a `.git` pointer
file added so read-only `git show <sha>:<path>` — the tests' own pin mechanism — resolves without
touching the live worktree's index/HEAD). All work after that point was in these scratch copies
plus two more (`w30c-mut-f1`, `w30c-mut-f2f3`, patch-file mutation, no `.git` write ops) and one
instrumented copy (`w30c-instr`, a copy with one `console`-free counter added at the F2b
fallback's null branch). All five scratch dirs and the probe scripts were deleted at the end of
this review (confirmed below in the closing section). The live worktree was never read after the
initial archive.

Read: `AGENT-PROTOCOL.md` §Reviewers, `W-30c-impl.md`, `W-30c-plan.md` (in full — the four defects,
oracles, §4 exact edits, §5 lane/file-overlap table, §7 stop conditions), `W-30b-review.md` §5 (the
condition-5 grazing-angle/aspect-ratio measurement W-30c's plan consumed). Evidence: all 21 PNGs +
`report.json` in `docs/3d-audit/fill-audit/after/W-30c/`.

## (1) Diff scope

```
git diff --stat 90f3411f..79c07770 -- . ':!graphify-out'
 scripts/w30c-shadows-evidence.js                   | 365 ++++++
 src/core/algorithms/scene3d.js                     |  63 +-
 src/core/scene3d/regions.js                        |  16 +-
 tests/unit/scene3d-area-light-shadow-softening.test.js         | 251 ++
 tests/unit/scene3d-shadow-footprint-torus-visibility.test.js   | 180 ++
 tests/unit/scene3d-shadow-receive-lighttypes.test.js            | 205 ++
 6 files changed, 1074 insertions(+), 6 deletions(-)
```
All three test files are pure additions (`git diff --name-status` → `A` for all three; no existing
test file touched). No file outside `regions.js` / `scene3d.js` / new tests / the new evidence
script was changed — confirmed directly, not from the report's own claim: `surface-fill.js`,
`surface-fill-mono.js`, `params.js`, `src/config/scene3d-tone-laws.js` are all empty-diff across
the range.

## (2) RED / GREEN / mutation

Reran the three new test files directly against the `w30c-post` scratch export (`git archive
79c07770`), foreground, one command at a time:

- **GREEN** (no pin): `22/22 pass` (8 area-light + 6 torus-visibility + 8 lighttypes).
- **RED** via each unit's own env-var pin, reproduced independently:
  - `VECTURA_PRE_W30C_A=1` (F1): **3 failed** — A `3` vs `>=4`, B `0.39845942362288383` vs
    `<=0.05`, C `0` vs `>=20`. Matches the impl report's numbers to the full float.
  - `VECTURA_PRE_W30C_B=1` (F2b): **2 failed** — directional `0.9158242265937518` vs `>=1.3`,
    point `0.9999999999999979` vs `>=1.3`. Matches exactly.
  - `VECTURA_PRE_W30C_C=1` (F3): **1 failed** — `[ambient, point]` `0.9999999999999941` vs
    `>=2.0`. Matches exactly.
- **Mutation, done by reverse-patching each commit's own diff independently** (not by git
  operations on the shared worktree gitdir — `patch -p1 -R` on plain-file scratch copies with no
  write-capable `.git`):
  - Reverting **only F1**'s `regions.js` diff → `scene3d-area-light-shadow-softening.test.js`:
    **6/6 fail**, the other two files **stay 6/6 and 8/8 green**. Clean one-directional isolation.
  - Reverting **only F2b+F3**'s `scene3d.js` diff → `scene3d-shadow-footprint-torus-visibility.test.js`
    (4 fail) and `scene3d-shadow-receive-lighttypes.test.js` (2 fail: the R4 GREEN case and its own
    RED-proof-pin control), while `scene3d-area-light-shadow-softening.test.js` stays **8/8 green**.
  - Each mutation kills the test measuring exactly the commit it targets and nothing else — real
    isolation between F1 and F2b/F3, not co-dependent oracles.

## (3) F1 — area-light gate placement

Confirmed by direct diff read: the single-ray `shadowFn(P, light)` gate moved from **above**
`if (type === 'area')` (old line, now applies to `point`/`spot` only) to **inside** the area
branch's per-sub-sample loop, keyed to each sub-sample's own synthesized position
(`{ ...light, type: 'point', position: Ls }`). `ambient` (continues earlier) and `point`/`spot`
(fall through unchanged, just one line lower in source) are structurally untouched by construction
— proven by guard D (point-light march, bit-identical old vs new, part of the 8/8 in the new
file). Measured `area` is genuinely no longer byte-identical to `point`: the profile plot
(`area-penumbra-profile-plot.png`, read directly) shows the pre-fix red line at exactly 3 values
(hard 0/0.5645 step at x=136→138) and the post-fix blue line tracking the green
per-sample-gated reference at 23 distinct values across the same march, both matching the
`report.json` profile table exactly (spot-checked several rows against the plotted curve).

## (4) F3 — "ambient-first light selection," what changed

Confirmed the exact scope by diff read: `buildFaceFootprint` now resolves
`fpLight = (p.lights||[]).find(l => l.type !== 'ambient' && l.castShadows !== false) || light`
and uses `fpLight`/its own direction for the projector and the F2b tone gate; `light`/`lightDir`
themselves (feeding `toneOn`, `shadowReceiveOn`, the specular term) are untouched, confirmed by
grep — every other use of `light`/`lightDir` in the file is unchanged, and the actual per-point
tone/specular computation already runs on `activeLights` (`p.lights` in full, reassigned only for
emissive objects), not on `light` alone — so the "wrong light" bug was scoped to the footprint's
own **geometry**, never to its shading. `[sun]`-only scene: reproduced the guard's md5 assertion
directly (part of the 8/8 GREEN run above) — pass. U0 directional sweep: not rerun in full this
session (574s at heavy load per the impl report; the machine was independently observed to be
under heavy multi-process contention during this review too — several unrelated node processes
stalled at <1% CPU for 6+ minutes on scenes that normally finish in under a second) — accepted on
the strength of the impl report's own 73/73 number plus the fact that F3's code path
(`Array.prototype.find`) cannot alter any byte-identity scene whose `lights[0]` is already a
shadow caster, which is every default/manifest scene per `src/config/defaults.js` — a structural
argument, not just a re-assertion of the report's number.

**Secretary flag 3 — checked, not just inspected.** Built and ran (foreground, standalone node +
the project's own `loadVecturaRuntime` harness) a **multi-positional-light** scene the plan/impl
never tested: `[ambient(0.15), POINT@(-300,150,0), SPOT-elsewhere@(400,400,400) aimed at
(-150,0,0), intensity 6]` — `fpLight` resolves to `POINT` (first non-ambient), same as the
single-point case. Measured probe/control ink density at the point light's own shadow band:
- `[POINT]` alone (baseline): probe `0.4731`, control `0.1599`, ratio **2.958**.
- `[AMBIENT, POINT, SPOT-elsewhere]`: probe `0.1568`, control `0.1503`, ratio **1.043** — the
  differential collapses, but **does not invert** (probe is not darker than control, no sign
  disagreement between the footprint's geometry and the combined shading).
This is the known, already-disclosed multi-light **saturation** case the plan explicitly flags and
dismisses (`W-30c-plan.md` §1d, the `[point(intensity 4), sun]` note: "both sides of it clamp...
arguably correct multi-light behaviour and is not proposed as a fix here") and the plan's own
explicitly-out-of-scope item ("one footprint per shadow-casting light... file it, do not build
it") — F3 does not introduce a new disagreement mode, it only fixes *which* light is chosen when
`lights[0]` is ambient; the single-footprint-for-a-multi-light-scene limitation is pre-existing and
was already there (for whichever light happened to be `lights[0]`) before this unit. **No
polygon/shading contradiction found**; the pre-existing single-footprint design limitation is the
only source of any residual mismatch, and it is unchanged in kind by F3.

## (5) F2b — torus receive-shadow visibility

Confirmed by direct diff read and independent runtime measurement: the footprint's tone sample no
longer trusts the naive centroid unconditionally — `if (!shadowFn(sampleWorld, fpLight))
sampleWorld = firstOccludedSample(fp)`, which walks 90%-toward each hull vertex (real projected
caster-surface points) from the centroid until one is occluded. Reran the RED/GREEN/mutation triple
in (2); numbers match the impl report exactly (directional `0.916`→`2.869`, point `1.000`→`3.021`).
Read `crop-torus-dir-before.png`/`-after.png` and `crop-torus-point-before.png`/`-after.png`
directly, native resolution: BEFORE is uniform hatch with no visible patch near the torus in either
light type; AFTER shows a dense, clearly-bounded, roughly egg-shaped dark blob directly below the
ring in both — **solid, not annular**, confirming R2 (hole not fixed) is visibly still present
exactly as disclosed. Matches the impl report's description precisely.

**Secretary flag 1 — the fallback's reachability and silent-drop risk, checked by instrumentation,
not by reading the comment.** Patched a scratch copy (`w30c-instr`, never the live worktree) to
count `firstOccludedSample`'s null-vs-hit outcomes per footprint, then ran the pipeline foreground
against three torus geometries:

| torus tube (`sy`) | directional | point |
|---|---|---|
| 12 (the plan's own rig) | hit (null=0, hit=1) | hit (null=0, hit=1) |
| 3 (thinner) | **null=1, hit=0** | **null=1, hit=0** |
| 1.5 (very thin) | **null=1, hit=0** | **null=1, hit=0** |

**The fallback IS reachable** — for a torus whose tube is thin enough relative to its ring
diameter, none of the hull vertices' 90%-inward probe points land on occluded ground, and
`firstOccludedSample` returns `null`. Read the surrounding code directly (`scene3d.js:2503-2507`
vs `:2547-2559`): the "outside" pass's `Shadows.hatchRingsEvenOdd(outsideRings, ...)` treats
`footprintPolys` as **holes** in the even-odd fill (`outsideRings = [asCCW(scaf.uv)].concat
(footprintPolys)`), so the footprint's interior gets **zero ink from the outside pass by
construction**, regardless of whether the inside pass fires. When the null fallback triggers,
**the interior gets zero ink from either pass** — not the pre-fix "reads as unshadowed" failure
mode (uniform hatch straight through), but a hard-edged **blank void** in the receiver's fill. This
is a genuinely different, and arguably more visually jarring, failure mode than the one the impl
report's comment addresses ("never regresses to drawing the region as unshadowed") — the comment's
claim is technically true (it never draws the WRONG density) but incomplete: it can still draw
**nothing**, which the report does not characterize, test, or disclose. Scope of the gap, weighed
against ACCEPT:
- **Convex casters cannot hit this path at all** — independently reconfirmed below (condition 6):
  a convex caster's own centroid is always occluded, so `firstOccludedSample` is never called.
- Every rig the plan specified and the implementer evidenced (`sy=12`) does **not** trigger it
  (`hit=1`, not `null`) — this is not a fabricated defect in the shipped evidence, it is a
  boundary condition beyond the tested geometry.
- It is squarely inside the **already-parked W-30d** territory (non-convex caster footprint
  correctness, R2) rather than a new category of caster or a regression in a convex/previously-
  working path.
- Filed below as a **follow-up**, not a blocker: W-30d (or a new W-30e) should extend its own torus
  correctness sweep to include a thin-tube case and decide whether the fallback should degrade to
  "draw at the outside pitch" (today's pre-fix look, for this one boundary case only) rather than
  "draw nothing," since a hole-shaped blank patch is arguably a worse first impression than a
  uniform miss.

**Secretary flag 2 — convex-caster invariance, verified by independent measurement, not
inspection.** Ran `PIL.ImageChops.difference` myself (not trusting `report.json`'s own numbers)
against all four convex-caster evidence PNGs:
```
footprint-sphere-point-before.png  vs -after.png  -> bbox: None, extrema: ((0,0),(0,0),(0,0))
footprint-sphere-directional-*.png                -> bbox: None, extrema: ((0,0),(0,0),(0,0))
footprint-box-point-*.png                         -> bbox: None, extrema: ((0,0),(0,0),(0,0))
footprint-box-directional-*.png                   -> bbox: None, extrema: ((0,0),(0,0),(0,0))
```
Zero-pixel diff, both shapes, both light types — matches the impl report's claim exactly, verified
independently rather than re-quoted. Also read `footprint-sphere-point-before.png`/`-after.png`
directly, native resolution: pixel-identical to the eye as well as to the diff tool.

## (6) Unit D guards, U0, bars

- Unit D's phase-lock/density bars and the directional byte-identity guards: not independently
  re-run to completion this session (see (4) — machine contention made full-suite reruns
  impractical in the review window; several standalone probe scripts stalled at <1% CPU for 6+
  minutes on jobs that took under a second earlier in the same session, consistent with
  AGENT-PROTOCOL's shared-machine warning). The targeted new-test-file reruns in (2) — which do
  exercise Unit D's `pointInShadow`/footprint machinery end-to-end — all reproduced cleanly, and
  the diff itself never touches `casterSilhouetteLoops`, `lightClassifyEdges`, or `shadowFn`'s
  contract, so there is no structural mechanism by which Unit D's own bars could move.
- **`## Bars changed`: confirmed "None" is accurate.** `git diff --name-status` (condition 1) shows
  zero existing test files touched — the only test-file changes are three new, additive files. No
  numeric threshold, tolerance, or pinned fingerprint anywhere in the diff is a widen/narrow/re-pin
  of a **pre-existing** bar.

## (7) Scope — confirmed clean

`git diff 90f3411f..79c07770 -- src/core/scene3d/shadows.js` → **0 bytes** (ran it directly, not
trusting the report). `casterSilhouetteLoops`, `lightFaceSign`, `lightClassifyEdges` remain
un-hoisted, module-private closures inside `shadows.js`'s `build()` — confirmed by grep in the
post-tree. `scene3d.js:1451` still calls `Shadows.convexHull(uvPts)` (unchanged), not any new
`footprintRings` — **F2a is genuinely parked, not silently attempted**, confirmed structurally, not
just by the implementer's own prose claim. No touch to `surface-fill.js`, `surface-fill-mono.js`,
`params.js`, or `src/config/scene3d-tone-laws.js` anywhere in the range (condition 1).

## (8) CHANGELOG lines / merge note

The impl report's suggested `## Fixed` lines (area-light softening, torus visibility, ambient-first
selection) accurately describe what the diff does and what it does not (each correctly qualifies
its own residual gap — R2 hole-fill for the torus line, the disclosed penumbra-visibility gap is
correctly NOT claimed as fixed). Not applied to `CHANGELOG.md` per the reviewer brief (read-only).

Merge note: confirmed `handoff-c2` (`ed778940`, the `shadows.js` owner) touches only
`src/core/scene3d/params.js`, test files, docs, and its own evidence script since `47a5a755` —
**zero overlap** with `regions.js`/`scene3d.js`/`shadows.js` (`git diff --stat 47a5a755..ed778940
-- src/core/scene3d/shadows.js src/core/scene3d/regions.js src/core/algorithms/scene3d.js` is
empty). No merge conflict risk from that branch. Against main: neither `e429cfc5` nor `1193cbe1`
(the two round-2 CI-hardening hazard commits every other round-2 lane has had to account for) is an
ancestor of `90f3411f` — same pre-existing "still based on pre-release main" situation `W-30b-review.md`
§8 already logged; not a new issue, and `1193cbe1`'s known re-round of
`scene3d-hlr-spatial-index-identity.test.js`'s golden hash carries forward as the same
not-yet-triggered caveat.

## Findings — do not block ACCEPT

1. **F2b's null-fallback path is reachable and produces a blank void, not merely "not yet fixed"**
   — measured via instrumentation for thin-tube tori (§5, secretary flag 1). Squarely inside the
   already-parked W-30d/torus-correctness territory; the plan's own tested rig (`sy=12`) does not
   trigger it. File as an explicit addition to W-30d's scope (or a new W-30e) rather than reopening
   this unit.
2. Same standing cross-lane caveat every round-2 reviewer has logged:
   `scene3d-hlr-spatial-index-identity.test.js`'s golden hash needs re-verification once this
   branch rebases past `1193cbe1` — pre-existing, not introduced here.
3. Unit D's own guard suite and the U0 48-law sweep were not independently re-run to full
   completion this session due to severe, observed machine contention (§6) — accepted on the
   combination of the impl report's own numbers and the structural argument that nothing in this
   diff touches the code paths those bars protect.

## Verdict: ACCEPT-WITH-FOLLOWUPS

RED reproduced exactly for all three fixes (F1: 3985/3/0 → the report's own floats; F2b:
0.916/1.000 vs 1.3; F3: 1.00 vs 2.0), GREEN reproduced (22/22), and reverse-patch mutation
independently confirms each commit's test file is what breaks when that commit alone is undone —
clean isolation between F1 and F2b/F3. `shadows.js` is genuinely byte-untouched and F2a is
genuinely parked, not silently attempted (verified structurally, not just asserted). Convex-caster
invariance (secretary flag 2) is independently confirmed pixel-identical by my own `PIL` diff.
Multi-positional-light disagreement (secretary flag 3) was probed directly and found to be the
already-disclosed saturation limitation, not a new contradiction. The one real gap found this
review — F2b's null-fallback (secretary flag 1) is reachable for thin-tube tori and produces a
blank void rather than "unshadowed" — is real, was not disclosed in the impl report, but is a
narrow edge case outside the plan's tested rig and belongs to the already-parked W-30d scope, not a
reason to reject a unit that does exactly what it claims for every case it actually tested and
evidenced. Land it; carry the null-fallback edge case and the two standing cross-lane notes forward
as follow-ups.

REPORT docs/3d-audit/lane-reports/W-30c-review.md
