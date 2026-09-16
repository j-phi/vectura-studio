STATUS: DONE — CI guard added, floor 1400mm (below the measured 1479.74mm drift envelope), ±10% band, RED reproduces T4's own 758.5mm

> **Corrections (T4c, 2026-09-12, see `T4c-impl.md`):** this guard is a
> **one-sided upper-bound check layered on the floor**, not a symmetric second
> check — `BASELINE_INK * 0.9 = 1350.96mm` is below the 1400mm floor, so the
> band's lower half is mathematically dead. And this file gates only the
> **ink-magnitude half** of Jay's decision-1 bar at sphere/hatch/d=220; the
> **slab half is gated separately, and is proven gated, by G4 in
> `scene3d-mark-laws-draw.test.js`** (mutation test: the slab-regrowing
> formula trips G4 at low density, is silent at this file's own d=220 cell).

# T4b — CI guard for T4's restored dark end (TESTS ONLY)

- **Lane:** fill-audit-a3
- **Worktree:** `.claude/worktrees/fill-audit-a3`
- **Branch:** `3d-scene/fill-audit-a3`
- **Base sha:** `dcc91872` (W-36d, tests-only)
- **Port:** 8475
- **LEDGER row:** 1a (T4 review follow-up)
- **Files touched:** `tests/unit/scene3d-mkdashramp-dark-end.test.js` (new). No `src/` change. No existing test edited.

## The gap (row 1a, verbatim in effect)

T4's headline sits 0.07% over Jay's bar (sphere/hatch/mkDashRamp d=220: 1501.1 vs 1500mm), measured only by
a one-time manual `scripts/audit/scene3d-capture.js` run, with **no CI guard**. T4's own unit fixture
(`scene3d-mark-laws-draw.test.js`) cannot restate the literal 1500mm bar because it uses the smaller
`PRIMITIVE_PARAM_DEFAULTS` sphere (radius 20/detail 16) — d=220 measures only 981.6mm there regardless of
the fix's health.

## Why this drives `engine.addLayer`, not `algo.generate(params)`

A synthetic params bag supplies the very radius/detail values under test. This fixture drives the real
insert entry `engine.addLayer('scene3d')` → `addSceneTree` → `addObjectToScene` — identical harness shape to
`tests/unit/scene3d-insert-default-ink.test.js` — so the seeded sphere's `radius`/`detail` come from
`Scene3D.Params.PRIMITIVE_CREATE_DEFAULTS.sphere` (25/28), exactly what a real "Add Layer → 3D Scene" click
gives a user, not a literal this file types in. Only the seeded object's **style** (mapper/density/toneLaw)
is overridden, to reach the specific cell T4/Jay named.

**Verified this really is "the same pipeline T4 measured on," not a lookalike:** this fixture's unfiltered
`group.scenePaths` ink is **1501.0636578167772mm**, matching `T4-review.md` §1's own independently-derived
**1501.0636578167414mm** (real/`PRIMITIVE_CREATE_DEFAULTS` row, camera angle 'a' = `DEFAULT_CAMERA`
verbatim) to 10 significant digits. The two differ only in the 13th digit — ordinary floating-point
summation-order noise, not a methodology gap.

## Measuring the envelope FIRST (as instructed — before setting any bar)

All measurements below were made in-process against this exact fixture, 2026-09-12, this worktree
(`dcc91872`), via a scratch node script (not committed; ad hoc, `node <script>` using
`tests/helpers/load-vectura-runtime.js`).

**Repeatability (5 identical builds):** bit-identical every time — `1501.0636578167772mm`. Confirms
`surface-fill.js` has zero RNG on this path (matches T4-review's own audit) and that ink is pure
path-length math in document-mm space, computed before any canvas/DPI step (T4-review §1) — so
`deviceScaleFactor` ("dsf 2" in the capture pipeline) cannot move this number and was not swept for that
reason.

**Drift envelope — 8-point sweep of UNRELATED params** (sun azimuth ±2°, sun elevation ±2°, camera yaw ±2°,
camera pitch ±2° — the same class of perturbation `U9-2` used for its own shadowPathCount envelope):

| perturbation | ink (mm) |
|---|---|
| baseline (camera 'a', sun 135/45) | 1501.063657816772 |
| sun az +2° | 1505.119234387324 |
| sun az −2° | 1498.248612764971 |
| sun el +2° | 1497.659752055402 |
| sun el −2° | 1505.973543477690 |
| camera yaw +2° | 1501.434703141023 |
| camera yaw −2° | **1517.517132551726** (max) |
| camera pitch +2° | 1493.094769065443 |
| camera pitch −2° | **1479.741978529062** (min) |

**Envelope: [1479.74, 1517.52] mm** (baseline ±1.4% / +1.1%).

**Additional data point, NOT part of the envelope (a different cell, included only for information):** the
capture script's own second named camera angle ('b': yaw 40 / pitch −15) measures **1528.997147273961mm**
on this same fixture — bigger than the ±2° sweep because it's a genuinely different viewing angle, not
drift. `dsf` was not swept — established above to be structurally irrelevant to this quantity.

**Regression number (RED, mechanism reverted):** `git archive dcc91872` into a scratch dir, symlinked
`node_modules`, then `git diff a3b651f0^ a3b651f0 -- src/core/scene3d/surface-fill.js > t4-hunk.patch` and
`git apply -R t4-hunk.patch` (verified `MK_BAND_MAX_PASSES` absent afterward — the mechanism is fully
reverted, not partially). Re-measured this EXACT fixture in that scratch tree:

```
RED ink 758.5005509047427
```

Reproduces `T4-review.md`'s own independently-measured **758.501mm** RED number to 10 significant digits.

## The guard shape (W-26b-3 / U9-2 precedent, not the lighter one-sided margin)

A bar pinned at 1501.1 with ONLY a ±10% band would (a) fail on any drift outside that narrow band — real,
since the ±2° sweep alone spans −1.4%/+1.1% — and (b) PASS a genuine regression all the way down to ~1351mm
(1501.1 × 0.9), comfortably above T4's own measured pre-fix number. So, per the brief:

- **FLOOR = 1400mm.** 79.7mm (5.4%) BELOW the whole measured drift envelope (min 1479.74mm) — ordinary
  drift never trips it. 641.5mm (84.6% of the regression value) ABOVE the measured regression number
  (758.5mm) — a regression that reproduced T4's pre-fix mechanism trips it with wide margin. Not
  reverse-engineered from "smallest number that passes" — any value in roughly [800, 1479] would have
  "worked"; 1400 was chosen as a round number with real, stated margin on both sides.
- **BAND = measured baseline ±10%** → `[1350.96, 1651.17]` mm. A second, tighter, independent check on the
  identical quantity, layered ON TOP of the floor — never the band alone. This is the W-26b-3/U9-2 shape
  (`LEDGER.md` 0930cb2d "floor+band shape adopted as prescribed"), not the lighter one-sided margin
  `W-27c-0a` used (acceptable there only because that rig has zero measured run-to-run variance from a fixed
  seed; this fixture has real, if small, camera/light-angle sensitivity, so a bare margin would be a coin
  bar).
- **Non-regression sanity** (mirroring T4's own `O9-restated` convention, `> 510.9*1.5` on the smaller
  fixture): `ink > PRE_FIX_INK * 1.5` = `> 1137.75mm`, an independent third check tied directly to the
  measured regression number rather than to the current baseline.

## RGR / mutation proof

**RED, on the committed test file itself** (not just the impl script): copied
`tests/unit/scene3d-mkdashramp-dark-end.test.js` into the same scratch export (mechanism reverted) and ran
it with vitest there:

```
✓ the fixture reproduces the CREATE-defaults sphere ...
✓ is deterministic ...
× HEADLINE (T4b) ... — expected 758.5005509047427 to be greater than 1400
× non-regression sanity ... — expected 758.5005509047427 to be greater than 1137.750826357114

Test Files  1 failed (1)
     Tests  2 failed | 2 passed (4)
```

The two identity/determinism tests (unaffected by T4's mechanism) still pass; the two ink-bar tests fail at
exactly the measured RED number — the guard is not vacuous, and it fails for the right reason (the floor
and the non-regression check both trip; the fixture-identity and determinism tests, correctly, do not).

**GREEN, on the current worktree tree** (`dcc91872`, unmodified):

```
✓ tests/unit/scene3d-mkdashramp-dark-end.test.js (4 tests) 8167ms
   ✓ the fixture reproduces the CREATE-defaults sphere (radius 25 / detail 28) ...
   ✓ is deterministic ...
   ✓ HEADLINE (T4b) — d=220 ink has a floor BELOW the measured drift envelope, plus a tight fingerprint band
   ✓ non-regression sanity ...
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

## Guards run (targeted, foreground, one at a time, per AGENT-PROTOCOL)

- `tests/unit/scene3d-mkdashramp-dark-end.test.js` — **4/4** (new file).
- `tests/unit/scene3d-mark-laws-draw.test.js` (T4/T1/T1b's own oracle, Tier-2 slow) — **30/30**, unchanged
  from T4's own closing count. Confirms this unit didn't touch that file or its behavior.
- `tests/unit/scene3d-ribbon-f1b-streaks.test.js` — **36/44**, unchanged from the lane's documented
  pre-existing red set (F1-erode, row 2a; caused by F1-placement, not by this unit). Same 8 named failures,
  same numbers (e.g. `ringNotInkMm2=38.9475`).
- `tests/unit/scene3d-ribbon-wall-coverage.test.js` — **35/36**, unchanged from the lane's documented red
  set (one benign `[vitest-worker]: Timeout calling "onTaskUpdate"` RPC notice under shared-machine load,
  exit path otherwise clean — matches the pre-existing, previously-disclosed noise signature).

`git status --short -- . ':!graphify-out'` before and after: only
`tests/unit/scene3d-mkdashramp-dark-end.test.js` is new; zero existing file was modified — so the F1-erode
red set being byte-for-byte identical is expected, not merely hoped for.

## Bars changed

None. Every assertion in `tests/unit/scene3d-mkdashramp-dark-end.test.js` is NEW (a new file); nothing
existing was widened, tightened, or re-pinned.

**What was ADDED** (per the disclosure convention, stated as new bars since the file is new):

- `tests/unit/scene3d-mkdashramp-dark-end.test.js` — floor `ink > 1400` (mm, sphere/hatch/mkDashRamp d=220,
  creation-defaults insert pipeline, camera 'a'). Measures: total path-length ink (mm) the object's own
  surface fill contributes, summed over `group.scenePaths` exactly as `scripts/audit/scene3d-capture.js`'s
  `inkMm` does.
- Same file — band `[BASELINE*0.9, BASELINE*1.1]` where `BASELINE = 1501.0636578167772`. Measures the same
  quantity, as a tighter fingerprint check.
- Same file — non-regression sanity `ink > 758.5005509047427 * 1.5`. Measures the same quantity, tied to
  the historically-measured pre-fix number.
- Same file — fixture-identity (`radius === 25`, `detail === 28`, `primitive === 'sphere'`) and determinism
  (3 builds agree to the mm) — sanity/precondition checks, not ink bars.

## Open follow-ups

- None identified. The guard is scoped exactly to row 1a's ask (floor + band on the named cell, floor below
  the measured envelope) and does not touch or re-scope any other unit's territory (F1-placement,
  F1-erode, W-36c, W-36d).

## Files touched

- `tests/unit/scene3d-mkdashramp-dark-end.test.js` (new, 4 tests).
- `docs/3d-audit/lane-reports/T4b-impl.md` (this report).

REPORT docs/3d-audit/lane-reports/T4b-impl.md — DONE — floor 1400mm below the measured 1479.74mm envelope, ±10% band, RED reproduces T4's 758.5mm.
