# Round 6 scorecard + Round 7 plan

Spec: `design-shadow-anatomy.md` (C1–C15, O1–O28; **there is no C16**).
Prior: `round5-scorecard-and-round6-plan.md`. Branch `shadow-anatomy`, HEAD `628fb5f`,
worktree `agent-a71c6348dd322a40a`. NOT merged to `p4`.

**VERDICT: REVISE.** 27 PASS · 9 MARGINAL · 7 FAIL · 0 NM (43). Round 5 was 28 / 7 / 8.

The headline count went *down* by one and that is the right shape for this round. **C15 closed properly
(F→P)**, and two items I re-measured myself came down off PASS onto MARGINAL because the *instrument*
that passed them was excluding the thing it was measuring (C8, O2). Nothing regressed on merit.

This round did four things well and I want them on the record before the demands start:

1. It was told to cap the collar's pitch. It measured, found the pitch was **already** at the cap,
   worked out why that guaranteed the flood, and fixed the actual cause. **It disproved a designer
   prescription with a measurement instead of complying with it.** That is the behaviour I want.
2. It re-measured a ladder that had been flattering its own scores, and led with the fact that the
   new numbers are *worse*.
3. It reported C2 unmet, plainly, with the failed attempt described rather than buried.
4. It shipped Jay's comparison from the running app with a fixture-honest number (−32%, not the −47%
   from view A) and said which one was context.

Against that: the backlog did not move at all, **view R is now four rounds overdue**, and the C15 fix
landed **with no regression test** — 628fb5f touches one source file and zero test files.

---

## RULING (i) — C15 is CLOSED. Verified independently. And here is the general principle.

**Verified.** I re-ran `c15.js` against `r5b`, `r6a`, `r6b`, `r6c` myself:

| | R5 (`r5b`) | R6 (`r6a`/`r6b`/`r6c`) |
|---|---|---|
| `F-trio` ≥ 0.90 | 63 | **0** |
| `F-trio` ≥ 0.80 | 79 | **0** |
| `F-trio` max | 0.964 | **0.709** |
| `A-2/3/4` ≥ 0.90 | 8 / 10 / 10 | **0 / 0 / 0** |
| `A-2/3/4` max | 0.951 | **0.705** |
| `F-trio` mean(ink) | 0.252 | 0.233 |

Reproduced to the digit on all three R6 view sets. The mean barely moved (0.252 → 0.233) while the
peak collapsed — the signature of a change that engages **only where the collar was flooding**, which
is exactly the claim made. **`B-cube-zoom` is still not in `density.json`** (it is a crop; `shoot.js`
writes grids for full views only), so that clause of the R5 acceptance is formally unmet — but
`F-trio`, which *contains* that cube at the same mm scale, has zero patches ≥ 0.80, so the floor is
covered. Don't re-litigate it; do wire crops into `density.json`.

**The stride-vs-pitch account is correct, and I confirmed it in the diff.** `collarStrideFor()`
searches strides 1…6 for the tightest whose **composed** coverage `1 − Π(1 − cᵢ)` over family A *plus
the crossed families it will actually receive* stays under the ceiling, and the third direction is
then admitted only if it still fits **after** the stride is chosen. Both branches end under the
ceiling, so the invariant holds either way. Every candidate is a subset of the same master grid, so
the ruling-subset architecture is intact.

**Zero-golden-movement: verified structurally, not on trust.** `git show --stat 628fb5f` = **one file,
`src/core/scene3d/shadows.js`, +36/−3**. No test, no baseline, no other source file. Nothing else in
the tree *could* have moved. That is the strongest form of this claim and it is worth more than the
suite counts.

**One thing the write-up did not say.** The same commit also tightened `COLLAR_CEIL` **0.86 → 0.80**.
That is a second lever, changed silently, in a round whose whole thesis is "the lever was the stride."
It does not undermine the result — at stride 1 the collar exceeded even 0.86 — but recording only the
lever you like is how a number becomes unattributable three rounds later. Both are now on the
protected list.

