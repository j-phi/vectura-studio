# Round 10 — the submission

Engineer, Round 10. Branch `shadow-anatomy`, baseline `a3ef2f7` (Round 9 scored
26 PASS / 12 MARGINAL / 5 FAIL).

**This file is the deliverable.** Every number below names the instrument that
produced it and the command that can reproduce it. Where a number moved against
prediction it says so; where a lever was built and withdrawn it says that too.

---

## 0. The headline — the round's own finding contradicts its own plan

The Round 9 plan's first sentence was *"Round 10's job is arrangement, not
tuning,"* and its P0 #1 was to build an arrangement instrument and then look at
`Regions.formZone`'s boundaries, on the suspicion that *"zone assignment is noisy
per-sample, so the right amount of ink lands in the wrong places."*

**The instrument was built. The suspicion is refuted.**

Facet adjacency, read off the renderer's own `record.edges` — the same source
`Regions.smoothShadedFaces` uses, not a re-derived mesh:

```
                largest same-zone component / zone facets      [scramble control]
W-lp-bands4  F 26/26 (1 comp)   L 12/12 (1)   M 24/24 (1)   R 6/6 (1)   T 22/22 (1)   17-22 %
W-lp-sun45   F 18/18 (1 comp)   L 15/15 (1)   M 26/26 (1)   R 7/7 (1)   T 24/24 (1)   17-20 %
R-lp-bands4  F 10/10 (1 comp)   L  6/6  (1)   M 11/11 (1)   R 4/4 (1)   T 9 in 3, largest 6 (67 %)   26-31 %
```

Every zone on the two `W-lp` fixtures is **one connected component**. The only
split anywhere is `R-lp-bands4`'s T at three components, and its largest is still
67 %. Because "1 component" is also what a broken counter would print, every zone
carries a **scramble control**: the same facets, the same `built.edges`, the same
multiset of zone labels, sixteen deterministic reassignments. Contiguous zones
collapse to 17–31 % under it. Zones too small for the control to distinguish are
printed as *chance-confounded* rather than quoted.

> **The zone map is a clean set of bands. The failure is in the VALUE the bands
> are given.**

That relocates the O3 FAIL from the classifier to the ink — and it puts **O6 back
at the centre of the drawing problem**, not at item 5. Two more measurements this
round point the same way:

- The **namesake test's drift** turned out to be hiding a live defect. Moved onto
  the real fixture camera and sun, O12's bands 2→3 step measures **0.0465 against
  its own 0.05 bar** — the curved fill's totals at bands 2 and 3 are 749.0 and
  750.9, a quarter of one percent apart. Round 2's exact defect signature ("the
  curved path was not shading at all") surviving at the 2→3 step, invisible for
  eight rounds because the only test that could see it was aimed at a 45° sun that
  no rendered view uses.
- The **pole caustic** is not a lighting feature and not an arrangement problem
  either; it is the chart's own metric, and it is measured below.

---

## 1. The P0 the round was told to fix first — and what it actually was

> *"7 of 88 and 5 of 37 limb facets went from toned to bare paper. At `75b97a5`
> every facet with geometry carried fill."*

**Both halves of that reading are wrong, and I can show it with the instrument the
review correctly said was hiding it.**

### 1.1 It is not a limb defect

Nine visible facets on `W-lp-sun45` carry zero fill at `a3ef2f7`. **Five are zone
L — the CENTRE LIGHT — and the two largest facets in the whole list are among
them.** Only two are anywhere near the limb.

```
face:26  L  N.L 0.898  202.5 mm2      face:150 R  N.L 0.000   23.6 mm2
face:89  L  N.L 0.950  188.8 mm2      face:20  M  N.L 0.738   16.8 mm2
face:84  L  N.L 0.921   34.4 mm2      face:38  T  N.L 0.000   11.9 mm2
face:27  M  N.L 0.380   11.4 mm2      face:85  L  N.L 0.827    9.9 mm2
face:21  L  N.L 0.866    9.0 mm2
```

### 1.2 It is not entirely new

