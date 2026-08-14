# Round 7 Scorecard + Round 8 Plan — shadow anatomy

**Status: COMPLETE.** VERDICT **ACCEPT** — **33 PASS / 5 MARGINAL / 5 FAIL** (R6: 27 / 9 / 7).
The 1.60 T/F bar is **withdrawn**; O1 passes on the spec's own 1.25×. See §2, §7, §8.

Reviewer: visual designer (Round 7)
Branch: `shadow-anatomy`, worktree `.claude/worktrees/agent-a71c6348dd322a40a`
Commits under review: `2823321`, `a2bf25d`, `98289be`
Round 6 baseline: 27 PASS / 9 MARGINAL / 7 FAIL

## 0. What I ran myself (nothing below is taken on report)

- `facets.js ./r7d` — all six R views (O20 / O21 / O22).
- `r7audit-zone.js ./r7d` *(new, mine)* — cross-checks `facets.js`'s zone classification against
  the renderer's own `faceZone`, with and without the dihedral gate and with the object's real
  ground. §1.
- `m4.js ./r7d` and `m4.js ./r7base` — the full ladder and per-patch attribution, before and after.
- `c15.js ./r7d` and `c15.js ./r6c` — plot safety, this round against last.
- `p2.js` — items 11 and 12.
- `r7audit-protected.js` *(new, mine)* — per-`shadowLayer` cast ink at HEAD. §4.
- `__collarForTest` driven across pen 0.2–1.0 × sBase 0.30–2.00. §5.
- `git show` on all 23 moved goldens, extracting `byRegionClass.castShadow`. §4.
- `npx vitest run` (Node 20) on the three new test files — 32 tests, all pass.
- md5 on every dispatch group and on `r7-live/L-ball-bands*.png`.
- **Looked at, not just measured:** `E-bands4` before/after at the limb, `S-litpole`,
  `R-cube-bands4`, `T-matrix-cube`.

## 1. Instrument audit — `facets.js` (the new per-facet instrument)

**Verdict: TRUSTWORTHY ON THESE FIXTURES. Two latent defects, one caveat. All numbers below
reproduce.** I re-ran `facets.js ./r7d` myself and got the submission's numbers to the digit
(O20 6.09× / 4.43× / 3.95×, monotonic at all three band counts; O21 0.295 (n=5) / 0.221 (n=9)
= 1.33×). I then wrote `r7audit-zone.js` to cross-check its zone classification against the
**renderer's**, which is the check the instrument itself cannot make.

What it gets right, and it is not a small list: it reads camera/light/tone/object list from
`render.js` (never restates them); it masks against the **assembled** facet polygon, not a
re-derived mesh; it orients normals from the solid's own centroid and then drops camera-facing
failures, so back faces cannot masquerade as front ones (the engineer records catching exactly
that bug in the first cut); it reads D from the **rasterised** drawing, not from ink length; and
it reports the facets too small to hold a 4 mm window rather than dropping them (17 of 40 on the
geodesic). That last one is the difference between an instrument and a flattering one.

