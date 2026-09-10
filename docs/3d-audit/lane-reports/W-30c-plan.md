STATUS: PLAN-READY

# W-30c plan — `shadows.js` receive-footprint correctness sweep

Planner, read-only. Worked in a scratch export of **`57aa71b2`** (fill-collapse-2's HEAD at briefing =
W-30b) at `/private/tmp/claude-501/scratch-W30c`, `node_modules` symlinked, vitest foreground one file
at a time. No worktree was edited, stashed or committed. Scratch dir removed on completion.

Inputs read: `AGENT-PROTOCOL.md`, `W-30-impl.md`, `W-30-review.md`, `W-30b-impl.md`,
**`W-30b-review.md` §5 (the condition-5 measurement — consumed below)**, `UnitD-phase-impl.md`,
`UnitD-phase-review.md` §4, `docs/3d-audit/handoff/unit-d-notes.md`, `STILL-OPEN.md` lines 8/140-151/
217/231/246-247/250, `LEDGER.md` rows 31/32 and the row-19 W-30c ranking, and all twelve
`docs/3d-audit/fill-audit/after/W-30b/*.png` (looked at directly, plus my own native-res crops and a
pixel analysis).

Everything numbered below was **measured in this scratch export**, not inferred. Harnesses
(`tests/unit/zzz-w30c-measure{,-b,-c,-d,-e}.test.js`) were throwaway; the implementer should re-derive
them as the real oracles in §3.

---

## 1. Correctness sweep — the projector per light type, on sphere / box / torus over a ground plane

Rig (all cases): receiver = `plane` `sx=sz=500` at the origin (world quad x,z ∈ [-250, 250], y=0);
casters at `(60, ·, 0)` resting on it; `shadowReceiveOnObjects: true`; camera ortho yaw 20 / pitch 45;
`fillAngle 20 / fillDensity 80 / toneLaw ladder`; tone 2 bands, thresholds `[0.3]`, ladder `[0.1,0.95]`.
Lights: `directional` az 90 / el 25; `point`, `spot` and `area` all at `(-300, 150, 0)`
(spot target `(60,20,0)`, cone 45/pen 8; area size 120 / samples 6).

### 1a. Footprint polygon vs the analytic projection — max boundary error (mm)

Method: take the caster record's `world` vertex array exactly as `buildFaceFootprint` does
(`scene3d.js:1429-1436`), project each vertex with `Shadows.projectLightToPlane` onto the y=0 plane,
hull it with `Shadows.convexHull`, and compare against the closed-form shadow — for the sphere, the
tangent cone from the light intersected with y=0 sampled at 720 boundary points; for the box, the
projection of its eight exact corners; for the torus, the true (annular) shadow region. Error =
two-sided Hausdorff distance between the polygons, in document mm.

| caster | light | hull pts | footprint bbox x / z (mm) | analytic bbox x (mm) | **max boundary error** | area ratio |
|---|---|---|---|---|---|---|
| sphere r20 @(60,20,0) | directional | 76 | [-30.19, 64.41] / ±20.00 | [-30.21, 64.43] | **0.235 mm** | 0.993 |
| sphere | point | 82 | [55.96, 194.93] / ±23.35 | [55.96, 194.95] | **0.278 mm** | 0.9937 |
| sphere | spot | 82 | [55.96, 194.93] / ±23.35 | [55.96, 194.95] | **0.278 mm** | 0.9937 |
| sphere | area | 82 | [55.96, 194.93] / ±23.35 | [55.96, 194.95] | **0.278 mm** | 0.9937 |
| box 40 @(60,20,0) | directional | 6 | [-45.78, 80.00] / ±20.00 | identical | **0.000000 mm** | 1.0000 |
| box | point | 6 | [40.00, 218.18] / ±27.27 | identical | **0.000000 mm** | 1.0000 |
| box | spot | 6 | [40.00, 218.18] / ±27.27 | identical | **0.000000 mm** | 1.0000 |
| box | area | 6 | [40.00, 218.18] / ±27.27 | identical | **0.000000 mm** | 1.0000 |
| torus (sx40/sy12/sz40, detail 24) @(60,30,0) | directional | 64 | [-42.26, 33.58] / ±33.36 | — (annulus) | **hole 22.08 mm wrongly covered** | — |
| torus | point / spot / area | 68 | [100.58, 202.17] / ±41.86 | — (annulus) | **hole 24.14 mm wrongly covered** | — |

Readings:

- **The projector itself is correct.** Convex casters land on the analytic answer: the box is exact to
  the last bit (`0.000000 mm`, all four light types), and the sphere is inside **0.28 mm** — pure mesh
  discretisation (`detail: 20` → an inscribed 40-gon; the hull area is 0.63 % under the true ellipse,
  which is the inscribed-polygon deficit, not a projection error). Nothing here is above a pen width
  (0.3 mm) and nothing is light-type-dependent.
