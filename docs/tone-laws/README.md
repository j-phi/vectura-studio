# The twenty-nine tone laws we keep

This is the permanent record of the twenty-nine surface-fill tone laws selected out of the
comparison rounds. Each law is a value of `TONE_ALGO` in
[`src/core/scene3d/surface-fill.js`](../../src/core/scene3d/surface-fill.js). A tone law
decides how a scene radiance becomes marks on paper: where a ruling goes, how wide it is,
and whether it is drawn at all.

Every number here was measured on the same fixture, by the same rig, in the same pass —
one sweep against one frozen source tree.

| Artefact | What it holds |
|---|---|
| [`keepers-table.tsv`](keepers-table.tsv) | Every law × every cell × every metric. 145 rows × 38 columns. |
| `keepers-sheet.png` | All twenty-nine on `sphere · hatch`, in this order. |
| `keepers-capsule-hatch.png` | The same twenty-nine on `capsule · hatch`. |
| `keepers-cylinder-hatch.png` | The same twenty-nine on `cylinder · hatch`. |
| `keepers-sphere-crosshatch.png` | The same twenty-nine on `sphere · crosshatch`. |
| `keepers-ellipsoid-contour.png` | The same twenty-nine on `ellipsoid · contour`. |

The five sheets are render artefacts, not source. They live in the session scratchpad at
`scratchpad/fillcmp/`. Regenerate them with the commands in
[Reproducing the measurements](#reproducing-the-measurements).

**The roster grew; the measurements did not drift.** The twelve were re-measured from
scratch alongside the seventeen additions, in the same sweep, against the same frozen build.
All 60 of their prior rows reproduced **exactly, to the last digit, on every metric**. What
changed is the *ranking*, and only because there are new laws standing in it — see
[What the additions changed](#what-the-additions-changed).

---

## The fixture and the rig

**Fixture.** App-default 3D Scene layer (Add Layer → 3D Scene, zero parameter
overrides). Sun azimuth 135°, elevation 45°. Nominal pen 0.3 mm. White paper. Whole shape
in frame. Five cells: `sphere · hatch`, `capsule · hatch`, `cylinder · hatch`,
`sphere · crosshatch`, `ellipsoid · contour`.

**Uncapped.** Every panel runs with `TONE_UNCAPPED = true`. `MASTER_MAX_LINES` goes 420 →
4000 and the `masterPitch` clamp is bypassed. The master grid then rules at the plot floor
itself. The only limit left standing is that floor, so each law is measured at its own
ceiling and not at a guard's.

**Provenance gate.** Each run serves two patched copies of the worktree over local HTTP.
The page hashes the `surface-fill.js` it actually loaded and the runner compares that
SHA-256 against the file on disk. A mismatch aborts the run. Every measurement below comes
from a run that printed `provenance OK` for both trees at v1.3.86.

**Frozen source.** This branch takes merges from sibling efforts *while a sweep runs*, so a
sweep that re-mirrored the live worktree between laws would not be one pass: law 3 and law
25 could be measured against different source. The sweep therefore builds one frozen mirror
first (`--freeze`) and points every law at it. All twenty-nine panels on all five sheets come
from one build — `surface-fill.js` SHA-256 `56149085…` at commit `f8ab81c`. The freeze refuses to hand back a tree
that does not parse — the first attempt caught the worktree mid-merge, conflict markers and
all, and the browser reported that only as `Unexpected token '<<'` with every cell silently
empty.

**Stage-0 cross-check.** The `NO TONE` reference is rebuilt inside every single run. The
compositor compares all twenty-eight copies of it before it draws anything; identical
Stage-0 ink across every run is the evidence that the sweep really was one pass.

### What each metric means

| Metric | Definition |
|---|---|
| **R²** | Straight-line fit of apparent CIE L\* against the scene radiance the fill itself used. Apparent L\* is ink area in a 3 mm perceptual window → Murray-Davies reflectance → L\*. |
| **off the line** | Worst bin's deviation from that straight line, as a percentage. |
| **L\* span** | The range of apparent L\* the drawing actually covers. |
| **darkest L\*** | 5th-percentile 3 mm window — the darkest tone covering a *region*, not a spot. The `min` column is the single darkest window. |
| **gap (median, 5th–95th)** | The gap between neighbouring marks **measured on the paper**, in mm. See below. |
| **adjacent gap ratio** | Median of max/min over consecutive pairs of paper gaps. A law that drops rulings from a comb can only step by whole multiples, so it sits near 2×; an integrated field sits near 1×. |
| **monotonic %** | Share of adjacent-gap transitions that move **with the light** — the gap widening where the surface is brighter. This is the property that reads as the tone *easing*. |
| **spacing CoV** | Coefficient of variation of the gap between adjacent rulings, counted in **master-grid line indices**. Meaningful only for laws that select from that grid. |
| **largest adjacent spacing step** | The worst ratio between two neighbouring index gaps. This is the number that reads as banding — again, grid laws only. |
| **weight step along / across** | The worst ratio between two neighbouring pen weights, along one ruling and across to the next. |
| **highlight falloff** | 95th percentile of \|∇L\*\| where radiance ≥ 0.55. How abruptly the ink stops at the lit end. |
| **moiré RMS / long-wave** | Tone residual the light does not explain, at the 3 mm window and again after a 5 mm blur. |
| **worst free end** | Longest ruling end that stops in open front-facing surface. The raw figure additionally counts abutting piece joins, which are pen-down and not breaks. |
| **widest bare gap** | Largest disc of front-facing surface with no ink in it. |
| **ink / paths** | Total drawn length in mm, and the pen-down path count. |
| **bundle passes / flood %** | Adjacent-pass family only: how many passes a bundle actually got, and the share of gated samples where a sub-nib step laid ink on ink. |
| **field gap / flood %** | Continuous-field family only: the range of gaps the field actually placed, and the share of placed rulings that landed at or below one ink width. |

#### Why the gap is measured twice

The `spacing CoV` and `largest adjacent spacing step` columns count **line indices on the
master grid**. That is the right unit for a law that *drops* rulings from a comb, and it is
no unit at all for one that *integrates* a position. A continuously placed family has an
index gap of 1 everywhere, which tabulates as `CoV 0, step 1×` and would read as *perfectly
even* when it is nothing of the kind.

So the gap is also measured where it actually exists — on the paper. Scan lines run
perpendicular to the dominant screen ruling direction; every crossing of that family is
found analytically against the emitted segments (no raster, so a 0.3 mm gap survives, which
a 0.25 mm mask cell would have swallowed); the differences between successive crossings are
the gaps a viewer reads. Crossings off the front surface, and gaps wider than 8 mm — which
are the shape running out, not a spacing decision — are dropped.

This measurement is independent of the source, and it corroborates it: `phaseFineLadder`
reads 1.91× / 40.4 % monotone here against the 1.87× / 40 % recorded in the source
comments, and the `contField*` family reads 1.02–1.03× against a recorded 1.01–1.03×.

**One caveat, and it matters.** For the adjacent-pass family the paper gap is dominated by
the ~1-nib step *between passes inside a bundle*, not by the bundle pitch. Its ratio near
1× is a statement that the passes abut. It is not a statement that its tone eases.

---

## The five families, and why the last three exist

The twenty-nine sort into five ways of turning radiance into ink, plus the reference.

| Family | Tone is carried by | Laws |
|---|---|---|
| **width** | The stroke's own width | `nibAngle`, `taperedEnds`, `weightModulated`, `isophoteWidth`, `whiteBand`, `weightSmoothstep` |
| **drop** | Which rulings of a master grid get drawn | `fineLadder`, `phaseFineLadder`, `perceptualRamp`, `lozengeStipple`, `deepFillTSP` |
| **bundle** | How many adjacent passes of **one constant-weight pen** a ruling gets | `bundleCount`, `bundleSubNib`, `bundleEased`, `bundleDither`, `bundleLozenge`, `bundleHandoff` |
| **cont** | A continuous spacing field — the position **integrated**, never selected | `contFieldSigmoid`, `contFieldTouch`, `contFieldFore`, `contFieldSurface`, `contFieldQuant` |
| **pen** | Three real nib widths — **simulated, not expressible** (see below) | `penInterleave`, `penStipple`, `penReserve`, `penCross`, `penPitchMatch`, `penFacing` |

**Why the width family needed a rival.** An adversarial review of the width laws established
two things. First, **stroke width carries about 94 % of their tonal range** — the spacing
decision, which is the part a plotter can actually honour with one pen, is doing almost
nothing. Second, of ten "lozenge" variants tried against `whiteBand`, **nine were 97.8–99.9 %
identical to it in inked pixels**: they were the same drawing with a different explanation.
A width law is also a *promise* — `whiteBand` asks for strokes up to 6× the nib, and
something has to keep that promise on the paper.

That is the whole reason the last three families are here. **`lozengeStipple` and the eleven
bundle and continuous-field laws have no width channel at all**, and the six three-pen laws
replace the continuous width channel with exactly three nib widths and nothing between. Every path they emit is at
`weightScale 1`. Their apparent tone is physical: either the pen retraces parallel passes
about a nib apart until a bundle reads as one heavier stroke, or the clearance between
rulings is itself the whole statement. The paper-gap table shows the split cleanly on
`sphere · hatch` — width laws sit at an adjacent gap ratio of 1.12× and **25 % monotonic**
(their spacing carries nothing, so it cannot follow the light); drop laws at 1.44–1.91× and
40–47 %; bundle laws at 1.01–1.06×; and the continuous field at 1.02–1.03× and **67–90 %**.

---

## The physical constants that bound all twenty-nine

No law escapes these. They are properties of the pen and the paper, not of the algorithm.

**1. The plot floor is 2.2 × pen.** `PLOT_FLOOR_PEN = 2.2`. At the shipped 0.3 mm pen that
is 0.66 mm. Two rulings closer than the floor do not read as two rulings; the paper
bridges. No law may rule tighter.

**2. One ruled family saturates at ink area 0.509, which is L\* ≈ 76.** Spacing-to-tone is
`pitch = 2 × nib / tone`, so a single family bottoms out at a spacing of about twice the
nib — which is the plot floor. At the floor, `inkWidth / floorPitch = 0.509`. `weightAlongLine`
hit 0.509 exactly. **No spacing law can go darker than that** — not without breaking
constant 1, which is what `contFieldTouch` does deliberately (see 3).

**3. Past 0.509 there are four moves, and the fourth was added this round.** A wider stroke
(a swell — `weightDeepDark`, `wideShadowPen`), a crossed second family
(`weightCrossHandoff`, `crossFade`), an overdraw (`weightMultiPass`), or **lowering the floor
itself**. Every law in this document that reaches a darkest L\* below about 45 does it by one
of those four, and pays for it in ink or in plot time.

The fourth deserves stating plainly, because it is the one constant 1 forbids. `bundleSubNib`
overdraws by stepping 0.55 of a nib instead of a whole one; `contFieldTouch` drops the floor
from 2.2 × pen to **one ink width**, at which adjacent rulings abut and the area is genuinely
solid. Both reach L\* 4.5 — real black out of a single family — and both are **flooding by
this repository's own definition** and are counted as such. Constant 1 is not wrong; it is a
legibility rule, and these two laws spend it deliberately. `contFieldTouch` may only spend it
on a hatch mapper: on crosshatch both families flood and the cell renders as a solid disc
with no tone left in it at all.

There is also a **nib-dependent asymmetry** worth carrying. At the document floor the broad
0.93 mm nib *overlaps* — it is solid black there without any law's help — while the fine
0.26 mm nib is floor-bound *below* solid and **can never touch**. "Lines touching for pure
black" is therefore a property of which nib is in the holder, not of the algorithm.

**4. Layers do not superpose linearly, and the error goes both ways.** A single family
**under**-delivers: 0.408 measured against 0.509 predicted. A crossed pair
**over**-delivers: `XH_DEEP_AREA` had to be *measured* at 0.72 against a predicted 0.85,
and a crossed pair runs solid black over about 5 % of the form. This is Salisbury et al.'s
"lightening factor" (SIGGRAPH 1997) seen from both sides. No arithmetic in the source fixes
it; the correction has to come back from the render, which is what Ostromoukhov's
equilibration table (`EQ_TABLE`, SIGGRAPH 1999 §2.3) is for.

---

## The twenty-nine

Ordered as selected. `NO TONE` is the reference the other twenty-eight are read against.

### 00 · NO TONE — the Stage 0 reference

**Mechanism.** Not a law. It is the same build with the tone apparatus switched off:
`masterGrid` and `dither` both false. Every ruling of the density grid is drawn, at one
pitch, at one weight. It is what the fill looks like when nothing modulates it.

**Source.** None. It is this repository's own Stage 0.

**Strengths.** Perfect evenness by construction — spacing CoV 0.0, spacing step 1×, zero
free ends. The gentlest highlight falloff of all twenty-nine on every cell it can be
compared on (4.05 L\*/mm on `sphere · hatch`) and the lowest moiré on four of five
(3.76 RMS), because there is no modulation to beat against the raster. Cheapest ink on four
of five cells (775 mm, 23 paths on `sphere · hatch`); only `weightModulated` and
`weightSmoothstep` undercut it, on `ellipsoid · contour`.

**Weaknesses.** It carries no tone at all. R² 0.036, L\* span 4.3, darkest L\* 92.6 — the
form is a wire cage, not a shaded solid. `off the line` 47.6 % is meaningless against a
span that small.

**Choose it when.** You want line work without shading: a technical read of the form, a
contour study, or a base pass that a second layer will shade. Also use it as the control
whenever you judge another law — every claim below is a claim *relative to this panel*.

---

### 01 · nibAngle

**Mechanism.** A broad or calligraphic nib is held at a fixed **screen** angle. The mark's
width is `w · |sin(θ_stroke − θ_nib)|`. On a curved form the ruling direction rotates
continuously, so the width — and therefore the tone — varies from direction alone. No
coverage decision is taken anywhere. The result is mean-normalised, so the average tone
still matches `whiteBand` and the difference between them is purely directional.

**Source.** Broad-nib calligraphic practice. Implemented on `whiteBand`'s chassis so the
comparison isolates one variable.

**Strengths.** It is the only law here whose tone comes from the *drawing gesture* rather
than from a measurement, and it reads that way. Zero free ends. Same ink as `whiteBand`
(1192 mm) for a very different look. On `sphere · crosshatch` it reaches R² 0.654 and a
70.4 L\* span, because two families at different angles sample the nib response
differently and the pair covers the range.

**Weaknesses.** Tone tracks direction, and direction is not light. On `cylinder · hatch`,
where the ruling direction barely rotates, it collapses: R² 0.012, span 9.9, off the line
75.6 %. Highest path count of the original twelve on `sphere · hatch` (515). Moiré 9.11 RMS.

**Choose it when.** The subject is a rounded form whose ruling direction sweeps widely, and
you want a hand-drawn, engraved character over metric accuracy. Do not choose it for
cylinders, extrusions, or anything where the rulings stay near-parallel.

---

### 02 · taperedEnds

**Mechanism.** `whiteBand`'s chassis with no stroke starting or stopping at full width.
Two tapers do the work. One is geometric: a smootherstep ramp into each end of a run, over
`TAPER_MM`. The other is tonal: `whiteBand`'s hard `[c_min, c_max]` clamp becomes a soft
one, so the approach to the minimum pen at the lit end has no knee. It is aimed squarely at
the highlight boundary every other law leaves visible.

**Source.** This repository, Round 4. Built on Rössl & Kobbelt PG'00 §7.

**Strengths.** The best-behaved of the width laws, and still the most linear law in the set on `sphere · crosshatch` after the additions. On `sphere · hatch`: R² 0.513,
off the line **5.7 %** (the lowest), L\* span 27.5, darkest L\* 53.7, zero free ends.
It leads or ties on `off the line` in four of five cells across the whole roster (crosshatch
19.6 %, ellipsoid 7.5 %); `whiteBand` edges it on the capsule, 6.6 % against 7.5 %. Lower
moiré than `whiteBand` on four cells. On `sphere · crosshatch` it
posts R² 0.781 with a 74.5 L\* span.

**Weaknesses.** It cannot beat the physical floor: darkest L\* 53.7 on a single family
means the deep shadow still is not black. Highlight falloff 5.77 L\*/mm is *not* better
than `whiteBand`'s 6.07 by much, and is worse than `isophoteWidth`'s 4.33 — the taper
softens the stroke ends, not the tone gradient itself. Costs 471 paths against `whiteBand`'s
450 for the same ink.

**Choose it when.** This is the default recommendation. Choose it whenever you want the
most linear, least banded single-family shading and have no specific reason to pick
another. Choose it especially where the highlight boundary is in view.

---

### 03 · weightModulated

**Mechanism.** Spacing is perfectly even everywhere: one pitch, the sparse-end pitch, over
the whole form. Tone is carried entirely by **pen weight**, one weight per run, instead of
by line density. It is the plotter-real answer — a heavier pen or a doubled pass in the
shadow — and the strongest possible answer to a request for 100 % even spacing.

**Source.** This repository, weight round. The output format carries one
`meta.weightScale` per path, which both the renderer and the SVG export read as a
stroke-width multiplier.

**Strengths.** Reaches a genuinely deep shadow — darkest L\* 41.5 on `sphere · hatch`, the
second darkest of the width laws, and 4.5 (solid) on `sphere · crosshatch`. Very even spacing
(CoV 0.282, and 0.085 on `ellipsoid · contour`, the lowest non-zero figure in the table).
Cheapest ink of any law that carries real tone (884.6 mm) and only 25 paths, so it plots
fast. Zero free ends and zero abutting-join artefacts.

**Weaknesses.** The worst weight discontinuities in the set: 3.823 along / 1.847 across on
`sphere · hatch`. A weight step of nearly 4× between neighbouring pieces is visible.
The highest moiré in the set apart from its own smoothstep variant (16.91 RMS / 10.93
long-wave; 25.67 on the crosshatch). Poor linearity — R² 0.122, off the line 28.7 %, and R² 0.001 on the cylinder. Widest bare gaps among the tone-carrying laws
(2.06 mm), because the pitch never tightens.

**Choose it when.** You need a deep shadow and even spacing at low plot cost, and you can
tolerate visible weight quantisation. Also choose it when the plotter has real pen-width
control and you want the darkness to come from the pen, not from crowding.

---

### 04 · isophoteWidth

**Mechanism.** Stroke thickness comes from how fast the shading falls off locally. The
width is set by the image-space distance from this sample to the chosen isophote:
`d = (I_iso − I) / ‖∇I‖`. A slow falloff means a broad dark band on the surface, so the
stroke is thick. A fast falloff means a narrow band, so the stroke is thin. It is a
physically grounded width law rather than a fitted tone response.

**Source.** Goodwin, Vollick & Hertzmann, *Isophote Distance: A Shading Approach to
Artistic Stroke Thickness*, NPAR 2007.

**Strengths.** The best raw R² of the single-family laws on `sphere · hatch` (0.524) and the
widest L\* span among them (29.4). The gentlest highlight falloff of any tone-carrying law
on `sphere · hatch` (4.33 L\*/mm) and on `ellipsoid · contour` (2.58) — it is the one law
that measurably softens the highlight edge. Zero free ends. Fewest paths of the
`whiteBand`-chassis laws (348), so it plots faster than its siblings for identical ink.

**Weaknesses.** Linearity is bought locally and lost globally: off the line 26.9 % on
`sphere · hatch` and 36.4 % on the cylinder, four to five times `whiteBand`'s error. Weight
steps are large across rulings (1.284). Where `‖∇I‖` is small the width law has no
denominator to work with, which is where the deviation concentrates.

**Choose it when.** The highlight region matters more than overall tonal linearity — a
polished sphere, a shoulder rolling into light, a portrait's forehead. Choose it when you
want the thickness to *describe the shading gradient* rather than to reproduce a grey.

---

### 05 · whiteBand

**Mechanism.** Every ruling reserves a **constant** width `w`. Inside that reservation it
draws a black core of `(1 − c)·w` with white bands of `c·w/2` on either side, where `c` is
the local grey clamped to `[c_min, c_max]`. Nothing is ever dropped, so no ruling can
vanish and no gap can open. `c_min` guarantees white space, which prevents flooding.
`c_max` guarantees a core, which prevents a hairline. Both ends of the range are clamped
by construction, not by a tuned curve.

**Source.** Rössl & Kobbelt, *Line-art rendering of 3D-models*, Pacific Graphics 2000, §7.

**Strengths.** Round 3's champion and the bar the whole of Round 4 was built to clear. On
`sphere · hatch`: R² 0.512, off the line 5.8 %, L\* span 29, darkest L\* 51.4, spacing CoV
0.31, zero free ends, 1192 mm ink. Best R² of all twenty-nine on `sphere · crosshatch` (0.789) — the one cell no addition took from it.
Low long-wave moiré (3.64). Its guarantees are
structural: you cannot construct an input that makes it drop a ruling or flood a region.

**Weaknesses.** Bound by the single-family floor — darkest L\* 51.4 is not a deep shadow.
The highlight boundary stays visible: falloff 6.07 L\*/mm with a worst adjacent step of
79.43, which is the weakness `taperedEnds` was built to address. On the cylinder its
linearity drops to R² 0.373 / off the line 25.5 %.

**Choose it when.** You want the safest law in the set. Choose it for production work where
an unexpected input must not produce a hole, a flood, or a vanished ruling. Choose
`taperedEnds` instead if the highlight edge is prominent; choose `whiteBand` if you want
the guarantees without the extra taper machinery.

---

### 06 · fineLadder

**Mechanism.** The shipped `ladder` selects rulings from a small set of discrete coverage
rungs — three on the default. Two adjacent rungs inside one crop read as "two or three
tight rulings, then a wide gap", which is the clustering complaint. `fineLadder` keeps the
rung mechanism exactly and only changes the **count**: rungs are derived from the ladder's
own coverage range at about 0.02 per rung. The step is then pushed below the visual
threshold instead of being removed.

**Source.** Webb, Praun, Finkelstein & Hoppe, *Fine Tone Control in Hardware Hatching*,
NPAR 2002 §3.1 — the finding that a nested ladder bands because it has too *few* tone
levels (they went from 6 to 64).

**Strengths.** The minimal, lowest-risk change to the shipped default: same mechanism, same
code path, one derived constant. Zero free ends. Only 61 paths. Tightest bare gaps on
`sphere · hatch` (1.21 mm, tied with `phaseFineLadder`). On `ellipsoid · contour` it holds
R² 0.338 with moiré of just 2.77
RMS — the contour mapper suits it.

**Weaknesses.** It is still a density law with one draw/skip verdict per ruling, so it
inherits that ceiling: R² 0.032, L\* span 7.5, darkest L\* 79.4 on `sphere · hatch`. Spacing
CoV 0.678 and a 2× adjacent spacing step — finer rungs do not make the spacing even, they
only make the *jumps between rungs* smaller. Ink cost is high for the tone delivered
(2302 mm, nearly double `whiteBand`) because every surviving ruling is drawn at full length.

**Choose it when.** You want the shipped ladder's exact look and behaviour with the
clustering reduced, and you are not asking for a deep shadow. It is the conservative
in-place upgrade, not a new capability.

---

### 07 · phaseFineLadder

**Mechanism.** The control for `fineLadder` and for the nested-ladder question. It takes
the same 64-level fine tone target, but selects rulings with the shipped **phase
accumulator** rather than with a nested bit-reversed (van der Corput) prefix. The pair
therefore differ in the selector and in nothing else. It exists so that "nested vs phase"
can be answered at 64 levels, which was never done when commit `29fb99f` replaced one with
the other.

**Source.** This repository, as the control for Rössl & Kobbelt PG'00 §7, Praun et al.
SIGGRAPH'01 §3, and Winkenbach & Salesin SIGGRAPH'94's prioritized stroke texture — the
three sources that call for a nested prefix.

**Strengths.** Measurably indistinguishable from `fineLadder` on tone: R² 0.045 vs 0.032,
span 9.2 vs 7.5, darkest L\* 78.6 vs 79.4, moiré 8.38 vs 8.28. **That is the finding.** At
64 levels the selector does not matter, so the phase accumulator's other properties (the
Sturmian two-consecutive-gaps guarantee) come free. Zero free ends.

**Weaknesses.** Slightly worse spacing evenness than `fineLadder` (CoV 0.71 vs 0.678) and
slightly more ink (2385 vs 2302 mm) for no tonal gain. Shares every ladder-family ceiling:
no deep shadow, low span, one verdict per ruling.

**Choose it when.** Keep it as a control, not as a production pick. Reach for it when you
change the ladder's selection machinery and need to prove that the change is the selector
and not the level count.

---

### 08 · perceptualRamp

**Mechanism.** The literal reading of "nail the lighting". Line density does not map
linearly to perceived grey, so the intensity → coverage map is routed through a calibrated
tone response (Murray-Davies ink area → CIE L\*) and then **inverted**. Apparent darkness
on paper is then linear in scene radiance. It additionally divides by the local screen
pitch, which takes the chart's foreshortening out of the answer, so the grey tracks the
light and only the light.

**Source.** Murray-Davies ink-area reflectance, with the perceptual half fitted by Sterzik,
Meuschke, Cunningham & Lawonn, IEEE TVCG 30(1) 2024 (`f(x) = 1/(1 + (1/a − 1)(1/x − 1)^b)`,
a = 0.4753, b = 1.5918 for hatching).

**Strengths.** It is the only law whose *target* is stated in the units the eye uses. The
plot floor binds on only 11 of 103 rulings on `sphere · hatch` — nine tenths of the drawing
is running inside its legal range — the most headroom in the set, shared with
`lozengeStipple` and `deepFillTSP`. Zero free ends. On
`ellipsoid · contour` it holds R² 0.325 with 2.75 RMS moiré.

**Weaknesses.** A correct target does not survive a one-verdict-per-ruling emitter. On
`sphere · hatch` it delivers R² 0.049 and a 9.4 L\* span with darkest L\* 79.2 — the target
is right and the mechanism cannot express it. Highest master-grid spacing CoV in the set (0.74).
2341 mm of ink for less tone than `whiteBand` gets from 1192 mm.

**Choose it when.** Use it as the tone *target* underneath another law's placement — that
is how `contourFlow`, `crossFade` and `errorDiffused` all use it. As a standalone law,
choose it only on `ellipsoid · contour`, where the mapper already gives it the spatial
freedom the hatch mapper denies.

---

### 09 · weightSmoothstep

**Mechanism.** The anti-banding study on `weightModulated`. It reproduces
`weightModulated`'s per-run mean weight exactly, but routes it through a 7th-order
smoothstep and adds a golden-ratio dither (`W_DITHER = 0.06`) to the weight. Residual
quantisation is then broken up rather than aligned. It deliberately does *not* split runs
along the line, because the study is about the per-run mean itself.

**Source.** This repository, weight round. Smoothstep/dither anti-banding is standard
practice; the specific comparison against `weightModulated` is the contribution.

**Strengths.** Lower off-the-line error than `weightModulated` on three of five cells and
tied on a fourth (28.4 % against 28.7 % on `sphere · hatch`; 17.5 % against 22.0 % on the
capsule). Deeper darks on the sphere (40.1 against 41.5) and markedly on the ellipsoid
(7.9 against 15.2). Identical ink and path
count (884.6 mm, 25 paths), so the improvement is free at the plotter. Same even spacing
(CoV 0.282). Zero free ends.

**Weaknesses.** The dither makes the *worst* weight step worse, not better: 4.049 along /
2.051 across, the largest in the table. Moiré is marginally higher than `weightModulated`
(17.03 vs 16.91 RMS). It inherits every other `weightModulated` limitation, including the
2.06 mm bare gaps and R² ≈ 0 on the cylinder.

**Choose it when.** Choose it over `weightModulated` by default — it costs nothing and
reads better in the mid-tones. Do not choose it if a single visible weight jump is
unacceptable; the dither trades the worst case for the average case.

---

### 10 · lozengeStipple

**Mechanism.** Copperplate engraving's own anti-banding, anti-moiré mark. Where the ladder
drops a ruling it leaves a tonal residual the next ruling cannot express. `lozengeStipple`
spends that residual as short flicks along the dropped ruling's own track. The flicks
thicken toward the shadow and taper to bare paper in the light — "a gentle merging of the
inscribed marks with the white of the paper".

**Source.** Hendrick Goltzius' dotted lozenge; RISD Museum, *The Brilliant Line: Following
the Early Modern Engraver, 1480–1650*.

**Strengths.** The most characterful mark in the set and the only one with a historical
engraving idiom behind it. Low moiré on `ellipsoid · contour` (3.38 RMS /
1.81 long-wave). It genuinely reaches the darks on the cylinder — darkest L\* 28.6, the
deepest reading of any *grid* law on that cell, though the bundle and continuous-field
families now go to 4.5 there.

**Weaknesses.** Real free ends — 23.75 mm on `sphere · hatch`, 21.75 on the capsule, 23.94
on the crosshatch. Those are strokes stopping in open front-facing surface, which is a craft
defect, not a rounding artefact. It was the only law of the twelve with them; it is now one
of nine, alongside all six bundle laws, `penStipple` and `penReserve` — but its are the
longest of any *grid* law and the mechanism deliberately produces them rather than
tolerating them. Worst adjacent spacing step in the table (8×). Off the line 42.8 % on `sphere · hatch` and 68 % on
the crosshatch, the worst reading on that cell. Highest ink of any law here on all five
cells (4812 mm on the crosshatch), and 242–542
paths, so it is slow to plot.

**Choose it when.** You want the engraved look and you are drawing for effect rather than
for tonal fidelity. Choose it for a single hero object where the free ends read as
deliberate flicks. Do not choose it for a scene, for a technical drawing, or anywhere plot
time is bounded.

---

### 11 · deepFillTSP

**Mechanism.** In the darkest ~15 %, a ruled family has already saturated at ink area
0.509 and there is nothing left for it to do. `deepFillTSP` replaces the ruling there with
a **boustrophedon space-filling traverse of its own gap**. That is one continuous path, so
it adds no pen lifts. It has an aperiodic phase, so it adds no beat. And it achieves an
effective pitch of half the ruled pitch without adding a ruling.

**Source.** Velho & Gomes, *Digital halftoning with space filling curves*, SIGGRAPH 1991;
Kaplan & Bosch, *TSP Art*, 2005.

**Strengths.** The cleanest signal of the original twelve, and still the lowest moiré
anywhere in the table on `ellipsoid · contour` (1.69 RMS / 0.74 long-wave), because the
traverse is aperiodic by construction. On `sphere · hatch` (7.28 / 3.82) it has since been
beaten by `bundleCount` (6.45 / 2.90), which is aperiodic in a different way — it never drops
a ruling at all. Gentle highlight falloff (4.92 L\*/mm). Only 40 paths, and no extra pen
lifts, so it plots efficiently for the ink it lays. Zero free ends.

**Weaknesses.** It only acts in the deepest 15 %, so on a fixture where little of the form
is that dark it barely acts at all: R² 0.014, L\* span 7.3, darkest L\* 86.6, and off the
line 88.4 % — the worst linearity in the table. The plot floor binds on only 11 of 103
rulings, confirming it never gets the chance to engage. 1621 mm of ink for almost no tonal
range.

**Choose it when.** Choose it as a **shadow-region partner** to another law, not as the
whole tone law. It is the correct answer to "the deep shadow has gone flat and I do not
want a second family" — but only when a real part of the drawing is in that deep shadow.
On this fixture, at this sun angle, it does not have enough dark to work with.

---

## The adjacent-pass family — one pen, one nib, no width law

Six laws (12–17) share a chassis and one defining property: **every path they emit is at
`weightScale 1`**. They never touch the weight channel. Apparent weight is *physical* — the
pen retraces parallel passes about a nib apart, and two, three or seven of them read as one
heavier stroke. Tone is then (a) how many adjacent passes a ruling gets and (b) the white
gap that leaves between one bundle and the next. This is what a ballpoint photorealist does
by hand, and it costs plot **time**, not pen changes.

**Nothing can land off the form.** A pass is not a screen-space offset of a finished
polyline. Each pass is an ordinary ruling in its own right — `emitLine` is called once per
pass with the family's parameter step scaled to that pass's offset — so it is sampled on the
chart and every existing guard (back-face culling, hidden-line removal, boundary refinement,
`MIN_MARK_MM`) applies to it unchanged. A pass that would leave the surface simply has no
samples out there.

**The plot cost, stated honestly.** These six lay 2.7–16 k mm of ink against `whiteBand`'s
1192 mm on `sphere · hatch`, and read naively that is a rout. It is not a fair comparison.
`whiteBand`'s 1192 mm is *centreline* length at strokes up to 6× the nib — a promise the pen
still has to keep. Its **weighted** ink, which is the length the plotter actually draws once
that band is delivered, is **3791 mm**. Against that, `bundleEased` costs 4404 mm: **16 %
more, not 3.7× more.** On `ellipsoid · contour` the gap is 8 % (2706 against 2506). The
adjacent-pass family is not an expensive way to buy tone; it is the honest price of a band,
paid with a pen that has one width.

---

### 12 · bundleCount

**Mechanism.** The family's baseline. Radiance sets **how many adjacent passes** a ruling
gets, 1 to 8, each a full ink width from the last so the passes abut and no ink is laid
twice. Pass 0 is the ruling itself and always draws, so the family cannot lose a line
however light the tone gets; the rest alternate either side of it, so the band grows
symmetrically about the ruling and the tonal centroid does not migrate. The maximum pass
count is derived, not chosen: the bundle pitch is `stride × masterPitch`, and stride and
ceiling are solved together so the deepest shadow lands *on* the dark bar rather than under
it.

**Source.** Ballpoint and graphite photorealist practice; the same reserved-band arithmetic
as Rössl & Kobbelt PG'00 §7, with the band delivered by repetition instead of by width.

**Strengths.** R² 0.756 / 0.715 / 0.592 / 0.497 / 0.768 across the five cells — better
linearity than any width law on four of them, with no width channel at all. **The lowest
long-wave moiré of any tone-carrying law** on `sphere · hatch` (2.90) and `capsule · hatch`
(3.09). Best `off the line` in the entire table on `cylinder · hatch` (5.2 %). Reaches
darkest L\* 4.5 on the crosshatch and 40.5–46.9 elsewhere. Only 117–267 paths.

**Weaknesses.** Real free ends — 13.3–20.1 mm, because a bundle's outer passes stop where
the tone drops them. `off the line` 49.7 % on `sphere · crosshatch`. 4.7–9.2 k mm of ink.
The pass count is an integer, so the N → N+1 boundary is a smooth iso-radiance contour: the
classic band, still present, just moved from the spacing channel into the pass channel.

**Choose it when.** You have one pen, one nib, and time on the plotter. This is the family's
default and the right first choice for a single-pen tonal drawing on a hatch mapper.

---

### 13 · bundleSubNib

**Mechanism.** The same bundle at a **0.55-nib step** and up to 13 passes. The passes
*overlap* instead of abutting, which closes the small ink gap a nib leaves at its edges and
buys the last stop of black. This deliberately breaks the "no ink laid twice" rule and is
reported as flooding for exactly as many samples as it floods.

**Source.** As `bundleCount`; the sub-nib step is the manual technique of "filling in"
a bundle rather than laying it once.

**Strengths.** The **largest L\* span in the whole table** (82.3 on `sphere · hatch`). The
only law besides `contFieldTouch` to reach the dark end on every cell — darkest L\* 4.5 on
all five, including `ellipsoid · contour`, where nothing else gets below 33.6. Adjacent gap
ratio 1.01×, the tightest in the set.

**Weaknesses — and one of them is a measurement caveat you must carry.** The reported
darkest L\* 4.5 is **optimistic**: Murray-Davies counts overlapped ink twice, and the rig
computes ink area from length × width. Correcting for the 0.55-nib overlap, the geometry
gives **L\* ≈ 21.6** — still the deepest black in the set, but not the 4.5 the table prints.
It floods **78 % of gated samples** on `sphere · hatch`. `off the line` 39–75 %. 8–16 k mm
of ink and 201–462 paths, the most expensive law here by a wide margin.

**Choose it when.** You need true black out of one pen and you are prepared to pay for it
in plot time and in wet ink. Use it as a shadow partner rather than as the whole law, and
read its darkest figure as ≈ 21.6, not 4.5.

---

### 14 · bundleEased

**Mechanism.** The transfer function stated on the **white gap** instead of on the ink.
Jay's own sentence, implemented: lines sit right against each other for pure black, then the
gaps open — evenly, eased — toward the highlight, and close again into shadow on the far
side. The gap runs from 0.35 nib at the darkest to the full pitch at the lightest, by
smootherstep, so there is no knee at either end. Because the *gap* is what is eased, the
thing the eye actually measures between two bundles is the thing that moves smoothly.

**Source.** The user's brief, taken literally. The ease is the same smootherstep the rest of
this file uses; what is new is the quantity it is applied to.

**Strengths.** **The most linear law in the set on four of five cells** — R² 0.792
(`sphere · hatch`), 0.771 (capsule), 0.662 (cylinder), 0.832 (`ellipsoid · contour`, the
highest R² anywhere in the table). Set against `whiteBand`'s 0.512 and L\* span 29, this is
**0.792 and span 42.1 — beating a law that uses strokes up to 6× the nib, without varying
width at all.** Widest gap range of the family (0.32–1.36 mm), which is what buys the span.

**Weaknesses.** Free ends 13.2–20.1 mm, like the rest of the family. `off the line` 17 % on
`sphere · hatch` — worse than `bundleCount`'s 13.6 %, because widening the gap range spends
some of the fit. 31 % on the crosshatch. Still an integer pass count underneath: **two
independent attempts to remove the integer level contour from inside the law failed. Only
changing *what* is quantised — ink → white gap — moved the numbers at all.** That is the
finding, and it is worth more than the law itself.

**Choose it when.** This is the one to reach for. Best linearity, best span, single pen
weight, and a mid-range plot cost inside the family. Prefer it over `whiteBand` whenever the
plotter has to keep the width promise physically.

---

### 15 · bundleDither

**Mechanism.** `bundleCount` with the N → N+1 pass boundary ridden on a **smooth
low-frequency wave** in (ruling index, arc length). The ruling index enters at the golden
angle, so neighbouring rulings never share a phase and the boundary is a ragged curve
instead of a traceable contour. Smooth, not hashed — a hashed threshold chatters the pass
into specks.

**Source.** Threshold modulation from ordered dithering, applied to a pass-count boundary
rather than to a pixel.

**Strengths.** Second-best `off the line` in the table on `cylinder · hatch` (5.4 %) and best
on `ellipsoid · contour` within the family (12.4 %). It does successfully break the level
contour into a ragged edge — the mechanism works as described.

**Weaknesses. This is a negative result, and it is kept as one.** Waving the boundary made
long-wave moiré **worse**, not better: **3.43 against `bundleCount`'s 2.90** on
`sphere · hatch`, and 3.22 against 3.09 on the capsule. Trading a sharp contour for a
low-frequency wave trades a *local* artefact for a *global* one, and the low-frequency
metric is precisely the one that punishes it. R² also drops (0.718 against 0.756). It costs
15 more paths for the privilege.

**Choose it when.** Don't, on this evidence. It is documented so the idea is not tried a
third time. If a level contour is visibly objectionable in a specific drawing, dither the
boundary *at higher frequency* than this, or change what is quantised (`bundleEased`).

---

### 16 · bundleLozenge

**Mechanism.** The **end geometry** made explicit. Pass k is inset k steps from *both* ends
of its ruling, so a bundle closes down to its single centre line at each end instead of
stopping square. Nothing can overshoot the ruling's own extent by construction, the free
ends are staggered by a nib apiece rather than stacked on one contour, and the mark reads as
the engraver's lozenge.

**Source.** The copperplate lozenge again (Goltzius; RISD, *The Brilliant Line*), here as a
*bundle terminus* rather than as a stipple.

**Strengths.** The best-looking bundle terminus of the six — the ends taper rather than
chop, and the staggering means no single contour collects every stop. Darkest L\* 44.5–47.6,
the deepest 5th-percentile readings of the non-flooding bundle laws on the cylinder and the
ellipsoid. Cheapest ink of the six on three cells (3986–5811 mm).

**Weaknesses.** The inset removes ink exactly where the bundle was widest, so linearity
suffers: R² 0.708 / 0.588 / 0.499 — the weakest of the family on capsule and cylinder, and
0.499 on the cylinder is a real drop from `bundleCount`'s 0.592. L\* span 24 on the cylinder,
the family's narrowest. Free ends are still 13.3–20.1 mm; staggering them changes how they
read, not whether they exist.

**Choose it when.** You care how the strokes *end* — a hero object, a print where the
terminus is visible at reading distance — and you can spend a little linearity on it.

---

### 17 · bundleHandoff

**Mechanism.** An **AM/FM allocation policy**, stated as a cap rather than as a switch.
Above the terminator (radiance ≥ 0.55) the drawing is **one pass at a constant pitch** — the
periodic family owning the mid-tones, which is what print practice reserves it for. Below
it, the bundle ramps in by partial length, so the second pass enters as a *lengthening mark*
rather than as a new texture appearing all at once.

**Source.** The amplitude/frequency-modulation split from halftone practice: FM screening for
the light end, AM for the dark.

**Strengths.** Second-most-linear law in the set on four of five cells (R² 0.78 / 0.761 /
0.657 / 0.822), a hair behind `bundleEased`. L\* span 42.0 on `sphere · hatch`, essentially
tied with it. Cheapest ink of the six on `ellipsoid · contour` (2677 mm) and among the
lowest path counts (93–258). The handoff is genuinely invisible as a texture change.

**Weaknesses.** Highest highlight falloff of the family on the hatch cells (9.94 against
`bundleCount`'s 6.84) — capping the lit half at one pass puts a boundary exactly where the
cap starts. Worst long-wave moiré of the six on the crosshatch (13.17). `off the line` 18.1 %
on `sphere · hatch`, the family's worst on that cell.

**Choose it when.** You want the mid-tones to read as a clean periodic screen and the
shadows to carry the weight — a portrait, or anything where a large lit area must stay
quiet. Not when the highlight boundary falls somewhere the eye lands.

---

## The continuous-spacing family — the grid thrown away

Five laws (18–22) share a different chassis, and it answers a complaint the first seventeen
could not. Every law above them places rulings on a **master grid** and decides which ones
to draw, so the realised pitch is always an integer multiple of the master pitch: 1×, 2×,
3×. There is no such thing as a 1.4× gap, so "evenly gradually introduce gaps" is not
something that chassis can express. That is the whole of `phaseFineLadder`'s 1.91× adjacent
gap ratio, and no number of extra tone *levels* fixes it — the levels quantise the tone, the
grid quantises the **spacing**, and it is the second one the eye reads as a step.

These five throw the grid away. A ruling's position is not chosen from a comb; it is
**integrated**. Walk the family's cross-direction across the form, ask the tone what gap it
wants *there* in millimetres, and step by exactly that. The gap is a continuous function of
position with no quantisation anywhere, so it can ease. Every ruling then draws whole —
there is no drop decision left to take, which is also why **these laws cannot leave a free
end**, and none of them does, on any of the twenty-five cells measured.

Like `lozengeStipple` and the bundle family, they have **no width channel**: every path is
at `weightScale 1`.

**What they buy, in one line.** Median adjacent gap ratio falls from 1.44–1.91× (the drop
laws) to **1.02–1.03×** — the step does not shrink, it disappears. And monotonicity, the
share of gap transitions that move with the light, goes from ~40 % to **67–90 %** on
`sphere · hatch`, and 96.6 % on `ellipsoid · contour`.

**What they do not buy.** Ramp linearity. R² for this family runs 0.015–0.438, well below
both the width laws and the bundle laws. These are laws you choose for how the tone *eases*,
not for how accurately it *lands*.

---

### 18 · contFieldSigmoid

**Mechanism.** Sterzik, Vollmer & Vollmer fitted a perceptual response to **hatching
specifically**, from crowd-sourced pairwise comparisons: `f(x) = 1 / (1 + (1/a − 1)(1/x −
1)^b)` with a = 0.4753, b = 1.5918. This law drives the integrated gap from their curve
rather than from smootherstep or from the Murray-Davies inversion. It is the round's test of
whether a *measured* perceptual response beats a chosen easing function.

**Source.** Sterzik, Vollmer & Vollmer, Computer Graphics Forum 2024.

**Strengths.** **The best-ordered cell in the whole table**: 96.6 % monotonic on
`ellipsoid · contour`, where the rings nearly follow the isophotes, with R² 0.438 — the
family's best ramp. Gap ratio 1.02–1.04× everywhere. Zero free ends, zero flooding on all
five cells. The gentlest highlight falloff of the family on `ellipsoid · contour` (2.82).

**Weaknesses.** `off the line` 45.5–94.2 %; the 94.2 % on `sphere · crosshatch` is close to
the worst reading anywhere. R² 0.067–0.144 on the four non-contour cells. Darkest L\*
69.9–72.9 on the hatch cells — it inherits the single-family saturation ceiling exactly and
cannot reach a shadow.

**Choose it when.** The mapper follows the form's own contours (`contour`, or a hatch whose
angle tracks the isophotes) and you want the spacing to ease. Its sigmoid beats smootherstep
on *ordering* at the same ramp and the same cost.

---

### 19 · contFieldTouch

**Mechanism.** The sub-floor case, stated. Where the field asks for zero clearance the lines
**touch** — that is the intended black, not a fault — so the floor is lowered from the plot
floor (2.2 × pen = 0.66 mm) to **one ink width**, at which adjacent rulings abut and the area
is solid. Flooding is not hidden; it is counted and reported.

**Source.** This repository. It is the deliberate exception to physical constant 1.

**Strengths.** **Genuine black from spacing alone — darkest L\* 4.5 on every cell**, against
the L\* ≈ 76 a single family at the plot floor saturates at. L\* span 37.8 on
`sphere · hatch` with `off the line` 21.7 %, the family's best linearity on that cell.
**81 % monotonic**, gap ratio 1.02×, gaps 0.34–0.88 mm. Zero free ends.

**Weaknesses.** It floods, by design and by a lot: **55 % of placed rulings** on
`sphere · hatch`, 20–60 % on the other hatch cells. On `sphere · crosshatch` it floods
**completely** — R² 0, L\* span 0, moiré 0, highlight falloff 0, because there is no
structure left at all: the cell renders as a solid black disc. **This is a hatch-only
licence and must be recorded as one.** Monotonicity collapses to 31.3 % on
`cylinder · hatch`. 3.7–13 k mm of ink.

**Choose it when.** Hatch mapper, and you need a real black without a second family, a swell
or an overdraw. **Never on crosshatch.** Check the flood counter before you plot; wet ink at
0.34 mm clearance is a paper decision as much as a plotter one.

---

### 20 · contFieldFore

**Mechanism.** Zander's foreshortening correction. The wanted gap is divided by
`|proj_viewplane(cross(t, n))|`, so a surface turning away from the camera does not read as
darker than the light says. It is the partner experiment to `contFieldSurface`: that law
demonstrates the false limb-darkening, this one removes most of it.

**Source.** Zander, Isenberg, Schlechtweg & Strothotte, Computer Graphics Forum 2004.

**Strengths.** **86.9 % monotonic** on `sphere · hatch` and 87.8 % on the ellipsoid — among
the best-ordered spacings in the table. It recovers most of the false darkening it was built
to remove: minimum placed gap **0.27 mm against `contFieldSurface`'s 0.10 mm**, and darkest
L\* 68.1 against 47.0 where the light asks for about 72. Zero free ends, zero flooding.

**Weaknesses.** **It does not recover all of it**, and the reason is structural: the factor
`|proj(cross(t, n))|` is not the screen clearance — it omits the **shear** between the
projected cross-direction and the projected ruling. The plain screen metric beats it. R²
0.022–0.316, the family's weakest ramp; `off the line` 99.1 % on `sphere · crosshatch`.
Highlight falloff 39.91 on `capsule · hatch`, the worst in the table.

**Choose it when.** You are integrating in surface arc length and need the projection
corrected. If you are free to measure the gap on screen in the first place, do that instead
— it is both simpler and better.

---

### 21 · contFieldSurface

**Mechanism.** Contour-following. The field is integrated in the **surface's own arc
length**, not on screen, so the spacing is a property of the form and eases along it. The
projection is deliberately left in, so that what the projection costs can be isolated and
measured.

**Source.** This repository, as the control for the foreshortening question.

**Strengths.** **The most monotonic spacing in the set on `sphere · hatch` (89.5 %)** and
80.9 % on the capsule. Gap ratio 1.03×. Zero free ends, zero counted flooding. As a
diagnostic it does its job perfectly.

**Weaknesses. It exists to quantify a defect, and it does.** An even spacing *on the
surface* lands **0.10 mm on the paper at the limb** — a sixth of the plot floor — and drives
the darkest tone to L\* 47 where the light asks for 72. That is false limb-darkening,
isolated and measured. `off the line` 52.1 % on `sphere · hatch`, 94.6 % on the capsule,
99 % on the crosshatch. R² 0.049–0.18. Highlight falloff 36.6.

**Choose it when.** As a diagnostic, or on a nearly-flat form facing the camera, where the
limb it mismanages is not in the drawing. For a real render prefer `contFieldFore`, or the
plain screen metric.

---

### 22 · contFieldQuant

**Mechanism.** The control for "is continuity actually worth anything, or would 128 levels
do?" — the same integrated field with the gap quantised to 128 discrete sizes. Run against
16, 256 and the continuous original.

**Source.** This repository, answering Webb, Praun, Finkelstein & Hoppe (NPAR'02), whose 64
levels settle the *tone* question.

**Strengths.** **It settles a question, and the answer is not the obvious one.** Across the
levels sweep the ramp barely moves — R² travels 0.007 from 16 levels to infinite — so *the
tone is done at 16 levels*. The **ease** is not: monotonicity runs **53 % → 71 % → 84 % at
16 / 128 / 256**. **Continuity buys the ease, not the tone.** At 128 it is also the family's
best `off the line` on `sphere · hatch` (20.9 %) and on `ellipsoid · contour` (12.4 %, with
93.1 % monotonic and the family's lowest moiré, 2.42 RMS).

**Weaknesses.** By construction it is a control, not a candidate: at 128 levels it is
strictly worse-ordered than the continuous field it copies, and it carries every one of that
field's ramp weaknesses (R² 0.015–0.377, `off the line` 87.6 % on the crosshatch, darkest
L\* 68.4–79 on the light cells).

**Choose it when.** Choose it to make the argument, not to make the drawing. If an
implementation must quantise the gap — a fixed-point pipeline, a cached table — this is the
evidence for how many levels it needs, and the answer is **256, set by the ease, not 16, set
by the tone**.

---

## The three-pen family — three nibs, and a caveat that comes first

Six laws (23–28) carry tone on **three real nib widths** instead of on a continuous weight
channel. Labels 0.25 / 0.5 / 0.9 mm; **measured 0.26 / 0.52 / 0.93 mm**, each with its own
plot floor at 2.2× its own width — **0.57 / 1.14 / 2.05 mm**.

> **They are simulated, not expressible.** `penId` is carried **per style group** in
> `scene3d.js`, not per run, so three nibs cannot be named within one fill. These six emit
> exactly three exact stroke widths on **one pen layer**. They would plot as *widths*; they
> would **not** drive a real tool change. Read every number below with that in mind.

What they do have that no width law has is *discipline*: every one of them emits **exactly
three** width multipliers and nothing between. The off-pen-width count is **0** for all six
— against **439 of `whiteBand`'s 450 paths** sitting at a width no nib in the tray can draw.
That is the honest difference between a law that describes a pen plot and one that describes
a raster.

**Two of them are crosshatch, not hatch.** `penReserve` and `penCross` compose a second
family by construction. Sterzik et al. put crosshatched and single-direction textures in
**separate perceptual clusters**, so their tone numbers are not directly comparable with the
rest of the roster, and they are not close to comparable with each other.

**What the family buys, and what it cannot.** All six beat `whiteBand` on **darkness** —
5th-percentile L\* 41–48 against its 51.4 — at comparable or lower true ink cost (`penCross`
3423 mm weighted, `penReserve` 3534, against `whiteBand`'s 3791). **None beats it on tone
linearity**, and the reason is structural rather than fixable: a real three-pen plot **may
not vary width**, so spacing becomes the only tone channel left, and spacing is exactly the
thing the chart distorts. Master-grid spacing CoV runs **0.51–0.88 against `whiteBand`'s
0.31**.

**The tier seam was solved, and how matters more than that it was.** The handoff between
nibs is a visible L\* step unless it is spread. The three laws that make it a **per-ruling
pen substitution on a Bresenham schedule across a band of form** keep the seam small —
`penPitchMatch` 9.3 L\*, `penStipple` 9.9, `penInterleave` 11.4, all *below* `whiteBand`'s
own 28.8. The three that put the seam on a **family boundary** fail: `penScreen` 37.6,
`penFacing` 43.1, `penCross` 53.8. **A seam spread over a band of form disappears; a seam on
a boundary does not.**

**One physical asymmetry worth carrying.** The **fine nib can never touch** — it is
floor-bound below solid, because 2.2 × 0.26 mm of clearance is more than its own width. The
**broad nib overlaps** at the document floor, i.e. it is genuinely solid black there. So
"lines touching for pure black" is a property of *which nib you are holding*, not of the
algorithm.

**Pen changes.** Two per law when the output is grouped by nib; **60–450 if plotted in
emission order**. Grouping is free and worth two orders of magnitude — but **grouping the
SVG output by weight is not implemented**, so today these would plot in emission order.

---

### 23 · penInterleave

**Mechanism.** **One even grid** at the medium nib's own floor — the spacing never changes.
Tone is carried by the **pen mix alone**: a broad and a fine alternating on neighbouring
rulings give an intermediate apparent weight with no width variation anywhere along a
stroke. It is the three-pen analogue of `weightModulated`, with the weight channel replaced
by a three-valued choice.

**Source.** Pen-mix screening; the same idea as interleaved multitone screens in relief
printing.

**Strengths.** **The cheapest plot of the family** and the smoothest highlight — falloff
**8.56** on `sphere · hatch`, the best of the six, because an even grid has no boundary for
the ink to stop at. Zero free ends on every cell. Best `off the line` of the family on
`ellipsoid · contour` (10.7 %, third in the whole table on that cell), with R² 0.491 and
L\* span 32.8. Darkest L\* 41.7 against `whiteBand`'s 51.4, at 273 paths.

**Weaknesses.** R² 0.154 / 0.149 / 0.004 on the hatch cells — the even grid that buys the
smooth highlight also refuses to carry the ramp. `off the line` 36.5 %. Long-wave moiré 10.34,
high, because two alternating nib widths on a fixed grid is itself a periodic structure
beating against the ruling.

**Choose it when.** You want an even, technical, unfussy ruling with real nib weight in it,
and you are not asking the drawing to be tonally accurate. Best of the six for a highlight
that must not show where the ink stopped.

---

### 24 · penStipple

**Mechanism.** Broad ruled darks, medium hatch through the mids, and the **fine nib
stippling the highlight fade by shortening its marks** — the fade is handled by *duty cycle*
rather than by clearance. The fine nib cannot touch, so it is given the one job that does not
require it to.

**Source.** The stipple cluster in Sterzik et al.'s own taxonomy, used where their curve says
a single-direction ruling is weakest.

**Strengths.** **Best `off the line` in the whole table on `sphere · crosshatch` (18.0 %)**,
taking that cell from `taperedEnds`. Second-best tier seam of the family (**9.9 L\***).
Fewest paths of the tonally-useful pen laws on the hatch cells (134). L\* span 31.7 with
darkest L\* 42.3. Lowest highlight falloff of the six after `penPitchMatch` on the crosshatch
(17.0).

**Weaknesses.** **Real free ends — 2.46–3.08 mm.** They are short, and they are deliberate
(a stipple flick *is* a free end), but they are the price of the mechanism and they are
counted. R² 0.001 on `cylinder · hatch`. Long-wave moiré 9.94 on `sphere · hatch`.

**Choose it when.** The drawing has a large soft highlight you need to fade to nothing, and
short stipple flicks are acceptable as a mark. It is the family's best answer on crosshatch.

---

### 25 · penReserve

**Mechanism.** Bewick's transverse white. The darkest region is laid by the **broad nib at
its own floor** — solid, because the broad nib overlaps there — and then **white reserves are
cut across it**, transverse to the ruling, with the **fine nib ruling detail inside them**.
Tone in the darks comes from how much white is reserved, not from how much ink is added.

**Source.** Thomas Bewick's white-line wood engraving.

**Strengths.** **The most *engraved*-looking result of the twenty-nine**, and the darkest of
the usable set — 5th-percentile L\* **48.4** on `sphere · hatch`, 8.0 on
`ellipsoid · contour` (third-darkest anywhere). It uses all three nibs, genuinely. Lowest
long-wave moiré of the crosshatch pen laws on `sphere · hatch` (7.81).

**Weaknesses.** **Tonally weak** — R² 0.100 / 0.115 / 0.003 / 0.210 / 0.160, L\* span 14.3 on
`sphere · hatch`, the narrowest of the tonally-active pen laws. **23.5 mm free ends** on
`sphere · hatch` and 16.8–24.5 mm elsewhere: the reserves cut rulings, and the cut ends stop
in open surface. Highest ink of the family on the hatch cells (2249 mm, 254 paths). And it is
**crosshatch, not hatch** — its numbers do not line up against the single-direction laws.

**Choose it when.** You want the look and you have decided the look is the point. A hero
object, a frontispiece, an homage. Not for tonal fidelity, and not where cut ends read as
errors.

---

### 26 · penCross

**Mechanism.** The register change is put **where the perceptual clusters already separate**:
fine hatch in the lights, medium hatch through the mids, and **medium × broad crosshatch in
the darks**. If a texture-family boundary is going to be visible anyway, the argument runs,
put the pen change on it and get both for one price.

**Source.** Sterzik et al.'s cluster separation, used as a design principle rather than as a
warning.

**Strengths.** **The fewest paths in the entire table** (65 on `sphere · hatch`, 26 on
`ellipsoid · contour`) and the lowest weighted ink of the family (3423 mm against
`whiteBand`'s 3791). R² 0.258 with L\* span 40.1 on `cylinder · hatch` — its one good cell.

**Weaknesses. Its defect is that it never uses the pen it was built around: the fine nib
draws 0 paths.** The emitted width range is 1.73–3.1× — the 0.87× fine multiplier is absent
entirely, so a three-pen law is in practice a two-pen law. And the argument fails on its own
terms: putting the seam on a family boundary gives it the **worst tier seam of the six, 53.8
L\***. R² 0.003 / 0.007 / 0.011 on three cells, `off the line` 67 %, L\* span 6.6. Darkest
L\* 62.2 — the lightest of the six.

**Choose it when.** Don't. It is documented because the reasoning was sound and the result
refutes it: **the perceptual cluster boundary is exactly the wrong place to put a register
change**, because the two discontinuities add rather than hide each other.

---

### 27 · penPitchMatch

**Mechanism.** **One eased pitch field**, and the nib is simply **the smallest that can
deliver the local ink area without breaching its own floor**. No tiers, no families, no
schedule — a hard switch, per ruling. It is the control the eased-handoff laws are read
against, and it wins anyway.

**Source.** This repository. The floor arithmetic is the same `PLOT_FLOOR_PEN` rule applied
three times, once per nib.

**Strengths.** **The winner on every tone axis of the family.** Best R² of the six on four
cells (0.229 / 0.253 / 0.006 / 0.490 / 0.511 — the 0.511 on `ellipsoid · contour` is the
best pen-family reading anywhere). Best `off the line` of the six on `sphere · hatch`
(22.0 %) and second in the whole table on `sphere · crosshatch` (18.3 %). **The smallest tier
seam of all ten three-pen laws, 9.3 L\***, against `whiteBand`'s own 28.8. Gentlest highlight
falloff of the six (7.08). Largest L\* span of the six on the hatch cells (32.1). Zero free
ends. 119 paths.

**Weaknesses.** Highest master-grid spacing CoV of the family (0.724) — with width fixed to
three values, all the tonal work lands on spacing, and it shows. Long-wave moiré 21.35 on
`cylinder · hatch`, the family's worst. R² 0.006 on that same cell. Still nowhere near the
width laws on linearity: 0.229 against `isophoteWidth`'s 0.524.

**Choose it when.** This is the one to reach for in this family. If three nibs ever become
expressible per run, start here — and note that the *simplest* policy beat every scheduled
handoff, which is the family's real finding.

---

### 28 · penFacing

**Mechanism.** Nib per **surface region**, not per tone. The facing ratio `nz` — 1 at the
centre of the form, 0 on the silhouette — picks the nib, so the limb is broad and the crown
is fine **whatever the light is doing**. Tone stays entirely on spacing.

**Source.** This repository, as the control for "does a pen assignment that ignores tone
still read as form?"

**Strengths.** It does read as form: the broad limb and fine crown give a strong, immediate
sense of roundness that no tonal law produces, and it does it without consulting the light at
all. Darkest L\* 43.1, better than `whiteBand`'s 51.4. R² 0.350 with L\* span 59.4 on
`cylinder · hatch`, where facing and radiance happen to align.

**Weaknesses.** **It carries almost no tone: L\* span 4.4 on `sphere · hatch` and R² 0.000**
— the lowest R² of any tone-carrying law in the table, and a span narrower than the `NO TONE`
reference's own 4.3 is close to. Second-worst tier seam of the six (43.1 L\*), because the
nib boundary is a *facing* contour and sits wherever the geometry puts it. Highest
master-grid spacing CoV in the entire table (0.876). Highlight falloff 35.23. 438 paths.

**Choose it when.** As a **decorative** treatment, not a tonal one — a diagram, a logotype,
an object drawn for its shape rather than its lighting. Or compose it under a tonal law that
owns the spacing. Never as the tone law itself.

---
## What the additions changed

**No number moved.** The twelve were re-measured from scratch in the same sweep as the
seventeen additions, against the same frozen build. All 60 of their prior rows reproduced
**digit-for-digit on every metric**, including the `whiteBand` identity check
(`sphere · hatch`: R² 0.512, L\* span 29, darkest L\* 51.4, off the line 5.8 %, spacing CoV
0.31). The roster was also re-measured across the two mid-effort merges that landed on this
branch: all 115 rows of the twenty-three were identical before and after the three-pen merge.

**Six rankings moved**, entirely because there are now other laws standing in them.

| Ranking | Held by the twelve | Now |
|---|---|---|
| Best R² on `sphere · hatch`, `capsule`, `cylinder`, `ellipsoid · contour` | `isophoteWidth` (0.524 / 0.497 / 0.412 / 0.425) | **`bundleEased`** (0.792 / 0.771 / 0.662 / 0.832), `bundleHandoff` second on all four |
| Best R² on `sphere · crosshatch` | `whiteBand` (0.789) | **`whiteBand`, unchanged** — the one cell no addition took |
| Best `off the line` on `cylinder · hatch` | `taperedEnds` / `whiteBand` (25.5 %) | **`bundleCount`** (5.2 %), `bundleDither` second (5.4 %) |
| Best `off the line` on `sphere · crosshatch` | `taperedEnds` (19.6 %) | **`penStipple`** (18.0 %), `penPitchMatch` second (18.3 %) |
| Lowest long-wave moiré on `sphere · hatch` and `capsule · hatch` | `taperedEnds` (3.37 / 3.15) | **`bundleCount`** (2.90 / 3.09) |
| "The only law with real free ends" | `lozengeStipple` | **`lozengeStipple`, all six bundle laws, `penStipple` and `penReserve`** — a bundle's outer passes and a cut reserve both stop in open surface, and those are real free ends |
| Deepest darkest L\* | the crossed and swelled width laws | **`bundleSubNib`** (4.5 printed, ≈ 21.6 corrected) and **`contFieldTouch`** (4.5, genuine, hatch only) |

`taperedEnds` still leads `off the line` on three of five cells across the whole roster
(5.7 % / 7.5 % / — / — / 7.5 %), which is what it was kept for. What it lost is the claim to
be the best-behaved law overall, and it lost the crosshatch cell to a three-pen law.

### Three results that are worth more than the laws that produced them

1. **Changing *what* is quantised beats refining the quantiser.** Two independent attempts to
   remove the integer level contour from inside `bundleEased` failed. Moving the transfer from
   the **ink** to the **white gap** — the same integers, a different quantity — took R² from
   0.512 to 0.792 and L\* span from 29 to 42.1, with no width channel at all.
2. **Continuity buys the ease, not the tone.** `contFieldQuant`'s levels sweep shows the ramp
   settled by 16 levels (R² travels 0.007 from 16 to infinite) while monotonicity runs
   53 % → 71 % → 84 % at 16 / 128 / 256. Webb et al.'s 64 levels answer the tone question and
   do not touch this one.
3. **A seam spread across a band of form disappears; a seam on a boundary does not.** The
   three-pen laws that substitute nibs per ruling on a Bresenham schedule hold the tier seam
   to 9.3–11.4 L\*, below `whiteBand`'s own 28.8. The three that put it on a family boundary
   score 37.6–53.8. `penCross` put the seam deliberately on the perceptual cluster boundary,
   on the theory that one visible discontinuity could hide another, and got the worst seam of
   the ten — the two discontinuities add.

### Two measurements that would not render

- **`contFieldTouch` on `sphere · crosshatch`** produces no measurable tone at all. Both
  families flood, the cell is a solid black disc, and R², L\* span, moiré and highlight
  falloff all come back **0**. That is a real result — it is the evidence for the hatch-only
  licence — but the zeros must not be read as "perfectly even" or "no moiré". They mean there
  is nothing left to measure.
- **`penCross` never draws with its fine nib** — 0 paths at the 0.87× multiplier, on all five
  cells. The law is specified with three nibs and emits two. The table records the width range
  as 1.73–3.1× rather than 0.87–3.1×, which is the visible symptom.

---

## Known limitation: the perceptual cluster gap

Sterzik, Meuschke, Cunningham & Lawonn (IEEE TVCG 30(1), 2024) fitted psychometric curves
to crowd-sourced pairwise comparisons of illustrative textures. They report that
**crosshatched and single-direction textures occupy separated perceptual clusters** — and
that each texture family has its own response curve (hatching a = 0.4753, b = 1.5918;
stipple a = 0.5644, b = 1.7361; triangles a = 0.5859, b = 1.8120).

The consequence is structural. **Any ramp that crosses between a single-direction texture
and a crossed one carries a perceptual step that no coverage match removes.** Matching ink
area across the transition — which is what every law here does, and what
`weightCrossHandoff`'s C⁰ handoff is built to do exactly — makes the two sides equal in
ink and still unequal to a viewer.

**Our rig is blind to this.** Every metric in `keepers-table.tsv` is computed from ink area
in a perceptual window. Ink area is the very quantity that is matched across the boundary,
so the residual step falls exactly in the rig's null space. A law can score a clean R² and
a low moiré residual and still show a visible seam where its second family enters.

Two things follow. First, do not use the numbers alone to judge a law that changes texture
family mid-ramp; look at the render. Second, closing this gap needs a *per-family* response
curve — Sterzik's a and b differ by family — applied before the coverage is composed, not
after. That work is not done.

---

## Reproducing the measurements

Node 20 is required. Playwright is resolved from the worktree, so run this from a shell that
can see `node_modules` there.

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20
cd <scratchpad>/fillcmp

# 1. FREEZE. One mirror of the worktree, made once, used by every law. This is what
#    makes the sweep one pass on a branch that takes merges while it runs. The freeze
#    refuses a tree that does not parse, so a mid-merge copy cannot get through.
node keepers-run.mjs --freeze <scratchpad>/tonealgo/k29-frozen

# 2. SWEEP. One run per law against that frozen tree, writing k29-<law>.shots.json
#    (all five cells, tiles + metrics). The Stage-0 NO-TONE reference is rebuilt inside
#    every single run. --portbase keeps the sweep off a sibling agent's ports.
for L in whiteBand nibAngle taperedEnds weightModulated isophoteWidth \
         fineLadder phaseFineLadder perceptualRamp weightSmoothstep \
         lozengeStipple deepFillTSP \
         bundleCount bundleSubNib bundleEased bundleDither bundleLozenge bundleHandoff \
         contFieldSigmoid contFieldTouch contFieldFore contFieldSurface contFieldQuant \
         penInterleave penStipple penReserve penCross penPitchMatch penFacing; do
  node keepers-run.mjs --repo <scratchpad>/tonealgo/k29-frozen \
                       --prefix k29 --portbase 9400 --algo "$L"
done

# 3. COMPOSE. The five sheets + keepers-table.tsv (also written into docs/tone-laws/).
node keepers-sheets.mjs --prefix k29
```

`keepers-run.mjs` builds two patched serve trees per run — Stage 0 and the candidate —
serves both over local HTTP, and refuses to measure unless the SHA-256 of the served
`surface-fill.js` matches the file on disk. **Confirm `provenance OK` appears twice per
run.**

`keepers-sheets.mjs` is roster-driven: the `LAWS` array is the single source of order,
family and mechanism text, and nothing else in the file depends on its length. Adding a law
is one line there plus one `keepers-run.mjs` invocation. It also cross-checks the Stage-0
half of all twenty-eight dumps and prints `stage-0 reference identical across all runs — one
pass confirmed` before it composes; any drift is a warning and means the sweep was not one
pass.

**Sheet size.** The upload path rejects anything much over 4 MB. At twenty-nine tiles the
truecolour sheets run 3.0–4.6 MB, so the compositor palette-quantises each one to 256
colours — visually lossless on flat chrome plus line art, and a 2.5× saving — and only falls
back to reducing the page width if that is still not enough. All five ship at full 1700 px
width, 1.25–1.83 MB.
