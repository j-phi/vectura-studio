# Round 9 — scorecard, and the Round 10 plan

Reviewer: visual designer, Round 9. Branch `shadow-anatomy`, HEAD `8c0f249`.
Baseline: Round 8 at `75b97a5`, scored **35 PASS / 4 MARGINAL / 4 FAIL**.
Commits under review: `ad73640`, `33ac242`, `033c540`, `de9a14a`, `2fbe105`, `8c0f249`.

**This file is the deliverable.** The scratchpad at `/private/tmp` is pruned between
sessions — that is how the original spec (`design-shadow-anatomy.md`) and the Round 2–5
scorecards were lost. Every number below is written down here, with the command that
produced it, so the next round does not have to take my word for anything either.

---

## 0. Verdict

# ACCEPT the round — 26 PASS / 12 MARGINAL / 5 FAIL

**Read those two halves separately, because they are about different things.**

**ACCEPT** is a judgement on Round 9's work, and it is not close. The P0 landed; its
central claim survives an independent derivation and an independent measurement I
performed without using any formula from the implementation (§2); it is corroborated a
third time in the running app (§5). The evidence owed for four rounds was delivered and
its two load-bearing claims survive adversarial re-measurement (§3.2). The round reported
three things against itself, including one it could have hidden.

**26/12/5** is a judgement on the *record*, and it is a nine-round correction arriving at
once. Live verification finally happened (§5) — the first in this workstream — and **nine
criteria that had been carried as PASS on harness numbers do not survive being looked
at.** Every one of the nine was failing before Round 9 and is failing after it,
unchanged. Round 9 did not cause a single downgrade below.

| | R8 | R9 | why |
|---|---|---|---|
| PASS | 35 | **26** | +C15 (bought, §2) · −O28 (unmeasured 4th round) · **−9 to live verification** |
| MARGINAL | 4 | **12** | +O20 (F→M, half bought) +O28 +C2 +C4 +C7 +C13 +O1 +O2 +O17 · −C15 |
| FAIL | 4 | **5** | −O20 · **+C5, +O3** (both on the image) |

**The one-line version: the ratios were right and the drawings were not.** T/F, F/M, R/F
and the O17 crossing-angle statistic have all been passing for three rounds on windows
labelled by zone. In the app there is no terminator crescent, no reflected-light band, a
cast shadow that is darkest in the *middle* of its throw, and a radiating caustic knot at
the sphere's pole that is the brightest thing in the drawing. A statistic computed over
zone-labelled windows confirms that windows *labelled* T carry more ink than windows
*labelled* F. It cannot confirm that they form a band, and they do not.

**This was independently predicted from inside the harness this round.** Before I saw any
live artefact, §4.4 below records that on `W-lp-sun45` two facets at N·L 0.746 and 0.744
measure D 0.000 and D 0.163, and that O21 passes on an aggregate that is structurally
blind to arrangement. The app shows the same failure on the curved path. Two independent
routes to one conclusion: **the tone system places the right amount of ink and places it
in the wrong shape.**

**What keeps ACCEPT from being clean.** Three findings the submission does not contain,
all in §4: an unreported behaviour change at the limb, a structural defect in the plot
floor of exactly the class the round just fixed, and an instrument-mixing error in the
submission's own headline number — committed in the same round that wrote the rule
against it.

---

## 1. Ruling — O6

