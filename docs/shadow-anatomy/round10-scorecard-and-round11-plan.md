# Round 10 — scorecard, and the Round 11 plan

Reviewer: visual designer, Round 10. Branch `shadow-anatomy`, HEAD `a351528`.
Baseline: Round 9 at `8c0f249`, scored **26 PASS / 12 MARGINAL / 5 FAIL**.
Commits under review: `26e98b5`, `82789c4`, `16124f6`, `04637e8`, `51ac6c0`,
`ca277a4`, `ef387c5`, and the submission at `a351528`.

**This file is the deliverable**, and it is in the repository for the reason the
last two scorecards say: `/private/tmp` is pruned between sessions and that is how
the original spec and the Round 2–5 scorecards were permanently lost. Every number
below was measured by me at HEAD with the command that produced it named beside it.

**The engineer was killed mid-round by a session limit.** Its last words were
"Running the full suite on the combined state," which it never did. **No suite
claim in the submission is the engineer's own on the combined tree.** Every suite
number in §1 is mine.

---

## 0. Verdict

# ACCEPT the round — 26 PASS / 12 MARGINAL / 6 FAIL, of 44

**ACCEPT, and it is the cleanest round in the workstream.** Four of the six items
landed outright and are verified by me independently. Two of the six landed
partially and both say so in their own source. Most unusually: **the round measured
the reviewer's own prescribed O6 lever, disproved it with a ten-row table, and
declined to ship it.** That is the second time in two rounds a lever was built,
measured and thrown away rather than prescribed, and it is the behaviour this
workstream has been trying to produce for ten rounds.

**The totals moved by one net criterion and gained one.** The denominator changes
from 43 to 44 because `criteria.md` gained C15b this round.

| | R9 | R10 | why |
|---|---|---|---|
| PASS | 26 | **26** | **+O28** (measured at last, and I re-measured it) · **−O12** (found by the round itself to be missing its own bar) |
| MARGINAL | 12 | **12** | +O12 · −O28 |
| FAIL | 5 | **6** | **+C15b**, the new sub-window clause, breached on measurement |

**What keeps ACCEPT from being clean — three findings the submission does not
contain**, all in §4, and the first is the same class of defect this workstream
exists to catch:

1. **C15b's headline number is measured off the page.** Every one of the top-five
   hot spots on **both** `W-bigball` fixtures sits at negative y — above the top of
   the 220 mm sheet. The worst-of-four `1.069` and the entire "past SOLID" claim
   are unplottable. Corrected on-page worst-of-four is **0.960**. C15b is still
   breached; its headline is overstated by 11 % and its most quotable sentence is
   wrong.
2. **The O3 refutation is scoped to the faceted path and stated for all of it.**
   The arrangement instrument measures facet adjacency on three low-poly fixtures.
   O3's FAIL was observed on the **curved** `E-bands4` sphere in the running app.
   `criteria.md` now says "the zone map is a clean set of bands" without that
   scoping.
3. **The round did no live verification at all** — against Round 9's standing
   obligation that qualitative criteria "should be re-scored against images every
   round from now on, and no qualitative criterion may be carried on a number
   again." Nine criteria were re-scored on images last round. None was looked at
   this round.

**And one omission of the round's own best work.** The submission (320 lines,
"this file is the deliverable") contains **no section on O6 at all** — not its
measurement, not the disproof of the prescribed lever, not the ten-row sweep, not
the finding that O4 is now the binding constraint. All of it is in the commit
message of `ca277a4` and in a test comment. The round's most rigorous single piece
of analysis is missing from its own deliverable.

---

## 1. Suites — measured by me, on the combined tree at `a351528`

Node 20.20.2 (`~/.nvm/versions/node/v20.20.2/bin`). **Node 18 cannot run vitest at
all** — `SyntaxError: Invalid regular expression: /\p{Surrogate}/` — which is worth
restating because the shell default in this tree is 18.16.0 and the first run died
on it.

| suite | measured at HEAD | R9 | note |
|---|---|---|---|
| unit | **3884 passed, 1 skipped** (3885) | 3826 | +58 tests. 0 failed. |
| integration | **1570 passed** (214 files) | 1570 | 0 failed. **See below.** |
| visual | **110 passed** (6 files) | 110 | 0 failed. |
| perf | **7 passed** (4 files) | 7 | 0 failed. |
| e2e | **62 passed** (49+2+1+9+1) | 62 | 0 failed. |

**Zero failures anywhere.** The submission's per-commit claims (unit 3830 at
`82789c4`, integration 1570, visual 110) are consistent with the final state.

**Logged against the integration run, not against the round:** `run-vitest.js` hit
an RPC timeout, retried, hit it again, and **self-declared a pass** — *"The retry
hit the same RPC timeout with every test still passing. Treating as a pass."* All
1570 tests did report passing, so the number stands. But a harness that decides
its own exit code on a timeout is an instrument that can say YES when it should
say UNKNOWN, and this workstream's rule is that a probe must be shown able to say
NO. Pre-existing, not Round 10's, and it should not stay unexamined.

**Pre-existing and restated:** `test:e2e` enumerates five spec files by name, so
`tests/e2e/mask-shift-drag.spec.js` and `tests/e2e/visual.spec.js` never run. Third
round this has been noted.

**Nothing half-landed.** `git status` is clean at `a351528`; the tree builds and
every suite is green. The mid-verification death left no inconsistency I can find.

---

## 2. The protected list — re-verified at HEAD, INTACT

`node scripts/shadow-anatomy/r8audit-protected.js`, whose mutation check passed
(wrong-field read finds 0.00 mm, correct-field read finds 1199 cast paths):

