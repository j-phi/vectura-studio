STATUS: PLAN-READY

# T2-6 — plan (Jay's USER RULE clause (a), lane `fill-audit-a4`, base `75777240`)

**Summary.** Jay's clause (a) — *"Instead of tick fragments on the right, use gradually shortening
ticks to fill the black gaps at the bottom of the vertical waves"* — is now measurable, and the
measurement names the defect exactly. **The "black gaps at the bottom of the vertical waves" are the
across-row bare strip `R − L` that `chan:'len'` opened: it is 0.000 row pitches on every one of the
twelve fixtures at `v1.4.1`, 0.40–0.54 RP at T2-3c, and **unchanged** at T2-5's `75777240`.** The
"tick fragments on the right" are the same strip seen along the row: within one band, drawn tick
length carries essentially none of the tone (**within-band R² = 0.047–0.078 on `cone/hatch`**,
against 0.62–0.66 on the contour cells), because the golden-ratio stagger scatters the tick's centre
and the length response is a per-site function of `I` with no along-row or across-row continuity.
T2-5's sub-tick re-tiling touched neither: it fires only where `L0·R > 2·RP` (0.029 of the band-gap
area on `cone/hatch/create`), which is why its clause-(a) oracle moved while the picture did not —
independently confirmed by `T2-5-review.md` §3 and reproduced here. **Rank 1 — the GRADED BAND COMB
— is PROTOTYPED and passes the spike gate on all twelve fixtures**: every band wide enough to hold
one lays a *geometric run* `each_j = e0·ρ^j` (Σ = `sv.L` exactly, so delivered ink area is
bit-identical) across its own sub-bands, longest at the dark edge, so consecutive ticks have ratio
exactly ρ and Jay's "no tick under half its neighbour" holds **by construction**. At the shipped
setting (ρ = 0.62, ≤ 2 sub-ticks, envelope 0.85·R, gated on both band edges being on-chart) the
**A1 graded-gap share goes 0.00–0.16 → 0.16–0.56, the P95 black-gap run 0.40–0.54 RP → 0.26–0.51 RP,
within-band R² rises on 12/12, `bandC` falls on `cone/hatch` 0.0881 → 0.0640, and every shipped bar
holds**: `wedge25` mean 0.08876 → 0.08946 (create, bar 0.095) and 0.07557 → 0.07574 (test, bar
0.080), per-cell max 0.17307/0.08747 (bars 0.180/0.090), `O5 ≥ 2.30` monotone 12/12 (min 2.4258 /
2.3426), `holeMax` **identical on 12/12**, `siteCoverage` ≥ 0.9793, `ovMax` unchanged at 0.0800,
`over2RP` still 0/12, pen-downs +8.5 %/+10.9 %, ink ±0.4 %, d = 1 is metric-identical on both rigs, and the **full-scope md5
roster sweep (4 × 8 mappers × 37 laws = 1184 cells) changes exactly 12 cells, all `mkTick`, zero
non-mkTick** — 100 % of the scope T2-5's own plan asked for and could not finish.
⚠ **Two things the implementer must not skip.** (1) An **image-space** re-read of the rendered cell
says the gap fill is far larger than the shipped vector-space instrument reports: bare pixels
≥ 0.25 RP from ink fall **5925 → 4026 (−32 %)** on `cone/hatch/create` while `wedge25` reads **+3 %**
on the same cell — `wedge25` splats mkTick's own coarse *along-row* samples isotropically
(`T2-3-impl.md`'s own disclosed limitation) and is blind in the cross-row direction at sub-row scale,
which is the only direction this defect lives in. (2) **The dials are a cliff, not a ramp**: at
≤ 4 sub-ticks and `splitMinR = 0.30` the same mechanism breaks `O5` on `torus/hatch` (2.586 → 2.012,
non-monotone), the `wedge25` per-cell ceiling on `test|torus/contour` (0.09075 > 0.090) and the
`bandC` ×1.05 clause on `sphere/contour` (+62 %) — all measured, all in §4.4. **Clause (b) is
untouched by design** (`ovMax = (L0−1)/2` exactly, ρ-ramp and envelope cancel out of it, verified
0.0800 on 12/12) and stays Jay's ruling. **T2-4 does not fold in and gets worse at d = 220**
(`wedge25` 0.0918 → 0.1178 on `cone/hatch/create`) — reported with numbers, with a d = 220 stop
condition. **T3c stays separate**: `mkDashRamp` is byte-identical in the roster sweep.

---

## 0. Fixtures, rigs, instruments — read before any number below

### 0.1 Trees measured

| label | sha | how obtained | what mkTick is there |
|---|---|---|---|
| `v1.4.1` | `426cc5e4` | `git archive` from MAIN → `/private/tmp/claude-501/scratch-T26-v141` | `chan:'count'`, `L0 = 1.02`. Tone by COUNT; `L/R ≥ 1.02`, so **a band is always fully covered and there is no across-row gap at all**. Not a target — it is the design `user-reports/8.png` rejected — but it is the only tree in the family with **zero** black gaps, which is what makes it the right zero point for A1b. |
| `T2-3c` | `7375918c` | `git archive` from `.claude/worktrees/fill-audit-a3` | `chan:'len'`, `L0 = 1.16`, `LMIN = 0.18`, the golden-ratio stagger, `Lfloor` area floor, walk jump cap, `MK_ROW_COV` row floor. **This is the tree Jay looked at when he wrote the rule.** |
| `HEAD` | `75777240` | `git archive` from `.claude/worktrees/fill-audit-a4` → `/private/tmp/claude-501/scratch-T26` | `T2-3c` + T2-5's minimal sub-tick re-tiling (`nSub = ceil(L0·R / 2·RP)`, clamp 1..6). |
| `Rank 1` | prototype | `scriptOverrides` patch of `HEAD`, written to disk **only** in `/private/tmp/claude-501/scratch-T26-F3` (a scratch copy, for the capture harness). Never in a worktree, never in MAIN. | HEAD + the graded band comb (§4). |

### 0.2 Fixture, stated in full (standing rule 3)

`BOUNDS = { width:1200, height:1000, m:20, dW:1160, dH:960, penWidth:0.3 }`; `camera = DEFAULT_CAMERA`
(angle key `a`); one directional sun `{ azimuth:135, elevation:45, intensity:1, castShadows:false }`;
**`ground:{enabled:false}`, `backdrop:{enabled:false}` — NO GROUND-PLANE INK IS INCLUDED IN ANY INK
TOTAL BELOW**; `styleTable.scene.params = { fillAngle:45, fillDensity:<d>, toneLaw:'mkTick' }`;
`tone.enabled = true`; one object at identity transform, `visibility:'solid'`. `d = 50` unless a row
says otherwise (d = 1 and d = 220 rows are labelled).

**Rigs.** `create` = `PRIMITIVE_CREATE_DEFAULTS` over `PRIMITIVE_PARAM_DEFAULTS` — the gallery's and
Jay's. `test` = `PRIMITIVE_PARAM_DEFAULTS` alone — **what every RGR test in this lane constructs**, and
**not** the capture harness's `--rig addLayer` (T2-5 proved that divergence; it is unchanged here).
Every headless number below names its rig. Every capture below names its `--rig`.

**Cross-check against T2-5's published numbers, so the instruments are comparable:** `cone/hatch`,
create, `T2-3c` → pathCount **580**, ink **2485.7 mm**; `HEAD` → 664 / 2500.6; `ovMax` 0.0800 on both;
`over2RP` **40 → 0** (T2-5 plan §2: 40 / 381.2 mm); `wedge25` 0.06054 → 0.06091; pooled
`lenToneR2n` 0.1017 → 0.0989 (T2-5 plan: 0.102). **All match.**

### 0.3 Instrumentation (read-only, proven geometry-neutral)

A `scriptOverrides` patch of `surface-fill.js` adds, in `layMark`, **one record per EMITTED sub-poly**
(`shape, k, a, I, R, P, L, cOff, parity, lineIndex, sub, nPoly`, the poly's own across-row extent
`[v0, v1]`, and its drawn screen polyline), plus a caller-line stamp on `pushRun`, plus — for
`v1.4.1` only — a backport of `mkStat.tickField` / `tickSites` so the wedge raster can run on a tree
that predates them. **Nothing was written into any worktree or into MAIN's `src/` or `tests/`.**
`tests/helpers/scene3d-mktick-wedge.js` and `-band.js` are taken from **HEAD's** copy for all trees so
the readings are comparable. Harness:
`docs/3d-audit/lane-reports/T2-6-plan-evidence/scripts/` (`lib.js`, `metrics26.js`, `proto26.js`,
`protorun.js`, `run.js`, `roster.js`, `inkchk.js`).

⚠ **A second, independent instrument is used for the picture** (see §1.3 and the Summary): a raster
read of the *rendered gallery shot* — ink threshold, object mask by closing/eroding one row pitch
(`bandC`'s own recipe), Euclidean distance transform, count of object pixels ≥ 0.25 RP and ≥ 0.50 RP
from any ink. It measures the same rule `wedge25` states but on the picture rather than on mkTick's
own along-row sample field, and **the two disagree in sign on the cell Jay is looking at**. Both are
reported everywhere; neither is suppressed.

### 0.4 Sweep breadth (standing rule 2)

`MAPPERS` (8, `src/core/scene3d/params.js:79`) × `SCENE3D_TONE_LAWS.PRODUCTION` (37) = **296 cells**
per primitive×rig, run as an md5 identity sweep HEAD vs Rank 1. Result in §5.6. The per-oracle tables
below cover `{sphere, torus, cone} × {hatch, contour}` × both rigs = **12 fixtures**, at d = 50, plus
d = 1 and d = 220 rows.

---

## 1. THE PICTURE JAY DESCRIBES, MADE MEASURABLE

### 1.1 What the words point at, in the geometry

A `mkTick` mark is a stroke that spends its **whole length across the ruling** (`mkShape`'s `'tick'`
branch, `surface-fill.js:2784–2793`, `polys.push([[off, -each/2], [off, each/2]])`), built centred on
its row line, on a **brick lattice with one site per row-pitch cell** (`MK.mkTick`,
`surface-fill.js:2697`: `lat:'brick'`, `P0:1.02`; the phase accumulator at `:6843–6879`). So the field
is a set of **rows** at pitch `R`, each carrying a comb of short strokes perpendicular to the row.

- **A "vertical wave"** is one such row, seen on the cone at `fillAngle 45`: its ticks are steep,
  near-vertical strokes, and where `L → L0·R` they abut into a continuous ribbon. Native crops:
  `crop_rightflank_x4_HEAD_top_F3_bottom.png`, `crop_midright_x4_HEAD_top_F3_bottom.png`.
- **"The black gaps at the bottom of the vertical waves"** are the **bare across-row strip**
  `R − L` that opens on the light side of each row as `L` shortens. On this render (white ink on a
  black ground) that strip prints literally black. **Its size is the quantity A1b measures.**
- **"Tick fragments on the right"** are the same strip seen along the row on the lit flank: the
  stagger throws each tick's centre to an unrelated depth inside its band, so consecutive ticks in one
  row do not line up into a front and read as scatter. **Its size is what A1, A2 and A3 measure.**

### 1.2 The annotation, at native resolution

`anno_cone_hatch_HEAD.png` / `anno_cone_hatch_F3.png` (627 × 749, the gallery's own size) paint every
object pixel **≥ 0.25 row pitches from any ink** dark red and **≥ 0.50 row pitches** bright red — the
band-gap region, by `wedge25`'s own rule, on the actual picture. `anno_crop_midright_x4_HEAD_top_F3_bottom.png`
is the 4× native crop of the transition zone.

**What I see at HEAD (top panel):** the band-gap region is a broad, connected dark-red web running
diagonally through the transition, with a scatter of bright-red cores — gaps a whole half row pitch
across — sitting *inside the shaded surface*, not in the highlight. The tick rows above and below the
web are ragged: ticks of visibly different lengths at unrelated depths, several isolated stubs
floating in black. That is Jay's sentence, both halves, in one crop.

### 1.3 The counts

| `cone/hatch/mkTick/med/a`, `--rig create`, native 627×749 | HEAD `75777240` | Rank 1 | Δ |
|---|---|---|---|
| object-mask pixels | 204 597 | 200 876 | — |
| bare pixels ≥ 0.25 RP from ink | **5 925** | **4 026** | **−32.0 %** |
| bare pixels ≥ 0.50 RP from ink | **594** | **405** | **−31.8 %** |
| as a fraction of the object mask | 0.02896 | 0.02004 | **−30.8 %** |
| `wedge25` (shipped vector-space instrument, same cell) | 0.06091 | 0.06290 | **+3.3 %** |

⚠ **The two instruments disagree in sign, and the reason is known and documented.** `T2-3-impl.md`'s
own "HONEST METHODOLOGY LIMITATION" records that the shipped `wedge25` builds its surface from
**mkTick's own coarse ALONG-ROW field samples, splatted isotropically at radius `rowPitch/2`** — so
every row's own endpoint disc already covers half a row pitch of cross-row space, and a change in how
ink is distributed *across* a row is largely invisible to it. The raster above reads the rendered
picture. **The implementer must report both, and must not treat `wedge25`'s +3 % as evidence the gaps
did not close, nor the raster's −32 % as licence to let `wedge25` regress past its bar.**

---

## 2. THE ORACLES

All three read the same population: **every `mkTick` sub-tick actually emitted**, grouped into
**sites** (one `solveAt` call = one lattice cell = one band cell of width `R`). `RP` =
`lastMarkStats.tickField.rowPitch` (4.423–4.542 mm on these cells). Highlight = `I ≥ 0.90`, T2-3's own
threshold.

### A1 — GRADED-GAP SHARE (the brief's oracle, made non-vacuous)

For each site: the band is `[−R/2, +R/2]`; its **covered set** is the union of its sub-ticks' own
`[v0, v1]`; its **band-gap area** is `R − covered`, weighted by the site's own period `P`. A site's
comb is **graded** when it has ≥ 2 sub-ticks whose lengths are monotone in `v` **and** every
consecutive pair satisfies `min/max ≥ 0.5` — Jay's "no tick under half its neighbour", verbatim.

> **A1 = Σ(band-gap area × P over graded sites, I < 0.90) ÷ Σ(band-gap area × P over all sites, I < 0.90).**
> **A1dir** additionally requires the comb to shorten toward the **brighter** side, where "brighter"
> is taken from the nearest site in an adjacent row projected on the tick's own axis.

⚠ **The along-row form of A1 that the brief's wording also admits is VACUOUS for any re-tiling and
must not be used.** A re-tiling conserves a site's total drawn length *and* its band-gap area exactly,
so an oracle that reads site-to-site monotonicity of the **total** is provably invariant under the
whole mechanism class. Measured: it reads 0.627 at HEAD and 0.627 under a re-tiling prototype — a
number that cannot move. **This is the same failure mode as T2-5's clause-(a) oracle** ("the oracle
PASSED while the picture did not move", `STILL-OPEN.md:663`), and naming it is half of what T2-6 owes.
The within-band form above moves 0.029 → 0.479 on the same pair.

### A1b — THE BLACK-GAP RUN (the bar that moves when the gaps fill)

> **A1b = P95 (and max) over non-highlight sites of the longest uninterrupted bare run inside the
> site's own band, in row pitches.**

This is the literal size of "the black gap at the bottom of the wave". It is **0.000 on every fixture
at `v1.4.1`** (there is no gap: `L/R ≥ 1.02`), 0.401–0.535 at T2-3c, unchanged at HEAD. It is the
one number in this family that is zero on a tree with no gaps, large on the tree Jay rejected, and
falls when ink is redistributed across the band. **Make this the blocking half of clause (a).**

### A2 — FRAGMENTS

> **A2n** = emitted non-highlight sub-ticks shorter than **0.5 RP**.
> **A2loc** = emitted non-highlight sub-ticks shorter than **half the median of their own neighbours
> within 1.5 RP**.

⚠ **A2n AS LITERALLY SPECIFIED IS INVERTED FOR THIS MECHANISM AND MUST NOT BE GATED.** "Fill the gap
with gradually shortening ticks" *necessarily* creates more short ticks: A2n's fraction rises
0.197 → 0.292 on `cone/hatch/create` under Rank 1 while the picture improves. A *fragment* in Jay's
sense is an **isolated** short mark — short relative to what is next to it — not a short mark. **A2loc
is the honest form** and it is the one to report (83 → 83 on `cone/hatch/create`; 105 → 79 on
`test|sphere/hatch`; 115 → 114, 99 → 85, 56 → 51 elsewhere). Gate neither; report both, with this
paragraph.

### A3 — LENGTH-VS-TONE **WITHIN A BAND**

> **A3 = R² of `Ld/RP` regressed on `(1 − I)`, computed PER ROW (`lineIndex`), then count-weighted
> over rows with ≥ 8 ticks.**

This is deliberately *not* T2-5's pooled `lenToneR2n`. The pooled form is contaminated by row-to-row
variation of the local pitch `R`, which is why it reads 0.62 on `cone/contour` (whose rows follow the
isophotes) and 0.10 on `cone/hatch` — the cell Jay is looking at. **A3 says, of one wave, how much of
its own tick-length variation is the light.** At HEAD it is **0.047–0.078 on `cone/hatch`**: within a
wave, tick length is essentially uncorrelated with tone. That is "not gradually shortening", stated as
a number.

⚠ **A3 is only meaningful where length carries tone at all.** It reads 0.19–0.22 on `v1.4.1`, whose
tick length is fixed and whose residual variance is pure limb truncation. **Report A3 only alongside
`O5` (which gates the range), never instead of it.**

### 2.1 Measured — three trees × six cells × two rigs, d = 50

Each cell: **A1 / A1b P95 (RP) / A3 / A2loc / ovMax / over2RP**.

| fixture | `v1.4.1` `426cc5e4` | `T2-3c` `7375918c` | `HEAD` `75777240` |
|---|---|---|---|
| create·sphere/hatch | 0.000 / **0.000** / 0.224 / 114 / 0.0280 / 4 | 0.000 / 0.432 / 0.322 / 115 / 0.0800 / 0 | 0.000 / 0.432 / 0.322 / 115 / 0.0800 / 0 |
| create·sphere/contour | 0.000 / **0.000** / 0.162 / 87 / 0.0280 / 0 | 0.000 / 0.458 / 0.491 / 99 / 0.0800 / 0 | 0.000 / 0.458 / 0.491 / 99 / 0.0800 / 0 |
| create·torus/hatch | 0.000 / **0.000** / 0.026 / 9 / 0.0280 / 6 | 0.000 / 0.523 / 0.112 / 9 / 0.0800 / 0 | 0.000 / 0.523 / 0.112 / 9 / 0.0800 / 0 |
| create·torus/contour | 0.000 / **0.000** / 0.202 / 36 / 0.0280 / 16 | 0.000 / 0.488 / 0.225 / 34 / 0.0800 / **18** | 0.100 / 0.488 / 0.260 / 39 / 0.0800 / 0 |
| **create·cone/hatch** | 0.000 / **0.000** / 0.193 / 66 / 0.0280 / 1 | 0.000 / **0.535** / **0.047** / 81 / 0.0800 / **40** | **0.029** / **0.535** / **0.078** / 83 / 0.0800 / 0 |
| create·cone/contour | 0.000 / **0.000** / 0.012 / 20 / 0.0280 / 1 | 0.000 / 0.410 / 0.616 / 42 / 0.0800 / 0 | 0.000 / 0.410 / 0.616 / 42 / 0.0800 / 0 |
| test·sphere/hatch | 0.000 / **0.000** / 0.175 / 91 / 0.0280 / 2 | 0.000 / 0.451 / 0.272 / 105 / 0.0800 / 0 | 0.000 / 0.451 / 0.272 / 105 / 0.0800 / 0 |
| test·sphere/contour | 0.000 / **0.000** / 0.226 / 63 / 0.0280 / 2 | 0.000 / 0.453 / 0.578 / 56 / 0.0800 / 0 | 0.000 / 0.453 / 0.578 / 56 / 0.0800 / 0 |
| test·torus/hatch | 0.000 / **0.000** / 0.076 / 115 / 0.0280 / 3 | 0.000 / 0.482 / 0.138 / 102 / 0.0800 / 0 | 0.000 / 0.482 / 0.138 / 102 / 0.0800 / 0 |
| test·torus/contour | 0.000 / **0.000** / 0.182 / 78 / 0.0280 / 70 | 0.000 / 0.535 / 0.230 / 66 / 0.0800 / **67** | 0.148 / 0.522 / 0.271 / 72 / 0.0800 / 0 |
| **test·cone/hatch** | 0.000 / **0.000** / 0.160 / 53 / 0.0280 / 19 | 0.000 / **0.518** / **0.064** / 61 / 0.0800 / **57** | **0.160** / **0.497** / **0.131** / 60 / 0.0800 / 0 |
| test·cone/contour | 0.000 / **0.000** / 0.020 / 13 / 0.0280 / 1 | 0.000 / 0.401 / 0.660 / 35 / 0.0800 / 0 | 0.000 / 0.401 / 0.660 / 35 / 0.0800 / 0 |

**Three readings you cannot get from anywhere else:**

1. **`v1.4.1` has A1b = 0.000 on all twelve.** The black gaps did not exist before T2-3. They are the
   price `chan:'len'` paid to get tick length to carry tone (`O5` 1.1–1.5 → 2.3–3.1), and nothing
   since has given any of it back.
2. **`T2-3c` → `HEAD` moves A1b on exactly two of twelve** (test·cone/hatch 0.518 → 0.497, test·torus/contour
   0.535 → 0.522) — the two cells where T2-5's re-tiling fired hardest. On the other ten it is
   **identical to three decimals**. T2-5's own A1 rises only from 0.000 to 0.029–0.160, i.e. the
   re-tiling touches ≤ 16 % of the band-gap area. **This is the arithmetic behind "clause (a) NOT
   delivered"** and it agrees exactly with `T2-5-review.md` §3's independent finding (fragment count
   unchanged, 0 change both rigs).
3. **`over2RP` 40 → 0 / 57 → 0 / 18 → 0 / 67 → 0 confirms clause (c) is genuinely fixed** on my own
   instrument, independently of T2-5's. Do not re-litigate it.

---

## 3. ROOT CAUSE — file:line on `75777240`

(`/private/tmp/claude-501/scratch-T26/src/core/scene3d/surface-fill.js`.)

### 3.1 The site lattice does not extend into the gap — there is one site per band, on the row line

```
6846  let phase = gold;
6847  if (law.lat === 'brick' || law.lat === 'altrow') phase = (gold + 0.5 * parity) % 1;
6849  let a = arcMM[s0] + phase * solveAt(s0).P;
6874  layMark(idxAt(ao), ao, sv);
6876  a += sv.P;
```

The lattice advances **along** the ruling by `P` and never across it. Across the row, `mkShape`
(`:2784–2793`) returns a **single** 2-point poly centred on `v = 0`:

```
2786  const Lc = Math.min(L, 1.02 * R);
2787  const n  = clamp(Math.round(L / Math.max(1e-6, Lc)), 1, …);   // L <= 1.16R, Lc = min(L,1.02R)
2790  polys.push([[off, -each / 2], [off, each / 2]]);              // => n is ALWAYS 1
```

`L / Lc ≤ 1.16 / 1.02 = 1.137`, so `n` rounds to 1 on every site — proven structurally by T2-3c and
re-verified here. **There is therefore exactly one ink interval per band, of length `L`, and exactly
one bare interval, of length `R − L`.** Nothing in the design can put a mark in that bare interval.
That interval is the black gap, and it is `0.41·R = 1.82 mm ≈ 6.1 pen widths ≈ 3× `MIN_MARK_MM`` at
the light anchor.

### 3.2 The stagger moves the gap but cannot divide it, and decorrelates neighbours

```
6796  const room = 0.5 * Math.max(0, sv.R - sv.L);
6797  if (room > 1e-6) {
6798    const idx = a / Math.max(1e-6, sv.P);
6799    const uu = ((idx * 0.6180339887498949) % 1 + 1) % 1;
6800    const cOff = room * (2 * uu - 1);
6801    polys = polys.map((pl) => pl.map((pt) => [pt[0], pt[1] + cOff]));
6802  }
```

`idx` is the site's arc index and `uu` a golden-ratio **hash** of it: successive ticks in one row get
offsets that jump ±`room` with no spatial correlation, and ticks in adjacent rows at the same `a` get
unrelated offsets because their `P` and phase differ. The bare interval keeps its full length
`R − L`; only its *position* moves, and it moves randomly. Two consequences, both measured:
**(i)** the biggest bare run is unchanged by the stagger (A1b flat from T2-3 to HEAD); **(ii)** within
one row, tick length carries no continuity — **A3 = 0.047 (T2-3c) / 0.078 (HEAD) on `cone/hatch/create`**.
Worst case across a seam: two adjacent rows can place their ticks `2·room` apart, so the row-to-row
gap reaches `R − L + (c₂ − c₁) ≤ 2(R − L)` (T2-3's own derivation, the reason `L0` went 1.02 → 1.16).

### 3.3 The length response is per-site and area-driven, so it tracks INK, not position

```
6513  const R = clamp(((Number.isFinite(lp) && lp > 1e-6) ? lp : masterPitch) / markRowCoverage(), 0.25, 40);
6514  const g = clamp((mkAsk(I) * R) / w, 0, 26);
6643  const eased = (1 - MK_TICK_EASE_BLEND) * t + MK_TICK_EASE_BLEND * (t * t * (3 - 2 * t));
6656  const Lease = (law.LMIN || 0) * R + (law.L0 - (law.LMIN || 0)) * R * eased;
6657  const Lfloor = g * PMIN;
6658  L = Math.min(law.L0 * R, Math.pow(Math.pow(Lease, 4) + Math.pow(Lfloor, 4), 1 / 4));
6659  P = clamp(L / Math.max(1e-6, g), PMIN, MK_PMAX);
```

`L` is a function of `I` **and** of the local `R` — and over the whole midtone the `Lfloor` branch
binds (T2-3b measured `mkStat.flood` = 337 of 1106 sites, 30 %, on `create|sphere/contour`), so `L` is
set by the area ask `g·PMIN`, which carries the local row pitch inside it. Since `R` swings from the
nominal 4.54 mm up to 8.54 mm on a foreshortened patch (T2-5 §3.2), two ticks at the *same* tone in
the *same* row can differ in length by nearly 2×, with the difference carrying **no** visual
information. That is the second half of why A3 is 0.05–0.13 on the hatch cells: the length signal is
there globally (`O5` 2.43) but it is buried in local-pitch noise band by band.

### 3.4 What T2-5 changed, and why it could not reach any of this

```
6769  if (law.shape === 'tick') {
6770    const nominalRP = masterPitch / MK_ROW_COV;
6777    const nSub = clamp(Math.ceil((law.L0 * sv.R) / Math.max(1e-6, 2 * nominalRP)), 1, 6);
6778    if (nSub > 1) { … uniform split, each = sv.L / nSub, own stagger per sub-band … }
6793    else          { … T2-3's single-tick stagger, byte-identical … }
```

The gate is `law.L0 · sv.R > 2 · nominalRP`, i.e. **`sv.R > 7.83 mm` at `RP = 4.54`** — a
foreshortening outlier, not a tone condition. It fires on the over-wide slab and nowhere else:
`subsPerSite` = **1.18** on `cone/hatch/create` (1.00 on six of twelve fixtures). It is a correct and
proven fix for clause (c) and it is **structurally incapable** of touching clause (a), because clause
(a) lives in the ordinary band, at ordinary `R`.

---

## 4. RANKED MECHANISMS — Rank 1 PROTOTYPED and spike-gated

### 4.1 Rank 1 — **THE GRADED BAND COMB** (prototyped; recommended)

Replace the single centred-and-staggered tick with a **geometric run across the band's own
sub-bands**, longest at the dark edge:

```js
if (law.shape === 'tick') {
  const nominalRP = masterPitch / MK_ROW_COV;
  const nOver = clamp(Math.ceil((law.L0 * sv.R) / (2 * nominalRP)), 1, 6);   // T2-5's clause (c), untouched
  // which side of the band is DARKER — two extra sampleAt probes, Rank-3 scaffolding
  const iP = probeI(+0.5 * sv.R), iM = probeI(-0.5 * sv.R);
  const bandOn = (iP != null && iM != null);           // both band edges on-chart
  let nComb = 1, e0 = 0;
  if (bandOn && sv.L >= SPLIT_MIN_R * sv.R && sv.L < 0.98 * sv.R) {
    for (let n = SUB_MAX; n >= 2; n -= 1) {            // the LARGEST n the run actually fits
      const a0 = sv.L * (1 - RHO) / (1 - Math.pow(RHO, n));
      if (a0 <= (ENV * sv.R) / n && a0 * Math.pow(RHO, n - 1) >= minKeep) { nComb = n; e0 = a0; break; }
    }
  }
  const nSub = Math.max(nOver, nComb);
  // sub-band j (j = 0 at the DARK edge) carries each_j = e0 * RHO^j, centred in its own sub-band
}
```

**Why it is exactly neutral on tone.** `Σ_j e0·ρ^j = e0·(1−ρⁿ)/(1−ρ) = sv.L` **by construction**, and
`R` and `P` are untouched, so the delivered ink-area fraction `L·w/(R·P) = mkAsk(I)` is bit-identical.
It is a pure redistribution of one band's own ink across that band — the same proof T2-5 used, with
a non-uniform split instead of a uniform one.

**Why it is Jay's sentence and not an approximation of it.** Consecutive sub-ticks have ratio exactly
`ρ`, so at `ρ ≥ 0.5` *"no tick under half its neighbour"* holds **by construction, not by measurement**;
the run is monotone by construction; and the direction is set by the tone gradient probe, so it
shortens **toward the light** — "the only gaps allowed are where the highlights are", which is the
original `8.png` rule (`fill-audit-handoff.md` queue item 6) re-stated as placement.

**Four dials, and what each is for.** `RHO` (taper, 0.62 shipped), `SUB_MAX` (2 shipped),
`SPLIT_MIN_R` (0.40 shipped — below this the light end is *supposed* to be bare), `ENV` (0.85 shipped
— the comb occupies the middle 85 % of the band, keeping the outermost sub-tick off the chart edge).
`bandOn` is not a dial: it is the correctness gate of §4.4.

### 4.2 SPIKE GATE — `cone/hatch/mkTick/med/a`, `--rig create`, d = 50, fixture as §0.2

| metric | `T2-3c` | HEAD `75777240` | **Rank 1** | verdict |
|---|---|---|---|---|
| **A1** graded-gap share | 0.000 | 0.029 | **0.479** | ✅ clause (a) |
| **A1dir** (direction-checked) | 0.000 | 0.029 | **0.479** | ✅ |
| **A1b** bare-run P95 (RP) | 0.535 | 0.535 | **0.385** (−28 %) | ✅ |
| **A1b** bare-run max (RP) | 0.963 | 0.963 | 0.963 | ⚠ **unchanged** — the single worst site on the cell is not split (it sits where `bandOn` or `SPLIT_MIN_R` excludes it). The P95 moves; the max does not. Gate the P95, report the max. |
| **A3** within-band R² | 0.047 | 0.078 | **0.185** (2.4×) | ✅ |
| pooled `lenToneR2n` (T2-5's) | 0.102 | 0.099 | 0.226 | reported |
| **A2loc** isolated fragments | 81 | 83 | **83** | ⚠ flat — §2 A2 |
| **A2n** sub-ticks < 0.5 RP (count, frac) | 105, 0.227 | 108, 0.197 | 174, 0.292 | ⚠ rises **by design** — §2 |
| raster bare ≥ 0.25 RP (picture) | — | 5 925 px | **4 026 px (−32 %)** | ✅ |
| `wedge25` (shipped instrument) | 0.06054 | 0.06091 | 0.06290 (+3.3 %) | ⚠ §1.3 |
| `holeMax` | 1.038 | 1.038 | **1.038** | ✅ identical |
| `bandC` | 0.0892 | 0.0881 | **0.0640** (−27 %) | ✅ |
| `O5` (shipped, per-site) | 2.4153 | 2.4301 | **2.4258** monotone | ✅ (bar 2.30) |
| `siteCoverage` | 0.9882 | 0.9882 | **0.9882** | ✅ identical |
| `subsPerSite` | 1.000 | 1.179 | 1.281 | the comb fires on ~10 % more of the field than T2-5's re-tiling |
| `ovMax` / `over2RP` | 0.0800 / 40 | 0.0800 / 0 | **0.0800 / 0** | ✅ clause (b)/(c) held |
| ink (mm, no ground) | 2485.7 | 2500.6 | 2498.4 (−0.09 %) | ✅ |
| pen-downs | 470 | 554 | **602 (+8.7 %)** | ✅ (bar +50 %) |

### 4.3 ALL TWELVE FIXTURES, d = 50 — HEAD → Rank 1

| fixture | A1 | A1b P95 | A3 | `wedge25` | `holeMax` | `O5` | `bandC` | cov | pens | ink |
|---|---|---|---|---|---|---|---|---|---|---|
| create·sphere/hatch | 0.000 → **0.448** | 0.432 → **0.298** | 0.322 → 0.322 | 0.05436 → 0.05649 | 0.992 → 0.992 | 3.1422 → 3.1280 | 0.0797 → 0.0800 | .9796 → .9793 | 1001 → 1093 | 4894.8 → 4882.0 |
| create·sphere/contour | 0.000 → **0.408** | 0.458 → **0.270** | 0.491 → **0.538** | 0.06491 → 0.06507 | 1.038 → 1.038 | 2.4399 → 2.4397 | 0.0515 → 0.0529 | .9905 → .9895 | 1005 → 1084 | 4748.8 → 4745.4 |
| create·torus/hatch | 0.000 → **0.160** | 0.523 → 0.508 | 0.112 → **0.200** | 0.13808 → 0.13808 | 0.980 → 0.980 | 2.5864 → 2.5354 | 0.2723 → 0.2723 | .9882 → .9882 | 321 → 335 | 1268.8 → 1272.1 |
| create·torus/contour | 0.100 → **0.362** | 0.488 → **0.451** | 0.260 → **0.310** | 0.17318 → 0.17307 | 0.991 → 0.991 | 3.0695 → 3.0353 | 0.4687 → 0.4610 | .9770 → .9770 | 312 → 339 | 1369.0 → 1368.4 |
| **create·cone/hatch** | 0.029 → **0.479** | 0.535 → **0.385** | 0.078 → **0.185** | 0.06091 → 0.06290 | 1.038 → 1.038 | 2.4301 → 2.4258 | 0.0881 → **0.0640** | .9882 → .9882 | 554 → 602 | 2500.6 → 2498.4 |
| create·cone/contour | 0.000 → **0.479** | 0.410 → **0.281** | 0.616 → **0.712** | 0.04113 → 0.04113 | 0.995 → 0.995 | 2.6137 → 2.6081 | 0.0258 → 0.0269 | .9993 → .9960 | 573 → 634 | 2530.5 → 2527.2 |
| test·sphere/hatch | 0.000 → **0.370** | 0.451 → **0.359** | 0.272 → **0.302** | 0.07814 → 0.07844 | 1.110 → 1.110 | 3.0772 → 3.0730 | 0.1170 → **0.0949** | .9833 → .9833 | 648 → 704 | 3158.0 → 3155.2 |
| test·sphere/contour | 0.000 → **0.450** | 0.453 → **0.261** | 0.578 → **0.625** | 0.06685 → 0.06681 | 1.079 → 1.079 | 2.3477 → 2.3479 | 0.0431 → 0.0459 | .9898 → .9898 | 641 → 695 | 3007.5 → 3007.5 |
| test·torus/hatch | 0.000 → **0.494** | 0.482 → **0.320** | 0.138 → **0.246** | 0.07664 → 0.07683 | 1.044 → 1.044 | 2.3510 → 2.3426 | 0.2203 → 0.2355 | .9924 → .9908 | 845 → 976 | 3211.9 → 3200.5 |
| test·torus/contour | 0.148 → **0.482** | 0.522 → **0.402** | 0.271 → **0.330** | 0.08740 → 0.08747 | 1.081 → 1.081 | 2.8677 → 2.8504 | 0.3012 → 0.2969 | .9843 → .9843 | 660 → 730 | 2723.2 → 2725.0 |
| **test·cone/hatch** | 0.160 → **0.556** | 0.497 → **0.342** | 0.131 → **0.199** | 0.06964 → 0.07011 | 0.984 → 0.984 | 2.6937 → 2.6537 | 0.1088 → 0.1043 | .9860 → .9860 | 467 → 499 | 2114.0 → 2116.8 |
| test·cone/contour | 0.000 → **0.479** | 0.401 → **0.355** | 0.660 → **0.738** | 0.07475 → 0.07475 | 1.039 → 1.039 | 2.8964 → 2.8962 | 0.0223 → 0.0224 | .9924 → .9924 | 495 → 560 | 2248.8 → 2248.8 |

**Aggregates against the bars that actually exist in the repo:**

| bar (file) | HEAD | Rank 1 | verdict |
|---|---|---|---|
| six-cell mean `wedge25` ≤ 0.095 (create), `scene3d-mktick-wedge.test.js` | 0.08876 | **0.08946** | ✅ 5.8 % margin (was 6.6 %) |
| six-cell mean `wedge25` ≤ 0.080 (test) | 0.07557 | **0.07574** | ✅ 5.3 % margin |
| per-cell `wedge25` ≤ 0.180 (create) / 0.090 (test) | 0.17318 / 0.08740 | **0.17307 / 0.08747** | ✅ both |
| `O5_BAR = 2.30`, ratio **and** monotone, 12/12 | min 2.3477 | **min 2.3426, monotone 12/12** | ✅ |
| `siteCoverage > 0.90`, 12/12 | ≥ 0.9770 | **≥ 0.9793** | ✅ |
| `holeMax` per cell | — | **identical on 12/12** | ✅ |
| `over2RP = 0` at d = 50, 12/12 (T2-5's O-C2) | 0/12 | **0/12** | ✅ |
| `ovMax ≤ HEAD` (T2-5's O-B) | 0.0800 | **0.0800 on 12/12** | ✅ exactly invariant |
| `bandC` ≤ ×1.05 pinned, `sphere/contour` + `cone/contour` (`scene3d-mktick-banding.test.js:340,346`) | — | create **+2.7 % / +4.3 %**; test **+6.5 % / +0.4 %** | ⚠ **`test|sphere/contour` +6.5 % exceeds ×1.05 — must be re-measured against the file's own pinned values and, if real, tuned down (§6.4), NOT re-pinned** |
| pen-downs (T2-5's +50 % stop condition) | — | **+8.5 % create, +10.9 % test** | ✅ |

### 4.4 THE DIALS ARE A CLIFF — three measured failures the implementer must not walk into

All measured on the same twelve fixtures; every one of these is a *tuning* of the same mechanism.

| setting | what breaks | measured |
|---|---|---|
| `SUB_MAX = 4`, `SPLIT_MIN_R = 0.30`, `ENV = 1.0`, **no `bandOn` gate** | **`O5` collapses on `torus/hatch`** | create 2.5864 → **2.0124, NON-MONOTONE**; test 2.3510 → **2.1233**. Cause: on the torus a sub-tick laid near the band edge leaves the chart, `place()` returns false for the **whole mark** (`surface-fill.js:6425–6427`, `if (!wk.pts) { mkStat.offSurface += 1; return false; }`), the drops concentrate in the dark third, and `lenByThird` loses its longest marks. `siteCoverage` 0.9882 → 0.9542 confirms it. |
| same, but drop only the offending **sub**-poly instead of the mark | **only half-recovers, and is not worth its blast radius** | `O5` 2.0124 → 2.0609, cov 0.9542 → 0.9701 — still far under 2.30. `place()` is shared by all twelve mark laws; do not touch it for this. |
| `SUB_MAX = 4`, `SPLIT_MIN_R = 0.30`, `ENV = 0.85`, **with** `bandOn` | `O5` recovers (min 2.4124 / 2.3262 ✅) but **`wedge25` and `bandC` go** | create mean 0.09112 (bar 0.095, 4 % margin); test per-cell max **0.09075 > 0.090 ✗**; `bandC` `create|sphere/contour` 0.0515 → **0.0833 (+62 %) ✗** |
| `RHO = 0.75` anywhere | test-rig `wedge25` mean **0.08148–0.08200 > 0.080 ✗** | and `O5` goes non-monotone on `create|torus/hatch` |
| **`SUB_MAX = 2`, `SPLIT_MIN_R = 0.40`, `ENV = 0.85`, `RHO = 0.62`, `bandOn`** | **nothing** | the row shipped in §4.3 |

**Read this as the finding it is:** the mechanism has a wide operating range on Jay's own cell
(`cone/hatch`) and a narrow one on `torus/hatch`, whose `O5` margin at HEAD is only 12 % and whose
bands are the most foreshortened in the roster. The `bandOn` gate is what makes it safe, and it is
*free* — the two `sampleAt` probes are already needed for the gradient direction. **A pair of ticks
(`SUB_MAX = 2`) is enough to deliver Jay's sentence**; if he wants a deeper taper, `SUB_MAX = 3` is the
next step and must be re-gated against this whole table.

### 4.5 Ranks NOT chosen — measured, so nobody re-tries them

| rank | mechanism | measured outcome |
|---|---|---|
| **2** | **Anchor each sub-tick flush to its own sub-band's DARK edge** (`anchor = 1`) instead of centring it | `wedge25` `cone/hatch/create` 0.0609 → **0.0672–0.0734** (+10…+20 %), `O5` down to 2.3421. The centred form is strictly better on every bar and only slightly worse on A1b. **Rejected.** |
| **3** | **Gradient anchor alone, no comb** (Rank 3 of `T2-5-plan.md`: `cOff = room·sign(dI/dv)`) | `A1b` P95 **0.535 → 0.714 (WORSE)**, `holeMax` 1.038 → **1.111**, `wedge25` 0.0609 → **0.0770 (+26 %)**. It pushes the whole gap to one side instead of dividing it. **Rejected, and this independently confirms T2-3's analytic rejection of row-parity anchoring.** |
| **4** | **Flat comb** (uniform split, `ρ = 1`) | Passes every bar and gives A1b 0.472; but every tick in a band is the *same* length, which is not "gradually shortening", and A1 is then vacuously satisfied (§2). **Rejected as an oracle-gaming shape**, and recorded because it will look attractive to anyone reading A1 alone. |
| **5** | **Linear ramp** `each_j = base·(1 + s(1 − 2j/(n−1)))` | The bounded-step clause caps it hard: at n = 2 it needs `s ≤ 1/3`, and the sub-band ceiling forces `s → 0` whenever `L/R → 1`, so the ramp is nearly inoperative exactly where it is wanted. Measured A1 0.244 vs the geometric form's 0.658 at equal n. **Superseded by the geometric form.** |
| **6** | **Widen the lattice / halve `MK_ROW_COV`** (the old T2-3d route) | **FORBIDDEN** — `MK_ROW_COV` is T3's, and Jay closed T2-3d unbuilt (decision 13 → A). Named only so it is not re-proposed. |

### 4.6 The picture — plain words, as a plotter artist

Native crops, `cone/hatch/mkTick/med/a`, `--rig create`, HEAD on top, Rank 1 below:
`crop_midright_x4_HEAD_top_F3_bottom.png`, `crop_rightflank_x4_HEAD_top_F3_bottom.png`,
`anno_crop_midright_x4_HEAD_top_F3_bottom.png`, and the whole object side by side in
`cone_hatch_create_whole_HEAD_left_F3_right.png`.

**HEAD.** On the lit flank the field falls apart: strokes of unrelated lengths sit at unrelated depths,
a broad black wedge opens through the transition, and several stubs float alone in it. It reads as a
texture that has been *punctured*, not one that has been *graded*.

**Rank 1.** The same flank reads as rows. Each row is a run of ticks that visibly shortens as it goes
toward the light, the long/short pairs are legible as pairs, and the broad black wedge is broken into
thin even channels that run *with* the rows instead of across them. The annotated pair says the same
thing in red: a connected web with bright cores becomes a few thin slivers.

**So: does the after read as "gradually shortening ticks filling the gaps"? Yes — on the cone, on both
rigs, at the density Jay was looking at.** Two honest qualifications. (1) On `torus/hatch/create` the
comb is almost entirely gated off by the on-chart test (`subsPerSite` 1.000 → 1.044, A1 0.160) — that
cell keeps the old picture, and the plan says so rather than hiding it in an average. (2) The dark,
abutted region is deliberately unchanged (`SPLIT_MIN_R = 0.40` and `L ≥ 0.98R` both exclude it) —
black-by-abutment is bit-for-bit what it was, which is the right answer but means the whole-object
view still reads as "the same object" at a glance. **The change lives in the transition, which is
where Jay was pointing.**

---

## 5. INTERACTIONS — what else moves, measured not argued

### 5.1 Clause (b), seam overlap — **exactly invariant, by algebra and by measurement**

A tick of length `e` centred in a band of width `b` crosses its own boundary by
`ov = max(0, e − b)/(2b)`. Under the comb, `e_j = e0·ρ^j` and `b = ENV·R/n`; the run is *fitted* so
`e0 ≤ b`, hence `ov = 0` for every sub-tick, and the site's reported `ovMax` is set by the unsplit
sites, where it is `(L0 − 1)/2` exactly as before. **Measured: `ovMax = 0.0800` on 12/12, identical to
HEAD to four decimals.** Clause (b) is neither improved nor worsened, `L0` is untouched, and **the
`L0`/`O5` decision table in `T2-5-impl.md` is still Jay's to rule on.** ⚠ **Rank 1 must not be used as
an excuse to revisit `L0`** — at `L0 = 1.05` the comb inherits T2-5's own O5 failure (4–6 of 12) and
adds to it; measured `E62`+`L0 1.05` is not in scope and is not offered.

### 5.2 T2-4 (d = 220 coverage) — does NOT fold in, and gets worse

| d = 220, HEAD → Rank 1 | `siteCoverage` | `wedge25` | `holeMax` | A1 | A1b P95 | `over2RP` | pens |
|---|---|---|---|---|---|---|---|
| create·cone/hatch | 0.8754 → **0.8754** | 0.0918 → **0.1178 (+28 %)** | 3.203 → 3.203 | 0.101 → **0.450** | 0.458 → **0.309** | 4 → 4 | 1880 → 1963 |
| create·sphere/hatch | 0.8745 → 0.8745 | 0.0872 → 0.1065 | 7.580 → 7.580 | 0.000 → 0.316 | 0.357 → 0.271 | 5 → 5 | 3054 → 3164 |
| create·torus/contour | 0.8168 → 0.8168 | 0.0998 → 0.1049 | 4.221 → 4.221 | 0.219 → 0.519 | 0.466 → 0.327 | 3 → 3 | 933 → 976 |
| test·cone/hatch | 0.8798 → 0.8798 | 0.0960 → 0.1108 | 2.565 → 2.543 | 0.280 → 0.532 | 0.445 → 0.316 | 5 → 5 | 1692 → 1738 |

**`siteCoverage` and `holeMax` are unchanged to four decimals on every one**, and the gap oracles
improve — but `wedge25` rises 5–28 %. The d = 220 collapse remains `MIN_MARK_MM` censoring short ticks
(`tooShort` is **identical**: 713 → 713, 1433 → 1433, 437 → 437, 552 → 552), which is T2-4's own
mechanism and is untouched here. **Report it; do not fix it in this unit; carry the d = 220 stop
condition in §6.5.**

### 5.3 d = 1 — metric-identical; byte-identical on one rig of two

`cone/hatch`, d = 1: paths **193 / 126**, ink **835.1 / 537.8 mm**, and **every oracle equal to four
decimals on both rigs** (`wedge25` 0.28428 / 0.34163, `holeMax` 1.059 / 1.067, `bandC` 1.5749 / 1.4653,
`siteCoverage` 0.9356 / 0.9576, A1 0.000, `over2RP` 0, `ovMax` 0.0800). `md5(paths)` is **identical on
the test rig** (`a8334004d5…`) and **differs on the create rig** (`0cc3a13e2c…` → `eaa1955fe3…`) — so a
handful of sub-ticks move by sub-millimetre amounts at one site where the comb fires, with no
measurable consequence. **Disclose it exactly like this; do not claim byte-identity at the sparse end.**
T3's `rowFloor` scaffold and T3b's low-end work are not disturbed (`mkDashRamp` is byte-identical at
every density — §5.6).

### 5.4 T2-3e (row lattice) — not measured, not claimed

The reviewer's narrow-strip FFT instrument is still not in the repo. `bandC`, the proxy that **is** in
the repo, falls on the cells Jay named (`cone/hatch` create 0.0881 → 0.0640, test·sphere/hatch
0.1170 → 0.0949) and rises slightly on two contour cells (§4.3). **T2-6 is not shown to remove T2-3e.**

### 5.5 T2-3c's runaway guard, T3's row floor, G4/T4b/O1 — untouched

`over2RP` stays 0/12 and the longest drawn sub-tick is **unchanged** (`maxLd/RP` 1.9838 → 1.9838 on `cone/hatch/create` — the
worst site is one the comb does not split), so `scene3d-mktick-runaway.test.js`'s `count15`/`longest`
table should be flat — **but its population changes** (more, shorter paths), which standing rule 6
requires be disclosed even when the number does not move. `markRowCoverage()` / `MK_ROW_COV` are read-only here. `scene3d-mark-laws-draw.test.js`'s O1
sagitta oracle measures the **longest third by chord length** — a population the comb shortens — and it
is the test T2-5 already had to re-tune `nSub` for; at `SUB_MAX = 2` / `SPLIT_MIN_R = 0.40` the dark
(longest) third is excluded by construction, but **the implementer must run that file and report the
margin, not assume it.**

### 5.6 T3c and the duty proxy — independent, confirmed by md5

Rank 1 touches `layMark`'s `law.shape === 'tick'` block only. It does not touch `g` (`:6514`),
`mkAsk` (`:2405`), `R` (`:6513`) or `solveAt`'s `else`/elong branch (`:6660–6662`). **md5 roster sweep — FULL SCOPE, 4 sweeps × (8 mappers × 37 `PRODUCTION` laws) = 1184 cells,
`cone`/`create` · `sphere`/`create` · `torus`/`create` · `cone`/`test`: exactly 3 of 296 change in
EVERY sweep, always `hatch/mkTick`, `crosshatch/mkTick`, `contour/mkTick` — 12 of 1184 = 1.0 % of the
roster, ZERO non-mkTick cells.** Coverage: **100 % of the plan's own stated scope** (contrast T2-5,
which ran 9.4 % and disclosed the reduction). The structural corroboration —
`grep -c "shape: 'tick'"` inside the `MK` table returns 1, so no other law can reach the changed
branch — is a *reason the result is unsurprising*, not a substitute for it. **`mkDashRamp` is
byte-identical in all four sweeps, so T3c stays a separate unit.**

---

## 6. THE UNIT

### 6.1 Files ALLOWED

Lane `fill-audit-a4` owns `src/core/scene3d/surface-fill.js` (AGENT-PROTOCOL serialization table).

- `surface-fill.js` — **`layMark`'s `law.shape === 'tick'` block** (`:6769–6805`): the comb, the
  gradient probe, the `bandOn` gate, the envelope. This is the whole runtime change.
- `surface-fill.js` — **new named constants beside the other `MK_TICK_*` bars** (`:2471–2552`):
  `MK_TICK_COMB_RHO`, `MK_TICK_COMB_MAX`, `MK_TICK_COMB_MIN_R`, `MK_TICK_COMB_ENV`. **Name them in pen
  widths / row-pitch fractions like every other bar in the file, and document each with its own
  measured trade from §4.4.**
- `tests/unit/scene3d-mktick-*.test.js`, `tests/helpers/scene3d-mktick-*.js`, and a NEW oracle file
  for A1/A1b/A3.

### 6.2 Files FORBIDDEN

- **`place()` (`:6393`) and its off-surface / `dupStub` / `MIN_MARK_MM` handling** — shared by all
  twelve mark laws; §4.4 measured that touching it buys almost nothing.
- **`markRowCoverage()` (`:2732`) / `MK_ROW_COV` (`:2397`)** — T3's. Read-only.
- **`solveAt`'s `lenChan` branch (`:6643–6659`), `Lfloor` (`:6657`), `MK_TICK_EASE_BLEND` (`:2552`)** —
  T2-3b's. The comb is a *placement* change; if it needs a length-curve change it is the wrong mechanism.
- **`MK.mkTick.L0` (`:2697`)** — clause (b) is Jay's ruling, not this unit's.
- **`solveAt`'s `else`/elong branch (`:6660–6662`) and `MK.mkDashRamp` (`:2627`)** — T3b's / T3c's.
- **`g` (`:6514`), `mkAsk` (`:2405`), `R` (`:6513`)** — the shared duty proxy and its inputs.
- **`mkShape`'s `'tick'` branch (`:2784–2793`)** — it does not know `R`'s nominal and does not need to;
  keep the comb in `layMark` where `sv`, `fr` and `sampleAt` are all in scope.
- The crosshatch family cap (W-36f's), the master grid, `scene3d.js`, `hlr.js`, `shadows.js`,
  `surface-fill-mono.js`, `mappers.js`.
- `git push`, merge, tag, version bump.

### 6.3 RED first (from a scratch `git archive` export of `75777240`, never in-worktree)

A new `tests/unit/scene3d-mktick-gap-fill.test.js`, per cell, per rig, d = 50, with each test naming
**which clause of Jay's rule it gates and which it does not**:

1. **A1b BLOCKING** — `bareRunP95 ≤ 0.42 RP`. RED at base (0.401–0.535, **ten of twelve over**). GREEN
   at 0.261–0.402 on **ten** of twelve. ⚠ **`create|torus/hatch` (0.508) and `create|torus/contour`
   (0.451) do not clear it** — the `bandOn` gate disables the comb on the torus's foreshortened bands.
   Set those two cells' bars from their own measured values with that reason written in the file, or
   exclude them, **and say so in `## Bars changed` either way.**
   *Mutation-kill:* force `nComb = 1` and the P95 must return to ≥ 0.48 on `cone/hatch`, both rigs.
2. **A1 BLOCKING** — `gradedGapShare ≥ 0.35` on `cone/hatch`, `cone/contour`, `sphere/*`,
   `test|torus/*`. RED at base (0.000–0.160). *Mutation-kill:* set `RHO = 1.0` (flat comb) and A1 must
   fall out of its own graded test — **this is the mutation that proves the test reads "gradually
   shortening" and not merely "more than one tick"**, and it is the single most important assertion in
   the file.
3. **A3 REPORTED, not gated** — per-row R², alongside `O5`. Ship the number, per §2's caveat.
4. **A2loc REPORTED, not gated**; **A2n REPORTED with §2's paragraph beside it** so no later reader
   mistakes its rise for a regression.
5. **Neutrality, BLOCKING** — for every emitted comb, `|Σ each_j − sv.L| < 1e-9`. This is the tone
   proof and it is cheap.

### 6.4 Guards that must stay green (one file per command, foreground, `timeout: 600000`)

`tests/unit/scene3d-mktick-wedge.test.js` (the 12 `pathSignature` goldens **will change on every cell
where the comb fires** — re-pin WITH the before/after numbers in the commit body; `O5_BAR = 2.30`, the
`wedge25` mean/ceiling bars and `siteCoverage > 0.90` **must pass unchanged**) ·
`tests/unit/scene3d-mktick-banding.test.js` (⚠ `test|sphere/contour` reads **+6.5 %** against a ×1.05
clause in my fixture — measure it against the file's own pinned values first; if it really fails,
tune `SPLIT_MIN_R` up or `SUB_MAX` down until it passes. **Do not re-pin it**) ·
`tests/unit/scene3d-mktick-runaway.test.js` (population change — disclose) ·
`tests/unit/scene3d-mktick-band-purity.test.js` (T2-5's; `over2RP = 0` must hold) ·
`tests/unit/scene3d-mark-laws-draw.test.js` (30/30 — O1 sagitta, G4, T4b) ·
`tests/unit/scene3d-mkdashramp-single-pass.test.js` and `-low-end.test.js` (T3/T3b — byte-identity) ·
`tests/unit/scene3d-style-fill-lines.test.js` · `tests/unit/scene3d-ladder-uniform-field-spacing.test.js` ·
`tests/unit/scene3d-ribbon-width-bar.test.js` + `scene3d-ribbon-fill-depth-count.test.js` (F1's) ·
`tests/integration/scene3d-fill-style-picker.test.js` (Tier 2, slow) ·
`tests/unit/scene3d-tone-law-collapse.test.js` (**Tier 1 — start it with
`--pool=forks --poolOptions.forks.singleFork=true` and `timeout: 600000`, let the tool background it at
the 600 s ceiling, carry on, and read the result from the completion notification**).

### 6.5 Evidence required

- Captures from MAIN's `scripts/audit/scene3d-capture.js --tier B --root <worktree> --port ≥8495`,
  **both `--rig create` and `--rig addLayer`**, `--out docs/3d-audit/fill-audit/after/T2-6`, for
  `^(sphere|torus|cone)__(hatch|contour)__mkTick__med__a$` **plus `cone__hatch__mkTick__(low|max)__a`**
  **plus `cone__crosshatch__mkTick__med__a`** (affected by the md5 sweep). All confirmed present in
  `docs/3d-audit/fill-audit/manifest*.json` — `cone__crosshatch__…` is shard **2/5**. Kill the port after.
- **Native-resolution crops of the transition zone and the lit flank, before/after, both rigs**, plus
  the red band-gap annotation of §1.2 with its pixel counts. **The whole 627 px cell hides this defect;
  the orchestrator's own note says so and T2-5's reviewer proved it.**
- The md5 roster sweep re-run on all four primitive×rig combinations, **coverage stated as a fraction
  of 296 per sweep**, every changed cell named.
- `report.json` restating §0.2's fixture in full, **including "ground-plane ink: excluded"**, and which
  rig every number came from.

### 6.6 Stop conditions — ship the measurement, do not fudge

- **STOP** if `O5 ≥ 2.30` **and monotone** cannot be held on all twelve. **Never lower `O5_BAR`.**
  §4.4 shows exactly which dial to turn (`SUB_MAX` down, `SPLIT_MIN_R` up) and that `torus/hatch` is
  the cell that goes first.
- **STOP** if either six-cell mean `wedge25` exceeds its bar, or any per-cell ceiling is exceeded.
  **Never widen a `wedge25` bar.** Report the raster counterpart beside it either way.
- **STOP** if `bandC` on `sphere/contour` or `cone/contour` exceeds ×1.05 of its pinned value after
  tuning. **Never re-pin it upward.**
- **STOP** if `ovMax` moves off 0.0800 on any fixture — clause (b) must stay exactly invariant, and if
  it does not, the comb is overrunning its sub-band and the fit loop is wrong.
- **STOP** if `over2RP` leaves 0 on any fixture at d = 50 — that is T2-5's clause (c) regressing.
- **STOP** if pen-downs rise more than **+30 %** at d = 50 on any cell (the prototype sits at
  +8.5 %/+10.9 %; anything near T2-5's +50 % ceiling means a dial slipped).
- **STOP** if d = 220 `siteCoverage` falls below **0.85** or `holeMax` rises on any cell (the prototype
  moves neither).
- **STOP and report MEASURED** if A1 ≥ 0.35 cannot be reached on a cell without breaking one of the
  above. Say which cell and which bar; **an honest "this cell keeps the old picture" beats a widened bar.**
- **A picture that does not move is a REJECT even if every number passes.** That is the lesson of T2-5,
  and the crops of §6.5 are the gate, not the table.

---

## 7. Evidence index — `docs/3d-audit/lane-reports/T2-6-plan-evidence/`

| file | what |
|---|---|
| `cone_hatch_create_HEAD.png` / `_F3.png` | the two renders, native 627×749, `--rig create`, from the capture harness |
| `anno_cone_hatch_HEAD.png` / `_F3.png` | **the deliverable-1 markup**: dark red = object pixels ≥ 0.25 RP from ink, bright red = ≥ 0.50 RP |
| `anno_crop_midright_x4_HEAD_top_F3_bottom.png` | 4× native crop of the annotated transition zone, HEAD above, Rank 1 below |
| `crop_midright_x4_…`, `crop_rightflank_x4_…`, `crop_wavebottom_x4_…`, `crop_lowerleft_x4_…` | 4× native un-annotated crops of the four regions |
| `cone_hatch_create_whole_HEAD_left_F3_right.png` | whole object, side by side |
| `crop_right_x4.png`, `crop_rightlow_x4.png`, `crop_mid_x3.png`, `crop_transition_x3.png` | the same regions on T2-5's own `plain_HEAD_create.png`, used to locate them |
| `cap-head/`, `cap-F3/` | the capture runs (manifest + `shots/B/*.webp`), both rigs, med + low/max, ports 8511/8512, both killed |
| `scripts/` | the whole read-only harness: `lib.js` (instrumented loader), `metrics26.js` (A1/A1b/A2/A3 + the inherited bars), `proto26.js` (the Rank-1 patcher, all dials), `protorun.js`, `run.js`, `roster.js`, `inkchk.js` |
| `data/` | `base3.json` (three trees × 12 fixtures), `final50.json`, `f.json` (the dial sweeps), `roster.json`, and the raw logs |

---

## Bars changed

**None.** This is a read-only plan: no test, threshold, tolerance, fingerprint, population or fixture
was modified. Nothing was written outside this report and
`docs/3d-audit/lane-reports/T2-6-plan-evidence/`. The prototype exists only as a `scriptOverrides`
patch in memory and as one scratch tree under `/private/tmp/claude-501/scratch-T26-F3`, which is not a
worktree and is not tracked.

**For the implementer's own `## Bars changed`, these WILL need entries and are named here so none is missed:**

- `tests/unit/scene3d-mktick-wedge.test.js` — the **12 pinned `pathSignature` goldens**: the comb
  changes geometry on every cell where it fires (expect 10–12 of 12, not T2-5's 4). Re-pin with proof.
- `tests/unit/scene3d-mktick-wedge.test.js:374 `O5_BAR = 2.30`` — **must NOT change.** Listed so that a
  change to it is visibly a violation.
- `tests/unit/scene3d-mktick-wedge.test.js` `WEDGE_MEAN_BAR` / `WEDGE_CELL_CEILING` — **must NOT change.**
- `tests/unit/scene3d-mktick-banding.test.js` `PRE_RANK1_BANDC` — `bandC` **falls** on `cone/hatch` and
  `test|sphere/hatch` and **rises** on the contour cells; if the ×1.05 clause fails, that is a tuning
  signal, not a re-pin. A *tightened* re-pin (where `bandC` falls) is still a bar change and must be
  labelled as such.
- `tests/unit/scene3d-mktick-runaway.test.js` `PRE_T23B` — the numbers may not move, but the
  **population does** (more, shorter paths). Standing rule 6 requires the entry either way.
- `tests/unit/scene3d-mark-laws-draw.test.js` — O1's longest-third-by-chord population is touched in
  principle; report the measured margin whether or not the assertion moves.
- Any new `MK_TICK_COMB_*` constant is a **new** bar and must be disclosed as such, with the §4.4 trade
  beside it.