At `75b97a5`, `face:89` on `W-lp-sun45` and `face:39` / `face:78` on
`R-lp-bands4` **already carried zero fill**. The counts were **1 and 2, not 0 and
0**, and they went to **9 and 8, not 7 and 5**. Measured at both commits with the
same instrument, in a detached worktree at `75b97a5` with the current harness
copied in so `src/` is the only variable.

The review's "7" and "5" are its *newly*-blank counts under a different
denominator ("faces with geometry"), which is why they differ from mine; the
seven ids it names (20, 21, 27, 38, 84, 85, 150) are exactly the seven I find
under cause (b) below, so the two measurements agree on the substance.

### 1.3 There are two causes and they are different defects

Instrumented on the live call path — plane pitch, the facet's own in-plane extent
across the rulings, and `uvPitchFactor` k:

```
face  zone  screen pitch      k      plane pitch   facet extent
 26     L      15.873      0.5680      27.943        27.226    the TONE is wider than the facet
 89     L      16.373      0.5209      31.431        25.226    the TONE is wider than the facet
 21     L       4.584      0.0215     213.469        28.774    k blew the pitch up
 84     L       4.707      0.0873      53.936        31.843    k blew the pitch up
 38     T       1.980      0.0564      35.091        30.456    k blew the pitch up
```

`hatchPolygon` places rulings at `pMin + i·spacing` for `i = 1 … floor(extent /
spacing)`. **A spacing wider than the facet's own extent gives count = 0** — the
facet is dropped from the drawing at whatever tone it was asked for. This is the
same defect §4.4 found from the other side (facets at N·L 0.746 and 0.744
measuring D 0.000 and D 0.163).

### 1.4 And the glint facet is the headline

`face:26` and `face:89` both carry `glint`. `GLINT_GAIN_MULT` is a **multiplier**,
and the comment beside it says why in as many words:

> *"Capped, not emptied. A cube shows three faces, and emptying one reads as a
> hole rather than as a highlight (§5.4 #1 — a highlight is defined by the ink
> AROUND it)."*

On the low-poly geodesic it **was emptied** — not by any decision, but because the
capped pitch (15.9 mm) exceeded the facet's own width on paper (14 mm). **An
invariant stated in the source and violated in the drawing, at both commits.**
O8's own clause is *"never a whole blank face bounded by the object's own edge"*;
this is that, on a 202 mm² facet at N·L 0.898.

### 1.5 The rule, and why the fix is not "lower the k floor"

> A family wider than its own facet draws **one** ruling instead of none — but
> only when the facet's width **on paper** can absorb one ruling inside the
> **zone's composed ceiling**.

One ruling across a convex facet covers about `pen / widthOnPaper` (its length is
≈ area / width), so the test is exact enough to make without drawing it. The
ceiling is the gate and it is what keeps this from being a flood:

| facet | area | one ruling would land | zone ceiling | outcome |
|---|---|---|---|---|
| `face:21` | 9.0 mm² | **0.486** | L, 0.0987 | 4.9× over — stays bare, correctly |
| `face:84` | 34.4 mm² | 0.108 | L, 0.0987 | 1.1× over — stays bare |
| `face:26` | 202.5 mm² | **0.019** | L, 0.0987 | drawn — and within 3 % of the 0.019 its own recipe asked for |

```
W-lp-sun45   zero-fill 9 -> 6        R-lp-bands4   zero-fill 8 -> 3
```

**No bare facet above 34.4 mm² remains on either fixture.** `75b97a5` had bare
facets of 188.8 and 147.7 mm² and `8c0f249` added 202.5. The result is strictly
better than either baseline, and what is left bare is now **a decision with
arithmetic behind it** rather than the residue of a k-floor chosen to keep the
arithmetic finite — which is what the review asked for. Pinned per fixture.

### 1.6 The composed ceiling is now one law

