STATUS: MEASURED

# W-35b — end-overlap / edge-fidelity for SURFACE-FILL rulings (planner report)

**Summary.** W-35b was split out of W-35 on the hypothesis that the stair-step Jay saw at contourSlice
ring ends also lives at surface-fill ruling ends, by a different mechanism. **It does not.** Measured on
the current lane head `3bc61c32`, a surface-fill ruling end is not trimmed, not inset and not quantised:
the emit loop bisects the front/back crossing against the **analytic chart** to 1/4096 of a sample step
(`surface-fill.js:8744-8765`), the self-occlusion pre-split bisects 24 times (`:7398-7406`), and at an
**occluder** boundary the cut lands on the occluder's own drawn mesh polygon with a **median gap of
0.0000 mm across 5 mappers × 2 densities**. The stair-step quantity — the second difference of end
position along the silhouette, which annihilates the smooth sagitta trend — is **p90 ≤ 0.42 pen on
hatch / contour / crosshatch and ≤ 0.76 pen on spiral across both rigs and both densities** — i.e.
**sub-pen everywhere**, which is not a ladder. The same instrument, in the same runs, reads **up to
2.54 pen p90 / 4.48 pen max on the contourSlice control**, and contourSlice is the rougher of the two on
**7 of 10 primitive × camera pairs on both rigs**, by **634×** on `cone · b`.
The shipped `sliceEndOverlap` is proven inert on surface fill (k = 8 and k = −2 are
**byte-identical on 24 of 24 surface-fill cells** and change geometry on 5 of 6 contourSlice cells). The
one real residual at surface-fill ends is **W-32's overshoot past the inscribed border** — and this pass
found it **worse than W-32 recorded**, because W-32 never measured the ellipsoid: **0.61–0.72 pen at the
creation defaults**, over the 0.50-pen bar, with **8–14 endpoints per cell over it at d220**, on a
primitive W-32's own app-default table omits. That is
**new input to decision 9**, not a new unit. **No code is proposed. W-35b closes MEASURED**, with the
ellipsoid finding filed to decision 9 / Rank 4 and a conditional design (§4) recorded in full so that if
Jay wants the control on his own preference rather than on a defect, an implementer can take it without
re-planning.

---

## 0. Provenance, rig and baseline discipline

