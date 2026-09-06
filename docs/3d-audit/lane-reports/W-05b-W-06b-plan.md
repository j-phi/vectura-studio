STATUS: PLAN — W-05b + W-05b addendum + W-06b, 4 units, all red oracles measured on the live tree; W-06 max sign-off = CONDITIONAL (recommendation in §8)

# W-05b (mkTick) / W-06b (mkDashRamp) — plan

Planner: Opus, read-only. Lane **fill-audit-a**, worktree
`.claude/worktrees/fill-audit-a` (HEAD `3c88605f` = W-26 iter2). **Nothing in the worktree was
written, stashed or committed.** Every number below was measured in a scratch export
(`git archive 3c88605f | tar -x` into
`/private/tmp/claude-501/…/scratchpad/faa-w05b`, `node_modules` symlinked to main's) driving
`Vectura.AlgorithmRegistry.scene3d.generate` on the audit's own fixture
(`tests/unit/scene3d-mark-laws-draw.test.js`'s params: `PRIMITIVE_PARAM_DEFAULTS` +
`DEFAULT_CAMERA`, sun az 135 / el 45, `BOUNDS {1200×1000, m 20, penWidth 0.3}` — the fixture that
reproduces the gallery's own path/ink counts to the digit, verified again here:
`sphere__hatch__mkDashRamp__low__a` = 498 paths / 2699.9 mm pre-W-06, exactly the manifest).

All `surface-fill.js` line numbers are at `3c88605f`.

---

## 0. What the user asked for, and what the pictures actually show

I looked at all three screenshots plus the raw `after/W-05` and `after/W-06` webps.

**`user-reports/8.png`** — cone / hatch / mkTick, before vs W-05 after. The after is 3–4 broad
curved *swaths* of ticks with bare bands between them and a hard-edged boundary where the tick
field simply stops mid-form. Within a swath the ticks *fan* (they are not parallel) and they are
all about the same length.

**`user-reports/9.png`** — torus / contour and torus / crosshatch, W-05 after. Contour reads as
bow-tie clusters of long straight spokes radiating from points, with big blanks between clusters;
crosshatch reads as a herringbone of straight spokes. Neither reads as one texture.

**`user-reports/10.png`** — sphere / hatch / mkDashRamp low. The after is **one dash** plus the
silhouette outline. Confirmed against the real webp: `after/W-06/shots/B/sphere__hatch__
mkDashRamp__low__a.webp` (69 paths / 145.3 mm — of which **68 paths are the silhouette outline and
5 are marks**, measured; the picture shows one because the other four sit on the rim).

The user's requirements, restated as engineering targets:

| # | Requirement (user's words) | Target |
|---|---|---|
| R1 | ticks must have **VARIABLE LENGTH**, tick length carries tone | mean tick length dark-third / light-third ≥ 3× |
| R2 | ticks must **FILL the form** as a continuous texture; gaps only at highlights | a mark at every lattice site the light asks for; no wholesale mark refusal |
| R3 | ticks may **CURVE** — arcs tangent to the local ruling/contour, curvature from the surface | non-zero sagitta; end tangents perpendicular to the family, not just the midpoint |
| R4 | the torus must read as **one coherent texture**, not per-patch fans | drawn direction = requested direction to within 10° at the tail, not just the median |
| R5 | mkDashRamp at d=1 = a **sparse but complete dash texture**, ≥ ~40 dashes on a 40 mm sphere, monotone to med, never a single stroke, discrete dashes riding rulings at every density | see §4 |

---

## 1. Where the sink lives, and whether the ruling geometry is reachable (the brief's question)

**Answer: yes, fully — and `emitContFamily` is not on this path at all.**

- `MARK_LAWS` (`surface-fill.js:1211`) is neither in `CONT_LAWS` nor in `isEvenLadder()`, so
  `contMapper` (`:10441`) is **false** for every mark law. Mark laws therefore dispatch to the OLD
  `emitFamily` / `emitAngledFamily` path (`:10490`+), reach `emitLine`, and are intercepted at
  `:8171`:
  ```
  if (toneOn && isMarkLaw() && arcMM) {
    emitMarks({ smps, arcMM, nSteps, spanDrop, paramAt, pitchStep, lineDir,
                lineIndex, wantFront, back, fam: currentFam, pitchAtStep });
    return;
  }
  ```
  W-26's `emitContFamily` is **untouched by, and unreachable from, this unit**. Good: it is on the
  forbidden list and it stays there.

- `ctx.smps` **is** the ruling's own screen polyline. Each sample carries `x,y,z`, `front`, `I`,
  and the chart's screen derivatives `dA`/`dB` (`sampleAt`, `:5018`, populates `dA`/`dB` whenever
  `useLadder`). `ctx.paramAt(tt)` gives the ruling's `(a,b)`; `ctx.lineDir(tt)` / `ctx.pitchStep(tt)`
  give the along- and across-family parameter offsets; `ctx.pitchAtStep(smp,s)` gives the local
  screen pitch. `sampleAt(a,b)` is in scope and returns the same bundle for **any** chart point.

  So a tick can follow the surface family *without any new machinery and without a new noise
  stack*: walk the chart, re-deriving the local frame from each walked sample's own `dA`/`dB`. This
  is the identical mechanism the file already argues for at `:7597–7620` (the Round-5 wave:
  "the displacement is applied to the CHART COORDINATE and the displaced point is then SAMPLED …
  so it cannot leave the surface at all").

---

## 2. Mechanism, per defect, with file:line

### D1 — a mark is a straight 2-point screen chord, always. (R3, R4, and half of R2)

`mkShape('tick', …)` (`:2533`) returns `[[off, −L/2], [off, +L/2]]` — two vertices. `place`
(`:5772`) maps each vertex once through `fr.toParam(u,v)` and pushes the run. Nothing between the
two ends is ever sampled, so:

- **sagitta = 0.000 mm on every tick at every density and every primitive** (measured; and
  `pp.length === 2` is *asserted* by the current W-05 test, `scene3d-mark-laws-draw.test.js:105`).
  A tick is a chord across a curved surface by construction.
- `fr.toParam` (`:5761`) is a **single linearised 2×2 solve** on the row sample's `dA`/`dB`:
  ```
  a: pr.a + (tx*smp.dB.y − smp.dB.x*ty)/det,
  b: pr.b + (smp.dA.x*ty − tx*smp.dA.y)/det
  ```
  It is exact only infinitesimally. A tick is `L = 1.02·R` long where `R` is the **row pitch**
  (3× master pitch) — i.e. **4.4 mm at d=50 and 17.4 mm at d=1** (measured `masterPitch`: 1.476 mm
  cone d=50, 1.501 mm sphere d=50, **5.816 mm sphere d=1**, 0.350 mm sphere d=220). Pushing a
  17 mm offset through an infinitesimal solve is what produces the spokes.
  Measured error between the **requested** mark direction (`v` rotated by `thetaAt`) and the
  **drawn** direction:

  | cell | med | p90 | max |
  |---|---|---|---|
  | sphere/hatch d=1 | 2.73° | 12.03° | **44.77°** |
  | sphere/hatch d=50 | 1.45° | 7.84° | **26.91°** |
  | sphere/hatch d=220 | 1.15° | 5.10° | **49.62°** |
  | cone/hatch d=50 | 0.77° | 2.54° | 11.81° |
  | torus/contour d=50 | 0.35° | 2.32° | 15.08° |
  | torus/crosshatch d=50 | 2.19° | 8.42° | 20.96° |

  The **median is fine and the tail is not** — which is exactly why W-05's median-only oracle
  (`expect(median).toBeLessThan(0.5)`, `:130`) passed while the picture is wrong.
- Drawn/asked length ratio `p10`: **0.511** at d=1, 0.820 at d=25, 0.888 at d=50 — i.e. at the
  sparse end one tick in ten comes out at half the length the tone solve asked for. The tone is
  under-delivered and nothing counts it.
- Neighbour direction coherence (max angle to any mark within 3 mm, p90): **81° cone/hatch,
  87° sphere/hatch, 65° torus/contour**. That is the fan, measured.

### D2 — the whole mark is refused when any endpoint leaves the front surface. (R2 — the hard edge)

`place` (`:5780–5794`) returns `false` — dropping the entire mark — on the first vertex that is
out of domain **or** whose `sampleAt` comes back with `front !== wantFront`. Measured refusal
fraction `offSurface/(offSurface+marks)` and its cause:

| cell | marks | refused | out-of-domain `a` | seam `b` | **`front` mismatch (limb)** | refuseFrac |
|---|---|---|---|---|---|---|
| sphere/hatch d=1 | 55 | 87 | 24 | 0 | **63** | **0.613** |
| sphere/hatch d=50 | 529 | 106 | 8 | 0 | **98** | 0.167 |
| cone/hatch d=50 | 301 | 74 | 0 | 0 | **74** | 0.197 |
| torus/contour d=50 | 369 | 145 | 47 | 1 | **97** | 0.282 |
| torus/crosshatch d=50 | 1045 | 443 | 34 | 5 | **404** | 0.298 |

**Overwhelmingly the limb, not the domain.** Every one of those is a tick that overlapped a
silhouette or a self-occlusion boundary and was therefore not drawn *at all* instead of being drawn
*short*. That is the hard-edged tick region on the cone and the blanks between the torus's bow-ties.

### D3 — tick length is a function of the local pitch, not of the light. (R1)

`solveAt` (`:5853`), `chan:'count'` branch:
```
L = Math.min(L0 * R, capOf(PMIN));      // L0 = 1.02, capOf('tick') = 1.02·R·max(1,⌊1.4·nCap⌋) ≫ L0·R
P = clamp(L / g, PMIN, MK_PMAX);
```
so **`L ≡ 1.02·R` for every tone** (the second branch, `if (P <= PMIN) L = …`, fires only at
saturation). `R = clamp(lp/MK_ROW_COV, 0.25, 40)` (`:5857`) is the *local pitch*, so length tracks
foreshortening. This is the law's *documented* design (`:1118–1123`: "at a fixed size of nearly the
full row pitch. Tone is COUNT") — the user is asking for that design to change.

Measured mean drawn tick length by the engine's **own** radiance third (instrumented copy of
`mkStat`; dark / mid / light):