`TOTAL_DARK_CEIL` and `DARKEST_WEIGHT` lived in `surface-fill.js`, so the **curved**
path enforced the composed ceiling and the **faceted** path had no counterpart at
all. That is §4.2's finding one level deeper: the faceted fill had nothing that
could tell it whether one more ruling was legal. They move to `regions.js` beside
`FORM_INK` (the weight they divide by), `surface-fill.js` reads them lazily, and
`Regions.formCeiling` is the single expression. Values unchanged at 0.47 and 2.0;
every curved drawing stays byte-identical.

---

## 2. §5.3's second direction — built, measured, withdrawn

The ruling was *"give the narrow facet its second direction inside the composed
ceiling; the total D must not move."* I built exactly that: the crossed family
gets the same one-ruling fit, and the carrier is widened to pay for it so the
composed total is the total the recipe asked for.

```
R2-cube  face:+X   0.1515 (A) + 0.0303 (B) intended = 0.1818
                   0.1358 (A) + 0.0460 (B) landed   = 0.1771
         sibling   face:+Z, same zone, same recipe  = 0.1699
```

I predicted 0.201 from `pen / facetWidth` before running it and measured 0.206 for
the un-rebalanced version — the model is good to 2.5 %.

**It re-breaks O20 and I withdrew it.** Both faces aim at 0.1818 and both fall
short on integer ruling counts; `+X` lands **closer to the recipe than `+Z`
does**, and O20's ordering clause reads that as `+X` out of order by 0.0072 — **a
quarter of O20's own 0.03 readability bar**. A clause cannot adjudicate two facets
of one zone whose intended tone is identical.

The reviewer tested a candidate lever, saw it fail on two fixtures, and threw it
out rather than prescribe it. This is the same call. **The finding goes back: O20's
ordering clause needs a tolerance, or it needs to exempt same-zone pairs, before
§5.3 can be bought.** The code carries the arithmetic in a comment so the next
round does not have to rebuild it.

---

## 3. C15's sub-window clause — the caustic gets a number

C15's bars are stated over 4 mm windows and the worst point of the drawing is
smaller than one. Local ink coverage at pen scale, **no rasteriser** — a raster at
pen scale measures the pen's own width and its anti-aliasing as much as the
drawing, while this measures ink **length per area**, which is what a plotter
spends and what the plot floor is stated in.

```
fixture              local MAX (r = 1 mm)     4 mm-window max (boolean grid)
E-bands4                    0.957                     0.5062
V-E-bands4-sun45            0.960                     0.4750
W-bigball-bands4            1.069                     0.4700
W-bigball-sun45             1.069                     0.5056
R2-cube-bands4              0.382                     (control: no chart, no knot)
```

**Worst-of-four is past SOLID**, and stays past it after the instrument's own bias
is subtracted (see below): 1.069 / 1.051 = **1.017 areal**.

**It is the chart, not the light.** `W-bigball-bands4` and `W-bigball-sun45` put
their worst point at the **same screen coordinate, (115.2, −21.8)**, under two
different suns — to within 0.5 mm and 0.02 coverage. A lighting feature moves when
the sun moves; a parameterisation artefact does not. Pinned as its own test. The
five worst spots on each fixture also decluster into one neighbourhood, so this is
a **knot** and not a generally over-inked dark side; the two have different fixes
and a max alone cannot separate them.

**The instrument is calibrated by two closed forms**, because §0 says a probe may
not be quoted until it has been shown able to say NO:

```
isolated ruling  ->  pen x 2R / (pi R^2)                       = 0.1910 exactly
grid at pitch p  ->  pen / (pi R^2) x SUM 2 sqrt(R^2 - (np)^2)
```

The second is **the disc's chord bias written down rather than tuned away**: a disc
centred on a ruling weights its neighbours by chord length, so a grid at the 2.2 ×
pen floor reads 0.4779 against an areal 0.4545 — a fixed **+5.1 %**, stated so the
reader can subtract it.

**Reported against itself:** the first version of this instrument got its own
control wrong. It read the drawing's sparsest probe as the isolated-ruling
calibration and printed `INSTRUMENT WRONG — do not quote`, correctly: the curved
fill emits each ruling as a **polyline of short segments**, many shorter than 2R,
so a probe at such a midpoint legitimately reads below the isolated value. The
control is now synthetic and exact, and the failure mode is recorded in the source
because the next instrument will have it too.

