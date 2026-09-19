STATUS: PLAN-READY

# T2-5 — plan (USER RULE, P0 round 4, lane `fill-audit-a4`)

**Summary.** Jay's three clauses translate into three measurable quantities on the
`cone/hatch/mkTick/med` cell, and all three are now measured on four trees (`v1.4.1`
`426cc5e4`, `pre-T2-3` `42acff7b`, `T2-3` `81925ee8`, `HEAD`/lane base `b43fa4e3`), both rigs,
all six cells. **(c) "remove any lines not part of a tick band" is the sharpest and it is
`surface-fill.js`'s, not the edge pass's:** every emitted `sceneFill` path on the cone cell is a
`mkTick` mark at every tree (0 stray fill paths), and all 110 `sceneEdge` paths lie on the
silhouette (max 0.31 row pitches off the hull) — but **40 of HEAD's 470 ticks (381.2 mm) are
longer than 2 nominal row pitches**, packed into one slab at the cone's lower-left, because
`solveAt` sizes a tick against the *local* pitch `R` (up to 8.54 mm against a 4.54 mm nominal)
instead of the field's own row pitch. **(b) seam overlap really did increase:** T2-3 raised
`MK.mkTick.L0` 1.02 → 1.16, and tick end-overlap past the row band went 0.0280·R → 0.0800·R max
(2.86×) and 0.0201·R → 0.0536·R mean (2.7×) — the *stagger* adds none of it, `L0` adds all of it.
**(a) "gradually shortening ticks, not fragments"** is the golden-ratio stagger scattering tick
centres: local length roughness P95 0.767·RP and length-vs-tone R² 0.102 on cone/hatch. **Rank 1 —
SUB-TICK RE-TILING (split a band `n = round(R/Rnom)` wide into `n` sub-bands, one tick each of
length `L/n`) — is PROTOTYPED and passes the spike gate**: `over2RP` 40 → **0** on cone/hatch
(and 18 → 0, 67 → 0, 57 → 0 on the other affected cells), ink +0.6 %, `wedge25`/`holeMax` flat,
`bandC` −37 %, roughness −13 %, the shipped per-site **O5 unchanged (2.42 → 2.43)**, and an md5
sweep over **296 (law × mapper) cells, run four times (cone/create, sphere/create, torus/create,
cone/addLayer)**, shows **exactly 3 cells change each time — all `mkTick`** (hatch/crosshatch/contour); `mkDashRamp` is byte-identical at d = 1/5/10/50/220.
Clause (b) needs `L0` 1.16 → 1.05 on top (seam 0.0800 → 0.0250 ✓) which costs O5 (4 of 12 cells fall
below the shipped `O5_BAR = 2.30`) and must be bought back with `MK_TICK_EASE_BLEND`, the lever
T2-3b already documents for exactly this. **T2-4 does NOT fold in** — at d = 220 Rank 1 *worsens*
`wedge25` (0.0891 → 0.1365 on cone/hatch) — and **T2-3e is not measurable with the instruments I
have**; both are reported with numbers rather than claimed. **T3c stays a separate unit**: mkTick
and mkDashRamp share the duty proxy `g` (`surface-fill.js:6514`) as an *input* but consume it in
different `solveAt` branches, and Rank 1 leaves mkDashRamp byte-identical.

---

## 0. Fixtures, rigs and method — read before any number below

### 0.1 Trees measured

| label | sha | what mkTick is there |
|---|---|---|
| `v1.4.1` | `426cc5e4` | the gallery `before` Jay compared against. **`mkTick: { chan:'count', L0:1.02 }`** — fixed-length ticks, COUNT carries tone. This is the design `user-reports/8.png` rejected; it is **not** a target. |
| `pre-T2-3` | `42acff7b` | the tree immediately before `81925ee8`. `MK.mkTick` is **byte-identical to `v1.4.1`'s** (verified by grep; the *file* is not identical — T4, W-36c, F1-placement, W-36d, T4b, F1-erode, T4c, F1-amp landed between). Every T2-5 metric below reads **identically** on `v1.4.1` and `pre-T2-3`, so "pre-T2-3" and "v1.4.1" are interchangeable for this unit's bars. |
| `T2-3` | `81925ee8` | `chan:'len'`, `L0:1.16`, `LMIN:0.18`, + the golden-ratio stagger. |
| `HEAD` | `b43fa4e3` | lane `fill-audit-a4` base = `T2-3` + T2-3b (`Lfloor` area floor) + T2-3c (walk jump cap) + T3 (`markRowCoverage` row floor). What Jay looked at. |

### 0.2 Fixture (stated in full, standing rule 3)

All headless numbers: `BOUNDS = { width:1200, height:1000, m:20, dW:1160, dH:960, penWidth:0.3 }`,
`camera = DEFAULT_CAMERA` (angle key `a`), one directional sun `{ azimuth:135, elevation:45,
intensity:1, castShadows:false }`, **`ground:{enabled:false}`, `backdrop:{enabled:false}` — NO
ground-plane ink in any ink total below**, `styleTable.scene.params = { fillAngle:45,
fillDensity:<d>, toneLaw:'mkTick' }`, mapper per cell, `tone.enabled = true`, one object at
identity transform, `visibility:'solid'`. Default density is **d = 50 ("med")** unless a row says
otherwise; d = 1/5/10/220 rows are labelled.

**Rigs.** `create` = `PRIMITIVE_CREATE_DEFAULTS` over `PRIMITIVE_PARAM_DEFAULTS` — the gallery's and
Jay's. `test` = `PRIMITIVE_PARAM_DEFAULTS` alone — **what every RGR test in this lane constructs.**

⚠ **`test` is NOT the capture harness's `--rig addLayer`.** Proven this unit: MAIN's
`scripts/audit/scene3d-capture.js --root <scratch b43fa4e3> --port 8495`, cone/hatch/mkTick/med/a —
**`--rig create` → pathCount 580, inkMm 2485.7, which my headless `create` fixture reproduces
EXACTLY (470 mark paths, 2349.2 mm + 110 edge paths, 136.5 mm = 580 / 2485.7)**; `--rig addLayer` →
pathCount 410, inkMm 2180.8, while my headless `test` rig gives 452 / 2110.6. The capture's
`addLayer` rig is an `engine.addLayer('scene3d')` tree with the primitive swapped in place (a
different `detail`), not the bare `PRIMITIVE_PARAM_DEFAULTS` bag. **Every "test rig" number below is
the vitest rig, and is not comparable to an `__addlayer` gallery shot.** Port 8495 was free before
and killed after (`lsof -ti:8495` empty).

