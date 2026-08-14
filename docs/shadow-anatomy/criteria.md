# Shadow anatomy — the criteria, reconstructed

**Status: a RECONSTRUCTION, and it says so on every line it is unsure of.**

The original contract, `design-shadow-anatomy.md`, does not exist on disk anywhere
and has not since at least Round 8. It lived only in a `/private/tmp` scratchpad,
which is pruned between sessions; the Round 2–5 scorecards went the same way. Round
9's reviewer logged that as LOG-000 and scored the whole round against a
reconstruction rather than against the contract.

This file is that reconstruction, written down. It is assembled from three sources
that **do** survive under version control or in the test suite:

1. the Round 6, 7 and 8 scorecards (`docs/shadow-anatomy/round*-scorecard-*.md`),
   which restate a criterion's text whenever they move it;
2. the assertions actually pinned in `tests/unit/scene3d-*.test.js`, which are the
   only executable statement of any of it; and
3. the constants and their comments in `src/core/scene3d/regions.js`,
   `src/core/scene3d/surface-fill.js` and `src/core/algorithms/scene3d.js`, which
   cite spec sections by number (§0, §2.3, §4, §5.0–§5.5, §6.1, §6.3).

Where a number comes from a scorecard it is marked **[R6]/[R7]/[R8]**. Where it is
inferred from source or from a test it is marked **[src]** or **[test]**. Where it
is genuinely unknown it says so. **Nothing here should be treated as the spec's own
wording.** If the original turns up, this file loses to it.

---

## 0. How anything is measured

- **D** is the **fraction of dark area in a 4 mm window** (§6.1). It is read off a
  raster of the drawing, never summed from ink length — ink × pen ÷ area is
  additive and double-counts every crossing. [R7, and `scene3d-form-ladder.test.js`]
- Two instruments produce D and they do not agree to the digit:
  - the offline harness (`scripts/shadow-anatomy/r8lad.js`) rasterises the SVG in a
    real browser at 2×, so anti-aliasing and round caps broaden every stroke;
  - the unit tests stamp a **boolean grid** at 0.1 mm, so an area inked twice is
    still one dark cell.
  The boolean grid reads **≈ 8–12 % under** the browser raster on the same drawing
  (measured, Round 9: ladder `0.069/0.068/0.076/0.086` against `0.073/0.072/0.082/0.092`).
  A bar quoted without naming its instrument is ambiguous by about that much.
- **A window is scored only if it is WHOLLY on the page** and wholly inside the
  region being measured. A partly-off-page window has less paper to be dark, so
  scoring it reports the page edge rather than the drawing. [R8 §4.4]
- **A facet is scored only if it contains a whole 4 mm window.** Facets smaller than
  the protocol's own window report `n = 0` and are listed separately rather than
  silently dropped. `n < 3` on a zone is printed as **UNMEASURED**. [`facets.js`]
  **Round 10:** `facets.js` documented that separate listing for two rounds and did
  not do it — on `W-lp-sun45` that hid **35 of 90 visible facets, 39 % of the form**,
  and an unreported behaviour change was living in the gap. It now prints them.
- **Every 4 mm bar needs a companion clause at PEN scale.** A window structurally
  cannot see anything smaller than itself, and the worst point of the drawing is
  smaller than itself: the pole caustic measures **1.069 local coverage at r = 1 mm
  against a 4 mm-window max of 0.4700 on the same fixture** — the enforcing
  instrument under-reads the drawing's worst point by 2.1x. [R9 §5.4; R10, `r10local.js`
  and `scene3d-subwindow-density.test.js`]
- **A NUMERIC BAR MUST NAME ITS INSTRUMENT.** Every bar in this file now does. Round 9's
  submission quoted a browser-raster `max(object)` of 0.539 against a boolean-grid bar
  the enforcing test reads at 0.5062 — a consistent ~1.06 — in the same round that wrote
  the rule against it, and it was one of three legs of the argument that O6 could not be
  bought. [R9 §4.3]
- **The four-fixture ladder is the unit of report.** A ratio that survives one
  fixture is an anecdote. The four are `E-bands4`, `V-E-bands4-sun45`,
  `W-bigball-bands4`, `W-bigball-sun45`. **Report worst-of-four, never best.** [R7
  protected item 4; R8 §LOG-003, which is the ruling against reporting the one
  fixture that improved]
