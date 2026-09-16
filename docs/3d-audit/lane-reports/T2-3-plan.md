STATUS: PLAN-READY

# T2-3 — mkTick variable tick length, attempt 3: the bare-wedge fix AND its bar

**One paragraph.** Both rejected attempts failed for the same reason, and it is not the curve: `mkShape`'s
`'tick'` branch builds the mark **centred on the row line and spends its entire length in the ACROSS-row
coordinate** (`surface-fill.js:2637`, `polys.push([[off, -each/2], [off, each/2]])`), so every millimetre the
length response takes off a tick is subtracted from the **row-to-row** direction — at `LMIN = 0.18` a bare
strip of `(R − L)/2 = 0.41·R = 1.82 mm ≈ 6.1 pen widths` opens on **each** side of **every** row, running the
row's whole length, and because `L` grades along the row that strip is a **wedge**. I measured T2-1
(`dbad2d88`) and T2-2 (`9d911b05`) side by side against `3bc61c32` on all six cells and **they are the same
render to within 1 %** on every wedge metric (wedge-area fraction 0.02358 vs 0.02301 six-cell mean; largest
hole identical to 3 decimals on 4 of 6 cells) — which is exactly what the arithmetic predicts, since
`(1−0.88)·max|t − smoothstep(t)| = 1.15 %` of the length range is the **entire** difference between the two
curves. **The curve was never the lever.** I built the instrument the orchestrator ruled must co-ship — a
**rasterised** bare-wedge oracle that takes the highlight zone from the tone field and measures bare area, the
largest inscribed hole and the wedge fraction against the *shaded silhouette* rather than against the site
lattice (the site-level coverage both rejected units reported, 0.974–0.993, counts a site as covered when it
draws a 0.8 mm tick inside its own 4.43 mm cross-row cell — that blindness is why the defect shipped twice) —
verified it reproduces the T2-2 reviewer's six-cell RED digit-for-digit, and **prototyped Rank 1 (a
low-discrepancy cross-row stagger of the tick's own centre, `surface-fill.js:6451`) in a scratch export of the
base**: on **both rigs, all six cells**, it clears O5 ≥ 3.0 monotone (3.008–4.281), site coverage ≥ 0.958, and
cuts the six-cell mean wedge fraction to **0.00296 (test rig) / 0.00134 (create rig) — below the pre-fix base's
own 0.00484 / 0.00216 and 8–17× below the two rejected trees** — with 366/384 cells byte-identical across all
8 mappers and every differing cell being mkTick's own. **Rank 1 passes its spike gate; T2-3 is buildable now
and does not have to wait for T3.**

- **Planner:** read-only. No worktree was edited, stashed or checked out. Every number below comes from
  `git archive` scratch exports under `/private/tmp/claude-501/scratch-T23/` with `node_modules` symlinked
  from MAIN.
- **Target tree:** lane `fill-audit-a3` head **`179d9218`** (the revert of T2-2). Verified:
  `git diff 3bc61c32 179d9218 -- src tests` is **empty** and `179d9218:src/core/scene3d/surface-fill.js`
  md5 `c2314b0d3ceeee25e3f6d9f13484a2b0` **equals** `3bc61c32`'s. Every `file:line` in this plan is on that
  source.
- **Exports used:** `base`/`baseclean` = `3bc61c32` (= `179d9218`) · `t22` = `9d911b05` (T2-2) ·
  `t21` = `dbad2d88` (T2-1, **recovered** — it is reachable from MAIN) · `t21base` = `48ff98dc` (T2-1's own
  base) · `proto`/`protoclean` = the Rank-1 prototype.
- **Rig discipline (standing rule 3).** Every table names its rig. "test rig" = the unit-test fixture
  (`PRIMITIVE_PARAM_DEFAULTS` + `DEFAULT_CAMERA`, the fixture `scene3d-mark-laws-draw.test.js` uses and the
  one both previous units and the T2-2 reviewer measured on). "create rig" =
  `PRIMITIVE_CREATE_DEFAULTS` merged over `PRIMITIVE_PARAM_DEFAULTS` — **the gallery's and Jay's own
  screenshots' rig, and the rig the picture flag was raised on.**

---

## 0. First, the thing that changes the shape of this unit

**T2-1 and T2-2 are, on the defect, the same render.** Measured on the same tree, same fixture, d=50:

| six-cell mean, test rig | BASE `3bc61c32` | **T2-1 `dbad2d88`** | **T2-2 `9d911b05`** |
|---|---|---|---|
| wedge fraction (bare ≥ ½ row pitch across) | 0.00484 | **0.02358** | **0.02301** |
| largest inscribed hole ÷ row pitch | 0.7215 | **0.91867** | **0.91367** |
| bare fraction of shaded silhouette | 0.12098 | **0.18735** | **0.18713** |

Per cell the two rejected trees agree to 3–4 decimals (`sphere/contour` holeMax 1.028 vs 1.028;
`torus/contour` wedge 0.02270 vs 0.02246; `cone/hatch` wedge 0.05273 vs 0.05220). **T2-2 changed the wedge by
2.4 % of its own size.** That is not "the same defect softened" — it is the same defect, full strength.

And it could not have been otherwise. T2-2's curve is `(1−B)·t + B·smoothstep(t)` with `B = 0.88`; T2-1's is
`smoothstep(t)`. Their difference is `(1−B)·(t − smoothstep(t))`, whose maximum over `t ∈ [0,1]` is at
`t = (3−√3)/6 = 0.2113`, where `t − smoothstep(t) = 0.09621`. **Maximum deviation = 0.12 × 0.09621 = 0.01154 —
1.15 % of the length range, at the single worst point, and under 1 % almost everywhere else.** A reviewer
called this "a diluted version of the same curve family"; the arithmetic says it is the same curve to within
a hundredth.

**Consequence for T2-3: do not spend a third attempt on a curve.** The curve is a free parameter to be chosen
on O5 alone; the defect lives somewhere else, and §1 says exactly where.