### 0.3 Instrumentation (read-only, proven geometry-neutral)

Everything is measured in a scratch `git archive` export
(`/private/tmp/claude-501/scratch-T25*`, `node_modules` symlinked from MAIN), driven through
`tests/helpers/load-vectura-runtime.js`'s `scriptOverrides`. **Nothing was written into any
worktree or into MAIN's `src/`/`tests/`.** The instrumentation adds, to `surface-fill.js`:
a per-mark record in `layMark` (`shape, k, a, I, R, P, L, cOff, lineIndex, nPoly, band`, plus the
mark's own local across-row extent `[v0,v1]` and its drawn screen polyline), a caller-line stamp on
every `pushRun`, and — for `426cc5e4`/`42acff7b` only — a **backport of T2-3's `mkStat.tickField`
publisher and `tickSites`**, so the rasterised wedge oracle can be run on trees that predate it
(measurement-only; disclosed). To `scene3d.js` it adds a caller-line stamp on `emitRuns`'s
`baseMeta`. **Proof of neutrality: `md5(paths)` is identical with and without instrumentation on
every tree** (`v1.4.1` `79996296a4`, `T2-3` `dcb7c5cd52`, `HEAD` `e6520d61d5` — cone/hatch/create).

Helper code (`scene3d-mktick-wedge.js` → `wedge25`/`holeMax`/`siteCoverage`/`lengthCarriesTone`;
`scene3d-mktick-band.js` → `bandC`) is taken from **HEAD's** copy for all four trees, so the four
readings are comparable. Scripts are copied into
`docs/3d-audit/lane-reports/T2-5-plan-evidence/scripts/`.

### 0.4 Sweep breadth (standing rule 2)

`MAPPERS` (8, `src/core/scene3d/params.js`) × `SCENE3D_TONE_LAWS.PRODUCTION` (**37**) = **296 cells**,
run **four times** (cone/create, sphere/create, torus/create, cone/`test`) as an md5 identity sweep
against the Rank-1 prototype: **3 of 296 cells change in every run, always `mkTick/hatch`,
`mkTick/crosshatch`, `mkTick/contour` — 1.0 % of the roster.** The per-oracle tables below cover the six gallery cells
(`{sphere,torus,cone} × {hatch,contour}`) × both rigs = 12 fixtures; `crosshatch` is *not* one of the
six but *is* affected, so **the implementer must add `cone__crosshatch__mkTick__med__a` to the
evidence set** (confirmed present in `docs/3d-audit/fill-audit/manifest.B.2-5.jsonl` — it is shard **2/5**, so do not
capture it with `--shard 1/1` and assume it was scanned out).

---

## 1. TRANSLATION — Jay's three clauses on the cone/hatch cell

**Annotated, native resolution (627×749, the gallery's own size):**
`docs/3d-audit/lane-reports/T2-5-plan-evidence/T2-5-annotated-cone-hatch-HEAD-create.png`
(and the Rank-1 counterpart `…-RANK1-create.png`). Colour key:

| colour | what it marks | count on HEAD/create |
|---|---|---|
| **RED** | a `mkTick` mark whose drawn length > **2 × the cell's nominal row pitch** (`tickField.rowPitch`) | **40 paths, 381.2 mm** |
| **ORANGE** | a `mkTick` mark that is both **short** (< 0.5 RP) and **hard-staggered** (\|cOff\|/room > 0.5) | 31 paths |
| **CYAN dots** | `wedge25` bare pixels (shaded, non-highlight, ≥ 0.25 RP from any ink) | 2 773 px (64.5 mm² in one connected web) |
| **GREEN** | `sceneEdge` paths (the structural edge pass) | 110 paths, 136.5 mm |
| white | every other `mkTick` mark | 399 paths |

The picture answers each clause directly:

**(1) "tick fragments on the right."** The ORANGE marks are **all on the right-hand flank**, in the
transition between the lit right edge and the mid-tone — exactly where Jay points. They are short
ticks whose centre the T2-3 stagger threw to a random depth inside the row band, so consecutive
ticks in one row no longer line up into a wave front; they read as scatter. Native crop:
`gallery_after_T2-3c_crop_x4_right-fragments.png`.

**(2) "the black gaps at the bottom of the vertical waves."** The "vertical waves" are the near-vertical
columns of abutted ticks (the ticks are perpendicular to the ruling; at `fillAngle 45` on this cone
they read as steep columns). A wave's lower edge is where the length ramp has shortened the ticks
enough that the column stops; below it sits the bare across-row strip of `(R − L)`. Jay is asking
for that strip to be **closed by a graded run of progressively shorter ticks**, not by scattered
fragments and not left bare. Measured, the bare area is **not** concentrated in the highlight: the
median tone of a `wedge25` bare pixel on cone/hatch/create is **I = 0.000** (p90 = 0.865), i.e. the
biggest bare web sits where the light asks for ink.

**(3) "any lines not part of a tick band."** The RED slab. 40 ticks, each 2.0–2.18 row pitches long,
packed contiguously at the cone's lower-left, where they merge into unbroken ruled lines that cross
several tick rows. Native before/after crop at 4×:
`crop_slabzoom_HEAD_vs_RANK1_x4.png` — on the left (HEAD) the strokes are continuous ruled lines;
on the right (Rank 1) the same region is a tick texture with visible seams.
`gallery_after_T2-3c_crop_x5_overlong-line.png` shows one of them in Jay's own shot, crossing the
tick field at the "A"-crossbar near (466,404)–(510,407).

---

## 2. THE THREE ORACLES

All three read the same population: **every `mkTick` mark actually emitted** (the mark record, one
entry per emitted pass), on the 12 fixtures, at d = 50 unless stated. `RP` = `lastMarkStats.tickField.rowPitch`
(= `masterPitch / markRowCoverage()`), 4.42–4.54 mm on these cells.

### O-A — GAP-FILL BY GRADUAL SHORTENING (clause 1 + 2 of Jay's sentence)

Three sub-bars; **A2 is the one that is RED today**.

- **A1 `roughP95`** — P95 of `|Ld − median(Ld of ticks whose centre is within 2·RP)| / RP`. This is
  literally "bounded step between neighbours". **Bar: ≤ pre-T2-3's per-cell value AND ≤ 0.60.**
- **A2 `lenToneR2n`** — R² of `Ld/RP` regressed on `(1 − I)` over all ticks. "Length is graded by
  tone, not by a hash." **Bar: ≥ 0.45 on every hatch cell** (contour cells already sit at 0.60–0.75
  because the contour mapper's rows follow the isophotes).
- **A3** `wedge25` and `holeMax` **must not regress** per cell (this is T2-3's own bar; it is what
  stopped the two earlier rejections and must not be traded away for A1/A2).

| create rig, d=50 | v1.4.1 / pre-T2-3 | T2-3 | HEAD | bar |
|---|---|---|---|---|
| cone/hatch roughP95 | 0.804 | 0.798 | **0.767** | ≤0.60 → **RED** |
| cone/hatch R²ₙ | 0.001 | 0.191 | **0.102** | ≥0.45 → **RED** |
| sphere/hatch roughP95 / R²ₙ | 0.557 / 0.011 | 0.572 / 0.167 | 0.594 / 0.159 | RED on R²ₙ |
| torus/hatch roughP95 / R²ₙ | 0.359 / 0.018 | 0.350 / 0.048 | 0.359 / 0.317 | RED on R²ₙ |
| cone/contour R²ₙ | 0.000 | 0.815 | 0.602 | pass |
| test rig cone/hatch roughP95 / R²ₙ | 0.957 / 0.000 | 0.974 / 0.189 | 0.982 / 0.100 | RED on both |

Supporting, reported not gated: `fragFrac035` (share of ticks under 0.35 RP) 0.000 → 0.096 → 0.040
(cone/hatch create); anchor scatter `mean|cOff|/R` 0.000 → 0.042 → 0.029, `max` 0.380/0.372.

### O-B — SEAM OVERLAP (clause "don't increase overlap at the seams")

**Definition.** A tick owns the band `[−band/2, +band/2]` across its row (`band = R`, or the
sub-band `R/n` once a mark is re-tiled). Its overlap past its own band is
`ov = max(0, max(−v0, v1) − band/2) / band`, taken from the mark's **own local across-row extent
`[v0, v1]` as built in `layMark`** (so it is exact, not inferred). **Bar: per-cell `ovMax` and
`ovMean` ≤ the pre-T2-3 reading.**

| | v1.4.1 | pre-T2-3 | T2-3 | HEAD | bar |
|---|---|---|---|---|---|
| `ovMax` (identical on all 12 fixtures) | **0.0280** | **0.0280** | 0.0800 | **0.0800** | ≤0.0280 → **RED (2.86×)** |
| `ovMean`, cone/hatch create | 0.0201 | 0.0201 | 0.0440 | **0.0536** | ≤0.0201 → **RED (2.67×)** |
| `ovMean`, sphere/hatch create | 0.0208 | 0.0208 | 0.0470 | 0.0546 | RED |
| `ovFrac` (share of ticks that cross) | 1.000 | 1.000 | 0.614 | 0.706 | — reported |

**The stagger contributes ZERO to this.** `room = 0.5·(R − L)` and `cOff ∈ [−room, +room]`, so a
staggered tick is *contained* in its band by construction; `ovMax` is exactly `(L0 − 1)/2` and
nothing else. **T2-3's `L0` 1.02 → 1.16 is the whole of the regression.** (`ovMax` = 0.0280 rather
than 0.0100 at `L0 = 1.02` because `countChan`'s `if (P <= PMIN) L = min(g·P, capOf(P))` re-raise can
put `L/R` up to 1.056.)

Secondary, reported: cross-row **end contact** (a tick tip within `max(1·pen, 0.06·RP)` of a tip in
another row) went the *other* way — 0.649 → 0.239 → 0.247 on cone/hatch create — because at
`L0 = 1.02` every tick tip landed on the same seam line. Report both; gate `ov`.

### O-C — PURITY: every emitted path is a tick belonging to a band

Two counts, both **RED if > 0** at d = 50; non-regression (≤ HEAD) at d = 1/220.

- **C1 non-mark fill paths.** Emitted `sceneFill` paths that are not a `mkTick` mark run.
- **C2 over-long ticks `over2RP`.** Emitted mark paths with drawn length > **2 × RP** — a stroke that
  crosses two whole rows cannot read as "part of a tick band" whatever the solve intended.

**C1 attribution table (the coordinator's ask), cone/hatch, both rigs, all trees:**

| class | emitter (file:line at `b43fa4e3`) | create | addLayer(test) | changed by T2-5? |
|---|---|---|---|---|
| `mkTick` mark | `surface-fill.js:6441` (`place`→`pushRun`), via `scene3d.js:4648` `emitRuns` | v1.4.1 456 / 2386.6 mm · T2-3 490 / 2279.0 · HEAD **470 / 2349.2** | 370 / 2003.1 · 396 / 1911.8 · **379 / 1980.4** | YES — this unit |
| other `surface-fill` fill pass (ruling `:8138`, scribble `:6772`, shadow-extra `:11258`) | — | **0 / 0 mm at every tree** | **0 / 0** | n/a |
| `sceneEdge` structural edge pass | `scene3d.js:5222` `emitRuns`, `baseMeta` built at `:5167` | **110 / 136.5 mm, identical at all four trees** | **73 / 130.1, identical** | **NO — see below** |
| erode-fallback centreline / T3 row floor | — | **no path of either class is emitted on this cell**; T3's `markRowCoverage()` (`:2678`) returns `MK_ROW_COV` for mkTick (`law.rowFloor` is undefined) so the row scaffold is unchanged | — | n/a |

**Are the `sceneEdge` lines strays?** No. Measured distance of each `sceneEdge` path's midpoint from
the convex hull of the tick field, in row pitches: cone/hatch create median 0.010, p95 0.164, **max
0.174**; cone/contour max 0.259; addLayer max 0.306; sphere max 0.029. **Zero interior edge paths on
the cone and the sphere.** (Torus reports 46 "interior" paths — those are the inner rim, which a
convex hull cannot see; not a stray either.) **So no part of clause (c) belongs to the edge pass, and
nothing is handed to lane `border-4` / W-32 Rank 4.** T2-5 keeps the whole clause. The plan states
the split explicitly so the next reader does not have to re-derive it: *`scene3d.js`'s edge pass at
`:5167`–`:5223` is border-4's; it is byte-identical across all four trees on this cell and draws only
the silhouette and base rim.*

The only non-mark `sceneFill` paths anywhere in the 12 fixtures are on the **torus** (create/hatch 5
paths / 17.3 mm at HEAD). Verified by nearest-tip matching: each is a **HLR-clipped mark**
(`nearestMarkTipDist = 0.000`, length marginally shorter than the mark it came from) — a tick, cut
by self-occlusion, not a stray. **C1 = 0 everywhere.**

**C2 `over2RP` — the live defect** (count, and total mm):

| create rig | v1.4.1 | pre-T2-3 | T2-3 | HEAD | maxLd/RP at HEAD |
|---|---|---|---|---|---|
| sphere/hatch | 4 (132.3) | 4 (132.3) | 6 (171.0) | **0** | 1.95 |
| sphere/contour | 0 | 0 | 0 | **0** | 1.58 |
| torus/hatch | 6 (74.1) | 6 (74.1) | 5 (56.7) | **0** | 1.92 |
| torus/contour | 16 (160.7) | 16 (160.7) | 16 (157.9) | **18 (180.0)** | 2.35 |
| cone/hatch | 1 (33.9) | 1 (33.9) | 32 (303.2) | **40 (381.2)** | 2.18 |
| cone/contour | 1 (23.8) | 1 (23.8) | 0 | **0** | 1.17 |

| test rig | v1.4.1 | pre-T2-3 | T2-3 | HEAD |
|---|---|---|---|---|
| sphere/hatch · sphere/contour | 2 (52.9) · 2 (76.5) | same | 2 (68.2) · 1 (20.2) | **0 · 0** |
| torus/hatch · torus/contour | 3 (43.6) · 70 (742.1) | same | 3 (40.3) · 61 (672.7) | **0 · 67 (744.6)** |
| cone/hatch · cone/contour | 19 (191.8) · 1 (22.9) | same | 45 (428.2) · 0 | **57 (545.2) · 0** |

T2-3c did real work here — it removed the *extreme* outliers (cone/hatch `maxLd` 33.87 mm = 7.46 RP →
9.90 mm = 2.18 RP) — but its bar was an absolute 15 mm, and **the 2-row-long population it left
behind grew: 1 → 32 → 40 on cone/hatch create, 19 → 45 → 57 on addLayer.** That is what Jay is looking at.

---

## 3. ROOT CAUSE (file:line at `b43fa4e3` = `/private/tmp/claude-501/scratch-T25/src/core/scene3d/surface-fill.js`)

**3.1 Why the stagger makes fragments instead of graded ticks.**

```
6699  if (law.shape === 'tick') {
6700    const room = 0.5 * Math.max(0, sv.R - sv.L);
6702      const idx = a / Math.max(1e-6, sv.P);
6703      const uu = ((idx * 0.6180339887498949) % 1 + 1) % 1;
6704      const cOff = room * (2 * uu - 1);
6705      polys = polys.map((pl) => pl.map((pt) => [pt[0], pt[1] + cOff]));
```

`a` is the mark's **arc position along its own ruling** and `P` its period, so `idx` advances by ~1
per mark and `uu` is a golden-ratio *hash*: successive ticks in one row get offsets that jump
±room with no spatial correlation, and ticks in **adjacent rows** at the same `a` get unrelated
offsets because their `P` and phase differ. The stagger therefore does exactly what it was designed
to do — it tiles the row cell so no bare strip survives on the row line — and exactly what Jay is
objecting to: **it decorrelates neighbouring ticks, so the field carries no gradient in *position*,
only in *length*, and the length itself is only weakly tied to tone (`R²ₙ = 0.10`).** What Jay asks
for is the opposite decomposition: ticks **anchored** to their band (position a smooth function of
where the band is) with **length graded along the tone gradient** (a smooth function of `I`).

Two secondary contributors to the "fragment" read, both measured:
`MIN_MARK_MM` (`:5690`, used at `:6434`) drops a mark whose total drawn ink is under 2 pen widths —
**49 drops on cone/hatch create at HEAD vs 14 at pre-T2-3** — so the shortening ramp does not fade
out, it stops; and `MK_MIN_ADJ_PEN` (`dupStub`) removes 0–9 more per cell.

**3.2 Why the over-long lines exist (clause c).**

```
6513  const R = clamp(((Number.isFinite(lp) && lp > 1e-6) ? lp : masterPitch) / markRowCoverage(), 0.25, 40);
...
6605  const Lease = (law.LMIN || 0) * R + (law.L0 - (law.LMIN || 0)) * R * eased;
6606  const Lfloor = g * PMIN;
6607  L = Math.min(law.L0 * R, Math.pow(Math.pow(Lease, 4) + Math.pow(Lfloor, 4), 1 / 4));
```

`lp` is the **per-sample local pitch**, and on a foreshortened patch it is a projection outlier, not a
real widening of the family. Measured on cone/hatch create at d = 50: **`max R` = 8.54 mm against a
nominal `RP` = 4.54 mm (1.88×)**; on torus/contour addLayer `max R` = 10.99 vs 4.52 (2.43×). Since the
tick's length ceiling is `L0 · R`, a tick in that patch is legitimately allowed to be 1.16 × 8.54 =
9.9 mm — **2.18 row pitches**, i.e. a line crossing two rows. That is the RED slab, and it is the
same class of fault `solveAt` already fixes **for the dash band two lines earlier**:

```
6553  const bandPitch = Math.min(truePitch, masterPitch);   // "lp can read 8.78 against a 5.82 nominal
6554  const bandN = ...                                     //  — a foreshortening/projection outlier"
```

The tick branch never got that treatment. **But simply clamping `L` against the nominal is wrong**
(prototyped, P2/P6): the band really *is* wider there, so a shortened tick no longer abuts and the
lost ink prints as a tone band — ink −16.5 %, `bandC` 0.0892 → **0.3804** (4.3×), O5 2.42 → 1.74.
The band must be **re-tiled**, not truncated. That is Rank 1.

**3.3 Why the seam overlap rose.** `MK.mkTick` at `:2648` — `L0: 1.16`, raised from 1.02 by T2-3 with
the stated reason *"the stagger spends part of the dark-anchor's abutment"*. `ovMax = (L0 − 1)/2`
exactly. Nothing else in the tick path contributes.

**3.4 A residual T2-3c misses, found while prototyping.** At d = 220 the surviving over-long ticks
are a *different* mechanism: `R` is clamped at its **lower** bound 0.25 mm, the solve asks for
`L = 0.26 mm`, and the walk draws a **2-point, 4.09 mm** path (15.7× the ask). `MK_TICK_STEP_CAP_MM`
(`:6194`) = `12 × MK_ARC_PEN × penWidth` = **4.32 mm** — an absolute cap, so a 4.09 mm step passes.
The cap needs a term relative to the mark's own `askLen`.

---

## 4. RANKED MECHANISMS — Rank 1 prototyped and spike-gated

### Rank 1 (PROTOTYPED) — **sub-tick re-tiling** of an over-wide band, + `L0` back to ~1.05

In `layMark`'s tick block, replace the single centred-and-staggered tick with `n` ticks tiling the
band:

```js
const nSub = clamp(Math.round(sv.R / (masterPitch / markRowCoverage())), 1, 6);
const sub  = sv.R / nSub;          // sub-band width
const each = sv.L / nSub;          // sub-tick length
// one tick per sub-band, centred at (j - (nSub-1)/2)*sub, offset inside its own sub-band
```

**Why it is exactly neutral on tone.** A tick contributes area `L·w/(R·P)`. Splitting `L` into `n`
passes at `n` positions inside the same cell leaves `Σlength = L`, `R` and `P` untouched, so
`mkAsk(I)` is delivered unchanged; and the fill ratio inside a sub-band, `(L/n)/(R/n) = L/R`, is the
same as before, so the abutment-to-solid behaviour and the `room` available for the offset are
identical. It is a pure re-tiling — which is why O5 (per *site*) does not move.

**Spike gate — cone/hatch, create rig, d = 50, Fixture as §0.2** (`P7` = re-tiling only, `L0` kept at
1.16; `P14` = re-tiling + `L0` 1.05):

| metric | HEAD | **P7** | **P14** | verdict |
|---|---|---|---|---|
| `over2RP` (O-C2) | 40 (381.2 mm) | **0** | **0** | ✅ clause (c) |
| `maxLd / RP` | 2.18 | 1.73 | 1.57 | ✅ |
| `ovMax` / `ovMean` (O-B) | 0.0800 / 0.0536 | 0.0800 / 0.0532 | **0.0250 / 0.0172** | ✅ only with `L0` |
| `roughP95` (O-A1) | 0.767 | 0.669 | **0.606** (−21 %) | ⚠ still > 0.60 bar |
| `lenToneR2n` (O-A2) | 0.102 | 0.183 | 0.134 | ❌ still ≪ 0.45 |
| `wedge25` (O-A3) | 0.0605 | 0.0608 | 0.0613 | ✅ flat |
| `holeMax` | 1.038 | 1.038 | 1.038 | ✅ flat |
| `siteCoverage` | 0.9882 | — | 0.9892 | ✅ (bar > 0.90) |
| `bandC` | 0.0892 | 0.0562 | **0.0577** (−35 %) | ✅ |
| **O5 (shipped, per-site)** | 2.4153 | **2.43** | 2.2339 | ✅ P7 · ❌ P14 (bar 2.30) |
| ink (mm, no ground) | 2485.7 | 2501.2 (+0.6 %) | 2503.5 (+0.7 %) | ✅ |
| **pen-downs** | 470 | 637 (+36 %) | **683 (+45 %)** | ⚠ disclose |
| `fragFrac035` | 0.040 | 0.113 | 0.111 | ⚠ more short passes by design |

**All twelve fixtures, the bars that already exist in `tests/unit/scene3d-mktick-wedge.test.js`:**

| bar (file:line) | HEAD | P7 | P14 |
|---|---|---|---|
| `O5_BAR = 2.30`, every cell both rigs (`:374`, `:398`) | pass (min 2.35) | **pass (min 2.35)** | **FAIL on 4/12** — sphere/contour create 2.224, cone/hatch create 2.234, sphere/contour test 2.194, torus/hatch test 2.222 |
| six-cell mean `wedge25` ≤ {test 0.0800, create 0.0950} (`:191`, `:428`) | 0.0756 / 0.0887 | 0.0755 / 0.0888 | 0.0758 / 0.0890 → pass |
| per-cell `wedge25` ≤ {test 0.090, create 0.180} (`:192`, `:433`) | max 0.0874 / 0.1732 | same | 0.0874 / 0.1732 → pass |
| `siteCoverage > 0.90`, every cell (`:443`) | ≥0.977 | — | ≥0.975 → pass |
| `bandC ≤ mkDotScreen` and ≤ 1.05 × pre-Rank-1, on sphere/contour + cone/contour (`scene3d-mktick-banding.test.js:340,346`) | — | `bandC` unchanged on those two cells (nSub = 1 there) | falls: 0.0515→0.0286, 0.0258→0.0160 → pass |

**Ruling for the implementer:** ship the re-tiling **and** the `L0` reduction, and buy O5 back with
`MK_TICK_EASE_BLEND` (`:2512`, currently 0.92) — the lever T2-3b's own comment says is "free to be
chosen on that bar alone". **Do NOT lower `O5_BAR`.** If O5 ≥ 2.30 on all twelve cannot be reached
honestly at `L0 = 1.05`, ship the re-tiling alone (clause c + partial a), report clause (b) as
MEASURED-not-fixed with the `L0`/O5 trade table, and let Jay choose — `L0 = 1.06` gives
`ovMax = 0.0300` (still > 0.0280) and `L0 = 1.02` gives 0.0100 with O5 down to 2.19.

**Rank 1 fallout that must be disclosed, not hidden:**

- **Pen-downs +36 %…+45 %** at d = 50 and **+54 %** at d = 220 (cone/hatch create 1558 → 2393). A
  plotter cost. Bound it: the implementer must report `pens` per cell per rig and, if it exceeds
  +50 % at d = 50, cap `nSub` lower (3 instead of 6) and re-measure.
- **At d = 220 the bare-area metrics get WORSE**: cone/hatch create `wedge25` 0.0891 → 0.1365,
  `holeMax` 3.203 → 6.165, `siteCoverage` 0.8754 → 0.8661, `tooShort` 713 → 781. See §5.
- **`over2RP` is not 0 at d = 220 on the sphere** (5 → 7 create). Cause identified in §3.4 — a
  different mechanism. Fixing it is a one-line extension of T2-3c's cap
  (`min(MK_TICK_STEP_CAP_MM, k · askLen)`); it is in scope for T2-5 because it is the same clause,
  and it is the only way C2 reaches 0 at max density.

### Rank 2 (NOT prototyped) — replace the golden-ratio hash with a **smooth** offset field

Keep the re-tiling; replace `cOff = room · (2·uu − 1)` with a low-frequency continuous function of
screen position (or of `a` and the row index), so neighbouring ticks share an offset and a row's
ticks form a wave front. **The two endpoints of this axis ARE measured:** a *constant* anchor
(`cOff = +room`, prototypes P1/P8) costs `wedge25` +8 % on cone/hatch create (0.0605 → 0.0655) and
+15 % on sphere/hatch (0.0544 → 0.0624) because it re-opens the one-sided wedge T2/T2-2 were
rejected for; the *hash* (today) costs `R²ₙ`. A smooth field should sit between them and is the only
candidate that can move **O-A2** without re-opening **O-A3**. Prototype it as a second spike if Rank 1
alone leaves `lenToneR2n` under 0.45.

### Rank 3 (NOT prototyped) — gradient-following anchor

`cOff = room · sign(dI/dv)`, i.e. always abut the *darker* neighbour so the bare strip always sits
on the light side ("the only gaps allowed are where the highlights are"). Two extra `sampleAt`
probes per mark. Risk: a visible seam where the gradient sign flips (the terminator). Prototype
scaffolding for it is already in `scripts/proto.js` (`anchor:'grad'`).

### Rank 4 (REJECTED, measured) — clamp `L` against the nominal row pitch

P2/P6 above: `over2RP` → 0, but ink −16.5 %, `bandC` ×4.3, O5 → 1.74, `wedge25` +32 %. Recorded so
nobody tries it again.

### Rank 5 (REJECTED, measured) — "fill then spill" (whole band-widths as full passes, remainder alongside)

P15: `ovMax` → 0 by construction, but pen-downs **470 → 1029 (+119 %)**, ink −5.4 % (the short
remainders fall under `MIN_MARK_MM`), `fragFrac035` 0.04 → 0.48, O5-per-path 2.42 → 1.14.

---

## 5. T2-3e and T2-4 — do they fold in?

**T2-4 (d = 220 mkTick coverage collapse): NO, and Rank 1 makes the metric worse.** Measured, d = 220,
HEAD → Rank 1 (P14):

| d=220 create | `siteCoverage` | `wedge25` | `holeMax` | `over2RP` | `pens` | `tooShort` |
|---|---|---|---|---|---|---|
| cone/hatch | 0.8754 → 0.8661 | 0.0891 → **0.1365** | 3.203 → **6.165** | **241 → 0** | 1558 → 2393 | 713 → 781 |
| sphere/hatch | 0.8745 → 0.8663 | 0.0872 → 0.1135 | 7.580 → 7.602 | 5 → 7 | 3054 → 4538 | 1433 → 1572 |
| torus/contour | 0.8182 → 0.8118 | 0.0998 → 0.1108 | 4.221 → 4.253 | **103 → 4** | 776 → 1181 | 437 → 477 |

Rank 1 fixes clause (c) at max density but does **not** address T2-4; it trades a little coverage for
it. The standing question STILL-OPEN asks early is answered on the numbers: the coverage loss runs
through `MIN_MARK_MM` (`tooShort` +9.5 %), so **raising the effective floor is exactly the
plottability trade STILL-OPEN warns about.** T2-4 stays its own item, and T2-5's stop condition
must include a d = 220 non-regression clause (below).

**T2-3e (white-block row lattice): NOT PROVEN EITHER WAY.** The reviewer's instrument (narrow-strip
FFT, period ≈40/47 px, row-mean σ 17.66/16.80) is not in the repo, and my own strip profile on
627 px renders is dominated by the tone ramp (dominant period = the strip length; HEAD σ 28.34 vs
Rank 1 28.85 on a mid-left strip, 22.49 vs 22.26 on a right strip — within noise and not measuring
the lattice). **Report: T2-5's Rank 1 is not shown to remove T2-3e.** The directional-banding proxy
that *is* in the repo (`bandC`) improves: cone/hatch create 0.0892 → 0.0577, sphere/hatch
0.0797 → 0.0549, sphere/contour 0.0515 → 0.0286, cone/contour 0.0258 → 0.0160. The implementer must
either port the reviewer's strip instrument into `tests/helpers/` or say T2-3e is untouched.

---

## 6. T3c and the duty proxy — INDEPENDENT code paths, T3c stays separate

**They share an input, not an expression.**

- The shared quantity is **`g` at `surface-fill.js:6514`**: `const g = clamp((mkAsk(I) * R) / w, 0, 26);`
  — the ink-area ask per unit period, computed once in `solveAt` for every mark law.
- **mkDashRamp** (`MK.mkDashRamp`, `:2627`, `chan:'elong'`) takes neither the `countChan` nor the
  `lenChan` branch. It lands in the final `else`, `:6609–6611`:
  `P = clamp(law.P0 * R, PMIN, MK_PMAX); L = Math.min(g * P, capOf(P));` — so its **dash length IS
  `g·P` and its duty `L/P` IS `g`**. That is T3c's quantity.
- **mkTick** (`chan:'len'`, `:6561–6608`) derives `L` from the **ease curve on `I`**
  (`Lease`, `:6605`) and uses `g` only through the area floor `Lfloor = g·PMIN` (`:6606`) and to
  **re-derive the period** `P = L/g` (`:6608`). `g` never sets a tick's length.

**Consequence, measured.** Rank 1 touches `MK.mkTick.L0` and the `law.shape === 'tick'` block only,
and **mkDashRamp is byte-identical**: `md5(paths)` matches at d = 1, 5, 10, 50 and 220 on both rigs
(cone/hatch) — `dd7cdac577`, `b11d4c7057`, `da96dd3fc6`, `91b63645be`, `aeaf265495` (create) and the
addLayer set, HEAD ≡ Rank 1 at every one. **So T3c does not collapse into T2-5; it stays a separate
unit on the `else` branch.**

**The rule the two units must both respect, and this plan states once:** *neither unit may change
`g` (`:6514`), `mkAsk` (`:2405`) or `R` (`:6513`).* Those are the shared inputs; a change there moves
all twelve mark laws at once. T3c changes `:6609–6611` and/or `MK.mkDashRamp.P0`; T2-5 changes
`MK.mkTick.L0` and `layMark`'s tick block. If T3c finds it must change `g`, the two units merge and
this plan's gate table becomes the merged unit's.

**T3c's oracle is in T2-5's gate table as a NON-REGRESSION guard** (must be unchanged, not improved).
Measured today on cone/hatch, create rig — and it confirms T3b-review's finding:

| mkDashRamp, create | d=1 | d=5 | d=10 | d=50 | d=220 |
|---|---|---|---|---|---|
| dashes per row | 19.20 | 23.00 | 24.86 | 13.86 | 15.83 |
| duty `Ld/P` | 0.946 | 0.946 | 0.937 | 0.958 | 0.991 |
| dash length / row pitch `Ld/R` | 1.182 | 1.183 | 1.172 | 1.198 | 1.238 |
| HEAD ≡ Rank 1 | **yes** | **yes** | **yes** | **yes** | **yes** |

(A duty of 0.94–0.99 at every density is T3c's defect, independently reproduced here: the dash
covers essentially the whole period, so "discrete dashes riding rulings" is not what prints.)

---

## 7. Files ALLOWED and FORBIDDEN

**Lane `fill-audit-a4` owns `src/core/scene3d/surface-fill.js`** (AGENT-PROTOCOL serialization table).

ALLOWED to edit:
- `surface-fill.js` **`MK.mkTick`** (`:2648`) — `L0` only.
- `surface-fill.js` **`layMark`'s `law.shape === 'tick'` block** (`:6699–6707`) — the re-tiling and
  the offset.
- `surface-fill.js` **`mkShape`'s `'tick'` branch** (`:2784–2793`) if the re-tiling is better placed
  there (it needs `Rnom`, which `mkShape` does not currently receive — passing it is allowed).
- `surface-fill.js` **`MK_TICK_JUMP_PEN` / `MK_TICK_STEP_CAP_MM`** (`:2481`, `:6194`) and the guard at
  `:6267` — only to add the `askLen`-relative term of §3.4.
- `surface-fill.js` **`MK_TICK_EASE_BLEND`** (`:2512`) — to recover O5, with the before/after O5 table.
- `tests/unit/scene3d-mktick-*.test.js`, `tests/helpers/scene3d-mktick-*.js`, and a NEW oracle file
  for O-A/O-B/O-C.

FORBIDDEN:
- **`markRowCoverage()` (`:2678`) / `MK_ROW_COV` (`:2397`) — READ ONLY.** T3's.
- **`solveAt`'s `else`/elong branch (`:6609–6611`) and `MK.mkDashRamp` (`:2627`) — T3b's / T3c's.**
- **`g` (`:6514`), `mkAsk` (`:2405`), `R` (`:6513`)** — the shared duty proxy and its inputs (§6).
- **`Lfloor` (`:6606`)** — T2-3b's area floor. Keep it; do not re-tune it.
- The crosshatch family cap — **W-36f's**.
- `scene3d.js` (the edge pass at `:5167–:5223` is **border-4 / W-32 Rank 4**), `hlr.js`,
  `shadows.js`, `surface-fill-mono.js`, `mappers.js`.
- `git push`, merge, tag, version bump.

---

## 8. Guards, evidence and stop conditions

### 8.1 RED first (from a scratch export of the base sha, never in-worktree)

A new file `tests/unit/scene3d-mktick-band-purity.test.js` with, **per cell, per rig**:

1. **O-C2** `over2RP === 0` at d = 50 — RED at `b43fa4e3` on cone/hatch (40 create / 57 test) and
   torus/contour (18 / 67), green after. **Mutation-kill: revert the re-tiling to a single centred
   tick and the count must return to ≥ 40.**
2. **O-C1** every emitted `sceneFill` path is a mark run or a strict sub-polyline of one — green at
   base (it is an existence rule that must not be broken), with a **synthetic mutation** (inject one
   ruling pass) proving it is not vacuous.
3. **O-B** `ovMax ≤ 0.0280` and per-cell `ovMean ≤ pre-T2-3` — RED at base (0.0800 / 0.0536).
   **Mutation-kill: `L0` back to 1.16 must trip it.** State clearly that this gates the *seam* half
   of Jay's sentence and nothing else — it says nothing about O-A or O-C.
4. **O-A1/A2** `roughP95` and `lenToneR2n` — RED at base. If Rank 1 alone cannot reach the A2 bar,
   **ship A2 as MEASURED with the number, do not weaken the bar** (Rank 2 owns it).

Per standing rule 1, each test names **which clause of Jay's three-clause rule it gates and which it
does not**, and carries a mutation that trips the clause it claims.

### 8.2 Guards that must stay green (run one file per command, foreground, `timeout: 600000`)

`tests/unit/scene3d-mktick-wedge.test.js` (the 12 `pathSignature` goldens **WILL all change** — re-pin
WITH the before/after numbers in the commit body; `O5_BAR 2.30`, the `wedge25` mean/ceiling bars and
`siteCoverage > 0.90` must **pass unchanged**) · `tests/unit/scene3d-mktick-banding.test.js` ·
`tests/unit/scene3d-mktick-runaway.test.js` (its `PRE_T23B` per-cell longest/count15 table is a
different metric from O-C2 and must still pass) · `tests/unit/scene3d-mark-laws-draw.test.js` (30/30 —
T1/T1b/T4's oracle) · `tests/unit/scene3d-mkdashramp-low-end.test.js` (T3's) ·
`tests/unit/scene3d-style-fill-lines.test.js` · `tests/unit/scene3d-ladder-uniform-field-spacing.test.js` ·
`tests/integration/scene3d-fill-style-picker.test.js` (Tier 2, slow) ·
`tests/unit/scene3d-tone-law-collapse.test.js` (**Tier 1 — start it with
`--pool=forks --poolOptions.forks.singleFork=true` and `timeout: 600000`, let the tool background it
at the 600 s ceiling, carry on, and read the result from the completion notification**).

### 8.3 Evidence required

- Captures from MAIN's `scripts/audit/scene3d-capture.js --root <worktree> --port ≥8495`, **both
  `--rig create` and `--rig addLayer`**, `--out docs/3d-audit/fill-audit/after/T2-5`, for
  `^(sphere|torus|cone)__(hatch|contour|crosshatch)__mkTick__med__a$` **plus `cone__hatch__mkTick__(low|max)__a`**
  (d = 220 is where the trade sits). Kill the port after.
- **Native-resolution crops of the two defect regions before/after** (the lower-left slab and the
  right-hand fragment field) — the whole 627 px cell hides both.
- The md5 roster sweep re-run against the shipped tree: **coverage stated as a fraction of
  8 × 37 = 296 cells**, on all three primitives, with every changed cell named.
- `report.json` restating the full fixture of §0.2 **including "ground-plane ink: excluded"** and
  which rig each number came from.

### 8.4 Stop conditions

- **STOP and report MEASURED** if O-A2 (`lenToneR2n ≥ 0.45`) cannot be reached without regressing
  `wedge25`/`holeMax` on any cell. Rank 2 owns it; do not widen a bar to close it.
- **STOP** if pen-downs rise more than **+50 %** at d = 50 on any cell after capping `nSub` at 3.
- **STOP** if `O5_BAR = 2.30` fails on any cell after the `MK_TICK_EASE_BLEND` recovery — ship the
  re-tiling alone and put the `L0`/O5 trade to Jay with the table in §4.
- **STOP** if d = 220 `siteCoverage` falls below **0.85** on any cell (HEAD's worst is 0.7803).
- **Never** re-pin a `pathSignature` golden, an `O5_BAR`, a `wedge25` bar or a `bandC` ceiling
  without the measured proof in the commit body and a `## Bars changed` entry.

---

## 9. Evidence index — `docs/3d-audit/lane-reports/T2-5-plan-evidence/`

| file | what |
|---|---|
| `T2-5-annotated-cone-hatch-HEAD-create.png` | **the deliverable-1 markup**, 627×749 native: RED over-long ticks, ORANGE staggered fragments, CYAN `wedge25` bare pixels, GREEN `sceneEdge` |
| `T2-5-annotated-cone-hatch-RANK1-create.png` | same map after Rank 1 — no RED, no ORANGE |
| `plain_HEAD_create.png` / `plain_RANK1_create.png` | un-annotated renders of the same two trees |
| `crop_slabzoom_HEAD_vs_RANK1_x4.png` | 4× native crop of the slab: continuous ruled lines → tick texture |
| `crop_rightzoom_HEAD_vs_RANK1_x4.png` | 4× native crop of the right-hand fragment field |
| `crop_slab_HEAD_vs_RANK1.png`, `crop_right_HEAD_vs_RANK1.png` | the same two regions at 1× native |
| `gallery_after_T2-3c_crop_x4_slab-seam.png`, `…_x4_right-fragments.png`, `…_x5_overlong-line.png`, `gallery_before_v141_crop_x4_slab-seam.png` | crops of **Jay's own shots** (`after/T2-3c/shots/B/` and `shots/B/`) |
| `before_full.png`, `after_full.png` | the two gallery shots Jay compared, as PNG |
| `capture/` | live capture from the scratch export at `b43fa4e3`, both rigs, port 8495 (`create` 580 / 2485.7 mm; `addLayer` 410 / 2180.8 mm) |
| `scripts/` | the whole read-only harness: `lib.js` (instrumented loader), `metrics.js` (the three oracles), `proto.js` (Rank-1..5 prototype patcher), `sweep.js`, `seam.js`, `overlong.js`, `blobs.js`, `gaps.js`, `edgecheck.js`, `roster.js`, `t3c.js`, `d220.js`, `resid.js`, `nontick.js`, `anno.py`, `draw.py` |

---

## Bars changed

**None.** This is a read-only plan: no test, threshold, tolerance, fingerprint, population or fixture
was modified, and nothing was written outside this report and its evidence directory.

For the implementer's own `## Bars changed`, the following **will** need entries and are named here
so none is missed:

- `tests/unit/scene3d-mktick-wedge.test.js` — the **12 pinned `pathSignature` goldens** (`:292–:346`):
  re-pin with proof; the geometry changes by design.
- `tests/unit/scene3d-mktick-banding.test.js` — `PRE_RANK1_BANDC`: `bandC` **falls** on all four gated
  cells under Rank 1, so the ×1.05 ceiling still passes; if it is re-pinned downward that is a
  *tightening* and must be labelled as such.
- `tests/unit/scene3d-mktick-runaway.test.js` — `PRE_T23B` per-cell longest/count15 is measured over
  a **population that Rank 1 changes** (more, shorter paths). The *number* may not move, but the
  **population does** — standing rule 6 requires the entry even so.
- `tests/unit/scene3d-mktick-wedge.test.js:374 O5_BAR = 2.30` — **must NOT be changed.** Listed here
  so that a change to it is visibly a violation.