**Latent defect 1 — it restates the fixture after all.** `facets.js:93` passes
`ground: { y0: 0, height: 2 * 46 }` to `formZone`. `2*46` is the BALL's radius, hardcoded into an
instrument whose only two fixtures are the cube and the geodesic. The renderer passes
`recordGround(record)` — the object's **own** world bbox. Measured: real ground is `{y0:2,
height:80}` on `R-lp-*` and `{y0:0, height:62}` on `R-cube-*`. This is the Round 6 protected item
5 ("the harness never restates a fixture") violated in the very instrument written to answer
Round 6.
**It is inert here** — I diffed both classifications facet by facet: **0 disagreements on all
three views**, because `reflectedLift`'s `prox` term only bites near the ground and the R-band
facets fall the same side of `REFLECT_TH` either way. **So no Round 7 number moves.** Fix it in
Round 8 anyway; it will not stay inert when a fixture changes.

**Latent defect 2 — it does not pass the `terminator` override, so its O22 line is not a test of
the dihedral gate.** The renderer's `faceZone` (`scene3d.js:709`) hands `formZone`
`terminator: false` for any facet **not** in `smoothShadedFaces(record)` — that gate is the whole
of O22. `facets.js` omits the key, so `formZone` takes the curved signed-Lambert branch for every
facet.
- On the **geodesic** this is harmless and correct: frequency-2 dihedrals are far under
  `TERMINATOR_SMOOTH_DEG = 40°`, so every facet is smooth-shaded and eligible. Instrument and
  renderer agree exactly (verified: 0 disagreements). **O21's 1.33× is measured on the right set.**
- On the **cube** it agrees only by luck of the sun angle. The instrument prints "facets
  classified T: none" because the +Z face's signed Lambert is below `−TERMINATOR_NL`, not because
  the gate held. Forcing `terminator:false` (the renderer's actual call) gives T n=0 as well — so
  **O22 is genuinely passing**, but `facets.js` is not what proves it. Its O22 line is decorative.

**Caveat — D includes the facet's own drawn edges.** A 4 mm window is admitted when its four
corners lie inside the projected polygon; the window's interior can still contain an edge stroke
running just outside it. On the cube (1630–2823 mm², n = 80–143 windows) this is noise. On the
geodesic it is not: the scored facets run 83–258 mm² with **n = 1–6 windows**, and half a dozen
of the per-facet D values rest on a single window. O21's ratio survives this because T facets
(129–221 mm²) and F facets (83–222 mm²) carry the same bias, but **no single per-facet D on the
geodesic should be quoted as a value.** Report O21 as the ratio it is; do not build on the rows.

**Corollary the engineer did not draw:** with 17 of 40 visible facets under the window and
n = 1–6 on the rest, `R-lp-*` is at the edge of what a 4 mm protocol can measure. If Round 8
wants per-facet numbers on a geodesic it needs a bigger fixture (the `W-bigball` move, applied to
the low-poly), not a smaller window.

## 2. HEADLINE RULING — the T/F bar. You are right that the bar was wrong. You are wrong that 1.455 is the right number. Both moved off a leak; F landed too high.

**First, the facts, all re-measured by me on `r7base` (before) and `r7d` (after).** Reproduced to
the digit:

| | `r7base` | `r7d` |
|---|---|---|
| L | 0.090 | 0.082 |
| M | 0.188 | **0.142** |
| T | 0.401 | **0.417** |
| F | 0.252 | **0.287** |
| R | 0.099 | 0.103 |
| F/M | 1.337 (MISS 1.45) | **2.022 (PASS)** |
| T/F | 1.592 | **1.455** |
| T p90 / p99 / max | 0.546 / 0.636 / 0.636 | 0.499 / 0.531 / 0.531 |

**RULING 1 — the 1.60 bar is WITHDRAWN. The engineer is right and the record should say so
plainly.** I set 1.60 in Round 6 off a measurement of **1.51** taken on an instrument that
excluded a third of what it was measuring, and the pre-change number on the repaired instrument
turns out to have been 1.592 — a number produced by the very modelling error this round fixed.
A bar derived from a leak has no standing over the number that survived fixing the leak. Against
the spec's own O1 (≥ 1.25×), 1.455 passes. **O1 is PASS.** The engineer stopped when told to
stop, argued the bar with measurement instead of quietly tuning it back, and led with the number
that hurt them. That is exactly right and it is the second round running they have done it.

**RULING 2 — but do not carry 1.455 as "the" number, and do not treat F = 0.287 as correct.**
Two things the submission did not report, both of which were sitting in its own harness output:

**(a) T/F is 1.369 on the big-ball fixture.** Round 6 ordered the ladder measured on two
fixtures and both columns reported. All four exist in `m4.js`'s own output and only one was
quoted:

| fixture | T/F | F/M | D(L) |
|---|---|---|---|
| `E-bands4` (r 46, sun 28°) | **1.455** | 2.022 | 0.082 |
| `V-E-bands4-sun45` | **1.435** | 1.981 | 0.089 |
| `W-bigball-bands4` (r 92) | **1.369** | 2.225 | 0.099 |
| `W-bigball-sun45` | **1.464** | 2.087 | 0.105 |

The honest headline is **T/F = 1.37–1.46 across four fixtures**, and the floor of that range
clears the spec by **9.5 %**, not 16 %. Quote the range.

**(b) F overshot its own bar by 39 %, and that — not T — is what ate the ratio.** The R6 rebuild
target for F was **F/M ≥ 1.45**. F/M came in at **2.02–2.23**. Decomposing the ratio move:
F rose 13.9 %, T rose 4.0 %, and 1.592 × (1.040 / 1.139) = 1.453 — the entire fall in T/F is F
rising faster than T. So the correct reading is **not** "the ratio fell because F was finally
fed"; it is "both numbers came off a leak and F landed well past where it was asked to land."

**And it is visible.** I compared `r7base/E-bands4.png` with `r7d/E-bands4.png` at the limb.
Before, the form shadow ran as a single family whose rulings compress toward the silhouette —
which is how a sphere's limb is supposed to read. After, F's crossed family covers the whole
left of the form **out to the contour**, so the ball now reads as a continuous woven mesh from
limb to terminator and **the terminator no longer separates as a band.** Numerically T > F still;
optically the dip is harder to find in `r7d` than in `r7base`. O3 says "the dip is visible as a
shape", and that is the criterion this trade is spending.

**The route, and it costs T nothing — the same arithmetic I owed you last round, done right this
time.** Do not restore T/F by re-breaking F, and do not accept 2.02. Bring F back toward its own
stated bar and T/F recovers for free:

```
M = 0.142 (unchanged)
F/M = 1.60  →  F = 0.227  →  T/F = 0.417 / 0.227 = 1.84
F/M = 1.45  →  F = 0.206  →  T/F = 0.417 / 0.206 = 2.02
```

**Round 8 target: F/M in [1.45, 1.70], T untouched, T/F reported as a four-fixture range.**
Pull F's cross weight down (`FORM_INK.F.cross = 0.40` is the lever) and pull it **off the
silhouette** — F's cross running to the contour is the visible cost and is a separate defect
from its magnitude.

**RULING 3 — O6 has fallen under the SPEC's bar, not just under mine, and the submission
under-reported it.** §8 says "O6, which is itself currently missing its bar (D(L) 0.082 vs
0.13)" — citing my Round 6 ruling. It does not say that **the spec's own O6 is `D(centre light)
≥ 0.10`** and 0.082 is under **that**. On the repaired instrument D(L) was already 0.090 before
this round, so this is an *unmeasurement revealed by the repair* plus a further 9 % drop from
the composed budget — not a fresh regression. But O6 is the spec's own "check it first" item and
it is now failing its own text on 3 of 4 fixtures (0.082 / 0.089 / 0.099 / 0.105). **O6 moves
PASS → FAIL.** It is a spec-text miss and it must be stated as one.

## 3. Criterion-by-criterion scorecard

Everything below is measured by me on `r7d` (and `r7base` for the before column), on the repaired
harness. **Where a criterion is carried, it is carried on a structural argument, not on trust** —
the cast shadow is bit-identical this round (§4), so nothing on the shadow side *could* have moved.

### Cast shadow — 15 P / 0 M / 0 F  (R6: 12 / 3 / 0)

| | verdict | number |
|---|---|---|
| C1 | **PASS** | mean(Z0)/mean(Z2) = **2.90 / 2.92 / 2.99** at A-2/3/4 (bar ≥ 2.0). 2.85 at sun 45°. Was 2.49 on the broken instrument. |
| C2 | **PASS (was MARGINAL — four rounds)** | `max(Z0)/max(object)` = **1.33×** (bar ≥ 1.25), **1.36×** at sun 45°. `p90(Z0)/p90(object)` = **1.64×**. `max(object)` **0.636 → 0.531** (bar ≤ 0.56). n 20 vs 490. **All three clauses met. Closed.** |
| C3 | PASS (carried) | collar geometry bit-identical: Z0 1318.44 mm / 211 paths. |
| C4 | PASS (carried + live) | collar wraps the base on the lit side; visible in `r7-live/U-live-4-throw.png`, which is valid shadow evidence. |
| C5 | **PASS (was MARGINAL)** | mean(Z1)/mean(Z2) = **2.11×** (A-3) / **2.19×** (A-4) / 2.10× (sun 45°), inside the 1.35–2.4 window. R6's 2.54× came from the pre-repair instrument. **Upgraded by measurement; the engineer did not claim this.** |
| C6 | PASS (carried) | Z2 carves 6521.76 → 5802.40 → 3735.33 across Layers 2/3/4. |
| C7 | PASS (carried) | Z0 anchored, invariant across layer counts. |
| C8 | **PASS (was MARGINAL)** | mean(Z3)/mean(Z2) = **0.516** (bar ≤ 0.55); 0.483 at sun 45°. Restored **by producing the number on the repaired instrument**, which is exactly how R6 said it had to be restored. |
| C9 | PASS (carried + live) | no readable outer silhouette in `U-live-*`. |
| C10 | PASS (carried) | |
| C11 | **PASS (re-verified by me)** | 7840.20 / 8896.92 / 7448.60 mm; mean 8061.91; **−2.75 % / +10.36 % / −7.61 %**, inside ±25 %. |
| C12 | **PASS (re-verified by me)** | `Off` = **16109.77 mm / 535 paths**. Unchanged. |
| C13 | PASS (carried) | |
| C14 | PASS (on its literal text) | C14 is worded over `Z0`/`Z1`, which are bit-identical. **But the square grid it forbids is now unambiguously present on the OBJECT** — see `S-litpole`. Scored once, under O17; not double-counted here. Round 8 should extend C14's measurement set to object patches the way C15's was. |
| C15 | **PASS** | zero 4 mm patches ≥ 0.90 **and** ≥ 0.80 across `F-trio` (max **0.733**), `A-2/3/4` (max **0.705**, unchanged) and — for the first time — **`B-cube-zoom` (max 0.725)**. All under the 0.85 collar bound. `F-trio` 0.709 → 0.733 confirmed, and the attribution (the faceted terminator gaining its cross in `98289be`) is correct and was declared. Object half now measured: max 0.531 ≤ 0.56. **Regression test exists and passes (6 tests).** |

**Note on `B-cube-zoom`:** the submission gives **0.735** in §1 and **0.725** in §4. Measured, by two
independent instruments (`c15.js` and `m4.js`): **0.725**. §1 is the typo. Fix it in the record.

### Object shading — 18 P / 5 M / 5 F  (R6: 15 / 6 / 7)

| | verdict | number |
|---|---|---|
| O1 | **PASS** | T/F **1.455 / 1.435 / 1.369 / 1.464** on the four fixtures (spec bar ≥ 1.25). Worst-fixture margin **9.5 %**, not 16 %. The 1.60 harness bar is withdrawn — ruling §2. |
| O2 | **PASS (was MARGINAL/unmeasured)** | R/F **0.227–0.360** on four fixtures, **n = 50 and 58** on `W-bigball-*`. The n ≥ 30 demand is met by enlarging the fixture, which is the right answer to a demand that was really about area. |
| O3 | **MARGINAL** | T 0.417 > F 0.287 > R 0.103 — rises to a peak and falls twice, so the criterion holds in sign and in number. **But the dip is less legible than it was**: F's crossed family now covers the form out to the contour, so terminator and form shadow read as one continuous mesh. See §2 ruling 2. |
| O4 | PASS (carried) | |
| O5 | **FAIL (was MARGINAL)** | On the ball, unchanged at 8.1 % against an 8 % bound. **On the cube it is now badly breached**: `T-matrix-cube` shows `perFace/blank`, `burst` and `altFill` blanking an **entire cube face** — roughly a quarter to a third of the silhouette against a ≤ 8 % bound. New this round (`a2bf25d`); before it, the faceted dispatch was dead code so the treatment did nothing. **The engineer flagged this trade themselves and asked for a ruling — see §6.** Nobody has measured it; the number is owed. |
| O6 | **FAIL (was PASS)** | D(L) = **0.082 / 0.089 / 0.099 / 0.105** against **the spec's own ≥ 0.10**, not merely against my 0.13. Failing on 3 of 4 fixtures. Pre-existing on the repaired instrument (0.090 before this round) plus a further −9 % from the composed budget. The spec calls this the "check it first" criterion. |
| O7 | PASS (carried) | |
| O8 | **MARGINAL (was PASS)** | O8 requires the highlight be "negative space **bounded by surrounding hatch**". A fully blank cube face is bounded by the cube's own drawn edge — the exact reading O8 exists to forbid. Same root cause as O5. |
| O9 | **PASS (was FAIL)** | `J-sens-*` 3/3 distinct, `J-lp-sens-*` 3/3 (verified by md5 myself). `highlightSensitivity` is now read in `perFace` as the specular cone's angular tightness: ~73° → ~49° → ~36°, ink 2417 / 3032 / 3400. |
| O10 | PASS (carried) | |
| O11 | **PASS (was FAIL)** | `I-pen-*` 4/4 distinct, `I-lp-pen-*` 4/4. `pen-hl` paths: sparse 7, stippleOut 37, dashed 26 (all were 0). **Spec amendment recorded:** O11's `keep` clause is superseded — `keep` was renamed `none` by the Round 3 addendum and is a total bypass that emits 0 by contract. `render.js:138` says so. Amend §5.4 rather than leaving a criterion nobody can satisfy. |
| O12 | PASS (carried) | |
| O13 | **PASS** | object max 0.531 < collar max 0.705. |
| O14 | **PASS (was FAIL)** | 6/6 distinct by md5 on both cube and low-poly — **and visibly distinct**, which is the clause that matters. I read `T-matrix-cube`: all 12 cells differ legibly and each treatment does a recognisably different thing. The four root causes (dead `isHighlightBand` branch, `sparse` and `stippleOut` sharing one implementation, `highlightSensitivity` unread, `altFill`'s pitch exceeding its own hotspot) are the kind of finding that only comes from actually looking. |
| O15 | **PASS (was FAIL)** | 6/6 under `lightDriven` on both objects; the `lightDriven` row of `T-matrix-cube` is distinct from the `perFace` row cell by cell. |
| O16 | PASS | `H-specular-off` emits the same element count as `none` (72) — `burst`/`altFill` contribute nothing with specular off. |
| O17 | **FAIL (was MARGINAL)** | Not fixed, and the evidence is now unambiguous rather than suggestive: **`S-litpole` shows a clean square grid** — the two families crossing at ≈ 90° on screen, which §2.3 forbids by name. **The root cause is correct and I verified it independently** (§6). Downgraded because view S finally makes it scoreable and because F's new cross has *enlarged* the plaid. |
| O18 | PASS (carried) | |
| O19 | **PASS** | cube 3 distinct values at bands 4; low-poly spans 0.000–0.316 across 23 scored facets. |
| O20 | **MARGINAL (was FAIL)** | Big, real improvement — and the headline oversells it. Reproduced exactly: spread **6.09× / 4.43× / 3.95×** at bands 4/3/2, monotonic at all three. **But "spread" is max/min and is dominated by the unlit +Z face.** O20's actual clause is that the **two lit faces differ from each other**, and they differ by **0.030 (bands 4) / 0.005 (bands 3) / 0.021 (bands 2)** — against the instrument's own "> ~0.03 is readable" threshold. So three readable values exist **at bands 4 only, and only just**; at bands 3 the cube shows two. Looking at `R-cube-bands4.png` the three faces do read as three values and the ordering is right — this is genuinely fixed at bands 4. Score the clause, not the ratio. |
| O21 | **PASS (was FAIL)** | D(T facets) **0.295** (n=5) / D(below) **0.221** (n=9) = **1.33×**, bar ≥ 1.25. Reproduced. **And I verified the T-set is the renderer's own**: forcing the dihedral gate's `terminator:false` collapses it to n=0, and the geodesic's facets are all smooth-shaded, so the instrument's eligible-branch classification is exactly what the renderer used. The cause (faceted T emitting F's ink recipe, so T 0.159 vs F 0.158–0.161) is correct. |
| O22 | **PASS** | zero facets classified T on the cube at every band count — and it is **structural**, not fixture luck: `smoothShadedFaces` uses a 40° dihedral threshold and the cube's is 90°. |
| O23 | **FAIL (was MARGINAL) — NOT REPORTED BY THE ENGINEER** | O23 is the *faceted* reflected lift and it is the one criterion in view R's own output that went unread. `R-lp-bands4`: exactly **one** facet is classified R (`face:42`, D 0.159) against F mean 0.221 → **0.72×**, bar ≤ 0.6. **Misses the bound, and n = 1 is not "the bottom ring".** The curved-object half (O2) is fine; the faceted half is not, and delivering view R without scoring O23 from it is the gap in an otherwise thorough round. |
| O24 | MARGINAL (carried) | `F-spec0` ≠ `F-spec3` by md5, so specular is live. But `a2bf25d` replaced the glint predicate outright and O24 was not re-measured against it. Re-measurement owed. |
| O25 | PASS (carried) | |
| O26 | **FAIL** | Unchanged. Band boundaries are traceable as edges on the curved ball — visible as hard staircase transitions in both `E-bands4` and `S-litpole`. Root cause correct (§6), not landed. |
| O27 | MARGINAL (carried) | |
| O28 | **PASS** | `rankBands` ranks **every** facet, front and back, and returns a band **index**, so the grade is a property of object-and-light, not of the camera. Verified in the diff. **Argued, not measured** — R8 owes the `facets.js` run across `Gp-yaw-18/30` printing band index per facet. |

## 4. Protected list — RE-VERIFIED BY ME. Nothing regressed.

Measured at HEAD (`98289be`) through `render.js`, fixture never restated:

```
A-off   cast 16109.77 mm / 535 p                                   (C12 — exact)
A-2     cast  7840.20 mm / 428 p   Z0 1318.44/211  Z2 6521.76/217
A-3     cast  8896.92 mm / 835 p   Z0 1318.44/211  Z1 1776.09/355  Z2 5802.40/269
A-4     cast  7448.60 mm /1199 p   Z0 1318.44/211  Z1 1750.32/348  Z2 3735.33/239  Z3 644.51/401
```

- **`Z0` = 1318.44 mm / 211 paths, identical at Layers 2, 3 and 4.** Holds.
- **C11 totals and C12 `Off`** — exact to the hundredth against the R6 protected values.
- **Conservation model** — intact.
- **`COLLAR_CEIL` still 0.80**; `collarStrideFor` + post-stride third-family admission unchanged.
- **"No cast-shadow golden moved" — verified structurally, all 23 moved goldens.** I extracted
  `byRegionClass.castShadow` from every baseline touched by `2823321^..98289be`. Exactly **one**
  golden carries a castShadow section at all (`shadow-additive-default.json`) and it is
  **byte-identical: 191 paths / 4248.7242 ink** before and after all three commits. The other 22
  have no castShadow class to move.
- **RGR gap from R6 — CLOSED, and then some.** Three new test files, **32 tests, all passing on
  Node 20**: `scene3d-plot-safety.test.js` (6), `scene3d-faceted-highlight-dispatch.test.js` (12),
  `scene3d-facet-tone.test.js` (14). The plot-safety test asserts **composed coverage** through
  `__collarForTest`, recomputes the composition itself rather than calling the implementation's
  arithmetic, and includes a minimality guard (a tighter stride must bust the ceiling). That is a
  well-built test. I did not independently re-run its red state at `628f5f^`; provenance accepted.
- **Nothing pins T/F.** The plot-safety test asserts `max ≤ 0.56` and a coarse ramp shape
  (`q(0.5) < 0.30`, `q(0.98) > 0.35`). **Round 8 is free to move F without fighting a test.**

### NEWLY PROTECTED

1. **`max(object) ≤ 0.56`, currently 0.531**, and the per-pass proportional budget that produces
   it (`cᵢ = 1 − (1 − ceil)^(wᵢ/W)`). Never let a pass model another pass's pitch again.
2. **C2 = 1.33× on max, 1.64× on p90**, `n` 20 vs 490.
3. **C5 = 2.11× / 2.19×** and **C8 = 0.516** — the first honest values on the repaired instrument.
4. **The four-fixture ladder is the unit of report**, not `E-bands4` alone. Any ladder change
   re-prints all four T/F, F/M, R/F, D(L).
5. **`shadow-additive-default.json` castShadow = 191 paths / 4248.7242 ink.**

### PROTECTION GAP FOUND — the cast shadow rests on one golden row

`Z0 = 1318.44 mm / 211 paths at Layers 2/3/4`, `Off = 16109.77`, and the C11 triple exist **only in
these review documents and in my scratch probe**. The test suite pins the cast shadow with a single
number in a single baseline. `shadow-inverse.json`, despite the name, carries **no** castShadow
section at all. **Round 8 must add a cast-shadow golden pinning per-zone ink at Layers 2/3/4.**

## 5. The two self-corrections — both checked

**#1 — the cross-stride claim. The correction is right, the enumeration is incomplete, and THE
FALSE CLAIM IS STILL IN THE SOURCE.** I drove `__collarForTest` across pen 0.2–1.0 × sBase
0.30–2.00. The commit message's "evaluates to 1 at every shipped pen and density" is **false**, as
they now say. Their replacement table is materially accurate but stops short:

```
crossStride = 2 at:  pen 0.3, sBase <= 0.36
                     pen 0.5, sBase <= 0.50
                     pen 0.8, sBase <= 1.00
                     pen 1.0, sBase <= 1.00   <-- not in their table