- **A harness reads its fixture from `tests/fixtures/scene3d-shadow-anatomy.js` and
  never restates one.** Broken five times; each time it produced a silent scoring
  corruption. [R4, R6, R7, R8, and the ladder test found in R9]
- **A probe's output may not be quoted until the probe has been shown able to say
  NO** — feed it a known-bad input and confirm it reports the failure. [R8 §2, after
  `r7audit-protected.js` printed `cast 0.00mm/0p` for a whole round and its output
  was quoted as a protected-list table anyway]

---

## 1. Cast shadow — C1 … C15

The cast shadow is **complete and explicitly protected**: nothing on the object side
may move it. Its geometry is bit-identical across Rounds 7, 8 and 9.

| | criterion | source |
|---|---|---|
| C1 | the cast shadow's geometry is stable — the same scene draws the same shadow | [R7/R8, carried] |
| C2 | the contact collar is the darkest thing in the drawing: `max(Z0) / max(object) ≥ 1.25` | [R7] |
| C3 | the contact collar is **anchored**: `Z0` is identical at every layer count (1318.44 mm / 211 paths) | [R8, `scene3d-cast-shadow-zones.test.js`] |
| C4 | the collar is a band with real width, not a line | [R6/R7, carried; exact wording unknown] |
| C5 | shadow softness reads as a gradient across the throw | [carried; wording unknown] |
| C6 | the umbra **recedes** as layers are added: `Z2` carves 2 → 3 → 4 | [R8, test] |
| C7 | the shadow's silhouette follows the caster | [carried; wording unknown] |
| C8 | the shadow is not detached from a resting object | [R7 item 11] |
| C9 | the boundary artefact between shadow zones is continuous, not blocky | [src, `FEATHER_*`] |
| C10 | ditto on the ground plane specifically | [src] |
| C11 | **Layers adds structure, not ink**: totals at 2/3/4 stay within ±25 % of their mean (7840.20 / 8896.92 / 7448.60) | [R8, test] |
| C12 | **Layers Off is unchanged**: 16109.77 mm / 535 paths | [R8, test] |
| C13 | the shadow respects the light's direction and elevation | [carried] |
| C14 | no square grid in the cast shadow — the two families never cross at ≈ 90° | [R7/R8; §2.3 bans +90° by name] |
| C15 | **plot safety, whole drawing**: no window may reach D ≥ 0.90, and a run of windows at D ≥ 0.80 is a breach — **boolean grid, 4 mm windows** | [R8 §3.3 scores both clauses] |
| C15b | **plot safety at PEN scale** (Round 10, new): local ink coverage in a disc of radius 1 mm may not reach 0.90. **Instrument: `r10local.js` / `scene3d-subwindow-density.test.js`, ink length per area, no rasteriser**, calibrated against two closed forms (an isolated ruling reads 0.1910; a grid at the 2.2 × pen floor reads 0.4779, a fixed +5.1 % above the areal 0.4545). **Currently BREACHED on all four fixtures: 0.957 / 0.960 / 1.069 / 1.069, worst-of-four past SOLID.** | [R9 §5.4 owed it; R10 measured it] |

**C15 is the only one of the fifteen that is not about the cast shadow.** It is a
whole-drawing plot-safety bound that happens to live in this block, and it is the
one the object breached in Round 8 (`+X` at 0.891 over 7 windows). Do not say "cast
shadow 15/15" while C15 is breached: the accurate sentence is *the cast shadow is
complete and untouched; the plot-safety criterion beside it is breached, by the
object*. [R8 §1]

---

## 2. Object shading — O1 … O28

### The form ladder

The zones, from `Regions.formZone`: **H** (glint) · **L** (centre light) · **M**
(halftone) · **T** (terminator / core shadow) · **F** (form shadow) · **R**
(reflected rim).

