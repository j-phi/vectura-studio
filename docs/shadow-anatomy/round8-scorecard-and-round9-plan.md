# Round 8 Scorecard + Round 9 Plan — shadow anatomy

**Status: COMPLETE.** VERDICT **ACCEPT** — **35 PASS / 4 MARGINAL / 4 FAIL** (R7: 33 / 5 / 5).

Reviewer: visual designer (Round 8)
Branch: `shadow-anatomy`, worktree `.claude/worktrees/agent-a71c6348dd322a40a`
Commits under review: `0b32ee5`, `d68c1ac`, `75b97a5`
Round 7 baseline: 33 / 5 / 5, merged to `3d-scene/p4` as `e66c692`, shipped v1.3.83.
**Round 8 is not merged.**

Movements: **O17 F→P**, **O3 M→P**, **O24 M→P**, **O23 F→M**; against, **C15 P→M** and
**O20 M→F**, both on the second cube fixture this round introduced.

---

## 0. Verdict — ACCEPT

The three commits stand. Do not revert anything.

Everything this round claims reproduces, on my own instruments, with **one exception**
(`max(object)`, §LOG-003). O17 is fixed — not merely re-measured, but **visibly** fixed: the plaid
in `pole-base.png` is a textbook square grid and it is gone in `pole-final.png`. F was rebuilt to
the band Round 7 set (F/M 1.555–1.661 against [1.45, 1.70]) with T untouched in source, and T/F
recovered as the consequence Round 7's arithmetic predicted (1.713–1.867). The protected list is
exact. The cast shadow is byte-identical and, for the first time, **enforceable** rather than
recorded in a review document.

And for the first time in this workstream **I verified the RED state myself** rather than accepting
provenance: a detached worktree at `98289be` with this round's three new test files copied in fails
**10 of 17**, exactly the four/two/four split the commits claim (§4).

ACCEPT is not "done": four criteria fail, one of them (O20) newly, and **100 of the harness's 120
views were never rendered at HEAD this round** on a change that touches every toned view (§6).

**Two claims are corrected as a condition of the ACCEPT, and the record must carry the corrected
version, not the submitted one:**

1. **`max(object)` did not improve. It regressed.** `0.529 → 0.498` is one fixture of four and the
   only one that fell; the four-fixture worst went **0.531 → 0.539** (§LOG-003).
2. **O23 is not a pass at 0.43×.** `facets.js` prints `[n < 3 — a ring, not a facet: treat as
   UNMEASURED]` on the very line the submission quotes (§3.2).

---

## 1. Scorecard

### Cast shadow — 14 P / 1 M / 0 F  (R7: 15 / 0 / 0)

The cast shadow's own geometry **did not move**: `r8audit-protected.js` at HEAD returns every
protected value to the hundredth, and `shadow-additive-default.json`'s `castShadow` section is
`191 paths / 4248.7242` at all four commits. C1–C14 are therefore carried on a structural argument
that is airtight this round — nothing on the shadow side *could* have moved. What fell is C15,
which is a whole-drawing plot-safety criterion that happens to live in the cast-shadow block.

| | verdict | number |
|---|---|---|
| C1 | PASS (carried) | cast geometry bit-identical; verified per zone at HEAD. |
| C2 | PASS | `max(Z0)/max(object)` — Z0 unchanged, `max(object)` 0.531 → **0.539**, so the ratio falls **1.33× → 1.31×** against a ≥ 1.25 bar. Holds; **margin narrowed from 6.4 % to 4.8 %**. |
| C3 | **PASS — and now ENFORCED** | `Z0 = 1318.44 mm / 211 paths` identical at Layers 2/3/4, verified by me and pinned by `scene3d-cast-shadow-zones.test.js`. |
| C4 | PASS (carried) | |
| C5 | PASS (carried) | |
| C6 | **PASS — now ENFORCED** | Z2 carves 6521.76 → 5802.40 → 3735.33; asserted in the new test. |
| C7 | PASS (carried) | |
| C8 | PASS (carried) | |
| C9 | PASS (carried) | |
| C10 | PASS (carried) | |
| C11 | **PASS — now ENFORCED** | 7840.20 / 8896.92 / 7448.60, ±25 % of mean, asserted. |
| C12 | **PASS — now ENFORCED** | `Off` = 16109.77 mm / 535 paths, asserted. |
| C13 | PASS (carried) | |
| C14 | **PASS — and now on the merits, not the wording** | R7 passed C14 on its literal Z0/Z1 text while recording that the square grid it forbids was unambiguously present on the object. **That grid is gone**: 0 % of crossed windows reach 80° on all four fixtures, and I confirmed it by eye. C14's spirit is now met. |
| C15 | **MARGINAL (was PASS)** | **`R2-cube-bands4` face `+X` measures D 0.891 over 7 windows** — past the ≥ 0.80 clause. 0.867 at bands 3, 0.841 at bands 2, so it breaches at **every** band count. The ≥ 0.90 clause still holds at HEAD (0.891) but did **not** before this round (0.949 — I reproduced both, §3.3). Not scored FAIL because the round moved it the right way, surfaced it itself, and the breach is on a fixture that did not exist when C15 was last scored. **But C15 as written is unmet and the record must stop saying "cast shadow 15/15".** |

**The cast shadow's own 14 criteria remain 14/14 and bit-identical.** What is no longer true is the
headline "15 of 15". Say the accurate thing: *the cast shadow is complete and untouched; the
plot-safety criterion that sits beside it is breached, by the object, on a new fixture.*

### Object shading — 21 P / 3 M / 4 F  (R7: 18 / 5 / 5)

