STATUS: PLAN-READY

# T2-3b — the CONTOUR-mapper moiré T2-3 introduced, and the broken `git show HEAD:` self-test — PLAN

**Summary.** I built a directional banding instrument that works (it trips on synthetic bands with the
injected angle and period recovered to ±1° / ±1 mm, it does **not** trip on the clean pre tree or on an
ink-matched random-loss control, and it reads **2.8–3.4× higher on post than on pre** on the two cells the
T2-3 reviewer photographed — the scout's instrument read backwards because it subtracted a Gaussian from the
**raw** ink field, leaving the row comb and the individual ticks in the residual; mine low-passes first and
removes the intended taper with a degree-3 polynomial instead of a scale separation that a 40 mm object
cannot provide). Bisecting T2-3's 212-line diff hunk-by-hunk in scratch copies of `42acff7b` (with three
byte-identity checks proving the decomposition exact) puts the banding **entirely on the
`chan:'count'` → `chan:'len'` switch plus its `lenChan` branch in `solveAt`** — the stagger is innocent
(confirming the scout), the `L0` 1.02→1.16 constant is innocent **alone** (it measures *below* pre), and the
`place()` return-value and diagnostic hunks are provably inert. Root cause, with `file:line`: the `lenChan`
branch at **`surface-fill.js:6499–6503`** clamps `P` to `PMIN` but — unlike its own `countChan` sibling
three lines above at **`:6469–6473`** — never re-solves `L` afterwards, so over `I ∈ [0.30, 0.90]`, the whole
midtone, `P` pins at the floor and the **delivered ink area falls up to 25 % below `mkAsk(I)`** (measured:
asked 0.4646 → delivered 0.3497). That deficit is an unasked-for second tone transfer printed along the
isophotes — the diagonal bands. Rank 1 (prototyped, 3 added lines) restores the area with a smooth floor and
cuts the band contrast by **13–66 % on 11 of 12 cell×rig combinations**, taking the two flagged cells from
3.4×pre to 1.3–1.5×pre and **below the shipped, never-flagged `mkDotScreen`** on the same fixture, while
keeping `wedge25` (mean *and* per-cell ceiling), `holeMax`, `siteCoverage` and MUTATION-KILL 2 (12/12
monotone). **It costs O5**: 2.33–3.22 instead of 3.008–4.281. I then swept the two-dial family
(floor weight α × `L0`) and found the frontier is hard: **every setting that clears `O5 ≥ 3.0` needs
`L0 ≥ 1.35 R`, and a tick longer than ~1.35 row pitches overlaps its neighbouring rows and roughly doubles
the banding on the `hatch` cells** (cone/hatch 0.107 → 0.238). So this is a stop-condition-1 outcome and
**§4.4 states the decision Jay has to make** rather than fudging either bar. Deliverable (a) is specified in
full (§5): delete the `git show HEAD:` block, replace it with 12 pinned `pathSignature` goldens plus a live-
source mechanism assertion, non-vacuity proved by mutating away Rank 1's own line.

Lane: `fill-audit-a3`. Read-only planner — **nothing in any worktree or in MAIN's `src/`/`tests/` was
touched.** Everything below was measured in scratch exports under `/private/tmp/claude-501/scratch-T23b/`
(`pre` = `git archive 42acff7b`, `post` = `git archive 81925ee8`, `proto`/`proto2` = copies of `post` with
one patched `surface-fill.js`), `node_modules` symlinked from MAIN. `surface-fill.js` is under the live
W-31b implementer in the worktree; I read only my own exports. No `cd`; every node/python run foreground with
`timeout: 600000`.

---

## 0. THE FIXTURE BEHIND EVERY NUMBER (standing rule 3)

Two fixtures are used and they are never mixed in one table.

**FIXTURE A — the unit fixture (all `bandC`, `wedge25`, `holeMax`, `O5`, `siteCoverage` numbers).** Exactly
`renderCell` from `tests/unit/scene3d-mktick-wedge.test.js`, re-implemented byte-for-byte in
`T2-3b-plan-evidence/tools/render.js` and `gate.js`:

| field | value |
|---|---|
| bounds | `{ width: 1200, height: 1000, m: 20, dW: 1160, dH: 960, penWidth: 0.3 }` |
| light | one directional: `azimuth 135, elevation 45, intensity 1, castShadows false` |
| ground / backdrop | **`enabled: false` — there is no ground plane, so NO ink total below includes ground ink** |
| camera | `Params.DEFAULT_CAMERA` |
| tone | `{...defaults.tone, enabled: true}` |
| style | `styleTable.scene.params = { fillAngle: 45, fillDensity: 50, toneLaw: 'mkTick' }`, mapper per cell |
| rigs | **`test`** = `PRIMITIVE_PARAM_DEFAULTS` only (the `--rig addLayer` bag, what every RGR test in this lane builds) · **`create`** = `PRIMITIVE_CREATE_DEFAULTS` over `PRIMITIVE_PARAM_DEFAULTS` (the gallery / Jay's screenshots) |
| cells | the six T2-3 cells: `{sphere,torus,cone} × {hatch,contour}` |
| density | `fillDensity: 50` = the gallery's `med` (`scene3d-capture.js:148 DENSITY_VALUES`) |

**FIXTURE B — the gallery capture (the pictures only).** MAIN's `scripts/audit/scene3d-capture.js --tier B
--root <scratch export> --only '^(sphere|torus|cone)__(hatch|contour)__mkTick__med__a$' --rig create|addLayer`,
served version **1.4.1** matching each root's `package.json`, ports 8502 / 8503 / 8506 / 8508, **every server
killed and the port re-checked with `lsof` after its shard**. Output in
`docs/3d-audit/lane-reports/T2-3b-plan-evidence/{pre,post,proto,proto2}/`.

> ⚠ **EVIDENCE-INTEGRITY TRAP, hit and corrected in this plan — carry it into the brief.** I first captured
> `post` and then `pre` **on the same port (8503)**. The `pre` shots came back **md5-identical to `post`**
> (`dffb2714…`) with `post`'s `pathCount`s — a stale-cache serve, not a byte-identical render. Re-shot on a
> fresh port 8506 the `pre` manifest gives `1112 / 1088 / 403 / 338 / 566 / 645`, which is exactly
> `T2-3-plan.md` §4.4's own baseline table. **One port per tree, never re-use a port across roots, and
> always check `pathCount` against a known baseline before believing a capture.**

---

## 1. THE INSTRUMENT — definition, and the proof it points the right way

### 1.1 Why the scout's version read backwards

The scout detrended with a spatial Gaussian (σ ≈ 3 × rowPitch) subtracted from the **raw** local ink density.
On these objects that cannot work, for two independent reasons:

1. **No scale separation exists.** The object is only **40–57 mm across** (measured path bboxes) and the row
   pitch is 4.5 mm. The intended whole-object taper spans ~40 mm; the bands are 12–22 mm. They are a factor
   of **~2.7** apart in frequency — a Gaussian subtraction cannot separate them.
2. **The residual was dominated by the row comb, not by the bands.** With no low-pass on the signal side, the
   4.5 mm row comb and the along-row tick granularity survive into the "residual". Those differ *enormously*
   between `chan:'count'` (near-solid abutting ticks) and `chan:'len'` (thin dotted lines), which is exactly
   why the metric preferred the pre tree.

### 1.2 Definition (`T2-3b-plan-evidence/tools/band.py`)

Input is the algorithm's own returned vector paths, in mm — **no browser, no `.webp`, no `tickField`**, so it
works identically on the pre tree where `tickField` does not exist.

1. **Ink raster.** Every returned path is stamped at `penWidth = 0.3 mm` into a binary raster at
   **PPMM = 8 px/mm**.
2. **Object mask.** `M = erode(close(ink, 1.2·rowPitch), 1.0·rowPitch)`, i.e. a closed hull eroded a full row
   pitch inward so nothing is read at the silhouette. For a pre-vs-X comparison the mask used is
   **`M_pre ∩ M_X`** — the same pixels on both trees, so the populations are identical (standing rule 6).
3. **Density.** `D = normblur(ink, M, σ₁ = 2.0 mm)` (normalised convolution, so the mask edge does not darken
   the field). σ₁ = 0.45 × rowPitch attenuates the 4.5 mm row comb by ×0.02 and passes a 15 mm band at ×0.70.
4. **Detrend — a degree-3 2D polynomial least-squares fit over `M`, subtracted.** This removes the *intended*
   whole-object tone taper **regardless of its length scale** (it is smooth and low-order) and cannot absorb
   a 2–4-cycle oscillation. This is the step that fixes the scout's failure.
5. **Direction scan.** For θ = 0…179° in 1° steps, project the residual onto the axis `n(θ)`, bin at 0.4 mm,
   keep bins with ≥ 25 % of the maximum pixel count, take `p95 − p5` of the resulting 1-D profile.
   **`bandC` = max over θ of that spread ÷ mean ink density over `M`** — a dimensionless contrast.
   `θ*` is the argmax (the axis **perpendicular** to the bands), and the period comes from the 1-D FFT peak
   of the profile at `θ*`, restricted to λ ∈ [1.5, 9] × rowPitch.

### 1.3 Non-vacuity — the instrument trips on bands and not on anything else

`tools/validate.py`, cell `create|sphere/contour`, rowPitch 4.540 mm, Fixture A:

| render | bandC | recovered period | recovered θ | mean ink |
|---|---|---|---|---|
| PRE (`42acff7b`, clean) | **0.0349** | 22.9 mm | 136° | 0.881 |
| POST (`81925ee8`, the banded tree) | **0.1172** | 20.0 mm | 134° | 0.835 |
| SYNTHETIC: pre + a **15 mm band injected at 135°** | **0.7017** | **16.0 mm** | **136°** | 0.584 |
| SYNTHETIC: pre + a **20 mm band injected at 45°** | **0.6571** | **20.0 mm** | **46°** | 0.574 |
| CONTROL: pre, random path drop keep = 0.98 | 0.0415 | — | — | 0.863 |
| CONTROL: pre, random path drop keep = **0.95** (ink-matched to post) | **0.0531** | — | — | **0.840** |
| CONTROL: pre, random path drop keep = 0.90 | 0.0820 | — | — | 0.793 |

Both synthetics are recovered with the **injected angle to ±1° and the injected period to ±1 mm** — the
direction scan is not fitting noise. The **ink-matched** random control (mean ink 0.840 ≈ post's 0.835) reads
**0.0531, less than half of post's 0.1172**, so the metric is not merely reading "post has less ink".

### 1.4 Robustness — the ordering is independent of σ₁

`tools/sigma.py`, `sphere/contour`, both rigs:

| σ₁ (mm) | pre | V3d (`L` constant) | post | post ÷ pre |
|---|---|---|---|---|
| 1.0 | 0.0468 / 0.0671 | 0.0674 / 0.0947 | 0.1772 / 0.1881 | 3.8× / 2.8× |
| 1.5 | 0.0335 / 0.0389 | 0.0358 / 0.0460 | 0.1294 / 0.1114 | 3.9× / 2.9× |
| **2.0 (operating point)** | 0.0349 / 0.0329 | 0.0262 / 0.0251 | 0.1172 / 0.0982 | **3.4× / 3.0×** |
| 2.5 | 0.0356 / 0.0323 | 0.0297 / 0.0252 | 0.1041 / 0.0847 | 2.9× / 2.6× |
| 3.0 | 0.0353 / 0.0309 | 0.0318 / 0.0247 | 0.0919 / 0.0708 | 2.6× / 2.3× |
| 4.0 | 0.0353 / 0.0249 | 0.0316 / 0.0222 | 0.0697 / 0.0463 | 2.0× / 1.9× |

(create / test.) At **every** σ₁ from 1.0 to 4.0 mm the post tree reads 1.9–3.9× the pre tree, so the signal
is a real structure well above the row pitch and not an artefact of one smoothing choice.

### 1.5 The measurement — all six cells, both rigs

`bandC` / period(mm) / θ°, Fixture A. **`t` = test(addLayer) rig, `c` = create rig.**

| cell | pre | post | post ÷ pre |
|---|---|---|---|
| sphere/contour `t` | 0.0329 / 17.1 / 158 | **0.0982** / 15.2 / 136 | **2.98×** |
| cone/contour `t` | 0.0236 / 14.6 / 172 | **0.0518** / 11.4 / 179 | **2.19×** |
| sphere/hatch `t` | 0.0579 / 7.6 / 120 | 0.1257 / 9.4 / 113 | 2.17× |
| torus/hatch `t` | 0.2480 / 22.2 / 22 | 0.2064 / 22.8 / 16 | 0.83× |
| torus/contour `t` | 0.2134 / 10.2 / 94 | 0.2351 / 10.2 / 94 | 1.10× |
| cone/hatch `t` | 0.0749 / 8.5 / 133 | 0.1165 / 10.7 / 104 | 1.56× |
| sphere/contour `c` | 0.0349 / 22.9 / 136 | **0.1172** / 20.0 / 134 | **3.36×** |
| cone/contour `c` | 0.0249 / 17.1 / 172 | **0.0642** / 12.8 / 177 | **2.58×** |
| sphere/hatch `c` | 0.0460 / 26.7 / 107 | 0.1008 / 17.8 / 132 | 2.19× |
| torus/hatch `c` | 0.1502 / 6.8 / 1 | 0.1558 / 6.8 / 1 | 1.04× |
| torus/contour `c` | 0.1306 / 6.8 / 179 | 0.1465 / 6.8 / 179 | 1.12× |
| cone/hatch `c` | 0.0692 / 8.7 / 135 | 0.1067 / 17.1 / 21 | 1.54× |

**The two cells the T2-3 reviewer photographed are the two largest ratios on the board** — the instrument
independently rediscovers the reviewer's own finding without being told which cells to look at. The torus
cells carry a large *pre-existing* structural reading (its hole and fan convergence) and move little; they are
reported, not gated, for that reason. `sphere/hatch` and `cone/hatch` also rise, which **confirms the scout's
disagreement with `T2-3-review.md` §11**: hatch is affected too, less strongly.

**θ* ≈ 134–136° on `sphere/contour` on both rigs and on both trees.** The sun azimuth is 135°, so the axis
the bands are measured across is the **light gradient** — i.e. **the bands run along the isophotes.** That is
the fingerprint of a *tone-transfer* fault, not of a placement/lattice fault, and it is what pointed the
root-cause search at `solveAt` rather than at `layMark`.

---

## 2. BISECT — hunk by hunk, in scratch copies of `42acff7b`

`git diff 42acff7b..81925ee8 -- src/core/scene3d/surface-fill.js` is 306 diff lines in **11 hunks**. Only
`surface-fill.js` and three test files changed between the two shas, so every variant below is
**`post`'s tree with one patched `surface-fill.js`** — that removes the tree as a confound.

Functional decomposition (two hunks are pure comment, `:1116` and `:1180`):

| id | hunk | what it does |
|---|---|---|
| H3 | `:2448` | `const MK_TICK_EASE_BLEND = 0.92;` |
| H4 | `:2480` | `lenByThird`/`cntByThird`/`tickField`/`tickSites` on `mkStat` — diagnostic only |
| H5 | `:2508` | **`MK.mkTick`: `chan:'count'` → `chan:'len'`, `L0` 1.02 → 1.16, `+LMIN: 0.18`, `+P0: 1.02`** |
| H6 | `:6285` | `place()` returns `tot` instead of `true` |
| H7 | `:6332` | `const lenChan = law.chan === 'len';` |
| H8 | `:6375` | **the `else if (lenChan)` branch in `solveAt` — the length response** |
| H9 | `:6449` | **the golden-ratio cross-row stagger in `layMark`** |
| H10 | `:8854` | `tickField` republish — diagnostic only |
| H11 | `:11662` | `publishMarkStats` projection — diagnostic only |

**Three identity checks prove the decomposition is exact and complete** (md5 of `JSON.stringify(paths)` over
all 12 cell×rig combinations):

- `post`'s tree + `pre`'s `surface-fill.js` ≡ **the `pre` tree, byte-identical on 12/12** → `surface-fill.js`
  is the only lever between the two shas.
- my reconstructed **`V4_full` ≡ `post`, byte-identical on 12/12** → I am not missing a hunk.
- **`V1_dead` ≡ `pre`, byte-identical on 12/12** → H3 + H7 + H8 with the `MK` row left at `chan:'count'`
  changes nothing; the constant, the flag and the branch are provably inert without H5.

### 2.1 The cumulative bisect

`bandC`, Fixture A, the four contour cells (create rig first, then test):

| variant | what is applied | sphere/contour `c` | cone/contour `c` | sphere/contour `t` | cone/contour `t` |
|---|---|---|---|---|---|
| `pre` | nothing | 0.0349 | 0.0249 | 0.0329 | 0.0236 |
| `V1_dead` | H3+H7+H8, `chan:'count'` | **byte-identical to `pre`** | | | |
| `V0b_L116cnt` | **H5's `L0` 1.02→1.16 ALONE, `chan` still `'count'`** | **0.0347** | **0.0182** | **0.0262** | **0.0160** |
| `V2_len_L102` | + `chan:'len'`, `L0` still 1.02 | **0.1037** | **0.0509** | **0.0941** | **0.0407** |
| `V3_len_L116` | + `L0` 1.16 (= post minus the stagger) | 0.1246 | 0.0671 | 0.1092 | 0.0510 |
| `V4_full` | + H9, the stagger (**≡ `post`**) | 0.1172 | 0.0642 | 0.0982 | 0.0518 |
| `V4_L102` | H9 stagger at `L0` = 1.02 | 0.0900 | 0.0468 | 0.0850 | 0.0444 |

**Verdicts, each with its number:**

- **H5+H8 together are the banding hunk.** `V2_len_L102` is the first variant that bands: 0.0349 → 0.1037
  (**2.97×**) / 0.0249 → 0.0509 (2.04×) / 0.0329 → 0.0941 (2.86×) / 0.0236 → 0.0407 (1.72×). That is 88 % of
  post's total excursion, from the `chan` switch alone.
- **The `L0` constant is innocent on its own.** `V0b_L116cnt` — a tick made 14 % longer inside the *old*
  `countChan` design — measures **at or below `pre` on all four** (0.0347 / 0.0182 / 0.0262 / 0.0160).
- **The stagger (H9) is innocent, confirming the scout's own control by an independent instrument.**
  `V4_full` vs `V3_len_L116` is −6 % / −4 % / −10 % / **+2 %** — the stagger slightly *helps* on three cells
  and does nothing on the fourth. Removing it entirely leaves the banding in place.
- **H6, H4, H10, H11 are inert for geometry** (`place()`'s `tot` is truthy on every path that reaches it;
  the rest are `mkStat` projections that nothing reads back).

### 2.2 The mechanism bisect — inside H8

| variant | the `lenChan` branch becomes | sphere/contour `c` | cone/contour `c` | sphere/contour `t` | cone/contour `t` |
|---|---|---|---|---|---|
| `V3d_Lconst` | `L = L0·R` (constant), `P = L/g` | **0.0262** | **0.0182** | **0.0251** | **0.0160** |
| `V3_len_L116` | `L` = eased(I), `P = L/g` (shipped) | 0.1246 | 0.0671 | 0.1092 | 0.0510 |
| `V3e_Pfixed` | `L` = eased(I), **`P = P0·R` fixed** | **0.4294** | **0.2523** | **0.3997** | **0.1550** |
| `V3b_blend0` | shipped with `MK_TICK_EASE_BLEND = 0` | 0.1027 | 0.0575 | 0.0912 | 0.0463 |
| `V3c_blend1` | shipped with `MK_TICK_EASE_BLEND = 1` | 0.1246 | 0.0678 | 0.1099 | 0.0501 |

- **It is the variation of `L` that bands, not the `P = L/g` re-derivation.** With `L` held constant the
  period-derivation is clean (`V3d_Lconst` ≈ `pre`); with `L` varying and the period *not* re-derived the
  banding is **12× pre** (`V3e_Pfixed`). `P = L/g` is therefore a partial **compensator** — it takes the
  banding from 0.43 down to 0.12 — and the residual 0.12 is what is left of a compensation that is
  **incomplete**. §3 is that incompleteness.
- **The ease curve is not the lever** (again): `MK_TICK_EASE_BLEND` 0 → 1 moves `bandC` by 0.02 — the same
  conclusion `T2-3-plan.md` §0 reached for the wedge.

---

## 3. ROOT CAUSE

### 3.1 The line, and the sibling line that is missing

`src/core/scene3d/surface-fill.js` at `81925ee8`:

```js
        if (countChan) {                                                    // :6469
          const L0 = law.chan === 'alt' ? 1.60 : law.L0;
          L = Math.min(L0 * R, capOf(PMIN));
          P = clamp(L / Math.max(1e-6, g), PMIN, MK_PMAX);
          if (P <= PMIN + 1e-9) L = Math.min(g * P, capOf(P));              // :6473  <-- the area re-solve
        } else if (lenChan) {                                               // :6475
          const t = clamp(1 - I, 0, 1);
          const eased = (1 - MK_TICK_EASE_BLEND) * t + MK_TICK_EASE_BLEND * (t * t * (3 - 2 * t));
          L = (law.LMIN || 0) * R + (law.L0 - (law.LMIN || 0)) * R * eased; // :6501
          P = clamp(L / Math.max(1e-6, g), PMIN, MK_PMAX);                  // :6502
          //                                                                   :6503  <-- NOTHING HERE
        } else {
```

The branch's own comment states the invariant it means to hold: *"`P = L/g` is the unique period making
`area = L·w/(R·P)` equal `mkAsk(I)` — for ANY `L`."* That is true **only while the clamp does not bind.**
`P = clamp(L/g, PMIN, MK_PMAX)` binds at the bottom whenever `L < g·PMIN`, and then
`area = L·w/(R·PMIN) < mkAsk(I)`. The `countChan` branch handles exactly this case one line earlier and the
`lenChan` branch does not.

### 3.2 How much it binds, and what it prints

Per-site instrumentation (`tools/renderlog.js`, logging `[x, y, I, R, P, L, g, lineIndex]` at every `layMark`
tick site; `create|sphere/contour`, Fixture A, 1106 sites, 11 mark rows, `PMIN = 1.1·inkWidth = 0.3696 mm`):

| `I` bin | sites | asked area `mkAsk(I)` | **delivered** `L·w/(R·P)` | delivered ÷ asked | mean `L` (mm) | mean `P` (mm) |
|---|---|---|---|---|---|---|
| 0.00–0.05 | 562 | 0.8569 | 0.8569 | 1.000 | 4.79 | 0.406 |
| 0.20–0.25 | 27 | 0.7892 | 0.7892 | 1.000 | 5.50 | 0.391 |
| 0.30–0.35 | 45 | 0.7360 | 0.7295 | 0.991 | 4.60 | **0.370** |
| 0.45–0.50 | 29 | 0.6477 | 0.5777 | 0.892 | 3.91 | **0.370** |
| 0.55–0.60 | 32 | 0.5572 | 0.4512 | 0.810 | 2.55 | **0.370** |
| **0.65–0.70** | 32 | **0.4646** | **0.3497** | **0.753** | 1.92 | **0.370** |
| 0.70–0.75 | 30 | 0.4095 | 0.3010 | 0.735 | 1.62 | **0.370** |
| 0.80–0.85 | 22 | 0.2858 | 0.2191 | 0.767 | 1.27 | **0.370** |
| 0.85–0.90 | 27 | 0.2067 | 0.1848 | 0.894 | 1.10 | **0.370** |
| 0.90–0.95 | 14 | 0.1287 | 0.1287 | 1.000 | 0.69 | 0.471 |
| 0.95–1.00 | 5 | 0.0573 | 0.0573 | 1.000 | 0.53 | 1.408 |

**`P` is pinned at `PMIN` = 0.3696 mm for the whole midtone, `I ∈ [0.30, 0.90]`,** and the delivered ink area
sags to **75.3 % of what the light asked for** at `I ≈ 0.67`, recovering to 1.000 at both ends. That sag is a
second, unintended tone transfer laid on top of the intended one. It is a *smooth* function of `I`, so it
prints as a coherent lighter zone bounded by two "correct" zones — bands **along the isophotes**, which is
exactly the θ* ≈ 135° the instrument measures (§1.5) and exactly the picture the reviewer photographed.
`mkStat.flood` = 337 of 1106 sites (30 %) on this cell independently confirms how much of the render lives at
the period floor.

Why the **CONTOUR** mapper reads worst: `contour` rules its row family along the surface's own parameter
(`surface-fill.js:5489–5491`), so on a sphere the rows are latitude rings and the isophote runs *obliquely
across* the rows, cutting each ring into a light stretch and a dark stretch. The area sag therefore paints a
band that crosses the row family at an angle — a **diagonal** moiré. On `hatch`, whose rows are plain
translations at a fixed `fillAngle`, the same sag lands more nearly parallel to the rows and reads as a
weaker, less structured mottle — which is why the reviewer's eye separated the two mappers while the
instrument shows both are affected.

### 3.3 The second, structural half — and it is NOT this unit's

After the area sag is corrected (§4) the residual `bandC` on `sphere/contour` is still 1.3–1.5× pre. That
residual is the **row lattice itself becoming visible**: `MK_ROW_COV = 1/3` (`:2397`) gives
`R = pitchAtStep / MK_ROW_COV` ≈ 4.5 mm, which on a 40–57 mm object is **only 9–11 mark rows**, and
`chan:'len'` swings the across-row ink footprint `L/R` from 0.18 to 1.16, so those 9–11 rows alternate between
"solid" and "thin dotted line". Measured, as a read-only experiment (**not a proposal — `MK_ROW_COV` is T3's
and is FORBIDDEN here**): patching `MK_ROW_COV` to `2/3` (half the row pitch, twice the rows) takes `post`'s
`bandC` from **0.1172 → 0.0527** on `create|sphere/contour`, **0.0642 → 0.0193** on `create|cone/contour` and
**0.0982 → 0.0524** on `test|sphere/contour`; with Rank 1 also applied it reaches **0.0447 / 0.0168 / 0.0454**,
i.e. at or below `pre`. **Hand this to T3 as a measured requirement**: T3's row floor is the structural unlock
for the other half of this artefact.

### 3.4 The physics ceiling that makes §4's frontier unavoidable

At the period floor the ink along the row is already saturated: a tick is `w = inkWidth ≈ 0.336 mm` wide and
the floor period is `1.1·inkWidth`, so the maximum deliverable area fraction at a given length is
`(L/R)·(w/PMIN) = 0.909·L/R`. Therefore **an area-correct tick has `L ≥ mkAsk(I)·R/0.909` — the tone
*determines* the length over the whole midtone.** O5 (mean drawn length, dark third ÷ light third) then
collapses onto the ratio of `mkAsk` over those thirds, which on this fixture is ≈ **2.3–3.2**. The only way to
lift O5 above that is to make the dark end longer than the area requires, i.e. `L0·R` well above
`mkAsk(0)·R/0.909 = 1.056·R` — and past ≈ 1.35 R a tick overlaps its neighbouring rows, which is its own new
moiré. §4.4 measures both ends of that.

---

## 4. RANKED FIXES

### Rank 1 — **restore the delivered area with a smooth floor on `L`** ✅ PROTOTYPED

Three lines, one insertion point, inside the `lenChan` branch only (full diff in
`T2-3b-plan-evidence/tools/R1_n4_cap.diff`, full file in `…/R1_n4_cap.surface-fill.js`):

```js
          const Lease = (law.LMIN || 0) * R + (law.L0 - (law.LMIN || 0)) * R * eased;
          const Lfloor = g * PMIN;   // the length at which P stops being able to deliver mkAsk(I)
          L = Math.min(law.L0 * R, Math.pow(Math.pow(Lease, 4) + Math.pow(Lfloor, 4), 1 / 4));
          P = clamp(L / Math.max(1e-6, g), PMIN, MK_PMAX);
```

**Why this shape and not the sibling's literal line.** `if (P <= PMIN + 1e-9) L = Math.min(g*P, capOf(P))`
(the `countChan` idiom, prototyped as `V5_resolve` / `V7_hardfloor`, which measure **identically** to each
other) is a hard `max`, and a hard `max` puts a **kink** in `L(I)` at the crossover — one more hard-edged
isophote, which is the class of defect this whole item exists to remove. The 4-norm soft-max is the same
floor with a continuous derivative; measured, it is worth a further −5 % to −30 % of `bandC` over the hard
version (e.g. `create|cone/contour` 0.0390 → 0.0271). `n` was swept 2/3/4/6/8; **n = 4** is the optimum
(n = 2 over-lengthens and re-bands to 0.1002; n ≥ 6 approaches the hard max).
`Math.min(law.L0 * R, …)` keeps the dark anchor bit-for-bit at its shipped `L0·R` so **black-by-abutment is
unchanged**; without it the `g ≤ 26` clamp lets the floor ask for `L ≈ 2.15 R` in foreshortened patches and the
dark region turns chunky (visible in `proto/` vs `proto2/`).

`capOf('tick', R, w) = 1.02·R·max(1, floor(1.4·nCap))` ≈ **87 mm** on this fixture and never binds — stated
because the `countChan` sibling's `capOf` looks load-bearing and is not.

#### 4.1 Rank 1 — banding, all six cells, both rigs

`bandC`, Fixture A. **All 12 combinations, none omitted.**

| cell | pre | post (shipped) | **Rank 1** | Δ vs post | Rank 1 ÷ pre |
|---|---|---|---|---|---|
| sphere/contour `t` | 0.0329 | 0.0982 | **0.0437** | **−55.5 %** | 1.33× |
| cone/contour `t` | 0.0236 | 0.0518 | **0.0167** | **−67.8 %** | **0.71× (below pre)** |
| sphere/hatch `t` | 0.0579 | 0.1257 | **0.1049** | −16.5 % | 1.81× |
| torus/hatch `t` | 0.2480 | 0.2064 | 0.2126 | **+3.0 %** | **0.86× (below pre)** |
| torus/contour `t` | 0.2134 | 0.2351 | 0.2231 | −5.1 % | 1.05× |
| cone/hatch `t` | 0.0749 | 0.1165 | **0.0897** | −23.0 % | 1.20× |
| sphere/contour `c` | 0.0349 | 0.1172 | **0.0507** | **−56.7 %** | 1.45× |
| cone/contour `c` | 0.0249 | 0.0642 | **0.0221** | **−65.6 %** | **0.89× (below pre)** |
| sphere/hatch `c` | 0.0460 | 0.1008 | **0.0734** | −27.2 % | 1.60× |
| torus/hatch `c` | 0.1502 | 0.1558 | 0.1516 | −2.7 % | 1.01× |
| torus/contour `c` | 0.1306 | 0.1465 | 0.1355 | −7.5 % | 1.04× |
| cone/hatch `c` | 0.0692 | 0.1067 | **0.0830** | −22.2 % | 1.20× |

**11 of 12 improve** (−2.7 % to −67.8 %); the one exception, `test|torus/hatch`, worsens by 3.0 % and still
sits **14 % below its own pre value**. **Stated plainly: Rank 1 does NOT reach "≤ pre" on all six cells.**
It reaches ≤ pre on 3 of 12, within 1.05× on 3 more, and ≤ 1.81× on the rest — down from ≤ 3.36×. On the two
cells this unit exists for it lands **below the shipped, never-flagged `mkDotScreen`** measured on the
identical fixture (`mkDotScreen`: 0.0774 / 0.0532 test, 0.0662 / 0.0461 create — Rank 1: 0.0437 / 0.0167,
0.0507 / 0.0221). §4.5 proposes that as the honest bar.

#### 4.2 Rank 1 — T2-3's own gates, all six cells, both rigs

Measured with the **shipped, unmodified** `tests/helpers/scene3d-mktick-wedge.js`
(`measureWedge` / `siteCoverage` / `lengthCarriesTone`), `required` directly, never edited
(`tools/gate.js`). Bars from `tests/unit/scene3d-mktick-wedge.test.js`.

| | shipped (`post`) | **Rank 1** | bar | verdict |
|---|---|---|---|---|
| six-cell mean `wedge25`, test | 0.07622 | **0.07558** | ≤ 0.0800 | **PASS, better than shipped** |
| six-cell mean `wedge25`, create | 0.08878 | **0.08863** | ≤ 0.0950 | **PASS, better than shipped** |
| per-cell `wedge25` max, test | 0.0876 | **0.0781** | ≤ 0.090 | **PASS** |
| per-cell `wedge25` max, create | 0.1731 | **0.1728** | ≤ 0.180 | **PASS** |
| `siteCoverage` min, test / create | 0.978 / 0.958 | **0.983 / 0.972** | > 0.90 | **PASS** |
| `holeMax` range | 0.984–1.110 | 0.984–1.110 | reported, not gated | unchanged |
| **MUTATION-KILL 2** (stagger `room = 0`) | — | means 0.07558 < **0.07949**, 0.08863 < **0.09453**, **monotone 12/12** | shipped < mutant | **PASS** |
| **O5 ≥ 3.0 and monotone, per cell** | 3.008–4.281, 12/12 | **2.330–3.221, monotone 12/12, but 10 of 12 below 3.0** | ≥ 3.0 | **FAIL** |

Per-cell `wedge25` / `O5`, Rank 1 (`sphere/hatch, sphere/contour, torus/hatch, torus/contour, cone/hatch,
cone/contour`):

- **test**: `w` 0.0781 / 0.0668 / 0.0766 / 0.0874 / 0.0697 / 0.0748 — `O5` **3.158 / 2.364 / 2.330 / 2.779 /
  2.710 / 2.953**
- **create**: `w` 0.0544 / 0.0649 / 0.1381 / 0.1728 / 0.0605 / 0.0411 — `O5` **3.221 / 2.439 / 2.465 / 3.063 /
  2.437 / 2.614**

#### 4.3 Rank 1 — byte-identity, guards, pictures

- **Byte-identity outside `mkTick` is structural, not just measured.** `chan: 'len'` appears on exactly one
  row of the `MK` table (`surface-fill.js:2611`); the only other `chan: 'count'` users are `mkComma` (`:2613`)
  and `mkRadialFlick` (`:2619`), which take the `countChan` branch. The Rank-1 lines live wholly inside
  `else if (lenChan)`, so no non-`mkTick` law can reach them. **The implementer must still repeat
  `T2-3-plan.md` §4.3's Sweep B** (8 laws × **8/8 mappers** × 3 primitives × {d50, d220} = 384 cells) and
  state the fraction and the exclusions, per standing rule 2 — the structural argument is a prediction, not
  the measurement.
- **`G4` is `mkDashRamp`'s band-width guard** (`scene3d-mark-laws-draw.test.js:406–436`), not `mkTick`'s —
  read and confirmed; say so rather than claiming mkTick is gated by it. **T4b**
  (`scene3d-mkdashramp-dark-end.test.js`) is `mkDashRamp`'s dark end, also not on this path. The ribbon-width
  bars (`scene3d-ribbon-*`) are ribbon laws, which never reach the mark sink. All three are expected
  untouched and all three must still be **run**, not argued.
- **`shadows.js:1229` has its own unrelated `mkTick`** and is not touched by any line of this plan; it must be
  named as checked-and-untouched in the implementer's report.
- **Pictures, Fixture B, native resolution, LOOKED at** (`T2-3b-plan-evidence/crops/`):
  - `sphere__contour-create-native-pre-post-proto2.png` — **PRE**: a smooth continuous comb of long ticks,
    spacing widening toward the light, no grouping. **POST**: broad alternating dark and pale diagonal sweeps
    across the whole lit flank, four to five alternations, sharp-edged; this is the reviewer's artefact and it
    is unmistakable side by side. **PROTO2 (Rank 1)**: the pale voids between the row groups are visibly
    narrower and the dark groups no longer read as separate slabs; the flank is markedly more even. It is
    **not** as smooth as PRE — PRE is a near-saturated design with no tone structure to band — but it is a
    real, photographable improvement, matching the −56.7 % number.
  - `_full-sphere__contour-post-proto2.png` — the same at whole-object scale.
  - `native-lowerleft-pre-post-proto.png` — the dark region. `proto/` (the **uncapped** floor, kept as
    evidence for why the `Math.min(law.L0 * R, …)` cap is in Rank 1) shows chunkier, more regular solid
    blocks than post. `proto2/` (Rank 1, capped) restores the shipped dark-end look.
  - `native-diag-pre-post-proto.png` — see the disclosure below.

> **DISCLOSED, and measured before being blamed on Rank 1: one long runaway stroke.** `proto`/`proto2` show a
> single ~46 mm diagonal line across `create|sphere/contour` that `pre`/`post` do not. A census of every path
> over 15 mm across all 12 cells says this is a **pre-existing class**, not one Rank 1 creates: **pre has 13
> such paths (longest 51.8 mm on `create|sphere/hatch`), post has 8 (longest 47.1 mm on the same cell), Rank 1
> has 11 (longest 52.4 mm, on `create|sphere/contour`).** Rank 1 moves one of them onto a flagged cell. The
> implementer must (a) reproduce this census, (b) find the walk that produces it — the suspects are
> `place()`'s per-arm walk with `MK_MAX_WALK_STEPS = 64` in a patch where `R` reaches its
> `clamp(…, 0.25, 40)` ceiling — and (c) either fix it or file it as a separate item with the census attached.
> **Do not "fix" it by clamping `L` against the nominal pitch**: I prototyped
> `L ≤ L0 · min(R, masterPitch/MK_ROW_COV)` (the in-file `bandPitch = Math.min(truePitch, masterPitch)`
> idiom) and it **did not remove the long path (51.06 mm) and wrecked O5** (1.821–2.430, non-monotone on
> `cone/hatch` on both rigs). That avenue is measured and closed.

### 4.4 THE FRONTIER — and the decision it forces

Rank 1 has two dials: the floor weight `α` (`Lfloor = α·g·PMIN`; `α = 0` is the shipped tree, `α = 1` is full
area correction) and `MK.mkTick.L0`. I swept 4 × 3 = 12 points, running the full six-cell × two-rig gate on
each (`tools/gate_*.json`):

| α | `L0` | min O5 over 12 cells (test / create) | mean `wedge25` (t / c) | max per-cell `wedge25` (t / c) | `bandC` `sphere/contour c` | `bandC` `cone/hatch c` |
|---|---|---|---|---|---|---|
| 0 (**shipped**) | 1.16 | **3.008 / 3.039** | 0.07622 / 0.08878 | 0.0876 / 0.1731 | 0.1172 | 0.1067 |
| 0.5 | 1.16 | 2.642 / 2.625 | 0.07608 / 0.08881 | 0.0877 / 0.1731 | — | — |
| **1.0** | **1.16 (Rank 1)** | **2.330 / 2.437** | **0.07558 / 0.08863** | 0.0781 / 0.1728 | **0.0507** | **0.0830** |
| 0.5 | 1.35 | **3.234 / 3.228** | 0.07561 / 0.08857 | 0.0874 / 0.1729 | 0.1185 | 0.1026 |
| 0.85 | 1.55 | **3.218 / 3.240** | 0.07710 / 0.08924 | 0.0891 / 0.1727 | 0.1055 | 0.2237 |
| 1.0 | 1.55 | **3.021 / 3.088** | 0.07694 / 0.08927 | **0.0891** / 0.1726 | 0.0929 | **0.2378** |
| 1.0 | 1.35 | 2.588 / 2.646 | 0.07507 / 0.08861 | 0.0873 / 0.1729 | — | — |
| 0.7 | 1.35 | 3.000 / **2.780** | 0.07541 / 0.08865 | 0.0874 / 0.1730 | — | — |

**Every point that clears `O5 ≥ 3.0` on both rigs needs `L0 ≥ 1.35`, and every such point roughly doubles the
banding on the `hatch` cells** (`cone/hatch` create 0.1067 shipped → 0.2237–0.2378; `sphere/hatch` create
0.1008 → 0.1416–0.1623). The mechanism is §3.4's: a tick longer than ~1.35 row pitches crosses into its
neighbours' rows and interleaves with them. `α = 1, L0 = 1.55` additionally pushes the per-cell test-rig
`wedge25` to **0.0891 against a 0.090 ceiling — a 1 % margin**, which is not a bar anyone should ship against.

**This is `T2-3-plan.md` §4.5 stop condition 1, reached honestly.** The plan must therefore hand Jay a
decision rather than pick for him:

- **(A) Ship Rank 1 at `α = 1, L0 = 1.16` and re-derive the O5 bar.** The `O5 ≥ 3.0` bar was chosen by T2-3's
  own planner as a proxy for Jay's R1 ("tick length carries the tone"); §3.4 shows **3.0 is above the ceiling
  of any area-correct tick at this row density** — the area-correct length ratio over thirds *is* ≈2.3–3.2.
  Length still carries tone monotonically on 12/12 cells. Re-deriving the bar to **2.30** with that proof is a
  `## Bars changed` entry and needs Jay's ruling; it must **not** be done by re-scoping O5's population.
- **(B) Ship `α = 1, L0 = 1.55`,** keep every existing bar, accept that `contour` improves (0.1172 → 0.0929,
  −21 %) while `hatch` regresses (0.1067 → 0.2378, +123 %), and file the hatch regression. **I do not
  recommend this** — it trades the reviewer's two cells for four others and leaves a 1 % `wedge25` margin.
- **(C) Ship nothing from §4 and hand the whole item to T3.** §3.3 measures that halving the row pitch alone
  takes `post` from 0.1172 → 0.0527 on the flagged cell, and Rank 1 + T3's row floor reaches 0.0447 — at pre.
  **This is the only route measured to reach "≤ pre + envelope" on the flagged cells**, and it needs a file
  this unit is FORBIDDEN to touch.

**My recommendation: (A), with (C) carried into T3's brief as a measured requirement.** (A) fixes a provable,
independently-checkable defect — a tone transfer that under-delivers by 25 % — improves 11 of 12 cells,
improves `wedge25` on both rigs, and is three lines. Its only cost is a proxy bar that §3.4 shows was set
above what the design can reach.

### Rank 2 — carry the floored-period deficit in parallel passes instead of in length (NOT prototyped)

`mkDashRamp` already escalates to a **band of parallel passes an ink width apart** when one mark cannot carry
the ink (`layMark`'s `'morph'` branch, `MK_BAND_MAX_PASSES = 6`), and `mkCap`'s `'tick'` row already budgets
`1.4·nCap` passes. Ranked **below** Rank 1 and **not prototyped**, because the arithmetic says it cannot
help: at `P = PMIN = 1.1·inkWidth` the ticks are already 91 % touching along the row, so the row cell is
saturated along its own axis and a second pass would have to sit **inside** the floor the floor exists to
protect. Recorded so the next unit does not re-derive it.

### Rank 3 — a different offset generator in `layMark`

**Ruled out before this plan started** (`T2-3b-moire-scout.md` §2, four generators + a `room = 0` control) and
independently re-confirmed here by §2.1's `V4_full` vs `V3_len_L116` (−6 %/−4 %/−10 %/+2 %). If some *other*
unit ever needs to touch the generator, the scout measured `hashphase` as the only safe drop-in. **Do not
spend a fourth attempt here.**

### Rejected without prototyping

- **Lowering `MK_PMIN` (`:2410`, `1.1 * inkWidth()`).** It is inside §4.1's allowed constant range and would
  shrink the clamped regime, but it is a plot-safety floor ("what *marks touching to make pure black* means
  physically"), and lowering it trades a picture artefact for ink on the plotter.
- **`LMIN`.** Swept 0.18 / 0.12 / 0.08 / 0.05 at `L0 = 1.16`: min O5 moves 2.330 → 2.584 → 2.319 and never
  reaches 3.0, because `MIN_MARK_MM = MIN_MARK_PEN·penWidth = 0.6 mm` censors the shortest ticks out of the
  light third's mean. `LMIN` is not a lever. Leave it at 0.18.
- **Touching the ease curve.** §2.2: `MK_TICK_EASE_BLEND` 0 → 1 moves `bandC` by 0.02. Third confirmation.

### 4.5 The bar Rank 1 should be gated on

**New bar, labelled NEW** (it does not modify an existing one):

- **`bandC` per cell ≤ the shipped `mkDotScreen` reading on the same cell and rig**, where `mkDotScreen` is a
  *shipped, in-roster, never-flagged* mark law that carries continuous tone through mark **size**. Measured on
  Fixture A: `mkDotScreen` = 0.0774 / 0.0532 (test `sphere/contour`, `cone/contour`), 0.0662 / 0.0461
  (create). Rank 1 = 0.0437 / 0.0167, 0.0507 / 0.0221 — **clears with 1.8–2.6× margin on all four.** The
  implementer must extend the `mkDotScreen` reference to the four `hatch`/`torus` cells before gating them.
- **Plus a non-regression clause**: `bandC` must not rise above the `post` (`81925ee8`) reading on **any** of
  the 12 combinations by more than 5 % (Rank 1's worst is `test|torus/hatch`, +3.0 %).
- ⚠ **State which half you gate.** `bandC` gates the *moiré* half only. It says nothing about the wedge (that
  is `wedge25`) and nothing about whether length carries tone (that is `O5`). Mutation proof required and
  **blocking**: removing Rank 1's three lines must raise `bandC` on `sphere/contour` and `cone/contour`, both
  rigs, by the §4.1 numbers; and the synthetic-band / ink-matched-random pair of §1.3 must be re-run in the
  test file as the instrument's own correctness check, exactly as `wedgeFromMasks` already does.

---

## 5. DELIVERABLE (a) — replacing the `git show HEAD:` self-test

### 5.1 What is broken, and why, mechanically

`tests/unit/scene3d-mktick-wedge.test.js:269–296`, the describe block *"RED at the pre-fix tree"*, does:

```js
const preFixSource = execSync('git show HEAD:src/core/scene3d/surface-fill.js', { cwd: ROOT_DIR, … });
expect(preFixSource).toContain("chan: 'count'");
expect(preFixSource).not.toContain("chan: 'len'");
```

At `81925ee8` — the commit that ships the file — `HEAD` **is** the post-fix tree. The first assertion still
passes for the wrong reason (`mkComma` at `:2613` and `mkRadialFlick` at `:2619` are still `chan: 'count'`);
the **second throws inside `beforeAll`**, taking both tests in the block with it. That is the
44 passed / 2 skipped / 1 failed file the brief reports, and it matches `T2-3-review.md` §7's BLOCKING
finding. It is the same anti-pattern `W-38b` removed from `scene3d-facet-min-rulings.test.js` and that the
U7-2 review flagged once before.

### 5.2 The replacement — pinned goldens (the `W-38b` pattern) plus a live-source assertion

**Delete** the whole `describe('RED at the pre-fix tree …')` block, together with `require('child_process')`.
Keep `fs`, `path`, `ROOT_DIR` and `REL_PATH` — `loadHeadSource()` and the MUTATION-KILL 2 machinery use them.
**Replace it with two legs:**

**Leg 1 — 12 pinned `pathSignature` goldens.** Use `tests/helpers/path-signature.js`'s
`pathSignature(paths, 4)` — the same helper and the same 4-decimal precision `W-38b` chose and
`scene3d-hlr-spatial-index-identity.test.js` already uses, because commit `1193cbe1` proved 9-decimal
`md5PathsAll` pins drift between this arm64 machine and GitHub's x86_64 runner on exactly this kind of
trig-heavy scene3d hash. One literal `sha256` per `(rig, primitive/mapper)` — **12 entries**, recorded from a
run with the table empty (each miss printing `'<rig>|<cell>': '<sha256>',` to paste back, the same
missing-entry convention the HLR file uses), then pasted verbatim and the file re-run green. Comment the
table **"RE-PIN ONLY WITH PROOF"**.

Unlike the removed leg, the reference is a **string constant in the test file**. It cannot become "the same
code as the runtime under test" merely because a commit lands.

**Leg 2 — the mechanism assertion, read from the LIVE disk source, not from git.**
`loadHeadSource()` already reads `path.join(ROOT_DIR, REL_PATH)`. Assert on it:

```js
const src = loadHeadSource();
expect(src).toMatch(/mkTick:\s*\{[^}]*chan: 'len'/);       // the T2-2/T2-3 mechanism is present
expect(src).not.toMatch(/mkTick:\s*\{[^}]*chan: 'count'/); // and the pre-T2-2 design is gone
expect(src).toContain('const Lfloor = g * PMIN;');          // T2-3b's own area floor is present
```

This keeps the *intent* of the removed block (prove the `chan:'len'` mechanism is the one in the tree) with
none of its `HEAD`-relative fragility, and works identically in a worktree, a `git archive` export, and CI.

### 5.3 How the mutation proves the goldens are non-vacuous

Three mutations, each applied **only in a scratch `git archive` export with `node_modules` symlinked** (never
in the worktree, never via `git stash`), each run and each count reported:

1. **Remove T2-3b's own fix** — delete the three Rank-1 lines, restoring `L = Lease`. Expected: **all 12
   goldens change** (every cell's geometry moves; §4.1 measures `bandC` moving by 2.7–68 %). This is the
   mutation that ties the goldens to this unit.
2. **The contrast mutation the brief asks for** — nudge one shipped constant by the smallest step that is not
   a no-op, `MK_TICK_EASE_BLEND` **0.92 → 0.90**. Expected: all 12 change; report the count. This proves the
   goldens are sensitive to the tone curve, not only to the placement.
3. **A narrow negative control** — change a constant that provably cannot reach this path, e.g. `mkComma`'s
   `L0` (`chan:'count'`, different branch). Expected: **0 of 12 change**. This proves the goldens are not
   simply "any edit to the file trips them", which is the failure mode a whole-file hash would have.

**Report the exact pass/fail counts for all three**, in the report and the commit body. A golden pin with no
mutation count is a re-pin without proof.

### 5.4 The population change this creates — disclose it

Removing the describe block removes 2 tests. Under the 2026-09-13 amendment **a change to the population an
assertion measures over is a bar change even when no number moves**, so `## Bars changed` must carry:
`tests/unit/scene3d-mktick-wedge.test.js:269–296 — "RED at the pre-fix tree" (2 tests, git-show-HEAD) →
12 pinned pathSignature goldens + 3 live-source assertions — the removed leg is provably vacuous at the sha
that ships it (T2-3-review.md §7); the replacement is mutation-proved (§5.3)`.

---

## 6. GUARDS, EVIDENCE, FILES, STOP CONDITIONS

### 6.1 Files ALLOWED

- `src/core/scene3d/surface-fill.js`, **and inside it only the `else if (lenChan)` branch of `solveAt`
  (`:6495–6504`)** — the three Rank-1 lines — plus, if and only if Jay rules (B) in §4.4, the `MK.mkTick` row
  at `:2611`. Nothing else in the file.
- `tests/unit/scene3d-mktick-wedge.test.js` — deliverable (a), plus the new `bandC` bar of §4.5.
- A new `tests/helpers/scene3d-mktick-band.js` for the §1.2 instrument (port of
  `T2-3b-plan-evidence/tools/band.py`; it needs only the returned paths, so it has no dependency on
  `tickField` and no new `src/` instrumentation).

### 6.2 Files FORBIDDEN

- **`MK_ROW_COV` (`:2397`), `isMarkLaw()`'s row-coverage line (`:5083`) and any `rowFloor` flag — T3's.**
  §3.3's `2/3` experiment is a **read-only measurement handed to T3**, not a change this unit may make.
- **T3's `dashRamp` code** and `MK_BAND_MAX_PASSES` / the `'morph'` branch (Rank 2's territory, not opened).
- **W-31b's crosshatch placement** and anything else `W-31b-plan.md` claims — it is live in the same worktree
  on the same file. **Serialize: one implementer at a time on `surface-fill.js`.**
- `emitContFamily` (`:9275`+) and the wave-law amplitude code (F1-amp).
- `surface-fill-mono.js` (fill-audit-c) · `mappers.js` / slices (fill-audit-d) · `hlr.js` / `shadows.js`
  (handoff-c). **`shadows.js:1229` has its own unrelated `mkTick`** — name it as checked-and-untouched.
- `HL_STAGE` (`:388`); `MK_PMIN`, `MIN_MARK_PEN`, `MK_MAX_WALK_STEPS`, `MK_PMAX`, `MK_DARK_AREA`,
  `MK_LIGHT_AREA`, `MK_MIN_ADJ_PEN` — all untouched by Rank 1 and all must stay so.

### 6.3 Guards to run — targeted, FOREGROUND, `timeout: 600000`, **one file per command**

> Run every vitest file in the FOREGROUND with the Bash tool parameter `timeout: 600000` (ten minutes).
> Never use run_in_background, never arm a Monitor and end your turn. If a file still exceeds ten minutes,
> kill it and rerun alone with `--pool=forks --poolOptions.forks.singleFork=true`, again with
> `timeout: 600000`.

`scene3d-mktick-wedge` (this unit's own) · `scene3d-mark-laws-draw` (**Tier 2, slow**; owns **G4**, which is
`mkDashRamp`'s band-width guard at `:406–436`, **not** `mkTick`'s — say so) ·
`scene3d-mkdashramp-dark-end` (**T4b**) · `scene3d-crosshatch-parity` (**W-36c** — mkTick on crosshatch
inherits the per-family budget, the file most likely to bite) · `scene3d-crosshatch-cell-shape` (W-31) ·
`scene3d-ladder-uniform-field-spacing` · `scene3d-fill-ruling-corners` (W-33) ·
`scene3d-hatch-density-angle-stable` (W-36b) · `scene3d-fill-even-spacing` · `-span-verdict` ·
`-curved-density-floor` · `-curved-density-sparse-end` (**Tier 2**) · `-hatch-density-500` ·
**`scene3d-plot-safety`** (T1b's min-adjacent-mark guard — Rank 1 lengthens ticks in the midtone and so moves
mark midpoints; **a red here is a genuine plot-safety finding, not a bar to re-pin**) ·
`scene3d-ribbon-f1b-streaks`, `-ribbon-wall-coverage`, `-ribbon-f1-amp` (**Tier 2**, lane baseline — if any is
red, reproduce it at the base sha and file it under `## Pre-existing red`, standing rule 5).
Node 20 (`.nvmrc` v20.20.2). A single `[vitest-worker] Timeout calling "onTaskUpdate"` with exit 0, and
`[FillBoolean] polygon union failed on degenerate geometry` on stderr, are pre-existing shared-machine noise.

### 6.4 Evidence cells — every one verified present in the Tier-B manifest

`--only '^(sphere|torus|cone)__(hatch|contour)__mkTick__med__a$'`, **both rigs**, run from MAIN against a
scratch export, out to `docs/3d-audit/fill-audit/after/T2-3b/`, plus
`sphere__hatch__ladder__{low,med,max}__a` and `cone__hatch__ladder__med__a` as the **unchanged ladder
control — a non-identical ladder cell is an immediate REJECT.** Baseline `pathCount` at `42acff7b`, to check
every capture against before believing it: **1112 / 1088 / 403 / 338 / 566 / 645** (create rig, in the cell
order sphere/hatch, sphere/contour, torus/hatch, torus/contour, cone/hatch, cone/contour). At `81925ee8`:
**1146 / 1166 / 440 / 393 / 600 / 713**. At Rank 1: **1045 / 1045 / 416 / 377 / 551 / 646**.
**One port per tree; re-check the port with `lsof` after every shard** (§0).
The five ribbon laws and any imported-mesh primitive are **not** captured and none is named here.

Already taken for this plan, in `docs/3d-audit/lane-reports/T2-3b-plan-evidence/`:
`pre/`, `post/`, `proto/` (uncapped floor), `proto2/` (**Rank 1**) — six cells × both rigs each, with their
`manifest.B.1-1{,.addlayer}.jsonl` · `crops/` (native-resolution three-up sheets, §4.3) · `tools/`
(`band.py`, `sweep.py`, `validate.py`, `sigma.py`, `render.js`, `gate.js`, `mkvariants.py`, `pics.py`, the
Rank-1 diff and full file, and the gate JSONs behind every table above).

### 6.5 Stop conditions — report, do not fudge

1. **If Jay rules (A) in §4.4, `O5`'s bar moves 3.0 → 2.30.** That is a `## Bars changed` entry with the
   §3.4 derivation attached. **Do NOT re-scope O5's population, do NOT lower `LMIN`** (measured: it does not
   buy O5 and costs coverage), and do not ship the bar change without Jay's ruling in the commit body.
2. **If Jay rules (B), the `hatch` regression is the deliverable finding.** Report
   `cone/hatch` create 0.1067 → 0.2378 and `sphere/hatch` 0.1008 → 0.1623 as a new, disclosed defect, and
   flag the 1 % `wedge25` margin. Do not present (B) as "the moiré is fixed".
3. **If `scene3d-plot-safety` or T1b's min-adjacent-mark guard goes red**, stop and report the worst pair in
   pens. It is a plot-safety finding, not a bar to re-pin.
4. **If any byte-identity pair breaks for a law outside `mkTick`**, stop and re-scope. Do not re-pin.
5. **If the runaway-stroke census (§4.3) shows Rank 1 raising the >15 mm path count above pre's 13**, stop and
   file it before shipping.
6. **Any picture that still reads as bands with holes, whatever the numbers say** — crop at native resolution
   and look before claiming anything.
7. **One iteration.** This is the fourth pass at the T2 item; a second rejection converts it to
   MEASURED-with-the-instrument rather than a fifth try.

---

## Bars changed

This plan is read-only and changes nothing. It **proposes** the following; the implementer must restate every
one under its own `## Bars changed`, in the report **and** the commit body.

- `tests/unit/scene3d-mktick-wedge.test.js:269–296` — **POPULATION CHANGE (2 tests removed).** The
  `git show HEAD:` "RED at the pre-fix tree" block is provably vacuous at the sha that ships it
  (`T2-3-review.md` §7; root-caused in §5.1) → replaced by **12 pinned `pathSignature(paths, 4)` goldens** and
  **3 live-source assertions**. Mutation-proved by §5.3's three mutations, counts reported.
- `tests/unit/scene3d-mktick-wedge.test.js` — **NEW BAR, labelled NEW.** `bandC` per cell ≤ the shipped
  `mkDotScreen` reading on the same cell and rig, **plus** no more than +5 % against the `81925ee8` reading on
  any of the 12 combinations. Definition in §1.2, validation in §1.3–1.4, blocking mutation proof in §4.5.
  It gates the **moiré half only**; `wedge25` gates the wedge half and `O5` gates the length half.
- `tests/unit/scene3d-mktick-wedge.test.js` — **`O5 ≥ 3.0` → `≥ 2.30`, ONLY IF JAY RULES (A).** Derivation in
  §3.4: at the period floor the maximum deliverable area fraction is `0.909·L/R`, so an area-correct tick has
  its length *determined* by the tone over the midtone, and the dark-third ÷ light-third length ratio is then
  ≈ 2.3–3.2 by construction. Measured Rank 1 range **2.330–3.221, monotone 12/12**. **This is a LOWERED bar
  and must not be shipped without Jay's ruling quoted in the commit body.**
- `src/core/scene3d/surface-fill.js` — **no shipped constant changes under the recommended option (A).**
  `MK.mkTick.L0` stays **1.16**, `LMIN` stays **0.18**, `P0` stays **1.02**, `MK_TICK_EASE_BLEND` stays
  **0.92**, `MK_ROW_COV`, `MK_PMIN`, `MK_PMAX`, `MK_DARK_AREA`, `MK_LIGHT_AREA`, `MK_BAND_MAX_PASSES`,
  `MK_MIN_ADJ_PEN`, `MK_MAX_WALK_STEPS`, `MIN_MARK_PEN` all **untouched**. Under option (B) only,
  `MK.mkTick.L0` **1.16 → 1.55**, with §4.4's measured before/after on both rigs.
- **No existing numeric bar is widened.** `wedge25`'s mean bars (0.0800 / 0.0950), its per-cell ceilings
  (0.090 / 0.180) and `siteCoverage ≥ 0.90` keep their values **and their populations** and are all met by
  Rank 1 with margin (§4.2).