```
A-off  cast 16109.77mm/535p OK   Z? 16109.77/535
A-2    cast  7840.20mm/428p OK   Z0 1318.44/211  Z2 6521.76/217
A-3    cast  8896.92mm/835p OK   Z0 1318.44/211  Z1 1776.09/355  Z2 5802.40/269
A-4    cast  7448.60mm/1199p OK  Z0 1318.44/211  Z1 1750.32/348  Z2 3735.33/239  Z3 644.51/401
PROTECTED LIST: intact.
```

| item | required | measured | state |
|---|---|---|---|
| `Off` cast | 16109.77 mm / 535 paths | **16109.77 / 535** | held |
| Layers 2/3/4 | 7840.20 / 8896.92 / 7448.60 | **exact** | held |
| `Z0` at every layer count | 1318.44 mm / 211 paths | **1318.44 / 211 at 2, 3 and 4** | held |
| `shadow-additive-default.json` `castShadow` | 191 paths / 4248.7242 | file **untouched** since `a3ef2f7` (`git diff --stat` empty) | byte-identical |
| `max(object) ≤ 0.56`, boolean grid, per fixture | ≤ 0.56 | **0.5062 worst-of-four** (ladder test green) | held, margin 9.6 % |
| O17: 0 % of crossed windows ≥ 80°, median 65 | — | **0 % ≥ 80°, median 65, max 70, all four fixtures** | held |
| `F/M ∈ [1.45, 1.70]`, `T/F ≥ 1.25` | — | **F/M 1.555–1.661, T/F 1.713–1.867** (browser raster) | held |
| `+Y` on `R2-cube` D 0.024 | — | ladder/facet tests green | held |
| bare visible facets: 6 on `W-lp-sun45`, 3 on `R-lp-bands4` | — | **6 of 90 and 3 of 40, measured by me** | newly pinned, held |

**The curved path is byte-identical to Round 9.** My own `r8lad.js` run reproduces
Round 9's browser-raster ladder to the digit — T/F 1.867 / 1.713 / 1.748 / 1.795,
F/M 1.654 / 1.555 / 1.661 / 1.570, max(object) 0.537 / 0.508 / 0.498 / 0.539. Two
commits this round (`82789c4`, `ca277a4`) claimed to be output-neutral on the
curved path. They are.

Only two baselines moved all round: `box-lights-4.json` (11 → 12 paths) and
`parity-box-and-sphere.json` (133 → 134), each **exactly +1 `sceneFill` path and
+2 points** — one blank facet gaining its single ruling. That is the fix, and
nothing else.

---

## 3. Ruling on the six items

### 3.1 The bare-facet regression (`82789c4`) — **BOUGHT.** The blocker is clear.

This was the one item blocking the sliver fix from reaching users. **It is
genuinely fixed, and I verified it three ways.**

`node scripts/shadow-anatomy/facets.js <dir> W-lp-sun45` and `R-lp-bands4`:

```
W-lp-sun45   ZERO-FILL: 6 of 90 visible facets  (face:84,150,20,27,85,21)
R-lp-bands4  ZERO-FILL: 3 of 40 visible facets  (face:38,47,16)
```

Exactly the submission's 9 → 6 and 8 → 3. And the substantive claim holds: reading
the unscored table by area, **every bare facet is ≤ 34.4 mm²**, and the two that
mattered now carry ink — `face:26` (202.5 mm², N·L 0.898) at 9.2 mm of fill and
`face:89` (188.8 mm², N·L 0.950) at 24.7 mm. `75b97a5` had bare facets of 188.8 and
147.7 mm²; `8c0f249` added 202.5. **HEAD is strictly better than either baseline**,
which is a stronger result than the round was asked for.

**I accept both corrections to my predecessor's reading.** "At `75b97a5` every
facet with geometry carried fill" was false (the counts were 1 and 2), and it is
not a limb defect — five of the nine were zone L, the centre light. The round
proved this with the instrument the review correctly identified as hiding it, which
is the right way to overturn a finding.

**The gate is real, not decorative.** `Regions.formCeiling('L')` reads 0.0987 at
HEAD (I read it off the live object), and the one-ruling grant is refused when
`pen / widthOnPaper` exceeds it. That is why 9.0 mm² `face:21` stays bare and
202.5 mm² `face:26` is drawn. What is left bare is now arithmetic, which is
precisely what §4.1 of the last scorecard asked for.

**One defect, cosmetic but of the class this workstream punishes.** The arithmetic
for `face:21` is quoted **three different ways in three places**: 0.486 and "4.9×
over" in the submission and in `scene3d-blank-facet.test.js`, but "≈ 0.20 coverage
… three times over" in the `scene3d.js` source comment — and 0.20/0.0987 is 2.0,
not 3. `face:26` is 0.019 in two places and "≈ 0.021" in the third. The source
comment is internally inconsistent and disagrees with the test. Fix the comment;
the code is right.

**And the composed ceiling is now one law**, which is the more durable half of this
commit. `TOTAL_DARK_CEIL` / `DARKEST_WEIGHT` moved to `regions.js` beside the
`FORM_INK` weights they divide by, and `Regions.formCeiling` is the single
expression — the faceted path previously had no counterpart at all. `ca277a4` then
found and removed a **second copy of the arithmetic** still living in
`surface-fill.js`, which would have enforced the L-zone floor on one path and not
the other. Finding your own half-fix one commit later is good practice.

### 3.2 The ground double-plot (`ef387c5`) — **BOUGHT, and cleanly.**

My own probe over the full emitted path list, keyed on the exact coordinate stream
and its reverse:

```
A-4              paths  1519   exact-duplicate coordinate streams: 0
R2-cube-bands4   paths    48   exact-duplicate coordinate streams: 0
```