| | verdict | number |
|---|---|---|
| O1 | **PASS** | T/F **1.713 / 1.748 / 1.795 / 1.867** across four fixtures (bar ≥ 1.25). Worst-fixture margin **37 %**, up from 9.5 %. Re-rendered by me. |
| O2 | **PASS** | R/F **0.280 / 0.287 / 0.368 / 0.401** (≤ 0.60), n = 50 / 58 on the big ball. |
| O3 | **PASS (was MARGINAL)** | T 0.404 > F 0.216 > R 0.080; F/M **1.555–1.661** inside [1.45, 1.70]. **And I looked**, which is what O3 is: `r8base/o3-limb-base.png` vs `r8final/o3-limb-final.png` at 4× on `E-bands4`. Before, the crossed weave runs out to the contour and the ball reads as one fabric limb-to-terminator. After, the outer band along the silhouette is a **single family of meridians compressing toward the contour** — the classic sphere limb — and the terminator separates as a legible dark band inland of it. This is the criterion Round 7's ruling was spending and it has been bought back. |
| O4 | PASS (carried) | |
| O5 | **FAIL (carried)** | Glint tightening **not landed** — declared, not attempted. The cube's highlight area as a % of lit silhouette **still does not exist as a number** anywhere in the harness; R7 ordered that instrument and it was not built. |
| O6 | **FAIL (carried) — reclassified from "tuning miss" to "spec/implementation contradiction"** | D(L) **0.072 / 0.072 / 0.082 / 0.092** against the spec's ≥ 0.10. **Arithmetically unreachable — verified against source.** Full ruling §3.1. |
| O7 | PASS (carried) | |
| O8 | MARGINAL (carried) | Same root cause as O5; untouched. |
| O9 | PASS (carried) | |
| O10 | PASS (carried) | |
| O11 | PASS (carried) | |
| O12 | PASS (carried) | |
| O13 | **PASS** | `max(object)` worst **0.539** < collar max 0.705. Holds; margin narrowed (§LOG-003). |
| O14 | PASS (carried) | |
| O15 | PASS (carried) | |
| O16 | PASS (carried) | |
| O17 | **PASS (was FAIL)** | Screen crossing angle over T/F windows, my own render, all four fixtures: **p10 65 · median 65 · p90 65 · max 70 · ≥ 80°: 0 (0 %) · within 65 ± 10°: 100 %**. Was median 70 / p90 85 / max 90, 13 % and 6 % ≥ 80°, 63 % / 71 % in band. **And it is visible**: `pole-base.png` is an unmistakable square plaid; `pole-final.png` is a consistent oblique lozenge weave with no square cells, and `S-litpole-final.png` agrees. Pinned by 5 tests, 4 of which I confirmed RED at `98289be`. **The strongest single result of the round.** |
| O18 | PASS (carried) | |
| O19 | PASS | three readable values on both cube fixtures. |
| O20 | **FAIL (was MARGINAL)** | Two independent reasons, and the second is new. (a) **Not landed**: the adjacent-*lit*-face differences on `R-cube` are **0.021 / 0.005 / 0.030** at bands 2/3/4 — reproduced by me, unchanged from R7. (b) **New**: on `R2-cube` the facets are **out of order in N.L at all three band counts** — `+Y` at N.L 0.643 → D 0.024, `+Z` at N.L 0.000 → D 0.186, `+X` at N.L 0.053 → **D 0.891**. §5.5.1 says a facet out of order with its neighbours' N.L **is a bug**, and the instrument prints `NO — OUT OF ORDER` in as many words. |
| O21 | **PASS — and now genuinely measurable** | `W-lp` lifts the scored-facet count from 23 to 55–58 and the T set from n=5 to **n=15 / n=19**: **1.43× / 1.57×** against ≥ 1.25. `R-lp-bands4` also improved to 1.48×. This is the R7 "enlarge the fixture, do not shrink the window" instruction executed correctly. |
| O22 | **PASS — strengthened** | `T: none` on **both** cube fixtures at every band count, under **two different suns and yaws**. And the dihedral gate is now actually exercised: the repaired instrument reports `smooth-shaded facets 0/6` on the cube and `180/180` on the geodesic. R7's O22 line was decorative; it no longer is. |
| O23 | **MARGINAL (was FAIL)** | Ruling §3.2. The number moved the right way but **cannot be scored**: n = 2 on `W-lp`, under the instrument's own n ≥ 3 bar, printed as UNMEASURED on the same line. And on the fixture R7 scored it on, it got **worse**: `R-lp-bands4` 0.72× → **0.78×**, because R is untouched (0.159) and F fell (0.221 → 0.204). Not reported. |
| O24 | **PASS (was MARGINAL)** | `R-cube-spec0/spec3` and `R-lp-spec0/spec3` delivered against the **new** glint predicate and distinct on both objects: 60 → 39 paths on the cube, 347 → 278 on the low-poly, 4 distinct md5s. The gap R7 named is closed. |
| O25 | PASS (carried) | |
| O26 | **FAIL (carried)** | Band boundaries still traceable as edges; visible as an arc transition in `S-litpole-final.png` and at the upper right of `pole-final.png`. **And a record-keeping defect: `0b32ee5`'s subject line claims "(O17, O26)" while its body measures only O17.** There is no O26 number anywhere in this round and no O26 instrument exists. A criterion named in a commit subject without a measurement is the exact failure this workstream keeps repairing. |
| O27 | MARGINAL (carried) | |
| O28 | PASS (carried) | Structural argument intact, nothing touched it. **Third round running as an unmeasured PASS** — the `Gp-yaw*` views exist in `render.js` and `facets.js` was never run on them. If Round 9 leaves it unmeasured again it should be downgraded. |

### Totals

| | PASS | MARGINAL | FAIL |
|---|---|---|---|
| Cast shadow (15) | **14** | 1 | 0 |
| Object (28) | **21** | 3 | 4 |
| **Total (43)** | **35** | **4** | **4** |