- **`area` is byte-identical to `point`** in every row. `projectLightToPlane` (shadows.js:409-418)
  treats an area light as a single position, so an area light's receive footprint has a hard edge and
  no penumbra. W-30 and W-30b both disclosed this as "matches the ground-shadow precedent"; §1c shows
  the *shading* half of the same gap is a real defect.
- **The one real geometric defect is non-convex casters.** `buildFaceFootprint` reduces the caster to
  `Shadows.convexHull` (`scene3d.js:1434`), so a torus's hole is filled in. Measured as the largest
  empty disc inside the emitted footprint that no projected caster vertex reaches: **22.08 mm**
  (directional, centred at world (-4.3, -0.4)) and **24.14 mm** (positional, centred at (149.5, -0.5)).
  Cross-checked against the ray-cast oracle (`ShadowReceive.pointInShadow` on a 4 mm grid inside the
  footprint): **35.5 % of the point-light footprint's area and 45.8 % of the directional footprint's
  area is not actually occluded.** Both are two orders of magnitude over a pen width.

### 1b. …and it renders as *no shadow at all* for the torus (worse than over-cover)

The over-cover interacts with a second bug and cancels the whole feature. `scene3d.js:2496-2503` picks
**one** tone sample per footprint — the polygon's own centroid — on the stated assumption that "a
directional hard shadow is BINARY". For a hull-with-a-hole the centroid lands *in the hole*:

| caster | light | footprint centroid | `pointInShadow(centroid)` | ink density: hole / ring / off-footprint |
|---|---|---|---|---|
| torus | point | (150.07, 0) | **false** | 0.1566 / 0.1566 / 0.1566 (**ratio 1.00**) |
| torus | directional | (-4.34, 0) | **false** | 0.1380 / 0.1380 / 0.1380 (**ratio 1.00**) |
| sphere | point | — | true | 0.4731 in-band / 0.1566 out (**ratio 3.02**) |

So the inside pass gets the *unshadowed* spacing, the even-odd outside pass has already excluded the
footprint, and the two families render at the same pitch: **a torus casting on a flat face produces no
visible receive shadow at all**, in both the directional (pre-W-30) and the positional (post-W-30b)
paths. This is a user-visible hole in a shipped feature, not a sub-pen refinement.

### 1c. Area-light softening when the occluder is partially in the way (the Unit D gate)

`regions.js:176` — `if (typeof shadowFn === 'function' && shadowFn(P, light)) continue;` — sits one line
**above** the `type === 'area'` branch at `regions.js:177-196`. `ShadowReceive.pointInShadow`
(`shadow-receive.js:182-190`) casts **one** ray, at `light.position` (the emitter's centre), so an area
light is fully on or fully off. The N-sample Fibonacci spread (`areaSampleOffset`, `regions.js:130-135`)
never runs when the centre ray is blocked.

Measured on a bespoke rig — 40 mm box at `(0,60,0)` over the y=0 plane, area light at `(-300,300,0)`
size 120 (radius 60) samples 6 intensity 1, receiver normal `(0,1,0)` — marching x from 30 to 140 mm in
2 mm steps. `current_I` = today's `combinedIntensity(n,P,[area],shadowFn)`; `perSampleGated_I` = the
same average with each sub-sample gated by its own ray:

| x (mm) | visible sub-samples (of 6) | unshadowed I | **current I** | **per-sample-gated I** | \|Δ\| |
|---|---|---|---|---|---|
| 30–36 | 1 | 0.671→0.664 | **0** | 0.0963→0.0953 | 0.096 |
| 38–104 | 0 | 0.662→0.595 | 0 | 0 | 0 |
| 106–128 | 1 | 0.593→0.573 | **0** | 0.1141→0.1106 | 0.114 |
| 130–134 | 3 | 0.572→0.568 | **0** | 0.3062→0.3044 | 0.306 |
| **136** | 4 | 0.566 | **0** | **0.3985** | **0.3985** |
| 138–140 | 4 | 0.565→0.563 | **0.5645** | 0.3973 | 0.167 |

- **Max under-lighting error: 0.3985** of the [0,1] intensity range, at x=136 — 70 % of the local
  unshadowed value. **Max over-lighting error: 0.1672**, at x=138, on the other side of the same edge.
- The penumbra that should exist runs **x ∈ [106, 138] ≈ 32 mm wide** (plus an 8 mm outer band at
  x ∈ [30, 36]). Today it is rendered as a **step of width 0** between x=136 and x=138.
- The current profile takes exactly **two** distinct values across the whole 110 mm march (0 and
  0.5645); the per-sample reference takes **five**. Softening is not "reduced" when occluded — it is
  entirely absent, exactly as `unit-d-notes.md` line 79 says.

### 1d. Point / spot / area receive through the full pipeline — and a light-ordering defect

Through the real `AlgorithmRegistry.scene3d.generate()`, sphere caster + 500 mm plane receiver, probe
window 12×12 paper units, probe at world (130, 0) (inside the true perspective footprint) vs control at
(-150, 0):

| `p.lights` | probe density | control density | ratio |
|---|---|---|---|
| `[point]` | 0.4731 | 0.1566 | **3.02×** |
| `[spot]` (cone 45 aimed at the caster) | 0.4731 | 0.1566 | **3.02×** |
| `[area]` (size 120, samples 6) | 0.4731 | 0.1566 | **3.02×** |
| `[point, ambient]` | 0.4731 | 0.1599 | 2.96× |
| **`[ambient, point]`** | **0.1599** | 0.1599 | **1.00× — the shadow is gone** |

`scene3d.js:1303` — `const light = (p.lights && p.lights[0]) || {};` — the footprint is built for
**`lights[0]` only**. An `ambient` at index 0 is not positional, so `projectLightToPlane` falls back to
the parallel projector with `Regions.Lighting.lightWorldDir`'s 135°/45° default (`regions.js:42-49`),
and the point light's shadow disappears: no band at its true location (0.1599 = the unshadowed
baseline), and none at the default-direction location either (probed (46, 14): 0.1599). Probe near the
caster drops 0.3085 → 0.1081. This is reachable from the UI — the default light list is
`[{ id:'sun', type:'directional' }]` (`src/config/defaults.js`), so any light a user *adds* is never
`lights[0]`. Note the related, separate saturation case: with `[point(intensity 4), sun]` the polygon is
in the right place but both sides of it clamp to I=1, so the band is tonally inert — that one is
arguably correct multi-light behaviour and is **not** proposed as a fix here.