Round 9 measured 4 duplicate pairs / 1520.96 mm on `A-4`. **Zero at HEAD**, and the
path count is 1523 → 1519, exactly the four removed. The fix is the right one: the
per-face outline pass is deleted and the structural edge pass becomes the sole
owner of the object outline, which it already was for curved prims and which is
strictly richer (EdgeStyles, border emphasis, x-ray crease, `kind:'sceneEdge'` for
picking).

**The picking argument is established rather than asserted**, and that deserves
saying: the removed pass stamped `pickPolygon` and *claimed* face-mode picking
needed it; the round traced the renderer to `_scenePickFaces` → `_scenePolyDepthAt`
and then wrote a premise test that **fails at the parent commit**, proving the rig
actually exercises the pass it removed. That is the correct shape for "I deleted
something that claimed to be load-bearing."

**Found and honestly not fixed:** `F-trio` carries a further 6.02 mm of `sceneFill`
retrace on the capsule, pinned at its measured value rather than touched because
fixing it would move tone numbers. Correct call; carry it to Round 11.

### 3.3 `PLOT_FLOOR_MULT_OBJ` — **BOUGHT, and it corrected my predecessor.**

`PLOT_FLOOR_MULT_OBJ` is **1.5** at HEAD (was 1.2). Single-family coverage is
`1/1.5 = 0.6667`, comfortably under C15's 0.80 run clause.

**The round was right to refuse the prescribed number.** Round 9 said "≥ 1.25"; at
exactly 1.25 the coverage is exactly 0.80 — the breach threshold, not under it — so
the relation was wrong as well as the value. The round then applied `criteria.md`
§0's own instrument rule to pick 1.5: `pen/pitch` is nearest the boolean grid, the
browser raster reads 8–12 % higher, so 1.4 would land *on* the bar at 0.800 and 1.5
gives 0.6667 geometric / 0.747 on the raster. **That is the reviewer's own rule
applied against the reviewer's own number, and it is correct.**

Measured effect: zero, as predicted — the floor enters as `Math.max(requested,
mult × pen)` and at the fixture's 0.3 mm pen it is 0.45 mm against requested
pitches of ~2 mm.

**The residual is named, not hidden.** The composed budget was not landed: the
round instrumented 179 planned facets across five views and found **0 exceed
`Regions.formCeiling(zone)`** (worst is zone T at 0.2801 against 0.47), so a clamp
would be inert on every fixture. Pinned as a test instead, with the honest
statement that **a zone with a 1.00 cross still composes to 0.8889 at the new
floor** — over the 0.80 run clause, though no longer past the 0.90 hard clause it
reached at 1.2 (0.9722). Carry it.

### 3.4 O6's bar → 0.083 (`ca277a4`) — **PARTIAL. The wiring is a ratchet, not a lever, and the commit subject overclaims.**

The commit is titled *"the constant finally controls it."* **It does not, and the
test comment inside the same commit says so in as many words** — *"It is SLACK AT
12 … the wiring is output-neutral at the shipped value."* I read the live object:

```
Regions.LIT_MAX_PITCH_PEN = 12    1/N = 0.0833
Regions.formCeiling('L')  = 0.0987   ('T' 0.4700, 'F' 0.2397, 'H' 0.0000)
```

`formCeiling('L') = max(0.47 × 0.42/2.0, 1/N) = max(0.0987, 0.0833)`. The weight
term wins. The floor is inert at the shipped value.

**And my structural finding, which the round did not state: the constant can never
buy O6, at any value.** The floor and the bar are *the same expression*. Set
`LIT_MAX_PITCH_PEN` below 10.13 and the floor starts to bind — but then
`ceil(L) = 1/N` and `bar = 1/N` **exactly**, so `D(L) ≤ ceil(L) = bar`. The
criterion becomes satisfiable only at perfect saturation of its own ceiling, and
measured saturation is 70–88 %. The wiring is a **regression ratchet** — no future
coverage edit can silently put the ceiling back under the bar, which is real and
worth having, and it is exactly what the source comment claims for it. It is not
what the commit subject claims. **Fix the subject line's claim in the record; keep
the wiring.**

**The rest of the item is exemplary and I am ruling it a credit, not a debt.** The
round measured my predecessor's prescribed lever and **disproved it**, with a
ten-row four-fixture table:

- `GLINT_KEEP` never becomes live. At `L.coverage` 0.50 it is **bit-identical at
  0.8 and 1.0**. The ruling's "two ceilings in series" is wrong — there is one.
- `L.coverage` 0.42 → 0.50 reaches **0.0736** worst-of-four (11 % short of 0.083)
  and already takes L/M to **0.7510** against O4's 0.75 floor.
- The ruling's cost model **assumed a per-fixture lever**. `FORM_INK.L.coverage` is
  global and the fixtures span 0.0678–0.0865 (28 %), so landing the minimum on the
  bar overshoots the maximum to ~0.106 and O4 is scored on *that* fixture.

**I accept the disproof in full.** My predecessor's §1.4 lever is withdrawn. No
`FORM_INK` row moved and the ratchet tightened only to what HEAD measures
(0.065 → 0.067). **O6 stays FAIL at 0.0678 against 0.083.**

**The consequential ruling the round asks for, and I give it: O4's `L ≤ 0.75 × M`
is now the binding constraint on O6, and it is a Round 9 invention pinned in the
round that invented it.** My predecessor flagged that near-circularity when they
created it and said "nothing turns on it yet." Something turns on it now. See the
Round 11 plan, item 1.

### 3.5 Every unit harness reads the fixture (`04637e8`) — **BOUGHT. I RED-proved the guard myself.**

The never-restate rule has been broken five times and a sixth was found. It is now
enforced rather than described, and **I verified the enforcement rather than
reading it**: I planted a violating file in `tests/unit/` and ran the guard.

