STATUS: PLANNED — mechanism prototyped and measured. The prototype reads as a clean zig-zag, and every bar below passes on it.

# W-07b-2 plan: deepFillTSP shadow density done with structure, not amplitude

Role: planner (read-only). No `src/` or `tests/` edits in MAIN or in any worktree, and no commit.
Base sha: `0b87a9b9` (v1.4.3). The rejected unit is `776d9285` on `3d-scene/fill-audit-b5`.
The prototype ran from three scratch `git archive` exports under
`/private/tmp/claude-501/scratch-W-07b-2/{base,rej,proto}`, with `node_modules` symlinked. Node v20.20.2.
Port 8477 was used for captures only and was killed after each tree.

## 0. Verdict in one paragraph

deepFillTSP now **rides Ladder's own rulings**. It becomes a member of the continuous even-ladder placement.
In the darkest ramp (I < TSP_I = 0.18) it adds a **corridor-bounded triangle-wave traverse**:
- Amplitude is ≤ 0.4 × the real gap to the ruling's nearer neighbour.
- The period is fixed to the master pitch.
- The turning points are emitted as their own vertices, not sampled at the ruling's 1.5–2.5 mm steps.

Outside the ramp the output is bit-identical to Ladder, so clause B holds exactly. In the ramp the ink can only
increase. On 12/12 cells the traverse adds **zero** new fill×fill crossings.

I looked at the native crops myself. **The proto reads as a clean, regular zig-zag at med density on
sphere, torus and cone, on both rigs.** At max density it reads as a fine, regular woven texture with no
scribble and no crossings. It covers more of the paper than Ladder does (pixel coverage 0.54–0.58 against
0.51–0.55).

The prototype also found and fixed a defect that no earlier report saw. It is on the `contour` mapper,
which base and 776d9285 both carry (§5.4).

## 1. What deepFillTSP should look like in shadow, and why this mechanism

**The picture.** Each ruling stays where Ladder puts it. Where the form is darker than TSP_I, the ruling picks
up a zig-zag with these properties:
- **Regular:** one period per ruling, fixed in mm.
- **Evenly sloped:** the legs are at 45° or less.
- **Bounded to the ruling's own corridor:** it never reaches more than 0.4 of the way to its nearer
  neighbour, so two neighbours can close to 0.2 × gap at worst and never touch.

The darkening comes from the longer path: 45° legs give √2 more ink per mm of ruling. It does not come
from width, so it cannot scribble.

**Why this and not the alternatives.**

- **Amplitude (776d9285):** rejected by review. At a 1.5 × pitch share the zig-zag runs 1.5 pitches past its
  neighbour. Measured: 4–700 fill×fill crossings in the shadow region where Ladder has 0–9.
- **A denser period without its own vertices:** this is the real cause of the "jagged, irregular sawtooth"
  in both base and 776d9285. `tspAt` placed the wave only at the ruling's samples. At the default budget
  those are 1.5–2.5 mm apart, up to 8.9 × masterPitch at max density. A 3.2 mm wave sampled there aliases
  into random-amplitude spikes. The impl report saw this and kept the long period. The fix is to **emit
  the turning points as vertices**: a triangle wave is exactly piecewise-linear between its extrema. This
  makes any period legal at any sample spacing.
- **Keeping more rulings:** yes. This is the second half. The rejected unit's flat `1` ruled the *master*
  grid everywhere. That removed all lit tone and drew the lit third at **1.46–2.24 × Ladder's ink**
  (measured below). This fails clause B in the other direction.
  Ladder's own placement already rules the darks at masterPitch. The law's promise is "Ladder, plus a
  traverse where Ladder has run out of pitch", which is simply Ladder's rulings plus the traverse.

### 1.1 The mechanism, precisely (as prototyped; `proto-vs-0b87a9b9.diff`)