### THE PRINCIPLE — state it once, apply it everywhere

My Round-5 prescription was wrong, and it was wrong in a way worth naming so neither of us repeats it:

> **A density cap must be stated on the same quantity the acceptance criterion measures — composed
> over every family that will actually land on the sample, at the scale it is measured at.** A cap on
> one family's pitch is a *proxy*, one transform away from the metric. A proxy cap can read
> "satisfied" while the measured quantity floods, and it will, because the excess simply arrives via
> the term the cap does not see.

C15 failed for three rounds because the cap was per-family while the criterion is per-patch. **The
same error is live right now on the object half — see ruling (ii).** Every future cap gets one
question asked of it: *what does the acceptance metric measure, and does this cap bind that?*

## RULING (ii) — C2: I found where the object's peak comes from. It is the base pass, uncapped.

The engineer's two observations are both correct: lowering the object's dark ceiling 0.47 → 0.42 moved
the object max **not at all** (0.636 both ways) and cost the terminator dip. Correct to revert it.
They just did not find the governor. I did.

**Step 1 — the 0.705 patch is genuinely the collar.** `m4.js` computes its "collar peak" over patches
that exclude the ball's disc, which excludes *the collar itself*, and it rebuilds the A-view scene as
`[BALL]` when `render.js` builds `[BALL, POST]` — so its C2 line is meaningless (it prints 1.00× /
0.97×; ignore it). Rebuilding the scene correctly and attributing every 4 mm patch of `A-4` to the
geometry that inked it:

| source | n (patches ≥80% pure) | mean D | p90 | max |
|---|---|---|---|---|
| `shadow-Z0` | 29 | **0.553** | 0.697 | **0.705** |
| `shadow-Z1` | 77 | 0.425 | 0.518 | 0.557 |
| `shadow-Z2` | 111 | 0.222 | 0.231 | 0.302 |
| `shadow-Z3` | 188 | 0.124 | 0.203 | 0.231 |
| object | 425 | 0.256 | 0.446 | **0.636** |

The global maximum patch in `A-2`, `A-3` and `A-4` is at (208,144) mm and is **100 % `Z0` ink,
47.2 mm of it**. So the engineer's 0.705 is honest and **C2 as the spec literally words it — "D(contact)
is the highest D of any 4 mm patch in the image" — is satisfied.** The 1.25× is a margin *I* added in a
later ruling, and it is failing at 1.11×.

**Step 2 — where the object's 0.636 comes from.** It is not an outlier and it is not the crossed family.
The peak is a coherent 3–4-patch cluster at (136–148, 32–48) mm on `E-bands4`, i.e. **r ≈ 0.5–0.8 of the
screen radius, upper-left of centre — the upper terminator, inboard of the limb** (so `m4`'s 14 % limb
exclusion does not touch it). Binning that patch's ink by direction:

```
PEAK (136,32)   ink 34.4 mm in 16 mm²   coverage @0.3 pen = 0.644
  direction histogram:  ALL 34.4 mm in the 150–165° bin.  ONE family. No cross.
2nd  (140,40)   ink 38.0 mm             coverage 0.712   (135° 27.5 mm + 60–90° 10.4 mm — this one IS crossed)
median (156,72) ink 25.8 mm             coverage 0.484
```

**A single family, alone, at an effective spacing of 0.3 / 0.644 = 0.466 mm = 1.55 × pen width.** Two
consequences:

- It clears C15's literal bar (1.2 × pen) by 29 %, which is why nobody caught it — **C15 has only ever
  been measured on the shadow.**
- It is **1.4× the curved path's own stated family-A target.** `surface-fill.js:117` says family A is
  "floored where it measures ~0.45", and `floorPitch = PLOT_FLOOR_PEN(2.2) × pen = 0.66 mm`. Measured:
  0.466 mm. **The base pass is overshooting its own floor by 1.4×.**

