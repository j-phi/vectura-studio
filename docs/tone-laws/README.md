# The twelve tone laws we keep

This is the permanent record of the twelve surface-fill tone laws selected out of the
comparison rounds. Each law is a value of `TONE_ALGO` in
[`src/core/scene3d/surface-fill.js`](../../src/core/scene3d/surface-fill.js). A tone law
decides how a scene radiance becomes marks on paper: where a ruling goes, how wide it is,
and whether it is drawn at all.

Every number here was measured on the same fixture, by the same rig, in the same pass.

| Artefact | What it holds |
|---|---|
| [`keepers-table.tsv`](keepers-table.tsv) | Every law × every cell × every metric. 60 rows. |
| `keepers-sheet.png` | All twelve on `sphere · hatch`, in this order. |
| `keepers-capsule-hatch.png` | The same twelve on `capsule · hatch`. |
| `keepers-cylinder-hatch.png` | The same twelve on `cylinder · hatch`. |
| `keepers-sphere-crosshatch.png` | The same twelve on `sphere · crosshatch`. |
| `keepers-ellipsoid-contour.png` | The same twelve on `ellipsoid · contour`. |

The five sheets are render artefacts, not source. They live in the session scratchpad at
`scratchpad/fillcmp/`. Regenerate them with the commands in
[Reproducing the measurements](#reproducing-the-measurements).

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

### What each metric means

| Metric | Definition |
|---|---|
| **R²** | Straight-line fit of apparent CIE L\* against the scene radiance the fill itself used. Apparent L\* is ink area in a 3 mm perceptual window → Murray-Davies reflectance → L\*. |
| **off the line** | Worst bin's deviation from that straight line, as a percentage. |
| **L\* span** | The range of apparent L\* the drawing actually covers. |
| **darkest L\*** | 5th-percentile 3 mm window — the darkest tone covering a *region*, not a spot. The `min` column is the single darkest window. |
| **spacing CoV** | Coefficient of variation of the gap between adjacent rulings. Low is even. |
| **largest adjacent spacing step** | The worst ratio between two neighbouring gaps. This is the number that reads as banding. |
| **weight step along / across** | The worst ratio between two neighbouring pen weights, along one ruling and across to the next. |
| **highlight falloff** | 95th percentile of \|∇L\*\| where radiance ≥ 0.55. How abruptly the ink stops at the lit end. |
| **moiré RMS / long-wave** | Tone residual the light does not explain, at the 3 mm window and again after a 5 mm blur. |
| **worst free end** | Longest ruling end that stops in open front-facing surface. The raw figure additionally counts abutting piece joins, which are pen-down and not breaks. |
| **widest bare gap** | Largest disc of front-facing surface with no ink in it. |
| **ink / paths** | Total drawn length in mm, and the pen-down path count. |

---

## The physical constants that bound all twelve

No law escapes these. They are properties of the pen and the paper, not of the algorithm.

**1. The plot floor is 2.2 × pen.** `PLOT_FLOOR_PEN = 2.2`. At the shipped 0.3 mm pen that
is 0.66 mm. Two rulings closer than the floor do not read as two rulings; the paper
bridges. No law may rule tighter.

**2. One ruled family saturates at ink area 0.509, which is L\* ≈ 76.** Spacing-to-tone is
`pitch = 2 × nib / tone`, so a single family bottoms out at a spacing of about twice the
nib — which is the plot floor. At the floor, `inkWidth / floorPitch = 0.509`. `weightAlongLine`
hit 0.509 exactly. **No spacing law can go darker than that.**

**3. Past 0.509 there are exactly three moves.** A wider stroke (a swell — `weightDeepDark`,
`wideShadowPen`), a crossed second family (`weightCrossHandoff`, `crossFade`), or an
overdraw (`weightMultiPass`). Every law in this document that reaches a darkest L\* below
about 45 does it by one of those three, and pays for it in ink or in plot time.

**4. Layers do not superpose linearly, and the error goes both ways.** A single family
**under**-delivers: 0.408 measured against 0.509 predicted. A crossed pair
**over**-delivers: `XH_DEEP_AREA` had to be *measured* at 0.72 against a predicted 0.85,
and a crossed pair runs solid black over about 5 % of the form. This is Salisbury et al.'s
"lightening factor" (SIGGRAPH 1997) seen from both sides. No arithmetic in the source fixes
it; the correction has to come back from the render, which is what Ostromoukhov's
equilibration table (`EQ_TABLE`, SIGGRAPH 1999 §2.3) is for.

---

## The twelve

Ordered as selected. `NO TONE` is the reference the other eleven are read against.

### 00 · NO TONE — the Stage 0 reference

**Mechanism.** Not a law. It is the same build with the tone apparatus switched off:
`masterGrid` and `dither` both false. Every ruling of the density grid is drawn, at one
pitch, at one weight. It is what the fill looks like when nothing modulates it.

**Source.** None. It is this repository's own Stage 0.

**Strengths.** Perfect evenness by construction — spacing CoV 0.0, spacing step 1×, zero
free ends. The gentlest highlight falloff of the twelve on all five cells
(4.05 L\*/mm on `sphere · hatch`) and the lowest moiré on four of them (3.76 RMS), because
there is no modulation to beat against the raster. Cheapest ink on every cell (775 mm, 23 paths on
`sphere · hatch`).

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
75.6 %. Highest path count of the twelve on `sphere · hatch` (515). Moiré 9.11 RMS.

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

**Strengths.** The best-behaved law of the twelve overall. On `sphere · hatch`: R² 0.513,
off the line **5.7 %** (the lowest), L\* span 27.5, darkest L\* 53.7, zero free ends.
It leads or ties on `off the line` in four of five cells (cylinder 25.5 %, crosshatch
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
second darkest of the twelve, and 4.5 (solid) on `sphere · crosshatch`. Very even spacing
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
0.31, zero free ends, 1192 mm ink. Best R² of the twelve on `sphere · crosshatch` (0.789).
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
is right and the mechanism cannot express it. Highest spacing CoV of the twelve (0.74).
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
deepest reading of any law on that cell.

**Weaknesses.** It is the **only** law of the twelve with real free ends: 23.75 mm on
`sphere · hatch`, 21.75 on the capsule, 23.94 on the crosshatch. Those are strokes stopping
in open front-facing surface, which is a craft defect, not a rounding artefact. Worst
adjacent spacing step in the table (8×). Off the line 42.8 % on `sphere · hatch` and 68 % on
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

**Strengths.** The cleanest signal of the twelve. Lowest moiré of any tone-carrying law on
four of five cells (7.28 RMS / 3.82 long-wave on `sphere · hatch`; 1.69 / 0.74 on the
ellipsoid, the lowest figure in the whole table), because the traverse is aperiodic by
construction. Gentle highlight falloff (4.92 L\*/mm). Only 40 paths, and no extra pen
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

Node 20 is required.

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20
cd <scratchpad>/fillcmp

# one run per law — writes keepers-<law>.shots.json (all five cells, tiles + metrics)
for L in nibAngle taperedEnds weightModulated isophoteWidth whiteBand \
         fineLadder phaseFineLadder perceptualRamp weightSmoothstep \
         lozengeStipple deepFillTSP; do
  node keepers-run.mjs --algo "$L" --tag "$L"
done

# the five sheets + keepers-table.tsv
node keepers-sheets.mjs
```

`keepers-run.mjs` is `v4.mjs` with the per-law sheet writer replaced by an all-cell dump.
It builds two patched serve trees per run — Stage 0 and the candidate — serves both over
local HTTP, and refuses to measure unless the SHA-256 of the served `surface-fill.js`
matches the file on disk. Confirm `provenance OK` appears twice per run.

The Stage-0 half is identical in every run by construction. `keepers-sheets.mjs` verifies
this across all eleven dumps and warns on any drift before it composes.