### 1e. The abrupt-end question — answered, with file:line

**The point-light footprint is a correct ellipse. The "rectangular band ending abruptly" is a viewing
artifact, and it is a property of the evidence capture, not of `shadows.js`.** Three independent lines,
two of them mine and one the W-30b reviewer's:

1. **Emitted-geometry map (mine, this export).** Running the exact evidence rig through the real
   `generate()` and probing ink density on a 2 mm world grid, the dense region is a clean lens/ellipse
   — 1041 dense probes inside the analytic tangent-cone ellipse, 33 outside it (max **1.61 mm** beyond
   the true boundary) and 34 sparse probes inside it (max **4.22 mm** short), both dominated by the
   8-unit probe window, not by geometry. Along z=0 the density is 0.157 (baseline) up to x≈75, 0.4731
   from x≈85 to x≈185, and back to baseline by x=205 — the analytic ellipse is x ∈ [55.96, 194.95].
   The ASCII map is an ellipse tapering to nothing at z = ±21 mm; there is no rectangle anywhere in the
   emitted geometry.
2. **The W-30b reviewer's condition-5 measurement (consumed).** `W-30b-review.md` §5 logged
   `buildFaceFootprint`'s actual polygon — 82 vertices, x [55.96, 194.93], z ±23.35, aspect 2.98:1 —
   and cross-checked it against a from-scratch 200 000-point Fibonacci sampling of the true sphere
   surface hulled with `scipy.spatial.ConvexHull`: x [55.9588, 194.9504], z ±23.3549. **My independent
   numbers reproduce theirs to 3–4 significant figures.** Their verdict — correct optics, an extreme
   grazing-angle aspect ratio that reads as a band because the footprint is drawn only as a hatch
   density change with no boundary stroke — stands, and W-30c adopts it.
3. **Pixel forensics on the PNGs (mine).** All four full-frame shots —
   `point-after-full.png`, `point-before-full.png`, `directional-fixed-full.png`, `spot-after-full.png`
   — have an **identical ink bounding box, x ∈ [67, 820], y ∈ [647, 1202]** (threshold >60/255;
   everything outside is the uniform background value 18). Column ink counts run 60, 60, 60 at
   x = 800/810/820 and then **0** from x=830 on, in every shot including the pre-fix one. A boundary
   that is byte-identical across before/after and across light types cannot be the shadow; it is the
   capture frame of `scripts/w30b-footprint-wiring-evidence.js` (its `WORLD_WINDOW` → `frameWorldWindow`
   → `shot(sx,sy,sw,sh)` path, ~lines 173-215). The straight vertical cut a human eye reads as "the
   footprint ending abruptly" cuts the sparse *outside* hatch at exactly the same x, which is the tell.