```
× A — the fixture camera's pitch appears in no test file
    + "scene3d-zzzguardprobe.test.js L4: const cam = { pitch: 32, yaw: -30 };"
× B — no fixture consumer contains an inline bounds literal
    + "scene3d-zzzguardprobe.test.js L5: const bounds = { penWidth: 0.3 };"
× B — no fixture consumer contains an inline primitive object
```

**Three of three applicable rules caught it.** The probe file was removed
immediately; `git status` is clean.

The guard's design is right and its reasoning is written down: the obvious rule
("no camera literal in `scene3d-*`") is unusable because 34 of 53 scene3d tests
build unrelated cameras, so it is two narrow rules instead — a rig **signature**
scan (`pitch: 32`, `elevation: 28`, unique to this rig across the suite) that
catches copies, and a **consumer** scan discovered *from imports* that catches
drift, which a signature scan structurally cannot (the drifted namesake test said
`pitch: 22`). Both allowlists are empty; the file excludes only itself, and it does
so in order to carry known-bad strings for its own can-say-NO block. Fourteen
scene3d tests now import the fixture.

The namesake test is on the real rig. **And the drift was load-bearing**, which is
the finding of the commit: O12's bands 2→3 step passes at 0.2709 under the drifted
45° sun and measures **0.0465 against its own 0.05 bar** under the real one. Round
2's exact defect signature, green for eight rounds because the only test that could
see it was aimed at a scene nobody renders. **That downgrades O12** (see §5) — and
finding it is to the round's credit.

### 3.6 C15's sub-window clause and the caustic's number (`16124f6`) — **PARTIAL. The metric tracks a real artefact; its headline number is off the page.**

**Does the new number track the artifact?** Substantially yes, and the instrument
is well built:

- It measures ink **length per area** in a 1 mm disc — no rasteriser, so it is not
  measuring the pen's own anti-aliasing, and it is in the units the plot floor is
  stated in.
- It carries **two synthetic closed-form controls** that must pass before any real
  number prints. I reproduced both: isolated ruling `0.1910 = 0.1910 OK`, grid at
  the 2.2 × pen floor `0.4779 = 0.4779 OK`. The **disc chord bias is written down
  rather than tuned away** (+5.1 % against the areal 0.4545) so a reader can
  subtract it. That is the best-calibrated instrument this workstream has built.
- It **reported itself wrong**: the first version mistook the drawing's sparsest
  probe for the isolated-ruling control and printed `INSTRUMENT WRONG — do not
  quote`. Correctly, and it recorded why.
- It has a **negative control that discriminates**. `R2-cube-bands4` — no chart, no
  singularity — reads MAX **0.382** against the spheres' 0.957–1.069, with 0 of 42
  probes above the legal single-family line versus 26–37 % on the spheres. A metric
  that separates chart-artefact from lit-form by 2.5× is measuring the chart.

**But the headline is measured on paper that does not exist.** The page is
320 × 220 mm. `criteria.md` §0's own rule is *"A window is scored only if it is
WHOLLY on the page"* — and the ladder test implements it (`windowD` returns null
off-page, with a comment noting the 92 mm ball overruns the top of the sheet).
**`r10local.js` implements no page filter at all** — I grepped it; there is no
bounds test in the file. The consequence, from my own run:

```
W-bigball-bands4  top-5 hot spots at y = −21.8, −24.4, −32.2, −30.9, −7.3
W-bigball-sun45   top-5 hot spots at y = −21.8, −19.4, −26.5, −30.9, −26.5
```

**All ten are above the top of the sheet.** The worst-of-four **1.069**, and the
`probes at or past SOLID: 1` on each `W-bigball` fixture, are entirely off-page —
the only past-SOLID probe in the whole measurement is the one that will never be
plotted. Both on-page fixtures report **0 (0.00 %) past SOLID**.

> **Corrected: on-page worst-of-four is 0.960** (`V-E-bands4-sun45` at (124.9, 43.7)),
> against C15b's 0.90 bar. **C15b is genuinely BREACHED and scores FAIL.** The claim
> "worst-of-four past SOLID" is withdrawn.

**The conclusion the number was cited for survives, on different evidence.** "It is
the chart, not the light" was argued from the two `W-bigball` fixtures putting
their worst point at the same coordinate under two suns — i.e. from the off-page
probe. It reproduces **on-page**: `E-bands4` and `V-E-bands4-sun45`, two different
suns, share hot spots at **(139.9, 50.1)**, **(142.4, 53.9)** and **(136.7, 41.7)**
— three of five, identical to 0.1 mm. A lighting feature moves when the sun moves.
This one does not. The finding stands; cite it from the sphere fixtures.

**One thing the instrument asserts and never checks: that the worst point is the
pole.** It prints coordinates and never compares them to the projected UV
singularity. The negative control makes "it is a chart artefact" solid; "it is the
pole caustic specifically" remains an inference. One line of code would close it.

---

## 4. Found in review, not reported by the round

### 4.1 C15b's worst-of-four is off the page — UNREPORTED

Stated in full at §3.6. It is the same class of defect as `r7audit-protected.js`
printing `cast 0.00mm/0p`, as `facets.js` omitting its own sub-window table, and as
O17's crossing angle reading 65/65/70 beside a live caustic: **an instrument
excluding, or including, the wrong region and being quoted anyway.** It is the
fourth in four rounds, and the first one committed by the round that also wrote the
best-calibrated probe in the workstream — the two closed-form controls check the
instrument's *arithmetic* and neither checks its *domain*.

Round 11 owes `r10local.js` the same wholly-on-the-page filter the ladder test has
had since Round 8, and every number in §3 of the submission re-quoted from it.

### 4.2 The O3 refutation is faceted-only and is stated as general — UNREPORTED