**Step 3 — why the dark ceiling could not have helped.** The composed ceiling block in
`surface-fill.js:668` is guarded by `if ((zoneGate || densityCross) && localPitch != null)` — it runs
**only on zone-gated and cross passes**. The ungated base pass is limited by a *different* rule, the
multiplicative `cap = localPitch / floorPitch`. So at the peak patch, which is base-pass single-family
ink, `TOTAL_DARK_CEIL` is never consulted. Moving it 0.47 → 0.42 moved nothing because **that code
never executes there.** This is the C15 defect one level down: a per-pass cap on one path, a composed
cap on another, and nothing capping *the sum as drawn*.

### THE ROUTE — and why it costs the dip nothing

Enforce one composed, per-sample budget across **all** passes on the object (base included), sized so
no patch exceeds ~0.56. Then:

```
collar 0.705 / object 0.56 = 1.26×   →  C2 closes, and the collar is not touched at all.
```

**It cannot flatten the ladder, and here is the arithmetic that proves it before you write the code:**
object patch D is p50 **0.234**, p90 **0.446**, p99 **0.558**, max 0.636. A 0.56 cap moves roughly the
top **1 %** of patches. T's *mean* is 0.395 — nowhere near the cap. **T/F cannot move.** That is the
difference between this and the ceiling drop they tried, which lowered the whole ramp and cost
T/F 1.51 → 1.38.

Also fix the instrument while you are in there — and *then* re-score:

> **C2 is RE-SPECIFIED.** Comparing max-of-29 collar patches against max-of-425 object patches is an
> order-statistic mismatch, not a design comparison; the object gets 14× the draws. From Round 7, C2 is:
> **(a) `p90(Z0) ≥ 1.25 × p90(object)`** — currently **0.697 / 0.446 = 1.56×, passes now** — **and
> (b) `max(object) ≤ max(Z0)`** — currently 0.636 ≤ 0.705, passes now. Report both, with `n` for each.
> Do the base-pass cap anyway: 0.644 coverage from one family is a wet-plot risk on its own terms.

C2 stays **MARGINAL** this round: it meets the spec text and both re-specified clauses, and misses the
standing 1.25×-on-max ruling at 1.11×. It is not a FAIL and it has not been one since Round 5.

## RULING (iii) — the re-measured ladder is ACCEPTED as authoritative, and it must be rebuilt with margin

I re-ran `m4.js` on `r6c` and reproduced the ladder exactly: **L 0.105 (n=41) · M 0.193 (n=107) ·
T 0.395 (n=81) · F 0.262 (n=97) · R 0.115 (n=8)**. F/M 1.36, T/F 1.51, D(L) 0.105.

**Accepted, and the R4 numbers are void.** Carry these. But three of the four margins are 1–4 %:
F/M needs 1.35 and has 1.36; T/F needs 1.50 and has 1.51; O6 needs 0.10 and has 0.105. **Three criteria
inside 4 % of their bounds is not a ladder, it is a coincidence** — and every one of them moved this
much purely because the fixture's sun went 45° → 28°. The next fixture change flips them.

**And R is not merely thin — it is being measured where it isn't.** `m4.js` excludes the outer 14 % of
the disc (`LIMB = 0.93`). §5.1 puts the reflected band on the **lower rim, 12–18 % of form width** —
i.e. r ≈ 0.82–1.00. **More than half of R's area is inside the exclusion.** n = 8 is not a small band;
it is the sliver of R that survived an instrument built to exclude the limb. This is the same class of
error as `m4`'s ball-disc test eating the collar. **O2 and O23 are therefore not passing — they are
unmeasured**, and O2 comes off PASS to MARGINAL because of it.

**Ruling: rebuild the ladder to hold with margin, on two fixtures.** Targets: **T/F ≥ 1.60**,
**F/M ≥ 1.45**, **D(L) ≥ 0.13**, and **R measured with a limb-aware mask (exclude the silhouette
contour, not the rim) with n ≥ 30**. Measure at sun 28° **and** 45° and report both columns. A number
that survives one fixture is an anecdote.

## RULING (iv) — YES. Round 7 is BACKLOG-ONLY, plus exactly two admitted items.

