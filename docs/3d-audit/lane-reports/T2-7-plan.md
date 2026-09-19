STATUS: PLAN-READY (prototype looks right in direction; three named residuals; two bars need Jay's ruling)

# T2-7 — plan (Jay's `eye_t26` ruling, mkTick; folds T2-6b and T2-4)

**Planner, read-only.** Base: `main` `a6879837` (v1.4.3). Nothing was written to `src/` or `tests/`, and
nothing was committed. Scratch exports are under `/private/tmp/claude-501/scratch-T2-7-plan/{main,t25,proto,proto2,proto3}`,
with `node_modules` symlinked. Capture port **8475** was used three times and killed each time
(`lsof -iTCP:8475` empty at the end). Evidence is in `docs/3d-audit/lane-reports/T2-7-plan-evidence/`.

**Summary.** Jay's words name **three quantities**, and the tree fails all three today:
(1) **tick CONTACT**: **55–74 % of tick tips touch another mark** on `cone/hatch` and `sphere/hatch`
(both rigs, d=50). In the dark half, ticks overlap end-to-end across the row seams (`L0 = 1.16 > 1`), so
whole columns of ticks merge into **continuous lines that cross many rows**. On the cone's upper-left face
and the sphere's upper-left, those lines run **near-horizontal**. These are the "purely horizontal lines",
and they are the same defect as "lines not part of a tick band". A second, smaller population of rogue
horizontal ticks sits at the silhouette.
(2) **tone by SPACING**: the share of delivered tone that tick spacing carries is **−0.01 to −0.05 on every
fixture**. All the tone is in tick LENGTH, and spacing slightly *opposes* it.
(3) **gradual shifts**: the binned ink-vs-luminance curve is already monotone. This clause is a
non-regression bar, not a defect.
**T2-5 beat T2-6** because T2-6's deterministic comb aligned the across-row gaps into straight black
channels and bright rails (the `sphere/hatch` "rung"), while the T2-5 hash scatter hid them. **Neither tree
touches clause (1) or (2).**
**Mechanism (ONE): the SPACING-TONE, CONTACT-FREE TICK FIELD.** This is directional stippling on the
existing row lattice (the "structure grid" idea of Son et al. 2011, with oriented ticks in place of dots):
- Ticks stay centred in their row band, with **no stagger and no comb**.
- Tick length is a near-constant `λ·R` with `λ ≤ 1 − (1+GAP)·w/R`, so a clear seam of ≥ GAP pen widths
  always separates the rows.
- The along-row period `P ≥ (1+GAP)·w`, so side contact is gone too.
- **The tone is carried by `P`** (area conservation `P = L·w/(c·R)`). The tone range is mapped onto the
  densest contact-free coverage.
- Walk-bent limb ticks are dropped.
- Size varies only mildly (≤ 20 %) with tone, as Jay allows.

The prototype `proto3` measures as follows:
- Tip contact falls **0.60 → 0.06** on `cone/hatch/create`, and **0.02–0.14 on 10 of 12 cells**.
- `spacingShare` rises **−0.02 → 0.70** (0.67–0.77 on all 12 cells).
- Ink-vs-I stays monotone on 11/12 cells.
- Orientation rogues on the cone fall 5 → 0.
- At d=220, T2-4's floor is **subsumed**: `siteCoverage` goes 0.78–0.88 → **0.89–0.99**, with **zero
  sub-MIN_MARK marks**.

Pictures: `triptych_*.png`. **It reads as Jay's sentence: discrete ticks in clean bands, and the spacing
visibly opens toward the light.**

Three residuals are named below, with a fix for each:
- limb-hook ticks on the sphere, cone and torus;
- `torus/hatch/test` contact 0.39;
- reduced dark-end contrast, which is inherent to "no contact".

Two existing bars **contradict the ruling and need Jay's word before they move**:
- **O5 (length carries tone ≥ 2.30)**: proto3 reads 1.0–1.9.
- **`wedge25` per-cell ceiling**: one cell of 12 fails, 0.0974 > 0.090.

---

## 0. Fixture (standing rule 3) — applies to every number below unless a row says otherwise

- `BOUNDS = {width:1200,height:1000,m:20,dW:1160,dH:960,penWidth:0.3}`, `DEFAULT_CAMERA` (key `a`).
- One sun `{az:135, el:45, intensity:1, castShadows:false}`.
- **`ground:{enabled:false}`, `backdrop:{enabled:false}` — NO GROUND-PLANE INK in any ink number.**
- `styleTable.scene.params = {fillAngle:45, fillDensity:d, toneLaw:'mkTick'}`, `tone.enabled`, one
  object at identity, `visibility:'solid'`.
- **Rigs:** `create` (PRIMITIVE_CREATE over PARAM defaults, the gallery's and Jay's rig) and `test`
  (PRIMITIVE_PARAM_DEFAULTS alone, the vitest rig). `test` is **not** the capture harness's `--rig addLayer`
  (T2-5 §0.2). Captured shots name their `--rig`.
- d=50 unless labelled. RP (`tickField.rowPitch`) = 4.54 mm at d=50 and **1.048 mm at d=220** (cone/create).

**Trees.**
- `main` = `a6879837` (T2-6 comb present).
- `t25` = `main` with `surface-fill.js` from `0f420747^` (= `f0b0b0c8`: T2-5 + T3c). This is exactly the
  "revert T2-6" tree.
- `proto3` = `main` + `scripts/proto3.diff`.
- Instrument sanity checks: `main` `cone/hatch/create` gives O5 2.4258, siteCoverage 0.9882 and tooShort 49
  (T2-6-impl §2 is identical). The `cap-main` `cone/hatch/med` webp md5 `f8409829…` equals
  `after/MERGE-r4`'s gallery shot.

**Instruments** (`T2-7-plan-evidence/scripts/`):
- `metrics.js` hooks `mkStat.tickSites` so it also records `[I,R,P,L,drawnLen]`. The hook is
  geometry-neutral: it only appends to a global. It also runs the shipped helpers `measureWedge`,
  `siteCoverage` and `lengthCarriesTone`.
- `contact.py` / the contact function in `metrics.js`: a tick TIP is "in contact" when it lies within one
  pen width (centreline distance < w = 0.3 mm, so the ink touches) of another `sceneFill` path.
  `markContact` is the share of marks that touch anything.
- `anal.py`: orientation outliers. A tick is a rogue when its chord deviates > 30° from the axial mean of
  its neighbours within 1.5 RP. `rogueHoriz` = a rogue within ±5° of screen-horizontal. `bent30` = a
  walked tick whose polyline turns > 30° internally.

---

## 1. "Purely horizontal lines" — located, attributed, measured

### 1.1 What they are (LOOKED at, native crops)

- **H1 — seam-merged lines (the main population).** `renders/c_cone26_upleft.png` is a 3× native crop of
  the T2-6 gallery cone. On the upper-left face every "tick" has fused with the ticks above and below it
  into a **continuous near-horizontal arc** that crosses many rows. The only trace of the row structure is
  a string of lighter blobs where the ends overlap. `renders/chain_main_sphere_create.png` shows the same
  fusion on the sphere's upper-left, where the fused lines also run near-horizontal, and across the whole
  dense lower-left, where they run diagonal.
  **Cause:** `MK.mkTick.L0 = 1.16` (`surface-fill.js:2752`). The dark-end tick is 1.16 row pitches long,
  so it overruns its band by 0.08 R at each end and lands on the next row's tick. Add the `P = PMIN =
  1.1·w` along-row packing (`:2410`), which leaves a clear gap of only 0.1 pen between neighbours. The
  result is a solid mesh in which the eye reads LINES, not ticks. This is the "don't increase overlap at
  the seams" / "lines not part of a tick band" complaint returning in a new form. T2-5's `over2RP` only
  measured ticks that are *individually* longer than 2 RP. A line built from 20 abutting ticks passes it
  trivially.
- **H2 — limb rogues (the second population).** In `renders/c_sph26_right.png` (4× native, the sphere's
  right limb) and `renders/c_cone26_upright.png` (3×, the cone's right silhouette), short ticks next to the
  silhouette have turned horizontal or hooked (`Y`/`T` shapes into the edge line).
  **Cause:** `walkPoly` (`:6320–6420`) re-derives the frame at every step. Near a limb the frame rotates,
  so a tick's walked chord ends up far from its asked direction. `place()` already *measures* this
  (`sawDirBad`, `> 10°`, `:6468–6477`) but only counts it (`mkStat.dirOver10`) and never refuses the mark.
  An internal hook (the walk turning at the tip) is not measured at all.
- **Not the edge pass.** The `sceneEdge` paths are only `silhouette`/`boundary` classes: 110 on
  cone/create, 116 on sphere/create, byte-identical in `main` and `t25`. Their horizontal members are the
  cone's base-ellipse and the sphere's limb arc tangents. Nothing is handed to `border-*`.

### 1.2 The measurable quantities (fixture §0; `main` = what Jay saw; `t25` for comparison)

| quantity | cone/create | cone/test | sphere/create | sphere/test |
|---|---|---|---|---|
| **tipContact** (share of tick tips touching another mark), main / t25 | 0.601 / 0.643 | 0.554 / 0.591 | 0.698 / 0.741 | 0.683 / 0.720 |
| **markContact**, main / t25 | 0.782 / 0.838 | 0.754 / 0.807 | 0.829 / 0.878 | 0.835 / 0.878 |
| **rogueDev30** (count), main / t25 | 5 / 5 | 3 / 3 | 41 / 43 | 34 / 28 |
| **rogueHoriz** (count, mm), main | 1, 2.5 | 0 | 5, 19.0 | 3, 4.7 |
| **bent30** (count), main | 4 | 3 | 55 | 57 |

tipContact over all 12 six-cell fixtures (d=50, `data/m_main.log`) is **0.54–0.70**, except `torus/hatch`
create at 0.136, which is sparse. At d=220 it is **0.68–0.90**.

⚠ The raw count of near-horizontal ticks (`horizFill`, 54 on `cone/create`) is **not** a defect count. The
cone's upper-left rows legitimately carry near-horizontal ticks. The bar must be relational (contact,
neighbour-deviation, bend), never "no mark within ±5° of horizontal". Otherwise it would forbid legitimate
ticks on any face whose row normal happens to be horizontal.

---

## 2. T2-5 vs T2-6 — what T2-6 made worse, and the revert scope

**Look:** `T2-7-plan-evidence/triptych_{cone,sphere}__hatch__mkTick__med__a.png` (left T2-5, middle
T2-6 = main, right proto3). All three are the same harness, `--rig create`, and the `__addlayer` twins
exist too.

**What T2-6 made worse, concretely:**
1. **Aligned gaps → ruled channels.** T2-5's single tick carries the golden-ratio `cOff`, so the bare
   `R − L` strip sits at an unrelated depth in each consecutive tick and the eye averages it into texture.
   The T2-6 comb places every sub-tick at a fixed slot centre with no jitter (`slot` / `vCenter`,
   `:6925–6935`). So in every combed band the long/short pair sits at the **same v position for the whole
   run**, and the gap between the pair becomes a **straight black channel with a bright rail on each
   side**. On `sphere/hatch` those runs are long, which gives the rung/ladder bands `T2-6-review.md`
   condition 3 found. On the cone the same thing shows as stair-stepped slabs with black slots (the
   middle panel, right flank).
2. **Less mixing, more pens:** pen-downs +6–13 % (fills 554 → 597 on cone/create, 1001 → 1066 on
   sphere/create) for no gain on the quantities in §1. tipContact moves 0.64 → 0.60, which is noise-level
   and not a fix.
3. **O1 sagitta** went red, was re-derived in R4-fix, and is now a bar pinned *to T2-6's population*.
4. On everything Jay's new ruling names, T2-6 is neutral: `spacingShare` stays −0.02, and contact and
   rogues are flat. **It changed the picture's character without moving any of the ruled quantities.**
   That is why "the previous version was better".

**Recommendation: build T2-7 on T2-5's state (revert T2-6's comb; T2-6b folds away with it).**
Exact revert scope, confirmed by `git diff 0f420747^ 0f420747` and by `git log 0f420747..a6879837`, which
shows no later commit to `surface-fill.js`:
- **src:** `src/core/scene3d/surface-fill.js` = `git show 0f420747^:src/core/scene3d/surface-fill.js`.
  That removes the four `MK_TICK_COMB_*` constants (hunk `@@ -2570 +2570,36`) and restores the T2-5 tick
  block (hunk `@@ -6823 +6853,91`). Nothing else in the file differs.
- **tests that were introduced or reshaped for the comb and must be handled in the same commit:**
  - `tests/unit/scene3d-mktick-gap-fill.test.js` and `tests/helpers/scene3d-mktick-gap-fill.js`: retire
    them. They gate A1/A1b of the comb, which is a mechanism Jay rejected. Disclose under `## Bars
    changed` as a removed bar, with Jay's `eye_t26` quote as the reason.
  - `tests/unit/scene3d-mktick-band-purity.test.js`: `POST_TICK_BLOCK_INSTRUMENTED` and the `nOver`
    needle must mirror the new block.
  - `tests/unit/scene3d-mktick-wedge.test.js`: the 12 goldens and `STAGGER_NEEDLE_SINGLE`.
  - `tests/unit/scene3d-mark-laws-draw.test.js`: the O1 bar that R4-fix re-derived under T2-6's
    disclosure.
  - `tests/unit/scene3d-mkdashramp-{single-pass,discrete}.test.js`: their mkTick control compares against
    an in-tree `neutralAlgo`, so they should stay green, but the implementer must run them.
- ⚠ **In practice the implementer does not ship the revert as its own commit.** T2-7 replaces the whole
  tick block again (§3). The revert defines the *base picture* the RED/GREEN compare against (`t25`) and
  the list of comb-specific tests to retire. Any "before" shots must be taken from `t25` **and** `main`,
  and both are already in `cap-t25/`, `cap-main/`.

---

## 3. Research → ONE mechanism

**Sources, used sparingly:**
- [Secord, *Weighted Voronoi Stippling*, NPAR 2002](https://www.cs.ubc.ca/labs/imager/tr/2002/secord2002b/):
  tone = **stipple density**. Marks are equal-size and blue-noise spaced (Lloyd-relaxed, Poisson-disk
  initialised). Mark contact is avoided by spacing, not by size.
- [Son, Lee, Kang, Lee, *Structure grid for directional stippling* (2011)](https://www.sciencedirect.com/science/article/abs/pii/S1524070310000433):
  the **hedcut** style. Dots sit on a feature-aligned grid with regular spacing *along and across* the
  feature direction. Tone comes from dot size and spacing on that grid. Dark tone shifts to line
  primitives *on purpose*, because clustered dots read as blobs.
- (Background, not fetched) blue-noise halftoning (Ulichney): marks with a minimum spacing and a density
  proportional to the ask.

**Why these, and what to take from them.** Our tick field *already is* a structure grid. The rulings are
the feature-aligned rows, and the brick lattice gives the along-row axis. What Jay rejects is exactly the
hedcut's dark-end escape hatch: ticks abutting into lines. What he asks for is Secord's rule, "tone by
spacing, marks never touch". So the mechanism keeps the grid, forbids contact on **both** grid axes, and
moves the tone channel from length to spacing. Weighted-Voronoi relaxation itself is rejected: it destroys
the row structure ("tick bands") that Jay's earlier rule asks to keep, and it is iterative over the whole
field, which does not fit `layMark`'s streaming placement. Poisson-disk *jitter* is deferred to §3.3 as an
option, not as the base.

### 3.1 The mechanism — SPACING-TONE, CONTACT-FREE TICK FIELD

All of it is in `solveAt`'s `lenChan` branch, tick-only (`law.shape === 'tick'`), in `layMark`'s tick
block, and in one tick-only refusal in `place()`:

1. **Contact-free geometry.**
   - Along the row: `PMIN_T = (1 + GAP)·w`. The GAP pen is a new named bar, `MK_TICK_GAP_PEN`; the
     prototype uses 0.6.
   - Across the row: `λmax = 1 − PMIN_T/R`. The tick is centred in its band, so the seam between rows is
     ≥ `PMIN_T`. There is **no stagger and no comb**: the tick always sits on its row line. The brick
     phase between rows (`lat:'brick'`) is what keeps adjacent rows from forming columns.
2. **Size varies mildly.** `L = R·λmax·(LF + (1−LF)·eased)`, with `LF = 0.8` (`MK_TICK_LEN_FLOOR`). The
   tick shrinks at most 20 % toward the light. That respects "ticks can be any size" without making size
   the tone channel.
3. **Spacing carries tone.**
   - Target coverage `c(I) = mkAsk(I)/MK_DARK_AREA · cMax`, with `cMax = (L_dark/R)·w/PMIN_T`, the densest
     contact-free coverage. The whole tone range maps onto what contact-free ticks can deliver, so the
     shadows keep a gradient instead of saturating at a flat maximum.
   - `P = L·w/(c·R)`, clamped to `[PMIN_T, MK_PMAX]`. Past `MK_PMAX`, `L` shrinks and the ordinary
     `MIN_MARK_MM` drop takes the highlight to bare paper.
4. **T2-4's floor, as the tick's minimum SIZE.** `L ≥ min(1.15·MIN_MARK_MM, 0.98·R)`. When `R` is too
   small for both the floor and a full seam gap (d=220: R = 1.048 mm = 3.5 pens), **the seam gap yields
   first**. That is the only regime where across-row near-contact is allowed back.
5. **Limb rogues (H2).** In `place()`, tick-only: refuse the mark when its walked chord deviates
   `> MK_TICK_DIR_CUT` (prototype 25°) from `requestedDir`. The value is already computed on that line.
   **Still owed: a bend cap.** Stop the walk (keep what has been drawn) when a step turns more than ~30°
   from the tick's first step. The prototype does not have it, and it is the named residual (§5).
6. **Kept:** T2-5's clause-(c) split for over-wide bands (`nOver`, now centred uniform sub-ticks) and
   T2-3c's step cap.
   **Removed:** T2-3's golden-ratio stagger (its `room` is nearly zero once `L ≈ λmax·R` anyway) and
   T2-6's comb.

**Neutrality statement for the implementer.** This is *not* tone-neutral against HEAD, and it must not
claim to be. The dark end delivers ~0.5 ink coverage instead of ~0.96. That is the physical price of "no
contact" with a 0.3 mm pen. Ink falls ~40–60 % (cone/hatch/create 2362 → 1393 mm; sphere/hatch/create
d=220 4387 → 1969 mm, still above decision 1's 1500 mm, which is mkDashRamp's anyway). **This must be put
to Jay in the report as the trade his ruling implies, not buried.**

### 3.2 What the prototype shows (`proto3`; `data/m_proto3_{50,220}.log`, `data/m_{main,t25}.log`)

**d=50, six cells × two rigs.** Each cell reads main → proto3.

| fixture | tipContact | markContact | spacingShare | O5 (mono) | wedge25 | siteCov | ink mm |
|---|---|---|---|---|---|---|---|
| create sphere/hatch | 0.698 → **0.107** | 0.831 → 0.206 | −0.019 → **0.671** | 3.13 → 1.89 ✓ | 0.0544 → 0.0527 | 0.979 → 0.989 | 4725 → 2775 |
| create sphere/contour | 0.642 → **0.019** | 0.760 → 0.041 | −0.015 → **0.708** | 2.44 → 1.20 ✓ | 0.0627 → 0.0687 | 0.990 → 0.991 | 4589 → 2633 |
| create torus/hatch | 0.136 → **0.018** | 0.281 → 0.041 | −0.027 → **0.755** | 2.54 → 1.71 ✗mono | 0.1381 → 0.1449 | 0.988 → 0.986 | 1040 → 644 |
| create torus/contour | 0.569 → **0.242** | 0.886 → 0.516 | −0.025 → **0.697** | 3.04 → 1.72 ✓ | 0.1731 → 0.1760 | 0.977 → 0.984 | 1136 → 663 |
| **create cone/hatch** | 0.601 → **0.057** | 0.782 → 0.115 | −0.022 → **0.702** | 2.43 → 1.28 ✗mono | 0.0602 → 0.0619 | 0.988 → 0.996 | 2362 → 1393 |
| create cone/contour | 0.578 → **0.039** | 0.715 → 0.088 | −0.019 → **0.773** | 2.61 → 1.24 ✓ | 0.0394 → 0.0398 | 0.996 → 0.992 | 2391 → 1352 |
| test sphere/hatch | 0.683 → **0.132** | 0.838 → 0.266 | −0.011 → **0.694** | 3.07 → 1.66 ✓ | 0.0728 → 0.0728 | 0.983 → 0.987 | 3030 → 1787 |
| test sphere/contour | 0.622 → **0.034** | 0.758 → 0.076 | −0.023 → **0.715** | 2.35 → 1.18 ✗mono | 0.0601 → 0.0699 | 0.990 → 0.987 | 2882 → 1655 |
| test torus/hatch | 0.540 → **0.390** ⚠ | 0.778 → 0.718 | −0.033 → **0.698** | 2.34 → 1.43 ✗mono | 0.0768 → 0.0838 | 0.991 → 0.984 | 2999 → 1745 |
| test torus/contour | 0.577 → **0.140** | 0.787 → 0.291 | −0.047 → **0.713** | 2.85 → 1.58 ✓ | 0.0875 → **0.0974 ✗** | 0.984 → 0.989 | 2524 → 1520 |
| **test cone/hatch** | 0.554 → **0.069** | 0.754 → 0.133 | −0.021 → **0.716** | 2.65 → 1.54 ✗mono | 0.0692 → 0.0774 | 0.986 → 0.997 | 1987 → 1174 |
| test cone/contour | 0.585 → **0.049** | 0.734 → 0.104 | −0.024 → **0.772** | 2.90 → 1.36 ✓ | 0.0710 → 0.0711 | 0.992 → 1.000 | 2119 → 1206 |

- Six-cell `wedge25` means: create 0.0891 → **0.0907** (bar 0.095 ✓); test 0.0780 → **0.0787** (bar 0.080
  ✓, 1.6 % margin).
- Monotone ink-vs-I (`nonMono`): 0 on 11/12; `test torus/hatch` = 1. Largest adjacent-bin step as a
  fraction of the range: 0.18–0.28 in proto3 vs 0.19–0.24 in main.
- `subMin` (drawn marks < 2 pens) = 0 everywhere, as before.

**d=220 (T2-4's regime), four cells + two, both rigs**, main → proto3:

| fixture | siteCoverage | tooShort | subMin | wedge25 | holeMax | tipContact |
|---|---|---|---|---|---|---|
| create sphere/hatch | 0.8745 → **0.9164** | 1433 → 625 | 0 → 0 | 0.1047 → 0.0711 | 7.58 → 3.91 | 0.887 → 0.119 |
| create torus/hatch | 0.7803 → **0.8940** ⚠ | 525 → 214 | 0 → 0 | 0.1049 → 0.0648 | 2.67 → 2.54 | 0.680 → 0.102 |
| create torus/contour | 0.8168 → **0.9271** | 437 → 129 | 0 → 0 | 0.1049 → 0.0907 | 4.22 → 3.14 | 0.808 → 0.120 |
| create cone/hatch | 0.8754 → **0.9211** | 713 → 344 | 0 → 0 | 0.1190 → 0.0885 | 3.15 → 4.05 ⚠ | 0.867 → 0.144 |
| test sphere/hatch | 0.8752 → **0.9173** | 879 → 352 | 0 → 0 | 0.1033 → 0.0793 | 6.27 → 3.91 | 0.882 → 0.131 |
| test torus/hatch | 0.7806 → **0.8991** ⚠ | 1071 → 408 | 0 → 0 | 0.1798 → 0.1212 | 6.76 → 4.36 | 0.774 → 0.117 |
| test torus/contour | 0.8342 → **0.9388** | 871 → 268 | 0 → 0 | 0.1319 → 0.0816 | 7.94 → 3.59 | 0.843 → 0.108 |
| test cone/hatch | 0.8798 → **0.9292** | 552 → 256 | 0 → 0 | 0.1143 → 0.0884 | 2.57 → 3.02 ⚠ | 0.875 → 0.143 |

⚠ **proto2 (identical, but without the T2-4 plot floor) COLLAPSED at d=220.** Its `cone/contour` drew
**0 ticks** (tooShort 1643), and its `siteCoverage` fell to 0.55–0.77. At R = 1.048 mm the contact-free
length `λmax·R ≈ 0.57 mm` is under `MIN_MARK_MM` = 0.6 mm. **So T2-4's floor is not optional under this
mechanism. It is the thing that makes d=220 work.** Hence item 4 of §3.1.

### 3.3 The prototype picture — LOOKED at, native resolution

- **`triptych_cone__hatch__mkTick__med__a.png`, `triptych_sphere__…`** (create), plus `__addlayer`
  twins. Proto3 reads as **discrete ticks in clean bands**. Every tick is separate, and the bands are
  separated by a thin constant seam. On the lit side the ticks **spread apart gradually** (sphere
  upper-right, cone right flank) instead of shortening into fragments. There are no merged lines anywhere
  and no rungs. **This is the direction Jay's words describe.**
- **`crop_proto3_sphere_lit_x2.png`**: the spacing ramp is visible band by band toward the highlight, and
  tick sizes stay nearly equal. At the pole (upper-left) the row directions fan, and a few ticks hook.
- **`crop_proto3_cone_rightflank_x2.png`**: residual **H2**. Ticks whose tip reaches the silhouette hook
  into it and form short near-horizontal `Y`/`⌐` tails. The chord-direction cut does not catch them,
  because the chord is fine and the hook is internal. This needs the bend cap of §3.1 item 5.
- **`crop_proto3_torus_max_right_x3.png`** (d=220): discrete ticks and a gradual thin-out, but there is
  still **one horizontal limb tick and a `V`** at the right inner rim (H2 again). Tone contrast at d=220 is
  weak, because the whole range is squeezed into 3.5-pen rows.
- **Honest negatives.**
  1. **Dark-end contrast is lower.** The shadow reads as ~50 % grey, not solid white. This is inherent to
     "minimise contact".
  2. Across the sphere's mid-body the spacing change is **gentle**. Where `mkAsk` is flat, mid-tone bands
     look similar. The implementer may steepen the mapping (`c(I)` curve) *only* against the monotone bar.
  3. **`torus/hatch/test` tipContact stays at 0.39.** That rig's torus has strong foreshortening on the
     inner flank, where projected spacing shrinks below `PMIN_T` even though the along-surface spacing is
     legal. Fix candidate: measure `PMIN_T` in **screen** mm through `fr.u`'s projected length, or reject
     via the existing `mkMidBuckets` grid with a radius of `(1+GAP)·w`. Not prototyped.

**Verdict on the prototype: RIGHT DIRECTION, NOT FINISHED.** Contact, lines and spacing-as-tone are all
fixed. The limb hooks (H2) and one foreshortened cell remain.

---

## 4. Jay's words → bars (fixture §0; ✦ = BLOCKING)

| # | Jay's clause | quantity (instrument) | fixture | today (main) | bar |
|---|---|---|---|---|---|
| B1 ✦ | "purely horizontal lines must be removed" / "remove any lines not part of a tick band" | **tipContact** (§0 instrument): share of tick tips within one pen width of another `sceneFill` mark | six cells × both rigs, d=50 | 0.54–0.70 | **≤ 0.15 on every fixture** (proto3 meets it on 10/12; `create torus/contour` 0.24 and `test torus/hatch` 0.39 are the two to fix). Mutation: `L0`-style `λ` = 1.16 → trips it. |
| B2 ✦ | same (H2 limb rogues) | **rogueDev30** (chord > 30° off its neighbour axial mean) and **bent30** (internal turn > 30°) | cone/hatch + sphere/hatch, both rigs, d=50; torus/hatch d=220 | rogue 3–41, bent 3–57 | **rogue = 0 and bent = 0 on cone**; **≤ 2 each on sphere/torus** (pole fan). Mutation: remove the dir cut / bend cap → trips it. |
| B3 ✦ | "Minimize tick contact" | **markContact** (share of marks touching any other mark) | six cells × both rigs, d=50 | 0.71–0.89 | **≤ 0.30 on every fixture**. Also report `d=220` (inherently higher, see B7). |
| B4 ✦ | "shifts in tone … accomplished by increased or decreased spacing of ticks" | **spacingShare** = cov(log(w/P), log c)/var(log c) over drawn sites I < 0.9, where c = L·w/(R·P) (the hooked `tickSites`) | six cells × both rigs, d=50 and 220 | −0.05 … −0.01 | **≥ 0.60 on every fixture** (proto3 0.57–0.99; `create sphere/contour` d=220 0.573 is the one under). Mutation: restore the `len` channel → ≤ 0.1. |
| B5 ✦ | "gradual shifts in tone to capture highlights and shadows" | binned delivered coverage vs I (9 bins, I < 0.9, area-weighted): **nonMono = 0**, and **max adjacent step ≤ 0.30 of range** | six cells × both rigs, d=50 | 0 / 0.19–0.24 | **nonMono = 0 everywhere; step ≤ 0.30** (proto3: 11/12 monotone; `test torus/hatch` = 1). ⚠ This is a non-regression bar; today's tree passes it. |
| B6 | "ticks can be any size" | tick length/R spread, reported | — | — | **Reported, not gated.** It exists so nobody reads a size bar into the ruling. |
| B7 ✦ | T2-4 (orchestrator) | `siteCoverage` (hi = 0.90), d=220; `subMin` (drawn fill marks < 2 pens) | sphere/hatch, torus/hatch, torus/contour, cone/hatch × both rigs | 0.78–0.88; 0 | **≥ 0.90 on all 8**, and **subMin = 0**. Proto3: 6/8, with torus/hatch at 0.894 / 0.899. Mutation: remove the plot floor → coverage collapses (proto2: 0.55–0.77, cone/contour 0 ticks). |
| B8 ✦ | "don't increase overlap at the seams" (eye_mktick, standing) | T2-5's `ovMax` (O-B) | 12 fixtures, d=50 | 0.0800 | **= 0** (a *tightened* bar: centred ticks with `L ≤ R − PMIN_T` cannot cross the band). Disclose as a tightening. |
| B9 ✦ | "remove any lines not part of a tick band" (standing) | T2-5's `over2RP` (O-C2) | 12 fixtures, d=50 | 0 | **stays 0** |
| B10 | picture | native crops of cone right flank, sphere lit crown, torus d=220 limb, both rigs | — | — | **A picture that shows a hooked or horizontal limb tick is a REJECT even if B2's count passes.** |

**Which half each guard gates (standing rule 1).** Each of B1–B5 and B7 names its own quantity, and each
mutation above trips only that one. B1/B3 do **not** gate tone. B4/B5 do **not** gate contact.

### 4.1 Existing bars the ruling CONTRADICTS — need Jay's word, do not move silently

- **O5, `scene3d-mktick-wedge.test.js:445` `O5_BAR = 2.30`** ("tick length carries tone", user-reports/8.png
  R1). Jay's `eye_t26` moves tone onto spacing. Proto3 reads 1.01–1.89, monotone on 7/12. **Recommend
  retiring O5 and replacing it with B4.** This needs a line on the Decision Desk quoting both rules. If Jay
  wants both, the dial is `MK_TICK_LEN_FLOOR` (LF): 0.35 gives O5 ≈ 2.5 back, but it re-opens the
  length-driven seam gaps. Proto v1 at LF 0.35 visibly regrew the growing black seams, and that
  contradicts "black gaps" (eye_mktick).
- **`wedge25` per-cell ceiling 0.090 (test rig)**: `test torus/contour` reads 0.0974. `wedge25` encodes
  "the only bare areas are highlights", and tone-by-spacing necessarily opens along-row bare space in the
  mid-tones. **Recommend re-deriving it as a monotone bar** (bare distance non-decreasing in I), or
  keeping it and letting the implementer tune GAP/LF with the number shown. Either way it is a `## Bars
  changed` entry with this reasoning.

---

## 5. T2-4 disposition (orchestrator's scope addition)

`T2-4-scout.md`: the d=220 coverage loss is real (0.78–0.88 vs 0.90–0.95 pre-work), and its cause is the
`Lease`/`Lfloor` soft-max shrinking light-end ticks under `MIN_MARK_MM`.
- **(a) SUBSUMED.** Under T2-7 the light end is carried by spacing, and tick size never falls below
  `min(1.15·MIN_MARK_MM, 0.98·R)`. That is T2-4's `PlotFloor(1.15)` promoted from a 4-norm term to a hard
  minimum size. The `Lease`/`Lfloor` soft-max no longer exists for ticks. T2-4's O5-monotonicity side
  effect on `torus/hatch` becomes moot if O5 is retired (§4.1). If O5 is kept, it is live and is the same
  trade.
- **(b) The bar is carried as B7** (≥ 0.90, four cells, both rigs, subMin = 0). Proto3 meets it on 6/8.
  The two torus/hatch cells sit at 0.894 / 0.899. The implementer's lever there is the same foreshortening
  fix as §3.3 (3), and failing that a stop-report with the number. **Do NOT touch `MIN_MARK_PEN`**
  (T2-4 scout Q3: that only buys coverage with sub-2-pen dots).
- `holeMax` rises on the cone at d=220 (3.15 → 4.05 create, 2.57 → 3.02 test), while falling on the other
  six. Report it. A cone-only rise is the along-row spacing opening in the lit third, which is the ruling
  working, but it must be shown.

---

## 6. Files ALLOWED / FORBIDDEN, sequencing, guards at risk

**Lane:** round-5 `fill-audit-a5` (`surface-fill.js` owner). **Sequencing:**
- **W-07b** is in flight in `fill-audit-b5`. It touches the `deepFillTSP` branch of `algoCoverage` and
  `tspAt`, in the same file. T2-7 builds **on top of W-07b's commit**.
- **Overlap check:** T2-7 touches `solveAt`'s `lenChan` (~`:6693–6714`), `layMark`'s tick block
  (`:6854–6948`) and one line in `place()` (`:6468–6477`), plus new `MK_TICK_*` constants near `:2572`.
  **It must not touch `algoCoverage`**, whose `isMarkLaw` branch sits next to W-07b's hunk, nor
  `markRowCoverage`.
- The implementer re-greps the line numbers after rebasing on W-07b.
- **T3c-onset** (`00e9bc7d`, tests only) pins the mkDashRamp onset at d=32. Run it as a guard. T2-7 must
  leave mkDashRamp byte-identical.

**ALLOWED:**
- `surface-fill.js`: the `lenChan` branch **only under `law.shape === 'tick'`** (the non-tick `lenChan`
  path must stay byte-identical); `layMark`'s tick block; the tick-only direction/bend refusal in
  `place()`/`walkPoly`, where `walkPoly` gets the bend cap only when `stepCapMM` (tick-only) is passed; and
  new constants `MK_TICK_GAP_PEN`, `MK_TICK_LEN_FLOOR`, `MK_TICK_DIR_CUT`, `MK_TICK_BEND_CUT`,
  `MK_TICK_PLOT_FLOOR`. Each constant is documented in pen widths, with its measured trade. `MK.mkTick`'s
  row (`L0`/`LMIN` become unused for ticks: remove them or document them).
- `tests/unit/scene3d-mktick-*.test.js`, `tests/helpers/scene3d-mktick-*.js`, a NEW oracle file for B1–B5
  and B7, and retiring `scene3d-mktick-gap-fill.{test,helper}`.
- `tests/unit/scene3d-mark-laws-draw.test.js`: **only** the O1 population/bar, **with proof**.

**FORBIDDEN:**
- `MK_ROW_COV` / `markRowCoverage()`, `mkAsk`, `g`'s formula for non-tick laws, `MK_PMIN` (shared: define a
  tick-local PMIN instead), `MK_PMAX`, `MIN_MARK_PEN` / `MIN_MARK_MM`, the `dupStub`/`MK_MIN_ADJ_PEN` guard
  (read it, reuse it; do not retune it), and `place()` for non-tick shapes.
- mkDashRamp's `morph` / `else` branches, `algoCoverage`/`tspAt` (W-07b's), `scene3d.js`, `hlr.js`,
  `shadows.js`, `surface-fill-mono.js`, `mappers.js`, and `src/core/scene3d/params.js`.

**Pinned goldens / guards touching mkTick: GREPPED** (`grep -l mkTick tests -r`, then the hash idioms):

| file | pin | risk |
|---|---|---|
| `tests/unit/scene3d-mktick-wedge.test.js` | 12 `pathSignature` goldens; `O5_BAR` (:445); `WEDGE_MEAN_BAR`/`WEDGE_CELL_CEILING`; `STAGGER_NEEDLE_SINGLE` MUTATION-KILL 2 | **all 12 goldens move; the stagger needle disappears** (the mutation must be replaced, not deleted); O5 and wedge ceiling per §4.1 |
| `tests/unit/scene3d-mktick-gap-fill.test.js` (+ helper) | 25 hash/golden refs (R4-fix pinned goldens + contrast mutation), A1/A1b bars | **retire** (comb-specific) — `## Bars changed` |
| `tests/unit/scene3d-mktick-band-purity.test.js` | hand-maintained `POST_TICK_BLOCK_INSTRUMENTED` + needles; roster md5 sweep; `ovMax` bar | block copy must mirror the new block (T2-6 §4a's silent-staleness trap); ovMax tightens to 0 |
| `tests/unit/scene3d-mktick-banding.test.js` | `PRE_RANK1_BANDC` ×1.05 ceilings | bandC will move; not measured here → implementer measures before claiming |
| `tests/unit/scene3d-mktick-runaway.test.js` | `PRE_T23B` longest/count15 table | population changes (fewer, uniform ticks) → disclose |
| `tests/unit/scene3d-mark-laws-draw.test.js` | O1 sagitta (R4-fix re-derived under T2-6) | population changes → re-derive with proof |
| `tests/unit/scene3d-mkdashramp-{single-pass,discrete,low-end}.test.js` | mkTick md5 controls | in-tree `neutralAlgo`/rowFloor mutant, not a sha → expected green; **must be run** |
| `tests/integration/scene3d-fill-style-picker.test.js`, `tests/unit/scene3d-tone-law-collapse.test.js` (Tier 1) | reachability, law-collapse | run (Tier 1 with singleFork, per §0b) |

**Not at risk** (checked; the hash idiom is present but not keyed on mkTick surface geometry):
`scene3d-shadow-tone-law*.test.js` (mkTick there is the *shadow* dash law in `shadows.js`, a different
path), `scene3d-faceted-tone-law`, `scene3d-tone-quant-flow-live`, and `scene3d-ribbon-f1-amp` (controls
are `ampSpacing`/`weaveDepth`/`taperedEnds`).

**Sweep (standing rule 2).** mkTick is instantiated on 4/8 mappers (T2-4 scout: hatch ≡ wireframe,
crosshatch, contour). The implementer runs the md5 roster sweep 4 × (8 × 37) = 1184 cells and expects only
mkTick × {hatch, wireframe, crosshatch, contour} to change. **This plan measured 6 cells × 2 rigs × 2
densities and did NOT run the roster sweep.**

---

## 7. Reviewer flags (≤ 6)

1. **B1/B3 contact must be measured on emitted paths at pen width**, not on the solve. The proto's
   residual `test torus/hatch` 0.39 is invisible to any solve-space number. Check the implementer's
   instrument against `scripts/metrics.js`'s contact function on the same fixture.
2. **H2 is a picture bar.** Crop the cone's right silhouette, the sphere's pole and lit limb, and the
   torus d=220 inner rim at native resolution, both rigs. Any hook or horizontal tail is a REJECT
   regardless of `rogue`/`bent` counts. The proto passes the chord cut and still shows hooks.
3. **O5 and the `wedge25` ceiling must not move without a Decision-Desk line** quoting both Jay rules
   (§4.1). A quiet re-pin is a hidden bar change.
4. **T2-4's floor must be the tick's minimum SIZE with `subMin = 0` proven on emitted paths.** Watch for a
   `MIN_MARK_PEN` edit or a floor that only applies at d=220.
5. **`band-purity`'s hand-copied tick block and `wedge`'s MUTATION-KILL 2** are the two places a stale
   copy silently measures the old mechanism (T2-6 §4a). Diff each copy against the shipped block.
6. **Tone-range compression is a disclosed trade.** Ink falls ~40–60 % at d=50 and the dark end becomes
   ~50 % coverage. The report must show it with numbers and a whole-cell picture, and must not call it
   "neutral".

---

## 8. Evidence index — `docs/3d-audit/lane-reports/T2-7-plan-evidence/`

| path | what |
|---|---|
| `triptych_{cone,sphere}__hatch__mkTick__med__a{,__addlayer}.png`, `triptych_{cone,torus}__hatch__mkTick__max__a{,__addlayer}.png` | T2-5 · T2-6 (= main) · proto3, same harness (`scene3d-capture.js --tier B`, port 8475, killed) |
| `cap-t25/`, `cap-main/`, `cap-proto3/` | the captures (`shots/B/*.webp` + `.png`), both `--rig create` and `--rig addLayer` |
| `crop_proto3_cone_rightflank_x2.png`, `crop_proto3_sphere_lit_x2.png`, `crop_main_sphere_lit_x2.png`, `crop_proto3_torus_max_right_x3.png` | native crops (§3.3) |
| `renders/c_cone26_upleft.png`, `c_sph26_right.png`, `c_cone26_upright.png` | native crops of the T2-6 gallery shots: H1 fused horizontal lines, H2 limb rogues |
| `renders/chain_main_*.png`, `anno_main_*.png` | headless renders: red = seam-fused chains; red/orange/magenta = rogueHoriz/rogueDev30/bent30 |
| `renders/plain_{t25,main,proto3}_*.png` | headless whole-object renders, all four fixtures |
| `data/m_{main,t25,proto2}.log`, `data/m_proto3_{50,220}.log` | every number in §1.2, §3.2 (one JSON line per fixture, fixture fields inline) |
| `scripts/` | `lib.js`, `dump.js`, `metrics.js`, `contact*.py`, `anal.py`, `annochain.py`, `mkproto.py` (the patcher: `python3 mkproto.py GAP LF DIRCUT out`), `proto3.diff` (proto3 vs `a6879837`) |

## Bars changed

**None.** This is a read-only plan. No test, threshold, fingerprint, population or fixture was modified.
Bars the implementer **will** have to disclose: all of §6's table, plus the §4.1 pair (O5 and the
`wedge25` ceiling) and the tightened `ovMax` (B8). New bars: B1–B5, B7 and every new `MK_TICK_*`
constant.

---

## Amendment 1 — Jay's rulings (2026-09-19, transcribed in SESSION-SUMMARY §4)

**Rulings.** (1) Dark-end trade: **"SHOW ME FIRST"**. (2) O5: **"KEEP BOTH"**. O5 ≥ 2.30 stays and B4
spacingShare ≥ 0.60 stays. (3) `wedge25`: **re-derive as a monotone bar** (bare distance non-decreasing
in I). The fixed 0.090 cap retires, with a `## Bars changed` entry.
**Status after this amendment: B4 and O5 cannot both be met as literally stated; proto4 shows the
frontier. Jay's decision is needed on one bar (§A4).**

### A1. proto4 — the two-channel, contact-free field (`scripts/proto4.diff`, `scripts/mkproto4.py 0.6 0.9 0.6 2.6 30`)

Proto4 keeps §3.1's geometry: centred ticks, seam ≥ `(1+GAP)·w`, along-row `P ≥ (1+GAP)·w` with
GAP = 0.6, T2-4's plot floor as the minimum size, and the chord-direction cut. It changes three things:
1. **Length is a fixed share of tone, with a shadow plateau.** Let `c` be the target coverage.
   `L = λmax·R·min(1, (c / (κ·cMax))^α)`, with κ = 0.9 and α = 0.6. In the deepest shadow
   (`c ≥ 0.9·cMax`) every tick is full length, so the across-row seam equals the contact gap and never
   widens. **This is how the dark-band seam gaps of eye_mktick stay closed.** Below the plateau,
   length and spacing relax *together* toward the light: length takes the α share of log-tone and
   spacing takes the rest (`P = L·w/(c·R)`). The gap between rows therefore widens only where the
   field is already opening along the row, i.e. in the light, never as a black strip inside a dark
   band.
2. **Tone contrast γ = 2.6.** `c = cMax·(mkAsk/0.96)^γ`. This is needed because a contact-free field
   only spans a ~4.5× coverage range across I < 0.9 when it follows the shipped perceptual curve. Two
   channels that each must move ≥ 2.3× need ≈ 5.3× between the dark and light thirds (§A4).
   ⚠ **γ is a TONE-CURVE change, and it lightens the mid-tones** (per-bin coverage below).
3. **H2 bend cap (cheap, and in).** In `walkFrom`, tick-only (only when `stepCapMM` is passed): an arm
   stops, keeping what it has drawn, when a step turns > 30° from that arm's first step.

### A2. Numbers — d = 50, 12 fixtures (fixture §0; no ground ink; `data/m_p4h_50.log`; main = `data/m_main_50b.log`)

`SP5` is a NEW spacing analogue of O5: mean along-row period, light third ÷ dark third, over drawn
sites. It is reported beside B4.

| fixture | O5 main → **p4** (mono) | B4 spacingShare main → **p4** | SP5 main → p4 | tipContact → p4 | markContact → p4 |
|---|---|---|---|---|---|
| create sphere/hatch | 3.13 → **3.93** ✓ | −0.02 → **0.55** | 1.05 → 6.49 | 0.70 → 0.09 | 0.83 → 0.18 |
| create sphere/contour | 2.44 → **2.85** ✓ | −0.02 → **0.48** | 1.02 → 2.93 | 0.64 → 0.01 | 0.76 → 0.03 |
| create torus/hatch | 2.54 → **3.82** ✓ | −0.03 → **0.46** | 1.02 → 2.97 | 0.14 → 0.01 | 0.28 → 0.01 |
| create torus/contour | 3.04 → **4.12** ✓ | −0.03 → **0.52** | 0.97 → 7.21 | 0.57 → 0.17 | 0.89 → 0.36 |
| **create cone/hatch** | 2.43 → **2.25** ✗ (mono ✓) | −0.02 → **0.56** | 0.99 → 7.06 | 0.60 → 0.08 | 0.78 → 0.15 |
| create cone/contour | 2.61 → **2.61** ✓ | −0.02 → **0.44** | 0.97 → 2.14 | 0.58 → 0.04 | 0.71 → 0.09 |
| test sphere/hatch | 3.07 → **3.86** ✓ | −0.01 → **0.51** | 1.05 → 3.19 | 0.68 → 0.08 | 0.84 → 0.17 |
| test sphere/contour | 2.35 → **3.03** ✓ | −0.02 → **0.49** | 1.01 → 3.76 | 0.62 → 0.02 | 0.76 → 0.05 |
| test torus/hatch | 2.34 → **3.39** ✓ | −0.03 → **0.48** | 1.01 → 2.97 | 0.54 → **0.28** ⚠ | 0.78 → **0.53** ⚠ |
| test torus/contour | 2.85 → **3.95** ✓ | −0.05 → **0.47** | 0.96 → 3.07 | 0.58 → 0.12 | 0.79 → 0.25 |
| test cone/hatch | 2.65 → **2.33** ✓ | −0.02 → **0.44** | 0.97 → 2.56 | 0.55 → 0.09 | 0.75 → 0.18 |
| test cone/contour | 2.90 → **3.03** ✓ | −0.02 → **0.44** | 0.97 → 2.32 | 0.58 → 0.05 | 0.73 → 0.12 |

- **O5 ≥ 2.30 and monotone on 11/12.** It is monotone on all 12. `create cone/hatch` reads 2.25.
- **B4 is 0.44–0.56: under 0.60 on all 12.** SP5 is ≥ 2.14 everywhere and ≥ 2.30 on 10/12.
- B5 ink-vs-I is monotone on 12/12 (`nonMono` = 0). `siteCoverage` d=50 is ≥ 0.97. `subMin` = 0.
- B1 tipContact is ≤ 0.17 on 11/12, and B3 markContact is ≤ 0.36 on 11/12. `test torus/hatch`
  (0.28 / 0.53) is the known foreshortened cell (§3.3 negative 3).
- H2 (`anal.py`): cone rogue = 0 (both rigs) and bent = 2/1. Sphere rogue = 9/12, rogueHoriz = 2/3
  (2.7/5.6 mm), bent = 29/29, against main's 41/34, 5/3 and 55/57. The bend cap roughly halves H2 on the
  sphere but does not clear it. The residuals are at the pole fan and the lit limb.

**Mid-tone lightening (the γ cost), `create sphere/hatch` covByI in 0.1 bins, I = 0 → 0.9.**
- main: 0.85 → 0.22.
- p4: 0.49, 0.45, 0.38, 0.33, 0.25, 0.19, 0.12, 0.06, 0.02.
The ramp is smooth and monotone, but at I = 0.5 the coverage is ~0.19 against main's ~0.58.

**The frontier, measured and not argued** (d=50, 12 fixtures each; `data/m_p4{a..i}_50.log`):

| variant (κ, α, γ) | O5 range (mono) | B4 range | reading |
|---|---|---|---|
| p4a (0.6, 0.40, 1) | 1.14–1.89 (5/12) | 0.69–0.83 | spacing wins, length fails |
| p4c (0.7, 0.50, 2.0) | 1.65–2.67 (8/12) | 0.59–0.68 | — |
| p4f (0.7, 0.60, 2.0) | 1.83–3.15 (8/12) | 0.53–0.63 | — |
| p4g (0.9, 0.60, 2.0) | 2.14–3.44 (12/12) | 0.43–0.53 | — |
| **p4h = proto4 (0.9, 0.60, 2.6)** | **2.25–4.12 (12/12)** | **0.44–0.56** | the pictures below |
| p4i (0.85, 0.55, 3.0) | 2.10–4.30 (12/12) | 0.49–0.64 | lightest mid-tones of all |
| proto (orig. I-ramp length) | 2.51–3.55 | 0.02–0.18 | length absorbs the tone; spacing moves *against* it |

### A3. d = 220 (T2-4 set; `data/m_p4h_220.log`)

- `siteCoverage` is **0.887–0.988, ≥ 0.90 on 9/12**. The misses are `create torus/hatch` 0.887,
  `create torus/contour` 0.890 and `test torus/hatch` 0.900.
- `subMin` = 0 on 12/12. tipContact 0.07–0.16. B4 0.57–0.97. SP5 7.1–11.1.
- **O5 is 1.01–1.57.** At R = 1.05 mm the tick cannot be much shorter than the 0.69 mm plot floor, so
  **at maximum density the length channel physically has no room**. Main is already 1.45–1.99 there;
  O5 is gated only at d=50.
- Ink falls to ~35–45 % of main (cone/hatch/create 2236 → 797 mm).

### A4. Why B4 ≥ 0.60 and O5 ≥ 2.30 conflict — the arithmetic Jay needs

Coverage `c = (L/R)·(w/P)`, so `log c = log(L/R) + log(w/P)`. The two regression shares (length and
spacing) **sum to 1**. O5 ≥ 2.30 needs log-length to move ≥ 0.83 between the dark and light thirds. B4
≥ 0.60 then needs spacing to move ≥ 1.5× that, so the tone must span ≥ ~8× in coverage between the
thirds. The shipped perceptual curve gives a contact-free field only ~2.3× between thirds (main's
covByI: 0.85/0.82/0.77 vs 0.48/0.36/0.23). **Every added factor must come from a steeper tone curve
(γ), which empties the mid-tones.** p4i (γ = 3) is the closest to both bars, and its mid-tones are
lighter still.

**Recommendation for Jay (pick one):**
- **(A)** Keep O5 ≥ 2.30 and replace B4's *share* with **SP5 ≥ 2.30, monotone**. This is the same bar
  O5 applies to length, now applied to spacing: "spacing opens ≥ 2.3× from shadow to light". Proto4
  meets it on 10/12, the misses being cone/contour 2.14 and 2.32 (test just passes). It needs γ ≈ 2, not
  2.6, which keeps more mid-tone.
- **(B)** Keep both literal bars and accept γ ≈ 3 (p4i-class), i.e. much lighter mid-tones.
- **(C)** Keep B4 ≥ 0.60 and let O5 fall to ~1.8–2.0 (p4c-class).

### A5. `wedge25` → monotone bar (ruling 3)

**New bar:** the rasterised bare-distance field (`measureWedge`'s own raster), binned by I in 0.1 steps
below the 0.90 highlight, must have a **mean bare distance that is non-decreasing in I** (0 inversions).
The fixed per-cell 0.090 / 0.180 ceilings and the six-cell mean bars retire under `## Bars changed`,
quoting the ruling. Not measured by this planner; it is the implementer's RED. The per-cell `wedge25`
values for proto4 (0.05–0.18 at d=50) are in the data logs for continuity.

### A6. PICTURES FOR JAY — plainly labelled, all `--rig create`, med density unless the name says max

- **`T2-7-plan-evidence/JAY_triptych_cone__hatch__mkTick__med__a.png`** and
  **`JAY_triptych_sphere__hatch__mkTick__med__a.png`**: *BEFORE T2-6 (T2-5) | NOW ON MAIN (T2-6,
  rejected) | PROPOSED (T2-7 proto4)*. `__addlayer` twins and `…max__a` cone/torus triptychs sit beside
  them.
- **`JAY_shadow_crop_cone__hatch__mkTick__med__a_x3.png`** and
  **`JAY_shadow_crop_sphere__hatch__mkTick__med__a_x3.png`**: the SAME shadow box cropped from all three,
  at the same 3× nearest-neighbour scale.
- Captures come from `scene3d-capture.js --tier B` on port 8475 (killed; `lsof` empty). The served
  version was 1.4.3. The shots are in `cap-proto4/`, next to `cap-t25/` and `cap-main/`.

**What I SEE (planner's eye, stated plainly for the decision).**
- **Shadows (the crops).** T2-5 and main read as near-solid white: ticks fused into long lines, with
  bright seam blobs. Proto4 reads as **clearly separate ticks of equal length with a thin, even black
  seam between bands**. The eye sees ticks, not lines. The shadow is visibly darker on paper than today:
  roughly half ink instead of near-solid. That is the dark-end trade Jay asked to see.
- **Whole cells.** The spacing gradient is legible band by band, and there are no rungs, no fragments
  and no fused lines.
- ⚠ **But the γ = 2.6 tone curve empties too much of the mid-tone.** On the cone, the upper-right third
  is bare where T2-5 still had a sparse field. On the sphere, the lit crown goes bare earlier. If Jay
  prefers the fuller mid-tones, that argues for recommendation (A) at γ ≈ 2.
- Residual sphere pole/limb hooks remain (H2 halved, not gone).

**Verdict: the contact and dark-band behaviour is right. The tone curve needs Jay's A/B/C choice
(§A4) before an implementer is briefed.**

### A7. Changes to §4 / §6 / §7 carried by this amendment

- **B4** is pending Jay's A/B/C. **O5** stays at 2.30 (d=50). **SP5** is added as a candidate bar.
- `wedge25` becomes monotone (§A5).
- New constants: `MK_TICK_LEN_KAPPA`, `MK_TICK_LEN_ALPHA`, `MK_TICK_TONE_GAMMA`, `MK_TICK_BEND_CUT`.
  Each is a new bar and must be disclosed.
- **Reviewer flag 6 now also reads:** γ is a tone-reproduction change. The per-bin coverage table must
  appear in the report beside the whole-cell pictures.

## Bars changed (amendment)

**None.** The work stayed read-only: scratch trees only, and no test or source in any worktree or in
MAIN's `src/`/`tests/` was touched.

---

## Amendment 2 — Jay's round-2 ruling (proto3 markup) and proto5

**Rulings (SESSION-SUMMARY §4, "T2-7 round 2").**
- **Tone → (A):** `O5 ≥ 2.30` AND `SP5 ≥ 2.30`, both monotone. The B4 0.60 share **retires** (a
  `## Bars changed` entry).
- **Base look = proto3**, not proto4.
- **GREEN spots = "should be filled with ticks":**
  - G1: cone lit-flank seam gutters.
  - G2a / G2b: cone base wedges, bottom-centre and bottom-right.
  - G3: cone right edge below the apex.
  - G4: sphere right limb, mid-height.
  - G5: sphere bottom-right rim.
  - G6: sphere upper-right edge.
- **RED spots = "wonky / wrong direction":**
  - R1: cone left edge, upper third.
  - R2: cone right edge, lower third.
  - R3: cone bottom-left corner.
  - R4 / R5 / R6: sphere left edge, upper / mid / lower.
  - R7 / R8: sphere bottom rim, centre / right.

**STATUS: MEASURED, and the picture is only partly right. One conflict needs Jay's word (§B5).**

### B1. What was built (`scripts/mkproto5.py`, diffs `scripts/proto5.diff` / `scripts/proto5L.diff`)

Both variants share the same geometry. It keeps proto3's contact-free centred-tick field and adds:
- **(a) Real-neighbour band extents.** Each tick's half-extent toward each side is set by the *actual*
  neighbouring marked ruling. The neighbour is found at chart offset `±(1/markRowCoverage)·pitchStep`
  and its distance projected on the tick axis, less half the contact gap. The local `R` estimate is not
  used. So seams are one contact gap wide wherever both rows exist.
- **Band fill by graded pieces.** When tone shortens a band, the leftover bare width is cut into slots
  of about one contact gap, and the ink goes into pieces that SHORTEN toward the light (ratio 0.8).
  Alternate pieces are offset half a period along the row. Each piece is placed as its **own mark**,
  so O5 sees short ticks in the light.
- **(b) Limb and chart-edge reach.** Where the neighbour row is off the front surface, the extent runs
  to the silhouette (binary search on `sampleAt(...).front`) less 0.75 pen, capped at 1 RP. Beyond
  that, a chain of gradually shortening ticks continues to the edge.
- **(c) Limb direction.** Tick-only chord-direction refusal (> 25°) plus a bend cap. The bend cap stops
  a walked arm when a step turns > 30° from the arm's first step.
- **T2-4 plot floor:** a tick is at least `min(1.15·MIN_MARK_MM, 0.98·band)`, and the floor wins over
  the seam gap.

The two variants differ only in tone:
- **proto5 = A-class tone** (`κ 0.9, α 0.35, γ 2.0`). This is the one that meets Jay's tone ruling.
- **proto5-L = proto3's tone** (`γ 1, α 0.12`, no band-fill pieces). This is proto3's look plus the
  geometry fixes.

### B2. Bars — 12 fixtures at d=50, and the same 12 at d=220 (fixture §0; no ground ink)

Data: `data/m_{p3g,v16g,v14g}_50.log`, `data/m_{p3g,v16,v14}_220.log`. Each entry below reads
**proto3 → proto5 → proto5-L**.

**d = 50**
- **O5 ≥ 2.30, monotone:** 0/12 (min 1.18) → **12/12 (min 3.15)** → 0/12 (min 1.01).
- **SP5 ≥ 2.30, monotone:** 8/12 (min 2.02) → **12/12 (min 2.57)** → 9/12 (min 2.13).
- **B1** tip contact ≤ 0.15: 10/12 (max 0.39) → 10/12 (max 0.37) → 8/12 (max 0.42).
- **B3** mark contact ≤ 0.30: 10/12 → 10/12 → 9/12.
- **B5** monotone ink-vs-I: 11/12 → 11/12 → **6/12** ✗.
- **B7** siteCoverage (reported at d=50): min 0.984 → 0.915 → 0.925. `subMin` = 0 on all three.
- **B9** `over2RP`: 0 on all three. maxL/RP is 1.56–1.94.
- **B8** `ovMax`: not instrumented this pass. It is 0 by construction for the extents, but the
  silhouette blobs of §B3 are overlaps, so **treat B8 as unproven**.
- **gutter metric `bareSeamFrac`** (share of dark/mid tick tips whose bare run to the next ink is
  > 2 contact gaps; mean of 12): 0.172 → 0.201 → **0.103**.
- **`limbGapFrac`** (the same, where the run ends at the silhouette edge): 0.131 → 0.201 → 0.162.

**d = 220**
- O5 ≥ 2.30: 0/12 in all three (min 1.01 → 1.01 → 0.99). This is physical: there is no room for
  length at 3.5-pen rows (§A3).
- SP5: 10 → 12 → 12.
- **B7 ≥ 0.90: 10/12 → 3/12 → 2/12 ✗** (min 0.894 → 0.813 → 0.812). The neighbour-extent geometry
  regresses T2-4's coverage.
- B5: 7 → 4 → 1 ✗.

**Readings.**
1. **Jay's tone ruling (A) is met only by proto5**, at 12/12 on both bars.
2. The **gutter metric improves only under proto5-L** (proto3's tone). The length channel O5 demands
   is exactly what opens gutters in the light.
3. **Both proto5 variants regress d=220 coverage and B5 monotonicity.** Neither is shippable as is.

### B3. Per-spot verdict — native crops `JAY2_spot_{cone,sphere}_<spot>.png` (proto3 | proto5 | proto5-L), all LOOKED at

| spot | cause (named) | proto5 | proto5-L |
|---|---|---|---|
| **G1** cone lit-flank gutters | the length channel shortens lit ticks around a fixed centre, which opens both seams | ✗ **worse**: the flank thins to scattered short pieces | ◐ **partly**: seams narrower and bands reach nearer the edge; a few gaps remain |
| **G2a** base wedge, bottom-centre | the band's ruling exits through the base rim; the triangle beyond has no row and no along-row tick, and cross-row extents cannot reach it | ✗ | ✗ (unchanged) |
| **G2b** base wedge, bottom-right | same | ✗ (sparse pieces) | ✗ the gap to the rim remains; hooks gone |
| **G3** cone right edge below apex | lit tone: spacing is sparse by design at the silhouette | ✗ **worse** (bare) | ✗ plus a **new horizontal bar artefact** near the edge |
| **G4** sphere right limb, mid | extents stopped at a stale local R, so ticks fell short of the limb | ✗ (sparse) | ✓ **mostly**: ticks now reach the limb |
| **G5** sphere bottom-right rim | same class as G2 (row exits through the limb) | ✗ | ✗ the triangle persists |
| **G6** sphere upper-right edge | highlight tone | ✗ **worse** (bare) | ✗ (as proto3) |
| **R1** cone left edge, upper | at the silhouette the neighbour row is back-facing, so the extent runs to the edge and **overlaps the next row's ticks** | ✗ stubs gone, but a **fused bright bar** appears | ✗ same fused bar |
| **R2** cone right edge, lower | walk hook at the silhouette | ✓ hooks gone | ✓ **clean** |
| **R3** cone bottom-left corner | same as R1 (rim + limb corner) | ✗ fused blob | ✗ fused blob |
| **R4** sphere left edge, upper | same as R1 | ✗ a long **horizontal fused bar** | ✗ same |
| **R5** sphere left edge, mid | limb walk bend | ✓ | ✓ |
| **R6** sphere left edge, lower | limb walk bend / crossed stubs | ✓ **clean** | ✓ **clean** |
| **R7** sphere bottom rim, centre | fused stubs at the rim | ✓ | ✓ |
| **R8** sphere bottom rim, right | a stub **crossing** the ticks along the rim | ✓ crossing gone (curved tails remain) | ✓ same |

**Tally, spots fixed.**
- **proto5: 5 of 15.** The RED spots R2, R5–R8 are fixed. All 7 GREEN spots are not fixed, and
  G1/G3/G6 are worse.
- **proto5-L: 6 of 15.** R2, R5–R8 are fixed, G4 is fixed, and G1 is partly fixed.
- **New defects introduced by both:** fused silhouette bars (R1/R3/R4, the apex cap) and blob clumps on
  `torus/hatch/max` (`JAY2_torus__hatch__mkTick__max__a.png`).

### B4. What worked, what did not, and the fix for each named failure

**Worked, keep:**
- The bend cap and the chord-direction cut clear the walk hooks and crossings (R2, R5–R8, cone rogue =
  0).
- Neighbour-row extents give even seams where both rows exist (G4, the core of G1).
- Separate-mark pieces make O5 and SP5 pass together (12/12 each).

**Failed, with the mechanism named:**
1. **Fused silhouette bars (R1/R3/R4/apex, torus clumps).** "Neighbour back-facing" does not mean "no
   ticks there": the neighbouring row is visible nearer the limb, so extending to the edge overlaps its
   ticks.
   **Fix:** an ink-occupancy clip. Keep a grid of accepted tick points, and trim a walked arm at the
   first step within `(1+GAP)·w` of existing ink. It is tick-only, sits in `walkFrom`/`place()`, and
   reuses the `mkMidBuckets` idea at point granularity. This also closes B1 on `test torus/hatch`.
2. **Wedges (G2a/G2b/G5).** These are along-row: the lattice stops a whole period short of the span
   end, and no row covers the triangle past a ruling's exit through the rim.
   **Fix:** at each span end, place a final tick when the remaining arc > P/2, then run the edge-reach
   chain along `u` as well as `v`. Ticks laid beyond the last row's exit must come from the *next* row
   index, i.e. rulings whose centre-line is off-surface but whose band overlaps it. That touches the
   row scaffold (`MK_ROW_COV` is forbidden), so it needs a ruling from the orchestrator.
3. **Lit-edge sparsity (G3/G6, and G1 under proto5).** This is not geometry. **Jay's (A) tone ruling
   requires the light third to carry ≥ 2.3× shorter ticks AND ≥ 2.3× wider spacing**, and the lit
   silhouette is the light third. Under proto3's tone the ticks are there (proto5-L), but O5 fails. See
   §B5.
4. **d=220 coverage regression (B7 3/12).** The neighbour extent at 3.5-pen rows plus the α length
   channel pushes marks under `MIN_MARK_MM`.
   **Fix:** make the length channel **density-aware**, α → 0 as `RPn/w → 4` (no length room). At
   d=220 the tick then stays at the plot floor and spacing carries all the tone. This matches the
   d=220 O5 physics already recorded in §A3.

### B5. The conflict Jay must see

His GREEN marks ask for *more, longer ink in the light* (lit flank, lit silhouette). His (A) ruling
asks for *≥ 2.3× shorter and ≥ 2.3× sparser ticks* from shadow to light. **The prototypes cannot
satisfy both on the lit side.** proto5 passes the bars and empties the marked spots. proto5-L fills
them and fails O5.

**Recommendation, for Jay to confirm:** apply O5/SP5 to I < 0.90 only. The highlight bin is then
exempt, the lit flank below the highlight is carried by *spacing plus graded pieces*, and the bars are
kept. This is a **population change** to O5 and must be disclosed. The alternative is to accept
proto5-L's tone for G1/G4 and waive O5 on the lit third. Both options are put to him with
`JAY2_cone__hatch__mkTick__med__a.png` and `JAY2_sphere__hatch__mkTick__med__a.png` (three panels:
proto3 | proto5 | proto5-L).

---

## Implementer section (T2-7, after W-07b)

**Sequencing.**
- Lane `fill-audit-a5` (`surface-fill.js` owner). Start **after W-07b lands** (worktree `fill-audit-b5`:
  `algoCoverage`'s `deepFillTSP` branch plus `tspAt`), and rebase onto it.
- T2-7 must not touch `algoCoverage`, `tspAt` or `markRowCoverage`.
- Run T3c-onset's `00e9bc7d` onset file as a guard: mkDashRamp stays byte-identical.
- **Do not start until Jay answers §B5**, which decides the O5 population.

**Mechanism to implement** (the §B1 geometry plus the §B4 fixes; tone per Jay's §B5 answer):
1. Contact-free centred ticks: `MK_TICK_GAP_PEN` = 0.6, and a tick-local `PMIN_T = (1+GAP)·w`.
2. Real-neighbour band extents plus limb/edge reach, with extents capped at 1 RP.
3. Band fill by graded pieces, each piece its own mark, ratio `MK_TICK_PIECE_RHO` = 0.8, with a
   half-period along-row offset on alternate pieces.
4. Tone: `c = cMax·(mkAsk/0.96)^γ` and `f = min(1, (c/κcMax)^α)`; the prototype values are γ 2.0,
   κ 0.9, α 0.35. α is density-aware (§B4.4).
5. T2-4 plot floor as a minimum size.
6. Chord cut (25°) and bend cap (30°), tick-only.
7. **NEW:** the ink-occupancy clip (§B4.1).
8. **NEW:** span-end along-row closure (§B4.2), limited to the parts that do not touch the row
   scaffold.

**Files ALLOWED:**
- `src/core/scene3d/surface-fill.js`, only in:
  - `solveAt`'s tick branch;
  - `layMark`'s tick block and the per-piece `place()` loop;
  - `walkFrom`, tick-only, only when `stepCapMM` is passed;
  - `place()`, tick-only lines;
  - new `MK_TICK_*` constants near `:2572`.
- `tests/unit/scene3d-mktick-*.test.js` and `tests/helpers/scene3d-mktick-*.js`.
- A NEW `tests/unit/scene3d-mktick-spacing-tone.test.js` for O5/SP5/B1/B3/B5/B7/B9/gutter, plus a
  per-spot geometric check (see RED below).
- Retiring `scene3d-mktick-gap-fill.{test,helper}`.
- `scene3d-mark-laws-draw.test.js`, O1 population only, with proof.

**Files FORBIDDEN:** as §6, plus W-07b's hunks.

**RED (from a scratch `git archive` of the rebased base):**
- O5 and SP5 at 12/12 (or per Jay's §B5 population).
- B1 ≤ 0.15 and B3 ≤ 0.30 at 12/12.
- B5 nonMono = 0 at 12/12.
- B7 ≥ 0.90 on the four T2-4 cells, both rigs, at d=220.
- `bareSeamFrac` ≤ proto3's per cell (dark and mid thirds).
- `limbGapFrac` ≤ proto3's per cell.
- over2RP = 0.
- A **silhouette-overlap count = 0** (fill ink within 1 pen of another tick's ink *and* within 2 pens
  of the edge path). This is the R1/R3/R4 regression gate.
- Each bar carries a mutation that trips it:
  - bend cap off → R-class rogues return;
  - occupancy clip off → silhouette overlaps return;
  - pieces merged → O5 fails;
  - γ = 1 → SP5 fails.

**Bars changed (to disclose):**
- B4 retired (Jay's ruling).
- `wedge25` becomes monotone (Amendment 1).
- 12 `pathSignature` goldens re-pinned.
- The `STAGGER_NEEDLE_SINGLE` mutation replaced.
- The gap-fill file retired.
- `ovMax` tightened.
- O5's population, if Jay picks I < 0.90.
- New constants: `GAP`, `RHO`, κ, α, γ, the cut angles and the clip radius.

**Evidence:**
- The same 15 spot crops and the three-panel triptychs, re-shot from the worktree on port ≥ 8495.
- **Every spot judged fixed or not in the report**, with the table of §B3 updated.
- `cone/hatch` and `torus/hatch` at max density.

**Reviewer flags (≤ 6):**
1. Re-judge all 15 spots from native crops. A GREEN spot marked "fixed" in the light third while O5
   passes is suspicious: check the O5 population.
2. The occupancy clip must be tick-only. mkDashRamp byte-identity must hold (single-pass / discrete /
   low-end files).
3. d=220 B7 must be ≥ 0.90 on emitted marks, with `subMin` = 0.
4. The pieces-as-separate-marks change alters O5's population, and that is a `## Bars changed` entry
   even though Jay asked for the bar.
5. B8 must be instrumented on emitted paths (not asserted by construction), given §B3's fused bars.
6. The `band-purity` and `wedge` hand-copied tick blocks must mirror the shipped block.

### Evidence added by this amendment

| path | what |
|---|---|
| `JAY2_{cone,sphere}__hatch__mkTick__med__a{,__addlayer}.png`, `JAY2_{cone,torus}__hatch__mkTick__max__a.png` | proto3 \| proto5 \| proto5-L, `--rig create` unless `__addlayer`, gallery framing (Jay's screenshot size) |
| `JAY2_spot_cone_{G1,G2a,G2b,G3,R1,R2,R3}.png`, `JAY2_spot_sphere_{G4,G5,G6,R4,R5,R6,R7,R8}.png` | native 2–3× crops of every marked spot, all three trees |
| `cap-proto5/`, `cap-proto5L/` | captures (port 8475, killed; the served source carries the proto5 patch, verified by grep) |
| `data/m_{p3g,v16g,v14g}_50.log`, `data/m_{p3g,v16,v14}_220.log`, `data/m_v{1..16}_50.log` | every number above, plus the variant sweep (v1–v16; v16 = proto5, v14 = proto5-L) |
| `scripts/mkproto5.py`, `scripts/proto5.diff`, `scripts/proto5L.diff`, `scripts/metrics.js` (with the gutter/limb instrument) | reproducible prototype and instruments |

## Bars changed (amendment 2)

**None.** The work was read-only: scratch trees only, and nothing in any worktree or in MAIN's
`src/`/`tests/` was touched.