```

So it engages across a wide band of the parameter space, not a corner of it. **The claim that
matters is true and I verified it: it is inert on this harness** — `Z0` is bit-identical at
1318.44/211 before and after.

**But `src/core/scene3d/shadows.js` still carries the sentence verbatim in the comment above
`collarCrossStrideFor`:** *"At every shipped pen and density it evaluates to 1 and the emitted
geometry is byte-identical."* They corrected the write-up and left the code asserting the thing
they retracted. **Fix the comment in Round 8** — a false comment in protected code is how a number
becomes unattributable, which is the exact failure mode Round 6 named.

**A consequence neither of us has looked at.** Wherever the cross stride engages, composed coverage
jumps from > 0.80 straight to **0.498** — the integer-subset search overshoots and the collar spends
**62 % of its budget**. The collar must be the darkest thing in the image (C2). **C1 and C2 have
never been measured at pen ≥ 0.5.** That is a real, untested regime, not a hypothetical.

**#2 — the live object. CONFIRMED, exactly as reported.** `r7-live/L-ball-bands2.png`,
`bands3.png` and `bands4.png` are **byte-identical** (md5 `f644e492…` all three). The object is not
live-verifiable in this worktree; `params.objects[0]` is not what carries the geometry in the
running app. **I have scored no object criterion from `r7-live/`.** The `U-live-*` frames are
treated as shadow evidence only, as the engineer asked. They were also right to keep this distinct
from the `ee91289` style-less-child defect — different mechanism, and `render.js` drives the
monolith path with an explicit mapper per object, so the offline harness is genuinely unaffected.

**Minor:** the §7 pen-up table does not quite reproduce (I get `A-4` 1554 paths / 18162 mm pen-down
vs their 1553 / 18238; `F-trio` 2537 / 24265 vs 2432 / 23638). The conclusion is unaffected and
correct — **`A-4` is cheaper in total travel than `A-off`** (44 691 vs 53 374 mm). Say which commit
a table was taken at.

## 6. The not-landed items — root causes judged, and the ruling on the flagged trade

**O17 + O26 — root cause ACCEPTED. I verified it independently, two ways.**
*In the code:* `emitAngledFamily` builds its family through `angleFamily(angleDeg)`, whose normals
and directions (`na, nb, da, db`) are **parameter-space** components; the +65° is added to
`opts.fillAngle` in that frame. *Analytically:* on a sphere chart the pushforward metric is
`(R·cos v · du, R · dv)`. As `cos v → 0` at the pole the u-component collapses, so family A (pure
u, the parallels) and any family with a dv component diverge toward **90° on screen**. *Visually:*
`S-litpole` is a textbook square grid. **The diagnosis is exactly right, and one fix does serve
both criteria.**

**Sequencing consequence they did not draw, and it is the most important line in this plan:**
fixing the cross frame changes the *screen* angle at which every crossed family composes, which
changes how much darker a crossed zone reads. **It will move T and F.** So the cross-frame fix must
land **before** F is re-tuned, or F gets tuned twice and the second tuning invalidates the first.

**Density stops — root cause ACCEPTED, verified in the source.** `surface-fill.js:485`:
`masterPitch = Math.min(tonePitch, o6Pitch)` where `o6Pitch = LIT_MAX_PITCH_PEN × penWidth × litCov`
is **independent of Density**. Below the crossover the `min` clamps and Density stops existing —
which is precisely the 3402 / 3402 / 3402 / 3980 / 5971 / 6739 they measured (span 1.98 : 1 against
2.5 : 1). Their reading of §0 is also right: §0 forbids going *tighter*, not sparser. **And their
reason for not landing it is sound** — it is the O6 floor, and O6 is currently failing. The right
fix is not to remove the floor but to make it bind **at the default Density** rather than clamp the
whole sparse range. Do O6 first.

**Item 10 (rebuild the ladder) — correctly not attempted.** They were told to stop; they stopped.

**Item 11 — accepted and well handled.** `capsule y = 30.00`, `lowpoly y = 2.00`: the objects
genuinely float, so the detached shadow is correct and it is the fixture. Leaving `F-trio`
untouched because it carries the protected C15 rows, and adding `F-trio-rest` alongside, is the
right call — it keeps a protected comparison comparable.

### RULING ON THE FLAGGED TRADE (O5 / O9) — the trade is REJECTED

They flagged it and asked: at sensitivity 1 the specular cone accepts **2 of the cube's 3 visible
facets**, looser than §5.4 #8's ≤ 8 %-of-silhouette bound; tightening it costs O9 its third state
on the cube. Knobs are `GLINT_REL` / `GLINT_ABS`.

**Tighten it.** A highlight occupying a whole cube face is not a highlight — it fails O5's ≤ 8 %
outright and it fails O8, because a blank face is bounded by the cube's own drawn edge rather than
by surrounding hatch. I can see it in `T-matrix-cube`: `perFace/blank`, `burst` and `altFill` each
leave a full face white. Losing a state on O9 is much the cheaper loss.

If a sub-facet glint region is out of reach this round, take the fallback: **keep the cone tight,
accept two distinct O9 states on the cube, and demonstrate the third on the low-poly**, whose
facets are small enough that a facet-set glint stays inside 8 %. And **measure it** — the cube's
highlight area as a percentage of lit silhouette does not exist as a number anywhere in this
harness, which is why the breach had to be caught by eye.

## 7. Totals and verdict

| | PASS | MARGINAL | FAIL |
|---|---|---|---|
| Cast shadow (15) | **15** | 0 | 0 |
| Object (28) | **18** | 5 | 5 |
| **Total (43)** | **33** | **5** | **5** |

**Round 6 was 27 / 9 / 7. Round 7 is 33 / 5 / 5 — +6 PASS, −4 MARGINAL, −2 FAIL.**
Movements: C2 M→P (four rounds), C5 M→P, C8 M→P, O2 M→P, O9 F→P, O11 F→P, O14 F→P, O15 F→P,
O20 F→M, O21 F→P. Against: O5 M→F, O6 P→F, O8 P→M, O17 M→F, O23 M→F, O3 P→M.

### VERDICT: **ACCEPT**

The three commits stand. **Do not revert anything, and specifically do not re-tune T/F back to
1.592** — that would restore a number produced by a modelling error.

ACCEPT is not "done": five criteria fail. It means the round's work is correct, its numbers
reproduce without exception, and its one act of disagreement was the right call. Every headline I
checked — C2's 1.33×, max(object) 0.531, O20's 6.09× and its monotonicity at all three band counts,
O21's 1.33×, the dispatch table's 6/6/6/6/3/3/4/4, `F-trio` 0.733, the whole protected list —
came back to the digit. The new instrument is sound where it is used. The RGR gap is closed with 32
real tests. And the two self-corrections were both volunteered before I could find them, one of
which cost the engineer a claim in their own commit message.

**What I found that they did not report:** O23 misses its bound at 0.72× with n = 1, in view R's own
output. O6 is under the **spec's** 0.10, not only under my 0.13. T/F's floor across the four
fixtures is 1.369, not 1.455. C5 and C8 both upgrade to PASS on the repaired instrument. The cube's
two *lit* faces are 0.005 apart at bands 3, which the max/min "spread" hides. The `facets.js`
ground term is a restated fixture. The false cross-stride sentence is still in `shadows.js`. And the
entire protected cast shadow is pinned by one row in one golden.

## 8. Round 8 plan — in priority order

**The ordering is load-bearing this time. 1 changes the ladder; do not tune the ladder before it.**

1. **P0 — the cross frame (O17 + O26 + C14-on-object).** Measure the +65° offset in the
   screen/tangent frame: choose the parameter-space direction whose **pushforward** is 65° from
   family A's pushforward, per sample. One fix, two criteria, and it removes the plaid the whole
   design forbids. **Re-print all four fixtures' T/F, F/M, R/F, D(L) afterwards — this will move
   them.**
2. **P0 — then rebuild F to its own bar.** Target **F/M ∈ [1.45, 1.70]** with T untouched; `FORM_INK.F.cross = 0.40` is the lever. Report T/F as a four-fixture range and expect ≥ 1.6 as a
   *consequence*. Second, separable defect: **F's cross must come off the silhouette** — running it
   to the contour is what flattens the limb.
3. **P0 — O6.** `D(L) ≥ 0.10` (the spec's own bar) on all four fixtures; ≥ 0.13 preferred. This is
   the spec's "check it first" criterion and it is failing on three of four.
4. **P0 — O5 / O8: tighten `GLINT_REL` / `GLINT_ABS`.** Ruling in §6. Add the missing instrument:
   highlight area as a percentage of lit silhouette, printed per view, for cube and low-poly.
5. **P1 — O23.** The faceted reflected ring: n = 1 at 0.72× against ≤ 0.6. Needs a fixture where
   the bottom ring resolves (apply the `W-bigball` move to the low-poly, or frequency 3) **and** a
   real lift on the down-facing facets.
6. **P1 — density stops**, after O6. Make `o6Pitch` bind at the **default** Density rather than
   clamp the whole sparse range. Target span ≥ 2.5 : 1 with all six stops distinct.
7. **P1 — O20 at bands 2 and 3.** 0.005 between the two lit faces is not three readable values.
   Score the **adjacent-lit-face difference**, not max/min spread.
8. **P1 — instrument repairs, all three:**
   (a) `facets.js` must take `ground` from `render.js`, not `{y0:0, height:2*46}`;
   (b) `facets.js` must pass the `terminator` override so its O22 line actually tests the dihedral
   gate;
   (c) **delete or migrate `cast.js`.** It still restates camera, sun and object list, and it
   currently prints `C1 0.44`, `C5 2.02`, `C8 0.81` and `C2 FAIL` — flatly contradicting `m4.js`
   on the same views. It is a live trap for the next reviewer.
9. **P1 — pin the cast shadow in a test.** A golden asserting per-zone ink at Layers 2/3/4
   (`Z0 1318.44/211` at each, `Off 16109.77`, the C11 triple). Right now one baseline row is all
   that stands between this branch and a silent cast-shadow regression.
10. **P2 — correct the false comment** above `collarCrossStrideFor` in `shadows.js`, and **measure
    C1/C2 at pen 0.5 and 0.8**, where the cross stride engages and the collar spends only 62 % of
    its budget (composed 0.498 against a 0.80 ceiling). Untested regime.
11. **P2 — O24 and O28 measured rather than argued.** O24 against the *new* glint predicate; O28 by
    running `facets.js` across `Gp-yaw-18/30` and printing the band **index** per facet.
12. **P2 — live verification.** Rebase or cherry-pick past `ee91289` so the object half can be seen
    in the running app at all. Until then no object criterion may be claimed live, and that is now
    the longest-standing open item on the branch.

### VIEWS STILL OWED

- **`W-lp-*`** — the low-poly at twice the radius. 17 of 40 visible facets are under the 4 mm
  window and the scored ones carry n = 1–6; per-facet D on the current geodesic is at the edge of
  what the protocol can measure. Enlarge the fixture, do not shrink the window.
- **A second cube fixture.** The entire faceted score (O19–O22, O28) rests on one cube orientation
  under one sun. `V-`/`W-` exist for the ball; the cube has no second column.
- **`R-cube-spec0` / `-spec3`** — O24 on the faceted path against the new glint predicate. Only the
  trio views sweep specular today.
- **A `bands 3` cube crop** showing the two lit faces side by side at ≥ 4×, so the 0.005 can be
  judged by eye and not only by number.
- **Live:** the object ladder with the dip on a real ball · `none` on an object with a highlight ·
  the cube's three faces at bands 4 · Softness swept. All still blocked on item 12.

### FOR JAY

The cast shadow is **complete on this branch: 15 of 15**, and it is bit-identical to what you saw in
`jay-layers/` — nothing about the ground changed this round. What moved is the object, and it moved
a long way: the cube finally reads as a lit solid (three faces, three values, correctly ordered),
every highlight treatment now does something different, and the object no longer out-inks the
contact shadow.

The one thing worth your eye rather than mine: on the ball, the form shadow has gained a second
hatch direction and now runs as a woven mesh all the way to the silhouette. It is darker and more
even than before, but the terminator no longer stands out as a band, and the mesh reads as fabric
in places. I have told the engineer to pull it back and to keep the cross off the contour. If you
look at `r7d/E-bands4.png` next to `r7base/E-bands4.png` and prefer the new one, say so and I will
change the target.