The arrangement instrument is genuine work. I reproduced it exactly on both
fixtures — `W-lp-sun45` F 18/18, L 15/15, M 26/26, R 7/7, T 24/24, all one
component; `R-lp-bands4` T in 3 components, largest 67 % — with scramble controls
collapsing to 17–31 % and a `[probe check]` line confirming 5/5 zones fall below
the threshold under a random assignment. The counter can say SPECKLE. It also
declares its own new 60 % band threshold as `[inferred — Round 10, awaiting
ratification]`, which is exactly the lesson O4 taught and it is good to see it
applied on the same day.

**But all three fixtures are low-poly.** O3's FAIL was scored in Round 9 §5.5 on
the **curved** `E-bands4` sphere in the running app: *"no darker crescent at the
terminator; the darkest area is a ragged diagonal wedge."* Nothing in Round 10
measured the curved path's arrangement, and nothing looked at it.

`criteria.md` line 214 now reads *"The zone map is a clean set of bands. The
failure is in the VALUE the bands are given"* with no scope qualifier, and the
submission's §0 promotes it to the round's headline. **The refutation is true of
the faceted path and unproven on the path where the failure was seen.** Round 11
must either measure curved-path arrangement or restate the claim with its scope.

### 4.3 The round did no live verification — UNREPORTED, and it is a standing obligation

Round 9's plan closes with: *"a criterion is not scored until it has been seen…
they should be re-scored against images every round from now on, and no
qualitative criterion may be carried on a number again,"* and it asks Round 10 to
pin the 18-view in-app set as a visual baseline. **None of that happened, and the
submission does not mention it** — not in §6, "What did not land, and why", which
lists four other omissions honestly.

This matters more than the usual missed item, because the round's central claim is
a claim about *arrangement* — about how the drawing reads — argued entirely from
adjacency counts. The workstream's own one-line summary of Round 9 is "the ratios
were right and the drawings were not." A round that answers an arrangement question
with a new statistic and never opens the app is repeating the shape of the mistake
it is correcting, even where the statistic is a good one.

I record it as a debt, not as a downgrade: the ink-side changes this round are
provably tiny (two baselines, +1 path each; the curved path bit-identical), so no
criterion I would have re-scored can plausibly have moved.

### 4.4 `r8lad.js` still prints the retired 0.10 as O6's bar — UNREPORTED

The O6 ruling landed in `criteria.md` (`51ac6c0`) and in
`scene3d-form-ladder.test.js` (`ca277a4`, reading `Regions.LIT_MAX_PITCH_PEN`). It
did **not** land in the harness that actually prints the ladder. My own run:

```
D(L) 0.073 (spec >=0.10)
```

Three statements of one clause, two updated and one not — which is the precise
failure mode the whole "one constant, not two statements" commit exists to prevent,
surviving in the instrument the reviewer reads first. One line.

### 4.5 The documentation contract was not met

`plans.md`, `CHANGELOG.md` and `README.md` are untouched by all seven commits.
`CLAUDE.md`'s contract table requires all three for "any repository change." The
version is at **1.3.82** in this worktree while `3d-scene/p4` has moved to
**1.3.84**, which is a merge consideration rather than a defect. Minor, and named
so it is not silently inherited by Round 11.

---

## 5. Criterion by criterion

### Cast shadow, C1–C15b

| | R9 | R10 | note |
|---|---|---|---|
| C1 | PASS | **PASS** | geometry bit-identical; cast totals verified per zone at HEAD (§2). |
| C2 | MARGINAL | **MARGINAL** | carried. Sphere's collar is a 105.5 mm stipple. Not attempted this round, correctly declared (§6 of the submission). |
| C3 | PASS | **PASS** | `Z0` 1318.44 / 211 at 2, 3 and 4 layers — measured. |
| C4 | MARGINAL | **MARGINAL** | carried. |
| C5 | FAIL | **FAIL** | carried. Darkest mid-throw. Declared not-attempted with a reason I accept: the fix must change the shadow's *shape* while `Z0` stays bit-identical, and starting it badly is worse than not starting. |
| C6 | PASS | **PASS** | Z2 6521.76 → 5802.40 → 3735.33, enforced. |
| C7 | MARGINAL | **MARGINAL** | carried. Round 10 records its weakest clause narrowing from +0.0449 to +0.0086 — still passing, on a fifth of the headroom. Watch it. |
| C8–C10 | PASS | **PASS** | carried. |
| C11 | PASS | **PASS** | 7840.20 / 8896.92 / 7448.60, measured. |
| C12 | PASS | **PASS** | `Off` 16109.77 / 535, measured. |
| C13 | MARGINAL | **MARGINAL** | carried, same evidence as C5. |
| C14 | PASS | **PASS** | 0 % of crossed windows ≥ 80° on all four fixtures, measured. |
| C15 | PASS | **PASS** | The 4 mm clauses clear (max 0.5062 boolean grid). **The enforcement gap logged against it in Round 9 §4.2 is now closed** — the plot floor is 1.5, single-family coverage 0.6667 < 0.80. Residual named: a zone with a 1.00 cross still composes to 0.8889. |
| **C15b** | — | **FAIL (new)** | Sub-window clause, added this round. Bar 0.90 in a 1 mm disc. **On-page worst-of-four 0.960** (`V-E-bands4-sun45`); `E-bands4` 0.957. The submission's 1.069 and its "past SOLID" claim are off-page (§4.1). Breached on both on-page fixtures; the criterion is right and the number needed correcting. |

### Object, O1–O28