1. **Placement.** Add `|| TONE_ALGO === 'deepFillTSP'` to `isEvenLadder()` (surface-fill.js:4959–4960).
   deepFillTSP then walks `emitContFamily` with `ladderWantedPitch` → `ladderCov`, whose non-fine
   branch is `coverageForSample`, exactly Ladder's.
   `algoCoverage`'s deepFillTSP branch (:5278–5311) becomes unreachable. Delete it. Do **not** keep the
   flat-`1` branch from 776d9285.
2. **Amplitude:** `A(s) = k · 0.4 · g(s)`, capped by `endMM[s]/2` and by `P/4`. The P/4 cap keeps the legs
   at 45° or less.
   - `k = tspRamp(I)` is unchanged.
   - `g(s)` is the **real** perpendicular gap to the nearer neighbour. Take the min of `pitchAtStep` and two
     chart probes: `sampleAt(pr ± pitchStep)`, projected on the ruling's normal. The linearised
     `perpPitch` misses foreshortening at the limb.
   - `A = 0` in three places:
     - where `g < inkWidth()`: rulings that already overlap are solid ink, so there is nothing to traverse;
     - on the family's first and last ruling (`lineIndex === 0 || lineIndex === count-1`), see §6 flag 5;
     - for `k = 0`.
3. **Period:** `P = 1.6 · max(masterPitch, floorPitch)`, fixed per object, not per sample. With A = 0.4g and
   g ≈ masterPitch in the darks, this gives the 45° legs above.
4. **Phase:** accumulated along arc, `φ = arc/P + φ0`.
   - `φ0 = frac(round(frac01(threshold)·4096) · GOLDEN_STEP)`. The phase is keyed on the ruling's family
     position, not on `lineIndex`, so a seam twin gets the same phase.
   - The per-ruling phase stays aperiodic across rulings, as in the law's own text.
5. **Vertices:**
   - Between consecutive emitted samples s−1 and s of the same run, emit one vertex at every extremum
     `φ = ¼ + n/2` in (φ(s−1), φ(s)).
   - Each vertex sits at the linear position on the chord, displaced by the lerped amplitude along the
     **lerped vertex normals** (central differences at s−1 and s, normalised).
   - Then displace sample s itself by `A(s)·tri(φ(s))` along its own vertex normal.
   - The lerped normal is what removes micro self-loops at bends. See mutation M5.
6. **On-surface guarantee (`tspPlace`):**
   - Keep the screen-space target. Accept it only if the chart resample at (pr + J⁻¹·v) is front-facing
     **and** lands within 0.35·|A| of the target.
   - Otherwise halve A, up to 3 times, then fall back to the undisplaced point.
   - Pure chart placement was tried. It produced long cross-ruling jumps on cone, where the chart runs
     into the base cap (tMax 6.7–9.6 × mp). The hybrid has none.
7. **Contour turn-refinement opt-out:**
   - Every displaced vertex is `addPt`'d with `tt = NaN`.
   - `refineFillRunTurns` (contour mapper and closed rings only) bisects a turn by re-sampling the ruling at
     the mid-parameter. On a zig-zag that plants an **undisplaced** point between two displaced ones, which
     makes the hairpin spikes (§5.4).
   - NaN makes it skip exactly those edges (`Number.isFinite(t0) && Number.isFinite(t1)` guard). Run ends
     are undisplaced (`endMM = 0`), so `runTT0/runTT1` and the seam join are untouched.

Constants: `TSP_CORRIDOR = 0.4`, `TSP_PERIOD_PITCH = 1.6`, the `inkWidth()` solid gate, and `TSP_I = 0.18`
(unchanged). The scratch-only knobs in the diff are not part of the plan and must not ship: every
`globalThis.__W07B2_*` read and the `W7LOG` hook.
`C = 0.3` was also measured. It is equally clean with 3–6 points less ink, so 0.4 is chosen.

## 2. The bars