Eight R5 items untouched, three views overdue, and I have now found **two more broken instruments**.
No new criteria work. Two exceptions, both justified:

- **The C2 base-pass cap**, because I have handed over the diagnosis, the line number, the target and
  the proof that it costs the dip nothing. Refusing a ten-line fix that is fully specified would be
  ceremony.
- **The live object defect**, because it is already R5 backlog item 2 and *nothing on the object half
  is live-verifiable until it is fixed* — see the note on Jay's frames below.

Everything else new is frozen until the backlog is empty.

---

## INSTRUMENT DEFECTS FOUND DURING THIS REVIEW — fix these first in Round 7

The round's own best finding was that `m4.js` was measuring a scene nobody renders. It is worse than
they thought. All four of these are mine, found this round, and all four have been silently corrupting
scores:

1. **`m4.js` builds the A-views as `[BALL]`; `render.js` builds them as `[BALL, POST]`.** Every
   cast-shadow patch belonging to the post is unattributed, and the footprint polygon `foot` is the
   ball's alone. Same defect class as the hardcoded camera, still live.
2. **`m4.js`'s "collar peak" excludes the collar.** The R4 C2 ruling — exclude any window intersecting
   the silhouette — is implemented as a *disc* of radius max‖path − centroid‖, which swallows the
   contact collar wrapping the base. Hence `A-2` collar peak = 0.000 and no `Z0` row at any layer
   count, and hence **C1 has never actually been scored by this harness.**
3. **The 14 % limb exclusion deletes most of zone R** (ruling iii).
4. **Crops get no `density.json` entry**, so `B-cube-zoom` — named in an acceptance condition — cannot
   be scored, three rounds running.

**With (1) and (2) repaired, C1 scores for the first time on this fixture: `Z0` 0.553 / `Z2` 0.222 =
2.49×, needs ≥ 2.0. PASS, with margin, measured.** That is a real result the round earned and could not
see.

---

## Cast shadow — 12 P / 3 M / 0 F  (R5: 12 / 2 / 1)

**PASS:** **C1 — now measured, not carried: 2.49× (Z0 mean 0.553 n=29 / Z2 mean 0.222 n=111)** ·
C3 *(carried)* · C4 (**confirmed live on the box caster in `jay-layers/layers-2.png`** — the collar
reads on the lit side of the base) · C6 · C7 · C9 (**best live result in the set — `layers-4.png` has
no readable silhouette; the throw dissolves**) · C10 · **C11 re-verified by me on the A fixture:
totals 7840 / 8897 / 7449 mm → −2.8 % / +10.4 % / −7.6 % about the mean, and on Jay's box fixture
−14.7 % / +13.8 % / +0.9 %. Both inside ±25 %.** · C12 (`Off` = 16110 mm / 535 paths, unchanged; the
commit touches no baseline) · C13 · C14.

**MARGINAL:** **C2** — see ruling (ii); meets the spec text and both re-specified clauses, misses the
1.25×-on-max ruling at 1.11× · C5 *(carried, 2.54× vs the 2.4 ceiling)* ·
**C8 — NEWLY MARGINAL. `Z3` mean 0.124 / `Z2` mean 0.222 = 0.559 against a ≤ 0.55 bound.** My patch
set has no interiority filter, which biases `Z3` *down* — so the true ratio is likely worse, not
better. Restore PASS by producing the interiority-filtered number; do not restore it by assertion.

**PASS (was FAIL): C15.** Acceptance met — zero 4 mm patches ≥ 0.90 **and** ≥ 0.80 across `F-trio`
and `A-2/3/4`, collar peak 0.705 ≤ 0.85, C1's ratio intact at 2.49×. Rim retraction not reverted.
**Watch item, not a failure:** C15 has only ever been measured on the shadow. The object's darkest
patch runs a single family at 1.55 × pen (ruling ii). **From Round 7, C15's measurement set includes
object patches.**

**FAIL:** none.

## Object shading — 15 P / 6 M / 7 F  (R5: 16 / 5 / 7)