| | criterion | bar | source |
|---|---|---|---|
| O1 | the terminator out-inks the form shadow | `D(T)/D(F) ≥ 1.25` | [R7 §2 — the 1.60 harness bar was **withdrawn**; the spec's own number is 1.25] |
| O2 | the reflected rim lifts | `D(R)/D(F) ≤ 0.60` | [R7] |
| O3 | the dip is a **shape**: `T > F > R`, rising to a peak then falling twice, **and visible as a band** — not merely true in number | qualitative + the ordering | [R7 ruling 2, R8 §1] |
| O4 | the lit band and the halftone are distinct steps | no number recovered; Round 9 pins `L ≤ 0.75 × M` as a floor under it | **[inferred — and this is a ROUND 9 INVENTION AWAITING RATIFICATION.** It was invented in Round 9, pinned as a test in the same round, and then cited as the reason O6 could not be bought. The Round 9 reviewer flagged that as near-circular; it survives their own analysis, so nothing turns on it yet, but it is not recovered spec text and must not be treated as one. R9 §7] |
| O5 | the highlight occupies **≤ 8 % of the lit silhouette** | ≤ 8 % | [R7 §5.4 #8] |
| O6 | **the centre light carries visible tone**: `D(L) ≥ 0.083` — the spec's own "check it first" criterion. **RULED in Round 9 (§1.4, by the Round 9 reviewer): the 0.10 is retired as a mis-statement of §5.4 #1.** O6 and §5.4 #1 are one clause in two units — a raster fraction (0.10) and a pitch in pen widths (12 × pen ⇒ 1/12 = 0.0833). They disagree, the pen-width statement is the real one (it is in the medium's own units, survives a pen change, and a plotter operator can check it), and 0.10 is the only one of the three numbers with no derivation on record. | ≥ 0.083, **boolean grid** | [R7, R8 §3.1; **ruled R9 §1.4**] |
| O7 | moving the light moves all of L/M/T/F/R the same way | qualitative | [carried] |
| O8 | the highlight is **negative space bounded by surrounding hatch** — never a drawn disc, and never a whole blank face bounded by the object's own edge | qualitative | [R7] |
| O9 | `highlightSensitivity` produces distinct states in the default `perFace` mode | ≥ 2 distinct on the cube, 3 on the low-poly | [R7 ruling] |
| O10 | the highlight tracks the light | [carried] |
| O11 | the highlight can be routed to a **second pen** | `pen-hl` carries paths. **Amended [R7]:** the `keep` clause is superseded — `keep` was renamed `none` and is a total bypass that emits 0 by contract | [R7] |
| O12 | (carried, wording unknown) | | |
| O13 | the object never out-inks the contact collar | `max(object) ≤ 0.56`, **worst of four**, **boolean grid** (the instrument the enforcing test reads; asserted PER FIXTURE, which is tighter than "worst of four"). **The 0.56 itself is inherited from Round 7 with no named instrument** — if it was set on the browser raster the enforcing test is ~6 % looser than intended, and that is unresolved. | [R7 protected item 1; instrument pinned R10] |
| O14 | the six highlight treatments are **visibly** distinct under `perFace` | 6/6 distinct | [R7] |
| O15 | ditto under `lightDriven` | 6/6 distinct | [R7] |
| O16 | with specular **off**, `burst`/`altFill` contribute nothing | equal element count to `none` | [R7] |
| O17 | the two hatch families must **never cross at ≈ 90° ON SCREEN** — a square grid reads as wire mesh and beats against the raster (§2.3) | 0 % of crossed windows at ≥ 80°; median ≈ 65° | [R8 newly protected item 1] |
| O18 | the `spiral` and `stipple` mappers honour `ladder[]` | | [R7] |
| O19 | a cube reads as **three values** | 3 distinct D | [R7] |
| O20 | those values are **ordered by N·L**, brightest face = lightest ink; and the **adjacent-LIT-face difference** must be readable — `> ~0.03`, not the max/min spread, which is dominated by the unlit face. A facet out of order with its neighbours' N·L **is a bug** (§5.5.1) | ordering + `Δ > 0.03` | [R7 ruling on O20; `facets.js`]. **The bar has no agreed instrument** — the two live instruments differ by 0.01 on a 0.03 bar, so it is currently unadjudicable. Pick the boolean grid (it gates CI), restate the bar on it, then buy it. [R9 §6] |
| O21 | the low-poly terminator is a **band of facets** darker than those below | `D(T facets)/D(below) ≥ 1.25` | [R7] |
| O22 | **a cube grows no terminator at all** — an edge is not a terminator (the dihedral gate, §5.5.2) | 0 facets classified T | [R7/R8; `Regions.smoothShadedFaces`, 40° threshold] |
| O23 | the **faceted** reflected lift | `D(R facets)/D(F facets) ≤ 0.60`, `n ≥ 3` | [R7/R8 §3.2] |
| O24 | `tone.specular.size` is live on the faceted path and **extinguishes as size → 0** | distinct output at size 0.05 vs 3 | [R8] |
| O25 | `shadowSensitivity` stages the dark side on the faceted path too | distinct output | [R7] |
| O26 | a curved form shows **no banding** between tone bands — band boundaries must not be traceable as edges | qualitative; **no instrument exists** | [R7/R8] |
| O27 | (carried, MARGINAL for three rounds, wording unknown) | | |
| O28 | the tone grade is a property of **object and light**, never of the camera — orbiting must not re-grade a face | band **index** per facet stable across `Gp-yaw-30/-18` | [R7] |

### §5 mechanisms these criteria rest on

- **§0 / C15 — the craft rule.** Past the plot floor you do not get darker by ruling
  closer, you get a flooded blob. The excess spills into a second **DIRECTION**.
  `PLOT_FLOOR_PEN = 2.2` (curved), `PLOT_FLOOR_MULT_OBJ = 1.2` (faceted). [src]
- **§2.3 — crossed families sit at +65° / +32°, never +90°.** [src `CROSS_OBJ_DEG`]
- **§5.0 — the ladder alone tops out at 1.6× gain** and the span the design needs is
  ~8:1, so the dark end **must** gain a crossed family. [src]
- **§5.4 #1 / O6 — the centre light may never be blanker than `LIT_MAX_PITCH_PEN`
  (12) × pen.** **SETTLED, not unresolved.** The clause and O6's 0.10 contradicted
  each other: when the pitch binds, `D(L) = pen × litCov / (12 × pen × litCov) = 1/12
  = 0.0833` exactly, regardless of pen or coverage, so it can never pass a 0.10 bar.
  Round 9's reviewer ruled the bar down to 0.083 (§1.4). **The two statements are now
  one number and must not be allowed to drift apart again.**
- **§5.0's ~8:1, O6 and O13 are THREE-WAY UNSATISFIABLE as written.** O6 (`≥ 0.083`)
  with O13 (`≤ 0.56`) demands a dynamic range of `0.56 / 0.083` = **6.75 : 1**;
  measured `max/L` is 7.29 / 7.01 / 6.17 / 5.85; §5.0's own stated ambition is ~8:1,
  which exceeds the window the two criteria leave by 43 %. At the retired 0.10 the
  required span was 5.6 : 1 and **no fixture satisfied it**. This is why every lever
  tried in three rounds failed: they move where the ladder sits, and the problem is
  how tall it is. **Someone must rule on the 8:1.** [R9 §1.3]
- **§5.5.1 — a facet out of order with its neighbours' N·L is a bug.** [src]
- **§5.5.2 — the dihedral gate**: two faces sharing an edge whose normals are within
  40° are smooth-shaded; a harder edge is an edge, not a terminator. [src
  `Regions.TERMINATOR_SMOOTH_DEG`]
- **§5.5.3 / I27 — the parity contract**: a cube and a sphere lit alike land in the
  same zones, because both call the same `Regions.formZone`. [src]

---

## 3. The protected list

Nothing in a round may move these. Each is now enforced by a test rather than by a
paragraph in a review document.

| value | where it is enforced |
|---|---|
| `Off` cast = 16109.77 mm / 535 paths | `scene3d-cast-shadow-zones.test.js` |
| Layers 2/3/4 cast = 7840.20 / 8896.92 / 7448.60 | same |
| `Z0` = 1318.44 mm / 211 paths at **every** layer count | same |
| `shadow-additive-default.json` `castShadow` = 191 paths / 4248.7242, byte-identical | `tests/baselines/scene3d/tone/` |
| `max(object) ≤ 0.56`, **worst of four, boolean grid** (worst 0.5062, margin 9.6 %) | `scene3d-form-ladder.test.js` (per fixture) |
| O17: 0 % of crossed T/F windows at ≥ 80°, median 65°, four fixtures | `scene3d-cross-frame.test.js` |
| `F/M ∈ [1.45, 1.70]` and `T/F ≥ 1.25`, as four-fixture ranges | `scene3d-form-ladder.test.js` |
| T's `FORM_INK` row (`coverage 1.00, cross 1.00`) — the ladder moves from F, not T | `src/core/scene3d/regions.js` |
| the limb taper: F-zone windows carrying two families at `nz < 0.30` ≤ 15 % | `scene3d-form-shadow-limb.test.js` |
| `+Y` on `R2-cube` = D 0.024 at every band count — the zone-M control | harness `facets.js` |
| the composed ink ceiling `TOTAL_DARK_CEIL × (coverage + cross) / DARKEST_WEIGHT` = 0.47 × w / 2.0 — **ONE definition, read by both fill paths** | `Regions.formCeiling`, `scene3d-blank-facet.test.js` |
| bare visible facets: **6** on `W-lp-sun45`, **3** on `R-lp-bands4`, none above 34.4 mm² | `scene3d-blank-facet.test.js` |

---

## 4. Open, and what is actually blocking each

| | state | blocker |
|---|---|---|
| O5 / O8 | FAIL / MARGINAL | the instrument does not exist: highlight area as a % of lit silhouette has never been a number |
| O6 | FAIL, but **RULED and now reachable** | the bar is 0.083, not 0.10 (§1.4 above). Round 9's "the ceiling is not the binder" was an artefact of one-lever-at-a-time measurement: there are **two ceilings in series** and each hides behind the other — `GLINT_KEEP` 0.60 → 1.00 removes L's damping outright (a 67 % coverage increase) and moves `D(L)` by **exactly zero** on two of four fixtures, because `ceil(L) = 0.47 × 0.42/2.0 = 0.0987`. Measured `D(L)` 0.0694 / 0.0678 / 0.0762 / 0.0865, boolean grid; three of four still miss |
| O20 | at bands 2/3 | adjacent-lit-face Δ is 0.027 / 0.021 / 0.025 against a 0.03 bar (Round 9) |
| O23 | MARGINAL | `n = 1–2` on every fixture: the down-facing ring is **back-facing and culled**, so it needs a **visibility** change (lower the camera, tilt the object), not a bigger fixture |
| O26 | FAIL | no instrument. Needs: the D step across a band boundary against the D gradient within a band |
| O27 | MARGINAL for three rounds | wording lost with the spec |
| ~~O28~~ | **MEASURED, Round 10 — PASS** | band index is identical for **all 496 facets visible in both** `Gp-yaw-30` and `Gp-yaw-18`; 0 differ, and the largest \|ΔI\| across shared facets is 0.00e+0. No raster is needed: band index is `Regions.band(combinedIntensity(n, p, lights), tone)` and no camera term enters that chain. The probe was shown able to say NO (halving the tone thresholds moves 175 of 523). Note `facets.js` only ever measured `np.objects[0]`; run as previously specified O28 would have answered on **3 facets** |
| C1/C2 at pen ≥ 0.5 | untested regime | the cross stride engages and the collar spends ~62 % of its budget there |
| ~~live verification~~ | **DISCHARGED, Round 9** | 18 in-app views per tree; offline and in-app agree to two decimals on all of them. The recipe is `docs/shadow-anatomy/live-verify/harness/`. **A criterion is not scored until it has been seen** |
| O3 arrangement | **the hypothesis is REFUTED** | Round 9 §4.4 suspected the zone map was noisy per-sample, so "the right amount of ink lands in the wrong places". Measured in Round 10 with facet adjacency read off the renderer's own `record.edges`: on `W-lp-sun45` **every zone is ONE connected component** (T is 24/24), and the same on `W-lp-bands4`; the only split anywhere is `R-lp-bands4`'s T at 3 components, largest 67 %. A label-scramble control on the same graph collapses to 17–31 %, so "1 component" is not the output of a broken counter. **The zone map is a clean set of bands. The failure is in the VALUE the bands are given** — which relocates the O3 FAIL from the classifier to the ink, and puts O6 back at the centre of it |