**Root cause of the flag: none in `shadows.js`.** Two follow-ups instead, both adopted into §4 and §6:
pick a less grazing evidence rig, and frame it to contain the whole footprint plus margin.

---

## 2. Root causes, with file:line

| # | Defect | Root cause | Where |
|---|---|---|---|
| R1 | Area light loses **all** softening when occluded (max intensity error 0.3985; 32 mm penumbra → 0 mm) | The occlusion gate is evaluated once, for the emitter's centre, **before** the N-sample loop; `pointInShadow` is a single ray at `light.position` | `src/core/scene3d/regions.js:176` (gate) vs `:177-196` (area branch), `:130-135` (`areaSampleOffset`); `src/core/scene3d/shadow-receive.js:182-190` (single ray to `light.position`) |
| R2 | Non-convex caster's footprint fills its hole (22.08 / 24.14 mm; 35.5 % / 45.8 % of the polygon is not occluded) | The receive path reduces the caster to a **convex hull**; the ground path does not | `src/core/algorithms/scene3d.js:1434` (`Shadows.convexHull(uvPts)`); the trade-off is documented at `src/core/scene3d/shadows.js:487` ("the hull fills a concave/torus hole") — and `shadows.js:2877-2879` shows `build()` uses `casterHull` only for the **draft** frame and `casterSilhouetteLoops` (holes preserved) for the full frame. The receive path is the only site still hard-wired to the draft-quality primitive |
| R3 | …and that makes the torus shadow **vanish entirely** (density ratio 1.00 vs 3.02 for a sphere) | The footprint's tone is sampled at **one** point, the polygon centroid, which for a hull-with-a-hole is not occluded (`pointInShadow(centroid) === false`, both light classes) | `src/core/algorithms/scene3d.js:2496-2503`, esp. `:2499` (`centroidWorld`) and `:2500` (`insideSpacing`) |
| R4 | An `ambient` light at index 0 deletes a point light's receive shadow (3.02× → 1.00×) | The footprint is built for `lights[0]` only, whatever its type; the tone is multi-light | `src/core/algorithms/scene3d.js:1303-1305` (`light` / `lightDir`), consumed at `:1423-1425` (`projectFootprintPoint`) and `:1343` (`shadowReceiveOn` requires a truthy `lightDir`) |
| — | Spot **cone** is ignored by the footprint builder | `projectLightToPlane` has no cone gate (`shadows.js:409-418`) | **Measured and dismissed.** A caster outside the cone always projects to a footprint that is also outside the cone (both are radial from the same apex), so the omission is unreachable. Verified: spot cone 6° aimed away → probe 0.7330 / control 0.7239 / far 0.7334, i.e. a uniformly dark face and no spurious band. **No fix proposed.** |

---

## 3. RED oracles — files, assertions, and today's numbers

All three are new files. Each must fail on the pre-fix tree by the stated margin, and every RED number
below was measured in this export at `57aa71b2`. Use the existing `makeMultiFilePreShaRuntimeOptions`
pin convention (`tests/helpers/pre-wip-surface-fill.js`) as `scene3d-shadow-footprint-{direction,wiring}.test.js`
already do, with env vars `VECTURA_PRE_W30C_A/B/C`.

### O1 — footprint accuracy (`tests/unit/scene3d-shadow-footprint-accuracy.test.js`)

