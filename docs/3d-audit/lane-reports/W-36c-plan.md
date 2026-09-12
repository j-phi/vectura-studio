STATUS: PLAN-READY

# W-36c — plan: each crosshatch family carries the SINGLE-FAMILY HATCH COUNT, under a new anti-saturation cap

Planner, read-only in the repo. Every number below was **measured by this planner** in a scratch
`git archive 426cc5e4` export (`/private/tmp/claude-501/scratch-W36c`, `node_modules` symlinked),
foreground, one vitest file at a time. The mechanism in §5 was **prototyped in that export and run
against the whole guard battery** — it is a measurement, not an argument. The scratch directory is
deleted at the end of this unit (§9).

- Base: **`426cc5e4`** = v1.4.1 (round 2 merged). Lane `fill-audit-a2`, port 8475, `surface-fill.js` serialized.
- JAY'S DECISION (2026-09-10, §4 decision 6 → **option C**): *each crosshatch family carries the
  single-family hatch count at the same Density* (≈2× the ink of hatch), which needs a **new
  anti-saturation cap** so Density 220 does not go solid. This **replaces W-36's shipped Rank 1**
  (one shared `CROSS_PAIR_BUDGET = 1.1` split evenly).
- The decision is reachable. **At the prototype, family A's ruling count is EXACTLY the hatch count,
  to the digit, on every primitive at every Density where the cap is dormant** (sphere 4/4, 16/16;
  cylinder 6/6, 22/22; torus 3/3, 12/12; ellipsoid 5/5, 16/16; **Jay's own cell 17/17**), and family
  B is at or above it. Above the cap's binding Density the rule degrades gracefully and the plan says
  exactly where (§2.4).

---

## 1. Current numbers on `426cc5e4`, and the TARGET per cell

Rig: the audit-capture rig used by `tests/unit/scene3d-crosshatch-parity.test.js` —
`PRIMITIVE_PARAM_DEFAULTS` + `DEFAULT_CAMERA`, sun 135°/45°, ground+backdrop off, `fillAngle 45`,
`toneLaw 'ladder'`, `BOUNDS 320×220`, **pen 0.3**. Families read off the raw runs
`SurfaceFill.buildObject` returns (`A#0` = primary, `A#1` = crossing, `run.back` excluded); `n` =
distinct drawn rulings, `gap` = median centre-to-centre gap in mm. `ink` = summed `sceneFill` path
length. `cov` = the **W-26b anti-blob instrument** (`scene3d-fill-span-verdict.test.js`'s
`inkCoverage`, 0.1 mm grid, pen-disc stamp, silhouette-normalised), reproduced verbatim.

**`hatchN` is the TARGET for EACH family** (Jay's rule). "Projected ink at target" is the measured
ink of the prototype with the cap disabled — i.e. the ink when both families really do carry the
hatch count.

| cell | hatch n / ink | **TARGET per family** | A n/gap today | B n/gap today | A:hatch · B:hatch today | ink today | cov today | **projected ink at target** |
|---|---|---|---|---|---|---|---|---|
| sphere d=1 | 4 / 177.9 | **4** | 2 / 2.446 | 4 / 10.620 | 0.50 · 1.00 | 235.0 | 0.064 | **421.5** |
| sphere d=50 | 16 / 723.4 | **16** | 9 / 2.901 | 11 / 2.641 | 0.563 · 0.688 | 877.3 | 0.232 | **1606.0** |
| sphere d=220 | 69 / 3132.3 | **69** | 37 / 0.770 | 48 / 0.696 | 0.536 · 0.696 | 3713.0 | 0.738 | **6814.2** |
| cylinder d=1 | 6 / 277.5 | **6** | 3 / 13.711 | 4 / 5.203 | 0.50 · 0.667 | 298.8 | 0.053 | **561.6** |
| cylinder d=50 | 22 / 1056.5 | **22** | 12 / 2.149 | 12 / 2.135 | 0.545 · 0.545 | 1161.4 | 0.216 | **2107.5** |
| cylinder d=220 | 94 / 4495.5 | **94** | 52 / 0.600 | 54 / 0.602 | 0.553 · 0.574 | 5019.6 | 0.753 | **9136.8** |
| torus d=1 | 3 / 167.8 | **3** | 2 / 3.776 | 2 / 1.708 | 0.667 · 0.667 | 342.2 | 0.053 | **375.1** |
| torus d=50 | 12 / 733.6 | **12** | 7 / 5.135 | 7 / 4.302 | 0.583 · 0.583 | 905.8 | 0.114 | **1492.0** |
| torus d=220 | 46 / 2911.4 | **46** | 25 / 1.029 | 25 / 1.092 | 0.543 · 0.543 | 3195.0 | 0.334 | **5773.6** |
| ellipsoid d=1 | 5 / 263.7 | **5** | 2 / 1.966 | 4 / 11.907 | 0.40 · 0.80 | 274.7 | 0.047 | **548.3** |
| ellipsoid d=50 | 16 / 837.4 | **16** | 9 / 2.794 | 11 / 2.782 | 0.563 · 0.688 | 1007.6 | 0.175 | **1843.2** |
| ellipsoid d=220 | 67 / 3535.1 | **67** | 36 / 0.889 | 47 / 0.723 | 0.537 · 0.701 | 4187.6 | 0.545 | **7659.5** |
| **JAY's cell** — sphere, Crosshatch, Ladder, **rungMode `fine`**, fillAngle 45, d=50 | **17** / 760.96 | **17** | 9 / 2.949 | 11 / 2.717 | **0.529 · 0.647** | 862.2 | 0.228 | **1555.6** |

**The gap between today and Jay's rule is a factor of ~1.8 on every cell**: no family anywhere is
above **0.74 ×** the hatch count. The same holds across the whole mid-Density band (measured on
`426cc5e4`, A:hatch · B:hatch):

| d | sphere | cylinder | torus | ellipsoid |
|---|---|---|---|---|
| 80 | 0.529 · 0.706 | 0.543 · 0.565 | 0.500 · 0.545 | 0.545 · 0.697 |
| 110 | 0.553 · 0.711 | 0.538 · 0.577 | 0.520 · 0.600 | 0.568 · 0.703 |
| 140 | 0.581 · 0.721 | 0.557 · 0.574 | 0.533 · 0.567 | 0.571 · 0.738 |
| 170 | 0.558 · 0.712 | 0.562 · 0.575 | 0.556 · 0.583 | 0.549 · 0.725 |

**Gallery corroboration** (`docs/3d-audit/fill-audit/manifest.A.1-1.jsonl`, `appVersion 1.4.1` — the
whole-scene pipeline, so the absolute numbers differ from the raw rig): at `max` density the
crosshatch cell carries barely more ink than the hatch cell — sphere **5940.6 vs 5002.4 (1.19×)**,
cylinder 6566.7 vs 5901.2 (1.11×), torus 1817.0 vs 1676.9 (1.08×), capsule 2321.0 vs 1917.4 (1.21×).
A true crossed pair should be near 2×. That ratio **is** Jay's complaint, in the gallery's own numbers.

---

## 2. The NEW anti-saturation cap

### 2.1 Why one is required — measured

Setting the per-family budget to the full single-family target (`crossPairShare → 1` for both roles)
delivers Jay's rule exactly, and **saturates at high Density**:

| cell | A n (= hatch n) | B n | ink | **cov** | median white-hole area |
|---|---|---|---|---|---|
| sphere d=220 | 69 | 88 | 6814.2 | **0.9839** | 0.11 pen² |
| cylinder d=220 | 94 | 100 | 9136.8 | **0.9867** | 0.11 pen² |
| sphere d=300 | 77 | 99 | 7650 | **0.999** | 0.11 pen² |
| cylinder d=300 | 106 | 111 | 10240 | **0.999** | 0.11 pen² |

`cov → 1.0` and the white holes collapse to the instrument's own cell size: that is *solid*, not a
grid. It reproduces judge C1's saturation (**cylinder d=220 = 9136.78 mm**, W-36's own rejected
Rank 3 number, to the digit) and it **fails the pre-existing, un-widened anti-blob guard**:
`scene3d-fill-span-verdict.test.js` → `crosshatch: drawn ink coverage never floods to a solid block`
at Density 220 measures **0.9714 against its own `< 0.85` bar**.

### 2.2 Where "reads solid" actually is — the coverage sweep

Per-family pitch floor `p ≥ k · pen`, swept. `cov` from the W-26b instrument on the audit rig; the
last column is the **existing guard's own rig** (`scene3d-fill-span-verdict`, sphere r=62, cam pitch 30):

| cap `p ≥` | m = (p/pen)² | sphere d=220 cov | cylinder d=220 cov | cylinder d=300 cov | span-verdict d=220 cov (bar 0.85) |
|---|---|---|---|---|---|
| none | 0 | 0.984 | 0.987 | 0.999 | **0.9714 FAIL** |
| 1.73 pen | 3.0 | 0.909 | 0.918 | 0.919 | **0.9090 FAIL** |
| 1.87 pen | 3.5 | 0.880 | 0.888 | 0.888 | **0.8803 FAIL** |
| 2.00 pen | 4.0 | 0.855 | 0.859 | 0.860 | **0.8540 FAIL** |
| 2.12 pen | 4.5 | 0.831 | 0.832 | 0.834 | PASS |
| **2.24 pen** | **5.018** | **0.807** | **0.807** | **0.808** | **PASS — 0.8078** |
| 2.45 pen | 6.0 | 0.766 | 0.765 | 0.766 | PASS |

**The bar.** Use the instrument and the number the suite already has: **the W-26b ink-coverage
instrument must stay `< 0.85` on every crosshatch cell.** Nothing is widened, nothing is invented —
this is `scene3d-fill-span-verdict.test.js`'s own live bar, which the uncapped option C breaks by
0.12 and which the cap restores. Its geometric meaning is pinned by the second instrument measured
alongside it: at `cov 0.81` the **median white hole is 1.2–2.0 pen²** (a resolved cell); at
`cov 0.98` it is **0.11 pen²** (the instrument's own floor — no cell left).

### 2.3 The cap, as a rule

**The pair's cell must keep one clear ink-width of white on each side.** The nib lays down
`inkWidth() = penWidth × (1 + INK_SPREAD)` (`surface-fill.js:1782-1783`, `INK_SPREAD = 0.12`), so a
cell whose side equals two ink-widths has exactly as much white as ink:

```
CROSS_MIN_CLEAR_INKW = 1                       // one clear ink-width per cell side
crossMinPitch()      = inkWidth() * (1 + CROSS_MIN_CLEAR_INKW)   // = 2 x inkWidth = 2.24 x pen
```

Generalised over the two user dials so the cell AREA, not a single pitch, is what is held (family B's
pitch is `r ×` family A's by `crossDensityRatio`'s documented sense; the families meet at
`crossAngleDelta`):

```
pitchA >= crossMinPitch() / sqrt(r * sin(delta))        pitchB = r * pitchA
=> cell area  = pitchA * pitchB * sin(delta) >= crossMinPitch()^2 = (2 x inkWidth)^2
```

At the shipped defaults (`r = 1`, `delta = 90°`, pen 0.3) that is **pitch ≥ 0.672 mm per family, cell
area ≥ 0.4516 mm² = 5.018 pen²**. The constant is **derived from the file's own ink width, not tuned
to the bar** — and it is the *smallest* form of the rule that clears 0.85 everywhere measured (the
next step down, `1.9 × inkWidth`, is measured over the bar on capsule — see §5 Rank 2).

This is a **coverage cap in pitch form, not a second law**: for a crossed pair the combined ink
fraction is `1 - (1 - w/p)²`, so requiring a minimum `p` *is* requiring a maximum combined coverage.
It is the same class of constraint as the single family's own `PLOT_FLOOR_PEN` / `masterFloorPen`
floors — a pen physically cannot draw a finer legible grid.

### 2.4 Where the cap binds, and what it yields there

Cap dormant below, live above. Measured per-family count at the cap (A n, with `A:hatch` in
parentheses), prototype at `2 × inkWidth`:

| d | sphere | cylinder | torus | ellipsoid | verdict |
|---|---|---|---|---|---|
| 1 | 4 (1.00) | 6 (1.00) | 3 (1.00) | 5 (1.00) | dormant |
| 50 | 16 (1.00) | 22 (1.00) | 12 (1.00) | 16 (1.00) | dormant |
| 80 | 34 (1.00) | 46 (1.00) | 22 (1.00) | 33 (1.00) | dormant |
| 110 | 37 (0.974) | 52 (1.00) | 25 (1.00) | 36 (0.973) | dormant |
| 140 | 41 (0.953) | 57 (0.934) | 28 (0.933) | 40 (0.952) | first touch |
| 170 | 43 (0.827) | 59 (0.808) | 30 (0.833) | 42 (0.824) | **binds** |
| 220 | 46 (0.667) | 62 (0.660) | 35 (0.761) | 44 (0.657) | **binds** |
| 300 | 48 (0.623) | 62 (0.585) | 35 (0.686) | 46 (0.613) | **binds** |

**Honest statement of the limit: Jay's rule holds exactly up to Density ≈ 140 and then degrades, by
design, because the pen runs out of paper.** Above d ≈ 170 each family sits AT the cap
(median gap / `crossMinPitch` measured at d=220: sphere 1.025, cylinder 0.876, torus 1.449,
ellipsoid 1.183), which is the correct behaviour — the grid stops getting finer instead of going
black. Cone and capsule behave the same way (capsule d=220 A 54 vs hatch 81; cone d=220 A 48 vs 72).

---

## 3. Prototype — full report

Prototype = the §5 Rank-1 edits, applied in the scratch export, behaviour-parameterised so the
un-changed configuration could be proven neutral first. **Neutrality proof: with the parameters set
to today's values (`0.55` / no cap) the whole guard battery is green and every dumped number is
identical to the pristine `426cc5e4` tree to the digit** — so every delta below is the fix, not the
plumbing.

### 3.1 Counts, gaps, ink, coverage — every cell

| cell | A n/gap → | B n/gap | **A:hatch · B:hatch** | count B:A | gap B:A | ink (today → proto) | cov (today → proto) |
|---|---|---|---|---|---|---|---|
| sphere d=1 | **4**/7.905 | 6/5.301 | **1.00** · 1.50 | 1.500 | 0.671 | 235.0 → **421.5** | 0.064 → 0.114 |
| sphere d=50 | **16**/1.466 | 21/1.341 | **1.00** · 1.31 | 1.312 | 0.915 | 877.3 → **1606.0** | 0.232 → 0.393 |
| sphere d=220 | 46/0.689 | 54/0.628 | 0.667 · 0.783 | 1.174 | 0.911 | 3713.0 → **4328.5** | 0.738 → 0.807 |
| cylinder d=1 | **6**/3.931 | 6/4.055 | **1.00** · 1.00 | 1.000 | 1.032 | 298.8 → **561.6** | 0.053 → 0.109 |
| cylinder d=50 | **22**/1.188 | 22/1.274 | **1.00** · 1.00 | 1.000 | 1.072 | 1161.4 → **2107.5** | 0.216 → 0.379 |
| cylinder d=220 | 62/0.589 | 65/0.591 | 0.660 · 0.691 | 1.048 | 1.003 | 5019.6 → **5828.4** | 0.753 → 0.807 |
| torus d=1 | **3**/22.105 | 3/18.010 | **1.00** · 1.00 | 1.000 | 0.815 | 342.2 → **375.1** | 0.053 → 0.041 |
| torus d=50 | **12**/2.091 | 12/1.982 | **1.00** · 1.00 | 1.000 | 0.948 | 905.8 → **1492.0** | 0.114 → 0.185 |
| torus d=220 | 35/0.974 | 35/0.961 | 0.761 · 0.761 | 1.000 | 0.987 | 3195.0 → **4146.2** | 0.334 → 0.379 |
| ellipsoid d=1 | **5**/5.012 | 6/5.326 | **1.00** · 1.20 | 1.200 | 1.063 | 274.7 → **548.3** | 0.047 → 0.099 |
| ellipsoid d=50 | **16**/1.572 | 21/1.540 | **1.00** · 1.31 | 1.312 | 0.980 | 1007.6 → **1843.2** | 0.175 → 0.293 |
| ellipsoid d=220 | 44/0.795 | 54/0.709 | 0.657 · 0.806 | 1.227 | 0.892 | 4187.6 → **4859.2** | 0.545 → 0.597 |
| **JAY's cell** | **17**/1.600 | 19/1.475 | **1.00** · 1.12 | 1.118 | 0.922 | 862.2 → **1555.6** | 0.228 → 0.377 |

Also measured at the cap: **cone** d=50 A 17 (= hatch 17), d=220 A 48 / cov 0.547; **capsule** d=50
A 19 (= hatch 19), d=220 A 54 / cov 0.828, d=300 cov 0.8298 (the tightest cell measured against the
0.85 bar — see §8 stop condition 2).

**Ink is ≈2× hatch exactly where Jay asked for it** — crosshatch:hatch ink at d=50 is sphere **2.22**,
cylinder **2.00**, torus **2.03**, ellipsoid **2.20**, **Jay's cell 2.04** — and 1.30–1.42× at d=220
where the cap is doing its job.

### 3.2 Gap ratio B:A — P2 holds everywhere it is asserted

d=50: 0.915 / 1.072 / 0.948 / 0.980. d=220: 0.911 / 1.003 / 0.987 / 0.892. Jay's cell 0.922.
All inside P2's `[0.80, 1.25]`, worst margin 10.8 %. (d=1 sphere is 0.671, outside the band — P2 is
not asserted at d=1, as today; P4's integer bar covers d=1 and holds: |nB−nA| = 2, 0, 0, 1.)

### 3.3 W-26 gap-jump (1.03–1.17 band) — holds, and is structurally untouched

`tests/unit/scene3d-ladder-uniform-field-spacing.test.js` **9/9 green** on the prototype (R1a
`max/min drawn gap ≤ 1.15`). Its four R1a cells are **cone+contour, cylinder+contour, capsule barrel
and cone+spiral** — all single-family mappers that never receive a `crossShare`, so they are
byte-identical here, not merely passing. `scene3d-fill-even-spacing.test.js` **12/12**,
`scene3d-curved-density-sparse-end.test.js` **20/20**, `scene3d-fill-ruling-continuity` 10/10 (+1
skip), `scene3d-fill-boundary-ends` **41/41**.

### 3.4 W-31 cell-aspect range — does NOT regress (C1), but C2 does (disclosed)

`tests/unit/scene3d-crosshatch-cell-shape.test.js`, flat-tone column-median cell aspect, all 11 pinned
configs, re-measured on the prototype:

| config | aspect range today | aspect range prototype | windows (C5) | verdict |
|---|---|---|---|---|
| sphere d=220 a | 0.833 – 1.222 | 0.826 – 1.239 | 90 → **110** | flat |
| sphere d=50 a | 0.898 – 1.052 | **0.951 – 1.032** | 9 → **28** | **narrower** |
| sphere d=220 b | 0.974 – 1.025 | 0.975 – 1.028 | 91 → **106** | flat |
| cylinder d=220 a | 0.726 – 1.340 | 0.741 – 1.377 | 76 → **90** | flat |
| cylinder d=50 a | 0.891 – 1.109 (2 cols) | 0.867 – 1.189 (3 cols) | 7 → **29** | wider, but 3 measurable columns vs 2 |
| torus d=220 a | 0.872 – 1.124 | **0.937 – 1.100** | 81 → **100** | **narrower** |
| torus d=50 a | 0.850 – 1.357 | 0.724 – 1.284 | 8 → **20** | mixed |
| ellipsoid d=220 a | 0.923 – 1.030 | 0.959 – 1.044 | 63 → **86** | flat |
| ellipsoid d=50 a | 0.987 – 1.021 (3 cols) | 0.955 – 1.028 (5 cols) | 9 → **32** | wider, but 5 measurable columns vs 3 |
| cone d=220 a | 0.600 – 1.773 | **0.644 – 1.643** | 90 → **101** | **narrower** |
| cone d=50 a | 0.191 – 1.323 (one col had n=1) | 0.768 – 1.621 (n ≥ 3) | 9 → **28** | old min was a 1-sample artefact |

**C5 (measurability) improves on every one of the 11 configs** — the denser families give the
interior-window instrument 2–3× more samples. The `crossDensityRatio = 2` oracle-validity test still
lands in its band (`0.362, 0.434, 0.497, 0.580, 0.662` ∈ (0.25, 0.70)).

⚠ **C2 (within-family local-gap p95/p05 spread) worsens on 9 of the 11 configs** — e.g. torus d=220
`5.90 → 7.49`, ellipsoid d=220 `12.97 → 14.70`, cone d=50 `11.79 → 16.88`. This is the **W-31b**
defect (`probe()`'s per-ruling MEAN `mmPerFrac` spent as one scalar step, `:9766` / `:9899`) made more
visible by denser families and a larger order-statistic population; it is not a new mechanism — but it
IS a ceiling that moves, so it is listed in `## Bars changed` (§5) and is stop condition 4 (§8).

### 3.5 W-36b per-family bearings — unchanged

`tests/unit/scene3d-hatch-density-angle-stable.test.js` **9/9 green** on the prototype: the per-family
bearing-stability assertions W-36b installed (3° tolerance, never widened) still hold for both
crosshatch families on all four primitives. The ink share the flawed combined metric was sensitive to
stays near 50/50 by construction here.

### 3.6 Plot safety

`tests/unit/scene3d-plot-safety.test.js` **5/5 (+1 skip)**. The cap makes this strictly safer than
today: every family's wanted pitch is now floored at **2 × inkWidth = 2.24 × pen**, where today
family A's wanted pitch at d=220 can go to the relaxed master floor (1.2 × pen). Measured median
gaps at d=220: cylinder 0.589 mm, sphere 0.689, ellipsoid 0.795, torus 0.974 — all ≥ 1.96 × pen.

### 3.7 P6 byte-identity — to the digit

Every non-crosshatch caller passes `crossShare === undefined` and reaches identical code. Measured
identical between the pristine and prototype trees, **fills / ink / median gap, digit for digit**:

| control | value (identical both trees) |
|---|---|
| sphere hatch d=50 | 24 / 723.44 / 1.466 |
| cylinder hatch d=220 | 145 / 4495.51 / 0.383 |
| sphere contour d=50 | 18 / 657.25 / 2.158 (the W-33 re-pin) |
| sphere hatch d=1/220 | 7 / 177.87 · 98 / 3132.30 |
| cylinder hatch d=1/50 | 10 / 277.49 · 35 / 1056.45 |
| torus hatch d=1/50/220 | 4 / 167.75 · 15 / 733.63 · 59 / 2911.44 |
| ellipsoid hatch d=1/50/220 | 8 / 263.71 · 23 / 837.44 · 91 / 3535.05 |
| sphere hatch d=50 rungMode `fine` | 26 / 760.96 |
| `scene3d-curved-density-floor` hatch pins d=10/50/75/100 | 9 / 25 / 40 / 53 — unchanged |

Plus whole-file guards that would catch leakage: `scene3d-mapper-audit` **70/70**,
`scene3d-surface-fill` 6/6 (+2 skip), `scene3d-curved-crosshatch-controls` **18/18** (the Stage-0 /
`!toneOn` discrete crosshatch path is structurally out of scope and stays green).

---

## 4. The RED oracle

File: **`tests/unit/scene3d-crosshatch-parity.test.js`** — keep P1, P2, P4, P6 exactly as they are;
**rewrite P3 and P5**. Same rig, same `rawRuns` / `rulingStats` / `crosshatchStats` idiom, plus one new
helper `hatchRulingCount(prim, d, extraStyle)` (the same `rawRuns` call with `mapper: 'hatch'`, single
family) and the W-26b `inkCoverage` instrument copied verbatim from
`scene3d-fill-span-verdict.test.js` (same instrument, so the two bars cannot drift).

| # | bar | today at `426cc5e4` | prototype | margin |
|---|---|---|---|---|
| **P1** (keep) | both families draw ≥ 2 rulings on every cell | pass | pass | — |
| **P2** (keep) | median-gap ratio B:A ∈ [0.80, 1.25] at d ∈ {50, 220} | pass | 0.892–1.072 | ≥ 10.8 % |
| **P3a** (**NEW — Jay's rule**) | for d ∈ {1, 50, 80, 110, 140} × 4 primitives **+ Jay's cell**: **each family's ruling count ≥ 0.85 × the single-family hatch ruling count** measured in the same run | **FAILS — 40 of 40 cells.** Worst 0.40 (ellipsoid d=1 A), best **0.74** (ellipsoid d=140 B). **Jay's cell 0.529 / 0.647** | pass — min **0.933** (cylinder d=140), exactly **1.000** at d ≤ 80 and on Jay's cell | **9.8 %** |
| **P3b** (keep, re-scoped) | count ratio B:A ∈ [0.72, 1.40] at d ∈ {50, 220} | pass | 1.000–1.312 | ≥ 6.3 % |
| **P4** (keep) | at d = 1, \|nB − nA\| ≤ 3 | pass | max 2 | 1 |
| **P5a** (**NEW — the cap**) | **W-26b ink coverage < 0.85** on `{sphere, cylinder, torus, ellipsoid, cone, capsule} × crosshatch × ladder × d ∈ {170, 220, 300}` | pass (today is light: max 0.753) | pass — **max 0.8298** (capsule d=300) | **2.4 %** (see §8.2) |
| **P5b** (**NEW — the cap is not too tight**) | at d = 220 the crosshatch ink is **≥ today's shipped value** on all four primitives (4187.6 / 5019.6 / 3195.0 / 3713.0) — W-36c must never make the picture LIGHTER than v1.4.1 | n/a (equality) | 4859.2 / 5828.4 / 4146.2 / 4328.5 | **+16.0 % … +29.8 %** |
| **P5c** (**NEW — the family sits AT the cap, not below it**) | where the cap binds (d ∈ {170, 220, 300}), each family's median gap ≥ **0.80 × `crossMinPitch`** | n/a | min **0.876** (cylinder d=220) | 9.5 % |
| **P6** (keep) | byte-identity controls — sphere hatch d=50 `24 / 723.4`, cylinder hatch d=220 `145 / 4495.5`, sphere contour d=50 `18 / 657.25` | pass | pass, identical to the digit | — |

**No tolerance is widened.** P5a's 0.85 is the number `scene3d-fill-span-verdict.test.js` already
enforces, reused rather than re-invented; P3a, P5b and P5c are new bars on previously unguarded
properties. The only bar that MOVES is in `scene3d-curved-density-floor.test.js` (§5, disclosed).

### 4.1 Mutation checks — all four must be run and reported

| # | mutation | expected, and MEASURED by this planner |
|---|---|---|
| M1 | revert `surface-fill.js` to the pre-fix blob, keep the new test | **P3a fails on all 40 cells** (the RED proof). Measured ratios 0.40–0.74 |
| M2 | keep the per-family budget, **disable the cap** | **P5a fails**: sphere d=220 cov **0.9839**, cylinder **0.9867**, cylinder d=300 **0.999**; the pre-existing `scene3d-fill-span-verdict` bar measures **0.9714 vs 0.85**; cylinder d=220 ink **9136.78 mm** — judge C1's saturation restored to the digit |
| M3 | set the cap to **4 × inkWidth** (over-tight) | **P5b fails**: cylinder d=220 ink **2960.3** (vs today's 5019.6), sphere **2230.3** (vs 3713.0), torus 2211.5, ellipsoid 2544.4 — crosshatch becomes LIGHTER than a hatch. Proves P5b is a real two-sided cap, not decoration. Note the cap is on the **wanted** pitch, so this mutation leaves d=50 untouched (A still 16/22/12/16) — the failure is purely at the dense end, which is what P5b measures |
| M4 | restore `CROSS_PAIR_BUDGET / 2` (W-36's split) with the cap left in | **P3a fails** on every cell — proves P3a is guarding the budget, not the cap |

---

## 5. Ranked fixes

### Rank 1 — RECOMMENDED (prototyped end-to-end, all numbers in §3)

**Exact edits, `src/core/scene3d/surface-fill.js` (line numbers at `426cc5e4`):**

1. **`:4714`** — replace the pair budget with the per-family budget:
   ```js
   // W-36c — JAY'S RULE (2026-09-10, decision 6 option C): each family of a
   // crosshatch carries the SAME number of lines a single-family hatch draws
   // at the same Density, i.e. each asks for the WHOLE `ladderCov(I)` target
   // a lone family asks for. That is ~2x the ink of a hatch, which Jay
   // accepted explicitly; W-36's shared `CROSS_PAIR_BUDGET = 1.1` split
   // evenly is superseded. The saturation W-26b-1 and judge C1 found is now
   // held off by `crossMinPitch()` below — a CAP on how fine the pair's cell
   // may get, not a cut to what either family asks for.
   const CROSS_FAMILY_BUDGET = 1.0;
   const crossPairShare = (crossRatio, role) => {
     const r = clamp(finite(crossRatio, 1), 0.25, 2);
     return (role === 'b') ? CROSS_FAMILY_BUDGET / r : CROSS_FAMILY_BUDGET;
   };
   ```
2. **immediately after** — the cap, derived from the file's own ink width:
   ```js
   // W-36c — ANTI-SATURATION CAP. Two crossed families each at full coverage
   // combine to `1-(1-c)^2` and go SOLID (MEASURED, uncapped: cylinder D220
   // ink coverage 0.987, sphere 0.984, cylinder D300 0.999, median white hole
   // 0.11 pen^2 = the instrument's floor). The cell must keep one clear
   // ink-width of white on each side: pitch = ink + white = 2 x inkWidth().
   // Stated on the AREA so the two user dials cannot defeat it — family B's
   // pitch is `r` x family A's (`crossDensityRatio`'s documented sense) and
   // the families meet at `crossAngleDelta`.
   const CROSS_MIN_CLEAR_INKW = 1;
   const crossMinPitch = () => inkWidth() * (1 + CROSS_MIN_CLEAR_INKW);
   const crossFloorPitch = (crossRatio, role, delta) => {
     const r = clamp(finite(crossRatio, 1), 0.25, 2);
     const th = (clamp(finite(delta, 90), 10, 170) * Math.PI) / 180;
     const s = Math.max(0.17, Math.abs(Math.sin(th)));
     const pA = crossMinPitch() / Math.sqrt(Math.max(1e-6, r * s));
     return (role === 'b') ? r * pA : pA;
   };
   ```
3. **`:4720-4723`** — spend the cap:
   ```js
   const ladderPairWantedPitch = (I, crossRatio, role, delta) => {
     const c = clamp(ladderCov(I) * crossPairShare(crossRatio, role), LADDER_COV_MIN, 1);
     return Math.max(masterPitch / c, crossFloorPitch(crossRatio, role, delta));
   };
   ```
4. **`:10037-10039`** — the step ceiling must widen with whatever actually sets the pitch, or the cap
   cannot be spent (this is exactly the trap W-26b-1 documented at this line):
   ```js
   const dfMaxMul = (crossShare != null && isEvenLadder())
     ? clamp(Math.max(
       1 / Math.max(1e-6, crossPairShare(crossShare.ratio, crossShare.role)),
       crossFloorPitch(crossShare.ratio, crossShare.role, crossShare.delta) / Math.max(1e-6, masterPitch),
     ), 1, CROSS_DFMAX_BOOST_CAP)
     : 1;
   ```
   Measured range across both roles and the whole dial: **[1.00, ~2.2]** — `CROSS_DFMAX_BOOST_CAP = 20`
   stays a dormant safety rail; update its comment, do not move it.
5. **`:10062-10063`** — pass `crossShare.delta` into `ladderPairWantedPitch`.
6. **`:11077` and `:11094`** — add `delta: crossDelta` to both `crossShare` objects (`crossDelta` is
   already in scope two lines below at `:11089`). Contour/hatch keep `undefined` and are untouched.

Total diff: **~25 lines in one file.** Full prototype diff is reproduced in §9 of this planner's
working notes and is trivially re-derivable from the six steps above.

**`## Bars changed` — the mandatory disclosure list**

| file:line | old → new | why |
|---|---|---|
| `tests/unit/scene3d-curved-density-floor.test.js:~297` | `18` → **`22`** | sphere crosshatch d=10, ratio 0.25, TOTAL count — both families now carry the full single-family target |
| `:~298` | `11` → **`18`** | d=10, ratio 1.0 |
| `:~299` | `114` → **`120`** | d=100, ratio 0.25 |
| `:~300` | `64` → **`116`** | d=100, ratio 1.0 — the largest single move, and the direct expression of Jay's rule |
| `:~314-323` `nB(0.25)/nB(2) >= 2.5` | **`2.5` → `2.0`** (measured **2.25** at d=10, **2.542** at d=100) | **A BAR GOING DOWN — needs the orchestrator's explicit sign-off.** Reason: at ratio 0.25 the user asks family B for 4× the single-family target, but `ladderPairWantedPitch` clamps coverage at `c ≤ 1` (the engine's own ceiling). Under W-36's 0.55 base the clamp only bit above `cov ≈ 0.45`; at parity it bites above `cov ≈ 0.25`, so the dial's headroom ABOVE ratio 1 is structurally smaller — *because ratio 1 is now already at the ceiling, which is Jay's rule*. The dial's authority over its full range is intact and measured |
| same test, sub-check `nB(0.25) >= 2.0 x nB(1)` | **REMOVED**, replaced by **strict monotonicity** `nB(0.25) > nB(1) > nB(2)` at d=10 **and** d=100 — measured **9 > 7 > 4** and **61 > 47 > 24** | same reason, stated structurally instead of as a magnitude the coverage ceiling no longer permits. Monotonicity cannot be gamed by a flat response, which is what the old magnitude bar existed to catch |
| `tests/unit/scene3d-crosshatch-cell-shape.test.js` **C1**, all 11 configs | `nA`/`nB`/`windows`/`cols[].n`/`cols[].aspect` **re-pinned** (e.g. sphere d=220 a `nA 48 → 53`, `nB 48 → 54`, `windows 90 → 110`) | W-31's ceiling pins exact counts; the counts change by design. **The aspect RANGE — what W-31 actually protects — does not regress**: narrower on 3 configs, flat on 4, wider on 2 that gained measurable columns, and the one large "improvement" at cone d=50 is a 1-sample artefact disappearing (§3.4). **C5 improves on 11 of 11** |
| `tests/unit/scene3d-crosshatch-cell-shape.test.js` **C2**, 9 of 11 configs | `spreadA`/`spreadB` re-pinned UPWARD (torus d=220 B `5.90 → 7.49`, ellipsoid d=220 A `12.97 → 14.70`, cone d=50 B `11.79 → 16.88`; sphere d=220 a and b pass unchanged) | **A CEILING GOING UP — needs the orchestrator's explicit sign-off.** Root cause is **W-31b**, already filed and already owning this metric: `probe()`'s per-ruling MEAN `mmPerFrac` spent as one scalar step. Denser families make the same defect more visible and give p95/p05 a larger population. **This unit must NOT attempt to fix it** (W-31 measured Rank 1/Rank 2 dead); it must disclose it and hand the new numbers to W-31b |
| `tests/unit/scene3d-crosshatch-parity.test.js` **P5** | the old `cylinder d=220 ink ∈ [4200, 5431]` bar is **REPLACED** by P5a/P5b/P5c (§4) | measured **5828.4** — Jay's decision is ≈2× ink, so a "v1.3.98 + 15%" ink cap is by definition the wrong instrument. The replacement caps the thing that actually matters (drawn coverage, on the suite's own instrument and its own 0.85 number) and adds a floor the old bar never had |

**Nothing else is re-pinned.** In particular `scene3d-plot-safety`, `scene3d-fill-span-verdict`,
`scene3d-ladder-uniform-field-spacing`, `scene3d-fill-even-spacing`,
`scene3d-curved-density-sparse-end`, `scene3d-curved-crosshatch-controls`,
`scene3d-hatch-density-angle-stable` (W-36b), `scene3d-fill-boundary-ends`,
`scene3d-fill-ruling-continuity`, `scene3d-mapper-audit` and `scene3d-surface-fill` are **green
unmodified on the prototype**, and the `scene3d-curved-density-floor` **hatch** pins (9/25/40/53) and
draft-fallback pins (3/5/39) do not move.

**Byte-identity set that MUST NOT move** (§3.7): every `hatch` and `contour` cell on every primitive
at every Density; every `contField*` law; the mono substrate; the ribbon laws; the flow/screen-cross
mappers; the faceted path; the W-01 master grid (`:5084-5157`); Stage 0 / `!toneOn` crosshatch; and
the X-ray back pass for every non-crosshatch mapper.

**Predicted ink per cell** (Jay accepts ≈2×) — raw rig, today → Rank 1:

| cell | today | Rank 1 | Δ | crosshatch:hatch |
|---|---|---|---|---|
| sphere d=50 | 877.3 | **1606.0** | +83.0 % | **2.22×** |
| cylinder d=50 | 1161.4 | **2107.5** | +81.5 % | **2.00×** |
| torus d=50 | 905.8 | **1492.0** | +64.7 % | **2.03×** |
| ellipsoid d=50 | 1007.6 | **1843.2** | +82.9 % | **2.20×** |
| **Jay's cell** | 862.2 | **1555.6** | **+80.4 %** | **2.04×** |
| sphere d=220 | 3713.0 | **4328.5** | +16.6 % | 1.38× |
| cylinder d=220 | 5019.6 | **5828.4** | +16.1 % | 1.30× |
| torus d=220 | 3195.0 | **4146.2** | +29.8 % | 1.42× |
| ellipsoid d=220 | 4187.6 | **4859.2** | +16.0 % | 1.37× |

### Rank 2 — the same mechanism at a TIGHTER cap (`2.1 × inkWidth`), if any cell breaches 0.85

Measured: capsule d=220 cov **0.8079**, d=300 **0.8077**; sphere d=220 0.786, cylinder d=220 0.784 —
**5 % headroom instead of 2.4 %**, at a cost of **zero rulings below d = 110** (sphere 37/38, cylinder
52/52, capsule 45/45 — identical to Rank 1) and **2–3 rulings per family at d ≥ 220** (sphere 44 vs
46, cylinder 59 vs 62). Take this if the implementer's own sweep finds ANY cell over 0.84 on the real
base. It costs Jay nothing in the regime he is looking at.

### REJECTED BY MEASUREMENT, recorded so nobody re-tries it

- **No cap at all** (pure option C): cylinder d=220 **9136.8 mm / cov 0.987**, judge C1's saturation.
- **A looser cap, `1.9 × inkWidth`**: span-verdict rig 0.8285 (passes) but **capsule d=220 = 0.8515
  and d=300 = 0.8536 — both OVER the 0.85 bar.** `2.0 × inkWidth` is therefore the *smallest* form of
  the rule that clears the existing bar on every measured cell; it is a floor, not a preference.
- **A cap at `1.73`–`2.00 × pen`** (m = 3.0–4.0): 0.909 / 0.888 / 0.854 on the span-verdict rig — all
  over 0.85.

---

## 6. Files

**ALLOWED** (source + tests only, exactly as the brief requires):
- `src/core/scene3d/surface-fill.js`
- `tests/unit/scene3d-crosshatch-parity.test.js` (rewrite P3/P5, keep P1/P2/P4/P6)
- `tests/unit/scene3d-curved-density-floor.test.js` (4 count re-pins + the dial bar, §5)
- `tests/unit/scene3d-crosshatch-cell-shape.test.js` (W-31 ceiling re-pin, §5)

**FORBIDDEN** — `surface-fill.js:5084-5157` (the W-01 master grid), `surface-fill-mono.js`,
`mappers.js`, `src/core/algorithms/scene3d.js`, `hlr.js`, `shadows.js`, `src/config/*`, `src/ui/*`,
`tests/unit/scene3d-fill-span-verdict.test.js` (its 0.85 bar is this unit's calibrator — **reading it
is the point, editing it would be circular**), `tests/unit/scene3d-hatch-density-angle-stable.test.js`
(W-36b's, green unmodified), and every other lane's test files.

---

## 7. Evidence

**Manifest-verified cells** (grepped by exact filename in
`docs/3d-audit/fill-audit/manifest.A.1-1.jsonl`, `appVersion 1.4.1` — all present, tier A, angle `a`):

- `{sphere, cylinder, torus, ellipsoid, cone, capsule}__crosshatch__ladder__{low, med, max}__a` — **18
  cells, all present.** Their v1.4.1 `inkMm` is the honest before-number for `report.json`: sphere
  454.6 / 1551.3 / **5940.6**; cylinder 564.7 / 1716.7 / **6566.7**; torus 409.1 / 643.9 / **1817.0**;
  ellipsoid 460.3 / 1468.5 / **5529.1**; cone 290.4 / 794.0 / **3106.1**; capsule 236.3 / 642.7 /
  **2321.0**.
- Must-not-move controls, all present: `sphere__hatch__ladder__med__a` (1343.1),
  `sphere__contour__ladder__med__a` (1169.9), `cylinder__hatch__ladder__max__a` (5901.2). These are
  the P6 cells in gallery form and **must come back byte-identical**.
- **`capsule__crosshatch__ladder__max__a` is mandatory** — it is the tightest cell against the 0.85
  bar (§3.1) and the one that decides Rank 1 vs Rank 2.

**Bespoke capture REQUIRED for Jay's own cell.** No manifest cell carries `rungMode` (the capture
script writes `toneLaw: item.style` and never a `rungMode`,
`scripts/audit/scene3d-capture.js:219`). Capture sphere / `mapper:'crosshatch'` / `fillAngle: 45` /
`fillDensity: 50` / `rungMode: 'fine'` / `DEFAULT_CAMERA` / ground+backdrop off, **before and after**,
into `after/W-36c/`, and say so in `report.json`. Expected: **A 9 → 17, B 11 → 19, ink 862.2 → 1555.6
(2.04× the hatch cell's 761.0)**.

**Look at the pictures.** Native-resolution crops (PIL crop → Read) on at least
`cylinder__crosshatch__ladder__max__a`, `capsule__crosshatch__ladder__max__a`,
`sphere__crosshatch__ladder__med__a` and the bespoke Fine-rungs sphere. Describe (a) that each family
visibly carries as many lines as the matching hatch cell at `med`, (b) that `max` is a **resolved
grid and not a solid block** — this is the whole point of the cap and the metric alone must not be
trusted for it, (c) that the highlight still opens **both** families' gaps rather than deleting one,
and (d) a side-by-side against the v1.4.1 `shots/A/` reference so the ≈2× is visible as a picture, not
only as a number.

---

## 8. Stop conditions

Stop, write the numbers, and report rather than fudging, if any of these holds:

1. **P5a breaches.** Any crosshatch cell measures ink coverage ≥ 0.85 on the W-26b instrument, or
   `scene3d-fill-span-verdict.test.js` goes red. **Do not widen 0.85 — it is the calibrator.** Take
   Rank 2's tighter cap and re-measure, or stop.
2. **The capsule margin.** `capsule d=300` measured **0.8298** against 0.85 — only **2.4 %** headroom,
   the thinnest cell in the whole sweep. If the implementer's own sweep puts ANY cell above **0.84**,
   take Rank 2 (`2.1 × inkWidth`, measured max 0.8077) **and say so in the report** — do not ship a
   1 % margin.
3. **P5b breaches.** Any d=220 cell comes back with LESS ink than v1.4.1. That means the cap is
   over-tight (mutation M3's failure mode) — lower it, do not accept a lighter picture.
4. **C2 (W-31's within-family spread ceiling) gets worse than §3.4's measured numbers.** Re-pinning to
   the numbers in §3.4 is disclosed and sanctioned; going beyond them is a new regression. **Do not
   attempt to fix C2 here** — it is W-31b's, and W-31 already measured its Rank 1 and Rank 2 dead.
5. **Any P6 control moves by a digit.** That means the change leaked out of the
   `crosshatch` + `isEvenLadder()` + `toneOn` scope. Fix the scope; do not re-pin.
6. **A guard needs a bar moved that is not in §5's `## Bars changed` table.** Report it, do not widen
   it. Two hidden bar changes have already cost this audit a regression each.
7. **The orchestrator does not sign off on the two disclosed bar moves** — the
   `scene3d-curved-density-floor` dial bar `2.5 → 2.0` + monotonicity, and the
   `scene3d-crosshatch-cell-shape` C2 ceiling re-pin. Then the unit is BLOCKED on a ruling, not on
   code. Both are arithmetic consequences of Jay's own decision, with the mechanism measured, but
   neither is the implementer's to decide.
8. **The native-resolution crops still do not read as ~2× a hatch at `med`, or read as solid at
   `max`.** Harness-clean is not app-clean.
9. **The honest bar, if Jay wants the rule to hold higher than Density 140.** It cannot, at pen 0.3:
   two crossed families each at the hatch pitch reach ink coverage **0.98–0.999** by d = 200. The only
   ways to push the crossover up are a **thinner pen** (the cap scales with `inkWidth()`, so it moves
   automatically) or accepting a solid block. **Propose to Jay: "each family carries the hatch count
   up to Density ≈ 140; above that both families hold at the finest legible cell (one clear ink-width
   of white), which at the shipped pen is 0.67 mm."** That sentence is the honest statement of what
   ships, and it should go in the LEDGER ruling alongside decision 6.

---

## 9. Planner's housekeeping

- Scratch export used: `/private/tmp/claude-501/scratch-W36c` (`git archive 426cc5e4`, `node_modules`
  symlinked). Prototype, sweep harness, and all `zzz-*` measurement files lived only there.
  **Deleted at the end of this unit.** The repo was not modified other than by writing this file.
- Every vitest run was **foreground, one file at a time**. No background runs, no Monitor. Total
  wall-clock for the whole measurement programme was under 15 minutes; the dump harness runs in
  ~2.5 s, so the implementer can re-derive the entire RED table on its own base cheaply — and
  **must**, per AGENT-PROTOCOL §Every unit (this plan's base is `426cc5e4`; if anything lands in
  `surface-fill.js` first, re-derive before writing the fix).
- The measurement harness that produced every table here is three small vitest files built from the
  existing in-repo idioms (`rawRuns` from `scene3d-crosshatch-parity.test.js`, `inkCoverage` from
  `scene3d-fill-span-verdict.test.js`, the `CEILING` dump from `scene3d-crosshatch-cell-shape.test.js`).
  Rebuilding them takes minutes; nothing in this plan depends on a file that no longer exists.