| cell | dark | mid | light | dark÷light |
|---|---|---|---|---|
| cone/hatch d=50 | 5.683 | 6.177 | 4.716 | **1.20** (and non-monotone) |
| sphere/hatch d=50 | 5.752 | 5.064 | 3.636 | **1.58** |
| torus/contour d=50 | 6.366 | 5.694 | 4.180 | **1.52** |
| sphere/hatch d=220 | 1.427 | 1.500 | 1.255 | **1.14** (non-monotone) |
| sphere/hatch d=1 | *(dark third empty)* | 16.689 | 14.433 | n/a |
| torus/crosshatch d=50 | 5.175 | 4.969 | 4.415 | 1.17 |

Bar is ≥ 3×. **The count channel does work** (cone dark/light mark counts 219 / 21 = 10.4×), so
this unit adds a length channel; it does not replace a broken one.

### D4 — the "un-ticked bands" are NOT coverage holes. (honest correction to the brief)

I measured coverage properly: silhouette = horizontal-run fill of a `ladder` d=220 render on a
1 mm lattice; then a BFS distance transform from the mark cells.

| cell | silhouette cells | dist med | p90 | p99 | **max** | rowPitch | max ÷ rowPitch |
|---|---|---|---|---|---|---|---|
| cone/hatch mkTick d=50 | 1005 | 0 | 1 | 2 | **3 mm** | 4.428 | **0.68** |
| sphere/hatch mkTick d=50 | 1327 | 0 | 0 | 1 | **2 mm** | 4.502 | 0.44 |
| torus/contour mkTick d=50 | 1366 | 0 | 1 | 5 | **6 mm** | 4.520 | 1.33 |
| torus/crosshatch mkTick d=50 | 1371 | 0 | 0 | 1 | 2 mm | 4.520 | 0.44 |