> The engineer's position: the prescribed fix does not work; `LIT_MAX_PITCH_PEN` is dead
> at 12, 10 and 8; the spec contradicts itself (12 × pen ⇒ 1/12 = 0.083 vs O6's 0.10);
> and the only lever that reaches 0.10 breaches a protected item.

### 1.1 What I verified

**Every measurable claim they made is true, and I extended two of them.**

| claim | verdict | my evidence |
|---|---|---|
| `raw × GLINT_KEEP` = 0.42 × 0.6 = 0.252 | **TRUE** | `FORM_INK.L.coverage = 0.42`, `GLINT_KEEP = 0.6` read from `regions.js` / `surface-fill.js`. Instrumented on the live path: `[L] raw=0.42 capped=0.2100 glint=0.2520 litFloorCov=0.1835 => cov=0.2520` |
| §5.4 #1 and O6 contradict each other by 20 % | **TRUE, and structural** | `o6Pitch = LIT_MAX_PITCH_PEN × penWidth × litCov` (`surface-fill.js:516`). When it binds, D(L) = `pen × litCov / o6Pitch` = **1/12 = 0.0833** exactly, regardless of pen or coverage. It cannot pass a 0.10 bar. |
| `LIT_MAX_PITCH_PEN` is dead at 12, 10, 8 | **TRUE — and I add 6** | I swept 12 / 10 / 8 / **6** on the four-fixture ladder. D(L) is **bit-identical** at all four values on three fixtures; `W-bigball-sun45` moves only at 6 (0.0889 → 0.0918). The constant that names O6 in its own comment has no effect on O6's measurement. |
| the only lever that reaches 0.10 takes L/M to 0.73–0.92 | **TRUE** (mine: 0.76–0.87) | scaling each fixture's D(L) to 0.10 gives L/M 0.816 / 0.761 / 0.871 / 0.836 — all four breach the 0.75 step floor. |

Reproduced independently, HEAD, boolean-grid instrument (the one that gates CI):

```
view                 L      M      T      F      R      max    L/M    F/M    T/F    R/F   max/L
E-bands4           0.0694 0.1226 0.3788 0.2014 0.0752 0.5062 0.5662 1.6423 1.8810 0.3733 7.29
V-E-bands4-sun45   0.0678 0.1314 0.3515 0.2017 0.0829 0.4750 0.5157 1.5348 1.7424 0.4109 7.01
W-bigball-bands4   0.0762 0.1148 0.3349 0.1905 0.0540 0.4700 0.6637 1.6601 1.7579 0.2833 6.17
W-bigball-sun45    0.0865 0.1195 0.3399 0.1877 0.0545 0.5056 0.7234 1.5704 1.8105 0.2902 5.85
```

D(L) reproduces the submission to the digit. `max` does **not** — see §4.3.

### 1.2 Where their diagnosis is wrong, and why it matters

> *"Removing L's ceiling outright buys +0.007. **The ceiling is not the binder.**"*

**That conclusion is an artefact of their own method.** There are **two ceilings in
series**, and one-lever-at-a-time measurement cannot see either, because each hides
behind the other.

I proved the masking directly. `GLINT_KEEP` 0.60 → **1.00** removes L's specular damping
entirely — L's requested coverage goes 0.252 → 0.42, a **67 % increase**:

```
GLINT_KEEP   E-bands4   V-E-sun45   W-bigball   W-sun45
   0.60       0.0694      0.0678      0.0762     0.0865
   0.90       0.0694      0.0678      0.0785     0.0918
   1.00       0.0694      0.0678      0.0785     0.0918
```

**Exactly zero movement on two of four fixtures.** A 67 % increase in the requested
coverage produces no ink, because the result is clamped downstream. Their own combined
row — ceiling floored **and** damping removed → 0.100 / 0.095 / 0.099 / 0.106 — is the
proof that both must move, and they published it and then drew the opposite lesson from
the rows either side of it.

**The clamp, located.** `surface-fill.js:740–758`:

```
ceil = TOTAL_DARK_CEIL × clamp(weight / DARKEST_WEIGHT, 0, 1)
```

For L: `weight = coverage + cross = 0.42 + 0 = 0.42`, `DARKEST_WEIGHT = 2.0`,
`TOTAL_DARK_CEIL = 0.47`.

> **ceil(L) = 0.47 × 0.42 / 2.0 = 0.0987**

**O6's own ceiling sits below O6's own bar.** Not by 20 %, not by tuning — by
construction. No value of `LIT_MAX_PITCH_PEN`, `GLINT_KEEP`, `LIT_FLOOR` or
`litFloorCov` can lift a zone past a ceiling that is 0.0987. Round 8's reviewer quoted
this exact arithmetic (it is in the test comment) and then prescribed "a floor on the L
zone only" — a floor under a ceiling. That is why the prescription could not work, and
the engineer is right to have refused to tune it.

### 1.3 The finding neither of us started with: it is a SPAN problem

O6 (mean D(L) ≥ 0.10) and O13 (max D ≤ 0.56) do not each constrain the ladder. Together
they constrain its **dynamic range**:

> required span = 0.56 / 0.10 = **5.6 : 1**
> measured span (`max / L`, same drawing, same instrument) = **7.29 / 7.01 / 6.17 / 5.85**
> §5.0's own words: *"the span the design needs is ~8:1"*

**§5.0, O6 and O13 are three-way unsatisfiable.** Every fixture exceeds the window the
two criteria leave, and the spec's own stated ambition (8:1) exceeds it by 43 %. This is
strictly stronger than the two-way contradiction the engineer found, and it explains why
every lever tried in three rounds has failed: the levers move the ladder, and the
problem is not where the ladder sits but how tall it is.

### 1.4 THE RULING

**O6's 0.10 gives. The bar becomes `D(L) ≥ 0.083`, i.e. `1 / LIT_MAX_PITCH_PEN`.**

Neither the ceiling law nor the criterion's intent gives. The *number* gives, and it
gives to the number the spec already states elsewhere for the same thing.

Why the 0.10 and not the 12:

1. **O6 and §5.4 #1 are one clause in two units.** "The centre light carries visible
   tone" is stated once as a raster fraction (0.10) and once as a pitch in pen widths
   (12 × pen). They disagree. **The pen-width statement is the real one**: it is in the
   medium's own units, it survives a pen change, and it is what a plotter operator can
   check. The raster fraction is instrument-dependent — the two live instruments differ
   by ~6 % on the same drawing (§4.3), which is most of the gap being argued about.
2. **It is the only one of the three numbers with no derivation on record.** `0.56`
   (O13) is relational and protected; `~8:1` (§5.0) is the design's stated ambition;
   `12 × pen` has a craft rationale written beside it. `0.10` has nothing — and a
   reconstructed spec is exactly where a mis-transcribed 1/12 → 0.10 would survive.
3. **It is reachable, and the other reading is not.** At 0.083 the required span becomes
   6.75 : 1, which three of four fixtures already satisfy. At 0.10 the required span is
   5.6 : 1, which none do.

**O6 does not thereby become free, and it stays FAIL.** Measured D(L) is 0.0694 / 0.0678
/ 0.0762 / 0.0865 — **three of four still miss 0.083.** What changes is that the
criterion is now reachable and the lever is named.

**The lever, for Round 10** — and I tested it, so it is not another prescription that
turns out to be inert:

> `ceil(L)` must clear the bar before anything else can. Raise `FORM_INK.L.coverage`
> 0.42 → **0.50**, which lifts `ceil(L)` to 0.47 × 0.50/2.0 = **0.1175** and leaves
> `ceil(T)` = 0.47 untouched — so `max(object)` does not move at all, and O13's margin is
> not spent. Then, and only then, `GLINT_KEEP` becomes live and can be trimmed to place
> D(L) at 0.083. Both must move; either alone is inert (proved above).
> Cost to watch: L/M rises. The headroom is real — worst L/M is 0.723 against 0.75, and
> reaching 0.083 needs at most ×1.23 on the fixtures that are furthest under, which lands
> L/M at 0.634 / 0.679 / 0.725 / 0.723. **It fits, with margin, on all four.**

**Consequential edits owed:** `criteria.md` O6 → `D(L) ≥ 0.083 (boolean grid)`, with a
note that the 0.10 was retired as a mis-statement of §5.4 #1 and by whom; §5.0's "8:1"
flagged as unsatisfiable alongside O13 until someone rules on it; the ratchet in
`scene3d-form-ladder.test.js` retargeted at 0.083.

**And the second-order ruling:** `LIT_MAX_PITCH_PEN` is, at every value from 6 to 12,
inert with respect to the criterion it cites in its own comment. It is not a lever; it
is a comment. Either wire it to `ceil(L)` so the two statements of §5.4 #1 cannot drift
apart again, or delete it. It must not survive Round 10 as a constant that appears to
control something it does not.

---

## 2. Ruling — the sliver fix

> The engineer's position: the R9 plan's "the composed budget is bypassed 3.7×" is wrong;
> `+X` and `+Z` receive identical parameters; the real defect is that `uvCompression`
> returned `|M·a|` where the paper pitch is `|det M| / |M·d|`.

### 2.1 The derivation — checked from scratch

Rulings run along `d`, spaced `s` apart perpendicular, in the surface plane. Under the
uv→screen map `M`:

- one unit of ruling length maps to length `|M·d|`;
- the strip between adjacent rulings has area `s × 1` per unit ruling length, and maps to
  area `s × |det M|`;
- that mapped strip is bounded by two mapped rulings of length `|M·d|`, so its
  perpendicular width — **the pitch on paper** — is `area / length`:

> **paper pitch = s × |det M| / |M·d|**

**The derivation is correct.** And the failure mode is exactly characterised: since
`|det M| = |M·d| · |M·a| · sin φ` where `φ` is the angle between the mapped along- and
across-directions, the old measure and the truth are related by

> `|M·a| / (|det M|/|M·d|) = 1 / sin φ`

They agree **iff `sin φ = 1`**, i.e. iff the map preserves the right angle between ruling
and spacing — no shear. As a facet turns edge-on, `φ → 0` and the error diverges without
bound. That is precisely the claim, and it is right.

I also confirmed the sign of the argument: the old code called
`uvCompression(scaf, baseAngle + 90)` — the **across** direction — and the new code calls
`uvPitchFactor(scaf, deg)` with `deg` the family's **own** hatch angle, which
`hatchPolygon` (`geometry3d.js:1145–1153`) uses as the direction the lines *run*. The
convention matches the derivation.

### 2.2 The measurement — mine, not theirs

Their coverage model is internally consistent (I re-derived every cell: at pen 0.3,
`+Z` = 0.3/1.977 + 0.3/11.51 = 0.152 + 0.026 = 0.178; `+X` = 0.3/0.385 + 0.3/1.042 =
0.779 + 0.288 = 1.067). But internal consistency is not evidence. So I measured the
thing itself.

**Method (independent of every formula in the implementation):** run `R2-cube-bands4`,
take every `kind: 'sceneFill'` segment carrying `sceneTarget.faceId`, bucket by screen
direction, project each family's segments onto its own perpendicular axis, and read the
**median gap between adjacent rulings, on paper, in mm.**

```
                        BASE 75b97a5                    HEAD 8c0f249
face:+X   family A   0.3778 mm  cov 0.7941   →   1.9418 mm  cov 0.1545
          family B   1.0333 mm  cov 0.2903   →   (no second family fits)
face:+Z   family A   1.9772 mm  cov 0.1517   →   1.9802 mm  cov 0.1515
          family B  11.5491 mm  cov 0.0260   →   9.9352 mm  cov 0.0302
face:+Y   (lit)     12.6426 mm  cov 0.0237   →  14.6641 mm  cov 0.0205
```

**Their model predicted `+X` family A at 0.385 mm and family B at 1.042 mm. I measure
0.3778 and 1.0333 — 2 % and 1 %.** `+Z` predicted 1.977 / 11.508, measured 1.9772 /
11.5491. The requested screen pitch at HEAD is 1.9799 mm; `+Z` lands at 1.9802 and `+X`
now lands at 1.9418 — **the two siblings finally rule at the same pitch on paper, which
is the entire point.**

Composed coverage at base: `+X` = 0.794 + 0.290 = **1.084** (solid black, and past 1.0
because two families cross). At HEAD: **0.155**.

**RULING: the derivation is correct, the diagnosis is correct, the correction of the
R9 plan's "bypassed 3.7×" is accepted, and the result is confirmed independently to
within 2 %. This is the strongest single piece of work in the workstream to date.**

### 2.3 Seen, not only measured

`r8all/CROP-cube-BEFORE-r8.png` vs `r9all/CROP-cube-AFTER-r9.png`, both at 4×. Before:
the right-hand sliver is a **solid black stripe** that reads unambiguously as a drawn
border — the cube looks like it has a keyline down one side. After: it carries a legible
sparse hatch and reads as a *narrow face*, continuous in value with the form-shadow face
beside it. Confirmed by eye. The criterion this buys back is not just C15's number; it is
that the cube stops reading as an outlined box.

### 2.4 Consequences I accept, and one I flag

- **O20 ordering** `OUT OF ORDER → in order` at bands 2/3/4 — follows necessarily from
  D(+X) 0.891 → 0.161 with `+Z` and `+Y` unmoved.
- **O21** 1.43–1.57× → **1.65× / 1.66×** — I re-ran `r8lad.js` + `facets.js` myself on
  `W-lp-bands4` and `W-lp-sun45` and reproduce 1.65× (n=15/23) and 1.66× (n=19/17).
- **O23** `W-lp` 0.51×, n=2 — reproduced, and correctly reported as UNMEASURED.
- **Flagged:** `+X` at HEAD carries **only one family**, where its sibling `+Z` at the
  same zone and the same recipe carries two. This is geometrically honest (family B's
  paper pitch would be ~9.9 mm and the sliver is narrower than that, so no line fits) and
  it is the intended consequence of the k-floor drop 0.12 → 0.02. It is not a defect. But
  §5.0 says the dark end **must** gain a crossed family, and a zone-F facet that silently
  has none is a case the spec does not cover. Round 10 should say what a facet too narrow
  to hold its second family is supposed to do — currently it just quietly reads lighter.

---

## 3. Verification log

### 3.1 Protected list — INTACT

Re-run at HEAD through `r8audit-protected.js`, which now carries a mutation check that
refuses to print unless a deliberately-wrong field read finds zero and a correct read
finds non-zero. That check exists because `r7audit-protected.js` printed `cast 0.00mm/0p`
for an entire round while its output was quoted as a protected-list table — an ACCEPT
resting on an instrument that could not have produced its own numbers.

| item | state |
|---|---|
| `Off` cast 16109.77 mm / 535 paths | **held** |
| Layers 2/3/4 cast 7840.20 / 8896.92 / 7448.60 | **held** |
| `Z0` 1318.44 / 211 at every layer count | **held** |
| `shadow-additive-default.json` `castShadow` 191 p / 4248.7242 | **byte-identical** — verified as diff *context* while its siblings moved |
| O17 crossing angle: 0 % ≥ 80°, median 65 | **held** |
| `F/M ∈ [1.45, 1.70]`, `T/F ≥ 1.25` | **held** — my own measurement 1.535–1.660 and 1.742–1.881 |
| `max(object) ≤ 0.56` worst-of-four | **held** — but see §4.3, the quoted number is off-instrument |

### 3.2 The 120-view render — the evidence owed for four rounds

Re-rendered independently at both commits (temporary detached worktree at `75b97a5` with
HEAD's harness copied in, so `src/` is the only variable). **My renders reproduce the
engineer's `r8all` and `r9all` byte-for-byte, 120/120 each.**

| claim | verdict |
|---|---|
| 43 byte-stable / 77 moved | **TRUE** (exact) |
| **every one of the 77 moved DOWN in ink** | **TRUE** — measured two independent ways; 77 down, **zero up, zero equal-but-not-identical**. A universal, tested as one, and it holds. |
| 0 views' cast-shadow ink moved | **TRUE, and stronger than claimed** — 30 of 120 views carry cast-shadow geometry and **26 of those 30 are in the moved set**, so the claim is not vacuous. All 30 SHA-256 hashes of the full-precision coordinate stream are identical. |
| 14 goldens moved, 0 `sphere-*`, `box-tone-off` byte-identical | **TRUE** (exact) |

Largest movers: `R2-cube` −28.18…−29.01 %, low-poly family −16.59…−18.30 %, trio
−2.99…−3.79 %, `A-*` −0.116…−0.174 %.

**Two narrative errors** (the numbers are right; the descriptions are not):

- *"43 byte-stable — every curved-only view"* is **false**. 6 of the 43 are not curved
  geometry: `H-lightdriven-{blank,sparse,stippleOut}` and
  `H-lp-lightdriven-{blank,sparse,stippleOut}`. The real invariant is *curved-only **or**
  lightDriven-highlight with a fill-suppressing treatment*.
- *"every `box-*` toned golden moved"* is **false**. 11 of the 13 toned box goldens
  moved; `box-highlight-lightdriven-sens1` and `-sens6` are byte-identical, and
  `scene3d-tone-baseline.test.js:272-273` builds them with the default `toneBands(3)`, so
  they are unambiguously toned. Same exemption, same unnamed cause.
- *"cube-only H/I/J/L views −5…−10 %"* misdescribes a spread that actually runs
  **−0.82 % to −18.30 %**.

These matter for one reason only: the unnamed exemption is `faceLightDrivenLines`, which
is the code path the round itself flags as carrying **no foreshortening compensation at
all** (§4.1). The submission's own evidence points at the defect it declared, and the
narrative walked past it.

### 3.3 Suites — re-run, zero failures

| suite | measured | claimed |
|---|---|---|
| unit | **3826 passed**, 1 skipped | 3826 ✓ |
| integration | **1570 passed** | 1570 ✓ |
| visual | **110 passed** | 110 ✓ |
| e2e | **62 passed**, 0 failed | 61 — off by one, no failures |
| perf | **7 passed** | 7 ✓ |

The 1 skipped unit test is pre-existing and unrelated. Node 20 required; Node 18 fails
vitest. Pre-existing and worth naming: `test:e2e` enumerates five spec files by name, so
`tests/e2e/mask-shift-drag.spec.js` and `tests/e2e/visual.spec.js` **never run**.

The new `scene3d-projected-pitch.test.js` was independently RED-proved at `75b97a5`:
**7 failed / 10 passed of 17** — the three `R2-cube` ceiling tests (`+X` coverage 0.969 /
1.007 / 1.046 against 0.56), the `+X`/`+Z` ratio at 5.84 against a < 2.0 bar, and the
three ordering tests. Exactly as claimed. O20's ordering clause is genuinely asserted on
**both** cube fixtures, and its lit-face clause is pinned at **0.015** against a stated
spec bar of 0.03 — a ratchet recording a miss, correctly labelled as one in the test's own
header.

### 3.4 The fixture module

`tests/fixtures/scene3d-shadow-anatomy.js` (120 views) is now the single definition, and
`scripts/shadow-anatomy/README.md` states the rule in the imperative. This is the fifth
round in which the rule has been at issue and the first in which it is structurally
enforceable rather than a paragraph in a review. `render.js` re-exports it rather than
owning it; the ladder test was found restating a **fifth** fixture and moved. Accepted.

`facets.js` now calls `Regions.smoothShadedFaces` rather than mirroring the 40° gate —
verified by the fact that the new `facets.js` **cannot run at all** against `75b97a5`
(`TypeError: R.smoothShadedFaces is not a function`). An instrument that fails loudly
against the old source is an instrument that is genuinely reading it.

**One instrument gap found.** `facets.js` documents, in its own header, that facets too
small to hold a 4 mm window "report `n=0` and are listed separately rather than silently
dropped." They are **not** listed — the header line counts them ("35 visible facets are
smaller than the protocol's own window") and the table omits them entirely. That is where
§4.1's finding was hiding.

**And the single-source claim is true of the scripts but NOT of the tests.** All eight
measurement scripts are clean — zero inline scene params, every one going through
`buildParams` / `buildPaths` / `BOUNDS`. But **six unit tests still restate fixtures**, and
five of the six are quoted in these review documents as the pin for a protected item:

| file | restates | quoted as |
|---|---|---|
| `scene3d-shadow-anatomy.test.js` | BOUNDS, SEED, CAMERA, SUN, TONE4, BALL, CUBE, LOWPOLY, capsule | R8 §LOG-000 |
| `scene3d-cross-frame.test.js` | CAMERA, SUN, TONE4, ball | **O17 — "the round's headline result"** |
| `scene3d-form-shadow-limb.test.js` | CAMERA, SUN, TONE4, ball | the protected limb taper |
| `scene3d-plot-safety.test.js` | CAMERA, SUN, TONE4, BALL | `max ≤ 0.56` |
| `scene3d-facet-tone.test.js` | CAMERA, SUN, tone 2/3/4, CUBE, LOWPOLY | R7 scorecard |
| `scene3d-faceted-highlight-dispatch.test.js` | CAMERA, SUN, CUBE, LOWPOLY | O9 / O11 / O14 / O15 |

Rows 2–6 currently *match* the fixture, so they are latent drift risk. **Row 1 has already
drifted:** `scene3d-shadow-anatomy.test.js` uses `pitch: 22` / `elevation: 45` against the
fixture's `pitch: 32` / `elevation: 28`. **The workstream's namesake test measures a camera
and a sun that no rendered view uses** — precisely the failure the fixture module was
built to end. That is a *sixth* restatement, not the fifth the round believed it had
found, and the fixture module's own header overstates its reach by claiming
`tests/unit/scene3d-*.test.js` as consumers when only three of nine are.

This does not reduce the value of the repair — moving `render.js` and three tests onto one
definition is real, and the scripts are now genuinely clean. But the rule is not yet
enforced, and Round 10 must finish it: move the remaining six, and add a lint or a test
that fails if a `scene3d-*` test file contains a camera literal.

---

## 4. Found in review, not reported by the round

### 4.1 Seven limb facets went from toned to bare paper — UNREPORTED

The k-floor drop 0.12 → 0.02 does more than let an edge-on facet ask for nothing.
Measured, fill ink per facet, base vs HEAD:

```
W-lp-sun45   faces with geometry 89 → 88   faces with ZERO fill  0 → 7
             total fill ink 12562.7 → 10237.3   (−18.5 %)
             newly blank: face:20,21,27,38,84,85,150
R-lp-bands4  faces with geometry 38 → 37   faces with ZERO fill  0 → 5
             total fill ink  2927.6 →  2346.9   (−19.8 %)
```

At `75b97a5` **every** facet carrying geometry carried fill. At HEAD, seven do not. All
seven are among the 35 facets `facets.js` silently omits, which is why no instrument saw
this and no criterion scored it.

**Seen:** comparing the two rasters of `W-lp-sun45`, the lower-left limb loses its
outermost band of rulings; the silhouette outline now encloses a strip of bare paper
where the tone previously ran out to the contour.

**My judgement: this is probably an improvement, and that is not the point.** Hatching
that crowds into its own contour is the artefact the protected limb-taper item exists to
prevent, and the HEAD drawing reads cleaner. But it is an unreported, unfixtured change
in what the form does **at its silhouette** — the most visually load-bearing edge in the
drawing — arrived at as a side effect of a floor chosen to "keep the arithmetic finite."
Round 10 must fixture it before it drifts further. See the plan.

### 4.2 `PLOT_FLOOR_MULT_OBJ` cannot enforce the criterion it cites — UNREPORTED

`PLOT_FLOOR_MULT_OBJ = 1.2` (`scene3d.js:995`) floors a single family at 1.2 × pen. A
single family at 1.2 × pen has coverage `pen / (1.2 × pen)` = **0.833**.

C15's own clause is *"a run of windows at D ≥ 0.80 is a breach."*

> **The plot floor legalises, by construction, a single family that breaches C15.** And
> that is before the crossed family: zone F's cross at weight 0.20 composes to ~1.17.

This is confirmed at base: `+X` family A ruled at **0.3778 mm** against a floor of
1.2 × 0.3 = 0.36 mm — **legal under the floor, at coverage 0.79.** The round fixed *where*
the floor is measured. It did not fix that the floor's *value* is too permissive to
enforce C15 at all. **It is the same class of defect as the one the round just fixed — a
cap that cannot bind the thing it names — one level up.** The floor needs to be ≥ 1.25
for a single family, and the composed budget must own the cross.

### 4.3 `max(object)` is quoted off the wrong instrument — UNREPORTED

The submission's §3 states `max(object)` = **0.537 / 0.508 / 0.498 / 0.539**, worst 0.539,
and computes a margin of **3.8 %** against the protected 0.56. The test that *enforces*
0.56 (`scene3d-form-ladder.test.js`, boolean grid) measures:

```
                     submission   enforcing test   ratio
E-bands4               0.537         0.5062        1.061
V-E-bands4-sun45       0.508         0.4750        1.070
W-bigball-bands4       0.498         0.4700        1.060
W-bigball-sun45        0.539         0.5056        1.066
```

A consistent ~1.06 — those are **browser-raster** numbers quoted against a
**boolean-grid** bar. `criteria.md` §0, written this round by this engineer, says: *"The
boolean grid reads ≈ 8–12 % under the browser raster… A bar quoted without naming its
instrument is ambiguous by about that much."* The rule was broken in the same submission
that wrote it, in the headline number.

It errs safe — the real margin is **9.6 %**, not 3.8 % — but the inflated figure is load
bearing: it is one of the three legs of the argument that O6 cannot be bought. That leg
was weaker than stated, and the O6 ruling had to be re-derived (§1.3) rather than
inherited.

**And the 0.56 bar itself has no named instrument.** It is inherited from Round 7. If it
was set on the browser raster, the enforcing test is currently 6 % looser than intended.
Round 10 must pin the instrument to the bar.

### 4.4 The dark side may be speckled, not banded — a QUESTION, not a finding

On `W-lp-sun45`, T-classified and F-classified facets both occur at N·L = 0.000 and their
D differs 2:1 (0.163 … 0.301). Whether that reads as a *band* (O3) or as *speckle*
depends on whether those facets are spatially adjacent, and facet IDs are not proof of
adjacency — so I am not scoring it. But O21's instrument answers with an **aggregate
ratio** (mean T / mean F), which is blind to arrangement by construction, and O3's own
clause is *"visible as a band — not merely true in number."* O21 currently passes at 1.66×
on a statistic that could not detect the failure O3 forbids. Round 10 should close that.

Separately, and more concretely: on the same fixture, facets at **N·L 0.746 and 0.744** —
essentially identical illumination — measure **D 0.000 and D 0.163**. The first has
n = 7 whole windows and draws nothing. §5.5.1 says a facet out of order with its
neighbours' N·L **is a bug**; this is that, on the halftone end, and it is the faceted-path
O6 defect the round reported on one cube face, occurring across the low-poly lit end.

---

## 5. Live verification — the first in nine rounds, and it re-scores nine criteria

Artefacts: `docs/shadow-anatomy/live-verify/` on `3d-scene-p4` — 18 views per tree,
screenshots, per-view metrics, and reusable drivers under `harness/`. I looked at the
images myself; what follows is scored against them, not against the report of them.

### 5.1 The harness is vindicated — and that is the most important result here

All 18 views were run twice: offline through `collectSceneParams(p, [])` in jsdom, and
in-app as a scene **tree**. Every pair is identical to two decimals on both path count and
ink (`R2-cube-bands4` 89 / 4134.34 both ways; `A-4` 1554 / 18162.21 both ways).

**Nine rounds of offline numbers transfer to the app exactly.** The blocker was never a
rendering discrepancy — nobody could construct the scene. Every measurement in this
document, and in Rounds 6–8, is measuring the real drawing.

That is what makes the rest of this section a scoring event rather than a dispute. The
numbers were never wrong. **They were never sufficient**, and there was no way to know
that until someone looked.

### 5.2 The sliver, confirmed a third way

Per-face ink/area in the app: shipped `p4` reads `+X` **2.85**, `+Z` 0.63, `+Y` 0.071 —
the near-edge-on face 4.5× denser than the front and 40× denser than the top, rendering
as a solid slab. On the branch: **0.35 / 0.57 / 0.064** — a 9.1× drop, monotone in N·L.
Round 9's D 0.891 → 0.161 and my own 1.084 → 0.155 (§2.2) are corroborated in the running
app on a third instrument. **§2's ruling stands, reinforced.**

### 5.3 RULING — is the fixed sliver now under-inked?

The open question: at 0.35 ink/area the `+X` face carries **5 strokes** and reads as
almost bare paper. **My §2.2 measurement answers this precisely, and the answer is no —
but for a reason that needs fixing.**

> `+X` coverage **0.1545** (one family at 1.9418 mm)
> `+Z` coverage **0.1817** (0.1515 at 1.9802 mm **plus** 0.0302 from a second family at 9.9352 mm)

**In density the sliver is not under-inked.** It sits at 85 % of its sibling, correctly
ordered and monotone in N·L, which is exactly what C15 and O20 asked for.

**In legibility it is, and the cause is structural, not tonal.** The whole 15 % deficit is
the crossed family, which `+X` **does not have at all** — family B's paper pitch is 9.9 mm
and the face is 6.5 mm wide, so not one ruling fits. The "5 strokes, almost bare"
impression is a *stroke-count* artefact: the same coverage delivered by 5 long strokes
reads as "a few lines", delivered by 34 it reads as "tone".

**The ruling: do not add ink.** Raising density on `+X` would re-break the ordering the
round just bought, and would do it by making the sliver darker than its better-lit
neighbour again. **Fix the missing direction instead.** When a family's paper pitch
exceeds the facet's projected width, it must be tightened to fit at least 2–3 rulings and
spend its `crossW` share *inside the composed ceiling* — so the second direction appears,
the total D does not move, and §5.0's "the dark end must gain a crossed family" stops
being silently unmet on exactly the facets that are hardest to draw. This supersedes the
open item I raised in §2.4; that section states the problem, this states the fix.

### 5.4 The pole caustic is not fixed — and O17's statistic cannot see it

Round 8 called O17 "the strongest single result of the round" on the strength of
`0 % of crossed windows at ≥ 80°, median 65`. I have now looked at
`branch__zoom__E-bands4.png`.

**The plaid is genuinely gone.** The crossings are curvilinear lozenges following the
surface; there is no square cell anywhere on the body of the sphere. That part of Round
8's claim is true and I confirm it by eye.

**And a radiating starburst knot sits at the pole**, where every meridian ruling converges
at the chart's UV singularity. It is the brightest, densest thing in the drawing by a wide
margin. The branch is thinner than `p4` — perhaps 40 % fewer strokes — but the knot
survives, on both trees.

**Why no instrument caught it.** The knot is smaller than the 4 mm scoring window, so
`windowD` averages it away and `r8probe-o17` never samples inside it. And O17's clause is
about the *angle* between two families; at a singularity the concept degenerates — every
ruling meets every other at every angle — which the histogram records as a handful of
sample points rather than as the failure it is.

**O17 → MARGINAL.** Its named artefact is gone and I confirm it. But the criterion exists
to stop the hatch from reading as a mechanical artefact, and at the one place where the
parameterisation breaks down it reads as nothing else. A statistic that improves while the
artefact at the same location survives is measuring the wrong thing — and this is the
second time this round that a bar has been found stated on a proxy one step away from what
it names (§1.4, §4.2).

**C15 stays PASS, with the gap named.** The caustic is a local ink concentration, and
C15's two clauses are both stated over 4 mm windows, so C15 as *written* passes. It cannot
see a sub-window flood. That is an instrument gap, not a scoring dodge, and Round 10 owes
C15 a sub-window clause — a converging knot is precisely where a plotter digs a hole in
the paper.

### 5.5 The tone ladder does not read

Lit band and halftone separate cleanly — O4 is real and visible. Below that, in the app:

- **no darker crescent at the terminator.** The darkest area is a ragged diagonal wedge in
  the middle of the form. → **O1 MARGINAL** (the ratio is true of the labels, not of the
  drawing), **O3 FAIL** — O3's own clause is *"visible as a band — not merely true in
  number"*, and it is not.
- **no lighter reflected-light band at the shadow-side limb**; it is as dense as the core.
  → **O2 MARGINAL**.
- **staircase jaggies 1–2 rulings wide at band boundaries, on both trees.** → **O26 FAIL,
  carried and now with app evidence** rather than an absent instrument.

I looked. The `E-bands4` sphere does not read as a lit sphere: it reads as a wireframe
globe with a pole knot and a patch of crosshatch. There is no sense of a light source in
it. That is the criterion the ratios were standing in for.

### 5.6 The sphere's cast shadow is anatomically backwards

Cast-shadow output is byte-identical between `p4` and the branch, so none of this is
Round 9's — it is three rounds of "complete and explicitly protected" resting on geometry
*stability* while nobody looked at the geometry.

From `branch__shadow__ball-4.png` and the 2/3/4-layer set:

- at 2 layers the sphere's shadow is **one uniform blob**; the z0 contact accent is
  105.5 mm — a stipple you have to hunt for. → **C2 MARGINAL** (the ratio passes; the
  collar is not perceptibly the darkest thing), **C4 MARGINAL** (a stipple is not a band
  with real width).
- at 3 and 4 layers the darkest zone is a ragged streak across the **middle** of the
  throw, with the contact end and the far tip at the same density. A shadow from a
  directional light is darkest at contact and lightens along the throw. This is inverted.
  → **C5 FAIL** (softness does not read as a gradient across the throw), **C13 MARGINAL**
  (the shadow does not read as respecting the light's direction).
- **the cube reads well** — a genuine dense contact collar, a body that grades — but its
  far boundary is **scalloped** where a box under a directional light must cast a
  hard-edged parallelogram. → **C7 MARGINAL**.

C6 stays PASS: `Z2` carves 6521.76 → 5802.40 → 3735.33 and that is enforced. Noting for
the record that this is a path-count fact, and that at 2 layers the thing it describes is
not visible.

### 5.7 The ground double-plot — assessed, and it contaminates nothing here

`mapper: 'none'` on the ground emits the ground quad's 4 border segments **twice**, with
byte-identical coordinates, once as `sceneFace` and once as `sceneEdge` — 4 paths /
1520.96 mm each. The shadow-anatomy fixture uses exactly that ground style.

**Impact on this scorecard: none.** I checked each channel:

- **Every D-based criterion is unaffected.** The boolean grid and the browser raster both
  count a pixel inked twice as one dark pixel — that is the whole reason D is read off a
  raster rather than summed from ink length (`criteria.md` §0). Duplicated coordinates
  occupy the same pixels. The ladder, `facets.js`, plot safety and every number in §1–§4
  are clean.
- **The protected cast-shadow totals are unaffected.** `Off` 16109.77, Layers 7840.20 /
  8896.92 / 7448.60 and `Z0` 1318.44 are `castShadow`-classed ink; the duplicate is on the
  ground object.
- **The 120-view evidence is unaffected.** A constant additive offset on ground-on views
  cannot change byte-stability, the direction of a delta, or a coordinate hash.

**But it is a genuine defect on its own terms**, and a plotter one: the pen retraces four
long lines, doubling ink and wear on the ground border for no visual gain. Any *absolute*
`totalInk` quoted for a ground-on view in this workstream is ~1521 mm high. Round 10 P0,
and the fix belongs with the drawing, not with the metrics.

---

## 6. Criterion-by-criterion

### Cast shadow, C1–C15

| | R9 | note |
|---|---|---|
| C1 | PASS | geometry bit-identical, verified per zone at HEAD and across all 120 views by coordinate hash. |
| **C2** | **MARGINAL (was PASS)** | Ratio passes and Z0 is unmoved. **In the app the collar is not perceptibly the darkest thing** — the sphere's z0 accent is 105.5 mm, a stipple you have to hunt for (§5.6). Not Round 9's doing. |
| C3 | PASS (enforced) | `Z0` 1318.44 / 211 at every layer count. |
| **C4** | **MARGINAL (was PASS)** | "A band with real width, not a line." On the sphere it is a stipple (§5.6). The cube's collar is genuine. |
| **C5** | **FAIL (was PASS)** | "Softness reads as a gradient across the throw." **It is darkest in the middle of the throw**, with contact end and far tip at the same density — inverted for a directional light (§5.6). Carried undetected for three rounds because the shadow was scored on geometry stability. |
| C6 | PASS (enforced) | Z2 carves 6521.76 → 5802.40 → 3735.33. A path-count fact; at 2 layers the recession it describes is not visible. |
| **C7** | **MARGINAL (was PASS)** | The cube's far boundary is **scalloped** where a box under a directional light must cast a hard-edged parallelogram (§5.6). |
| C8 | PASS (carried) | Shadow connects at contact in every live view. |
| C9 | PASS (carried) | |
| C10 | PASS (carried) | |
| C11 | PASS (enforced) | 7840.20 / 8896.92 / 7448.60. Unaffected by the ground double-plot (§5.7). |
| C12 | PASS (enforced) | `Off` 16109.77 / 535. |
| **C13** | **MARGINAL (was PASS)** | Same evidence as C5: a shadow darkest mid-throw does not read as respecting the light's direction (§5.6). |
| C14 | PASS (carried) | 0 % of crossed windows at ≥ 80°; confirmed by eye — no square cell on the body of the sphere. |
| **C15** | **PASS (was MARGINAL)** | **The `+X` breach is repaired.** D 0.891/0.867/0.841 → 0.161/0.157/0.153; both the ≥ 0.90 and the ≥ 0.80 clauses clear at every band count. Independently confirmed: composed coverage 1.084 → 0.155 by direct on-paper pitch measurement (§2.2), and confirmed by eye. **Logged against it:** the plot floor that is supposed to enforce C15 structurally cannot (§4.2). C15 passes on the drawing; its enforcement mechanism does not exist. |

### Object, O1–O28

| | R9 | note |
|---|---|---|
| **O1** | **MARGINAL (was PASS)** | T/F 1.742–1.881 against ≥ 1.25 — but the ratio is true of windows *labelled* T, and **in the app there is no darker crescent at the terminator**; the darkest area is a ragged diagonal wedge mid-form (§5.5). The number is not wrong; it is not evidence for the criterion. |
| **O2** | **MARGINAL (was PASS)** | R/F 0.283–0.411 (≤ 0.60) — and **the shadow-side limb is as dense as the core** in the app (§5.5). |
| **O3** | **FAIL (was PASS)** | O3's own clause is *"visible as a band — not merely true in number."* **It is not visible as a band.** Round 8 scored O3 PASS partly on a 4× crop and was right about the limb; the ladder as a whole does not read (§5.5). Independently predicted from inside the harness this round — §4.4. |
| O4 | PASS | L/M 0.516–0.723 against the 0.75 floor **newly pinned this round**. Note the floor is the engineer's own inference, not recovered spec text — see §6. |
| O5 | **FAIL (carried)** | Instrument still does not exist. **Third round owed.** |
| O6 | **FAIL — and RULED, §1** | Bar moves 0.10 → 0.083. Measured 0.0694 / 0.0678 / 0.0762 / 0.0865; three of four still miss. Now reachable, with a tested lever. |
| O7 | PASS (carried) | |
| O8 | MARGINAL (carried) | Same root cause as O5. |
| O9 | PASS (carried) | |
| O10 | PASS (carried) | |
| O11 | PASS (carried) | |
| O12 | PASS (carried) | |
| O13 | PASS | worst-of-four **0.5062** on the enforcing instrument, margin 9.6 %. Now asserted per fixture — the worst-of-four discipline is adopted. §4.3 logged against the quoted number, not the criterion. |
| O14 | PASS (carried) | |
| O15 | PASS (carried) | |
| O16 | PASS (carried) | |
| **O17** | **MARGINAL (was PASS)** | The statistic holds (0 % ≥ 80°, median 65) **and the square plaid is genuinely gone — I confirmed it by eye.** But a radiating caustic knot survives at the pole on both trees, sub-window and therefore invisible to the instrument, and it is the brightest thing in the drawing (§5.4). Round 8's "strongest single result of the round" was half a result. |
| O18 | PASS (carried) | |
| O19 | PASS | |
| **O20** | **MARGINAL (was FAIL)** | **Ordering clause bought** — `OUT OF ORDER → in order` on `R2-cube` at bands 2/3/4, and pinned on both cube fixtures. **Lit-face clause unmet** — 0.027 / 0.021 / 0.025 against 0.03, and honestly reported as a *regression* at bands 4 (0.030 → 0.025). Not PASS: half a criterion. Not FAIL: the half that was a *bug* by §5.5.1 is fixed. **And the bar is currently unadjudicable** — the two instruments differ by 0.01 on a 0.03 bar. Round 10 must pick an instrument before it can pick a number. |
| O21 | PASS | 1.65× / 1.66×, reproduced by me, n = 15–19. Passes on an aggregate that cannot see arrangement (§4.4). |
| O22 | PASS | `T: none` on both cube fixtures; gate now read from `Regions.smoothShadedFaces`, verified live. |
| O23 | MARGINAL (carried) | 0.51×, n = 2, correctly printed UNMEASURED. Needs a **visibility** change; not attempted, and the diagnosis is accepted. |
| O24 | PASS (carried) | |
| O25 | PASS (carried) | |
| O26 | **FAIL (carried, now with evidence)** | Still no instrument — but no longer only an absence. **Staircase jaggies 1–2 rulings wide at band boundaries, on both trees, in the app** (§5.5). O26 has been an unmeasured FAIL for three rounds; it is now a *seen* FAIL, which is a better place to build the instrument from. |
| O27 | MARGINAL (carried) | Wording lost with the spec. |
| **O28** | **MARGINAL (was PASS)** | **Downgraded.** Round 8 wrote: *"Third round running as an unmeasured PASS — if Round 9 leaves it unmeasured again it should be downgraded."* Round 9 left it unmeasured and asked for the downgrade itself. Granted. A criterion that has never been measured is not a PASS; `facets.js` has still never been run across `Gp-yaw-30/-18` printing band index per facet, which is a single command. |

---

## 7. On `criteria.md`

Commissioning the reconstruction was the right call and the provenance tags are the right
mechanism. Two corrections, so the next reader is not misled:

1. **§5.4 #1's entry is now settled, not "unresolved."** It records the 12-vs-0.10
   contradiction as open. §1.4 rules it: the bar is 0.083. Update it.
2. **O4's `L ≤ 0.75 × M` is marked `[inferred]`, and it is doing load-bearing work.** It
   was invented this round, pinned as a test in the same round, and then cited as the
   reason O6 cannot be bought. That is close to circular. It happens to survive my own
   analysis (§1.4 shows the O6 lever fits under it with margin), so nothing turns on it
   here — but a bar that a round invents must not become a blocker that the same round
   cites, and `criteria.md` should say in as many words that 0.75 is a Round 9 invention
   awaiting ratification.

Where the file and the tests disagree: nowhere material that I found. The tests are
tighter than the file in two places (O13 is asserted per fixture, which the file describes
only as "worst of four"; O6's ratchet at 0.065 is not in the file at all). Fold both in.

---

## 8. The Round 10 plan

**The priorities changed when the images arrived.** Nine rounds of work have made the
*quantities* right; the drawing is still not right. Round 10's job is arrangement, not
tuning. O6 was the P0 of the last two rounds and it is now item 5.

### P0 — the drawing

**1. The tone ladder must read as a ladder (O1 / O2 / O3).**
This is the workstream's central criterion and it has been passing on labels. There is no
terminator crescent and no reflected-light band in the app. Do **not** start by changing a
coverage number — every ratio is already inside its bar. Start by measuring *arrangement*:
for each zone, the largest connected region of windows carrying it, and whether the T
windows form a contiguous crescent inland of the limb or a scatter. §4.4 gives the same
result from the faceted side (facets at N·L 0.746 and 0.744 measuring D 0.000 and 0.163).
**Build the arrangement instrument first, then look at `Regions.formZone`'s boundaries.**
The suspicion the evidence supports is that zone *assignment* is noisy per-sample, so the
right amount of ink lands in the wrong places.

**2. The pole caustic (O17 / C15).**
Every meridian converging at the chart's UV singularity, on both trees, brightest feature
in the drawing. Two things are owed: a cap on local ink density near the singularity
(spend it as the craft rule says — into a second direction, or into terminating rulings
short of the pole), and a **sub-window clause on C15**, because a 4 mm window
structurally cannot see a knot smaller than itself. This is the third bar this round found
stated on a proxy one step from what it names.

**3. The sphere's cast shadow is anatomically backwards (C5 / C13 / C2 / C4).**
Darkest mid-throw, contact end and far tip equal. The cube is fine, so this is
sphere-specific and probably in how the throw is parameterised for a curved caster. Three
rounds of "complete and explicitly protected" protected its *stability*, not its anatomy —
the protected list must keep pinning the numbers while this is fixed, which means the fix
has to change the shadow's shape without changing `Z0`'s total. Expect that to be hard and
plan for it.

**4. The ground double-plot (§5.7).**
`mapper:'none'` emits the ground quad's border twice, byte-identically. It contaminates no
criterion in this scorecard, and it is still a plotter retracing four long lines. RGR: a
test asserting no two emitted paths share identical coordinates on a ground-on view.

### P1 — the quantities

**5. O6, with the lever from §1.4 — and land the ruling first.**
Edit `criteria.md` and the ladder test to the 0.083 bar **before** touching source, so the
round is measured against the ruling and not against the number it replaced. Then
`FORM_INK.L.coverage` 0.42 → 0.50 (lifts `ceil(L)` to 0.1175; leaves `ceil(T)` and
therefore `max(object)` untouched), then trim `GLINT_KEEP` to place D(L) at 0.083 on the
worst fixture. **Both, or neither moves.** Watch L/M against 0.75 — the headroom is real
but it is the only thing being spent. Report all four fixtures, worst-of-four, and **name
the instrument.**

**6. Fixture the limb blanking (§4.1) — then decide it.**
Add an assertion that counts facets with zero fill, per fixture, on `W-lp-sun45` and
`R-lp-bands4`. Pin it at 7 and 5. Then look at the two rasters side by side at 4× and rule
whether a bare strip inside the silhouette is the drawing you want. I lean yes. But it is a
change at the form's own contour that arrived as a side effect of a floor chosen to keep
arithmetic finite, and it must be a decision, not a residue.

**7. Fix the plot floor (§4.2).**
`PLOT_FLOOR_MULT_OBJ` 1.2 → ≥ 1.25 so a single family cannot legally reach C15's 0.80
clause, and bring the crossed family inside the composed budget so the *pair* is bounded.
RGR: a test that asserts single-family coverage < 0.80 by construction, failing at HEAD.

**8. Give the narrow facet its second direction (§5.3).**
When a family's paper pitch exceeds the facet's projected width, tighten it to fit 2–3
rulings and spend its `crossW` share inside the composed ceiling. Total D must not move.
This closes the "5 strokes reads as bare paper" question without re-breaking O20.

### P2

**9. Name every instrument, once.**
Pin the instrument to each numeric bar in `criteria.md` — 0.56, 0.083, 0.03, 0.80, 0.90.
`max(object) ≤ 0.56` currently has none, and the enforcing test may be 6 % looser than
intended (§4.3). Until each bar names its rasteriser, every margin in this document is
approximate to ±6 %.

**10. O20's lit-face clause — instrument before number.**
Two instruments differ by 0.01 on a 0.03 bar. Pick one (the boolean grid, since it gates
CI), restate the bar on it, then buy it.

**11. `faceLightDrivenLines` — the declared defect.**
The round found it and left it, correctly, for want of a fixture. Build the fixture first.
Note that the 120-view evidence already fingers this path twice, unattributed: the six
`*-lightdriven-{blank,sparse,stippleOut}` views and the two
`box-highlight-lightdriven-sens*` goldens are byte-stable precisely because they suppress
the fill this path would have got wrong (§3.2).

**12. O5 / O8 — the highlight-area instrument. Third round owed.**
Highlight area as a percentage of lit silhouette has never been a number. It is a hull, a
mask and a ratio. Build it or formally withdraw O5.

**13. O26 — the banding instrument. Third round owed.**
D step across a band boundary against the D gradient within a band.

**14. O28 — one command.**
`facets.js` across `Gp-yaw-30 / -18`, band index per facet. It has been owed four rounds
and it is now MARGINAL because of that, not because of anything about the code.

**15. O21 / O3 — measure arrangement, not just the mean.**
O21 passes on an aggregate ratio that is blind to spatial arrangement, which is exactly
what O3 forbids (§4.4). Add facet adjacency to `facets.js` and report the longest run of
same-zone neighbours, not only the zone means.

**16. `LIT_MAX_PITCH_PEN` — wire it or delete it (§1.4).**

**17. Print the omitted facets.**
`facets.js` claims to list sub-window facets separately and does not. §4.1 was hiding
there.

### The five-round debt — DISCHARGED, and what it changes

**Live verification landed this round.** The debt is closed, the recipe is written down
(`live-verify/harness/`), and offline and in-app agree to two decimals on all 18 views
(§5.1). Nobody has to argue about this again.

**What the recipe now makes verifiable that was not.** For four rounds the standing
instruction was "open the app and look", and it failed four times because *nobody could
build the scene* — the app takes a scene **tree**, the harness composes a **monolith**,
and no one had bridged them. That bridge now exists as a reusable driver. Consequences:

- **Every qualitative criterion becomes testable for the first time.** O3 ("visible as a
  band"), O8 ("negative space bounded by hatch"), O26 ("boundaries not traceable"), C4
  ("a band, not a line"), C5 ("reads as a gradient") were unmeasurable by construction —
  they are statements about how a drawing *looks*. Four of the five just changed score.
  They should be re-scored against images **every round from now on**, and no qualitative
  criterion may be carried on a number again.
- **The window-based instruments are now known to have a blind spot**, and its size is
  known: 4 mm. The pole caustic (§5.4) and any sub-window flood live inside it. Every
  window-based bar needs a companion clause at pen scale.
- **A visual baseline is now possible.** 18 in-app screenshots per tree at a fixed camera
  is a regression suite for appearance. Round 10 should pin it as one — that is the only
  mechanism that stops a future round re-earning a PASS with a statistic.

**The standing obligation, restated for Round 10:** a criterion is not scored until it has
been *seen*. Nine PASSes did not survive the first look; there is no reason to believe the
remaining twenty-six are different in kind, only that they have not been looked at yet
with the same attention. Round 10 should work through the untested ones deliberately
rather than waiting for the next contradiction to surface on its own.