The fixture for every number, unless it is stated otherwise:
- mapper `hatch`, `fillAngle 45`, `DEFAULT_CAMERA` (angle a);
- sun `{azimuth 135, elevation 45, intensity 1, castShadows:false}`;
- ground and backdrop off, so **no ground-plane ink in any total**;
- `BOUNDS {1200×1000, m 20, penWidth 0.3}`;
- density med = 50, max = 220;
- rig `addLayer` = `PRIMITIVE_PARAM_DEFAULTS`; rig `create` = `PRIMITIVE_CREATE_DEFAULTS` merged over them.

This is the same construction as `buildRiggedParams` in 776d9285's test.

**Ground truth (scratch-only instrumentation, never shipped).** A log at the one emit-loop `addPt` records
`{ruling, s, I, x, y}` for every laid point. Ink is bucketed by the sample's own radiance third
(`floor(I·3)`, the file's own convention). The same hook was put into all three trees.

| cell | masterPitch mm | **shadow-third ink ÷ Ladder** base / 776d9285 / **proto** | proto mid / lit third ÷ Ladder | fill×fill crossings in the shadow region*: Ladder / base / 776d9285 / **proto** | whole-object crossings: Ladder / proto |
|---|---|---|---|---|---|
| sphere/med/addLayer | 1.501 | 0.387 / 1.155 / **1.243** | 1.0000 / 1.0000 | 0 / 0 / 9 / **0** | 0 / 0 |
| sphere/med/create | 1.491 | 0.440 / 1.526 / **1.245** | 1.0000 / 1.0000 | 0 / 0 / 43 / **0** | 0 / 0 |
| sphere/max/addLayer | 0.350 | 0.293 / 1.013 / **1.106** | 1.0000 / 1.0000 | 9 / 0 / 215 / **9** | 22 / 22 |
| sphere/max/create | 0.350 | 0.299 / 1.059 / **1.113** | 1.0000 / 1.0000 | 4 / 0 / 700 / **4** | 10 / 10 |
| torus/med/addLayer | 1.505 | 0.519 / 1.297 / **1.192** | 1.0000 / 1.0000 | 0 / 0 / 4 / **0** | 0 / 0 |
| torus/med/create | 1.474 | 0.426 / 1.531 / **1.038** | 1.0000 / 1.0000 | 0 / 0 / 0 / **0** | 0 / 0 |
| torus/max/addLayer | 0.349 | 0.315 / 1.164 / **1.078** | 1.0000 / 1.0000 | 0 / 0 / 95 / **0** | 0 / 0 |
| torus/max/create | 0.353 | 0.350 / 1.179 / **1.056** | 1.0000 / 1.0000 | 0 / 0 / 85 / **0** | 0 / 0 |
| cone/med/addLayer | 1.476 | 0.498 / 1.263 / **1.192** | 1.0000 / 1.0000 | 0 / 0 / 12 / **0** | 0 / 0 |
| cone/med/create | 1.514 | 0.553 / 1.558 / **1.202** | 1.0000 / 1.0000 | 0 / 3 / 48 / **0** | 0 / 0 |
| cone/max/addLayer | 0.350 | 0.340 / 0.952 / **1.071** | 1.0000 / 1.0000 | 0 / 0 / 148 / **0** | 0 / 0 |
| cone/max/create | 0.349 | 0.356 / 1.060 / **1.081** | 1.0000 / 1.0000 | 0 / 0 / 382 / **0** | 0 / 0 |

\* Shadow region: 1 mm cells that hold a Ladder sample with I < ⅓. Its area is 109–1319 mm² per cell.

- 776d9285's lit third, for comparison: 1.46–2.24 × Ladder. Its mid third: 1.02–1.45 ×.
- Ladder's own crossings at sphere/max are pre-existing. They are all Ladder-on-Ladder, where rulings pile up
  on the lower limb. Proto reproduces them exactly and adds none.
- Raw JSON: `after/W-07b-2/plan/harness/g-{base,rej,final-0.4}.json`.

### 2.1 Bars, CI oracle, and mutation for each

All oracles are CI-safe. They call only `algo.generate` and `SF.lastMasterGridStats` in memory, with no git,
no `child_process`, no `/private/tmp`, and no skip or only.

| # | clause | BLOCKING | CI oracle (12 cells = sphere/torus/cone × med/max × addLayer/create) | measured on proto | mutation that must trip it (measured) |
|---|---|---|---|---|---|
| A | shadow-third ink ≥ Ladder, and actually darker | **yes** | Whole-object **fill** ink (`meta.kind !== 'sceneEdge'`) of deepFillTSP ÷ Ladder **≥ 1.01** on each cell. Why whole-object is exact and not a proxy: clause B makes every point with I ≥ TSP_I identical, and the ramp (I < 0.18) lies inside the shadow third (I < ⅓). So Δink(whole) = Δink(shadow third) exactly; mid and lit are measured at 1.0000. The ground truth above is in the report, not the test. | min **1.0208** (torus/med/create), max 1.1725 | M3, traverse off: 1.0000 on 12/12 → RED. The 0b87a9b9 code is also RED on 12/12 (0.29–0.55 shadow; whole < 1). |
| A′ | no traverse segment longer than 3 × masterPitch | **yes** | Take every deepFillTSP fill segment longer than 3 × `lastMasterGridStats.masterPitch`. Its two ends and its midpoint must lie within **0.1 mm** (⅓ pen) of a Ladder fill segment on the same cell. That is, any long segment is the ruling itself and never a traverse hop. The literal "no segment > 3 mp" is unmeetable by **Ladder itself** at max: sample step 5.7–13.8 × mp (scout S1), so the literal reading is a family property, not a traverse one. | worst **0.0001 mm** (hatch). Contour sweep worst 0.079 mm. | M1, turning-point vertices removed (sample-only wave): 0.18–0.26 mm on 6/12 cells → RED. 776d9285: 0.44–1.35 mm on 12/12 → RED. |
| X | **new** crossing bar: no crossing the traverse creates | **yes** | Proper (non-endpoint) fill×fill segment crossings, whole object: **deepFillTSP ≤ Ladder** on each of the 12 hatch cells and on the 12 contour cells. **Why Ladder and not base:** deepFillTSP now *is* Ladder's family, so "≤ Ladder" means exactly "the traverse adds zero crossings". Base is a thinned family with fewer rulings: its 0–3 crossings measure ruling count, not traverse cleanliness. It would pass a scribble on half the rulings. Whole object is used rather than the shadow third because it needs no region oracle in CI and is stricter; the two agree 12/12 above. | **equal** to Ladder on 24/24 (0–22) | M2, amplitude share 1.5 (776d9285's): RED on 11/12, up to 646 vs 10. M4, `lineIndex` golden phase with no end-ruling guard: RED on 7/12. M5, chord normals without lerp: RED on 8/12. |
| B | lit and mid unchanged: Ladder outside the ramp | **yes** | Standard sun plus an **ambient light of intensity 0.25**. Measured min I = 0.25 > TSP_I, so the ramp is empty. `JSON.stringify(deepFillTSP) === JSON.stringify(ladder)` on sphere/torus/cone × med/max. Byte identity is the literal worklist clause ("lit-third byte-identical to Ladder"). It is checked where the whole object is non-ramp, because the directional rim grazes to I→0 under any sun. | identical 6/6 (also 0.20 and 0.35 ambient) | Base (0b87a9b9) → not identical. 776d9285's flat `1` → not identical. Both measured. |
| D | **new**: contour mapper has no hairpin spikes | **yes** | On mapper `contour`, 12 cells: count fill vertices whose turn angle is > 150°. deepFillTSP ≤ Ladder (0). | **0** on 12/12 | NaN-tt removed: 149–962 on 12/12 → RED. Base: 16–534 → RED. 776d9285: 67–1350 → RED. |
| C | byte identity for every other law | **yes** (for review; **not** a committed test) | A scratch sweep, md5 of `generate()` at the implementer's base sha against the new sha. It is not committed because pinned hashes of 47 laws would collide with T2-7's mkTick edit and every later unit. | **47/48 laws × 4 primitives (sphere/torus/cone/box) × 8 mappers = 1504/1504 cells identical** (37 PRODUCTION = 1184, plus the 10 other IDS = 320, plus `ladder` 32/32). deepFillTSP itself: 17/32 identical (none, wireframe, contourSlice, all of box). 15 changed: hatch, crosshatch and contour by design; spiral and stipple now **byte-identical to Ladder**, consistent with `CURVED_SPIRAL_STIPPLE_INERT` (context-bar.js:561). | Not applicable: this is a control. |

