STATUS: DONE

# T3 (W-05b/W-06b plan, unit U3) — mkDashRamp LOW-density row-coverage floor (user-reports/10.png)

- **Lane:** fill-audit-a3
- **Worktree:** `.claude/worktrees/fill-audit-a3`
- **Branch:** `3d-scene/fill-audit-a3`
- **Base sha:** `8780e97c` (F1-width-bar-b checkpoint, tests-only)
- **Port:** 8475
- **Plan:** `docs/3d-audit/lane-reports/W-05b-W-06b-plan.md` §3.3 + §7 unit U3, LEDGER row 6
- **User's complaint (`user-reports/10.png`):** "the W-06 after draws ONE dash on the whole sphere at
  d=1 — from a design perspective not helpful." Coordinator's own re-measurement (SESSION-SUMMARY §5):
  5 dashes at d=1, non-monotone count `5,2,9,56,416` across the density sweep.
- **Acceptance bar (two independent halves, gated separately, both mutation-tested):**
  1. **Sparse-but-complete** — ≥ ~40 dashes on the 40mm sphere at d=1, never a single stroke.
  2. **Monotone** — dash count non-decreasing from d=1 up through med.

## Which half each guard gates (blocking, per §0 rule 1)

- `scene3d-mkdashramp-low-end.test.js`'s **O6** describe block gates **sparse-but-complete only**: asserts
  `stat.marks >= 40 && stat.marks > 1` at d=1, sphere/hatch. It says nothing about monotonicity.
- Its **O7** describe block gates **monotone only**: asserts the mark-count sequence at d=1,5,10,25,50 is
  non-decreasing, on BOTH sphere and torus. It says nothing about the sparse-end count reaching 40.