| | R9 | R10 | note |
|---|---|---|---|
| O1 | MARGINAL | **MARGINAL** | T/F 1.713–1.867 holds; no terminator crescent in the app and nobody looked again. |
| O2 | MARGINAL | **MARGINAL** | R/F 0.280–0.401 holds; same. |
| O3 | FAIL | **FAIL** | Arrangement measured and clean **on the faceted path** — a real result. O3's FAIL was scored on the curved sphere and is untouched (§4.2). The relocation of the diagnosis from classifier to ink is accepted and valuable; the criterion is not bought. |
| O4 | PASS | **PASS** | L/M holds under 0.75 on all four. **Now the binding constraint on O6, and it is a Round 9 invention pinned in the round that invented it.** Round 11 must rule on it. |
| O5 | FAIL | **FAIL** | Instrument still absent. **Fourth round owed**, and the round says so rather than claiming otherwise. |
| O6 | FAIL | **FAIL** | 0.0678 worst-of-four against the ruled 0.083, boolean grid. Bar landed in `criteria.md` and in the enforcing test. The prescribed lever measured and disproved (§3.4). Ratchet 0.065 → 0.067. |
| O7 | PASS | **PASS** | carried. |
| O8 | MARGINAL | **MARGINAL** | **Materially improved and still not scorable.** O8's second clause — "never a whole blank face bounded by the object's own edge" — was being violated on a 202 mm² glint facet at N·L 0.898, at *both* prior commits, and is now repaired. The primary clause still has no instrument (same root cause as O5). Nearer to PASS than at any point in the workstream. |
| O9–O11 | PASS | **PASS** | carried. |
| **O12** | PASS | **MARGINAL (was PASS)** | **Downgraded, on the round's own finding.** The namesake test had drifted to a 45° sun no view renders; on the real fixture O12's bands 2→3 step measures **0.0465 against its own 0.05 bar** (curved totals 749.0 and 750.9 at bands 2 and 3 — a quarter of one percent apart). Round 2's defect signature, green for eight rounds. Correctly ratcheted at 0.046 with the spec bar named and the miss labelled, **not** weakened. A criterion under its own bar is not a PASS. Finding it is to the round's credit; the record has to move anyway. |
| O13 | PASS | **PASS** | 0.5062 worst-of-four, boolean grid, asserted per fixture. The instrument is now pinned to the bar in `criteria.md` — plan item 9, done. |
| O14–O16 | PASS | **PASS** | carried. |
| O17 | MARGINAL | **MARGINAL** | Statistic holds (0 % ≥ 80°, median 65, max 70). **The caustic now has a number** (C15b) and a negative control that separates it from the lit form by 2.5×. It is measured, not fixed, and the submission says so. |
| O18 | PASS | **PASS** | carried. |
| O19 | PASS | **PASS** | carried. |
| O20 | MARGINAL | **MARGINAL** | Ordering clause holds. Lit-face Δ still under 0.03. **Plan item 10 — pick an instrument, restate the bar — was not done.** But the round returned something better than a number: §5.3's second direction was built, measured and **withdrawn** because it re-breaks O20 by 0.0072 on two same-zone facets whose intended tone is *identical* (both aiming at 0.1818; `+X` lands closer to the recipe than `+Z` does). **I accept the withdrawal and I accept the finding: O20's ordering clause cannot adjudicate two facets of one zone with the same intended tone. It needs a tolerance or a same-zone exemption before §5.3 can be bought.** That is now the blocker, ahead of the instrument question. |
| O21 | PASS | **PASS** | 1.66× on both low-poly fixtures, reproduced by me (n = 19/17 and 5/9). **And the §4.4 objection is answered**: the aggregate no longer stands alone — every zone is one connected component with a scramble control at 17–31 %. Plan item 15, done. |
| O22 | PASS | **PASS** | Gate read from `Regions.smoothShadedFaces`; T facets present on the low-poly and none on the cube fixtures. |
| O23 | MARGINAL | **MARGINAL** | n = 2 and n = 1, printed UNMEASURED. Needs a **visibility** change; not attempted. Carried a third round. |
| O24, O25 | PASS | **PASS** | carried. |
| O26 | FAIL | **FAIL** | Instrument still absent. **Fourth round owed**, declared. |
| O27 | MARGINAL | **MARGINAL** | Wording lost with the spec. |
| **O28** | MARGINAL | **PASS (was MARGINAL)** | **Measured, and I re-measured it.** `facets.js --o28 Gp-yaw-30 Gp-yaw-18`: 523 visible facets each, **496 visible in both, 0 differ**, largest \|ΔI\| across shared facets `0.00e+0`. The probe was shown able to say NO — halving the tone thresholds moves 175 of 523. 27 facets appear in only one view; turning away is not a re-grade and the comparison is correctly per-`objectId/faceId` over the intersection. **And the round found a defect in the plan's own framing**: `Gp-*` are the trio views and `facets.js` only ever walked `np.objects[0]`, so as I specified it O28 would have answered on **3 facets**. The instrument now walks every object — "3 objects in the view, ALL measured." Downgraded in Round 9 for never having been measured; measured now, so it goes back. |

**Totals: 26 PASS / 12 MARGINAL / 6 FAIL, of 44.**

---

## 6. Merge readiness — **NO, not yet, and the reason is not this branch**

**Users have the sliver flood today** — an edge-on face at 4.5× the front face's ink
density, rendering as a solid slab, confirmed in the running app in Round 9 §5.2.
The fix is on this branch and the last thing blocking it (§3.1) is now cleared.
**The branch's own state is merge-worthy: 5/5 suites green, protected list intact,
two baselines moved by exactly the fix.**

**It is not safe to merge as-is**, and this is the most consequential thing in this
document. `3d-scene/p4` has moved to `c5a303e` / v1.3.84. Merge base is **`98289be`**.

**Textual conflicts — 139 hunks in 10 files:**

| file | verdict |
|---|---|
| `src/core/scene3d/surface-fill.js` | **CLEAN (0 conflicts) — and this is the dangerous one** |
| `src/core/scene3d/regions.js` | CLEAN (one-sided; p4 never touches it) |
| `src/core/algorithms/scene3d.js` | **CONFLICT — 1 hunk** |
| 9 × `tests/baselines/scene3d/tone/{parity-box-and-sphere, sphere-*}.json` | **CONFLICT — 138 hunks** |

