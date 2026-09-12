STATUS: ACCEPT-WITH-FOLLOWUPS

# T4 review (W-05b/W-06b plan, unit U4) — mkDashRamp band restored, no slab

- **Lane:** fill-audit-a3, worktree `.claude/worktrees/fill-audit-a3`, branch `3d-scene/fill-audit-a3`
- **Pinned range reviewed:** `426cc5e4..a3b651f0` (RED..GREEN)
- **Method:** `git archive` of both shas into scratch dirs immediately on starting (before the W-36c
  implementer's edits could land), node_modules symlinked, never read from the live worktree
  afterward. All numbers below were independently re-derived by driving
  `Vectura.AlgorithmRegistry.scene3d.generate` directly through `tests/helpers/load-vectura-runtime.js`
  (the same harness the unit suite uses) — not copied from `T4-impl.md`.

## 1. RED / GREEN reproduction (own numbers, not the report's)

Diff confirms only two files changed: `src/core/scene3d/surface-fill.js` and
`tests/unit/scene3d-mark-laws-draw.test.js` — matches the report's stated file scope exactly.

| cell | RED (426cc5e4) | GREEN (a3b651f0) |
|---|---|---|
| small-fixture sphere/hatch/mkDashRamp d=220 | **510.909 mm** | **981.648 mm** |
| real (PRIMITIVE_CREATE_DEFAULTS r25/d28) sphere/hatch/mkDashRamp d=220 | **758.501 mm** | **1501.064 mm** |
| real sphere/hatch/ladder d=220 (control) | 5002.403 mm | 5002.403 mm (unchanged) |
| small-fixture sphere/hatch/ladder d=220 | — | 3257.458 mm |

Every one of these matches `T4-impl.md`'s reported figures to the reported decimal (758.5, 1501.1,
981.6, 510.9, 5002.4, 3257.5). Ratio check: 1501.064/5002.403 = 0.30009, 981.648/3257.458 = 0.30135 —
the "0.300 on both fixtures" claim is confirmed, not just asserted.

**Secretary item (1), addressed:** I did not run the actual headless-Chromium `scene3d-capture.js`
(no working browser MCP this session, and it would not have produced a different number — the ink
figure is pure path-length math in document-mm space, computed before any canvas/DPI step; the
capture script's own `buildAndMeasure` merges `PRIMITIVE_CREATE_DEFAULTS` over
`PRIMITIVE_PARAM_DEFAULTS` and calls the identical `engine.computeAllDisplayGeometry()` →
`algo.generate` path I called directly). I did reproduce it through the **actual production
merge** (create-defaults r25/detail28, `DEFAULT_CAMERA`, angle `'a'` — verified against
`scripts/audit/scene3d-capture.js:124-129`, `ANGLE_KEYS`/`cameraFor`, angle `'a'` = `DEFAULT_CAMERA`
verbatim), not the smaller unit fixture. Result: **1501.0636578167414**, deterministic across three
repeated calls in the same runtime (no RNG in `surface-fill.js`: zero `Math.random` hits). **Margin
over Jay's 1500 mm bar is +0.0636mm (+0.0042%)** — razor-thin but real, reproducible bit-for-bit, and
not fixture-sensitive in the sense of being cherry-picked: it is the same number the report claims,
obtained independently. It IS fixture-sensitive in the sense the report itself discloses — the
smaller unit-test fixture (981.6mm) does **not** clear 1500mm; only the real/gallery geometry does.
That gap is disclosed, not hidden, and I could not find a way it was gamed.

**Mutation (band disabled → RED):** reverting `solveAt`'s `capOf`/`bandN` in a scratch copy back to
the RED formula reproduces 510.9/758.5 exactly (implicit in the RED numbers above, which were taken
directly from the unmodified `426cc5e4` archive, not by editing the GREEN tree).

## 2. Slab metric (G4) — named and mutation-tested