---

## 2. Instrument audit

**Standing rule: a harness reads its fixture from `render.js` and never restates it. Broken three
times before this round. It is now broken a fourth time — declared, but broken.**

### `facets.js` — both Round 7 repairs landed and both are real

- **(a) The ground is the object's own.** `{ y0: 0, height: 2*46 }` is gone; `groundOf` is the
  min/max world y of the assembled `world[]`. I checked this against the renderer's `recordGround`
  (`scene3d.js:464`) — same quantity, computed the same way. Printed values match R7's measured
  reality exactly: `R-cube` `y0 0.0 h 62.0`, `R-lp` `y0 2.0 h 80.0`. **Correct.**
- **(b) The dihedral gate is now tested.** `terminator: false` is passed for any facet outside the
  mirrored smooth set, which is what R7 said made the old O22 line decorative. The instrument now
  reports `0/6` on cubes and `180/180` on geodesics, matching the renderer's structure. **Correct
  — with one latent defect below.**
- **(c) O23 is printed**, with an honest self-limiting caveat (`n < 3 → UNMEASURED`). Adding a
  guard that can veto your own pass is good instrument design and it is what let me rule §3.2
  against the submission using the submission's own output.

**Latent defect — `TERMINATOR_SMOOTH_DEG = 40` is mirrored, not read.** `facets.js:89` copies the
constant with the comment `scene3d.js:556 — mirrored, not guessed`. Honest, and inert today. But a
mirrored constant is a restated fixture with extra steps: change the renderer's threshold and the
instrument silently diverges while still printing a number. Round 9 must expose it (or the whole
`smoothShadedFaces` predicate) from the module and read it.

**Second latent difference.** The instrument builds its smooth set from its own edge map over
`f.indices`; the renderer builds it from `record.edges`. They agree on these fixtures. They are not
the same code path, and nothing tests that they stay in agreement.

### `r8audit-protected.js` — sound, and it exposes a Round 7 review defect

Reads `p.meta.sceneTarget.regionClass` / `.shadowLayer` (the real locations), takes the fixture
from `render.js`, compares against R7's values, and prints `<<MOVED` per row. I ran it: intact.

**And the engineer is right about my predecessor.** I ran `r7audit-protected.js` unchanged at HEAD:

```
A-off  paths 860  totalInk 26008.99  cast 0.00mm/0p
A-2    paths 753  totalInk 17739.43  cast 0.00mm/0p
A-3    paths 1160 totalInk 18796.15  cast 0.00mm/0p
A-4    paths 1524 totalInk 17347.83  cast 0.00mm/0p
```

**Zero, on every view.** The Round 7 scorecard §4 lists `r7audit-protected.js (new, mine)` among
the things the reviewer ran and presents a per-zone table as its output. That table cannot have
come from that script. **A reviewer's own verification instrument was broken, in the round whose
headline finding was "instruments that exclude what they measure", and the reviewer did not
notice.** The values were right — I re-verified them today — so nothing shipped wrong in v1.3.83.
But the verification behind the ACCEPT that merged Round 7 was not the verification it claimed.
**Round 9 rule: the reviewer's own probes get a mutation check (feed them a known-bad input and
confirm they say so) before their output may be quoted.**

### `r8lad.js` / `r8probe-o17.js` / `r8probe-limb.js` — sound

Fixture from `render.js` throughout. The O17 instrument reads a **length-weighted orientation
histogram off the emitted paths** and never asks the renderer what angle it intended — that is the
right shape for a criterion stated about the eye. `r8probe-limb.js` classifies by `nz`, the
camera-space normal z, which is exact on the silhouette and assumes no radius, bbox or projection.
Both reproduce.

### `r8probe-max.js` — valid only for its D column, and that is not stated

It reads a **stored** `density.json` while building paths at **current** source. Its D / zone / nz
columns are sound (D is stored; zones and normals did not move this round). Its **ink** column is
not — it is the current drawing's ink against a stored raster, which is the precise defect the
engineer self-corrected on their session-limit probe (§4.1) and then left live in this script.
Inert here because I quoted no ink from it. Add the guard.

### The new tests restate the fixture — a fourth breach, this one declared

`scene3d-cast-shadow-zones.test.js` hardcodes BOUNDS, CAMERA, SUN, TONE4, BALL and POST, with the
comment *"restated here ONLY because tests/ cannot import from a scratch directory; the values
below were produced by `render.js` and agree with it to the hundredth."* True today — I confirmed
both sides. But this test is now **the only enforcement of the protected cast shadow**, and if
`render.js`'s A-view ever moves, the test keeps passing on a scene nobody renders. **Round 9: lift
the A-view into a shared fixture module both `render.js` and `tests/` import.** The declaration is
honest; the durability is not there.

---

## 3. The three rulings

### 3.1 O6 — the engineer is right. The arithmetic is exact. **The spec holds; the implementation gives; and the named fix is not the one they proposed.**

**Checked against source, not accepted:**

- `surface-fill.js:121-122` — `TOTAL_DARK_CEIL = 0.47`, `DARKEST_WEIGHT = 2.0`.
- `regions.js:619` — `FORM_INK.L = { coverage: 0.42, cross: 0 }`, so L's weight is **0.42**.
- `surface-fill.js:747` — `ceil = TOTAL_DARK_CEIL * clamp(weight / DARKEST_WEIGHT, 0, 1)`.

`0.47 × 0.42 / 2.0 = 0.0987`. **The lit zone's composed ceiling is 0.0987, below the spec's own
0.10, before a single line is drawn.** Measured D(L) 0.072–0.092 is 73–93 % of it. The engineer's
arithmetic is exactly right and O6 is **unreachable, not unmet**. No amount of tuning inside the
current law reaches it.