**The one code conflict is a design question, not a text collision.** Both sides
edit the block just after `Edges.classifyEdges`: shadow-anatomy **deletes** the
per-face outline pass and its `isOutlineFaceEdge` / `edgeKey3` helpers (§3.2 — "the
structural edge pass is the sole owner"); p4 **keeps** them and inserts
`borderWanted` / `borderEdges` / `edgePlan` beside them for its contiguous-silhouette
and welded-chain work (`25bca1d`, `d9b67cb`). Both are answering *who owns the
object outline* and answering it differently. It cannot be resolved mechanically.

**The clean merge of `surface-fill.js` is the real hazard.** Both branches rewrote
the same ~200 lines of `emitLine` on non-overlapping lines. shadow-anatomy added
`zoneCeiling` / `crossWeightAt` feeding `covCapped`; p4 rewrote the `dropZone`
hysteresis that **consumes `covCapped`** forty lines below, plus a run sink with
gap bridging (`BRIDGE_PEN`), speck culling and an unconditional emission floor.
Git will interleave them happily and produce code neither author ran.

**And p4's fragmentation fix changes the quantity this workstream measures.**
Bridging re-adds skipped sample points so a dither gap no longer ends a run — two
paths become one **and total ink increases**. Speck/floor culling removes short
runs — **ink decreases**. p4's own commit records that a symmetric hysteresis
pushed a 4 mm window to 0.571 against `scene3d-plot-safety`'s protected 0.56
ceiling, and that charging the margin on every start cost 13–20 % of fill ink
across the tone goldens. Directly at risk post-merge:

- **`scene3d-subwindow-density.test.js` (C15b)** — bridging puts continuous ink
  through gaps that previously had none, which raises local coverage in exactly the
  neighbourhoods this probe interrogates. C15b's numbers will move.
- **`max(object) ≤ 0.56`** — p4 tuned against this ceiling on the *old* rig;
  post-merge it is evaluated on the fixture rig with a different fill engine.
- **`scene3d-ground-double-plot.test.js`** — duplicate detection is
  path-identity-sensitive; merging runs perturbs it directly.
- **Every tone baseline** — p4 alone moved `parity-box-and-sphere` 134 → 141 paths.
  These 9 goldens have no correct hand-resolution and **must be regenerated after
  the code merge settles**, not resolved.

There is a quieter hazard too: p4's curve-defaults work (`c78e8aa`, `5b45891`) makes
rounded shapes born with Border + Fill Curves on and moves fill-line settings into
the style cascade. The fixture's `styleTable(p.objects)` builds style params
directly and would silently inherit defaults it was never authored against.

**No overlap at all** with p4's X-ray/ctxbar (UI files only) or draw-order
(`renderer.js`, `engine.js`) work.

### The recommended path — and it should not wait

The sliver flood is a live user-facing defect and this branch is the fix. But
merging it blind would land an unreviewed interleave in the fill engine.
**Sequence it as Round 11's item 0:**

1. Resolve the `scene3d.js` outline-ownership conflict **by hand, deliberately** —
   decide whether p4's `edgePlan` / `borderEdges` still needs `isOutlineFaceEdge`
   once the face-outline pass is gone. Neither side's answer is automatically right.
2. **Read the merged `emitLine` end to end** before trusting the clean merge, with
   both authors' intent in view. This is the single highest-risk region in the merge
   and git will report it as fine.
3. Regenerate **all** tone baselines (`box-*` included — shadow-anatomy moved those
   too) from the merged renderer.
4. Re-run the full harness — ladder, `facets.js`, `r10local.js`, `r8audit-protected.js`
   — and **expect `scene3d-plot-safety`, `scene3d-subwindow-density` and
   `scene3d-ground-double-plot` to need re-tuning rather than re-pinning.**
5. **Then look at it in the app.** The merged fill engine is not either branch's
   drawing, and this workstream's own lesson is that nobody knows what a merged
   renderer draws until somebody opens it.

Until 1–5 are done: **do not merge.** After them, merge promptly — the flood has
been in users' hands for two rounds.

---

## 7. On `criteria.md`

The reconstruction continues to be the right call and the provenance tags continue
to earn their keep. Corrections owed:

1. **C15b's row overstates itself.** It reads *"Currently BREACHED on all four
   fixtures: 0.957 / 0.960 / 1.069 / 1.069, worst-of-four past SOLID."* The two
   1.069s are off-page. Restate as **on-page worst-of-four 0.960; two fixtures
   measured on-page, two of the four fixtures' worst points fall off the sheet and
   are excluded per §0's own wholly-on-the-page rule.**
2. **§4's O3 row needs its scope.** "The zone map is a clean set of bands" is
   measured on three low-poly fixtures. The FAIL was seen on the curved sphere.
3. **O6's row should record that `LIT_MAX_PITCH_PEN` is a ratchet, not a lever** —
   floor and bar are the same expression, so the constant can never buy the
   criterion (§3.4). And the row should carry the disproof of the Round 9 lever,
   which currently exists only in a commit message.
4. **O4 must be marked as the binding constraint on O6**, alongside its existing
   `[inferred — ROUND 9 INVENTION AWAITING RATIFICATION]` tag. It has stopped being
   inert.
5. **O12 moves to MARGINAL** with its 0.0465-against-0.05 measurement.
6. §0's fixture rule can drop "broken five times" as a live warning and cite
   `scene3d-fixture-single-source.test.js` as the enforcement.

---

## 8. The Round 11 plan, in priority order

### P0 — ship the fix, then rule the two open questions

**0. Land the merge to `3d-scene/p4`, by the five-step sequence in §6.**
Users have the sliver flood. This is the round's first job and it is a day's
careful work, not a formality. Do not let it slide behind measurement work again.

**1. RULE ON O4's `L ≤ 0.75 × M`. It is now the only thing between O6 and its bar.**
Two rounds have been spent on the L zone and both were stopped by a floor that was
invented in Round 9, pinned as a test in the same round, and flagged as
near-circular by its own author. Round 10 proved it binding: every lever that
reaches D(L) ≥ 0.083 breaches it, and spending the whole remaining F/M margin on M
still lands L/M at 0.810. **Either ratify 0.75 with a rationale — in which case O6
at 0.083 is formally unreachable through the coverage rows and needs a different
mechanism — or move it.** Do not spend a third round on the L zone before this is
answered. It is a ruling, not an experiment.

**2. Give `r10local.js` the wholly-on-the-page filter, and re-quote §3 of the Round
10 submission from the corrected instrument (§4.1).**
Same rule the ladder test has had since Round 8, in the file that does not have it.
Then re-derive C15b's worst-of-four and pin *that*. RGR: the filter must change the
`W-bigball` numbers and leave `E-bands4` untouched.

**3. Re-open the app. Nine rounds of numbers, one round of looking, none this
round (§4.3).**
Round 9 built the harness (`docs/shadow-anatomy/live-verify/harness/`) and pinning
the 18-view set as a visual baseline was plan item on the P2 list and did not
happen. Do it now, before the merge changes the drawing — a pre-merge appearance
baseline is worth far more than a post-merge one. Then re-score O1 / O2 / O3 / O8 /
C4 / C5 / O26 against images.

### P1 — the drawing

**4. O3 on the curved path (§4.2).**
The faceted arrangement result is good and it does not cover the fixture where O3
failed. Either extend the arrangement instrument to curved samples — the zone map
is already computed per sample in the ladder — or restate the refutation with its
scope. The relocation "the failure is in the VALUE, not the classifier" is
plausible and unproven where it matters.

**5. O20's ordering clause needs a tolerance or a same-zone exemption (§3.5, and
Round 10 §2).**
This now blocks §5.3's second direction, which is the fix for "5 strokes reads as
bare paper" on the narrow facet. The round built the lever, measured it to 2.5 % of
its own prediction, and could not ship it because a clause designed to catch a
*bug* (a facet out of order with its neighbours' N·L) fires on two facets of one
zone whose intended tone is identical. Fix the clause, then take the lever — the
arithmetic is already in a source comment so it does not have to be rebuilt.

**6. The sphere's cast shadow (C5 / C13 / C2 / C4).**
Third round on the list, correctly declared not-attempted twice. Darkest mid-throw,
contact end and far tip equal; the cube reads correctly, so it is sphere-specific.
The fix must change the shadow's *shape* while `Z0` stays 1318.44 / 211. Budget a
whole round.

**7. Fix the pole caustic, now that it has a number (§3.6).**
C15b gives it a measurement, a negative control and a location. The fix is a cap on
local ink density near the chart singularity, spent as §0's craft rule says — into
a second direction, or into rulings terminating short of the pole. Do it after item
2 so it is scored against a corrected instrument.

### P2 — the standing debts, and one that is now fourth-round

**8. O5 / O8's highlight-area instrument. Fourth round owed.** Build it or formally
withdraw O5. O8 is closer to PASS than it has ever been (§5) and the only thing
missing is the number.

**9. O26's banding instrument. Fourth round owed.** D step across a band boundary
against the D gradient within a band. It is now a *seen* FAIL with app evidence,
which is a better place to build from than an absence.

**10. `faceLightDrivenLines`.** Untouched a third round, with no fixture and the
120-view evidence fingering it twice. Build the fixture.

**11. O23 needs a visibility change**, not a bigger fixture — lower the camera or
tilt the object so the down-facing ring is not back-facing. `n = 1–2` for three
rounds.

**12. Three small things, one line each.**
- `r8lad.js` still prints `spec >=0.10` for O6 (§4.4).
- The `face:21` arithmetic is quoted three ways in three places (§3.1).
- `run-vitest.js` declares its own pass on an RPC timeout (§1).

**13. `F-trio`'s 6.02 mm `sceneFill` retrace** on the capsule, found and pinned by
`ef387c5` rather than fixed because fixing it moves tone numbers. Carry it into the
post-merge re-tune, where the numbers are moving anyway.

**14. `plans.md` / `CHANGELOG.md` / `README.md`** (§4.5).

---

## 9. For the record — what Round 10 did that should be repeated

Three behaviours, because this workstream has spent ten rounds learning them and
they all appeared at once:

- **It measured the reviewer's prescription and refused it.** Twice — the O6 lever
  (a ten-row table showing `GLINT_KEEP` never becomes live and the cost model
  assumed a per-fixture lever), and the plot floor's "≥ 1.25" (where 1.25 gives
  exactly 0.80, the breach threshold, so the *relation* was wrong too). Both
  refusals are correct and I have accepted both.
- **It built a lever, measured it to 2.5 % of its own prior prediction, and threw
  it away** rather than prescribe something that fails a criterion — leaving the
  arithmetic in a comment so the next round does not rebuild it.
- **It reported against itself four times**: the first version of `r10local.js`
  printing `INSTRUMENT WRONG — do not quote`; `82789c4` leaving a second copy of
  the ceiling law that `ca277a4` then found and removed; the `face:26`/`face:89`
  invariant being violated *at both baselines* rather than only at the one under
  review; and O12's ratchet recorded as a labelled miss rather than tuned green.

The two partial items (§3.4, §3.6) are both cases of a commit message or a headline
claiming slightly more than the code and the source comments claim. In both, the
honest statement is already written down inside the change. That is a reporting
discipline problem, not an engineering one, and it is a much better problem to have
than the one this workstream started with.
