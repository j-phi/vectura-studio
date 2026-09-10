STATUS: PLAN-READY

# W-31 — plan: crosshatch CELL SHAPE. Both families evenly spaced except where tone demands.

Planner, read-only in the repo. Every number below was measured by this planner in scratch `git archive`
exports with a symlinked `node_modules`, foreground, one vitest file at a time:

- `/private/tmp/claude-501/scratch-W31` = **`e31d8591`** (fill-audit-a2 HEAD, W-36 landed, v1.3.99)
- `/private/tmp/claude-501/scratch-W31-pre` = **`0930cb2d`** (the tree the montage Jay annotated was shot on)

The W-33 implementer is live in `.claude/worktrees/fill-audit-a2`; **nothing in any worktree was read,
edited or stashed** after the initial `git archive`. Both scratch dirs are deleted at the end of this plan.

- Lane: `fill-audit-a2` · worktree `.claude/worktrees/fill-audit-a2` · port 8475 · branch `3d-scene/fill-audit-a2`.
- Base for the implementer: **whatever W-33 lands** (W-31 is behind W-33 in the ledger's revised resume
  order). W-33 edits `refineFillRunTurns` in the same file, so the implementer **must re-derive the RED
  table on its own base** before writing any fix. The mechanism does not change — W-33 refines the turns
  *inside* an already-placed ruling; W-31 is about *where the next ruling lands*.
- USER rule (Jay, verbatim, on `user-reports/13-w26-judge-montage.webp`): *"I'm unclear on why some of
  these sections have diamond/square gaps and some have rectangular gaps - are lines not being evenly
  spaced? The only reason there should be greater amounts of space in some areas is if we're trying to
  represent highlights on a shape (less ink = more light)"*.

**The rule, restated so it can be measured.** Tone is a scalar field shared by both families. When the tone
opens the spacing, it must open *both* families — the cell gets **bigger**, it does not get **longer**.
So: **cell AREA is free (that is the tone); cell ASPECT must be 1** — everywhere, at every tone. That
restatement is what makes W-31 testable without a "zone map" exemption, and §3.1 shows why it is the right
reading of Jay's sentence rather than a convenient one.

---

## 0. What the montage actually shows, panel by panel (LOOKED at, native-resolution crops)

`13-w26-judge-montage.webp` is the **W-26 judge** montage, three EXTRA CELLs, before/after each:

| panel | cell | has cells? |
|---|---|---|
| EXTRA CELL 1 | ellipsoid / **contour** / ladder / D50 | **No.** One family. Its "gaps" are latitude bands, not cells. |
| EXTRA CELL 2 | cone / **contour** / fineLadder / D50 | **No.** One family. |
| EXTRA CELL 3 | cylinder / **crosshatch** / ladder / **D220** | **Yes — and BOTH panels show both shapes.** |

So Jay's "some of these sections … some …" is a **within-panel** observation on EXTRA CELL 3. Read at
native resolution, both the BEFORE (`9fa159f0`) and AFTER (`3c88605f`) cylinder show: **square/diamond
cells across the central third of the barrel**, **elongated rectangles and slivers down the left and right
limb columns**, and a **different, denser pattern across the top cap**. The AFTER panel (the 0.91-coverage
saturated state W-26b later fixed) shows the same shape gradient as a field of black holes: rounded squares
in the middle, horizontally-crushed rectangles at both limbs.

I reproduced that reading numerically on `e31d8591` — see §1.3, where the same cylinder's cell aspect runs
**0.63 → 1.02 → 1.65** from the left column to the right. Jay's eye and the instrument agree.

---

## 1. The instrument, and what it measures

### 1.1 Instrument (DEVICE space, source-free — no patched build required)

Raw runs via the documented in-repo idiom (wrap `V.Scene3D.SurfaceFill.buildObject`, restore in `finally` —
`tests/unit/scene3d-crosshatch-parity.test.js:84-98`), front faces only (`!run.back`), grouped by
`run.fam` (`A#0` / `A#1`, exactly two asserted) and `run.lineIndex`. Run points are `{x, y, z}` in
**device millimetres** (verified), so everything below is device space, as the brief requires.

1. **Local perpendicular gap.** For each consecutive ruling pair (i, i+1) of one family, at every interior
   vertex of ruling i take the local unit normal (from the i−1/i+1 chord) and shoot a segment ±`cap`; the
   nearest crossing of ruling i+1 is the **local gap** `g(x, y)`. This is the same "clearance measured
   across the flow" construction `contFieldAniso` already uses (`surface-fill.js:9772-9803 acrossClear`).
2. **Windows.** Bin the samples into square windows of side `3 × max(medGapA, medGapB)` (min 2.5 mm);
   a window counts only if it holds **≥3 samples of each family**.
3. **Cell aspect** = `median(gA in window) / median(gB in window)`.
4. **INTERIOR** = windows whose centre lies inside the middle 70 % of the ink bbox in **both** u and v.
   This is a **stated geometric exemption**, not a tolerance: it drops the silhouette ring (where the
   surface leaves the view) and the chart-pole ring (where both families converge to a knot and the aspect
   is a 0/0). Everything else is measured.