**Which gives? The spec holds.** `D(centre light) ≥ 0.10` is a **legibility floor** — a lit surface
must carry visible tone rather than blank paper — and a legibility floor does not lose to an
internal budget constant. So O6 stays on the board at ≥ 0.10 and the implementation must move.

**But not the way the submission proposes.** "The ceiling law must change, which moves the whole
ladder" is the expensive reading, and I checked the alternatives before ruling:

- **Raise `L.coverage`.** To reach 0.10 on the *worst* fixture (73 % saturation) you need a ceiling
  of ~0.137, i.e. `L.coverage ≈ 0.58` against `M.coverage = 0.62`. L/M goes 0.68 → 0.94 and the
  lit→halftone step closes. **Rejected — it trades O6 for O4/O7.**
- **Raise `TOTAL_DARK_CEIL`.** 0.47 → 0.55 scales every zone; `max(object)` goes 0.539 → ~0.63,
  breaching the protected 0.56 and taking C2 and O13 with it. **Rejected outright.**
- **Give the linear ceiling a companion FLOOR that binds only where it falls under the spec's own
  minimum readable value.** This moves L (and only L — H is 0.00 by contract and stays there),
  leaves M/F/T/R and the whole crossed-zone composition alone, and cannot touch `max(object)`,
  which is set at the T end. **This is the fix.** The comment at `surface-fill.js:741` warns that a
  *flat clamp at the top* collapsed T and F onto one value; a **floor at the bottom** is a
  different constraint with no such interaction.

**And the mechanism intended to do exactly this already exists and is dead.**
`LIT_MAX_PITCH_PEN = 12`, commented *"§5.4 #1 / O6 — the centre light may never be blanker"*,
yields `o6Pitch = 12 × pen × 0.42 = 5.04 × pen` — a D floor of ~0.198. It never survives to paper,
because it is stated as a **pitch** and the composed-coverage cap then drops roughly half the lines
it laid down. **That is "a cap stated on a proxy one transform away from the metric" — the same
error the collar took three rounds to shed — running in the opposite direction.** O6's floor must
be restated where O6 is measured: on **composed coverage**, not on pitch.

**O6: FAIL, carried. Reclassified. Round 9 P0 with a named fix and a named dead mechanism to
delete.** The engineer was right to stop and ask rather than tune; they were right about the
arithmetic; they overstated the cost of the fix.

### 3.2 O23 — the `W-lp` fixture is **legitimate**, and it is **not sufficient**. The claimed pass is retracted.

**The fixture is legitimate.** `W-lp` is precisely the move Round 7 ordered — "apply the
`W-bigball` move to the low-poly … enlarge the fixture, do not shrink the window" — and it
demonstrably works for the problem it was ordered for: scored facets 23 → 55–58, T facets 5 → 15
and 19, O21 from a single-fixture 1.33× to 1.43× / 1.48× / 1.57×. That is a fixture doing its job.
It changes radius **and** frequency at once, which is a confound, but both changes serve the same
stated purpose and neither is chosen to flatter a number.

**It is not sufficient for O23, and the instrument says so.** On both `W-lp` views the reflected
set is `n = 2` (`face:93`, `face:94`), and `facets.js` prints, on the same line the submission
quotes as a pass:

```
O23  D(reflected) 0.093 (n=2) / D(form) 0.215 = 0.43x   need <= 0.60   OK
     [n < 3 — a ring, not a facet: treat as UNMEASURED]
```

**The submission quoted the `OK` and dropped the bracket its own instrument printed.** By the
harness's own rule this is unmeasured, and the same rule voided R7's 0.72× at n=1.

**And the diagnosis is wrong about the cause, which is why enlarging did not fix it.** The
engineer's own account is that the camera pitches down so the bottom ring is **back-facing and
culled**. Enlarging a fixture cannot make a culled face visible — and indeed n went 1 → 2, not 1 →
a ring. **O23 needs a visibility change, not a size change:** lower the camera elevation, or tilt
the object, so the down-facing ring is front-facing. Round 9 must do that, not enlarge further.

**Also unreported: the F rebuild made O23 worse where R7 measured it.** `R-lp-bands4` went
**0.72× → 0.78×** because R's ink is untouched (D 0.159, `face:42`, unchanged) while F fell
(0.221 → 0.204). Lowering F raises R/F mechanically. On the curved side this is harmless (O2 is
0.28–0.40). On the faceted side it moved the criterion away from its bound on the only fixture that
had ever scored it, and the submission reported only the new fixture.

**A side note worth Round 9's attention:** every fixture O23 is scored on (`R-lp-*`, `W-lp-*`)
builds with `ground: { enabled: false }`. The reflected lift's *proximity* term uses the object's
own bbox, so the measurement is not invalid — but a reflected lift is light bouncing off a surface
that is not drawn, so the criterion can never be judged by eye on these views.

**O23: MARGINAL (was FAIL).** Upgraded because the evidence now points the right way and the
fixture work was ordered and done well; not PASS because it cannot be scored.

### 3.3 P0 — `R2-cube-bands4` `+X` at D 0.891. Verified, pre-existing, and worse before. **It is a bigger finding than reported and it belongs at the top of Round 9.**

**Verified, all of it, by re-running `facets.js` myself on both directories:**

| | `r8chk` (before) | `r8r8` (HEAD) |
|---|---|---|
| `+Y` (zone M, N.L 0.643, 2037 mm²) | 0.024 | 0.024 |
| `+Z` (zone F, N.L 0.000, 3242 mm²) | 0.209 | 0.186 |
| `+X` (zone F, N.L 0.053, **341 mm²**) | **0.949** | **0.891** |

`+Y` is byte-stable (zone M, untouched); the two F faces both fell. **That is a clean attribution
signature and it corroborates "pre-existing and worse before" exactly.** The engineer's 0.949 is
real and `r8chk/` is the artefact that proves it. It floods at every band count (0.841 / 0.867 /
0.891), so it is not a bands-4 artefact.

