STATUS: DONE

# T3b (round 4, lane fill-audit-a4) — mkDashRamp single-pass dashes below a density threshold, band kept at the dark end (Jay decision 12=B)

- **Lane:** fill-audit-a4
- **Worktree:** `.claude/worktrees/fill-audit-a4`
- **Branch:** `3d-scene/fill-audit-a4`
- **Base sha:** `b43fa4e3` (main HEAD, round 3 closed, v1.4.2)
- **Port:** 8475 (confirmed `curl` 200, `APP_VERSION` `1.4.2`, matches `package.json`)
- **Decision (verbatim, `SESSION-SUMMARY.md` §4 item 12):** "T3b, a new unit — draw single-pass
  dashes below some density threshold, keeping the band mechanism where it earns its keep. The
  cost is a new threshold to justify and another mode boundary in a file that already has several."

## Prerequisite reading

`T3-impl.md`/`T3-review.md` (pens per mark 5.71 → 3.93 at d=1, the low-end row-coverage floor,
the bundle finding that T3 surfaced but did not cause), `T4-impl.md`/`T4-review.md` (the band-pass
mechanism itself: `MK_BAND_MAX_PASSES=6`, `bandN`, `capOf`, the 1500mm dark-end bar, G4's slab
gate), `T4b-impl.md` (the CI floor 1400mm / band ±10% guard for d=220), `SESSION-SUMMARY.md` §4
item 12 and §5's 10.png row, `STILL-OPEN.md`'s T3 entries (the "discrete dashes riding rulings at
every density, never row-wide tiles" phrasing, originally `W-05b-W-06b-plan.md` R5).

## MEASURE FIRST (before any code change)

All numbers below: `Vectura.AlgorithmRegistry.scene3d.generate` driven directly with
`Scene3D.Params.PRIMITIVE_PARAM_DEFAULTS` ("addLayer" rig) and separately
`Scene3D.Params.PRIMITIVE_CREATE_DEFAULTS` ("create" rig), camera `DEFAULT_CAMERA` (angle 'a'),
sun az135/el45, mapper `hatch`, fillAngle 45, penWidth 0.3, ground disabled (no ink total below
includes ground ink), on the base sha `b43fa4e3` (pre-T3b) tree.

**Passes per mark (`stat.pens/stat.marks`), sphere/hatch/mkDashRamp, addLayer rig:**

| d | 1 | 5 | 10 | 25 | 50 | 100 | 220 |
|---|---|---|---|---|---|---|---|
| pens/mark | 3.93 | 3.93 | 3.58 | 3.37 | 2.12 | 1.00 | 1.00 |
| bandMax | 6 | 6 | 6 | 6 | 4 | 1 | 1 |

`bandMax` naturally declines toward 1 only past d~70-80, but O8 (T4's own guard,
`scene3d-mark-laws-draw.test.js`, unmodified by this unit) pins `bandMax >= 2` **exactly at
d=50** — accepted, unmodified evidence that a multi-pass bundle at d=50 ("med") is *not* the
"tile" Jay flagged (the complaint, per `after/T3/` and decision 12's own text, is d=1). This
means any threshold this unit picks **must sit strictly below 50**.

**Where the band "earns its keep" (ink asked exceeds what a single pass can deliver):** forced a
scratch mutant (`MK_BAND_MAX_PASSES=1` globally) and compared its ink to the actual (band-enabled)
tree, sphere/hatch, addLayer rig, at d=1,5,10,15,20,25,30,35,40,45,49,50,60,70,80,90,100,150,220:

| d | 1 | 25 | 50 | 70 | **80** | 90 | 220 |
|---|---|---|---|---|---|---|---|
| ink lost forcing single-pass | 72.0% | 72.0% | 58.2% | 34.7% | **0.0%** | 0.0% | 0.0% |

Same shape on the create rig (72.5%→0% between d=70 and d=80). **The band is genuinely
load-bearing (not decorative) at every density from 1 through ~70 on both rigs** — it stops
mattering only where `bandPitch` itself becomes too fine for a 2nd parallel pass to physically fit
(a packing limit, ~d=80, not a tone-sufficiency crossing). This is *above* O8's d=50 pin, so no
threshold below 50 can be "free" — any choice costs real, measured ink at the switch.

**Where the UNGATED mechanism naturally still sits at its own hard ceiling (fine integer sweep
d=25..45, all four of {sphere,torus} x {addLayer,create}):**

| combo | last d at bandMax=6 | first d below 6 |
|---|---|---|
| addLayer/sphere | 35 | 36 (→5) |
| addLayer/torus | 35 | 36 (→5) |
| create/sphere | 35 | 36 (→5) |
| create/torus | **37** | 38 (→5) |

`MK_BAND_ONSET_D = 35` (measurement-derived, not a round number picked for its own sake — it is
the last integer density at which the ungated mechanism already sat at its ceiling on **every**
combination; create/torus is even more generous, at 37).

## Which half of Jay's rule each test gates (blocking, mutation-proved)

- **O10** ("single pass at the sparse end") gates **only** "draw single-pass dashes below some
  density threshold". Asserts `bandMax===1` (`pens===marks`) for d=1..4, sphere/torus, both rigs.
  **RED** (mutant = `git show b43fa4e3` source): pens-per-mark = 3.9347826086956523 at d=1,
  `bandMax=6`. **GREEN**: `bandMax=1` exactly. Says nothing about count/monotonicity.
- **O11** ("T3's own bars still hold") gates **only** "keeping T3's own contract intact". Mark
  **placement count** (`marks`) is architecturally independent of `bandN` — `layMark` is invoked
  once per surviving site regardless of how many parallel passes it draws; `bandN` only bounds
  `capOf`, i.e. how much ink ONE already-placed mark carries. Re-derives T3's O6 (>=40 @ d=1) and
  O7 (non-decreasing d=1..50) and pins the sphere sequence `[46,46,62,63,73]` **byte-identical**
  to T3's own tree. Says nothing about pass count.
- **O12** ("continuity at the threshold") gates **only** the "where the band earns its keep" half,
  evaluated at the ONE density (`MK_BAND_ONSET_D`) where the gate itself starts/stops applying.
- **O13** ("non-regression") is not a new half of Jay's rule — it is the guard that O8/T4/T4b's
  own territory (d=50, d=220) is untouched.

**Mutation proof (blocking, both halves):** reverting `surface-fill.js` to the literal `b43fa4e3`
source (`git show`, loaded via `loadVecturaRuntime({ scriptOverrides })`, never `git stash`, never
edited in the reviewed worktree) reproduces `bandMax=6`/pens-per-mark=3.9347826086956523 at d=1
exactly (O10's mutation-kill) and, separately, O11's re-derivation shows the SAME sphere sequence
`[46,46,62,63,73]` runs on the mutant too (proving `marks` never depended on `bandN` in the first
place — the mutation cannot touch O11 by construction, which is the point: they are independent
halves).

## Mechanism (GREEN)

`surface-fill.js`: `MK_BAND_MAX_PASSES=6` was a density-BLIND ceiling on `mkDashRamp`'s
parallel-pass band (T4's own mechanism). New `bandOnsetCap(density)`, placed immediately after
`MK_BAND_MAX_PASSES`'s own declaration:

```js
const MK_BAND_ONSET_D = 35;
const bandOnsetCap = (density) => {
  const d = finite(density, 50);
  if (d >= MK_BAND_ONSET_D) return MK_BAND_MAX_PASSES;
  const t = clamp((d - 1) / (MK_BAND_ONSET_D - 1), 0, 1);
  return clamp(Math.round(1 + t * (MK_BAND_MAX_PASSES - 1)), 1, MK_BAND_MAX_PASSES);
};
```

Read in exactly the two places `MK_BAND_MAX_PASSES` used to be read directly — `solveAt`'s `bandN`
(feeds `capOf`, which bounds `L`, i.e. how much ink one mark carries) and `layMark`'s morph-branch
`bandN` recompute (must agree with `solveAt`'s own value or `sv.L` and `nn` disagree about how many
passes the ink is spread across, exactly the invariant T4's own comment already documents) — both
gated to `law.shape === 'morph'`, unique to `mkDashRamp`. **This is a RAMP, not a single cliff**:
at d=1 the cap is 1 (single pass); it grows by exactly one integer pass at a time as density rises,
reaching the full 6 by `MK_BAND_ONSET_D`. At and above `MK_BAND_ONSET_D` the gate is a
byte-identical no-op by construction (`bandOnsetCap(d) === MK_BAND_MAX_PASSES`), which is what
keeps O8 (d=50) and T4b/G4's d=220 floor untouched without editing either of those files.

## Continuity at the threshold (O12)

| rig | d=34 ink | d=35 ink | Δ |
|---|---|---|---|
| addLayer, sphere | 1181.06mm | 1181.06mm | **0.00%** |
| create, sphere | 1911.88mm | 1912.88mm | 0.05% (ordinary per-density noise — `bandOnsetCap` returns 6 on both sides) |

Both match the **pre-T3b tree's own numbers exactly** at d=34 and d=35 (verified in the test file
by direct mutant comparison) — the gate genuinely does nothing at or past its own boundary.

**Honest disclosure (stop-and-report, not a fudge): the ramp's own internal steps below the
threshold are NOT all sub-drift-envelope.** Given O8 pins `bandMax>=2` at d=50 and the band is
load-bearing (34-76% of ink) at every density below ~70 (measurement above), **no** threshold
choice below 50 — ramp or hard switch — can avoid a real step somewhere in that range. The largest
single step measured (sphere, d=4→5, the 1-pass→2-pass transition, where capacity roughly
doubles): **59.0% (addLayer), 76.2% (create)**. This is inherent to any discrete integer-pass-count
mechanism under O8's constraint, not an artifact of a poorly-chosen threshold — a hard on/off
switch anywhere below 50 would cost the *same* 34-76% in one single cliff instead of several
smaller ramp steps. Fingerprinted (not hidden) in the new test file so a future change cannot make
this worse silently.

## d=220 / d=50 — which guard, what verdict

- **d=220: byte-identical (md5)**, both primitives, both rigs, verified two ways: (1) direct md5
  comparison against the `b43fa4e3` mutant in the new test file; (2) `scene3d-mkdashramp-dark-end.test.js`
  (T4b's own CI guard, unmodified) — **4/4**, unchanged, independently reproduces
  1501.0636578167772mm. (3) `scene3d-mark-laws-draw.test.js` G4 — **30/30** (unchanged test count
  from T4's own 30/30), the slab-metric half of Jay's decision-1 bar untouched.
- **d=50 (O8's own checkpoint): byte-identical (md5)**, both rigs, sphere — verified against the
  `b43fa4e3` mutant directly; `bandMax` unchanged (4 addLayer / 3 create). O8 itself re-run
  unmodified: **30/30** in `scene3d-mark-laws-draw.test.js` (includes O8).

## What I saw (native-resolution crops, per protocol)

Captured from the worktree (both `--rig create` and `--rig addLayer`,
`docs/3d-audit/fill-audit/after/T3b/`) and compared against T3's own base-sha evidence
(`docs/3d-audit/fill-audit/after/T3/shots/B/`, the identical fixture — no re-capture of the
"before" state needed).

**sphere/hatch/mkDashRamp/low (d=1), both rigs:** BEFORE shows 6 curving rows, several fanning out
into 4-6 clearly-separated parallel hairlines that all start/stop together — reads as thick,
disconnected ribbon bundles, exactly the "row-wide tile" `STILL-OPEN.md` flagged. AFTER: the SAME 6
rows now draw as single, crisp, curving strokes with visible dash gaps — reads unambiguously as
**discrete dashes riding the rulings**, not bundles. A 3x-native crop of the darkest (upper-left)
region makes this unambiguous: BEFORE shows three separate 4-6-line fanned bundles; AFTER shows
three separate single hairlines with real gaps between segments
(`after/T3b/sphere-low-crop3x-before-after.png`).

**torus/hatch/mkDashRamp/low:** identical improvement in kind
(`after/T3b/torus-low-before-after.png`).

**sphere/torus max (d=220), both rigs:** pixel-for-pixel **byte-identical** to the pre-T3b tree
(confirmed by direct file comparison, not just by code inspection) — T4's dark-end gradient is
untouched.

**Plainly: yes, the dashes now read as single strokes riding the rulings at the sparse end, not
row-wide tiles.**

## Guards run (targeted, foreground, one file at a time, `timeout: 600000`)

| file | result |
|---|---|
| `scene3d-mkdashramp-single-pass.test.js` (new, this unit) | **20/20** |
| `scene3d-mkdashramp-low-end.test.js` (T3's own oracle) | **13/13**, unchanged |
| `scene3d-mkdashramp-dark-end.test.js` (T4b's own CI guard) | **4/4**, unchanged |
| `scene3d-mark-laws-draw.test.js` (T4's O8/G4 oracle) | **30/30**, unchanged from T4's own count |
| `scene3d-mktick-wedge.test.js` (T2-3 family) | **58/58** — pre-existing state at this unit's base sha (T2-3's own `HEAD`-drift red, documented in T3-impl.md, has since resolved on this branch; not touched by this unit) |
| `scene3d-ribbon-width-bar.test.js` | **10/10** |
| `scene3d-ribbon-width-create-rig.test.js` | **12/12** |
| `scene3d-ribbon-f1b-streaks.test.js` | **44/44** |
| `scene3d-ribbon-wall-coverage.test.js` | **36/36** |
| `scene3d-curved-density-floor.test.js` | **14/14** |
| `scene3d-curved-density-sparse-end.test.js` | **20/20** |

`[FillBoolean] polygon union failed on degenerate geometry` on stderr in several ribbon-file runs
is documented pre-existing noise (T3-impl.md, T4-impl.md), not a regression.

## Byte-identity sweep — coverage stated as a fraction

Same reachable roster T3 established: `mkDotScreen`, `mkTick`, `mkScribble`, `ladder` (4 of 12 raw
`MARK_LAWS` shapes — the other 8 are dead code, unreachable via `SCENE3D_TONE_LAWS.IDS`/`ALIASES`).
**4 laws x 2 primitives x 3 densities (1/50/220) x 2 rigs = 48 cells, 0 mismatches** — 24 cells
(addLayer) asserted permanently in the new test file, 24 cells (create rig) verified in a
throwaway scratch spec (written, run, deleted — no probe files left in the worktree). Structural
reason, not just measurement-and-lucky: `bandOnsetCap` is only ever read inside `solveAt`/`layMark`'s
`law.shape === 'morph'` branches, unique to `mkDashRamp` — no other law's code path reaches it.

## Bars changed

**None to any existing test.** This unit adds one new file only
(`tests/unit/scene3d-mkdashramp-single-pass.test.js`); no existing threshold, tolerance,
population, or pinned fingerprint in any other file was touched.

**Disclosed non-bar behavioral note** (not a test-bar change, but a measured side effect, per
AGENT-PROTOCOL's "narrowing/behavior change" spirit): torus/addLayer/d=1 mark count moved
**37 → 38** (a gain, not a loss). Cause: `L`'s own shorter cap (single pass now) changes the
walked mark's footprint, which can change whether a later candidate site reads as "too close" to
an earlier one (`blocked()`'s exclusion disc) — mark PLACEMENT still never depends on `bandN`
directly, this is an emergent second-order effect of a shorter mark occupying less exclusion
space. Still monotone (`[38,51,70,77,79]`); does not touch any pinned bar — T3-impl.md itself
calls torus "a secondary check, not gated to 40," and no test anywhere pins torus's exact d=1
count.

## Files touched

- `src/core/scene3d/surface-fill.js` — `MK_BAND_ONSET_D` (new constant), `bandOnsetCap()` (new
  helper, placed immediately after `MK_BAND_MAX_PASSES`), `solveAt`'s `bandN` computation,
  `layMark`'s morph-branch `bandN` recompute. Both call sites gated to `law.shape === 'morph'`
  (mkDashRamp only) exactly as before — no other law's code path changed.
- `tests/unit/scene3d-mkdashramp-single-pass.test.js` (new, 20 tests).
- `docs/3d-audit/fill-audit/after/T3b/report.json` + `shots/B/*.webp` (12 mkDashRamp cells across
  both rigs) + 3 before/after PNG crops (native + 3x-native).

## Open follow-ups

- The ramp's own largest internal step (d=4→5, 59-76%) exceeds ordinary density drift — disclosed
  and fingerprinted, not hidden. A future unit could investigate a non-integer/blended pass
  mechanism if this reads as too abrupt on the app's own live density slider (this unit did not
  build that — it was out of scope: "mark constants only", and the abruptness is a measured,
  structural consequence of O8's own d=50 pin, not a defect in this implementation).
- `scene3d-mktick-wedge.test.js` runs 58/58 green at this unit's base sha (the T2-3-family red
  T3-impl.md documented appears to have resolved upstream on this branch already) — noted for the
  record, not investigated further as it is outside this unit's scope and not touched by it.

REPORT docs/3d-audit/lane-reports/T3b-impl.md — DONE — sphere/hatch d=1 pens/mark 3.93->1.00 (single pass), d=50/220 byte-identical, threshold d=35 measured.