Module-level, on `Shadows` + `Scene.assembleScene` (no render), `describe.each` over the four light
types. Green-baseline half (must pass before **and** after — it is the byte-identity anchor for R2's fix):

- box caster, all four light types: hull vs the exact 8-corner projection, two-sided Hausdorff
  **≤ 1e-9 mm** (today `0.000000`).
- sphere caster, all four: hull vs the analytic tangent-cone / cylinder ellipse (720 boundary samples),
  **≤ 0.50 mm** (today 0.235 directional, 0.278 point/spot/area) and area ratio ∈ [0.98, 1.02]
  (today 0.993 / 0.9937).

RED half:

- torus caster, directional **and** point: on a 4 mm grid of points inside the emitted footprint,
  the fraction not occluded per `ShadowReceive.pointInShadow` must be **≤ 0.05**.
  **Today: 0.458 (directional), 0.355 (point) → RED.**
- torus, both: largest empty disc inside the footprint that contains no projected caster vertex must be
  **≤ 2.0 mm**. **Today: 22.08 mm (directional), 24.14 mm (point) → RED.**

Keep the analytic side written from scratch in the test (no call into `shadows.js`) — the W-30 reviewer
specifically checked that the oracle's left-hand side is external, and the same standard applies here.

### O2 — area-light gate (`tests/unit/scene3d-area-light-shadow-softening.test.js`)

Module-level on `Regions.combinedIntensity` + `ShadowReceive`, rig exactly as §1c (40 mm box at
`(0,60,0)`, plane receiver, area light `(-300,300,0)` size 120 samples 6 intensity 1, march x 30→140
step 2). Reference = the same Fibonacci offsets, each sub-sample gated by its own ray.

- **A (penumbra exists):** the profile must take **≥ 4 distinct values** over the march.
  **Today: exactly 2 (`0` and `0.5645`) → RED.**
- **B (accuracy):** `max |current − perSampleGated| ≤ 0.05`.
  **Today: 0.3985 at x=136 → RED** (and 0.1672 over-lit at x=138).
- **C (penumbra width):** the x-range over which the intensity is strictly between 2 % and 98 % of the
  local unshadowed value must be **≥ 20 mm**. **Today: 0 mm → RED**; the reference gives 32 mm.
- **D (guard, passes both sides):** the identical march with the light retyped `point` at the same
  position must be **bit-identical** before and after the fix (the fix lives inside the `area` branch).

### O3 — point / spot / area receive, integration (`tests/unit/scene3d-shadow-receive-lighttypes.test.js`)

Full `AlgorithmRegistry.scene3d.generate()` pipeline, sphere caster + 500 mm plane receiver, flag ON,
probe (130, 0) vs control (-150, 0), 12×12 window — the `inkInWindow` / `clippedLenInBox` helpers
`scene3d-shadow-receive.test.js` and `scene3d-shadow-footprint-wiring.test.js` already share. This file
also **closes the "point/spot receive not integration-covered" gap** named in `STILL-OPEN.md` line 8.

- coverage half (`describe.each` point / spot / area, must pass both sides): ratio **≥ 2.0**.
  **Today: 3.02× for all three** — this is the coverage O3 exists to add, and it is not vacuous
  (the control window is measured, not assumed).
- **RED half:** with `p.lights = [ambient(0.15), point]` the ratio must still be **≥ 2.0**.
  **Today: 1.00× (0.1599 / 0.1599) → RED.** Control case `[point, ambient]` → 2.96× today, must stay.
- **Guard:** `p.lights = [sun]` output md5-identical before/after (F3 is a no-op there).

---

## 4. Ranked fixes (3), exact edits, guards, byte-identity, perf

### F1 (rank 1) — per-sub-sample occlusion for area lights · `src/core/scene3d/regions.js`

Move the gate at `:176` to sit **after** the area branch, and gate each sub-sample inside the loop:

```js
      if (type === 'area') {
        const pos = light.position || v(0, 0, 0);
        const radius = Math.max(0, finite(light.size, 120) / 2);
        const N = clamp(Math.round(finite(light.samples, 6)), 2, 16);
        let sum = 0;
        for (let s = 0; s < N; s++) {
          const off = areaSampleOffset(s, N, radius);
          const Ls = v(pos.x + off.x, pos.y + off.y, pos.z + off.z);
          // W-30c — gate PER SUB-SAMPLE. The old code gated the whole emitter on
          // ONE ray to light.position, one line above this branch, so a partly
          // occluded area light collapsed to zero instead of softening.
          if (typeof shadowFn === 'function' && shadowFn(P, { ...light, type: 'point', position: Ls })) continue;
          const toL = sub(Ls, P);
          const dist = Math.hypot(toL.x, toL.y, toL.z);
          const dir = dist > 1e-9 ? mul(toL, 1 / dist) : v(0, 1, 0);
          sum += Math.max(0, dot(n, dir));
        }
        total += (sum / N) * weight;
        continue;
      }
      if (typeof shadowFn === 'function' && shadowFn(P, light)) continue; // this light is blocked at P
```

`ambient` already `continue`s above the gate (`:175`), and `point`/`spot`/`directional` all fall
through to the moved line in the same order, so the reordering is behaviour-preserving for every other
type by construction. Spreading `...light` keeps `intensity`/`castShadows`/`id` on the synthetic light
in case a future `shadowFn` reads more than `type`/`position` (`pointInShadow` reads only those two —
`shadow-receive.js:180-190`).

**Guards that must not move:** none. Do not touch the `[0,1]` clamp, `positionalAtten`, the spot
smoothstep, or `areaSampleOffset`'s golden-angle constants.
**Byte-identity set:** every scene whose lights contain no `area` light — structurally, the edited code
is inside `if (type === 'area')`. Prove it, don't assert it: U0's 48-law byte-identity sweep, Unit D
receive 17/17 with its 9.8e-15 phase lock and 3.0× density, W-30's 17/17, W-30b's 5/5 including its
directional-md5 guard, `scene3d-shadows.test.js` 18/18.
**Perf:** N extra rays where there was 1. Measured in isolation on this rig: `pointInShadow` × 20 000
points = 37 ms at N=1, 206 ms at N=6 → **5.57×** on the shadow-ray budget alone. End-to-end the flag
costs ~2 % here (see below), so the budget is **≤ 1.15× for area-light scenes, 1.00× for all others**.

### F2 (rank 2) — non-convex casters · `src/core/scene3d/shadows.js` + `src/core/algorithms/scene3d.js`

Two edits; **(b) is the visible half and can ship alone** (see §7).

**(a) `shadows.js`** — hoist `lightFaceSign` / `lightClassifyEdges` out of `build()`'s closure
(`:2615-2652`) to module scope, parameterised by `{ positional, lightPosition, lightDir }`, and add one
export beside `projectLightToPlane`:

```js
  // W-30c — the receive path's caster reduction, matching what build() already
  // does for the FULL ground frame (`casterSilhouetteLoops`, :2879) instead of
  // the DRAFT-quality convex hull (:2877, whose own comment at :487 says "the
  // hull fills a concave/torus hole"). Falls back to convexHull when the loops
  // degenerate, so nothing can get worse than today.
  const footprintRings = (record, projectVertex, light, fallbackDir) => { … };
```

**(b) `scene3d.js:1434`** — `const hull = Shadows.convexHull(uvPts);` becomes a call to
`Shadows.footprintRings(otherRec, projectFootprintPoint→UV, light, lightDir)`, each returned ring
clipped by the existing `clipToConvexCCW(ring, faceCCW)`; and `scene3d.js:2496-2503` gains an
occlusion-valid tone sample:

```js
            let sampleWorld = scaf.toWorld({ x: cx / fp.length, y: cy / fp.length });
            // W-30c — R3: a hull-with-a-hole puts the centroid in the hole, so
            // the "binary shadow, one sample" shortcut read the UNSHADOWED tone
            // and the whole footprint rendered at the outside pitch.
            if (shadowFn && !shadowFn(sampleWorld, light)) {
              sampleWorld = firstOccludedSample(fp, scaf, shadowFn, light); // ring-vertex inward midpoints
            }
            if (!sampleWorld) return;               // no genuinely shadowed sample → emit no split
```

**Guards that must not move:** Unit D's phase lock (`worstPhase/outerStep ≤ 0.05`, today 9.8e-15) and
its `≥ 1.4×` density bar (today 3.0×) — the memo it depends on is keyed on **ring object identity**
(`STILL-OPEN.md:141`), so `footprintRings` must hand `scene3d.js` the *same array objects* it later
passes as `[fp]`; do not clone, `.map()` or serialise the rings between the outside `.concat` and the
inside calls. Also unchanged: W-30's 17/17, W-30b's 5/5, Unit C overlap 4/4,
`scene3d-hlr-spatial-index-identity.test.js` 6/6.
**Byte-identity set:** **every convex caster must be bit-identical** — box, plane, sphere, cone,
pyramid, capsule, superellipsoid — for all four light types, because a convex mesh's silhouette loop
and its convex hull are the same ring. That is the acceptance assertion for (a), and O1's box/sphere
half is its oracle. Non-convex casters (torus, torusKnot, cylinder, boolean-subtracted solids) **will
change, and must** — that is R2/R3 — so every gallery/U0 cell touched by (b) has to be enumerated and
explained in the report. Directional scenes are **not** exempt here: R2/R3 are pre-W-30 defects that
affect the directional path identically (45.8 % over-cover, ratio 1.00). Run the U0 48-law sweep and
expect it green (its cells are box/sphere) — if any law moves, stop and report rather than re-pinning.
**Perf:** silhouette classification is per caster per face, memoised by the existing
`faceFootprintCache` (`scene3d.js:1405`, keyed on `scaf.uv`). Budget **≤ 1.10×** with the flag ON.

### F3 (rank 3) — the footprint's light · `src/core/algorithms/scene3d.js`

Do **not** change `light`/`lightDir` at `:1303-1305` — they also feed `toneOn`, the specular term and
`shadowReceiveOn`. Scope the change to `buildFaceFootprint` only:

```js
        // W-30c — R4: the footprint is a GEOMETRIC construction and needs a light
        // that has a position/direction. lights[0] may be an ambient (the UI
        // appends new lights after the default sun), which fell back to
        // lightWorldDir's 135/45 default and put the shadow nowhere.
        const fpLight = (p.lights || []).find((l) => l && l.type !== 'ambient' && l.castShadows !== false) || light;
        const fpDir = (Lighting && fpLight !== light) ? Lighting.lightWorldDir(fpLight) : lightDir;
        const projectFootprintPoint = typeof Shadows.projectLightToPlane === 'function'
          ? (P) => Shadows.projectLightToPlane(P, fpLight, anchor, normalWorldArg, fpDir)
          : (P) => Shadows.projectAlongDirToPlane(P, fpDir, anchor, normalWorldArg);
```

and use `fpLight` for the §F2(b) tone-sample gate too, so the polygon and its shading agree.
**Byte-identity set:** any scene whose `lights[0]` is already a non-ambient shadow caster — which is
every default scene (`src/config/defaults.js` ships `[{id:'sun', type:'directional'}]`), every existing
test rig, and all 1385 manifest cells. **Perf:** one `Array.prototype.find` per `generate()`; 0×.
**Explicitly out of scope:** one footprint per shadow-casting light (a real improvement, but it changes
the polygon count and the Unit D phase memo's shape — file it, do not build it).

### Perf, measured today (the baseline the budgets are against)

| rig | flag OFF | flag ON | ratio |
|---|---|---|---|
| flat plane receiver + sphere caster, point light | 85 / 89 / 86 ms | 86 / 91 / 88 ms | **1.02×** |
| flat plane receiver + sphere caster, directional | — | 87 / 90 / 95 ms | 1.02× |
| curved receiver (sphere r120 detail 40) + sphere caster, area light | 629 / 644 / 616 ms | 632 / 654 / 650 ms | **1.02×** |

Unit D's carried "2.3× simple / 3.3× dense / 4.3× dense-scene" numbers (`STILL-OPEN.md:8`,
`unit-d-notes.md:73`) **do not reproduce on these rigs** — report that as a measurement, do not restate
the old figures as fact and do not "fix" the discrepancy; it is a different scene, not a regression.

---

## 5. LANE — where W-30c should land, and the exact file overlap

**Recommendation: land W-30c on `fill-collapse-2` (branch `3d-scene/fill-collapse-2`), serialised
after U7 closes, with handoff-c consulted as the `shadows.js` owner** — mirroring the W-30b ruling
(`LEDGER.md` row 32, `STILL-OPEN.md:536`).

File overlap, verified read-only on the live worktrees (`git diff --stat 47a5a755..HEAD`, and
`git status --short`, this session):

| file W-30c needs | fill-collapse-2 (`bfe8fdb4`) | handoff-c2 (`ed778940`) | verdict |
|---|---|---|---|
| `src/core/scene3d/shadows.js` (F2a) | untouched | untouched | **no conflict on either branch** — confirms the secretary's check |
| `src/core/scene3d/regions.js` (F1) | untouched | untouched | **no conflict — but see the flag below** |
| `src/core/algorithms/scene3d.js` (F2b, F3) | **touched — W-30b's `+13/−1`, inside `buildFaceFootprint` itself** | untouched | **the deciding file** |
| `src/core/scene3d/shadow-receive.js` | untouched | untouched | W-30c does not need to edit it (read-only consumer) |
| `src/core/scene3d/params.js` | untouched | **touched — U9's +37/−3 in the shadow bag; W-10d-2 still queued on it** | **W-30c does not need it. If a fix appears to, STOP and flag — do not absorb it** |

Why fill-collapse-2 and not handoff-c2 + a cherry-pick of `57aa71b2`: F2(b) and F3 edit the *same
function*, and in F3's case the *same three lines*, that W-30b just rewrote. Cherry-picking `57aa71b2`
onto handoff-c2 would duplicate that commit on two live branches and guarantee a conflict inside
`buildFaceFootprint` when both merge. `shadows.js` — handoff-c's file, and the reason handoff-c2 was
the other candidate — is clean on both branches, so the lane choice costs nothing there. handoff-c
should be **consulted, not assigned**: its own branch (`0d405577`) predates the `47a5a755` merge and is
stale.

Two hard preconditions before the implementer starts:

1. **U7 is in flight in that worktree** and its HEAD `bfe8fdb4` is an *unverified* rate-limit
   checkpoint. W-30c must not start until U7 closes. When it does, W-30c must not touch U7's files:
   `src/config/scene3d-tone-laws.js`, `src/config/context-bar.js`, `src/ui/**`,
   `tests/unit/scene3d-fill-style-effective-law.test.js`,
   `tests/integration/scene3d-fill-style-picker.test.js`, `tests/unit/scene3d-tone-law-collapse.test.js`.
2. ⚠ **`src/core/scene3d/regions.js` is not in AGENT-PROTOCOL.md's serialization table.** It is clean on
   both live branches today, but it is an unassigned shared file — the same shape of hazard `params.js`
   turned out to be. The orchestrator should assign it to W-30c explicitly before F1 starts, and W-30c
   must re-run `git status`/`git diff` on it immediately before editing.

---

## 6. Evidence — bespoke scenes, specified

**No gallery cell can be used.** Verified this session: across `manifest.A.1-50.jsonl` (12 cells) and
`manifest.B.1-5.jsonl` (1373 cells), `shadowReceiveOnObjects` appears **0 times**, and there is no
`point` or `area` light in any cell. This is the fourth logged gallery coverage gap
(`STILL-OPEN.md:142`). Everything below is bespoke, committed as `scripts/w30c-*-evidence.js`, output to
`docs/3d-audit/fill-audit/after/W-30c/` with a `report.json` carrying the §1 numbers.

1. **`w30c-footprint-shapes`** — 3 casters (sphere / box / **torus**) × 2 lights (point, directional)
   over a 500 mm plane, flag ON, before/after per cell. **Fix the two W-30b framing lessons:** (i) use a
   **less grazing** light — `(-160, 260, 60)` gives an aspect near 1.3:1 instead of W-30b's 2.98:1, per
   `W-30b-review.md` §5's own recommendation, so a reviewer is not misled into reading an ellipse as a
   band; (ii) size the capture window from the *footprint's* world bbox plus a 30 mm margin — W-30b's
   twelve PNGs all share ink bbox x[67,820] y[647,1202], so the far end of its ellipse is not visually
   verifiable in any of them. The torus cells are the money shot: today there is **no visible shadow**
   at all, after F2 there must be an annular one.
2. **`w30c-area-penumbra`** — the §1c rig, area light size 120 samples 6, before/after, plus the
   intensity profile table (x, current, per-sample, unshadowed) written into `report.json` and rendered
   as a small plot. Expect a hard step before and a ~32 mm graded band after.
3. **`w30c-multilight`** — sphere + plane, `lights = [ambient, point]`, before/after: the band at world
   (130, 0) goes 0.1599 → ≥ 0.40 (ratio 1.00× → ≥ 2×).

Protocol reminders that have cost this audit units before: **crop the footprint boundary at native
resolution** (PIL crop → Read) before judging, and say in the report what you actually saw — a whole
800 px cell hides sub-mm defects. State the `window.Vectura.APP_VERSION` each script printed and compare
it to the worktree's `package.json`. Do not let a script swap a source file on disk (Unit D's
`unitd-phase-evidence.js` did; `STILL-OPEN.md:142` flags it as a footgun) — use a scratch `git archive`
export on a second port, the way `w30b-footprint-wiring-evidence.js` correctly does.