- **Mutation proof, both, blocking:** a scratch mutant (the live post-fix source, string-patched to strip
  `rowFloor: true` from `mkDashRamp`'s own `MK` entry, fed through `loadVecturaRuntime`'s
  `scriptOverrides` — never `git stash`, never edited in the reviewed worktree) reproduces the **exact**
  pre-fix numbers: `marks=7, rows=3` at d=1 (O6's mutation-kill), and the sequence `[7,7,6,12,73]` with a
  real drop at d=5→d=10 (O7's mutation-kill). Both are asserted as hard equalities in the test file, not
  just "less than" — the mutant reproduces the plan's own re-derived RED digit-for-digit.

## Fixture (stated per binding checklist item 3, in every number below)

`Vectura.AlgorithmRegistry.scene3d.generate` driven directly with `Scene3D.Params.PRIMITIVE_PARAM_DEFAULTS`
("addLayer" rig — the same params `engine.addLayer('scene3d')` deserialization defaults to; the
established convention every RGR test in this lane's sibling oracle, `scene3d-mark-laws-draw.test.js`,
uses) and, separately, `Scene3D.Params.PRIMITIVE_CREATE_DEFAULTS` ("create" rig). Camera
`Scene3D.Params.DEFAULT_CAMERA` (angle `'a'`), sun directional az135/el45, mapper `hatch`, fillAngle 45,
penWidth 0.3. **Ground disabled throughout — no ink total in this report includes ground ink.**

## RED, re-derived on this unit's own base sha `8780e97c` (pinned explicitly, never `HEAD`)

T2-3's own self-test used `git show HEAD:` and went silently RED at its own landing commit once `HEAD`
moved past the fix (`T2-3-review.md`). My new test file pins the literal sha `8780e97c` instead, so the
RED reproduction stays correct forever regardless of future commits.

`sphere/hatch/mkDashRamp`, addLayer rig, small fixture:

| d | marks | rows | ink (mm) |
|---|---|---|---|
| 1 | 7 | 3 | 671.6 |
| 5 | 7 | 3 | 671.6 |
| 10 | 6 | 3 | 605.4 (**non-monotone**: drops from d=5) |
| 25 | 12 | 4 | 683.7 |
| 50 | 73 | 8 | 926.5 |

`torus/hatch/mkDashRamp`, same rig:

| d | marks | rows | ink (mm) |
|---|---|---|---|
| 1 | 15 | 3 | 1221.2 |
| 5 | 17 | 4 | 1409.9 |
| 10 | 18 | 4 | 1082.5 |
| 25 | 28 | 5 | 1416.5 |
| 50 | 79 | 7 | 1219.9 |

## Mechanism (GREEN)

`surface-fill.js` `algoCoverage()`'s `isMarkLaw()` branch returned the hardcoded `MK_ROW_COV = 1/3` for
every mark law. At the sparse end (masterPitch 5.8mm on a 40mm sphere at d=1) that keeps only 3 of the
master grid's rulings as mark-law rows — too few for any mark language to carry a sparse-but-complete
texture. New `markRowCoverage()` (placed right after the `MK` table), gated `MK[TONE_ALGO].rowFloor` —
**set ONLY on `mkDashRamp`'s own `MK` entry, not on `mkTick`** (mkTick's own sparse-end work is
T2/T2-3's, a different mechanism — the cross-row stagger — and is explicitly out of this unit's scope):

```
const MK_ROW_TARGET_PEN = 16; // 4.8mm ceiling at a 0.3mm pen
const markRowCoverage = () => {
  const law = MK[TONE_ALGO];
  if (!law || !law.rowFloor) return MK_ROW_COV;
  const ceilingMM = MK_ROW_TARGET_PEN * penWidth;
  return clamp(masterPitch / Math.max(1e-6, ceilingMM), MK_ROW_COV, 1);
};
```

`solveAt()`'s row-pitch divisor `R` and the diagnostic `mark.rowPitch` publish both now call the SAME
`markRowCoverage()`, so the scaffold `algoCoverage` describes and the tone solve that draws onto it never
disagree (the plan's own explicit requirement — "R must read the same coverage").

**Byte-identity arithmetic** (why 16 pen and not some other value, matching the plan's own derivation):
- d=50: masterPitch 1.501mm / 4.8mm = 0.3127 < 1/3 → clamps to `MK_ROW_COV` exactly → byte-identical.
- d=220: masterPitch ~0.35mm / 4.8mm = 0.073 → clamps to `MK_ROW_COV` → byte-identical.
- d=1: masterPitch 5.816mm / 4.8mm = 1.212 → clamps to 1 (the max) → far more rows survive.

## GREEN

`sphere/hatch/mkDashRamp`:

| d | marks | rows | ink (mm) |
|---|---|---|---|
| 1 | **46** (bar ≥40, MET) | 6 | 1160.9 |
| 5 | 46 | 6 | 1160.9 |
| 10 | 62 | 7 | 1306.5 |
| 25 | 63 | 7 | 1307.0 |
| 50 | **73 (unchanged)** | 8 | 926.5 (unchanged) |

`torus/hatch/mkDashRamp`:

| d | marks | rows | ink (mm) |
|---|---|---|---|
| 1 | 37 | 4 | 1280.4 |
| 5 | 51 | 5 | 1432.7 |
| 10 | 70 | 6 | 1630.3 |
| 25 | 77 | 6 | 1500.6 |
| 50 | **79 (unchanged)** | 7 | 1219.9 (unchanged) |

Both sequences (46,46,62,63,73 and 37,51,70,77,79) are monotone non-decreasing. `d=50` mark counts are
bit-for-bit unchanged on both primitives, confirming the byte-identity arithmetic above.

**Real pipeline, both rigs** (`scripts/audit/scene3d-capture.js --rig create` and `--rig addLayer`):
sphere/hatch/mkDashRamp **low** ink went 826.4mm (T4's own post-T4 number) → **1518.8mm**; **med**
(1177.4mm) and **max** (1501.1mm) are **unchanged from T4/T4b's own numbers** — Jay's ≥1500mm bar at
d=220 is still met. torus low went 921.9mm (T4's own number) → 955.8mm; med (589.6mm) and max (698.5mm)
unchanged. `sphere/hatch/ladder` control: 434.7 / 1343.1 / 5002.4mm, identical to T4's own reported
numbers, on both rigs.

## What I saw (native-resolution crops, per protocol)

Compared `docs/3d-audit/fill-audit/after/T3/shots/B/sphere__hatch__mkDashRamp__low__a.webp` directly
against the top-level pre-T1 gallery baseline
(`docs/3d-audit/fill-audit/shots/B/sphere__hatch__mkDashRamp__low__a.webp` — the picture matching the
user's original "one dash" complaint: a handful of scattered long strokes on an otherwise bare sphere).
**After this unit: the whole sphere is covered by 6 curving rows of dash/band texture**, running from
short discrete dashes with visible gaps near the upper-right highlight to near-continuous banded rulings
near the lower-left terminator — a legible, complete light-to-dark gradient, not a bare sphere with a
stray mark. A 2×-native crop of the highlight region shows individual rows resolving into clearly
distinguishable short dashes with real gaps (the sparsest row has just 1-2 short segments) — reads as
sparse and discrete, not one dash. A 2×-native crop of the dark region shows tightly bunched multi-pass
bands approaching continuous ink near the terminator, with small visible breaks still present — genuine
duty-cycle saturation, not a flat slab. Torus/hatch/low shows the same improvement in kind.
`sphere__hatch__mkDashRamp__max__a.webp` is unaffected — reads identically to T4's own described picture
(even gradient, no slabs), confirming byte-identity holds visually as well as numerically at d=220.

## Byte-identity sweep — coverage stated as a fraction (per §0 rule 2)

`MARK_LAWS` lists 12 raw internal shapes, but only **4** (`mkDotScreen`, `mkTick`, `mkDashRamp`,
`mkScribble`) are members of the CURRENT `Vectura.SCENE3D_TONE_LAWS` roster — **verified live**, not
assumed. The other 8 (`mkLozenge`, `mkChevron`, `mkComma`, `mkSFlick`, `mkCrossPlus`, `mkTriangle`,
`mkDotLozenge`, `mkRadialFlick`) are absent from both `IDS` and `ALIASES`: any `toneLaw` string naming
them fires `"unknown toneLaw ... falling back to ladder"` and resolves identically to plain `ladder`
regardless of this fix — confirmed live during my own first draft of this test file, which originally
(wrongly) claimed a 14-law/126-cell "full roster" sweep and would have silently re-tested `ladder` eight
redundant times under that false label. Corrected before shipping. `fineLadder`/`phaseFineLadder` are
valid `ALIASES` into `ladder`, but the single-key `clampStyleParam` resolution this harness uses cannot
set their sibling `rungMode` sub-param, so driving them here risks the same silent-redundancy defect —
excluded for the same disclosed reason.

**Reachable roster swept (100% of it): `mkDotScreen`, `mkTick`, `mkScribble`, `ladder`.** 3 primitives ×
3 densities × 4 laws = 36 cells on the addLayer rig, plus a 12-cell spot check on the create rig. **0
mismatches on either rig.** A dedicated live-reachability test
(`roster reachability, verified live against Vectura.SCENE3D_TONE_LAWS`) pins this claim so a future
roster change cannot make the sweep stale silently.

## Guards run (targeted, foreground, one file at a time)

| file | result |
|---|---|
| `scene3d-mkdashramp-low-end.test.js` (new, this unit) | **13/13** |
| `scene3d-mark-laws-draw.test.js` | **30/30** (unchanged count from T4's own 30/30 — one test re-scoped, see Bars changed) |
| `scene3d-mkdashramp-dark-end.test.js` (T4b's d=220 floor/ceiling) | **4/4**, unchanged |
| `scene3d-mktick-wedge.test.js` (T2-3's, **KNOWN RED**) | **44 passed / 2 skipped / 1 FAILED FILE** — unchanged from the state `T2-3-review.md` documents (its own `git show HEAD:` self-test broke at its own landing commit). Owned by T2-3b. Not touched here; re-run before and after this unit's commit, identical both times. |
| `scene3d-ribbon-width-bar.test.js` | **10/10** |
| `scene3d-ribbon-width-create-rig.test.js` | **12/12** |
| `scene3d-ribbon-f1b-streaks.test.js` | **44/44** |
| `scene3d-ribbon-wall-coverage.test.js` | **36/36** |
| `scene3d-ribbon-f1-amp.test.js` | **47/47** |
| `scene3d-curved-density-floor.test.js` | **14/14** |
| `scene3d-curved-density-sparse-end.test.js` | **20/20** |

`[FillBoolean] polygon union failed on degenerate geometry` on stderr in several runs is documented
pre-existing noise (unrelated erosion pipeline), not a regression.

## Pre-existing red (per §0 rule 5)

`scene3d-mktick-wedge.test.js` is red exactly as `T2-3-review.md` documents (44/2/1-failed), caused by
T2-3's own `git show HEAD:` self-test resolving differently once `HEAD` moved past the fix it measures.
Not caused by, not fixed by, and not touched by this unit.

## Bars changed (mandatory, per §0 rule 6)

- `tests/unit/scene3d-mark-laws-draw.test.js:~551` — the `W-06b (T4)` describe block's "ink is monotone
  non-decreasing d=1 -> 50 -> 220" test. **Old:** `expect(med).toBeGreaterThan(low); expect(max)
  .toBeGreaterThan(med);`. **New:** `expect(low).toBeGreaterThan(0); expect(max).toBeGreaterThan(med);`.
  **Why:** T3's row-coverage floor legitimately gives the sparse end (d=1) more surviving rows (3 → 6 on
  this fixture) to reach the ≥40-dash bar, which draws MORE total ink than the old, under-served 3-row
  scaffold — measured 671.6 → 1160.9mm at d=1, now ABOVE d=50's UNCHANGED 926.5mm. This is the
  count-vs-ink relationship changing at the sparse end by design (the user's complaint and Jay's bar are
  about dash COUNT, not raw ink monotonicity across the whole density range), not a lost guarantee. T4's
  own half of this chain (`max > med`, the dark-end band restoration) is completely untouched and still
  gated: d=50 and d=220 are structurally byte-identical before and after T3 (verified in this unit's own
  non-regression describe block via exact mark-count equality, AND in `scene3d-mkdashramp-dark-end.test.js`,
  T4b's own floor, still 4/4).
- No other existing threshold, tolerance, population, fixture, or pinned fingerprint was changed.

## Files touched

- `src/core/scene3d/surface-fill.js` — `MK.mkDashRamp`'s entry (`+rowFloor: true`), new
  `MK_ROW_TARGET_PEN` constant, new `markRowCoverage()` helper (placed right after the `MK` table),
  `algoCoverage()`'s `isMarkLaw()` branch, `solveAt()`'s `R` divisor, the diagnostic `mark.rowPitch`
  publish. All changes gated on `MK[TONE_ALGO].rowFloor`, true ONLY for `mkDashRamp`.
- `tests/unit/scene3d-mark-laws-draw.test.js` — one existing test re-scoped (see Bars changed above); no
  other line touched.
- `tests/unit/scene3d-mkdashramp-low-end.test.js` (new).
- `docs/3d-audit/fill-audit/after/T3/report.json` + `shots/B/*.webp` (12 mkDashRamp cells across both
  rigs + 6 ladder-control cells across both rigs, 2 manifests).

## Open follow-ups

- Torus at d=1 (37) sits just under the sphere's 40-dash bar — the bar was stated for the 40mm sphere
  specifically (Jay's own wording); torus is reported as a secondary check, not gated to 40.
- Mark-law roster coverage discovery: 8 of the 12 raw `MARK_LAWS` internal shapes (`mkLozenge`,
  `mkChevron`, `mkComma`, `mkSFlick`, `mkCrossPlus`, `mkTriangle`, `mkDotLozenge`, `mkRadialFlick`) are
  dead code from the current app's perspective — absent from `Vectura.SCENE3D_TONE_LAWS.IDS` and
  `.ALIASES`, unreachable via any styleTable. This predates this unit and is orthogonal to `rowFloor`
  scoping, but is worth a follow-up W-id if anyone wants to either wire them into the roster or delete
  them.
- `scene3d-mktick-wedge.test.js`'s known-red self-test (T2-3b's) remains open, untouched.

REPORT docs/3d-audit/lane-reports/T3-impl.md — DONE — d=1 dashes 7->46 (bar >=40 met), monotone [46,46,62,63,73], d=50/220 unchanged.