---

## 4. O28 — measured, PASS, and it was one command

Band index is identical for **all 496 facets visible in both** `Gp-yaw-30` and
`Gp-yaw-18`; **0 differ**, and the largest `|ΔI|` across shared facets is
`0.00e+0`. 27 facets appear in only one view — turning away is not a re-grade, so
the comparison is per-`faceId` over the intersection. The probe was shown able to
say NO: halving the tone thresholds moves 175 of 523 facets.

No raster was needed and none was used: band index is
`Regions.band(combinedIntensity(n, p, lights), tone)` and no camera term enters
that chain.

**A defect in the plan's own framing, found by measuring:** `Gp-*` are the **trio**
views and `facets.js` only ever looked at `np.objects[0]`. Run as specified, O28
would have answered on **3 facets**. The instrument now walks every object.

---

## 5. The single-source rule is now a test, and the drift it was hiding

All six restating tests move onto the fixture module, and the rule stops being a
paragraph: a guard test discovers the consumer set **from imports** rather than
enumerating it, so it cannot go stale, and both allowlists are **empty**. Proved
RED by reintroducing a camera literal.

Two corrections to the review's table, both measured:

- `scene3d-faceted-highlight-dispatch.test.js` was listed as matching. **Two of
  its fields had already drifted**: its `BOUNDS` omitted `fastPreview` /
  `preview3dQuality`, and its sun carried `castShadows: false` against the
  fixture's `true` — under a comment saying it "mirrors the design harness
  fixture."
- The namesake test had a **fourth** divergence the table did not list (its
  capsule's `id`), and `scene3d-cross-frame.test.js` restated the ball *pair*, not
  just the ball.

**And the drift was load-bearing.** See §0: O12's bands 2→3 step passes at 0.2709
under the drifted 45° sun and measures **0.0465 against a 0.05 bar** under the real
one. Ratcheted at 0.046 with the spec bar named and labelled a miss, following the
`scene3d-projected-pitch.test.js` precedent — **not weakened.** The fix belongs in
the curved ladder, not in that number.

Also recorded: C7's weakest clause narrowed from +0.0449 to +0.0086. Still passes,
on a fifth of the advertised headroom.

---

## 6. What did not land, and why

- **The sphere's cast shadow (C5 / C13 / C2 / C4)** — not attempted. It is
  darkest mid-throw with contact end and far tip equal, the cube reads correctly,
  and the fix has to change the shadow's *shape* while `Z0` and the layer totals
  stay bit-identical. That is a round's work on its own and starting it badly is
  worse than not starting it.
- **O5 / O8's highlight-area instrument** and **O26's banding instrument** — not
  built. Both are now fourth-round debts and I am not going to claim otherwise.
- **`faceLightDrivenLines`** — untouched. The 120-view evidence fingers it twice
  and it still has no fixture.
- **The pole caustic is measured, not fixed.** §3 gives it a number and a clause;
  the fix is a cap on local ink density near the chart singularity, and it belongs
  with whoever also rules on §5.0's 8:1, because both are about the ladder's
  dynamic range.

---

## 7. Instruments added this round

| script / test | what it can now see |
|---|---|
| `scripts/shadow-anatomy/facets.js` | the sub-window facets it always claimed to list (35 of 90 on `W-lp-sun45`); fill ink and ZERO-FILL per facet; same-zone connected components with a scramble control; band index; `--o28` across every object |
| `scripts/shadow-anatomy/r10local.js` | local ink coverage at pen scale, declustered hot spots, two closed-form controls |
| `tests/unit/scene3d-blank-facet.test.js` | bare-facet counts and the composed-ceiling law, per fixture |
| `tests/unit/scene3d-subwindow-density.test.js` | C15b, as a ratchet recording a miss |
| `tests/unit/scene3d-fixture-single-source.test.js` | §0's fixture rule, enforced rather than described |