Image cross-check (not a bar, just the capture's pixels). This is the bright-pixel fraction of the native
bottom-left shadow quadrant, Ladder against proto:
- med: 0.115–0.163 → 0.118–0.203
- max: 0.317–0.552 → 0.331–0.582

Proto is at least as dark as Ladder on 12/12. 776d9285 fell *below* Ladder on 6 of the 6 max cells (0.315–0.504).

## 3. Prototype evidence: what I saw

Captures were made from MAIN with `node scripts/audit/scene3d-capture.js --tier B --root <scratch tree>
--port 8477 --rig {addLayer,create} --only '^(sphere|torus|cone)__hatch__(ladder|deepFillTSP)__(med|max)__a$'`,
plus `…__contour__…__med__a$` on addLayer, once per tree. The server was killed between trees, and
`appVersion` 1.4.3 matched in the manifests. Output is in
`docs/3d-audit/fill-audit/after/W-07b-2/plan/{base,rej,proto}/shots/B/`.

Native crops are the bottom-left quadrant, not upscaled. Each strip is one PNG in `plan/crops/`, named
`*__shadow__ladder-base-776d9285-proto.png`, and each tile is also saved alone as `*__shadowcrop__<label>.png`.

- **Hatch, med, all 3 primitives, both rigs:**
  - Proto: every ruling carries an even, same-period, 45° sawtooth that stays in its own lane. Neighbours run
    parallel and never touch. It reads as a deliberate, clean zig-zag hatch, with the zig-zag easing in from
    the terminator.
  - Base: half as many rulings, each with the irregular aliased sawtooth.
  - 776d9285: the self- and neighbour-crossing scribble the review measured.
- **Hatch, max:**
  - Proto: a fine, regular diamond-weave texture. The per-ruling golden phase puts neighbours at varying
    relative phase, so the regular corridor zig-zags interleave. It has no scribble and no stray long
    strokes, and its pixel coverage is above Ladder's.
  - 776d9285: turbulent, irregular strands with open holes.
- **Contour, med:**
  - Base and 776d9285: the contour rings carry **isolated hairpin ticks and spikes**, not a zig-zag. See §5.4.
  - Proto: a clean zig-zag on every ring.
- **Lit side:** outside the ramp the proto is the Ladder picture, by construction (clause B).

**Plainly: yes, the proto reads as a clean zig-zag.**

## 4. Files

**ALLOWED:** `src/core/scene3d/surface-fill.js`, in exactly these regions (base line numbers):
1. `isEvenLadder` (:4959–4960): add `|| TONE_ALGO === 'deepFillTSP'` (**new vs W-07b's scope**, see §6 flag 1).
2. `algoCoverage`'s deepFillTSP branch (:5278–5311): **delete it**; after (1) it is dead code.
3. The `tspAt` block (:9558–9613): replace it with `tspAmp` / `tspPrep` / `tspPlace` / `tspNrm` / `tspVerts`
   and their constants.
4. The one emit-loop call site (:10044–10046): lay `tspVerts(s)`'s list, with NaN `tt` on displaced
   vertices, and set `tspPrevS` (**new vs W-07b's scope**).
5. Optionally, the 3-line `tspRamp` comment (:1893–1896), which says "half the rulings". Comment only.

`tests/unit/scene3d-mark-laws-draw.test.js`: **only** the `W-07` describe block (:622–671). Add a nested
`describe('W-07b-2 …')` with tests A, A′, X, B and D. The 3 existing W-07 tests stay; they pass on proto
(30/30 file).

**FORBIDDEN:**
- every other region of surface-fill.js, including all `mkTick` / `mk*` regions, which T2-7 will edit;
- `ladderCov`, `ladderWantedPitch`, `emitContFamily`, `refineFillRunTurns`, `perpPitch`;
- `context-bar.js`;
- `docs/tone-laws/laws.json` and the generated `scene3d-tone-laws.js`: the mechanism text is follow-up §7.2;
- `scripts/`, any other worktree, and MAIN's `src/` and `tests/`.

The diff is ≈150 lines, all inside regions 1–4 and away from the mkTick code, so it should not collide with T2-7.

## 5. Guard tests and reach

Run on the proto scratch tree, foreground, `timeout: 600000`:
- `scene3d-mark-laws-draw` **30/30**. This is the base file; the perf test (torus d=220 under 2 s) passes,
  and proto generation is ≤ 405 ms.
- `scene3d-tone-law-dispatch` **7/7**.
- `scene3d-one-pen-down-reachability` **5/5**.
- `integration/scene3d-fill-style-picker` **177/177**.
- `scene3d-tone-law-collapse`: singleFork, **121/121 in 824 s**. The tool backgrounded it at the 600 s
  ceiling, per the §0b amendment.
- Pin check (rule 4): the only deepFillTSP references in those files are roster lists and caveat text. No
  geometry fingerprint is pinned on deepFillTSP anywhere.

### 5.4 A pre-existing contour defect this plan also closes

`refineFillRunTurns` runs on `mapper === 'contour'` and on closed rings. It bisects any turn > 8° by
re-sampling the **ruling** at the mid-parameter. On deepFillTSP that drops undisplaced points between
displaced ones, so the "zig-zag" becomes hairpin spikes.

Measured hairpins (>150° turns): base 16–534 and 776d9285 67–1350 per contour cell. Both W-07b reports swept
`hatch` only, so they missed it. Ladder has 0.

### 5.5 Sweep coverage (rule 2)

- **Mappers:** bars A, A′ and X on `hatch` (12 cells), and X and D on `contour` (12 cells).
- **crosshatch:** 3 cells were rendered and look clean. It is **excluded from X**, because the zig-zag
  legitimately crosses the *other* family's rulings more often than a straight line would: 1.1–1.6 × Ladder's
  cross-family crossings. The output carries no family tag to separate same-family crossings.
  The implementer must still show A, A′ and B on crosshatch (3 primitives × med, addLayer).
- **Other mappers:** the remaining 5 mappers are either unreachable for this law or, for spiral and stipple,
  now byte-identical to Ladder. So the reachable roster is 3/3 mappers, and bars cover 2/3 fully and 1/3
  partly.
- **Primitives:** sphere, torus and cone. Faceted primitives are unreachable (scout S3), and box is
  confirmed identical in the C sweep.
- **Densities:** med and max. low (d=1) is not measured; the existing W-07 low≠med test still passes.
- **Camera:** angle a only. Angle b is **not measured**, a time-boxed exclusion.

## 6. Reviewer flags (5, cap 6)

1. **Scope widened on purpose: `isEvenLadder` membership plus the call site.** The fix cannot be done inside
   `algoCoverage` and `tspAt`. The branch can only choose the master grid, which toneless lit gives 1.46–2.24×,
   or a thinned grid, which gives 0.29–0.55× in the shadow. Neither is Ladder's tone. And `tspAt` returns one
   point per sample, so it cannot emit turning-point vertices.
   Check that no other `isEvenLadder()` site changes a non-deepFillTSP path. Sweep C's 1504/1504 identical
   cells, plus 32/32 for ladder, is the proof.
2. **Clause B verdict on 776d9285: do NOT keep its lit fix.**
   - The flat `1` did remove `perceptualCov`'s drift, but it moved deepFillTSP onto the untoned master grid.
     Lit third 1.46–2.24× Ladder and mid 1.02–1.45×: the lit side stops shading.
   - The scout's defect 2 is resolved differently: the branch is deleted, and the placement *is* Ladder's.
   - Check with the ambient byte-identity test.
3. **A′ is restated, not relaxed.** Literal "no segment > 3·mp" fails for Ladder itself at max (scout S1), so
   it cannot be the traverse's bar. The restated form, "a long segment must lie on the ruling within ⅓ pen",
   trips on the exact failure (sample-only wave, 0.18–0.26 mm) and on 776d9285.
   Check that the 0.1 mm tolerance is not tuned to pass: proto's worst hatch is 0.0001 mm and the mutant's
   least is 0.18 mm.
4. **Whole-object ink as the clause-A oracle.** It is exact only while B holds. That is why B is BLOCKING and
   is tested beside it. The report must also carry the per-third ground truth from a scratch-only hook,
   never shipped, like the table in §2.
5. **Three small geometric guards whose purpose is not obvious from the code:**
   - (a) end rulings straight. Ladder's walk leaves a near-duplicate ruling at the closed-chart seam, 0.06–0.29 mm
     from ruling 0 on sphere and cone at max (§7.1). Out-of-phase zig-zags on the pair crossed 16–19 times.
   - (b) the `g < inkWidth` solid gate: limb pile-ups where Ladder's own rulings already cross.
   - (c) NaN `tt`, which is the contour fix.
   Each has its own mutation: M4, the gate off (+2 crossings at sphere/max), and M-NaN. Check that none of
   them hides a crossing that Ladder does not already have.

## 7. Open follow-ups (not this unit)

1. **Pre-existing Ladder seam duplicate.** Ladder's continuous walk places a ruling at frac≈1 that nearly
   coincides with frac 0 on closed charts: 0.06 mm apart on sphere/max/addLayer and 0.29 mm on cone/max/create.
   That is a double-inked seam line in the shipped default. It needs a `emitContFamily` fix, which is
   Ladder's own lane.
2. **The mechanism text is stale.** In `docs/tone-laws/laws.json` → `scene3d-tone-laws.js`, deepFillTSP's
   `mechanism` says it "replaces the ruling… effective pitch of half the ruled pitch without adding a
   ruling". The new truth is "Ladder's rulings plus a corridor-bounded zig-zag in the darkest ~15%". The
   caveat is still accurate.
3. **Silhouette contact.** Fill×silhouette-edge crossings in the shadow region are proto 13 against Ladder
   12 (sphere/med/create) and proto 7 against Ladder 4 (torus/med/create). They are equal on the other 10
   cells. The points are on
   the surface (chart-verified), so this is the silhouette polyline's chord sagging inside the true limb.
   It is flagged, not gated.
4. Camera angle b and density low are not measured. crosshatch needs a same-family crossing oracle.

## 8. Cleanup

- The scratch trees and harness were run only under `/private/tmp/claude-501/scratch-W-07b-2`. The harness
  scripts, the three ground-truth JSONs and the prototype diff (`proto-vs-0b87a9b9.diff`, **still containing
  the scratch-only `__W07B2_*` knobs and the `W7LOG` hook, which must be stripped**) are copied to
  `after/W-07b-2/plan/`.
- Port 8477 was killed and verified free.
- Nothing was written to any worktree, to MAIN `src/` or `tests/`, or to git.