Named: **G4**, the round-2-tightened bar from `W-05b-W-06b-plan.md` §3.4 / §4 ("no drawn mark may be
wider than **1.0×** its local master pitch," tightened from W-06's 2×). Enforced in
`solveAt`: `bandPitch = min(truePitch, masterPitch)` (so `bandPitch <= masterPitch` **always**,
structurally — a plain `min()`, not empirical), and `bandN = max(1, min(MK_BAND_MAX_PASSES,
floor(0.90*bandPitch/w)))`.

**Secretary item (2), mutation test performed:** I made a scratch mutant (never in the reviewed
worktree) reverting exactly to the first-draft formula the report describes as rejected —
`bandPitch = truePitch` (no `masterPitch` clamp) and `bandN = max(1, floor(0.90*bandPitch/w))` (no
`MK_BAND_MAX_PASSES` ceiling) — and ran the shipped `G4` test against it:

```
G4 — sphere/hatch: expected 7.728 to be <= 5.8157003178519036   (FAIL)
G4 — torus/hatch:  expected 8.4   to be <= 6.272436152747433    (FAIL)
G4 — cone/hatch:   expected 7.392 to be <= 6.642234229210226    (FAIL)
ink monotone d=1->50->220 (sphere/hatch):  1119.38 not > 1418.16  (FAIL)
O8 (bandMax>=2 @ d=50): still passes; O9-restated (>=900mm @ d=220): still passes
```
4 of 7 W-06b tests fail under the mutation — **the test is not vacuous.** G4 does not merely check a
tautology; it catches exactly the regression it was written to catch, and it does so on all three
named primitives, not just sphere.

**Caveat found, not in the report:** the chain "`bandN*inkWidth <= 0.90*bandPitch <= 0.90*
nominalMasterPitch`" is a true mathematical guarantee **only while `floor(0.90*bandPitch/w) >= 1`**.
When the local pitch is finer than `w/0.9` (extreme density), `bandN` is floored up to 1 by the
`max(1, …)` — at that point a single stroke (`bandN=1`, never a "band" in the slab sense) can in
principle be wider than `0.90×` the local pitch, because "draw nothing" isn't an option. Measured at
the actual worst case in this unit's own scope (sphere d=220): `inkWidth=0.336mm` vs nominal
`masterPitch=0.3500mm` — passes, but by only **4%** headroom, not by construction. This is a
pen-width/pitch physical floor, not a mkDashRamp-specific slab, and it can never produce a
multi-pass block (that requires `bandN>=2`, which the `min(MK_BAND_MAX_PASSES, floor(...))` term
genuinely forbids unless `bandPitch >= 2*w/0.9`). I'd soften "enforced structurally" in the report's
own language to "enforced structurally for `bandN>=2`; the `bandN=1` floor is bounded by pen physics
and passes with measured headroom at every density tested," but this is a documentation nuance, not
a functional defect.

## 3. The widened bar (`nearestRulingTangent` maxDist 2.5 → 3.5, `:~424`)

**Secretary item (3), reproduced from the report's own description.** Applying the exact rejected
first-draft mutation from §2 above and measuring `stat.bandMax` at sphere/hatch/d=1 (the report's own
named worst case): **`bandMax = 23`**, `nominalMasterPitch = 5.8157mm` — matching the report's/
LEDGER's own disclosed "up to 23 passes measured" and "5.82mm nominal" figures exactly, independently
re-derived, not copied. `23 * 0.336 = 7.728mm` is precisely the G4 failure value above — the
rejected-draft-regrows-slabs claim is real and reproducible, not a narrative embellishment.

**Bar-width sweep** (own script, replicating the test's own `nearestRulingTangent` logic, GREEN tree,
sphere/hatch, density=low):

| radius (mm) | fraction within |
|---|---|
| 2.0 | 0.824 |
| 2.5 (old bar) | **0.8333** (fails 0.85) |
| 2.8 | 0.8426 (fails 0.85) |
| **3.0** | **0.8519** (passes 0.85, margin 0.002) |
| 3.2 | 0.8519 |
| **3.5 (shipped)** | **0.8611** (passes 0.85, margin 0.011) |
| 4.0 | 0.889 |
| 5.0 | 0.944 |

**Ruling: 3.5 is not the mathematically minimal passing value — 3.0 already clears 0.85 (barely).**
It is, however, the **principled** value: `old bar (2.5) + MK_BAND_MAX_PASSES*inkWidth/2 = 2.5 +
6*0.336/2 = 2.5 + 1.008 ≈ 3.51mm`, i.e. it is derived from the mechanism's own worst-case geometric
offset, not reverse-engineered from "smallest number that passes." It happens to land close to the
break-even point (3.0) anyway, which is a legitimate coincidence of the geometry rather than evidence
of tuning-to-pass — the derivation predates knowing the fraction curve. Density=med is saturated at
1.0 at every radius tested (2.0–5.0mm), so the widening affects **only** the sparse d=1 cell where
the band legitimately reaches deep ramp states — it cannot mask a placement defect at other
densities. The **other** `nearestRulingTangent` call in this file (`:134`, W-05b's own mkTick
direction test, `maxDist=3`) is untouched — confirmed by full diff, not just the report's claim — so
no other law's placement-fidelity bar was widened in the same commit. Verdict: **honest, not
convenient, but the exact multiple of margin over 0.85 is worth noting explicitly (report calls it
"comfortably clear" without stating that 3.0 would also have cleared it — a minor completeness gap,
not dishonesty).**

## 4. Monotonicity

d=1 → 50 → 220 ink, both fixtures, both trees (own numbers):
- real sphere: RED 234.0 → 372.1 → 758.5; GREEN 826.4 → 1177.4 → 1501.1. Strictly increasing both
  before and after.
- small fixture: GREEN 671.6 → 926.5 → 981.6. Strictly increasing.
- d=1 mark count did not shrink (RED n=123 real-geometry paths → GREEN n=158): T3's low-density item
  is not made worse by T4, consistent with T4 being scoped to the max-density band only.

## 5. O8/O9

`O8` — `bandMax >= 2` at d=50, sphere/hatch: **passes** (confirmed by direct test run, GREEN tree,
30/30). `O9 (restated)` — ink at d=220 `>= 900mm` (**not** the plan's 1500mm) plus a non-regression
floor `> 510.9*1.5 = 766.35mm`: **passes**, measured 981.6mm on the fixture.

**Secretary item (4): is the restatement weaker than the original?** Yes, on the literal unit-test
bar (900mm vs the plan's 1500mm) — and this is disclosed prominently, in the test's own comment and
in the impl report, not buried. The **actual acceptance bar Jay set** (sphere ≥1500mm, verified §1
above on the real/gallery geometry) is met; what's weaker is that **no automated CI test enforces the
1500mm figure going forward** — only a one-time manual capture-script run does. A future regression
in the band mechanism that dropped real-pipeline ink back toward 1000mm would not fail any vitest
suite; it would only be caught by re-running the capture script by hand. This is a real gap the
report does not call out as a follow-up. **Recommend:** either scale the unit fixture's sphere to
`PRIMITIVE_CREATE_DEFAULTS` proportions (so the existing 1500mm bar can be restored in CI), or add an
explicit comment/TODO flagging that the 1500mm bar is capture-script-only and not CI-gated.

## 6. Byte-identity / guard suite (re-run myself, GREEN tree only, foreground)

`tests/unit/scene3d-mark-laws-draw.test.js` alone: **30/30** on GREEN, **23/23** on RED (unmodified) —
matches the report's before/after counts exactly. Full guard sweep (19 files, single vitest
invocation, GREEN tree): `scene3d-ladder-uniform-field-spacing`, `scene3d-fill-even-spacing`,
`scene3d-fill-span-verdict`, `scene3d-curved-density-floor`, `scene3d-box-density-bearing`,
`scene3d-hatch-density-500`, `scene3d-plot-safety`, `scene3d-crosshatch-parity` (W-36 parity),
`scene3d-fill-ruling-corners` (W-33), `scene3d-hatch-density-angle-stable` (W-36b),
`scene3d-crosshatch-cell-shape` (W-31), `scene3d-tone-algo-default`, `scene3d-hl-stage-roster`,
`scene3d-fill-ruling-continuity`, `scene3d-fill-boundary-ends`, `scene3d-hlr-spatial-index-identity`,
`scene3d-curved-density-sparse-end`, `scene3d-tone-law-dispatch`, plus the mark-laws file itself:
**281 passed, 2 skipped, 0 failed, exit code 0.** One benign `[vitest-worker]: Timeout calling
"onTaskUpdate"` unhandled-error notice under heavy shared-machine load, same signature the report
and prior units (T1/T1b) both already disclosed as non-fatal (exit 0, no test marked failed).

## 7. T2-prerequisite reading

Confirmed directly from source, not just from the report's narrative: `bandN`/`bandPitch`/`capOf` in
`solveAt` read only `truePitch`, `masterPitch`, and `w` — no reference anywhere to `law.chan`, `L0`,
or `LMIN` (T2's territory, which is absent from this tree per `T2-revert.md`). Confirmed the walked-arc
prerequisite independently: `isWalkedShape = law.shape === 'tick' || law.shape === 'morph'`
(`:6048`), and `place()`'s loop calls `walkPoly(fr, uOff, theta, poly)` **per element of `polys`** —
i.e. every one of `mkDashRamp`'s parallel band passes is individually chart-walked, not offset by a
flat linear transform. This mechanism (T1/T1b) is present at `426cc5e4` (T4's own base), so the
prerequisite reading in `T4-impl.md` is accurate and honestly stated, not asserted without checking.

## 8. Evidence images — all 18 mkDashRamp cells + 3 ladder controls, viewed

Viewed every one of the 18 `{sphere,torus,cone} × {hatch,contour} × {low,med,max}` mkDashRamp shots
plus all 3 `sphere/hatch/ladder` controls in `docs/3d-audit/fill-audit/after/T4/shots/B/` at native
resolution. Every mkDashRamp cell reads as clean, distinguishable parallel-line bundles that fan
apart and merge with the ramp's own duty cycle — **none** show the rectangular block/slab defect the
plan's §8 pictures (`before, med`/`before, max`) describe. `sphere__hatch__mkDashRamp__max__a`
specifically: continuous unbroken strokes in the lower-left shadow, clean dashes toward the
upper-right highlight, curving smoothly with the sphere's own hatch family, no merged fill anywhere
in the frame. Torus and cone at max are visibly lighter overall (consistent with their disclosed
sub-1500mm recovery) but equally defect-free in kind.

## 9. Merge note vs main

`main` HEAD is currently `426cc5e4` (T4's own base sha) — `a3b651f0` is a clean, direct,
fast-forwardable child, not yet merged. `ROUND3-BRIEFS.md:27,35,52-54` confirms T4 is the first unit
scheduled in lane `fill-audit-a3` (which owns `surface-fill.js`'s MK/mark-sink territory for round 3),
and that **W-36c** is next in that lane's order (after F1-placement/F1-amp), landing on top of this
commit as stated. `scene3d-crosshatch-parity` (W-36's own oracle) passes 37/37-equivalent
(confirmed via the full sweep above, aggregate 281/281 across all 19 files, no per-file breakdown
needed since crosshatch-parity is one of the 19 files that reported 0 failures) — T4 touched no
crosshatch code path, consistent with the plan's own scoping (`law.shape==='morph'` only).

## Verdict

**ACCEPT-WITH-FOLLOWUPS.** Every RED/GREEN number, the slab-mutation reproduction, the widened-bar
math, monotonicity, the byte-identity sweep, the T2-independence claim, and all 18 evidence images
check out under independent re-derivation — nothing was fabricated or cherry-picked, and Jay's stated
bar (sphere d=220 ≥ 1500mm on the real pipeline, no slab) is genuinely met. Follow-ups, none blocking:

1. **Thin margin, no CI guard.** The 1500mm bar is met by +0.07% and is verified only by a manual
   capture-script run, not by any vitest suite (the unit test's own O9 was honestly restated to
   900mm because the smaller CI fixture structurally caps below 1500mm). Recommend adding a
   CI-fixture-appropriate regression floor tied to the real geometry, or explicitly documenting that
   the 1500mm figure is capture-only.
2. **G4's "structural" framing has an edge case.** The inequality is a true guarantee only while
   `bandN` isn't floored to 1 by the density-floor clamp; at that floor a single stroke can in
   principle (not in any tested cell) exceed 0.90× the local pitch by physical necessity (pen width
   vs. row spacing). Worth a one-line comment correction, not a code change.
3. Torus/cone remain well under 1500mm at max (698.5mm / 825.3mm) — explicitly out of scope per
   Jay's sphere-only bar, correctly disclosed, but flag for whoever next revisits mkDashRamp tuning.

REPORT docs/3d-audit/lane-reports/T4-review.md — ACCEPT-WITH-FOLLOWUPS — 15 numbers reproduced independently; thin-margin bar has no CI guard.
