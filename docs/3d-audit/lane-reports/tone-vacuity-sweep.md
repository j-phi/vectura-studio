STATUS: SWEPT — 0 vacuous / 34 screened

# tone-vacuity-sweep — read-only scout: does any existing test claim crosshatch tone-preservation at d=220?

**Task.** W-31b-plan.md §4.3/§1.4 measured that at Density 220 the crosshatch anti-saturation cap
(`crossMinPitch`/`crossFloorPitch`, W-36c-impl.md "GREEN — mechanism" #2/#3) binds nearly
everywhere, so `want` is very nearly constant there and **tone has essentially no authority over
crosshatch cell size at d=220**. Any test claiming "tone is preserved" or "darker → denser" at
d=220 on crosshatch would therefore be **vacuous by construction** (the mutation "tone OFF" would
leave the asserted quantity unchanged). This sweep enumerates every existing test assertion that
makes such a claim and measures, on the current lane head, whether it actually is vacuous.

- Base: `3bc61c325c44e02ba14819dbc7b9242bc340ce68` (fill-audit-a3 HEAD, same sha the plan itself
  reads — no drift to re-derive).
- Scratch export: `/private/tmp/claude-501/scratch-tonesweep` (`git archive` of that sha,
  `node_modules` symlinked from MAIN). **Nothing was written to any worktree or MAIN.**
- **Headline finding: no test in `tests/` currently asserts "tone is preserved" /
  "darker → denser" for the crosshatch family at d=220 or at max density.** C7 (the plan's own
  proposed fix for this hole) has not landed yet — `grep -rn "az135\|az315"` and `grep -rn "C7"`
  against `tests/unit/scene3d-crosshatch-cell-shape*.test.js` return nothing. So the 0-vacuous
  result is not "everything already passes cleanly" — it is "the claim this sweep was sent to find
  does not exist yet," which is itself the confirmation that W-31b's C7 recommendation is filling a
  real, currently-unguarded hole, not duplicating an existing (and possibly vacuous) bar.
- The two bars that come closest — P5a/P5b on `crosshatch × d=220` — are **not** tone-response
  claims (each is a one-sided floor/ceiling under a single fixed lit condition, not a comparison
  across tone states), so by the letter of the task they are NOT-APPLICABLE. But because they sit
  exactly where a future tone claim would be tempted to piggyback, they were measured anyway
  (§3) — and confirm the planner's finding through a second, independent instrument (total ink /
  coverage, not cell area): flattening the light at d=220 moves ink by only **1.2–5.7%** and
  coverage by **1.4 points**, i.e. even these floor/ceiling bars would barely notice if per-sample
  tone shading were deleted outright.

---

## 1. Grep patterns used and screening funnel

```
grep -rn -i "crosshatch" tests/unit/*.test.js                                   # 34 files (pass 1)
grep -rniE "tone.{0,15}preserv|preserv.{0,15}tone|darker.{0,20}denser|denser.{0,20}darker|
            dark.{0,10}side.{0,20}(denser|more ink|tighter)|
            shadow.{0,20}(denser|tighter|more ink)" tests/                       # 3 files (pass 2)
grep -rl "crosshatch" tests/unit/*.test.js | xargs grep -l "220"                  # 21 files (pass 3,
                                                                                   #  intersected with pass 1)
grep -n "fillDensity: 220\|density: 220\|, 220)" tests/unit/*.test.js | grep -i crosshatch
                                                                                   # confirms which "220"
                                                                                   # hits are density vs BOUNDS.height
```