| item | value |
|---|---|
| lane | `fill-audit-a3` (`3d-scene/fill-audit-a3`), port 8475 |
| **lane HEAD read (recorded)** | **`3bc61c325c44e02ba14819dbc7b9242bc340ce68`** — F1-amp (DONE/FU) |
| working copy | read-only scratch export `/private/tmp/claude-501/scratch-W35b` (`git archive 3bc61c32 \| tar -x`), `node_modules` symlinked from MAIN. **The worktree was never written to, never stashed, never `cd`-ed into.** `surface-fill.js` is under a live implementer there; only the export was read. |
| runtime | Node **v20.20.2** (`.nvmrc`), `package.json` version **1.4.1** in the export |
| pen | 0.3 mm (document default) — every "pen" figure below is `mm / 0.3` |
| doc bounds | 320 × 220 mm |
| rigs | **both**, per binding rule 3. `create` = `PRIMITIVE_CREATE_DEFAULTS` over `PRIMITIVE_PARAM_DEFAULTS` (**what the v1.4.1 gallery and Jay's screenshots show**); `addLayer` = `engine.addLayer('scene3d')` tree with the object3d leaf's `primitive` mutated in place (**what every RGR test in these lanes constructs**). Both reproduced verbatim from `scripts/audit/scene3d-capture.js:240-312`. |
| cameras | `a` = `Params.DEFAULT_CAMERA`; `b` = the same with `yaw 40 / pitch −15` (`scene3d-capture.js:150`) |
| densities | `med` = 50 and `max` = 220 (`DENSITY_VALUES`, `scene3d-capture.js:148`) |
| tone law | `ladder` (`SCENE_FILL_STYLES.DEFAULT`) |

**Every number in this report was measured in this pass on `3bc61c32`.** None is carried over from W-32,
W-35 or the gallery. Where a W-32 number is quoted it is labelled as W-32's and is used only for
comparison.

**Instruments, and why they are trustworthy.** The four scripts are archived verbatim in
`docs/3d-audit/lane-reports/W-35b-plan-evidence/` (`measure.js`, `occl.js`, `reach.js`, plus the raw
result JSON):

- **The drawn outline is the convex hull of the visible `sceneEdge` silhouette + boundary ink.** Every
  primitive measured here (`capsule`, `cone`, `cylinder`, `sphere`, `ellipsoid`) is convex, so its
  projected mesh footprint **is** that hull, exactly — no raster, no flood fill, no cell size to argue
  about. Torus / torusKnot are non-convex and are therefore **excluded from the hull instrument** and
  handled separately by the occluder instrument (§1.4).
- **Signed distance** to that hull: `> 0` = the end lies outside the drawn outline (W-32's overshoot),
  `< 0` = inside it.
- **Chart poles are excluded**, by the same rule `scene3d-fill-boundary-ends.test.js` uses (≥ 3 ends
  converging within 0.3 mm). This is not cosmetic: unfiltered, **13 capsule ends land on one point at
  (160.0, 95.0), 0.8372 mm inside the hull**, and they alone drive every scatter statistic — the first
  run of this instrument reported a 2.97-pen "stair-step" on `capsule · hatch · a` that was entirely that
  pole. The filtered number for the same cell is **0.15 pen**.

---

## 1. SCOUT — is the stair-step at surface-fill ruling ends still present?

### 1.1 Answer: **no.** And the mechanism Jay inferred does not exist on this path either

Jay's words (SESSION-SUMMARY §5 report 15, verbatim):

> *"You can observe some minor imperfections where line segments end, creating stairstepping. If this is
> to minimize overlap to prevent bleedthrough, perhaps having a parameter we can control for this would
> make the most sense? Increasing allows for subtly more overlaps and preserves outer edge fidelity?"*

W-35 established that on the **slices** path the hypothesis is wrong in a specific way — there is no trim;
the ring is cut at a **facet boundary**, and the quantisation scales as 1/detail. On the **surface-fill**
path the hypothesis is wrong in a *different* way: there is no trim **and** there is no quantisation.
Three independent end-cut sites, all refined:

| site | file:line | what it does at a ruling end | measured residual |
|---|---|---|---|
| **silhouette** (the surface turns away) | `surface-fill.js:8744` `EDGE_BISECT = 12`; `edgeAt` `:8756-8765`; called `:9458` and `:9485` on `!onSurf[s±1]` | 12 bisections against `sampleAt(...).front === wantFront` — the **analytic chart's own** front test, i.e. **1/4096 of a sample step** | end sits on the analytic terminator; the residual vs the *drawn* outline is the tessellation sagitta only (§1.2) |
| **self-occlusion** (the form hides itself) | `surface-fill.js:7360-7406`, `crossingPoint` `:7398`, **24 bisections** | the centreline is pre-split at the visible/hidden crossing *before* `ribbonizeCore`, so a visible sub-run reaches the true boundary | below float noise |
| **occluder / HLR** (another object, or the post-hoc clip) | `scene3d.js:4373` `selfOcclusionTest` → `clipper.hiddenAt`; post-hoc `clipPath` | the cut oracle is the **same mesh** the border pass draws | **median gap 0.0000 mm** (§1.4) |

**`onSurf[s]` is the analytic front test and nothing else** — `surface-fill.js:8143`
`const on = Boolean(smp && smp.front === wantFront);` — computed **before** the zone gate nulls a sample,
deliberately, because "the boundary refinement below is about where the SURFACE turns away, and a zone
edge is not that" (`:8108-8110`).

**There is no silhouette inset, no plot-safety trim, and no overlap-avoidance rule on this path.** Grep
of the whole 11 937-line file for `inset|shrink|trimEnd|endTrim|marginMM|SAFE_MM` returns exactly one
end-related hit, `adjEndInset` (`surface-fill.js:2920`, consumed `:8526-8528`), and it is
`TONE_ALGO === 'bundleLozenge' ? k * adjStep() : 0` — **the lozenge mark's own shape under one tone law,
zero under all 36 others.** W-35 §1.4 recorded the same thing on `fe491dfa`; it is still true at
`3bc61c32`.

### 1.2 The end-position residual, measured — W-32's cells, both rigs, both cameras

`create` rig, `ladder`, `fillDensity 50`. `maxOS` = greatest signed distance outside the drawn outline
(poles excluded). `rough p90` = the 90th percentile of `|d(i−1) − 2·d(i) + d(i+1)|` over arclength-
consecutive silhouette ends whose two gaps are both ≤ 3 mm — **the second difference, which annihilates
any smooth trend and leaves only end-to-end raggedness. That is the stair-step quantity.**

| cell | sil. ends | maxOS mm | **pens** | rough p90 mm | **rough p90 pens** | rough max pens |
|---|---|---|---|---|---|---|
| capsule · hatch · a | 27 | 0.0549 | 0.18 | 0.0555 | **0.19** | 0.26 |
| capsule · hatch · b | 30 | 0.0673 | 0.22 | 0.0319 | **0.11** | 0.29 |
| capsule · contour · a | 24 | 0.0572 | 0.19 | 0.0392 | **0.13** | 0.16 |
| capsule · contour · b | 36 | 0.0755 | 0.25 | 0.0556 | **0.19** | 0.26 |
| capsule · crosshatch · a | 57 | 0.0599 | 0.20 | 0.0512 | **0.17** | 0.29 |
| capsule · spiral · a | 32 | 0.0465 | 0.16 | 0.1186 | **0.40** | 0.58 |
| cone · hatch · a | 39 | 0.1124 | 0.37 | 0.0045 | **0.02** | 0.12 |
| cone · hatch · b | 32 | 0.1451 | 0.48 | 0.0005 | **0.00** | 0.82 |
| cone · contour · a | 50 | 0.1343 | 0.45 | 0.0000 | **0.00** | 1.66 |
| cone · contour · b | 40 | 0.0244 | 0.08 | 0.0000 | **0.00** | 0.00 |
| cone · crosshatch · a | 73 | 0.1454 | 0.48 | 0.0714 | **0.24** | 0.48 |
| cone · spiral · a | 32 | 0.0720 | 0.24 | 0.0000 | **0.00** | 0.00 |
| cylinder · hatch · a | 50 | 0.0116 | 0.04 | 0.0255 | **0.09** | 0.19 |
| cylinder · contour · a | 44 | 0.0000 | 0.00 | 0.0000 | **0.00** | 0.00 |
| cylinder · crosshatch · a | 99 | 0.0299 | 0.10 | 0.0298 | **0.10** | 0.29 |
| cylinder · spiral · a | 49 | 0.0000 | 0.00 | 0.0000 | **0.00** | 0.13 |
| **sphere · contour · a** (W-32's worst control) | 42 | 0.1494 | **0.50** | 0.0438 | **0.15** | 0.35 |
| **ellipsoid · contour · a** | 34 | **0.2005** | **0.67** | 0.1048 | **0.35** | 0.64 |
| **ellipsoid · crosshatch · a** | 68 | **0.2126** | **0.71** | 0.0881 | **0.29** | 0.62 |
| **ellipsoid · spiral · a** | 41 | **0.2060** | **0.69** | 0.2292 | **0.76** | 1.08 |

**`addLayer` rig, same cells, same instrument** (`out-rough-addlayer.json`, `out-max-addlayer.json`),
because a stop condition measured on one rig is a claim about one rig: `maxOS` **0.02–0.52 pen**;
`rough p90` **0.00–0.42 pen** on hatch/contour/crosshatch (worst `ellipsoid · a`) and **0.00–0.67 pen** on
spiral at d50, falling to **0.20 / 0.32 pen** at d220. Same picture, marginally milder on most cells,
because that rig carries the sphere's `detail 28` bag for every primitive.

At **`fillDensity 220`** (`out-max.json`, the visually dense case where raggedness would show most),
surface-fill roughness does **not** get worse: median 0.0000–0.0223 mm, p90 **0.00–0.45 pen** across all
20 primitive × mapper cells. Overshoot does rise with ruling count (more ends sample the extremes):
ellipsoid **0.72 pen**, sphere / cone **0.52 pen**, cylinder **0.12 pen**.

**Two facts the table settles.**

1. **Adjacent ends do not step; they ramp.** The `cone · contour · a` sequence is the cleanest proof.
   Dumped end by end, the first 24 silhouette ends have a **constant** step of **0.0031–0.0032 mm
   (0.01 pen)** per ruling over 40 mm of silhouette arc — a perfectly linear ramp (the sagitta shrinking
   toward the apex), which is exactly why the second difference is **0.0000**. The two "rough" outliers in
   that cell (0.1879 and 0.1524) are the two rulings that end at the **cone apex**, 0.18 and 0.34 mm
   *inside* the hull — an apex, like a pole, is not a silhouette end.
2. **Spiral is the only mapper with genuine alternation**, and it is small. On `ellipsoid · spiral · a`
   the rough ends are on **both** silhouettes (x ≈ 132–135 and x ≈ 186–188), and `d` alternates between
   **−0.134 and +0.206 mm** — a swing of **1.1 pen** at worst, p90 **0.76 pen**. This is the worst
   surface-fill number in the whole sweep and it is still **one-third of the contourSlice control's worst**
   (§1.3). Note also that `scene3d-fill-boundary-ends.test.js` **excludes spiral by measurement**
   (`:38-43`: a helix's turn legitimately begins and ends on the wind meridian, which is open surface), so
   part of this alternation is a mapper contract, not a defect.

### 1.3 The control that decides the split: contourSlice on the same primitives, same instrument

`SF` = the **worst** of hatch / contour / crosshatch for that primitive × camera; `CtS` = contourSlice.
`fillDensity 50`, rough p90 in pens. **Both rigs, because the two disagree in an instructive way.**

| primitive · cam | **create** SF | **create** CtS | ratio | **addLayer** SF | **addLayer** CtS | ratio |
|---|---|---|---|---|---|---|
| capsule · a | 0.185 | 0.139 | 0.75× | 0.303 | 0.257 | 0.85× |
| capsule · b | 0.185 | 0.145 | 0.78× | 0.216 | 0.282 | 1.31× |
| cone · a | 0.238 | **0.434** | 1.82× | 0.161 | 0.260 | 1.61× |
| **cone · b** | **0.004** | **2.539** | **634×** | **0.013** | **0.381** | **29×** |
| cylinder · a | 0.099 | 0.222 | 2.24× | 0.041 | 0.282 | 6.88× |
| cylinder · b | 0.066 | 0.129 | 1.95× | 0.033 | 0.072 | 2.18× |
| sphere · a | 0.240 | 0.177 | 0.74× | 0.240 | 0.177 | 0.74× |
| sphere · b | 0.229 | **0.646** | 2.82× | 0.229 | **0.646** | 2.82× |
| ellipsoid · a | 0.365 | 0.462 | 1.27× | 0.420 | 0.358 | 0.85× |
| ellipsoid · b | 0.304 | 0.424 | 1.39× | 0.244 | 0.246 | 1.01× |
| | | | **CtS rougher on 7/10** | | | **CtS rougher on 7/10** |

**Read this honestly, both ways.**

- **contourSlice is the rougher mechanism, but not uniformly.** It leads on **7 of 10** pairs on **both**
  rigs. On the other 3 (`capsule · a`, `sphere · a`, `ellipsoid · a` on addLayer) surface fill is
  marginally rougher — by **≤ 0.09 pen**, with both sides under **0.42 pen**. **I am not claiming a clean
  2× separation; the data does not support one.**
- **What the data does support is the absolute reading, and that is what decides the unit.** Every
  surface-fill cell in the sweep is **sub-pen**. The only cell in either mapper family that is **not**
  sub-pen is `cone · contourSlice · b` — **rough p90 2.539 pen, rough max 4.48 pen, on 23 silhouette
  ends** — against `cone · hatch · b` at **0.004 pen** on 32 ends, same scene, same instrument, same run,
  a factor of **634**. **The one visibly ragged cell in the whole sweep belongs to the slices pass, and
  W-35 has already shipped its knob.**

### 1.4 The occluder boundary — the other site the brief named

Two spheres, the second in front (`occl.js`; `create` bag, `camera a`, 320 × 220 mm). Measured: the signed
distance from each **cut end of the back sphere's rulings** to the **front sphere's drawn outline**.
Positive = the ruling stops outside the occluder, leaving a white hairline; negative = it runs under it.

| mapper | density | back runs | occluder cuts | **median gap** | **p90 gap** | max gap | ends > 0.5 pen |
|---|---|---|---|---|---|---|---|
| hatch | 50 | 39 | 24 | **0.0000** | **0.0000** | 1.1255 | 1 of 24 |
| hatch | 220 | 160 | 96 | **0.0000** | **0.0000** | 1.2393 | 3 of 96 |
| contour | 50 | 27 | 19 | **0.0000** | **0.0000** | 0.0000 | 0 of 19 |
| contour | 220 | 121 | 88 | **0.0000** | **0.0000** | 1.1429 | 2 of 88 |
| crosshatch | 220 | 193 | 108 | **0.0000** | **0.0000** | 1.4186 | 4 of 108 |
| spiral | 220 | 126 | 103 | **0.0000** | **0.0000** | 1.2176 | 3 of 103 |
| **contourSlice** | 50 / 220 | 26 | 18 | 0.0000 | **0.6019 (2.01 pen)** | 1.0657 | 3 of 18 |

The **exact** zeros are not a rounding artefact and not an instrument failure: the HLR occluder and the
border pass read the **same projected mesh**, so the cut lands on the drawn polygon to the last digit.
Surface-fill's occluder cuts are therefore a **zero-margin butt joint** — and since the occluder's outline
is a 0.3 mm stroke *centred* on that polygon, the two forms already overlap by half a pen in ink. There is
no white hairline to close and no bleed-through margin to reclaim. **contourSlice, on the same scene, has
a p90 gap of 2.01 pen** — again the ragged one, again already covered by `sliceEndOverlap`.

### 1.5 LOOKED AT IT — native-resolution crops, and what they actually show

Offline rasterisation of the emitted geometry at **48 px/mm** (0.3 mm round strokes; grey = drawn
`sceneEdge` outline, black = `sceneFill` ink), cropped to the left silhouette and enlarged 3× with
nearest-neighbour so no resampling can invent or hide a defect. These are **planning** images, not app
screenshots; the W-35 planner set the same precedent and disclosed it the same way.

- `W-35b-plan-evidence/crop-ellipsoid__contour__a__50.png` — the worst-overshoot surface-fill cell.
  **What I see:** each contour ruling runs to the silhouette, grazes the grey outline near-tangentially for
  roughly the last millimetre, and stops. The outer edge reads as a continuous grey line with black caps
  laid over it at each ruling; at four or five places the black cap sits slightly **outside** the grey
  (that is the 0.67-pen overshoot, visible as a short barb). **The ends do not form a ladder** — the
  positions along the outline are set by ruling spacing, and each end lands on the outline, not at a
  staggered offset from it.
- `crop-ellipsoid__spiral__a__50.png` — the worst-roughness surface-fill cell. Same reading, with a visible
  **alternation**: some ends cover the grey outline, the next stops a fraction short and leaves grey
  exposed. The swing is well under one pen width and reads as a faint beading of the outline, not as a
  step.
- `crop-sphere__hatch__a__50.png` — W-32's control cell. Clean; ends flush with the outline.
- `crop-ellipsoid__contourSlice__a__50.png` — the control. Rings hug and cross the outline and terminate
  **square**, leaving the notch W-35 described and fixed the lever for.

### 1.6 The one real finding — and it belongs to decision 9, not to a new unit

**The ellipsoid breaches W-32's 0.5-pen bar at the creation defaults, and W-32 never measured it.**
`W-32-W-33-plan.md` §A4's app-default table lists sphere, capsule, cone, cylinder — worst **0.50 pen,
zero endpoints over** — and on that basis decision 9 closed W-32 "for now". On the current tree, at the
`create` rig (the rig the v1.4.1 gallery and Jay's screenshots use):

| cell | maxOS mm | pens | ends over 0.15 mm |
|---|---|---|---|
| ellipsoid · crosshatch · a · d50 | 0.2126 | **0.71** | 1 of 68 |
| ellipsoid · spiral · a · d50 | 0.2060 | **0.69** | 1 of 41 |
| ellipsoid · contour · a · d50 | 0.2005 | **0.67** | 4 of 34 |
| ellipsoid · hatch · b · d50 | 0.1830 | **0.61** | 1 of 38 |
| ellipsoid · hatch · a · **d220** | 0.2172 | **0.72** | **8 of 128** |
| ellipsoid · contour · a · **d220** | 0.2170 | **0.72** | **14 of 148** |
| ellipsoid · crosshatch · a · **d220** | 0.2171 | **0.72** | **12 of 178** |
| ellipsoid · spiral · a · **d220** | 0.2150 | **0.72** | **7 of 171** |

**It is the same sagitta mechanism W-32 diagnosed, and the closed form predicts it to 1 %.** With
`sagitta = R(1 − cos(π/n))` and the CREATION bags read off `Params` in this pass —
`ellipsoid {sx 30, sy 20, sz 22, detail 26}`, `sphere {radius 25, detail 28}`, `cone {20/22/20, 24}`,
`capsule {14/16/14, 22}`, `cylinder {20/22/20, 24}`:

| primitive | longest semi-axis | detail | **predicted sagitta** | **measured maxOS (worst cell)** |
|---|---|---|---|---|
| **ellipsoid** | **30 mm** | 26 | **0.2189 mm** | **0.2172 mm** (−0.8 %) |
| sphere | 25 mm | 28 | 0.1573 mm | 0.1556 mm (−1.1 %) |
| cone | 20 mm | 24 | 0.1711 mm | 0.1451 mm (a cone's silhouette is its slant, not its rim) |
| capsule | 14 mm | 22 | 0.1426 mm | 0.0755 mm |
| cylinder | ruled silhouette | 24 | ~0 | 0.0299 mm |

**The ellipsoid is worst because it is the LARGEST primitive in the roster** (semi-axis 30 mm against the
sphere's 25) **at a comparable tessellation** — nothing about it is special beyond its size. It is
**not** a stair-step, and **no fix belongs in W-35b**. It is an input
to **§4 decision 9** — the true-silhouette border (W-32 Rank 4) now has one more cell over its bar than
the record shows. **Filed, not attempted.**

---

## 2. Does `sliceEndOverlap` reach surface-fill rulings? **No — proven three ways**

1. **Grep.** `sliceEndOverlap` appears in exactly four `src/` files: `scene3d.js` (3 sites),
   `params.js:735`, `scene3d-panel.js` (3 sites), and nowhere else. **Zero hits in
   `src/core/scene3d/surface-fill.js`.**
2. **Scope.** The only read is `scene3d.js:4688` —
   `const END_OVER_MM = clamp(finite(sp.sliceEndOverlap, 0), -2, 8) * penWidth;` — and it sits inside
   `if (sliceStyle.mapper === 'contourSlice' && record.id !== 'ground')` (`scene3d.js:4629`).
   `SurfaceFill.buildObject` is called from a different branch (`:4362`) and is never handed the key.
3. **Runtime, md5.** `reach.js` generates every cell three times (key absent / `= 0` / `= 8` / `= −2`) and
   md5s the emitted `sceneFill` geometry at 9 dp:

| | surface-fill cells (`hatch`, `contour`, `crosshatch`, `spiral` × 6 primitives) | contourSlice cells (6 primitives) |
|---|---|---|
| `k = 0` vs absent | **24 / 24 identical** | 6 / 6 identical |
| **`k = 8`** vs absent | **24 / 24 identical** | **5 / 6 CHANGED** |
| **`k = −2`** vs absent | **24 / 24 identical** | **6 / 6 CHANGED** |

(The one contourSlice cell identical at `k = 8` is the **cylinder**, whose depth-plane cuts are flat rings
already fully front-facing — there is nothing to extend into. It **does** change at `k = −2`. Disclosed
rather than averaged away; raw md5s in `W-35b-plan-evidence/reach-md5.json`.)

**The param is live exactly where it was designed to be and inert everywhere else. Its default remains
byte-identical on 30 of 30 cells.**

### 2.1 One control or a sibling? — **neither, because there is no second defect to control**

The brief asks the design question straight, so here is the straight answer, with the semantics test
applied rather than asserted.

**If a surface-fill knob were built, extending `sliceEndOverlap` would be the WRONG shape and a sibling
would be the right one** — for two reasons that are about meaning, not implementation:

- **Scope-of-meaning.** `sliceEndOverlap` is documented, named, clamped and presented as a **contourSlice
  style param** (`MAPPER_CONTROLS.contourSlice`, `scene3d-panel.js:455`; the `slice*` prefix matches
  `sliceCount` / `sliceRotate` / `sliceTilt` / `sliceVisibility`). Making it also drive `hatch`, `contour`,
  `crosshatch` and `spiral` would make a `slice*` key live on mappers that have no slices, and — worse —
  would make **every saved document that already carries a non-zero `sliceEndOverlap`** change appearance
  the moment its style is switched to a surface-fill mapper. That is a silent migration with no
  `SCENE_MIGRATIONS` step, and `params.js:112-123` is explicit that this class of change must not be made
  casually.
- **Unit-of-meaning.** On contourSlice the unit is *"arc along the ring past the facet cut"* — a cut that
  is **demonstrably early**, by a quantisation that scales as 1/detail. On surface fill the end is **not**
  early: it is on the analytic terminator to 1/4096 of a step. The same slider position would mean
  "recover what quantisation took" on one mapper and "deliberately overrun the true silhouette" on the
  other. **One word, two meanings — the thing the repo's own configuration discipline forbids.**

**But the prior question disposes of both options: neither control has a defect to correct.** Jay asked
for the knob on the premise that the raggedness was *"to minimize overlap to prevent bleedthrough"*.
Measured: on surface fill there is no overlap-minimisation to relax (no inset, §1.1), no bleed-through
margin to reclaim (occluder gap median **0.0000 mm**, §1.4), and the *"preserves outer edge fidelity"*
half is **already saturated in the direction he wants** — the ink reaches the true silhouette and on the
ellipsoid already sits up to **0.72 pen past the drawn border**. A positive control would push ink further
past an outline it already overshoots; a negative one would open the undershoot that
`scene3d-fill-boundary-ends` exists to forbid, and its honest range before that guard bites is **−3.3 pen**
(`TOL_MM = 1.0` at `:48`) — a control whose entire useful travel is under one pen width on the half a user
could perceive.

**Recommendation: ship nothing. Close W-35b MEASURED.** If Jay wants the control anyway — on preference,
having read §1 — §4 records the exact design, so this is a decision, not a re-plan.

---

## 3. RED oracle — the metric, and the honest report that it is GREEN

Per binding rule 1, the acceptance bar in Jay's sentence has **two clauses**, and the instrument gates
them separately. **Both were built and both were run.** Neither can be made RED on surface fill at the
current tree without dishonesty, and the report says which clause each covers.

**Proposed file if the unit is ever taken: `tests/unit/scene3d-fill-end-overlap.test.js` (new).** Do not
edit `scene3d-fill-boundary-ends.test.js` — it measures the opposite property (undershoot into open
surface) with a 0.35 mm raster and `TOL_MM = 1.0`, is structurally blind to overshoot (`:205-210` scores an
off-mask point **0.00 mm**, the best possible value), and must stay 41/41 and untouched. This is the same
ruling W-32 §A1 made.

| # | clause gated | assertion | **measured on `3bc61c32`** | verdict |
|---|---|---|---|---|
| **E1** | **"stairstepping"** (raggedness) | second-difference roughness p90 ≤ **0.5 pen** over arclength-consecutive silhouette ends (poles and apices excluded), on `{capsule, cone, cylinder, sphere, ellipsoid} × {hatch, contour, crosshatch}` × 2 cameras × 2 rigs × {d50, d220} | worst **0.42 pen** (`ellipsoid · a · d50`, `addLayer`; 0.365 pen on `create`); **16 of 120 cells read exactly 0.00** | **GREEN on all 120 — cannot be made RED honestly** |
| **E1s** | same, spiral | same bar, `spiral` only | worst **0.76 pen** (`ellipsoid · spiral · a · d50`, `create`; 0.67 on `addLayer`, 0.32–0.45 at d220) | **RED at 0.5 pen — but see below** |
| **E2** | **"preserves outer edge fidelity"** (overshoot) | every silhouette end's distance outside the drawn outline ≤ **0.15 mm = 0.5 pen**, `create` rig | **RED on ellipsoid only: 0.67–0.72 pen**, 1–4 ends over per cell. Sphere/cone at the line (0.45–0.52). capsule/cylinder clear (0.04–0.25) | **RED — and it is W-32's bar, not W-35b's** |
| **E3** | anti-cheat (imported from W-32 O3 / W-35 T4) | no end may be moved **off the analytic chart**: every emitted point's `\|F\|/\|∇F\|` deviation ≤ the k = 0 maximum + 0.01 mm | GREEN today (nothing moves anything) | must-not-break for any future fix |
| **E4** | non-vacuity of E1 | **the same E1 instrument, same rig, same run, on `contourSlice`** | **RED: 2.539 pen p90 / 4.48 pen max on `cone · b` (create), 0.381 pen on the same cell at `addLayer`; 0.646 on `sphere · b` on both rigs** | **PROVES E1 CAN GO RED AND DOES — on the mechanism Jay named** |

**E4 is the mutation proof the protocol demands, and it is better than a code mutation:** rather than
stubbing a function and asserting the metric collapses, it runs the **unmodified metric on the
unmodified product** against the mechanism Jay actually complained about — and the metric **fires**, at
**2.539 pen against a 0.5-pen bar, 634× the same cell's surface-fill reading**. **An instrument that goes
red on contourSlice and stays green on surface fill, in the same run, is not vacuous.** ⚠ **What E4 does
NOT prove** is a clean per-cell separation between the two mechanisms: §1.3 shows contourSlice leading on
**7 of 10** pairs, not 10 of 10, with three pairs going the other way by ≤ 0.09 pen. **The verdict rests
on the ABSOLUTE numbers (every surface-fill cell sub-pen), not on the ratio.**

**What I do NOT claim.** E1 gates raggedness only. It says nothing about overshoot (E2's clause) and
nothing about ink quantity; a fix that closed the raggedness by dragging every end 2 mm outside the form
would pass E1 and fail E2 and E3. **E1s (spiral) is genuinely over a 0.5-pen bar** — I am not hiding it:
it is the one surface-fill cell where the instrument fires. It is not a stair-step fix candidate because
(a) 0.76 pen p90 is a sub-pen beading, visible in `crop-ellipsoid__spiral__a__50.png` only at 3× of a
48 px/mm raster, and (b) `scene3d-fill-boundary-ends.test.js:38-43` records the measurement that a
helix's turn ends legitimately on the wind meridian, so part of the alternation is contract, not defect.
**Filed in §5 as the one follow-up W-35b leaves behind.**

---

## 4. Ranked mechanisms — **conditional; no prototype was built, and here is why, plus the gate if one is**

**No Rank-1 spike was prototyped.** The spike-gate exists to decide *how* to fix a measured defect; §1
measured no defect on this path, so a spike would be a prototype of a preference. Building one would have
produced numbers that look like evidence for a change nobody has agreed to make — the failure mode the
audit has been burned by. **Instead, the design is specified to the file:line an implementer would need,
and the gate it must clear is stated in full, so the work is one decision away, not one plan away.**

### Rank 1 (IF Jay asks for it) — `fillEndOverlap`, a **sibling** param on the surface-fill pass

| field | value |
|---|---|
| key | **`fillEndOverlap`** — `fill*`, not `slice*`; a **separate** key from `sliceEndOverlap` for the reasons in §2.1 |
| unit | pen widths (× document `penWidth` at use) |
| range / step / default | **−2 … +8, step 0.25, default 0** — the W-35 precedent, and **default must be byte-identical** |
| mechanism | in the emit loop, after `edgeAt(s, s±1)` returns the analytic crossing (`surface-fill.js:9458` / `:9485`), continue sampling **past** the crossing into the off-`wantFront` region, accumulating world-space arc, until `k × penWidth` is spent; interpolate the final partial step. Negative walks **inward** along the surviving run instead. Near the silhouette the far sheet projects back along the same screen curve, so a short positive extension hugs the outline rather than flying off it — **W-35 measured exactly this on the slices path** (endpoint→outline distance 0.351 → 0.341 mm from k = 0 to 8, i.e. **it does not grow**), which is why §2.1's objection is about *meaning*, not about the geometry misbehaving |
| gate | smooth charts only — never on `box` / `plane` / `pyramid`, whose front/back split is exact geometry |
| the one call site | `k === 0` must `return` the **literal** pre-change expression, as `extendFrontChains` does at `scene3d.js:854`, so byte-identity is **by construction** rather than by measurement |

**Spike gate — all five, or the Rank falls:**

1. **md5 byte-identity at the default across the roster.** `MAPPERS` (`params.js:79`) is
   `['none','hatch','wireframe','crosshatch','contour','spiral','stipple','contourSlice']`. The subject
   set is **4 of 8 = 50 %**, and every exclusion is **measured, not asserted**: `none` emits no fill;
   `wireframe` emits **0 `sceneFill` paths** on all five primitives × both cameras (measured, `out-med.json`);
   `stipple` emits 303–888 **dots** with **0 silhouette ruling ends** (measured, same file) — a dot has no
   end to overlap; `contourSlice` is W-35's, already shipped. Byte-identity must be shown on
   **4 mappers × 6 primitives × 2 cameras × 2 rigs = 96 cells**, and must additionally show the **37
   PRODUCTION tone laws × the 4 subject mappers** unchanged at the default, per binding rule 2.
2. **Evidence at k = −2 / 0 / 4 / 8 on BOTH `--rig create` and `--rig addLayer`**, per binding rule 3,
   with the `create` numbers leading because that is the rig Jay sees.
3. **E2 must not regress.** Overshoot at k = 8 must stay ≤ its k = 0 value + 0.01 mm on every cell — the
   ellipsoid is already at 0.72 pen and has no headroom.
4. **E3 must hold** at every k (no ink pulled off the analytic chart).
5. **`scene3d-fill-boundary-ends.test.js` 41/41 at every k**, including k = −2. Its fixture is the
   **app-default scene**, which is the `create` rig — so a negative overlap is measured by it directly.

**Full docs contract if it ships** (CLAUDE.md § Documentation Contracts + § Configuration): `params.js`
clamp case + `scene3d-panel.js` `MAPPER_CONTROLS` descriptor (`default: 0` — it is **live**, it seeds
`mapperDefaults` on every mapper switch) + the imperative per-leaf slider + `README.md` + `plans.md` +
`CHANGELOG.md` + the in-app help/shortcut surfaces if the control is keyed + `version:sync`. **No
`SCENE_MIGRATIONS` step and no `SCENE_VERSION` bump** (`normalizeStyle` is a per-key clamp with
pass-through, so an older document resolves the absent key to 0 = today's picture). **No preset work**:
no shipped `user-presets/scene3d/*.vectura` names a surface-fill end param, so nothing to re-bundle, and
`src/config/user-presets.js` is generated — never hand-edit it.

### Rank 2 — **W-32 Rank 4: refine the BORDER to the true silhouette.** The structural answer

This is the fix that actually removes what §1.5's crops show: the outline stops being an inscribed chord
polygon, the 0.72-pen ellipsoid overshoot goes to ~0, and every ruling end lands **on** a smooth curve.
It satisfies W-32 and W-35 together, which `W-32-W-33-plan.md` §A6 already said. **Cross-lane**
(`scene3d.js` edge pass `:4641-4790` + `hlr.js` occluders), large, and **filed unscheduled under
decision 9**. §1.6 adds one fact to that file: the ellipsoid is over the bar. **Do not attempt it here.**

### Rank 3 — **REJECTED BY MEASUREMENT, recorded so nobody re-tries it: raise the ellipsoid's creation `detail`**

It would work (sagitta is quadratic in 1/detail — W-32 §A3 measured 3.96× / 4.14× / 3.57× over 16 → 32),
and it is the wrong lever: `PRIMITIVE_CREATE_DEFAULTS` is a **shape** contract, not a quality knob, and
moving one primitive's number to pass an end-position bar reshapes every new ellipsoid a user creates for
a reason that has nothing to do with proportion.

---

## 5. Guards, evidence, files, stop conditions

### 5.1 Guards — each pin's FIXTURE checked, per binding rule 4

| guard | fixture | agrees with a W-35b change? | disposition |
|---|---|---|---|
| **`tests/unit/scene3d-fill-boundary-ends.test.js`** — **41/41** | **app-default scene** (`eng.addSceneTree()` + `setObjectPrimitive`, `:66-84`) — the `create` rig; 9 primitives × {hatch, crosshatch, contour, stipple}; `TOL_MM = 1.0` (`:48`), 0.35 mm raster (`:45`); **spiral excluded by measurement** (`:38-43`) | **YES — same rig, same primitives, same mappers.** A negative `fillEndOverlap` writes straight into its metric; its honest headroom is **−3.3 pen** | **RE-RUN, NEVER EDIT.** Verified **41/41 in 32.78 s** in this pass at `3bc61c32` |
| **W-26 gap jump** — `tests/unit/scene3d-ladder-uniform-field-spacing.test.js` **9/9**, bar **1.15** | a **synthetic param-bag rig** (`scene(mapper, primitive, sizes)`, `:68-121`) — **not** `addSceneTree`, and it measures **ruling SPACING in the field**, not end position | **NO.** Different fixture, different quantity: a change confined to the last sample of a run cannot move a field-spacing ratio | re-run as a cheap must-not-break; **re-pinning it would be the "guard that was never threatened" damage** binding rule 4 names |
| **W-36c P1–P6** — `tests/unit/scene3d-crosshatch-parity.test.js` | crosshatch **family parity / counts** | **NO** — counts families and rulings, not their ends | re-run only |
| **T4b ink guard** — `tests/unit/scene3d-mkdashramp-dark-end.test.js` **4/4** (ink **1501.0637 mm**, floor tied to `PRE_FIX_INK × 1.5 = 1137.75`) and **G4** (the slab half, gated separately) | the seeded sphere from `tests/unit/scene3d-insert-default-ink.test.js` — **`addLayer` rig**, `mkDashRamp`, **d = 220** | **MARGINAL — must be measured, not argued.** An end-overlap knob changes total ink; at the **default it is byte-identical**, so the pin is safe **only while the default is untouched.** Its fixture is `addLayer`, so a `create`-only measurement would not see it | re-run at the default **and** at k = ±8; **`## Bars changed` if anything moves** |
| **`tests/unit/scene3d-mark-laws-draw.test.js`** — **30/30** | T1/T1b/T4's oracle; marks ride `smps`/`arcMM` indices | **YES, structurally.** Any inserted end point renumbers those arrays | re-run; it is Tier-2 slow — `timeout: 600000` |
| **lane reds** | — | — | **None.** At `3bc61c32` (F1-amp) `scene3d-ribbon-f1b-streaks` is **44/44** and `scene3d-ribbon-wall-coverage` **36/36** (F1-amp-impl.md §§165-183, 248-249). **This unit inherits no red and creates none** (binding rule 5) |
| **byte-identity roster** | — | — | **N/A for a MEASURED close.** The roster and its coverage fraction are specified in §4's spike gate for whoever takes the conditional unit |

### 5.2 Evidence cells — verified to exist before being named

Checked against `docs/3d-audit/fill-audit/manifest.A.1-1.jsonl` + `manifest.B.*.jsonl` (4 564 rows), per
AGENT-PROTOCOL step 3. **All present:**

`shots/A/capsule__contour__ladder__med__a.webp` · `shots/A/capsule__hatch__ladder__med__a.webp` ·
`shots/A/capsule__spiral__ladder__med__a.webp` · `shots/B/cone__contour__ladder__med__a.webp` ·
`shots/B/cone__crosshatch__ladder__med__a.webp` · `shots/A/cylinder__contour__ladder__med__a.webp` ·
`shots/B/sphere__hatch__ladder__med__a.webp` · `shots/A/ellipsoid__contour__ladder__med__a.webp` ·
`shots/A/ellipsoid__spiral__ladder__med__a.webp` · `shots/A/ellipsoid__crosshatch__ladder__max__a.webp` ·
`shots/A/ellipsoid__contourSlice__ladder__med__a.webp` (the control).

⚠ **`ellipsoid`, `capsule`, `cylinder`, `torusKnot`, `superellipsoid`, `pyramid`, `solid`, `plane` carry
48 cells each and live in Tier A only** — a `manifest.B.*` glob alone reports them MISSING. That cost one
false negative in this pass; it is recorded so the next agent globs `manifest.*.jsonl`.

The **two-sphere occluder scene** (§1.4) has **no gallery cell** — the gallery is single-object — so it is
a **bespoke scene**, archived as `W-35b-plan-evidence/occl.js` + `occluder-gap.json`.

### 5.3 Files — allowed / forbidden

**A MEASURED close writes NOTHING under `src/` or `tests/`.** The lists below bind the conditional unit.

**Allowed (conditional unit only):**
- `src/core/scene3d/surface-fill.js` — the end-refinement block only (`:8737-8765`, `:9455-9487`). **This
  lane (`fill-audit-a3`) owns the file** per AGENT-PROTOCOL's serialization table — but it is **under a
  live implementer right now**; serialise, do not fan out.
- `src/core/scene3d/params.js` — **one** `case` in `clampStyleParam`, adjacent to the existing
  `case 'sliceEndOverlap':` at `:735`. Nothing else in the file.
- `src/ui/panels/scene3d-panel.js` — one `MAPPER_CONTROLS` descriptor per surface-fill mapper + one
  imperative `slider(...)` in the per-leaf block.
- `src/config/context-bar.js` — **expected to be NO edit.** Re-verified this pass: the file carries the
  fill-style roster and reachability rules (`SCENE_FILL_STYLES.groups`, `isReachableOn`), not per-mapper
  parameter controls; the Style/ctxbar surface is rendered generically from `MAPPER_CONTROLS` by
  `renderControl`, so **the descriptor IS the context-bar control**. Say so in the impl report rather
  than inventing an edit — W-35's implementer made exactly this call and was right.
- `tests/unit/scene3d-fill-end-overlap.test.js` — **new file.**
- Docs per §4's contract.

**Forbidden:**
- `tests/unit/scene3d-fill-boundary-ends.test.js` — **read it, never edit it.**
- `src/core/algorithms/scene3d.js` contourSlice pass, `mappers.js`, the slices pass, `hlr.js`,
  `shadows.js`, `surface-fill-mono.js` — other lanes' files.
- `src/config/user-presets.js` — generated.
- `PRIMITIVE_CREATE_DEFAULTS` / `PRIMITIVE_PARAM_DEFAULTS` — Rank 3 is rejected.

**Cross-lane merge note (not a block).** The conditional unit's `params.js` / `scene3d-panel.js` /
`context-bar.js` touches land on files **`fill-collapse-3` owned during round 3. That lane is CLOSED for
round 3 at `28cc745d`** (U9b-2 + U5b-4 + U7-2b + U5b-5, all ACCEPT / ACCEPT-WITH-FOLLOWUPS), so the touch
is a **merge note for whoever merges round 3**, not a live serialisation conflict. ⚠ U5b-5 is this audit's
first CSS change, so that merge's `test:ci` must include **e2e and visual**.

### 5.4 Stop conditions

1. **STOP — the unit is closed.** W-35b requires **no code**. Anyone who reopens it must first reproduce
   §1.3's control table on **both** rigs. The reproduction bar is the **absolute** one, not the ratio:
   if any surface-fill cell reads **≥ 1.0 pen** rough p90, or if `cone · contourSlice · b` no longer reads
   **≥ 2.0 pen** on the `create` rig, the instrument has changed and every number here is void.
2. **STOP if a "fix" makes E2 worse.** The ellipsoid is at **0.72 pen** against a 0.50-pen bar with no
   headroom. Any change that increases overshoot is a W-32 regression wearing a W-35b badge.
3. **STOP if `scene3d-fill-boundary-ends` needs its `TOL_MM` touched.** That is the tell that the fix is
   trimming ends into open surface — the defect the guard exists for.
4. **STOP if the default is not byte-identical** on all 96 cells of §4's gate. W-35 set that precedent and
   it is not negotiable.
5. **STOP and report rather than fudge.** If the honest answer stays "there is nothing to control",
   ship the measurement again.

### 5.5 Follow-ups left behind (filed, not attempted)

- **FU-1 → decision 9 / W-32 Rank 4.** The **ellipsoid is over W-32's 0.5-pen bar at the creation
  defaults (0.61–0.72 pen on four mappers, both cameras, both densities)** and W-32's own app-default
  table does not contain the ellipsoid. Decision 9 closed W-32 "for now" on a table that was missing this
  cell. **Jay should see this before Rank 4 stays unscheduled.**
- **FU-2 → spiral end alternation.** `ellipsoid · spiral` roughness **p90 0.76 pen / max 1.08 pen**, ends
  alternating −0.134 … +0.206 mm on both silhouettes. Sub-pen, partly a documented mapper contract
  (`scene3d-fill-boundary-ends.test.js:38-43`), **measured and filed** — the only surface-fill cell where
  E1 fires at a 0.5-pen bar.
- **FU-3 → oracle-instrument gap (the tenth).** **No shipped test measures ruling-end POSITION against the
  drawn outline at all.** `scene3d-fill-boundary-ends` measures undershoot against the **chart** and is
  structurally blind to overshoot; W-32's `scene3d-fill-silhouette-overshoot.test.js` was specified in
  `W-32-W-33-plan.md` §A5 and **never written** (confirmed absent at `3bc61c32`). E1/E2 in §3 are ready to
  ship as a **tests-only, measure-first** unit that would have caught FU-1 automatically.

---

## Bars changed

**None.** This unit ships no code and no test. No numeric threshold, tolerance, count bar or pinned
fingerprint in any existing test was widened, narrowed, re-pinned, or read for the purpose of changing
it. `scene3d-fill-boundary-ends.test.js` was **run** (41/41) and **read** (`TOL_MM = 1.0` at `:48`,
`CELL = 0.35` at `:45`, the spiral exclusion at `:38-43`); nothing in it was edited.

The bars **proposed** in §3 (E1 roughness p90 ≤ 0.5 pen; E2 overshoot ≤ 0.15 mm) are **new** bars for a
**new** file that does not exist and is not being created by this unit. They are labelled as proposals,
and E2 is not this unit's invention — it is W-32's 0.5-pen bar, restated at its own source.