5. **Flat-tone control.** The same cell with `p.lights = []`. `ladderCov(I)` is then constant, so **both
   families ask the walk for exactly the same constant `want`** — any residual aspect deviation is
   placement, not tone. This is the decisive control and it is what separates class (a) from (b)/(c).

**Instrument validation (must be repeated by the implementer).** Ray cap 2.0 mm vs 6.0 mm at d=220 moves
the per-column aspect medians by ≤0.03 (cylinder 0.63/0.88/1.02/1.17/**1.65** vs 0.63/0.86/1.02/1.17/**1.67**);
only the extreme p95 tail moves (2.68 → 2.71). The signal is not a cap artefact.

### 1.2 Global numbers on `e31d8591` — W-36's job is done, and it is NOT what Jay is seeing

`{sphere, cylinder, torus, ellipsoid, cone} × crosshatch × ladder × d ∈ {50,220} × camera ∈ {a,b}`,
audit-capture rig (`PRIMITIVE_PARAM_DEFAULTS` + `DEFAULT_CAMERA` / `yaw 40 pitch −15`, sun 135°/45°,
ground+backdrop off, `fillAngle 45`, `toneLaw ladder`, BOUNDS 320×220, pen 0.3):

| cell | nA / nB | med gap A / B (mm) | **median cell aspect** | cells outside [0.85,1.18] |
|---|---|---|---|---|
| sphere d=50 a | 9 / 11 | 3.247 / 3.156 | 1.027 | 0.538 |
| sphere d=50 b | 12 / 12 | 3.198 / 3.153 | 0.999 | 0.333 |
| sphere d=220 a | 37 / 48 | 0.753 / 0.720 | 0.994 | 0.477 |
| sphere d=220 b | 48 / 48 | 0.765 / 0.764 | 1.001 | 0.272 |
| cylinder d=50 a | 12 / 12 | 3.285 / 3.163 | 0.995 | 0.667 |
| cylinder d=220 a | 52 / 54 | 0.674 / 0.652 | 1.019 | 0.634 |
| cylinder d=220 b | 59 / 57 | 0.633 / 0.645 | 0.984 | 0.458 |
| torus d=50 a | 7 / 7 | 3.577 / 3.319 | 1.125 | 0.750 |
| torus d=220 a | 25 / 25 | 0.792 / 0.762 | 1.018 | 0.529 |
| ellipsoid d=50 a | 9 / 11 | 3.181 / 3.160 | 1.036 | 0.500 |
| ellipsoid d=220 a | 36 / 47 | 0.747 / 0.737 | 0.994 | 0.407 |
| cone d=50 a | 9 / 10 | 3.368 / 3.444 | 0.854 | 0.625 |
| cone d=220 a | 40 / 39 | 0.755 / 0.749 | 0.968 | 0.663 |

**Read this carefully.** The *median* cell is square on every cell (0.854–1.125) and the *global* median
gaps match within a few per cent — W-36 delivered exactly what it promised. **The defect W-31 exists to
name is the SPREAD**: 27–75 % of neighbourhoods are outside [0.85, 1.18], and it is not noise, it is a
systematic left-to-right ramp (§1.3).

### 1.3 Where the non-square cells are, and the smoking gun

Per-column (left→right) **median cell aspect** and out-fraction, and the same cell with the **light turned
off** (`want` provably constant for both families):

| cell | u 0–.2 | .2–.4 | .4–.6 | .6–.8 | .8–1 | interior out |
|---|---|---|---|---|---|---|
| cylinder d=220 a **LIT** | 0.64 | 0.85 | 1.02 | 1.20 | **1.65** | 0.486 |
| cylinder d=220 a **FLAT** | **0.63** | 0.88 | 1.02 | 1.17 | **1.65** | 0.481 |
| cone d=220 a FLAT | **0.60** | 0.77 | 1.03 | 1.40 | **1.75** | 0.713 |
| sphere d=220 a FLAT | 0.72 | 0.94 | 1.01 | 1.09 | **1.51** | 0.235 |
| ellipsoid d=220 a FLAT | 0.72 | 1.02 | 0.99 | 0.97 | 1.28 | 0.132 |
| torus d=220 a FLAT | 0.94 | 0.99 | 1.00 | 1.05 | **1.51** | 0.537 |
| **sphere d=220 b FLAT** | 1.08 | 0.98 | 1.00 | 1.02 | 0.93 | **0.099** |

**The lit and flat columns are the same.** Tone is *not* what is making the cells rectangular.

Now the per-family medians behind those ratios, on the **flat** control, where the walk asked for a
**constant 0.75 mm** for both families:

| cell (FLAT, want = 0.75 mm constant) | family | u 0–.2 | .2–.4 | .4–.6 | .6–.8 | .8–1 |
|---|---|---|---|---|---|---|
| cylinder d=220 a | **A** | 0.429 | 0.626 | 0.403 | 0.843 | 0.828 |
| cylinder d=220 a | **B** | 0.820 | 0.839 | 0.394 | 0.632 | 0.421 |
| cone d=220 a | **A** | 0.464 | 0.504 | 0.753 | 0.853 | 0.777 |
| cone d=220 a | **B** | 0.774 | 0.854 | 0.747 | 0.506 | 0.428 |
| sphere d=220 a | **A** | 0.495 | 0.638 | 0.579 | 0.793 | 0.829 |
| sphere d=220 a | **B** | 0.824 | 0.788 | 0.568 | 0.633 | 0.485 |
| ellipsoid d=220 a | **A** | 0.607 | 0.721 | 0.591 | 0.757 | 0.786 |
| ellipsoid d=220 a | **B** | 0.785 | 0.753 | 0.573 | 0.714 | 0.581 |
| sphere d=220 **b** | **A** | 0.784 | 0.793 | 0.667 | 0.753 | 0.646 |
| sphere d=220 **b** | **B** | 0.656 | 0.749 | 0.659 | 0.796 | 0.784 |

**Every family ramps, and the two families ramp as exact mirror images.** The engine is asked for a flat
0.75 mm and delivers 0.43 mm at one limb and 0.83 mm at the other — **−43 % / +11 %, with no light behind
it**. Because A ramps up and B ramps down, the *cell aspect* ramps by the product: **0.63 → 1.65** on a
cylinder, **0.60 → 1.75** on a cone. That is Jay's sentence, measured.

Whole-family local-gap spread (p95/p05, front faces, lit rig, all windows): **sphere A 29.0 / B 12.5 ·
cylinder A 10.6 / B 9.1 · cone A 20.4 / B 14.8 · torus A 6.9 / B 6.6 · ellipsoid A 22.1 / B 13.9.**
W-26 measured the *ruling-centroid* adjacent-gap jump at **1.03–1.17**; at the **local** level the same
families run 7–29×. W-26's guard cannot see this — that is the gap W-31 closes.

### 1.4 Is it the crosshatch PAIR? No — it is single-family placement

Control: two **independent single-family `hatch`** runs at `fillAngle 45` and `fillAngle 135` (identical
tone law, no pair machinery at all), measured with the same instrument. Out-fractions, crosshatch vs solo:
sphere d=220 a **0.477 / 0.464** · cylinder d=220 a **0.634 / 0.603** · ellipsoid d=220 a **0.407 / 0.402**
· cone d=220 a **0.663 / 0.676** · sphere d=220 b **0.272 / 0.251**.

**Identical.** W-36's pair budget is not the cause and must not be re-opened (STILL-OPEN's standing
instruction, independently confirmed here).

### 1.5 The second, smaller mechanism: tone is integrated along the ruling, so the two families disagree

From an instrumented scratch build (debug hook on the walk, `e31d8591` + a `window.__W31` push; the hook
was never committed and the scratch tree is deleted):

| cell (LIT) | role | per-ruling `I` p05/p50/p95 | `want` p50/p95 (mm) | `dfMax` hit rate |
|---|---|---|---|---|
| sphere d=220 a | **A** | 0.008 / 0.066 / 0.706 | 0.75 / **3.18** | **0.108** |
| sphere d=220 a | **B** | 0.120 / 0.229 / 0.268 | 0.75 / **0.75** | **0.000** |
| ellipsoid d=220 a | A | 0.014 / 0.056 / 0.701 | 0.75 / **3.18** | **0.111** |
| ellipsoid d=220 a | B | 0.113 / 0.222 / 0.304 | 0.75 / **0.75** | **0.000** |
| cylinder d=220 a | A / B | 0.102–0.483 / 0.109–0.498 | 1.27 / 1.27 | 0.019 / 0.000 |
| torus d=220 a | A / B | 0.158–0.760 / 0.204–0.733 | 3.17 / 3.17 | 0.120 / 0.120 |

On a lit sphere the **same tone field** gives family A a `want` of up to 3.18 mm and family B a flat
0.75 mm — a **4.2× disagreement in the same neighbourhood** — and the `dfMax` ceiling then truncates only
family A (10.8 % of its steps, 0.0 % of B's). The visible effect: the worst-case aspect roughly **doubles**
when the light is on — sphere p95 **4.02 (flat) → 7.66 (lit)**, ellipsoid **4.89 → 8.62**, sphere d=50
**3.24 → 6.53**. This is the one part of the defect that is literally about the highlight: the highlight is
opened by **one family only**, so Jay gets a rectangle where he expects a bigger square.

### 1.6 What the `0930cb2d` montage tree showed (same instrument, same rig)

| cell, d=220 cam a | 0930cb2d (montage tree) | e31d8591 (today) |
|---|---|---|
| cylinder — measurable windows | **7** | **183** |
| cylinder — median cell aspect | **0.134** | **1.020** |
| cylinder — out-fraction | **1.000** | 0.661 |
| sphere — windows / aspect / out | **5 / 0.393 / 1.000** | 145 / 1.007 / 0.441 |
| ellipsoid — windows / aspect / out | **5 / 0.470 / 0.800** | 136 / 0.989 / 0.346 |
| **cone** — windows | **0** (instrument has nothing to divide) | 126 |

STILL-OPEN's claim that W-31 was *"unmeasurable today"* before W-36 is confirmed quantitatively: family B
had 3–10 rulings against A's 69–94, so there were 0–7 comparable neighbourhoods on a whole primitive and
every one of them was a 7:1 sliver. **W-36 turned "there are no cells" into "the cells are square on
average but ramp 2.7× across the form."** That is real progress and it is also exactly why W-31 could only
be planned now.

---

## 2. Root cause, per class, with file:line

Line numbers are `src/core/scene3d/surface-fill.js` at **`e31d8591`**; re-locate after W-33.

### Class (a) — genuine tone modulation. ALLOWED, and today it is NOT the problem.
`ladderCov` (`:4621-4644`) → `ladderPairWantedPitch` (`:4720-4723`) → `want` (`:9860-9864`). Both families
read the **same** `ladderCov` and, at `crossDensityRatio = 1`, the **same** half of `CROSS_PAIR_BUDGET`
(`:4714-4719`), so the tone-demanded pitch is identical for the pair by construction. Proven by the flat
control: turning the light off changes the aspect columns by ≤0.03. **Nothing to fix here; the exemption
Jay's rule grants is already honoured in the tone TARGET.**

### Class (b) — projection. Real, but it is NOT what makes the cells rectangular.
`perpPitch` (`:5236-5246`) is computed from `smp.dA` / `smp.dB`, the **screen-space** chart derivatives, so
the ladder walk already states its spacing in device millimetres — a surface turning away from the camera
does **not** get its target pitch compressed at the ruling level. (The Zander foreshortening factor
`foreAt`, `:9666-9682`, is applied only by `contFieldFore`, and the file's own comment calls uncorrected
foreshortening *"false limb-darkening"* — i.e. the codebase already rules that limb crowding with no light
behind it is a defect, not a feature.) **Foreshortening alone would compress both families at a limb and
leave the aspect at 1. It does not explain a mirror-image ramp.**

### Class (c-1) — THE DEFECT. One scalar step per ruling, spent against a ruling-MEAN metric.
- `probe()` returns `mmPerFrac: mmSum / mmW` — an **area-weighted mean over the whole ruling** of the local
  across-family clearance (`:9762` accumulate, **`:9766`** return).
- The walk takes **one scalar** step: `df = clamp(want / pb.mmPerFrac, dfMin, dfMax)` (**`:9899`**),
  `f += df` (**`:9925`**), and emits the ruling at a **constant parameter offset** `p.frac`
  (**`:9955`**, with a single scalar `pitchStep = unitOff × p.df`).
- Therefore the **achieved local gap** at a point is `want × perpPitch_local / perpPitch_meanOfRuling`.
  A family whose local clearance varies ~2× along its rulings has local gaps that vary ~2×; the crossing
  family's clearance field is the mirror of it, so **the cell aspect varies ~4×**.
- Measured confirmation: with `want` pinned flat at 0.75 mm, family A delivers 0.429 mm → 0.828 mm and
  family B 0.820 mm → 0.421 mm across the same cylinder (§1.3). The ruling-MEAN metric itself only varies
  ~1.8× between rulings (`mmPerFrac` p05/p95 = 29.6/54.0 on that cell) — the variation the walk cannot see
  is the variation **inside** each ruling.

**This is the P0 ladder-gap rule (W-26 R1a) generalised from ruling centroids to local geometry**, which is
exactly what `fill-audit-handoff.md` item 11 says W-31 is.

### Class (c-2) — direction-dependent tone integration (secondary, ~2× on the worst case).
`probe()` returns `I: iSum / wSum` (**`:9766`**), the ruling's **area-weighted mean intensity**, and `want`
is computed once per ruling from it (`:9860`). Two families at 45° and 135° integrate the same tone field
along different directions, so they disagree (§1.5: 4.2× on `want` p95, sphere d=220 a). The `dfMax`
ceiling (`:9839`, `6 * dfMaxMul / max(6, count)`) then bites only the family that asked wide (10.8 % vs
0.0 %). **Any per-ruling scalar tone target is direction-dependent — this cannot be fixed by a better
average (measured, §4 Rank 2); only a per-sample target removes it.**

---

## 3. The RED oracle

New file: **`tests/unit/scene3d-crosshatch-cell-shape.test.js`**. Rig identical to
`scene3d-crosshatch-parity.test.js` (do not invent a second rig).

### 3.0 The bar, and why [0.85, 1.18]

- It is **tighter than the global bar it refines**: W-36's P2 already requires the whole-cell median-gap
  ratio in **[0.80, 1.25]**. A LOCAL bar must be at least as tight, or the local statement is weaker than
  the global one it claims to strengthen.
- It is **attainable by today's engine, not aspirational**: `sphere d=220 camera b` already sits at
  **interior p05/p95 = 0.88 / 1.12, out-fraction 0.099, per-column band 0.93–1.08**. A real, shipped
  configuration is already inside the bar — the bar is a fact about the engine, not a wish.
- **18 % vs 15 %**: the band is deliberately asymmetric about 1 in the ratio sense (0.85 = 1/1.176), so
  swapping which family is numerator gives the same verdict.

### 3.1 Why there is no tone "zone map" exemption

Jay's exception clause is *"greater amounts of space … to represent highlights"*. Under the ladder's own
contract (`:4602-4606`, *"the spacing IS the tone"*) a highlight raises `want` for **both** families
identically (§2 class (a)). So a legitimate highlight makes the cell **bigger**, never **longer**: aspect
is invariant under tone by construction. **Cell AREA is exempt from every bar below; cell ASPECT is exempt
from none.** That is why this oracle needs no zone map — and the flat-tone control (C1) proves the
exemption is not being smuggled in, because the light is off.

### 3.2 The bars

Cells: `{sphere, cylinder, torus, ellipsoid, cone} × crosshatch × ladder × d ∈ {50, 220} × camera ∈ {a, b}`.

| # | bar | RED at `e31d8591` | notes |
|---|---|---|---|
| **C1** | **flat-tone control** (`lights: []`): every one of the 5 interior column medians of cell aspect ∈ **[0.85, 1.18]** | **FAILS on 4 of 5 primitives at d=220 cam a**: cylinder **0.63 … 1.65**, cone **0.60 … 1.75**, sphere **0.72 … 1.51**, torus 0.94 … **1.51**; ellipsoid 0.72 … 1.28. Passes only sphere cam b (0.93–1.08). | the headline. Light is OFF, so no exemption can apply. |
| **C2** | flat-tone control: within ONE family, interior local-gap **p95/p05 ≤ 2.0** | **FAILS**: 6.9–29.0 across the roster (§1.3) | the local generalisation of W-26 R1a (which is 1.15 at the ruling level) |
| **C3** | lit rig: per-ruling `want` **p95 ratio A:B ∈ [0.80, 1.25]** | **FAILS**: sphere **4.24**, ellipsoid **4.24**; torus/cylinder pass (1.00) | class (c-2). Needs the walk hook OR the equivalent read off emitted local gaps — see 3.3 |
| **C4** | lit rig: `dfMax` hit-rate difference between roles ≤ **0.05** | **FAILS**: sphere 0.108 vs 0.000, ellipsoid 0.111 vs 0.000 | the ceiling must not bite one family only |
| **C5** | lit rig: **≥40 interior windows** with ≥3 samples per family at d=220 (measurability floor) | passes today (36–91); **fails at `0930cb2d` (0–7)** | keeps a future regression from making the oracle vacuous by starving a family again |
| **C6** | **guards unmoved** (see §4) | pass today | W-36 P1–P6, W-26 R1a, W-26b coverage, plot-safety, byte-identity |

**Do NOT state C1 as an out-fraction over all windows.** Column medians are the honest statistic: an
out-fraction can be gamed by shrinking the interior box, and the *ramp* is the defect, not the tails.

### 3.3 Measuring C3/C4 without a debug hook

C3/C4 as stated read the walk's internals. Two acceptable routes, in preference order:
1. **Derive them from geometry.** For each family compute the *ruling-level* median gap as a function of
   position along the walk and require the two families' gap-vs-position profiles to agree within the same
   [0.80, 1.25] band. This is source-free and is what the emitted picture actually shows.
2. If (1) proves too noisy at d=50, the implementer may add a **read-only** debug export
   (`SurfaceFill.__lastWalk`, populated only when a module-level flag is set by the test) — but this is a
   source change and must appear in the impl report's file list.

### 3.4 Mutation checks (all three must be run and reported)

| mutation | expected |
|---|---|
| revert `surface-fill.js` to the pre-fix blob, keep the test | **C1 fails on ≥4 of 5 primitives** — the RED proof |
| force `probe()`'s `mmPerFrac` back to the area-weighted mean while keeping the rest of the fix | **C1 fails again** — proves C1 measures the placement metric, not a fingerprint |
| set `crossDensityRatio = 2` | **C1's band must re-centre on 2.0**, not on 1.0 — proves the bar reads the dial's documented sense (family B's spacing = ratio × family A's) and is not a blanket "aspect must be 1" that would break the user's own control |

---

## 4. Ranked fixes

**Rank 2 and Rank 3 below were prototyped and MEASURED. Rank 1 was NOT prototyped** — it is argued from the
mechanism in §2 and carries a mandatory go/no-go spike (4.1a). That disclosure is deliberate: the W-36 plan
shipped a prototyped Rank 1 and this one does not, and the difference matters.

### Rank 1 — RECOMMENDED mechanism: per-sample ("warped") offset placement, gated to the crosshatch pair

The walk currently advances **one scalar** for a whole ruling. Give it **one step per sample**: ruling i+1
is the offset curve of ruling i at the locally-wanted clearance, so the local gap equals `want` everywhere
in each family and the cell is square by construction.

**Exact edits, `src/core/scene3d/surface-fill.js` (line numbers at `e31d8591`; re-locate after W-33):**

1. **`:9727-9767` (`probe`)** — additionally return the per-sample arrays `mmArr[]` (local `perpPitch` /
   world clearance, already computed at `:9744-9758`) and `wantArr[]` (the per-sample tone target:
   `isEvenLadder() ? (crossShare != null ? ladderPairWantedPitch(smp.I, crossShare.ratio, crossShare.role)
   : ladderWantedPitch(smp.I)) : cfWantedPitch(smp.I)`). The existing scalar returns `I` / `mmPerFrac` stay
   **unchanged**, so every current caller is untouched. *This also discharges class (c-2): the tone target
   becomes per-sample and therefore direction-independent.*
2. **`:9536-9600 (`angleFamily`)`** — add `lineAtWarped(baseFrac, warpArr)`: identical to `lineAt`, but
   each sample is displaced along the family normal in parameter space by
   `(warpArr[k] - mean(warpArr)) * span * {na, nb}`, with `a` clamped to [0,1] and `b` wrapped by `wrap01`.
   Keeping the base line's own `t0`/`len` parameterisation means the clip, `at.steps` and the ruling's
   length are unchanged — only the offset varies along it.
3. **`:9841-9927` (`walk`)** — carry a cumulative `Float64Array warpArr` over the `st+1` samples, initialised
   to 0. Each iteration: probe the current warped line, then `warpArr[k] += wantArr[k] / max(1e-6, mmArr[k])`,
   clamped per-sample to `[dfMin, dfMax]` (the same rails, now per sample). The scalar bookkeeping
   `f` advances by `mean` of the per-sample steps, so `maxN`, `guard` and `creep` are unchanged and the
   family's **count and ink are preserved by construction**.
4. **`:9955` (`emitLine`)** — pass the **mean** step as `pitchStep`, exactly the scalar shape downstream
   already expects. No downstream contract changes.
5. **Gate — this is what protects everything else.** Take the warped path only when
   `crossShare != null && isEvenLadder()`. Every other caller (`contour`, `hatch`, all `contField*`, mono,
   ribbon, flow/screen-cross, the faceted path, the W-01 master grid, Stage 0 / `!toneOn`, and the X-ray
   back pass of every non-crosshatch mapper) reaches the identical old code and is **byte-identical**.

**4.1a — MANDATORY GO/NO-GO SPIKE, before any test or guard work.** Implement step 2 + a minimal step 3 for
the **wrapped-angle branch only** (`Math.abs(da) >= WRAP_MIN_DA`, which is the branch `fillAngle 45` takes
on all five primitives), then run C1's flat-tone control on **cylinder d=220 cam a**. Today's band is
**0.63 … 1.65**. **If the spike does not bring all five column medians inside [0.85, 1.18], STOP and fall
back to Rank 3.** Do not proceed to the full roster, the guards or the evidence capture on a mechanism that
has not cleared its own headline cell.

**Predicted (mechanism, not measured):** C1 column band → inside [0.85, 1.18] on all five primitives;
C2 → ≤2.0; C3/C4 → satisfied by construction (per-sample target); ink within ±5 % of today because the mean
step is preserved. **Risks, in order:** (i) HLR / `refineFillRunTurns` (W-33's code) sees a ruling that is
no longer a chart-straight line — mitigated by the fact that rulings on a sphere/torus are already curved
in the chart, so this introduces no new class of input, but W-33's turn bar must be re-run; (ii) the wrap
branch's `wrap01(b)` can push a warped sample across the seam mid-ruling — clamp `a`, wrap `b`, and assert
no run gains a segment longer than 3× the median; (iii) `p95` outliers at the chart pole are excluded by
the INTERIOR definition and must **not** be chased.

### Rank 2 — per-sample TONE only (fix (c-2), leave (c-1)). **PROTOTYPED AND REJECTED — do not retry.**

Move the tone target inside `probe`'s sample loop and return the area-weighted **harmonic** mean of the
per-sample `want` (i.e. the pitch matching the ruling's mean COVERAGE, which is the linear ink quantity),
then use it at `:9860`. ~10 lines. Measured on `e31d8591`:

| metric | before | after Rank 2 |
|---|---|---|
| `want` p95 ratio A:B, sphere d=220 a (C3) | 4.24 | **1.92** |
| same, ellipsoid d=220 a | 4.24 | **1.84** |
| `dfMax` hit-rate, torus d=220 a | 0.120 / 0.120 | **0.043 / 0.043** |
| **cell-aspect out-fraction, sphere d=220 a (LIT)** | 0.437 | **0.671 — WORSE** |
| **same, cylinder** | 0.691 | **0.821 — WORSE** |
| **same, ellipsoid** | 0.379 | **0.700 — WORSE** |
| **median cell aspect, sphere** | 0.986 | **0.850 — off-centre** |
| **ink, cylinder d=220** | 5209.5 mm | **4543.8 mm (−12.8 %)** |
| ink, sphere / ellipsoid / torus d=220 | 3838 / 4323 / 3396 | 3475 / 3929 / 3037 (**−9 to −11 %**) |

It fixes the metric it targets and **makes W-31's own oracle worse** (it de-syncs the family counts,
sphere nB 48→40) while costing ~10 % ink, which would land P5 at 4543.8 against its 4200 floor with only
8 % headroom. **Rejected. Recorded here so no future unit re-derives it.**

Also measured dead, same session (both one-line variants of `mmPerFrac` at `:9766`): **median** instead of
the area-weighted mean — cylinder column band 0.59 … 1.67 (unchanged); **harmonic mean** — 0.52 … 1.51 and
the measurable-window count collapses 184 → 37. Neither touches the ramp. **The metric's averaging rule is
not the bug; having only one scalar per ruling is.**

### Rank 3 — MEASURE-AND-PIN, and file the placement rewrite. **The shippable-now fallback.**

Land `tests/unit/scene3d-crosshatch-cell-shape.test.js` as a **non-regression ceiling**: the C1 column bands
and C2/C5 values recorded per primitive at today's numbers (nothing tightened, nothing widened), plus the
§1.3/§1.5 tables in the impl report and a CHANGELOG-free docs entry. File Rank 1 as its own unit (**W-31b**,
P2) carrying §4's exact edits and the go/no-go spike. Zero risk to W-36, W-26, W-26b, W-33; ships in one
session. This is what "stop-and-report beats a fudge" prescribes if the round is closing.

**Recommendation to the orchestrator:** run **Rank 1's spike (4.1a) first**. If it clears the cylinder
band, take Rank 1. If it does not, take **Rank 3** — and in either case do **not** take Rank 2.

### Guards that must hold (and the ones that may legitimately move)

Must hold, unchanged: **W-36 P1–P6** (`scene3d-crosshatch-parity` 37/37, incl. P6 byte-identity: sphere
hatch d=50 = 24 fills / 723.4 mm, cylinder hatch d=220 = 145 / 4495.5 mm, sphere contour d=50 = 18 /
656.4 mm; **P5 cylinder d=220 ink ∈ [4200, 5431] — today 5019.6 raw rig / 5209.5 real capture**) ·
**W-26 gap-jump** `scene3d-ladder-uniform-field-spacing` 9/9 (R1a ≤1.15) · **W-26b coverage**
`scene3d-fill-span-verdict` 11/11 (silhouette ink coverage < 0.85) · `scene3d-plot-safety` 5/5 ·
`scene3d-fill-even-spacing` 12/12 · `scene3d-curved-density-sparse-end` 20/20 ·
`scene3d-curved-crosshatch-controls` 18/18 · `scene3d-fill-boundary-ends` · `scene3d-fill-ruling-continuity`.

May legitimately move **only with a `## Bars changed` entry and the old/new numbers in the commit body**:
`scene3d-curved-density-floor` counts (W-36 already re-pinned four of them). Note
`scene3d-hatch-density-angle-stable` is **already 7/9 on this base** — a known, root-caused W-36 side effect
awaiting W-36b. **W-31 must not touch it and must not be blamed for it**; the implementer records its
pre-existing state on its own base before changing anything.

**Plot safety:** family A's tightest measured gaps at d=220 today are cylinder 0.600 mm, sphere 0.770 mm,
ellipsoid 0.889 mm, torus 1.029 mm — all ≥2× the 0.3 mm pen. A per-sample step can go tighter *locally*
than a per-ruling mean, so the fix **must** clamp the per-sample step at the same `dfMin` rail and the
implementer **must** re-measure the minimum local gap (not the median) against `PLOT_FLOOR_PEN × pen`.

**Predicted ink:** within ±5 % of today (mean step preserved). Must be reported per cell against P5.

---

## 5. Files

**Allowed:** `src/core/scene3d/surface-fill.js` · `tests/unit/scene3d-crosshatch-cell-shape.test.js` (new)
· `tests/unit/scene3d-crosshatch-parity.test.js` and `tests/unit/scene3d-curved-density-floor.test.js`
**only** if a bar must move, with a `## Bars changed` entry · `docs/3d-audit/lane-reports/W-31-impl.md` ·
`docs/3d-audit/fill-audit/after/W-31/**`.

**Forbidden:** `surface-fill-mono.js` (fill-audit-c) · `scene3d.js`, `context-bar.js` (fill-audit) ·
`hlr.js`, `shadows.js`, pen-fill, fill-boolean (handoff-c) · `mappers.js` (fill-audit-d) ·
`src/config/**` (incl. `scene3d-tone-laws.js`, `params.js`) · any `src/ui/**` · any other worktree ·
`scene3d-hatch-density-angle-stable.test.js` (W-36b's) · every other test file. No version bump (worktree).

---

## 6. Evidence cells — all verified present in `docs/3d-audit/fill-audit/manifest.A.*.jsonl`

`{sphere, cylinder, torus, ellipsoid, cone} × crosshatch × ladder × {med, max} × {a, b}` = **20 cells,
20/20 confirmed present** (checked against the 576 tier-A ids in the manifests). Capture with:

```
node scripts/audit/scene3d-capture.js --tier A --root .claude/worktrees/fill-audit-a2 --port 8475 \
  --only '^(sphere|cylinder|torus|ellipsoid|cone)__crosshatch__ladder__(med|max)__(a|b)$' \
  --out docs/3d-audit/fill-audit/after/W-31
```

Run from MAIN so output lands in main's gallery dir. Then write `after/W-31/report.json`.

**Mandatory native-resolution crops (PIL crop → Read), and what to look for:**
- `cylinder__crosshatch__ladder__max__a` — the **left and right limb columns**, side by side with the
  centre. This is Jay's own panel. Today the centre reads as diamonds and both limbs as crushed
  rectangles; the fix must make the limb cells square (larger or smaller is fine, longer is not).
- `sphere__crosshatch__ladder__med__a` — the **chart-pole knot** at the top. It is visibly the worst thing
  in that picture. It is **excluded from C1 by the INTERIOR definition and is NOT this unit's target** —
  crop it, describe it, and file it (§7 follow-up W-31c). Do not chase it.
- `cone__crosshatch__ladder__max__a` — the worst measured ramp (0.60 → 1.75).
- `sphere__crosshatch__ladder__max__b` — the **control that already passes** (0.93–1.08). It must not
  regress.

There is **no manifest cell for `rungMode: 'fine'`**; if Jay's own Fine-rungs cell is wanted, capture it
bespoke exactly as W-36 did (`after/W-36/jays-cell-*.png`).

---

## 7. Relationship to W-36 and to §4 decision 6

**Did W-36 already fix most of this?** It fixed the half that could be fixed by a coverage split, and that
half was large: median cell aspect **0.13 → 1.02** (cylinder d=220) and measurable neighbourhoods **7 → 183**
(§1.6). The pair budget is **not** implicated in what remains (§1.4: two independent single-family hatch
runs show the identical spread). **W-31 must not re-open `CROSS_PAIR_BUDGET`, `crossPairShare` or the 50/50
split** — STILL-OPEN's standing instruction, independently confirmed here.

**§4 decision 6 (accept equal-pitch parity, or insist on ±10 % counts?).** W-31's measurement is direct
evidence **for** the standing ruling and should be given to Jay with it: equal *spacing* is the physical
content of his rule, and the engine does not yet deliver equal spacing even **within a single family**
(local gaps ramp 0.43 → 0.83 mm against a flat 0.75 mm request). Forcing count parity on top of that would
require making one family *more* unevenly spaced. **The honest answer to Jay is: your rule is right, W-36
delivered it at the whole-form level, and W-31 is the same rule applied locally — where it is still RED.**

**Follow-ups this unit files rather than fixes:**
- **W-31b** — Rank 1 extended from crosshatch to `hatch` / `contour` / every `contField*` law. Same
  mechanism, same defect (§1.4 proves it is single-family), but it moves every fingerprint in the file.
- **W-31c** — the chart-pole knot (sphere/ellipsoid camera a, top ~15 %). Both families converge to a
  parameterisation singularity; aspect is 0/0 there. Visible, ugly, and a different fix (pole capping /
  chart reparameterisation), not a spacing law.
- **W-36b** — already filed; `scene3d-hatch-density-angle-stable` is 7/9 on this base.

---

## 8. Stop conditions

1. **The spike (4.1a) does not bring cylinder d=220 flat inside [0.85, 1.18].** → Fall back to Rank 3,
   report the spike numbers, stop. Do not iterate the mechanism more than twice.
2. **Any W-36 P1–P6 bar, the W-26 R1a 1.15 gap-jump, or the W-26b coverage cap moves.** → Stop and report.
   None of them may be re-pinned by this unit under any circumstances.
3. **P5 leaves [4200, 5431] mm on cylinder d=220** (raw rig) or the real capture exceeds +15 % over
   v1.3.98's 4912.6 mm. → Stop; the fix is redistributing ink, not adding it.
4. **The minimum local gap at d=220 falls below `PLOT_FLOOR_PEN × penWidth`** anywhere. → Stop; a per-sample
   step must not out-run the plot floor.
5. **Any byte-identity control moves** (sphere hatch d=50 24/723.4; cylinder hatch d=220 145/4495.5; sphere
   contour d=50 18/656.4). → The gate leaked. Stop.
6. **`scene3d-hatch-density-angle-stable` degrades below its pre-existing 7/9** on this unit's own base.
   → Stop; that is W-36b's file and W-31 must not touch it.
7. **The worktree is dirty with W-33's or anyone else's uncommitted work**, or `git stash list` is
   non-empty with someone else's stash. → Stop and report; never checkpoint over another lane.
8. **The oracle cannot be met honestly.** → Ship the measurement (Rank 3) and say so. Never widen C1's band,
   never shrink the INTERIOR box to move the out-fraction, never re-pin a fingerprint without proof.

---

### Scratch dirs used and deleted
`/private/tmp/claude-501/scratch-W31` (`e31d8591`, plus three throw-away source prototypes — the debug
walk hook, Rank 2, and the median/harmonic metric variants; the pristine file was kept alongside as
`surface-fill.orig.js` and every measurement of "today" was taken against it) and
`/private/tmp/claude-501/scratch-W31-pre` (`0930cb2d`). Both removed. Nothing was written to any worktree.