Fraction of the silhouette within 2 mm of ink: **0.992 (cone), 1.000 (sphere), 0.956 (torus
contour)**.

**Consequence for the brief: two of its five proposed oracles are already green on the pre-fix
tree and would ship as vacuous passes.** "coverage of the lit-not-highlight surface ≥ 0.9 of the
silhouette at d=50" is 0.956–1.000 today; "no un-ticked band > 2× row pitch outside highlight" is
0.44–1.33× today. They must be kept as **non-regression guards**, never as the RED proof. The
user's banding is a *legibility* fault — every tick the same length, in swaths, fanning — not a
hole. §6 restates the red oracles accordingly.

### D5 — mkDashRamp at d=1: three clamps multiply out to ~2 sites per row. (R5)

Measured chain at d=1 on the 40 mm sphere:

- master grid `N = 8`, `masterPitch = 5.816 mm` (`lastMasterGridStats`).
- mark-law row coverage is the constant `MK_ROW_COV = 1/3` (`:4737`, `:2379`) → **3 rows survive**.
- `R = clamp(lp/MK_ROW_COV, 0.25, 40) = 17.447 mm` (`:5857`).
- `P = clamp(P0·R, PMIN, MK_PMAX) = clamp(21.8, 0.33, 26) = 21.8 mm` (`:5880`, `MK_PMAX = 26`,
  `:2393`).
- a row's visible arc is ≈ 40 mm ⇒ **≈ 2 periods per row × 3 rows ≈ 6 candidate sites**.

Measured: **`marks = 5`, `rows = 3`**, of which the longest is 12.2 mm. Arithmetic closes exactly.

Density sweep, mkDashRamp, sphere/hatch:

| d | rows | marks | tooShort | offSurf | `bandMax` |
|---|---|---|---|---|---|
| 1 | 3 | **5** | 0 | 2 | 1 |
| 10 | 3 | **2** | 2 | 4 | 1 |
| 25 | 4 | 9 | 8 | 2 | 1 |
| 50 | 8 | 56 | 33 | 5 | 1 |
| 220 | 31 | 416 | **835** | 6 | 1 |

**Two extra reds fall out of this table that the brief does not name:**

- **Density is non-monotone at the sparse end**: d=10 draws *fewer* marks (2) than d=1 (5). This is
  the mark-law twin of W-01/W-01-M1 and no guard covers it.
- **At d=220, 835 candidate dashes are dropped as sub-`MIN_MARK_MM` against 416 placed (2.01
  dropped per placed)** and the debt is *not* carried (`lat:'row'` has no error-diffusion carry —
  only `lat:'errdiff'` does, `:6030`). That is where the max-density ink went.

### D6 — after W-06 the dash BAND is structurally unreachable at every density. (the max sign-off)