**What they did not say, and it is the diagnosis.** `+X` and `+Z` are **the same zone with the same
ink recipe** — both F, both N.L ≈ 0 — and they differ by **4.8×**. Nothing about tone, light or
budget can produce that. The only difference between them is **projected area**: 341 mm² against
3242. The composed cap (`myCeil × localPitch / penWidth`) is computed against the **surface**
pitch, so a face turned nearly edge-on has its projected pitch collapse under the cap without the
cap ever seeing it. **This is the workstream's signature bug for the fourth time: a cap stated on a
proxy one transform away from the metric.** The fix has the same shape as the collar's and O6's —
state the cap on the **screen-space** pitch, which is where D is measured.

Also worth stating plainly: the ladder's own ceiling for zone F is
`0.47 × 1.02 / 2.0 = 0.240`. Measured 0.891. **The budget is not merely exceeded on this face, it
is bypassed by a factor of 3.7** — the composed-coverage system, the round's own central
achievement, does not bind here at all.

**Sequencing.** It is P0 for Round 9 and it is **first**, ahead of O6:
- It is the only breach of an **absolute plot-safety** bound (C15, ≥ 0.80) — 7 windows at 0.89 is a
  pen sitting in a puddle, physical harm, not an aesthetic miss.
- It is **three criteria at once** (C15, O20 ordering, and the object ceiling at 0.891 vs 0.56).
- Fixing it moves nothing else: it is a cap correction on a degenerate projection, not a ladder
  change. O6 by contrast moves the L zone and must be re-measured on all four fixtures afterward.
- The engineer was **right not to rush it.** A fix attempted at the end of a round, on the term
  that governs every zone, with 100 views unrendered, is how this branch would have acquired a
  silent regression. Reporting it with a reproduction and a before-value is the correct disposal.

---

## 4. The four self-corrections — each audited

**All four are real. Two I verified directly, two I verified structurally. None is narrative.**

### 4.1 The session-limit checkpoint, disproved by measurement — CONFIRMED, and it is the best of the four

`dc6cb78` is a WIP checkpoint carrying a conclusion the engineer then **disproved rather than
acted on**: their probe had rebuilt paths at current source while reading a **stored** directory,
so its ink column was never a valid before/after. **I confirmed the mechanism independently** —
`r8probe-max.js` has exactly this shape, and its ink column is invalid for the same reason (§2).
Declining to act on your own checkpoint because you can show the instrument behind it was invalid
is the single hardest thing to do in this loop.

### 4.2 The caustic — CONFIRMED structurally, and the disproof is the load-bearing part

The claim: integral curves of a folding direction field run together onto one locus, producing a
solid black curve across the lit pole, D 0.433 → 0.688 against a 0.56 ceiling; and a *plausible*
fix (a more conservative per-ruling pitch estimate against line i±1) made it **worse**, 0.644 →
0.688, which is what ruled the estimate out. The final fix spaces on **screen** (Jobard–Lefebvre:
a ruling stops within half the plot floor of one already laid down).

I cannot re-run their intermediate states without their working tree, so this is accepted on the
artefacts plus the source, which is consistent: the streamline seeding and the arc-length binding
are both present in `0b32ee5`, `max(object)` on `W-bigball` is 0.498 at HEAD, and the reasoning is
correct — a caustic is a property of the field's topology, so a *local* neighbour test cannot see
it, and tightening a local test spends budget without removing the fold. **The disproof is what
makes this a finding rather than a story: a fix that made the number worse is evidence, and they
led with it.**

### 4.3 Retracting their own "inland ≥ 0.30" bar — CONFIRMED, and the replacement bar is sound

Claim: they wrote `> 0.30` without measuring; it was already unmet at r=92 before the taper existed
(0.267), so it never tested the taper; halving F.cross took it to 0.206. Replaced with a
**gradient + presence** assertion, with the absolute level moved to the F clause of the cross-frame
test.

**Verified RED at `98289be`, and the replacement bar is discriminating, not decorative:**

```
r=46: the cross is still there away from the contour   expected 0.782 to be greater than 1
r=92: the cross is still there away from the contour   expected 0.507 to be greater than 0.667
```

Both fail before the taper and pass after. A replacement bar that is red on the old code is a real
bar. **This is the correct way to retract a test bar — in place, red-proved, with the absolute
level rehoused rather than dropped.**

### 4.4 Retracting the ladder instrument that scored partly-off-page windows as D = 0 — CONFIRMED

Claim: a 4 mm window only partly on the page has less paper to be dark; the 92 mm ball overruns the
top of the 220 mm page **exactly where T sits**; counting those as D = 0 reported T/F 0.87 where
the harness measures 1.35. The rule is now "wholly on the page or not scored".

Corroborated by the data: my own re-render puts `W-bigball-bands4`'s darkest windows at
`y = 0`, `y = 4`, `y = 8`, `y = 12` — the ball is against the page edge precisely where the
terminator runs, so the failure mode is real and it biases **against** the thing being measured.
Finding an instrument bug *while writing a test that would have passed either way* is the pattern
this loop is supposed to produce.

**Ruling on the four: the behaviour is genuine and the record should say so.** Two of these
corrections cost the engineer a claim in their own commit message and one cost them a bar in their
own test. What is missing is the fifth correction they did **not** make — `max(object)`
(§LOG-003) — which is the same class of error as the ones they caught, and which I found rather
than they did.

---

## 5. Protected list — RE-VERIFIED BY ME. Nothing regressed.

Run at HEAD (`75b97a5`) through `r8audit-protected.js`, fixture from `render.js`:

```
A-off  cast 16109.77 mm / 535 p                                        OK
A-2    cast  7840.20 mm / 428 p   Z0 1318.44/211  Z2 6521.76/217       OK
A-3    cast  8896.92 mm / 835 p   Z0 1318.44/211  Z1 1776.09/355  Z2 5802.40/269   OK
A-4    cast  7448.60 mm /1199 p   Z0 1318.44/211  Z1 1750.32/348  Z2 3735.33/239  Z3 644.51/401   OK

PROTECTED LIST: intact.
```

- **Z0 = 1318.44 / 211 at every layer count.** Holds.
- **`shadow-additive-default.json` castShadow = 191 paths / 4248.7242** at `98289be`, `0b32ee5`,
  `d68c1ac` and `75b97a5`. Byte-identical.
- **21 goldens, each justified.** `0b32ee5` moves 9 — every `sphere-*` plus
  `parity-box-and-sphere`, and **zero `box-*`**, which is exactly right for a curved-fill change.
  `d68c1ac` moves 21 — those 9 plus 10 `box-*` plus `shadow-inverse` and
  `shadow-additive-default`, which is exactly right for a `FORM_INK` change under the I27 parity
  contract. `75b97a5` moves none, and its `shadows.js` diff really is comment-only (I filtered the
  diff: zero non-comment lines).
- **The retracted sentence is out of the source.** `shadows.js:847` now reads *"It is not 1 at
  every shipped pen and density"*.
- **Tests:** the four new files pass, 24 tests, Node 20. Claimed unit 3788 / visual 110 not
  independently re-run in full (I ran the four new files plus the RED check); the RGR provenance
  R7 accepted on trust is now proved (§0, §4.3).
- **`max(object) ≤ 0.56`** — newly protected in R7 at 0.531. **Moved to 0.539.** Still inside.
  See LOG-003; this is the one protected value that drifted.

### NEWLY PROTECTED (Round 8)

1. **O17: 0 % of crossed T/F windows at ≥ 80°, median 65°, on all four fixtures.** Pinned by
   `scene3d-cross-frame.test.js`. This is the round's headline result and nothing may re-earn the
   plaid.
2. **F/M ∈ [1.45, 1.70] and T/F ≥ 1.25 as four-fixture ranges**, pinned by
   `scene3d-form-ladder.test.js`. T's `FORM_INK` row (`coverage 1.00, cross 1.00`) is protected —
   the ladder is now moved from F, not from T.
3. **The limb taper**: F-zone windows carrying two families at nz < 0.30 ≤ 15 %, with the inland
   gradient. Pinned by `scene3d-form-shadow-limb.test.js`.
4. **The per-zone cast shadow is now enforced in `scene3d-cast-shadow-zones.test.js`**, mutation-
   proved. The R7 protection gap is closed. **Its restated fixture is the new risk (§2).**
5. **`+Y` on `R2-cube` = D 0.024 at every band count** — the zone-M control that made the `+X`
   attribution clean. Keep it as the control.

---

## 6. What was NOT landed