---

## 1. WHY both curves failed — the mechanism, with `file:line` on `3bc61c32` / `179d9218`

### 1.1 The three lines that make a wedge

**(a) The row scaffold sets a 4.4–4.5 mm cross-row cell.** `surface-fill.js:2379` — `const MK_ROW_COV = 1/3`
— and `surface-fill.js:4993` — `if (isMarkLaw()) return MK_ROW_COV;`. A mark law keeps every third master
ruling, so the **drawn row pitch** is `R = masterPitch / MK_ROW_COV` (`surface-fill.js:6331`). Measured at
d=50 on the six cells: **R = 4.428–4.520 mm**, i.e. **14.8–15.1 pen widths**. *(This is T3's file and is
FORBIDDEN to T2-3 — but it is the constant that sets the size of the hole, so it has to be named.)*

**(b) The tick spends its whole length ACROSS that cell, centred on the row line.**
`surface-fill.js:2631–2639`, `mkShape`'s `'tick'` branch:

```js
if (kind === 'tick') {
  const Lc = Math.min(L, 1.02 * R);
  const n = clamp(Math.round(L / Math.max(1e-6, Lc)), 1, Math.max(1, Math.floor(1.4 * nCap)));
  const each = L / n;
  for (let j = 0; j < n; j++) {
    const off = (j - (n - 1) / 2) * w;
    polys.push([[off, -each / 2], [off, each / 2]]);   // :2637  ← THE LINE
  }
  return polys;
}
```

The poly convention in this sink is `[u = along the ruling, v = across it]` (compare the `'morph'` band at
`surface-fill.js:6440–6449`, which lays its length in `[0]` and offsets its parallel passes in `[1]`). So a
tick is a stroke of extent `each` in **`v`**, symmetric about `v = 0`, and `thetaAt` does not rotate it —
`mkTick` is `or:'none'`, and `surface-fill.js:6302` returns `0` for that. **The tick's length IS its cross-row
extent.**

**(c) So the length response subtracts ink in exactly the row-to-row direction.** With
`L = LMIN·R + (L0 − LMIN)·R·eased(1−I)`, the un-inked strip on **each** side of the row is `(R − L)/2`:

| | `L/R` | bare strip per side | in pen widths (0.3 mm pen) | vs `MIN_MARK_MM` (0.6 mm) |
|---|---|---|---|---|
| dark anchor (`I→0`) | 1.02 | 0 (rows abut — this is the law's documented black) | 0 | — |
| light anchor (`I→1`) | 0.18 | **0.41 · R = 1.82 mm** | **6.1** | **3.0 ×** |

Because `I` grades **along** the row, `(R − L)/2` grades along the row too, and the bare strip between two
adjacent rows is bounded by two tick-tip envelopes that converge — **a wedge**. That is the whole mechanism.
It is a property of the `shape:'tick'` geometry, not of `eased`; `eased` only decides how fast the wedge opens.

Measured `L/R` over drawn non-highlight sites, d=50 test rig (min → max):

| tree | `L/R` range | mean `L/R` (cone/hatch) |
|---|---|---|
| BASE (`chan:'count'`) | **1.020 → 1.056** | 1.0411 |
| T2-1 | 0.211 → 1.020 | 0.8319 |
| T2-2 | 0.218 → 1.020 | 0.8277 |

BASE never lets a tick fall below the row pitch — that is precisely why BASE has (almost) no cross-row
wedges and (equally) why it fails R1.

### 1.2 The three candidate causes the brief named, ruled

| candidate | ruling | evidence |
|---|---|---|
| **row placement vs tick placement within a row** | **THIS IS IT.** Ticks are placed on the row centre line and shrink symmetrically; nothing ever places ink in the `(R−L)/2` band | §1.1(b)(c); the prototype fixes the picture by touching *only* the within-row cross-row placement (§3) |
| **the chart-walk's tick start positions (T1)** | **NOT the cause.** `offSurface` is 0–2 on every cell in every tree at d=50; T1's own walk-refusal metric does not move (BASE 0/0/1/0/2/0 vs T2-2 0/0/0/0/1/0) | table §2.3 |
| **interaction with `MK_ROW_COV`** | **Sets the SCALE of the hole, is not the CAUSE, and is byte-identical in all three trees.** `git diff 3bc61c32 9d911b05` touches no line of `isMarkLaw()`/`rowFloor`. The one cell where BASE itself has a large hole (`torus/hatch`, holeMax 1.008) is a `MK_ROW_COV` band, and it is the one cell T2-2 *improves* | §2.1 table; `torus/hatch` wedge 0.01198 → 0.00751 |

### 1.3 Why neither unit's own bar could see it (the reason it shipped twice)

Both units, and the T2-2 reviewer, measured coverage as **Σ(`R·P`) over lattice SITES that drew ink**. A site
that draws a 0.8 mm tick inside its own `R × P = 4.43 × P` mm cell scores as **fully covered**. Hence
"coverage 0.974–0.993 at d=50, PASS" on a render whose bare area had risen by 1.32–1.84× and whose largest
hole had grown by up to 86 %. The metric is not dishonest — it is *blind in the cross-row direction*, which is
the only direction the defect lives in.

### 1.4 The rasterised bare-area map (the picture of §1.1)

`docs/3d-audit/lane-reports/T2-3-plan-evidence/bare-area-map-cone-hatch-med.png` (three panels, cone/hatch,
d=50, test rig) and its 3× native crop of the lit flank
`…/bare-area-map-cone-hatch-med-crop3x.png`. Legend: grey = shaded silhouette, **black = ink**, blue =
highlight zone taken from the tone field (`I ≥ 0.90`), **yellow = bare but within ¼ row pitch of ink** (the
fine white that legitimately *is* light tone), **red = bare and ≥ ¼ row pitch from any ink — a wedge**.

What I see, looking at it: in **BASE** the lit flank is a fine comb of full-length ticks whose *spacing*
widens — thin yellow lines, and red only in one blob at the lower-left silhouette corner (0.0129 of shaded).
In **T2-1** and **T2-2** the same flank is broken into four broad curved yellow bands each with a long red
core, elongated **along the rows** exactly as §1.1 predicts (0.0527 / 0.0522) — and the two panels are
indistinguishable by eye. `…-proto.png` / `…-proto-crop3x.png` add the prototype panel: the bands are gone and
the flank reads as an even scatter of short ticks (0.0185 at the amplitude sweep point, 0.0156 at the shipping
constants).

---

## 2. THE INSTRUMENT (build it FIRST — it is a precondition of the fix, per the standing ruling)

### 2.1 Definition

Implemented and run for this plan at `/private/tmp/claude-501/scratch-T23/measure.js` +
`patch.js` (a **pure logging** patch: a per-site record `{x, y, I, R, P, L, drawn, len}` taken by wrapping the
`layMark` call site, and an optional dense `sampleAt` sweep of the chart square; **no formula is touched**,
and `mkStat.ink`/`mkStat.marks` deltas supply the drawn length so the same patch works on trees where
`place()` returns `true` and on trees where it returns `tot`).

1. **The highlight zone comes from the TONE FIELD, not the output.** Sweep `sampleAt(a,b)` over a 461×461
   chart grid, keep front-facing samples, splat them to a 6 px/mm raster → `surface` mask and a per-pixel
   `I`. **Highlight = `I ≥ 0.90`** (the operationalisation the T2-2 reviewer swept 0.80–0.95 for sensitivity
   and found stable). **Shaded silhouette = surface ∧ ¬highlight.** Measured extent of the highlight on these
   cells: **1.2–3.2 % of the silhouette** — so "gaps only where highlights are" is a strong claim, not a
   loophole.
2. **Ink mask:** stamp every emitted path segment at the pen width (0.3 mm) into the same raster.
3. **Distance transform** (two-pass chamfer) from ink, over the shaded mask.
4. The three sub-bars, all on the **shaded silhouette**, all in **row-pitch units** (`mkStat.rowPitch`), so
   they are scale-free:

| sub-bar | definition | which half of Jay's rule it gates |
|---|---|---|
| **W1 `wedge25`, per cell** | shaded ∧ bare ∧ `dist(ink) ≥ 0.25 · rowPitch`, ÷ shaded area. I.e. bare regions **at least half a row pitch across**. | **R2 — "must FILL the form … the only gaps allowed are where highlights are."** It is deliberately *not* "any bare paper": the fine white between strokes **is** light tone and must not be penalised. |
| **W2 `wedge25` six-cell mean** | mean of W1 over the six cells | **R2**, aggregate — stops a fix that trades one cell for another |
| **W3 `holeMax`, per cell** | `2 · max dist(ink)` over shaded-bare, ÷ rowPitch = **diameter of the largest inscribed bare disc** | **R2's "hard-edged" clause.** A flat-topped plateau necessarily leaves a hole as wide as its own wall; a graded texture cannot. This is the sub-bar that carries "hardness". |
| **O5 (existing, from `W-05b-W-06b-plan.md` §4)** | mean DRAWN tick length dark-third ÷ light-third, ≥ 3.0 and monotone dark ≥ mid ≥ light | **R1 — "ticks must have VARIABLE LENGTH … tick length carries the tone."** |
| **C1 (existing)** | area-weighted site coverage of `I < 0.90` sites that drew ink, ≥ 0.90 at d=50 | **R2**, partially — see §2.4: it is kept as a **reported diagnostic and as the reproduction of the reviewer's RED**, and is explicitly **not** the wedge gate |

**Clauses I do NOT gate (rule 1):** the highlight zone's own *shape* (nobody has asked for it); the tone
transfer's accuracy (`mkAsk` is untouched); anything at d=1 or d=220 — **d=220 is T2-4's, filed separately**
(§2.5), and d=1 is T3's.

### 2.2 The six-cell RED — the reviewer's measurement VERIFIED, not re-derived

The ledger (row 5a) rules that the T2-2 reviewer's six-cell bare-area table **is** the RED and is to be
verified. It reproduces **digit-for-digit** on my own independent instrumentation (site bare area, `Σ R·P`
over un-drawn `I<0.90` sites, mm², d=50, test rig):

| cell | reviewer's pre | **mine, BASE** | reviewer's post | **mine, T2-2** |
|---|---|---|---|---|
| sphere/hatch | 8.11 | **8.10** | 33.30 | **33.30** |
| sphere/contour | 7.54 | **7.54** | 13.98 | **13.98** |
| torus/hatch | 2.09 | **2.09** | 19.37 | **19.37** |
| torus/contour | 7.03 | **7.03** | 16.13 | **16.13** |
| cone/hatch | 2.42 | **2.41** | 13.35 | **13.35** |
| cone/contour | 1.79 | **1.79** | 6.34 | **6.34** |

My O5 and coverage numbers also reproduce both previous units exactly (BASE `lenRatio` 1.500 / 1.115 / 1.178 /
1.346 / 1.424 / 1.225 against T2-2-impl's own RED table 1.4995 / 1.1147 / 1.1776 / 1.3462 / 1.4240 / 1.2254;
T2-2 3.487 / 3.072 / 3.056 / 3.605 / 3.277 / 3.640 — identical). **The instrument is calibrated against the
established methodology before it is asked to say anything new.**

### 2.3 The new instrument, on all four trees, both rigs, d=50

**Test rig (the unit fixture):**

| cell | metric | BASE `3bc61c32` | T2-1 `dbad2d88` | T2-2 `9d911b05` | **T2-3 Rank 1** |
|---|---|---|---|---|---|
| sphere/hatch | W1 wedge25 | 0.00000 | 0.01990 | 0.01970 | **0.00130** |
| | W3 holeMax | 0.493 | 0.919 | 0.919 | **0.628** |
| | O5 | 1.500 | 3.598 | 3.487 | **3.818** |
| sphere/contour | W1 | 0.00389 | 0.02860 | 0.02741 | **0.00024** |
| | W3 | 0.961 | 1.028 | 1.028 | **0.617** |
| | O5 | 1.115 | 3.120 | 3.072 | **3.130** |
| torus/hatch | W1 | 0.01198 | 0.00775 | 0.00751 | **0.00049** |
| | W3 | 1.008 | 0.878 | 0.878 | **0.652** |
| | O5 | 1.178 | 3.149 | 3.056 | **3.008** |
| torus/contour | W1 | 0.00022 | 0.02270 | 0.02246 | **0.00007** |
| | W3 | 0.577 | 0.878 | 0.878 | **0.516** |
| | O5 | 1.346 | 3.678 | 3.605 | **3.741** |
| cone/hatch | W1 | 0.01295 | **0.05273** | **0.05220** | **0.01564** |
| | W3 | 0.903 | 1.109 | 1.109 | **0.958** |
| | O5 | 1.424 | 3.348 | 3.277 | **3.385** |
| cone/contour | W1 | 0.00000 | 0.00981 | 0.00879 | **0.00000** |
| | W3 | 0.387 | 0.700 | 0.670 | **0.387** |
| | O5 | 1.225 | 3.767 | 3.640 | **3.813** |
| **six-cell mean** | **W2** | **0.00484** | **0.02358** | **0.02301** | **0.00296** |
| | holeMax | 0.7215 | 0.9187 | 0.9137 | **0.6263** |
| | bareFrac | 0.1210 | 0.1874 | 0.1871 | 0.1489 |
| | site cov | 0.996 | 0.985 | 0.986 | 0.987 |

**Create rig (the gallery's / Jay's rig — where the flag was raised):**

| cell | W1 BASE | W1 T2-1 | W1 T2-2 | **W1 Rank 1** | O5 T2-2 | **O5 Rank 1** |
|---|---|---|---|---|---|---|
| sphere/hatch | 0.00013 | 0.02492 | 0.02445 | **0.00094** | 3.897 | **4.281** |
| sphere/contour | 0.00348 | 0.02972 | 0.02881 | **0.00028** | **2.920 ✗** | **3.084** |
| torus/hatch | 0.00045 | 0.02564 | 0.02551 | **0.00090** | 3.432 | **3.039** |
| torus/contour | 0.00489 | 0.00583 | 0.00587 | **0.00112** | 3.699 | **3.731** |
| cone/hatch | 0.00401 | 0.04092 | **0.04069** | **0.00479** | **2.910 ✗** | **3.257** |
| cone/contour | 0.00000 | 0.01005 | 0.00898 | **0.00000** | 3.307 | **3.542** |
| **mean (W2)** | **0.00216** | **0.02285** | **0.02238** | **0.00134** | 3.361 | **3.489** |

⚠ **Rule-3 finding, new and not in any report: T2-2's headline claim "O5 ≥ 3× on ALL SIX cells" holds only on
the unit-test rig. On the `create` rig — the one the gallery and Jay's screenshots use — T2-2 measures 2.910
and 2.920 on two of the six cells and FAILS the bar it was accepted on.** T2-1 clears it on both rigs (3.015
min). This is not why T2-2 was rejected, but it belongs in the record.

### 2.4 The bars themselves, and the honest argument for the choice of instrument

**Proposed gates for T2-3 (all at d=50, on BOTH rigs, all six cells):**

- **W1: `wedge25 ≤ 0.020` on every cell.** Separates: T2-1 fails 4/6 (max 0.0527), T2-2 fails 4/6 (max
  0.0522); BASE passes (max 0.0129); Rank 1 passes (max 0.0156 test / 0.0048 create).
- **W2: six-cell mean `wedge25 ≤ 0.00484` (BASE's own mean, test rig) / `≤ 0.00216` (create rig).**
  Separates: rejected trees are **4.8× / 10.4×** over it; Rank 1 is **below it on both rigs** (0.00296 /
  0.00134). This is the bar I would make BLOCKING — it is not a hand-picked number, it is the pre-fix tree's
  own value, and "do not make the holes worse than the design that had no variable length at all" is the
  minimum honest reading of R2.
- **W3: `holeMax ≤ 1.00` row pitch on every cell.** BASE fails one cell (torus/hatch 1.008 — a `MK_ROW_COV`
  band, T3's); T2-1/T2-2 fail two (1.028, 1.109); **Rank 1 is the only tree that passes all six on both rigs**
  (max 0.958 / 0.873).
- **O5 ≥ 3.0 and monotone on all six cells, BOTH rigs.**
- **C1 site coverage ≥ 0.90 on all six cells at d=50.**

**Why the gate is the raster and not the reviewer's site metric — stated openly, because this is effectively
a choice about how the RED is measured, and the orchestrator should ratify it.** The site metric counts
*refused* sites (`tooShort`); it cannot see cross-row bare area by construction, because the quantity it
weights each site by (`R·P`) is the same whether the tick fills the cell or crosses 18 % of it. The
counter-example is decisive: on `torus/hatch` the site bare area goes **19.37 → 23.02 mm² (worse)** under the
prototype while `wedge25` goes **0.00751 → 0.00049 (15× better)** and `holeMax` goes **0.878 → 0.652** — and
the picture (§1.4, §3.4) agrees with the raster. **Gating on the site metric would forbid the only mechanism
that fixes the picture.** The site table is therefore required to be *reported* on all six cells (it is the
reviewer's RED and the continuity with two previous units) and is **not** a pass/fail gate.

**A bar I tried and am REJECTING as a bar, with the measurement (rule 1: name what you do not gate).**
I built a "tick-length transition hardness across rows" statistic as the brief asked — p95 of
`|L_ask(site) − L_ask(nearest drawn site in a DIFFERENT row)| ÷ 0.84·R`. **It does not separate:** BASE
1.855 / 2.104 / 0.998, T2-1 1.739 / 1.276 / 1.269, T2-2 1.739 / 1.276 / 1.243, Rank 1 1.977 / 1.425 / 1.402
(sphere/hatch, torus/hatch, cone/hatch). It is dominated by the row-to-row variation of `R` itself, not by
the curve. I also built a curve-shape "shelf span" (fraction of occupied `I` bins whose normalised mean drawn
length sits within 0.10 of either anchor); it is **identical to three decimals between T2-1 and T2-2**
(0.350/0.300/0.368/0.250/0.429/0.333 both trees) — which is a correct result given §0, and therefore useless
as a discriminator. **The "hard-edged" half of Jay's complaint is gated by W3 (largest inscribed hole) plus
the picture, and the implementer must say so rather than shipping either of these two as a guard.**

### 2.5 d=220, reported not gated

| cell, d=220, test rig | BASE | T2-2 | Rank 1 |
|---|---|---|---|
| sphere/hatch site coverage | 0.925 | 0.815 | 0.835 |
| torus/hatch | 0.907 | 0.674 | 0.709 |
| cone/hatch | 0.936 | 0.815 | 0.839 |

Rank 1 recovers **+1.5 to +3.5 points** of the collapse and does not close it. **This is T2-4's item
(LEDGER row 5b) and must stay filed there** — it is `LMIN·R` (0.18 × 1.05 = 0.19 mm) falling under
`MIN_MARK_MM` (`= MIN_MARK_PEN 2 × penWidth 0.3 = 0.6 mm`, `surface-fill.js:364`, `:5537`, drop at `:6262`),
a named constant against a physical plot floor, not a placement defect. T2-3 must report these three numbers
and not chase them.

---

## 3. RANKED MECHANISMS — Rank 1 is PROTOTYPED and PASSES its spike gate

### Rank 1 — **cross-row stagger: scatter the tick's own centre over the room its shortening just created** ✅

**One insertion point,** `surface-fill.js:6451` (inside `layMark`, immediately after `mkShape` returns), gated
on `law.shape === 'tick'` — which is unique to `mkTick` in the `MK` table (`:2517–2530`):

```js
polys = mkShape(shapeFor(), sv.L, sv.R, w);
// T2-3 — a 'tick' spends its whole LENGTH across the row and is built CENTRED on
// the row line (mkShape :2637), so every mm the length response takes off the tick
// is subtracted from the ROW-TO-ROW direction and opens a bare strip of (R-L)/2 on
// BOTH sides of every row, running the row's whole length — the wedge T2-1 and T2-2
// were both rejected for. Scatter the tick's own centre over exactly the room its
// shortening created, on a golden-ratio (low-discrepancy) sweep of the site's own
// arc index, so successive ticks in one row TILE the row's cell instead of stacking
// on its centre line. Zero at the dark anchor (L -> L0*R leaves no room, and pure
// abutment is preserved bit-for-bit); maximal exactly where the wedge is.
if (law.shape === 'tick') {
  const room = 0.5 * Math.max(0, sv.R - sv.L);
  if (room > 1e-6) {
    const idx = a / Math.max(1e-6, sv.P);
    const uu = ((idx * 0.6180339887498949) % 1 + 1) % 1;
    const cOff = room * (2 * uu - 1);
    polys = polys.map((pl) => pl.map((pt) => [pt[0], pt[1] + cOff]));
  }
}
```

**Why this is the right shape of fix.** It changes **placement**, not the tone solve: `sv.L` and `sv.P` are
untouched, so `mkAsk`'s delivered ink-area fraction, the `P = L/g` conservation, `byThird`, `flood`, `gMax`
and every other published statistic keep their meaning. `|cOff| ≤ (R − L)/2` by construction, so a tick can
never leave its own row cell — the row structure the law documents is preserved, and at the dark anchor
`room = 0` so **black-by-abutment is bit-for-bit what it was**.

**Shipping constants.** Two compensators are needed and both are **measured, not guessed**:

| constant | `179d9218` | T2-3 | why |
|---|---|---|---|
| `MK.mkTick.L0` | 1.02 | **1.16** | The stagger spends part of the abutment margin: two adjacent rows' ticks can be offset apart by up to `2·room`, so the worst-case row-to-row gap is `R − L + (c₂ − c₁) ≤ 2(R − L)`. Raising `L0` shrinks `R − L` near the dark end, which is the only place that worst case bites. Measured effect on O5's weakest cell (`torus/hatch`, test rig): 2.772 → 2.999. |
| `MK_TICK_EASE_BLEND` | 0.88 (T2-2's) | **0.92** | Pure O5 headroom. §0 proves this parameter has **no** effect on the wedge (T2-1 ≡ T2-2), so it is now free to be chosen on O5 alone. 0.88 → 0.92 takes `torus/hatch` 2.999 → 3.008 and `cone/hatch` 3.385. 0.96 also measured (3.024 / 3.605) and is available if the implementer needs more margin. |
| `MK.mkTick.LMIN` | — (0.18 in T2-2) | **0.18, unchanged** | Swept 0.14/0.16/0.18: lowering it buys O5 but costs coverage (0.983 → 0.970 on sphere/hatch) and pushes `LMIN·R` toward `MIN_MARK_MM`. Leave it. |

**Spike-gate result — PROTOTYPED in a scratch export of the base, measured on both rigs, all six cells:**

| gate | test rig | create rig | verdict |
|---|---|---|---|
| O5 ≥ 3.0, monotone, 6/6 | 3.008 / 3.130 / 3.385 / 3.741 / 3.813 / 3.818, **all monotone** | 3.039 / 3.084 / 3.257 / 3.542 / 3.731 / 4.281, **all monotone** | **PASS** |
| W1 `wedge25 ≤ 0.020` 6/6 | max **0.01564** (cone/hatch) | max **0.00479** | **PASS** |
| W2 mean ≤ BASE's own | **0.00296** vs BASE 0.00484 | **0.00134** vs BASE 0.00216 | **PASS** |
| W3 `holeMax ≤ 1.00` 6/6 | max **0.958** | max **0.873** | **PASS** (only tree that does) |
| C1 coverage ≥ 0.90 at d=50 | 0.978–0.993 | 0.958–0.999 | **PASS** |
| perf (torus d=220) | 429 ms vs BASE 402 ms, bar 2500 ms | — | **PASS** |

⚠ **The thin margin the implementer must watch: `torus/hatch` O5 = 3.008 (test rig) / 3.039 (create rig) — a
0.3 % margin.** The same cell was T2-2's thinnest at 3.056. O5's light third holds few marks and the statistic
moved ±0.3 across my own stagger-amplitude sweep at fixed curve, so **this bar has placement noise of order
its own margin**. The implementer must (a) report the sweep, (b) raise `MK_TICK_EASE_BLEND` to 0.96 if 0.92
does not hold on the final tree, and (c) **if neither clears 3.0 honestly, ship the measurement and stop** —
do not re-scope O5's population.

**Ablation that proves the stagger is the load-bearing half** (so nobody mistakes this for another constant
re-tune): `L0 = 1.16`, `BLEND = 0.88`, **stagger OFF**, test rig — `wedge25` = 0.01531 / 0.02310 / 0.00615 /
0.01613 / **0.03984** / 0.00580, mean **0.01771** (3.7× BASE, i.e. still the rejected picture); `holeMax`
0.888 / 1.028 / 0.842 / 0.834 / 1.072 / 0.639. **The constants alone fix nothing; the stagger does the work.**

**Amplitude sweep** (`room` scaled by `STAG`, `L0`/`BLEND` at T2-2's values, test rig): `STAG` 0.4 / 0.6 /
0.8 / 1.0 gives `cone/hatch` wedge25 0.0341 / 0.0262 / 0.0209 / 0.0185 and `holeMax` 1.033 / 1.033 / 0.979 /
0.979. **`STAG = 1` (the full room) is best on every cell and every metric — do not damp it.**

### Rank 2 — length modulated along the row by a smooth spatial kernel (the brief's first candidate)

Rank this **below** Rank 1 on the mechanism: the wedge is a **cross-row** hole (§1.1), and any modulation that
still leaves every tick centred on its row line leaves `(R − L)/2` bare on both sides however smoothly `L`
varies along the row. The curve/along-row family is exactly what T2-1 and T2-2 already exhausted (§0). **Only
attempt this if Rank 1's O5 frontier cannot be met**, and then as a *weave* (a smooth `cOff(a) = room ·
sin(2π a / Λ)` replacing the golden sequence in the same one insertion point) rather than as a length
modulation — i.e. keep Rank 1's mechanism and change only its offset generator. Untested; a continuous weave
may read as more "hand-drawn" than a hash scatter but is unlikely to beat it on W1/W3, because pinching a
continuous channel is harder than puncturing it.

### Rank 3 — tone carried by tick COUNT with a narrowed length range

`LMIN` 0.18 → ~0.55 caps the cross-row hole at `0.45·R` and lets period carry the rest. **Measured to fail R1
by construction:** the length swing falls to 1.85×, so O5 cannot reach 3.0 on any cell (BASE, which is this
design at `LMIN = L0`, measures 1.115–1.500). This is the pre-fix design with extra steps. **Ship it only as a
MEASURED fallback if Ranks 1 and 2 both fail, and say plainly that it does not answer R1.**

### Rejected without prototyping, with reasons

- **Shrink the row pitch where `L` is small** (make `MK_ROW_COV` tone-dependent). It would work, and it is
  **FORBIDDEN**: `surface-fill.js:4993` is T3's file, and W-05b's own plan forbids the master grid.
- **Anchor the tick to one end, alternating by row parity.** Analytically worse: rows *j*/*j+1* close their
  gap completely while *j+1*/*j+2* open to a full `R`. Alternating zero and full holes is a *larger*
  `holeMax`, not a smaller one.
- **Re-derive the plan's own `g`-based length formula.** T2 measured it broken (dark/light 1.2–1.5×) and the
  T2-2 reviewer reproduced that independently. Do not revisit.
- **Another curve.** §0.

---

## 4. Guards, evidence, files, stop conditions, ordering

### 4.1 Files ALLOWED (the W-05b plan's own list, unchanged)

- `src/core/scene3d/surface-fill.js`, and inside it **only**: the `MK` table (`:2517`), the mark constants
  (`:2379–2450`), `mkCap`/`mkShape` (`:2554`, `:2582`), and the `emitMarks` block (`:5974–6510`) plus the
  `publishMarkStats` projection (`:11664`). The Rank-1 diff is expected to be: the `MK.mkTick` row, the
  `MK_TICK_EASE_BLEND` constant, the `lenChan` branch in `solveAt`, `place`'s return value, the
  `lenByThird`/`cntByThird` seam, and **the one new block at `:6451`**.
- `tests/unit/scene3d-mark-laws-draw.test.js` and a new `tests/unit/scene3d-mktick-wedge.test.js`
  (the instrument) + `tests/unit/scene3d-mktick-length.test.js` (O5, re-created — the revert removed it).

### 4.2 Files FORBIDDEN

- **The master grid** (`surface-fill.js:5084–5285` incl. `lastMasterGridStats`) — read `N`/`masterPitch`,
  never write.
- **`MK_ROW_COV` and `isMarkLaw()`'s row-coverage line (`:2379`, `:4993`) and any `rowFloor` flag — T3's.**
- **`emitContFamily` internals (`:9275`+)** and the wave-law amplitude code (F1-amp's back-port).
- `surface-fill-mono.js` (fill-audit-c) · `mappers.js` / slices (fill-audit-d) · `hlr.js` / `shadows.js`
  (handoff-c) — note `shadows.js:1229` has its **own unrelated `mkTick`**; it must not be touched and must be
  named in the report as checked-and-untouched.
- `HL_STAGE` (`:388`) — `coverageCap` stays `false`.

### 4.3 Guards to run (targeted, FOREGROUND, `timeout: 600000`, one file at a time)

`scene3d-mark-laws-draw.test.js` (owns **G4**'s band-width guard at `:406–436` — that guard is **mkDashRamp's,
not mkTick's**, confirmed by reading it; say so rather than claiming mkTick is gated by it) ·
`scene3d-mkdashramp-dark-end.test.js` (**T4b**) · `scene3d-crosshatch-parity.test.js` (**W-36c** — mkTick on
crosshatch inherits the per-family budget from Jay's decision 6=C, so this file is the one that can bite) ·
`scene3d-crosshatch-cell-shape.test.js` (W-31) · `scene3d-ladder-uniform-field-spacing.test.js` ·
`scene3d-fill-ruling-corners.test.js` (W-33) · `scene3d-hatch-density-angle-stable.test.js` (W-36b) ·
`scene3d-fill-even-spacing`, `-span-verdict`, `-curved-density-floor`, `-curved-density-sparse-end`,
`-hatch-density-500`, `-plot-safety` (T1b's min-spacing guard — the stagger moves mark midpoints, so this one
is a real risk, not a formality) · batched `scene3d-tone-law-dispatch` + `-tone-algo-default` +
`-hl-stage-roster` + `-fill-ruling-continuity` + `-fill-boundary-ends` + `-hlr-spatial-index-identity` ·
`scene3d-ribbon-f1b-streaks`, `-ribbon-wall-coverage`, `-ribbon-f1-amp` (lane baseline; **the lane is fully
green at `179d9218` — if any of these is red, reproduce it at the base sha and file it under
`## Pre-existing red`, per standing rule 5**).

**Byte-identity, already run for this plan and reproducible:** `md5(JSON.stringify(paths))` from
`algo.generate`, clean `3bc61c32` export vs clean prototype export.
- Sweep A — 15 tone laws × {sphere, torus, cone} × `hatch` × {d1, d50, d220} = **135 cells: 126 identical, 9
  differ, and all 9 are `mkTick`'s own.**
- Sweep B (**rule 2 — the full mapper roster, because F1-amp was sent back for sweeping `hatch` alone**) —
  8 laws × **all 8 MAPPERS** (`none, hatch, wireframe, crosshatch, contour, spiral, stipple, contourSlice`,
  `params.js:79`) × 3 primitives × {d50, d220} = **384 cells: 366 identical, 18 differ, all 18 `mkTick`'s
  own, ZERO non-mkTick differences.**
- **Coverage as a fraction of the roster, with the exclusions justified:** the roster is 8 mappers × 37
  PRODUCTION laws. Sweep B covers **8/8 mappers** and 8 laws; of the 12 `MK` mark laws, **8 (`mkLozenge`,
  `mkChevron`, `mkComma`, `mkSFlick`, `mkCrossPlus`, `mkTriangle`, `mkDotLozenge`, `mkRadialFlick`) are not
  in `SCENE3D_TONE_LAWS` on this build and silently fall back to `'ladder'`** — a pre-existing, already
  twice-documented gap (T1, T2-review §4), not one this unit introduces; they are covered *as ladder*. The
  ribbon laws are out of scope (the mark sink is not reached). The implementer must repeat sweep B and state
  this fraction.

### 4.4 Evidence cells — **every one verified present in `manifest.B.{1..5}-5.jsonl`**

`--only '^(sphere|torus|cone)__(hatch|contour)__mkTick__(low|med|max)__a$'`, **both rigs**, run from MAIN
against the worktree, out to `docs/3d-audit/fill-audit/after/T2-3/`.

| cell | in manifest | baseline pathCount / inkMm |
|---|---|---|
| `sphere__hatch__mkTick__med__a` | ✔ | 1112 / 5045.4 |
| `sphere__contour__mkTick__med__a` | ✔ | 1088 / 4732.4 |
| `torus__hatch__mkTick__med__a` | ✔ | 403 / 1326.7 |
| `torus__contour__mkTick__med__a` | ✔ | 338 / 1355.5 |
| `cone__hatch__mkTick__med__a` | ✔ | 566 / 2523.1 |
| `cone__contour__mkTick__med__a` | ✔ | 645 / 2523.8 |

Add `sphere__hatch__ladder__{low,med,max}__a` and `cone__hatch__ladder__med__a` as the **unchanged control** —
a non-identical ladder cell is an immediate REJECT. The five ribbon laws and any imported-mesh primitive are
**not** captured and none is named here.

**Pictures already taken for this plan** (dev servers on 8497/8498/8499, all three **killed**, verified with
`lsof`; `served version 1.4.1` matched each root's `package.json`), in
`docs/3d-audit/lane-reports/T2-3-plan-evidence/`:
`base/`, `t22/`, `proto/` shot sets (create rig; `proto/` and `base/` also `--rig addLayer`) ·
`shots-create-6cells.png` (6 cells × 3 trees, 2× downscaled sheet — the per-cell `.webp` originals are alongside, at native resolution) · **`crop-cone-hatch-lit-flank-2x.png`** ·
`bare-area-map-cone-hatch-med.png` + `-crop3x.png` + `-proto.png` + `-proto-crop3x.png`.

**What I saw, at native resolution, on the cone/hatch lit-flank crop (create rig):** BASE — ticks of
**uniform length** with widening spacing; tone is carried entirely by gaps between same-length spokes, which
is the thing 8.png complains about. T2-2 — length does taper, but the field has collapsed into four broad
bands separated by wide black wedges running parallel to the rows; it reads as *bands with wedge-shaped
holes*, not a texture. Rank 1 prototype — tick length visibly grades from long near the shadow to short flicks
toward the light, the ticks are scattered across the full row cell rather than strung on its centre line, and
**there is no broad wedge anywhere on the flank**; the field reads as one continuous texture whose tick length
carries the tone. That is Jay's sentence, rendered.

### 4.5 Stop conditions — report, do not fudge

1. **O5 cannot reach 3.0 on `torus/hatch` at `BLEND ≤ 0.96`.** Ship the measurement (prototype: 3.008 at 0.92,
   3.024 at 0.96) and stop. **Do NOT re-scope O5's population, do NOT lower the bar, and do NOT lower `LMIN`
   below 0.18** (measured: it buys O5 and costs coverage).
2. **W2 cannot be brought under BASE's own six-cell mean on BOTH rigs.** Then Rank 1 has not worked on the
   real tree; report and go to Rank 2's weave variant, once.
3. **`scene3d-plot-safety` or T1b's min-adjacent-mark guard goes red.** The stagger moves mark midpoints; a
   red here is a genuine plot-safety finding, not a bar to re-pin. Stop and report the worst pair in pens.
4. **Any byte-identity pair breaks for a law outside `mkTick`.** Stop and re-scope; do not re-pin a
   fingerprint.
5. **d=220 coverage.** Report the three numbers of §2.5 and stop. **It is T2-4's.** Raising the effective
   `MIN_MARK_MM` floor is a plottability question, not this unit's.
6. **Any picture that still reads as bands with holes, whatever the numbers say.** Crop at native resolution
   and look before claiming anything.
7. **Two iterations maximum.** This is the third attempt at one item; a third rejection should convert the
   item to MEASURED-with-the-instrument rather than a fourth try.

### 4.6 Ordering — T2-3 does NOT wait for T3

- **T2-3 touches no line T3 owns.** T3 is the W-05b plan's U3: `isMarkLaw()`'s row-coverage line (`:4993`) and
  `R`'s divisor (`:6331`), behind a `MK[...].rowFloor` flag. T2-3 touches `MK.mkTick`'s row, the ease
  constant, `solveAt`'s `lenChan` branch and `layMark`'s `:6451`. **Disjoint.**
- **The dependency runs the other way, and it is one-directional.** T3's row floor is arithmetically
  byte-identical at d=50 and d=220 and only bites where `masterPitch > 4.8 mm` (d=1). The Rank-1 stagger is
  defined *relative to* `R`, so it adapts to whatever row pitch T3 later hands it — no re-tune needed.
  **Requirement on T3, to be carried into its brief: after T3 lands, re-run W1/W2/W3 at d=1 on the six cells,
  because T3 is the unit that changes `R` there and nobody has ever measured the wedge at that density.**
- **Ordering on lane a3:** `T2-3` → `F1-width-bar` (in flight) → `T3` → `W-31b`. They all edit
  `surface-fill.js`, so they are **serial**, one implementer at a time — but T2-3 is first because it is the
  round's only returning REJECT and it carries a user-visible picture.
- **T2-4 stays queued and separate** (LEDGER 5b). Do not fold it in.

---

## Bars changed

*(section 5 of the brief)*

This plan is read-only and changes nothing. It **proposes** the following, every one of which the implementer
must restate under its own `## Bars changed`, in the report **and** the commit body:

- `tests/unit/scene3d-mktick-wedge.test.js` — **NEW FILE, NEW BARS (labelled as new).**
  `W1 wedge25 ≤ 0.020` per cell · `W2 six-cell mean wedge25 ≤ 0.00484` (test rig) / `≤ 0.00216` (create rig)
  · `W3 holeMax ≤ 1.00` row pitch per cell. Rationale and separation table in §2.3/§2.4. **Mutation proof
  required and BLOCKING:** reverting the `:6451` stagger block must turn W1/W2/W3 red with the numbers of
  §2.3's T2-2 column; reverting `chan:'len'` to `chan:'count'` must turn **O5** red with the numbers of §2.3's
  BASE column. Both mutations must be shown, because the two halves of Jay's rule are gated by different
  tests.
- `tests/unit/scene3d-mktick-length.test.js` — **RE-CREATED** (the T2-2 revert removed it). `O5 ≥ 3.0 and
  monotone` on all six cells. ⚠ **It must now assert on BOTH rigs, or state in its own comment that it asserts
  on the unit fixture only and that the create rig is covered by the evidence shoot** — because T2-2's O5
  claim was rig-local and failed on the create rig (§2.3), and the previous file could not tell.
- `tests/unit/scene3d-mark-laws-draw.test.js` — **O1's POPULATION will change again** from all walked ticks to
  the longest third by chord length, numeric bar `>= 0.10 mm` unchanged. This is the identical re-scope T2-2
  disclosed and two reviews independently ruled sound (sagitta `∝ L²/8r`, so an all-population median must
  fall once length varies by design: 0.127 → 0.076 mm). **It is a bar change under the 2026-09-13 amendment
  and must be re-disclosed and re-derived on this tree, not cited.**
- `src/core/scene3d/surface-fill.js` — **shipped-constant changes** (not test bars, disclosed anyway):
  `MK.mkTick.L0` **1.02 → 1.16** and `MK_TICK_EASE_BLEND` **0.88 → 0.92**, each with the measured
  before/after of §3 and the mechanical reason. `MK.mkTick.LMIN` stays **0.18**. `MK_ROW_COV`, `MK_ARC_PEN`,
  `MK_MIN_ADJ_PEN`, `MK_MAX_WALK_STEPS`, `MK_PMAX`, `MK_DARK_AREA`, `MK_LIGHT_AREA`, `MK_BAND_MAX_PASSES`,
  `MIN_MARK_PEN` are **untouched**.
- **No existing bar is widened, and no fingerprint is re-pinned.** The site-level coverage bar (`≥ 0.90` at
  d=50) keeps its value **and its population** and is met (0.958–0.999 on both rigs).