**Screened: 34** distinct `tests/unit/*.test.js` files matched pass 1 or pass 2. Of those, **12**
were read in full and their relevant `test`/`describe` blocks inspected; the remaining 22 were
eliminated by the "220" intersection (BOUNDS.height literal, not a density value — e.g.
`scene3d-hatch-angle.test.js`, `scene3d-curved-fill-angle-migration.test.js`) or by mapper/keyword
mismatch on inspection (2D-layer `fill-hatch-unified.test.js`/`fill-param-effects.test.js`,
`noise-rack.test.js`'s pattern-name list, faceted-only `scene3d-box-density-bearing.test.js`).

## 2. The table

| test file | test name | density | fixture | asserted quantity | varies with tone? | verdict |
|---|---|---|---|---|---|---|
| `scene3d-crosshatch-cell-shape.test.js` | C1/C2 CEILING (cell aspect / spread, per column) | 50, 220 | crosshatch × {sphere,cylinder,torus,ellipsoid,cone} × cam a/b | cell-aspect ratio, within-family spread | n/a — measured under **flat tone by design** (`lights:[]`), explicitly to isolate placement from tone | **NOT-APPLICABLE** — this ceiling never claims tone preservation; its own header says the opposite ("FLAT-TONE CONTROL… any residual aspect deviation is PLACEMENT, not tone") |
| `scene3d-crosshatch-parity.test.js` | P5b — "d=220 crosshatch ink ≥ v1.4.1 shipped value" | 220 | crosshatch × {sphere,cylinder,torus,ellipsoid}, sun 135°/45° | absolute ink length (one fixed lit condition) | **measured**: lit vs flat (`lights:[]`) ink — sphere 4328.5→4491.8 (+3.8%), cylinder 5828.4→5899.9 (+1.2%), torus 4146.2→4384.1 (+5.7%), ellipsoid 4859.2→5086.8 (+4.7%) | **NOT-APPLICABLE** (it is a floor under one lighting state, not a tone-response comparison) — but flagged: the ≤6% shift shows it would stay green even if per-sample tone shading vanished |
| `scene3d-crosshatch-parity.test.js` | P5a — "ink coverage < 0.85" | 170, 220, 300 | crosshatch × 6 primitives | coverage upper bound | **measured** on sphere d=220: lit cov 0.8072 vs flat cov 0.8215 (+1.4 pts, both under 0.85) | **NOT-APPLICABLE** (ceiling, not a response claim) — same caveat as P5b |
| `scene3d-crosshatch-parity.test.js` | P3a/P3b/P5c — family count/gap ratios | 1, 50, 220 | crosshatch × 4 primitives | ruling-count and gap RATIOS between family A/B under one fixed lit condition | not compared across tone states at all — driven by `crossDensityRatio`, not `I` | **NOT-APPLICABLE** |
| `scene3d-fill-span-verdict.test.js` | "drawn ink coverage never floods to a solid block" | 50, **220** | `{hatch,contour,crosshatch}` | coverage < 0.85 (same instrument family as P5a) | not measured directly here (identical mechanism to P5a above) | **NOT-APPLICABLE** (ceiling, not tone-response claim) |
| `scene3d-fill-span-verdict.test.js` | "the drawing still SHADES: ink density ramps across the form, light to dark" | **50 (default, not parametrized)** | `{hatch, contour}` **only — crosshatch excluded** | dark-bin/light-bin ink-density ramp ratio, bands `[1.11,1.35]` hatch / `[1.22,1.49]` contour | this IS the exact "tone-tracks-darkness" shape being swept for | **NOT-APPLICABLE** — wrong density (never runs at 220) **and** wrong mapper (crosshatch is in `RULED` for the coverage test above but is deliberately NOT in this describe's `forEach` list) |
| `scene3d-curved-crosshatch-controls.test.js` | "crossDensityRatio makes the crossing family sparser/denser" | 60 | crosshatch × {sphere,cylinder,torus} | family-B ink vs the `crossDensityRatio` dial | dial-driven, tone off (`p.tone.enabled:false` in this file's rig) | **NOT-APPLICABLE** (not a tone claim; wrong density) |
| `scene3d-light-driven-highlight.test.js` | I27 — "a lit cube and a lit sphere shade the SAME direction (dark=dense)" | 60 | **hatch**, not crosshatch | left-minus-right ink sign/magnitude | genuine darker→denser claim, but | **NOT-APPLICABLE** (wrong mapper: hatch; wrong density: 60) |
| `scene3d-shadow-anatomy.test.js` | "highlights off must not remove ink (curved fill)" | 85 (fixture default) | `{contour, crosshatch}` on a capsule | ink ratio, specular ON vs OFF (`onM > 0.9*offM`) | a real tone-on/off comparison, but at d=85 — well under the ≥170 band the plan measured the cap binding in | **NOT-APPLICABLE** (right shape of claim, wrong density — this is the template a d=220 twin should extend, see §4) |
| `scene3d-tone-law-collapse.test.js` | U1–U8 multi-primitive × multi-density fold byte-identity | 1, 50, **220** (`DENSITY_VALUES.max`) | **hatch**, not crosshatch | byte-identical JSON between two dispatch paths (fold resolution) — both legs get the identical `opts` object regardless of `I` | cannot be vacuous in the tone-deleted sense: it never claims a magnitude response to tone at all | **NOT-APPLICABLE** (not a tone-response claim; wrong mapper) |
| `scene3d-mark-laws-draw.test.js` | O2/O3/T1b mark-law spacing & direction (`torus/crosshatch d=50`) | 50 | crosshatch (torus) | mark direction/spacing tolerances | no tone comparison | **NOT-APPLICABLE** |
| `scene3d-fill-even-spacing.test.js` | "the drawn pitch steps smoothly, it does not DOUBLE" (`['crosshatch','sphere']` row) | 70 | crosshatch (sphere) | neighbour drawn-gap ratio ≤ 1.6 | explicitly disclaimed by its own comment: "A tone ramp legitimately WIDENS the pitch… that is not the thing to pin" | **NOT-APPLICABLE** (states it is not a tone-preservation bar; wrong density) |
| `scene3d-curved-density-floor.test.js` | crosshatch dial-magnitude/monotonicity tests | 10, 100 | crosshatch × sphere | family-B count vs `crossDensityRatio` dial | dial-driven, not `I`-driven | **NOT-APPLICABLE** |

**0 of 34 screened files, 0 of the ~19 individual test blocks inspected, assert tone
preservation / darker→denser for crosshatch at d=220 or at max density. 0 vacuous passes exist
because the claim itself does not exist yet in the suite.**

## 3. Measurement method for the two floor/ceiling near-misses (P5a, P5b)

Read-only probe (`/private/tmp/claude-501/scratch-tonesweep/tone-vacuity-probe.js`, not committed
anywhere), run via `node` against the scratch export's own runtime loader
(`tests/helpers/load-vectura-runtime`), reproducing each file's own rig and instrument verbatim
(`sceneFor`/`finalFills`/`inkOf` from `scene3d-crosshatch-parity.test.js`; `disc`/`inkCoverage` from
`scene3d-fill-span-verdict.test.js`). Two lighting states, matching the plan's own and
`scene3d-crosshatch-cell-shape.test.js`'s own definition of "flat tone" exactly (`lights: []`,
`tone.enabled` left untouched — NOT the same as disabling `tone.enabled`, which was tried first and
produces a much larger, structurally-different swing because it changes the dispatch path, not just
the shading):

```
=== P5b instrument: crosshatch d=220 ink, LIT (135°/45°) vs FLAT (lights:[]) ===
sphere     lit=4328.5  flat=4491.8  delta=+3.77%
cylinder   lit=5828.4  flat=5899.9  delta=+1.23%
torus      lit=4146.2  flat=4384.1  delta=+5.74%
ellipsoid  lit=4859.2  flat=5086.8  delta=+4.68%

=== P5a instrument: crosshatch d=220 ink COVERAGE, LIT vs FLAT ===
sphere lit cov=0.8072  flat cov=0.8215   (delta +1.4 pts)
```

These deltas independently confirm the plan's §1.4 finding (measured there via cell AREA under two
opposed light azimuths: sphere 1.055×, cylinder 1.038×, cone 1.059× — "almost no authority") through
a completely different instrument (total ink length and rasterised coverage, not local cell area).
Both P5a and P5b would clear their own bars with a comfortable margin whether or not the crosshatch
walk responds to `I` at all at d=220 — they are correct, useful bars for what they claim (a
non-saturation floor/ceiling), but neither one is evidence that tone is preserved, and neither
should be cited as such.

## 4. Recommendation

No existing test needs to be un-pinned or re-labelled — none of them overclaim. The actionable item
is exactly what W-31b-plan.md §3.1's C7 already specifies: land a genuine tone-preservation bar for
crosshatch, and pin it at **d=50, not d=220**, because d=220 is proven (here, independently, and in
the plan) to sit inside the anti-saturation cap's dead zone. The closest existing template is
`scene3d-shadow-anatomy.test.js`'s "highlights off must not remove ink" block — it already has the
right shape (a same-fixture, tone-on-vs-off ink-ratio comparison on `crosshatch`) but runs at d=85,
below the ≥170 band where the cap is measured to bind, so it is not itself at risk — a reviewer
extending that file to d=220 as a "does the cap eat the response" regression probe, or building C7
as its own new file per the plan, should carry an explicit comment (as C7's own spec already
requires) stating it does **not** gate d ≥ 170, precisely to stop a future maintainer from "fixing"
it by widening the band at d=220 instead of moving the check to d=50.