`capOf` (`:5871`, W-06's change):
```
capOf = (per) => law.shape === 'morph'
  ? Math.min(Math.max(1, ⌊1.12·R/w⌋) * per, 2 * truePitch)
  : mkCap(shapeFor(), R, w)
```
and `layMark`'s morph branch (`:5932`): `nn = min(⌈L/P⌉, ⌊1.12·R/w⌋)`.

With `R = 3·truePitch` and `P = 1.25·R = 3.75·truePitch`, the new clamp gives
`L ≤ 2·truePitch` ⇒ `L/P ≤ 0.533` ⇒ `⌈L/P⌉ = 1` **always**. So:

- **duty cycle is capped at 0.533** and **`bandMax = 1` at every density** — measured, including
  d=220. States 3 and 4 of the law's own documented ramp ("MORPHS dot → dash → full unbroken ruling
  … and past that the dash thickens into a BAND of parallel passes an inkWidth apart. One mark
  language, four states", `:1112–1117`) are now **unreachable**.
- Max reachable ink ≈ 0.533 × (1/3 of the master rulings) ≈ **0.20 × the ladder's ink**. Measured:
  529.4 mm vs the ladder's 2657.1 mm at the same density — **0.199**. Arithmetic closes.
- `MK_DARK_AREA = 0.96` (`:2384`, "near solid — reachable only by merging, which is the point") is
  now unreachable by a factor of ~5 for this law.

---

## 3. Design — one mechanism serves R2, R3, R4 and the mkDashRamp slab at once

### 3.1 The chart-walked mark (foundation)

Replace the two-point push in `place` with a **walk in the chart** for `law.shape === 'tick'` and
`law.shape === 'morph'` only. Every other law keeps the existing code path, byte for byte.

1. Factor `frameAt(s)` (`:5736–5770`) into `frameFrom(smp, ld, st, pr)` — the same arithmetic,
   parameterised by a sample rather than by a ruling index. `frameAt(s)` becomes a one-line caller.
   *No behaviour change; this is the refactor half of the unit.*
2. Add `MK_ARC_MM` — the walk step in screen millimetres. State it in pen widths like every other
   bar in the file: `MK_ARC_PEN = 1.2` ⇒ 0.36 mm at a 0.3 mm pen. Rationale: the linearised solve is
   accurate to well under a pen width over that distance, and 0.36 mm is below the plot floor
   (`PLOT_FLOOR_PEN = 2.2`) so the polyline cannot read as a polygon.
3. `walkPoly(fr0, k, uOff, theta, poly)`: for each edge of the poly, step along it in increments of
   ≤ `MK_ARC_MM`; at each step map the *remaining* offset through the frame re-derived from the
   **previous accepted sample's own `dA`/`dB`** (`sampleAt` already returns them) and `sampleAt` it.
   - accepted ⇔ in-domain (with the existing periodic-`b` wrap, `:5784–5789`) **and**
     `sm.front === wantFront`.
   - **on the first refusal, STOP and keep what has been drawn** if it is ≥ `MIN_MARK_MM`; count it
     in a new `mkStat.trunc`. This is the D2 fix.
   - the one-way door is preserved verbatim: every emitted vertex still comes out of `sampleAt`, so
     "nothing outside the silhouette" stays a structural property, not a measurement.
4. `MIN_MARK_MM` and the `MK_MAX_PENS` budget are unchanged and still applied to the walked run.

Why this satisfies R3/R4 without a new noise stack: the tick's direction at each step is the local
`v` re-derived on the surface, so the drawn curve is (to `MK_ARC_MM`) the coordinate curve
conjugate to the ruling — an arc tangent to the local family, with the surface's own curvature.
Nothing is generated; the geometry is read off the chart that is already there. (CLAUDE.md's Noise
Rack rule is not engaged: no noise is involved at any point.)

Cost: `sampleAt` calls per mark go from 2 to ≈ `L/0.36`. At d=50, L ≈ 5.5 mm ⇒ ~16 per mark × 529
marks ≈ 8.5 k extra chart evaluations per family; at d=220, L ≈ 1.4 mm ⇒ ~4 per mark × 1971 ≈ 8 k.
Budget guard in §6.

### 3.2 Variable-length ticks (R1)

Give `MK.mkTick` (`:2423`) a length channel:
```
mkTick: { shape: 'tick', chan: 'len', lat: 'brick', or: 'none', L0: 1.02, LMIN: 0.18, P0: 1.02 },
```
and one new branch in `solveAt`:
```
// 'len' — LENGTH is the primary tone channel, PERIOD the secondary. The site
// lattice is complete (a mark at every period) and the tick GROWS from a flick
// to the full row pitch, so black is still reached by abutment.
P = clamp(law.P0 * R, PMIN, MK_PMAX);
L = clamp(g * P, law.LMIN * R, law.L0 * R);
P = clamp(L / Math.max(1e-6, g), PMIN, MK_PMAX);   // conserve the ask where L clamped
```
Properties, all checkable:
- delivered ink per mm of row is `L/P = g` exactly wherever `P` is interior — **tone is unchanged
  in the aggregate**, only its carrier changes.
- length range 1.02/0.18 = **5.7×**, comfortably over the 3× bar.
- `P0 = 1.02` ⇒ one site per row-pitch cell ⇒ the field is complete: a mark everywhere the light
  asks for anything, which is R2's "continuous texture".
- in the darks `L → 1.02·R` = the full row pitch ⇒ adjacent rows' ticks abut ⇒ **black by pure
  abutment is preserved**, which is the law's documented mechanism.
- `LMIN·R` at d=220 is 0.18 × 1.05 = 0.19 mm < `MIN_MARK_MM` (0.6 mm), so the existing drop rule
  still reaches bare paper at the extreme light end. That is correct and must be left alone.

**Documentation obligation (not optional):** the roster comment at `:1118–1123` states mkTick's
channel as COUNT and the historical `fillcmp` table at `:1183` records it as measured under that
design. Both must be updated in the same commit — the roster text rewritten, the table row
annotated as pre-W-05b historical (it cannot be re-measured here).

### 3.3 mkDashRamp — the sparse end (R5)

**One lever.** The mark-law row coverage is a hardcoded constant; make it a floor rather than a
fixed value, scoped by a per-law flag so the other ten mark laws do not move:

`:4737`, today: `if (isMarkLaw()) return MK_ROW_COV;`

becomes (sketch):
```
// W-06b — a mark law's rows are a FRACTION of the master grid, so at the sparse
// end (masterPitch 5.8 mm at d=1) one third of an 8-ruling grid is three rows and
// no mark language can carry tone on three rows. The row scaffold therefore takes
// a pitch CEILING in pen widths: keep every third ruling while that is finer than
// the ceiling, and keep them ALL once the master pitch alone is already coarser.
// Scoped by MK[...].rowFloor so the other ten laws are byte-identical.
if (isMarkLaw()) return MK[TONE_ALGO].rowFloor
  ? clamp(masterPitch / (MK_ROW_TARGET_PEN * penWidth), MK_ROW_COV, 1)
  : MK_ROW_COV;
```
with `MK_ROW_TARGET_PEN = 16` (4.8 mm at a 0.3 mm pen) and `rowFloor: true` on **mkTick and
mkDashRamp only**.

`R` must read the *same* coverage — `:5857`'s divisor is the hardcoded `MK_ROW_COV` and would
otherwise disagree with the scaffold it is meant to describe. Hoist the coverage into a local and
divide by it.

Byte-identity arithmetic (this is why 16 pen and not 15):
- d=50: `masterPitch = 1.501` ⇒ `1.501/4.8 = 0.3127 < 1/3` ⇒ clamps to `MK_ROW_COV` **exactly** ⇒
  byte-identical.
- d=220: `masterPitch = 0.350` ⇒ `0.0729` ⇒ clamps to `MK_ROW_COV` ⇒ byte-identical.
- d=1: `masterPitch = 5.816` ⇒ `1.212` ⇒ clamps to **1** ⇒ 8 rows instead of 3, `R = 5.816`,
  `P = 1.25 × 5.816 = 7.27 mm` ⇒ ≈ 5–6 dashes per 40 mm row × 8 rows ≈ **45 dashes**. Bar is ≥ 40.

The change is confined to the region where `masterPitch > 4.8 mm`, i.e. to the sparse end that is
the defect. **Do not raise `N`** — the master grid is forbidden and is not the lever.

### 3.4 mkDashRamp — restore the band, kill the slab (the max sign-off)

Replace W-06's **length** cap with a **band-width** cap, so the ramp's states 3–4 come back while
"several rulings wide" stays dead by construction:
```
// W-06b — F-06 was the band spilling across NEIGHBOURING rulings (3.4 x the true
// master pitch). Cap the BAND WIDTH inside its own master pitch instead of capping
// the mark's LENGTH: a full-black dash may become an unbroken ruling and then a
// band, but the band can never reach the ruling next door.
const bandN = Math.max(1, Math.floor((0.90 * truePitch) / w));
const capOf = (per) => (law.shape === 'morph' ? bandN * per : mkCap(shapeFor(), R, w));
```
and in `layMark`'s morph branch replace `Math.floor((1.12 * sv.R) / w)` with `bandN`.

- d=50: `truePitch 1.501` ⇒ `bandN = 4` ⇒ band ≤ 1.2 mm inside a 1.5 mm master pitch.
- d=1: `truePitch 5.816` ⇒ `bandN = 17` ⇒ band ≤ 5.2 mm inside a 5.8 mm master pitch.
- d=220: `truePitch 0.350` ⇒ `bandN = 1` ⇒ no band, and tone comes from duty → 1 (an unbroken
  ruling), which is the correct answer at that pitch and is what recovers the ink.
- The old F-06 defect measured 3.4 × truePitch; the new ceiling is 0.90 × truePitch — **strictly
  tighter than W-06's own 2 × truePitch** on the quantity that actually mattered (width), while
  removing the clamp on the quantity that did not (length).
- Combined with §3.1, each of the band's parallel passes is a chart-walked arc offset in `v`, so a
  "band" hugs the ruling family instead of being the rigid slab the before-med picture shows.

---

## 4. RGR red oracles — with the current number for each

All from the same fixture. Add these to `tests/unit/scene3d-mark-laws-draw.test.js`. Two need a
test seam, added the same way W-05 added `byThird` (see §5).

| # | Oracle | Bar | **Measured now (RED)** |
|---|---|---|---|
| O1 | tick sagitta (max lateral deviation of interior vertices from the chord), median over torus/contour d=50 ticks | ≥ 0.15 mm | **0.000 mm** (every mark is 2 points; `ptsMax = 2` at every density) |
| O2 | drawn-vs-requested mark direction error, **p99** (not median), sphere/hatch d=1 and d=50 | ≤ 10° | **44.77° / 26.91°** (medians 2.73° / 1.45° — the current median-only test at `:130` passes) |
| O3 | wholesale mark refusal `offSurface/(offSurface+marks)` — cone/hatch d=50, torus/contour d=50, torus/crosshatch d=50, sphere/hatch d=1 | ≤ 0.05 | **0.197 / 0.282 / 0.298 / 0.613** (cause is `front` mismatch: 74/74, 97/145, 404/443, 63/87) |
| O4 | drawn/asked length ratio p10, sphere/hatch d=1 | ≥ 0.95 | **0.511** |
| O5 | mean tick length dark-third ÷ light-third, cone/hatch d=50 and sphere/hatch d=50 | ≥ 3.0 and monotone dark ≥ mid ≥ light | **1.20 (non-monotone) / 1.58** |
| O6 | mkDashRamp marks on the 40 mm sphere at d=1 | ≥ 40 | **5** |
| O7 | mkDashRamp mark count monotone non-decreasing over d = 1, 10, 25, 50, 220 | monotone | **5, 2, 9, 56, 416** — fails 1 → 10 |
| O8 | mkDashRamp `bandMax` (max parallel passes in one mark) at d=50 | ≥ 2 | **1** (and 1 at every density) |
| O9 | mkDashRamp ink at d=220, sphere/hatch | ≥ 1500 mm | **529.4 mm** (ladder at the same density: 2657.1 mm) |
| O10 | mkDashRamp `tooShort ÷ marks` at d=220 | ≤ 0.25 | **2.01** (835 / 416) |

**Non-regression guards (green today — keep them, do not present them as red proof):**

| # | Guard | Bar | Today |
|---|---|---|---|
| G1 | silhouette fraction within 2 mm of ink, mkTick d=50 | ≥ 0.90 | 0.992 cone / 1.000 sphere / 0.956 torus-contour |
| G2 | max distance-to-nearest-mark ÷ row pitch, mkTick d=50 | ≤ 2.0 | 0.68 cone / 0.44 sphere / 1.33 torus-contour |
| G3 | mkTick mark count dark-third ≥ 2 × light-third (W-05's own bar, `:118`) | ≥ 2 | 10.4× cone / 9.6× sphere |
| G4 | no drawn mark wider than **1.0 ×** its local master pitch across the family (tightened from W-06's 2×) | ≤ 1.0 | W-06's test asserts `maxLen < 25 / < 15`; re-express in pitch units |
| G5 | every mark still inside the silhouette (the file's "out = 0 by construction" claim) | 0 mm outside | 0 |
| G6 | generation time, torus d=220, mkTick and mkDashRamp | < 2500 ms | measure before/after; the existing perf test uses 2000 ms for deepFillTSP |

**Byte-identity, for every other law** — the 10 other mark laws (`mkDotScreen, mkLozenge,
mkChevron, mkComma, mkSFlick, mkCrossPlus, mkTriangle, mkScribble, mkDotLozenge, mkRadialFlick`)
plus `ladder` / `fineLadder` / `phaseFineLadder` / the `contField*` set must be **md5-identical**
on `sphere|torus|cone × hatch × {low,med,max}`. Scoping makes this structural: every change is
gated on `law.shape === 'tick'`, `law.shape === 'morph'`, or `MK[...].rowFloor`, and `shape:'tick'`
and `shape:'morph'` are each unique to one law (verified against the `MK` table, `:2421–2434`).

---

## 5. Test seams to add

`lastMarkStats` is already the precedent (W-05 added it plus `byThird`). Extend `mkStat`
(`:2397`) and the `publishMarkStats` projection (`:10871`) with:

- `lenByThird: [dark, mid, light]` and `cntByThird: [dark, mid, light]` — total and count of
  **drawn** mark length per radiance third. O5 reads `lenByThird[i]/cntByThird[i]`.
- `bandMax` — `max(polys.length)` over placed marks. O8.
- `trunc` — marks shortened at the limb by the walk (new; a rising number here is the D2 fix
  working).
- `askSum` / `drawnSum` — asked vs delivered ink. O4 and the honest report of what the tone solve
  actually spent.

These are counters on an existing published object; they cost one object per build and are read
only by tests. Do **not** thread a debug flag through the closure, and do **not** revive
`lastFloorStats.mark` (dead behind `TONE_UNCAPPED = false`).

---

## 6. Ranked fixes

1. **§3.1 the chart-walked mark.** Highest value: it is the only change that fixes R3 (curvature),
   R4 (the fans/tail), and the *cause* of the hard-edged region (D2), and it is a prerequisite for
   §3.4 not re-introducing slabs. Reds it turns: O1, O2, O3, O4.
2. **§3.2 variable-length ticks.** The user's headline request. Red: O5. Cheap once §3.1 lands
   (`solveAt` only). Carries a documentation obligation.
3. **§3.3 mkDashRamp row floor.** Red: O6, O7. Small, arithmetically provable, and it also lifts
   mkTick's sparse end (they share the flag).
4. **§3.4 restore the band.** Reds: O8, O9, O10 — and it is the item Jay's sign-off is about.
   Land last, with the pictures.

Rejected alternatives, with reasons:
- *Raise `N` for mark laws at low density* — the master grid is forbidden, and it would move every
  law's density calibration.
- *Cap `R` for the mark's period/size* — shrinks the tone cell, so `g = mkAsk(I)·R/w` drops and the
  drawing goes lighter as it gets denser. The row-coverage floor changes the *scaffold* the tone is
  computed against, which is the coherent place.
- *Set `MK_ROW_COV = 1` for mkDashRamp outright* — already tried and reverted in W-06 ("half the
  sphere went blank, ink 2995 → 1381"). The floor form keeps d=50/d=220 byte-identical, which the
  flat change did not.
- *Widen W-05's median tolerance to make the picture pass* — forbidden; the median is already
  passing and is the reason the defect shipped.

---

## 7. Units (a Sonnet implementer, one at a time — they all touch `surface-fill.js`)

| Unit | Scope | Files | Reds closed | Est. |
|---|---|---|---|---|
| **U1** | §3.1 chart-walked mark: `frameAt` → `frameFrom` refactor, `MK_ARC_PEN`, `walkPoly`, truncate-at-limb, `mkStat.trunc/askSum/drawnSum` | `surface-fill.js`, `scene3d-mark-laws-draw.test.js` | O1 O2 O3 O4 | ~4 h |
| **U2** | §3.2 `chan:'len'` + `LMIN`, `lenByThird`/`cntByThird`, roster comment `:1118–1123` + table note `:1183` | same two | O5 | ~3 h |
| **U3** | §3.3 row-coverage floor + `R`'s divisor, `MK[...].rowFloor` | same two | O6 O7 | ~3 h |
| **U4** | §3.4 band-width cap + `bandMax`; **carries the max sign-off report** | same two | O8 O9 O10 | ~3 h |

Serial, in that order. U1 must land and be reviewed before U2–U4, because U4's band is only safe
once each pass is a walked arc. Each unit closes with its own re-shoot + `report.json` per
AGENT-PROTOCOL §Every unit. If the lane is under time pressure, U1+U2 alone answer W-05b and the
addendum; U3 alone answers the user's W-06b complaint; U4 is the sign-off item and can be deferred
if Jay wants to decide first.

### Files allowed
- `src/core/scene3d/surface-fill.js` — **only** `MK` (`:2421`), the mark constants (`:2379–2396`),
  `mkCap`/`mkShape` (`:2456`, `:2483`), `algoCoverage`'s `isMarkLaw()` line (`:4737`), and the
  `emitMarks` block (`:5722–6102`) plus the `publishMarkStats` projection (`:10871`).
- `tests/unit/scene3d-mark-laws-draw.test.js`.
- `docs/3d-audit/fill-audit-fixes/W-05.json`, `W-06.json` (add `W-05b.json`, `W-06b.json`),
  `docs/3d-audit/fill-audit/after/W-05b|W-06b/report.json`, `docs/3d-audit/STILL-OPEN.md`.
- `src/core/scene3d/scene3d-tone-laws.js` / `src/ui/panels/context-bar.js` **only if** a user-facing
  param is added — and none of the four units needs one. If an implementer reaches for one, stop and
  report instead.

### Files forbidden
- The **master grid** (`surface-fill.js:5084–5285` incl. `lastMasterGridStats`) — read `N` /
  `masterPitch`, never write them.
- **`emitContFamily` internals** (`:9275`+) and everything W-26 touched on that path. Mark laws do
  not route through it (§1); if a change appears to need it, the diagnosis is wrong.
- `src/core/scene3d/surface-fill-mono.js` (lane fill-audit-c), `mappers.js` / slices (fill-audit-d),
  `hlr.js` / `shadows.js` (handoff-c), `src/core/algorithms/scene3d.js` faceted path (lane
  fill-audit).
- `HL_STAGE` (`:388`) — `coverageCap` is `false` and must stay false; several of the numbers above
  depend on it.

### Guards to run (targeted, one vitest file at a time, foreground)
- `tests/unit/scene3d-mark-laws-draw.test.js` (the unit's own).
- **W-26:** `tests/unit/scene3d-ladder-uniform-field-spacing.test.js`, plus the seven files W-26
  re-pinned: `scene3d-fill-even-spacing.test.js`, `scene3d-fill-span-verdict.test.js`,
  `scene3d-curved-density-floor.test.js`, `scene3d-box-density-bearing.test.js`,
  `scene3d-hatch-density-500.test.js`, `scene3d-plot-safety.test.js`.
- **W-01 M1:** `scene3d-curved-density-floor.test.js`, `scene3d-curved-density-sparse-end.test.js`.
- **Law dispatch / defaults:** `scene3d-tone-law-dispatch.test.js`, `scene3d-tone-algo-default.test.js`,
  `scene3d-hl-stage-roster.test.js`, `scene3d-fill-ruling-continuity.test.js`,
  `scene3d-fill-boundary-ends.test.js`.
- **Byte-identity sweep** for the 10 other mark laws + `ladder`/`fineLadder`/`phaseFineLadder` on
  `sphere|torus|cone × hatch × {low,med,max}`, md5 of the emitted path arrays. Any non-identical
  pair is a REJECT, not a re-pin.

---

## 8. Recommendation on the open W-06 max-density sign-off (2995 → 529 mm)

I looked at all four pictures side by side
(`shots/B/sphere__hatch__mkDashRamp__{med,max}__a.webp` vs
`after/W-06/shots/B/…`):

- **before, med** (498 paths / 2699.9 mm): large solid rectangular slabs, each about one row cell
  tall, at varying angles, floating over the form with hard straight edges. No legible gradient.
  Unambiguously a defect.
- **after, med** (124 / 251.7 mm): clean discrete dashes riding their own rulings. Correct in kind,
  but the tone barely reads — the whole sphere is one light value.
- **before, max** (1861 / 2995.2 mm): a dense mass of overlapping slabs. Dark, but with rectangular
  block edges and blocky voids, and **no legible light-to-dark gradient**. Also a defect — drawn by
  the very mechanism W-06 removed.
- **after, max** (484 / 529.4 mm): an even dash field with a genuinely legible gradient (sparse
  upper-right, dense lower-left). **The best-drawn of the four** — and about five times too light
  for a "maximum density" setting.

**Recommendation: CONDITIONAL SIGN-OFF.**

1. **Sign off the loss of byte-identity at max.** The pre-fix max was not a good picture that W-06
   spoiled; it was the same slab defect at higher density. Holding "max stays byte-identical" would
   have required keeping the defect. Recommend Jay accept that clause as overtaken.
2. **Do not sign off the ink collapse as final.** It is not a tuning choice, it is structural: `L ≤
   2·truePitch` with `P = 3.75·truePitch` fixes the duty cycle at ≤ 0.533 and `bandMax ≡ 1`, so two
   of the law's four documented states are gone and its dark anchor (`MK_DARK_AREA = 0.96`) is
   unreachable by ~5× (measured 529.4 mm against the ladder's 2657.1 mm at the same density — ratio
   0.199, exactly what the arithmetic predicts). Close the item only after **U4** brings max back to
   ≥ 1500 mm with `bandMax ≥ 2` and no mark wider than 1.0 × its local master pitch.
3. **If Jay prefers the current lighter max as the final look**, that is a legitimate aesthetic call
   but it must be recorded honestly: mkDashRamp then becomes the lightest of the twelve mark laws,
   and its roster description at `:1112–1117` must be rewritten from "dot → dash → full unbroken
   ruling → BAND … four states" to "dot → dash" — and O8/O9 should be struck from this plan rather
   than left as failing bars.

Either way U4 is where the decision is executed, which is why it is last.

---

## 9. Stop conditions (report, do not fudge)

- **O3 cannot reach 0.05.** If truncation-at-the-limb leaves refusals above 0.10 on
  torus/crosshatch, the residue is HLR/self-occlusion (404 of 443 refusals there are `front`
  mismatches) and belongs to a different lane. Ship the measured number and stop.
- **O9 cannot reach 1500 mm without a band wider than 1.0 × truePitch.** That is the F-06 defect
  returning. Stop; the trade-off is Jay's, not the implementer's.
- **Any byte-identity pair breaks for a law outside {mkTick, mkDashRamp}.** Stop and re-scope; do
  not re-pin a fingerprint.
- **U1 pushes torus d=220 generation past 2500 ms.** Raise `MK_ARC_PEN` (fewer steps) and re-measure
  O1/O2; if the two cannot both be met, report the frontier.
- **G1/G2 regress** (coverage falls or a gap opens beyond 2 × row pitch). The variable-length
  channel is meant to *raise* coverage; a fall means `LMIN` is too small or `P0` too large.
- Any unit whose picture still reads as fans or swaths, whatever the numbers say. Harness-clean is
  not app-clean — the orchestrator looks at the PNG.

---

## 10. Evidence cells (every one verified present in `docs/3d-audit/fill-audit/manifest.B.*.jsonl`)

Re-shoot with
`node scripts/audit/scene3d-capture.js --tier B --root <worktree> --port <free ≥8512> --only '<regex>' --out docs/3d-audit/fill-audit/after/<W-id>`
run from MAIN.

**W-05b (U1, U2)** — `--only '^(cone|sphere|torus)__(hatch|contour|crosshatch)__mkTick__(low|med|max)__a$'`
| cell | baseline (`shots/B`, pre-W-05) | W-05 after |
|---|---|---|
| `cone__hatch__mkTick__low__a` | 428 / 2135.7 | *never re-shot* |
| `cone__hatch__mkTick__med__a` | 433 / 2094.8 | 374 / 1850.5 |
| `cone__hatch__mkTick__max__a` | 1393 / 2132.3 | *never re-shot* |
| `torus__contour__mkTick__med__a` | 445 / 2111.5 | 389 / 2281.2 |
| `torus__crosshatch__mkTick__med__a` | 1363 / 6011.8 | 1066 / 5213.0 |
| `sphere__hatch__mkTick__med__a` | — | 597 / 3016.6 |

Note the evidence gap: **W-05 re-shot only `med`.** `cone__hatch__mkTick__{low,max}__a` exist in
the baseline manifest but have never been re-shot post-W-05, so U1/U2 must shoot all three
densities and the `after/W-05b/report.json` must compare against the *baseline* for low/max and
against `after/W-05` for med, saying which is which.

**W-06b (U3, U4)** — `--only '^(sphere|torus)__hatch__mkDashRamp__(low|med|max)__a$'`
| cell | baseline | W-06 after |
|---|---|---|
| `sphere__hatch__mkDashRamp__low__a` | 498 / 2699.9 | 69 / 145.3 (**5 marks**) |
| `sphere__hatch__mkDashRamp__med__a` | 498 / 2699.9 | 124 / 251.7 |
| `sphere__hatch__mkDashRamp__max__a` | 1861 / 2995.2 | 484 / 529.4 |
| `torus__hatch__mkDashRamp__med__a` | — | 133 / 362.9 |

Add `sphere__hatch__ladder__{low,med,max}__a` (92 / 747.6, 92 / 747.6, 165 / 2657.1) and
`cone__hatch__ladder__med__a` (90 / 532.2) to every shoot as the **unchanged control** — a
non-identical ladder cell is an immediate REJECT.

The five ribbon laws and any imported-mesh primitive are **not** captured; no cell here names one.

---

## 11. Reproduction recipe for the reviewer

```
mkdir -p <scratch>/faa-w05b
git -C .claude/worktrees/fill-audit-a archive 3c88605f | tar -x -C <scratch>/faa-w05b
ln -sfn <main>/node_modules <scratch>/faa-w05b/node_modules
# then drive algo.generate on the fixture in §0; for O1/O5/O8 patch mkStat in the
# SCRATCH copy only (lenByThird / bandMax / offA-offB-offFront), never in the worktree.
```
The instrumented scratch copy used for this plan keeps the untouched original at
`<scratch>/faa-w05b/surface-fill.orig.js` for diffing.