---

## 7. Stop conditions

- **F2(a) is the risk.** If hoisting `lightClassifyEdges`/`lightFaceSign` out of `build()` cannot be
  done while keeping every convex caster bit-identical, **ship F2(b) alone** (the occlusion-valid tone
  sample — which by itself turns the torus shadow from invisible into visible, just still hole-filled)
  and park F2(a) as W-30d with the 22.08 / 24.14 mm and 35.5 % / 45.8 % numbers. Do not force it.
- **If any F2 change moves a U0 tone-law cell**, stop and report which law and by how much. Do not
  re-pin a fingerprint to make the sweep green.
- **Never widen a bar.** Unit D's `≤ 0.05×` phase bar (9.8e-15 today), its `≥ 1.4×` density bar (3.0×
  today), O1's 0.50 mm sphere bar and O2's 0.05 intensity bar are floors, not negotiables. Any change
  to any numeric threshold anywhere requires a `## Bars changed` entry (`file:line — old → new — why`)
  in the report **and** the commit body.
- **If F1 costs more than 1.5×** end-to-end on an area-light dense scene, stop at the measurement and
  propose capping the gate's sample count rather than shipping a slow default.
- **Do not touch `src/core/scene3d/params.js`** (handoff-c2/U9 + W-10d-2 contention). If a fix seems to
  need a new param — e.g. an "area shadow samples" knob — stop and flag it; the honest shape of F1 uses
  the existing `light.samples`.
- **Do not re-open the abrupt-end question.** It is answered (§1e): the projector is right to 0.28 mm,
  and the picture is a framing/aspect artifact. If the new evidence still reads as a band at 1.3:1, that
  is a *rendering legibility* follow-up (a drawn footprint boundary stroke), not a `shadows.js` unit —
  file it, do not build it.
- **The spot-cone omission is measured and dismissed** (§2, last row). Do not spend the unit on it.
- If `regions.js` turns out to be owned or in flight on another lane by the time W-30c starts, stop and
  report rather than editing it.

REPORT docs/3d-audit/lane-reports/W-30c-plan.md