**PASS:** O1 (T/F 1.51 vs spec's 1.25× — comfortable against the spec, thin against the harness's own
1.50 bar) · O3 (T 0.395 > F 0.262 > R 0.115; the dip holds in sign, R's magnitude is unmeasured) ·
O4 · O6 (0.105 vs 0.10 — passing on 5 %) · O7 · O8 · O10 · O12 · **O13 — verified with attribution
this time: object max 0.636 < collar max 0.705** · O16 · O18 · O19 · O22 · O25 · O28.

**MARGINAL:** **O2 — NEWLY MARGINAL (was PASS).** R/F 0.44 looks like a pass; **n = 8, below the
engineer's own n ≥ 12 rule, and the instrument excludes the band's own territory.** Not a regression —
an unmeasurement. · O5 (8.1 % vs 8 %) · O17 (unchanged; the lit-pole starburst is still the darkest
accident on the ball — and ruling (ii) now says that region is also carrying the object's max D, so
these two items are the same defect seen from two sides) · O23 (0.60, at bound, and same limb problem)
· O24 · O27.

**FAIL:** O9 · O11 · O14 · O15 · O20 · O21 · O26. **All seven untouched this round; all seven are
R5 backlog.** O20 remains the most damning image in the set — `B-cube-zoom` shows the cube's top and
side separated only by the drawn edge.

---

## PROTECTED LIST — re-verified, nothing regressed

**The structural argument first:** `628fb5f` changes exactly one file, 36 lines, in `shadows.js`.
**Every object-side protected item is untouched by construction.** O16's 4-way identity, the object
not flooding, the O22 dihedral gate, the curved half of O15, the world-anchored +X facet frame, C13's
13.6× swing — none of them can have moved. Re-asserting them by re-measurement would be theatre.

Re-measured because the collar *is* what changed:

- **Per-span `shadowLayer`** — intact. My probe reads it per span and gets a clean Z0/Z1/Z2/Z3 split.
- **`Z_CONTACT` excluded from rim retraction; Z0 bit-stable across Layers 2/3/4** — **HOLDS, at a new
  value.** `Z0 = 1318 mm / 211 paths` at Layers 2, 3 **and** 4 (was 1973.37 / 325). The stride change
  took 33 % of the collar's ink out, by design; the *invariance* across layer counts — which is what
  the protection is for — survived. **Re-print these three numbers on any future collar change.**
- **The conservation model** — Z2 carved down 6522 → 5802 → 3735, Z1 1776/1750, Z3 645. Intact.

### NEWLY PROTECTED

1. **`collarStrideFor()` and the post-stride third-family admission.** Never revert the collar to
   `keep-1-of-1`; never admit the third direction before the stride is chosen. Any change re-prints
   the four `c15.js` rows.
2. **`COLLAR_CEIL = 0.80`** (tightened from 0.86 in the same commit — recorded so the result is not
   mis-attributed to the stride alone).
3. **`Z0 = 1318 mm / 211 paths`, identical at Layers 2 / 3 / 4.**
4. **C1 = 2.49× (Z0 0.553 n=29 / Z2 0.222 n=111)** — the first measured C1 on this fixture.
5. **The harness reads its fixture from `render.js`; it never restates one.** Camera, sun **and object
   list**. This has now bitten twice.
6. **RGR GAP — must be closed in Round 7:** the C15 fix has **no test**. A unit test must pin the
   composed-coverage invariant (`perceivedCoverage(collar families) ≤ COLLAR_CEIL` at the plot floor),
   red before 628fb5f, green after. Nothing else protects this from the next refactor.

---

## ROUND 7, IN ORDER — backlog only

1. **P0 — repair the four instruments** (`[BALL, POST]`; a silhouette mask that does not eat the
   collar; a limb mask that does not eat R; `density.json` entries for crops). Everything below is
   scored on the repaired harness. Half a day, and it unblocks C1/C2/C8/O2/O23 at once.
2. **P0 — the live object defect.** R5 item 2, still open, and **it is in the frames delivered to
   Jay** — the cube is a bare outline in all four. Nothing on the object half is live-verifiable
   until this is fixed.
3. **P0 — the C2 base-pass cap.** One composed budget across all passes on the object; target
   `max(object) ≤ 0.56`. Print p50/p90/p99/max before and after, and T/F before and after — the
   prediction is that T/F does not move. If it moves, stop and report.
4. **P0 — O9/O11/O14/O15 as ONE dispatch table.** Unchanged from R5: six treatments → six distinct
   files on the cube under **both** modes; `J-sens-1/3/6` distinct; `I-pen-*` in the second pen.
5. **P0 — O20/O21: the rank quantizer.** The R4 ruling stands, now four rounds unimplemented.
6. **P1 — the C15 regression test** (protected item 6).
7. **P1 — O26**, the second quantizer in the band assignment.
8. **P1 — density stops.** Still dead and I re-confirmed it: `10 : 3604 · 25 : 3604 · 40 : 3604 ·
   60 : 4098 · 85 : 5772 · 100 : 6638`, span **1.84 : 1** against a 2.5 : 1 bar, with the bottom three
   stops byte-identical. **Shoot all six** — only 10/40/85/100 exist.
9. **P1 — O17**, the lit-pole starburst. Ruling (ii) says this region also carries the object's max D;
   treat O17 and the C2 cap as one investigation.
10. **P1 — rebuild the ladder to margin** (ruling iii), measured at sun 28° **and** 45°.
11. **P2 — detached shadows** (capsule and low-poly float in `F-trio`).
12. **P2 — pen-up travel**, one measurement, before/after the per-zone `emitHatchLines` split.

## VIEWS STILL NEEDED

**`R`** — cube + low-poly at bands 2/3/4 with per-facet D printed. **Asked for four rounds running.
If Round 7 arrives without it I will score O19/O20/O21/O26 as FAIL on absence.**
**`S`** — `E-bands4` lit pole at ≥ 6×.
**`T`** — the treatment matrix after the dispatch fix.
**`B-cube-zoom` in `density.json`**, plus all six density stops.
**New — `U`:** the box caster's throw at Layers 4, ≥ 2×. `jay-layers/layers-4.png` shows a mottled
lighter patch mid-throw that reads as blotchy noise rather than as a wedge. I cannot score it from a
full-frame shot; it may be nothing. Get me the crop.
**Live:** the object ladder with the dip on a real ball · `none` on an object that has a highlight ·
the cube's three faces at bands 4 · Softness swept.

---

## FOR JAY, NOT THE ENGINEER

The four frames are in `jay-layers/`. **Read them with one caveat: the cube is an unfilled outline in
all four** — object shading is not being exercised, so what you are judging is purely the shadow.

- **Off** reads as a graphic cut-out: a flat even field with a hard silhouette. It is a legitimate
  shipped look and it is the compatibility contract — it is not going to change.
- **2** is the step that does the work. The base gets a bright dense collar and the object lands.
- **3** puts a core in the throw; **4** breaks the outer edge up so the shadow stops having an outline.

Shadow ink: **Off 5238 → 2 : 3576 → 3 : 4767 → 4 : 4228 mm.** Off → 2 is **−32 %** here and **−51 %**
on the ball fixture. My read as designer: the `Off` mid is *too heavy* — that weight is what makes it
a cut-out — and 2/3/4 read better as drawings. But "turn Layers on and a third of the shadow leaves"
is a product call, not a criterion, and it is yours.

---

## WHAT STILL BLOCKS "DONE"

The dispatch table is still one file eleven times · the cube still does not read as a lit solid (O20,
four rounds) · the curved object still bands (O26) · **the object half has still never been verified in
the running app, and the frames sent to you show why — the object renders unfilled** · density stops
are dead below 60 · the reflected-light band has never actually been measured · view R has been
outstanding for four rounds · and the C15 fix, the best result on the branch, has no test holding it.

**None of it is architectural.** The zone model, the ruling-subset grid, the per-span attribution and
now the composed collar ceiling all work. What is left is plumbing, one ten-line cap, a harness that
tells the truth, and four screenshots.