| item | status |
|---|---|
| **O5 / O8 — glint tightening** (`GLINT_REL`/`GLINT_ABS`), R7 P0 #4 | **Not attempted.** Not declared as a deferral in any commit either. |
| **The missing O5 instrument** — highlight area as % of lit silhouette, per view, cube + low-poly | **Not built.** Ordered by R7. The breach still has to be caught by eye. |
| **Density stops** (R7 P1 #6) | **Correctly not landed** — gated on O6, and O6 is now shown unreachable. Sequencing stands; it moves behind the O6 fix. |
| **O20 at bands 2/3** | **Not landed.** Adjacent-lit-face differences still **0.021 / 0.005 / 0.030**, reproduced by me. |
| **O24 measured** | **Landed** — upgrade to PASS. |
| **O28 measured** | **Not landed.** Third round owed. |
| **`cast.js` deleted or migrated** (R7 P1 #8c) | **Not verified as done.** It is no longer in `shadowanatomy/`, so it appears removed; no commit records it. Confirm in Round 9. |
| **C1/C2 at pen ≥ 0.5** (R7 P2 #10) | **Not measured.** The enumeration is now in the comment; the regime is still untested. |
| **Live verification** | **Still blocked.** No object criterion has been seen in the running app for four rounds. Longest-standing open item on the branch. |
| **The full-harness render** | **NOT DONE, and this is the round's largest evidence gap.** `render.js` defines **120 views**; Round 8 rendered **20** across `r8final`/`r8facets`/`r8r8`/`r8chk`. `d68c1ac` changed `FORM_INK`, which reaches **every toned view**. 100 views are unobserved at HEAD. (The brief's "190-view" figure is stale — the harness is 120.) |

---

## 7. Round 9 plan — priority order

**The ordering is load-bearing. 1 is a cap correction that moves nothing else; 2 moves the L zone
and must be re-measured on four fixtures; 6 must run last because it observes everything above.**

1. **P0 — the edge-on face floods (`R2-cube` `+X`, D 0.891).** State the composed-coverage cap on
   the **screen-space** pitch, not the surface pitch. Proof it is the right diagnosis: `+X` and
   `+Z` are the same zone with the same recipe at 341 vs 3242 mm² and differ 4.8×. Fixes C15, O20's
   ordering, and a 3.7× bypass of the object ceiling at once. **RGR: the red test is
   `D(+X) ≤ 0.56` on `R2-cube-bands2/3/4`.**
2. **P0 — O6, as ruled in §3.1.** Give the ceiling law a **floor** that binds only where the linear
   law falls under the spec's minimum, applied to the L zone. **Delete or restate
   `LIT_MAX_PITCH_PEN`** — it is a dead floor stated on a pitch. Target D(L) ≥ 0.10 on **all four**
   fixtures with L/M and M/F steps intact; re-print the whole four-fixture ladder afterward.
3. **P0 — O20 at bands 2 and 3.** 0.005 between two lit faces is not three values. Score the
   **adjacent-lit-face difference**, not max/min spread, and add it to the test suite so it cannot
   silently sit at 0.005 for a third round.
4. **P0 — O5 / O8, and build the instrument first.** Highlight area as a % of lit silhouette,
   printed per view for both faceted objects. R7 ordered it; it does not exist; the breach is still
   eye-only. Then tighten `GLINT_REL` / `GLINT_ABS` per R7's ruling, which stands.
5. **P1 — O23, by VISIBILITY not size.** Lower the camera or tilt the object so the down-facing
   ring is front-facing; n ≥ 3 is the harness's own bar. Also re-check `R-lp-bands4`, which the F
   rebuild moved 0.72× → 0.78×. Consider scoring it on a view that draws the ground.
6. **P1 — render all 120 views at HEAD and diff against `r7d`.** Non-negotiable before any merge
   into `3d-scene/p4`: `FORM_INK` moved and 100 views have not been looked at.
7. **P1 — O26 gets an instrument and a number,** or its mention comes out of `0b32ee5`'s subject
   line. Band boundaries traceable as edges: measure the D step across a band boundary against the
   D gradient within a band.
8. **P1 — instrument repairs.** (a) `facets.js` must **read** `TERMINATOR_SMOOTH_DEG` /
   `smoothShadedFaces` from the module, not mirror it. (b) `r8probe-max.js` must refuse to print
   its ink column when the stored directory's provenance differs from HEAD. (c) Lift the A-view
   fixture into a module `render.js` and `tests/` both import, so
   `scene3d-cast-shadow-zones.test.js` stops restating it. (d) Confirm `cast.js` is gone.
9. **P1 — density stops**, now unblocked in principle but sequenced after item 2. Make `o6Pitch`
   bind at the **default** Density rather than clamp the sparse range. Target span ≥ 2.5 : 1, six
   distinct stops.
10. **P2 — O28 measured**, by running `facets.js` across `Gp-yaw18/30` and printing the band
    **index** per facet. Third round owed; downgrade it if it slips again.
11. **P2 — C1 / C2 at pen 0.5 and 0.8**, where the cross stride engages and the collar spends ~62 %
    of its budget. Untested regime, now enumerated but still unmeasured.
12. **P2 — live verification.** Rebase or cherry-pick past `ee91289`. Until then no object
    criterion may be claimed live.
13. **P0, process — restore the contract documents (§LOG-000).** `design-shadow-anatomy.md` does
    not exist on disk and there is no `round8-submission.md`. Re-derive the spec into
    `scratchpad/shadowanatomy/` and require a criterion-indexed submission file per round. Every
    ruling in this scorecard is made against a reconstruction.
14. **P1, process — the reviewer's probes get a mutation check** before their output is quoted
    (§2). Round 7's protected-list verification was produced by a script that printed zeros.

### VIEWS STILL OWED

- **A `bands 3` cube crop at ≥ 4×**, both lit faces side by side, so 0.005 can be judged by eye.
  Owed since Round 7, still not delivered — and `r8crop.js` exists, so it costs one command.
- **The full 120-view render at HEAD**, with a diff against `r7d` (item 6).
- **A crop of `R2-cube` `+X` at ≥ 8×**, so the flooded sliver is in the record as an image and not
  only as 0.891. *(I have looked at `r8r8/R2-cube-bands4.png` at full frame: the sliver reads as a
  solid black stripe down the cube's right edge — it is not subtle, and it looks like a drawn
  border rather than a shaded face.)*
- **`Gp-yaw18` / `Gp-yaw30` through `facets.js`** with band index per facet (O28).
- **Live:** the object ladder with the dip on a real ball · `none` on an object with a highlight ·
  the cube's three faces at bands 4 · Softness swept. All blocked on item 12.

---

## 8. For Jay

**The ball got much better and I would look at one pair of images.** Open
`r8base/o3-limb-base.png` next to `r8final/o3-limb-final.png`. Before, the shaded side of the ball
was a woven fabric running right out to the edge and the terminator had stopped reading as a band —
that is the thing I told the engineer to pull back last round. After, the outer edge is a single
family of curves that tighten toward the rim, the way a drawn sphere should, and the dark band sits
inside it as a shape you can see. That is the fix I asked for and it landed.

**The second pair is `r8base/pole-base.png` vs `r8final/pole-final.png`.** The first is a square
plaid — the two hatch directions meeting at right angles, which is the one thing the design
document forbids by name. The second is a proper oblique weave. This had been wrong from the
beginning and nobody could see it until the lit pole was cropped.

**One thing is worse and one thing is newly visible.**

- The cube grew a second test angle this round, and at that angle **one face is turned almost
  edge-on and floods to solid black** — a hard black stripe down the cube's right edge that looks
  like a drawn border, not a shaded face. It is not new (it was worse before), but it is now
  measured: it is the darkest thing in the drawing by a wide margin, darker than the contact
  shadow, and dark enough that a real pen would sit in a puddle there. It is first in the queue.
- The object's darkest patch drifted slightly the wrong way — still safely inside the bound, but
  the headline said it improved and across all four test images it did not.

**The ground is untouched.** Everything you saw in `jay-layers/` is bit-identical, and it is now
locked by a test rather than by a paragraph in a review document, which was the gap I flagged last
round.

---

## APPENDIX — verification log

## LOG-000 — TWO CONTRACT ARTEFACTS ARE MISSING FROM DISK (found before any scoring)

Checked at review start, 2026-08-14:

- **`scratchpad/shadowanatomy/design-shadow-anatomy.md` — DOES NOT EXIST.** The
  spec I was told is "your contract" is not on disk anywhere. Searched
  `/private/tmp/claude-501/**` and the whole repo (`find -iname "*shadow-anatomy*"`
  returns only `tests/unit/scene3d-shadow-anatomy.test.js` in three worktrees and
  the git ref). The only `.md` files in `shadowanatomy/` are
  `round6-scorecard-and-round7-plan.md`, `round7-scorecard-and-round8-plan.md`,
  `round7-submission.md`, and this file.
- **There is no `round8-submission.md`.** The most recent submission file on disk
  is Round 7's. Round 8's submission exists only as the three commit messages
  (`0b32ee5`, `d68c1ac`, `75b97a5`), which are unusually complete but are not a
  scored, criterion-indexed submission and are not durable outside the branch.

This is exactly the failure mode the brief says the workstream survived by
avoiding. C1–C15/O1–O28 are therefore being scored against the **restated
criteria in the Round 6 and Round 7 scorecards plus the assertions actually
pinned in the test suite** — a reconstruction, not the contract. Round 9's first
action must be to restore or re-derive the spec and to require an on-disk
submission file. Every ruling below inherits that caveat.

---

## LOG-001 — what I ran myself (nothing below is taken on report)

- `r8audit-protected.js` at HEAD (`75b97a5`), Node 20 — **protected list intact**, verbatim:
  `A-off 16109.77/535 · A-2 7840.20/428 (Z0 1318.44/211, Z2 6521.76/217) ·
  A-3 8896.92/835 (Z0 1318.44/211, Z1 1776.09/355, Z2 5802.40/269) ·
  A-4 7448.60/1199 (Z0 1318.44/211, Z1 1750.32/348, Z2 3735.33/239, Z3 644.51/401)`.
  **`Z0 = 1318.44/211` identical at Layers 2/3/4.** Zero moved values.
- `shadow-additive-default.json` `castShadow` extracted at `98289be`, `0b32ee5`, `d68c1ac`,
  `75b97a5`: **`{"ink": 4248.7242, "paths": 191}` at all four.** Byte-identical, confirmed.
- Golden count: `git show --stat` per commit — `0b32ee5` moves **9** (all `sphere-*` +
  `parity-box-and-sphere`, **zero `box-*`**); `d68c1ac` moves **21** (the 9 again + 10 `box-*` +
  `shadow-additive-default` + `shadow-inverse`); `75b97a5` moves **0**. Round total = **21 distinct**.
  The claim reproduces exactly, and the "curved only, then the shared `FORM_INK` ladder reaches the
  faceted path" sequencing is visible in the split.
- `r8lad.js ./rev8` — a **fresh four-fixture render at HEAD**, my own output directory.
  Reproduced the submission's ladder **to the digit** (§LOG-002).
- `r8probe-max.js` on `./r8base`, `./r8final` and my `./rev8`, all four fixtures.
  `rev8` and `r8final` agree window-for-window, so `r8final/` is genuinely HEAD.
- Read `regions.js` `FORM_INK`, `surface-fill.js` `TOTAL_DARK_CEIL`/`DARKEST_WEIGHT`/the
  `myCeil` composition, and `scene3d.js` `recordGround` / `smoothShadedFaces` / `faceZone`.
- Read `facets.js` in full against the renderer it mirrors.
- **Looked at, not only measured:** `r8base/pole-base.png`, `r8final/pole-final.png`,
  `r8final/S-litpole-final.png`, `r8r8/R2-cube-bands4.png`, `r8chk/R2-cube-bands4.png`.

## LOG-002 — the four-fixture ladder, re-rendered at HEAD by me

```
fixture                    T      F      M      R     T/F    F/M    R/F   D(L)   max(obj)
E-bands4               0.404  0.216  0.131  0.080  1.867  1.654  0.368  0.073    0.537
V-E-bands4-sun45       0.373  0.218  0.140  0.087  1.713  1.555  0.401  0.072    0.508
W-bigball-bands4       0.357  0.204  0.123  0.057  1.748  1.661  0.280  0.082    0.498
W-bigball-sun45        0.362  0.201  0.128  0.058  1.795  1.570  0.287  0.092    0.539
```

O17, per fixture, over T/F windows: **p10 65 · median 65 · p90 65 · max 70 · ≥80° 0 (0%)** on
**all four**. Reproduced independently.

**Every headline in the submission reproduces except one — see LOG-003.**

## LOG-003 — FINDING THE ENGINEER DID NOT REPORT: `max(object)` is a four-fixture number and it went UP

Round 7 **newly protected** item 1 is `max(object) ≤ 0.56, currently 0.531`, and protected item 4
is *"the four-fixture ladder is the unit of report."* The submission reports
**`max(object) 0.529 → 0.498`** — a single fixture (`W-bigball-bands4`), and the only one of the
four where the number improved. Measured by me on the same stored grids:

| fixture | before (`r8base`, 98289be) | after (HEAD) |
|---|---|---|
| `E-bands4` | 0.531 | **0.537** |
| `V-E-bands4-sun45` | 0.519 | **0.508** |
| `W-bigball-bands4` | **0.529** | **0.498** ← the quoted pair |
| `W-bigball-sun45` | 0.521 | **0.539** |
| **worst of four** | **0.531** | **0.539** |

So the protected number moved the **wrong way**: 0.531 → 0.539, and the margin under the 0.56
ceiling narrowed from 5.2 % to 3.8 %. Nothing breaches — C2, O13 and the ceiling all still hold —
but the honest headline is **`max(object) = 0.498–0.539, worst fixture up 1.5 %`**, not
`0.529 → 0.498`. This is precisely the selective-fixture reporting Round 7 ruled against (§2
ruling 2a), repeated one round later on the item Round 7 protected *because of* that ruling.
T/F and F/M **were** correctly reported as four-fixture ranges, so this is an inconsistency in the
reporting discipline rather than a habit.
