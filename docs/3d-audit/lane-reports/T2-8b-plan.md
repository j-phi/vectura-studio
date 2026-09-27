# T2-8b — plan: fill the cone base wedges + sphere G5 without touching the master grid

Planner (Opus), read-only. Base `main` = `8b8f275e` (v1.4.4, contains T2-7 + T2-8). Jay, 2026-09-25: **"New mechanism for both"**. The B5 monotone bar stays; loosening the master grid was offered and declined.

(Written to disk by the orchestrator verbatim from the planner's hand-back; the planner's harness could not create files.)

## §0 THE BINDING CHECKLIST (verbatim from ROUND3-RESUME-BRIEFS.md; carried into §6's implementer brief)

See `ROUND3-RESUME-BRIEFS.md` lines 34–67 — pasted verbatim into the §6 implementer brief at dispatch. §0b (binding, verbatim):

> Run every vitest file in the FOREGROUND with the Bash tool parameter `timeout: 600000` (ten minutes). Never use run_in_background, never arm a Monitor and end your turn. If a file still exceeds ten minutes, kill it and rerun alone with `--pool=forks --poolOptions.forks.singleFork=true`, again with `timeout: 600000`.

(Tier 1 exception: `tests/unit/scene3d-tone-law-collapse.test.js` exceeds the 600 s ceiling. Start it foreground with singleFork and `timeout: 600000`, let the tool background it, and read the completion notification. Do not pass `run_in_background` or arm a Monitor.)

## 1. Fixture for every number in this plan

Unless stated otherwise, every number comes from `algo.generate(params, null, null, BOUNDS)` in a node JSDOM runtime (`tests/helpers/load-vectura-runtime`), with the `surface-fill.js` source read from disk at `8b8f275e` and patched in memory only:

- **Params:** `buildSceneParams` exactly as in `scene3d-mktick-spacing-tone.test.js`:
  - mapper ∈ {hatch, contour}, `toneLaw: 'mkTick'`, `fillAngle: 45`, `fillDensity: 50` (med).
  - camera = `Params.DEFAULT_CAMERA` (gallery angle "a").
  - one light: SUN az 135 / el 45.
  - `tone.enabled: true`; ground **disabled** and backdrop disabled, so **ground-plane ink is NOT included anywhere**.
- **BOUNDS:** 1200×1000, m=20, pen 0.3.
- **Rigs:**
  - **create** = `PRIMITIVE_PARAM_DEFAULTS ⊕ PRIMITIVE_CREATE_DEFAULTS` (the gallery / Jay rig).
  - **test** = `PRIMITIVE_PARAM_DEFAULTS` only (the RGR/addLayer-equivalent rig the test files call `'test'`).
- **Coordinates:** mm in the output path space. The create cone spans x 580–620, y 479.3–527.5; the create sphere spans 575–625 × 475–525.
- **"Bare area ≥T" instrument:**
  - raster at 0.05 mm; every `sceneFill` and `sceneEdge` path stamped with radius 0.15 mm;
  - interior = pixels not flood-reachable from the bbox border without crossing `sceneEdge` ink;
  - two-pass chamfer distance to ink; area (mm²) of interior pixels at distance ≥ T.
  - This is a planner instrument. Port it to `tests/helpers/`, with no fs/git paths.

## 2. Root cause, by measurement (create rig unless stated)

### 2.1 Where the gaps are (bare-area components, create, d=50)

- **Cone** (T=1.0 mm): two components dominate.
  - W_L: 5.10 mm² centred (593.6, 525.3).
  - W_R: 4.88 mm² centred (609.4, 524.7).
  - At T=0.75 mm they measure 8.44 and 7.73 mm². These are Jay's two base wedges (W_R sits under crops G2a/G2b).
- **Sphere:** the large components are all in the lit highlight at the top right (e.g. 12.4 mm² at (615.7, 483.9)). That is G6, tone-limited and out of scope. The G5 window [606,510,625,525.5] holds only **1.53 mm² at ≥0.5 mm and 0.23 mm² at ≥0.75 mm**. G5 is a thin sliver, not a wedge.

### 2.2 The cone wedges are span-START (s0) triangles at a domain edge

- The ruling spans on create cone/hatch are li 1, 4, …, 19; the master grid has 21 rulings at coverage 1/3.
- Every marked ruling's span **starts** (s0) at the base rim or the right flank and **ends** (s1) at the left silhouette or apex. Examples:
  - li16: s0 (606.95, 526.31) → s1 (589.79, 500.2)
  - li19: s0 (589.94, 525.79) → s1 (585.5, 509.0)
- W_L lies right of li19's s0 and W_R lies right of li16's s0.
- Two things combine:
  1. The lattice starts `gold·P` past s0 (`let a = arcMM[s0] + phase * solveAt(s0).P`, surface-fill.js ~7438). There is NO s0 counterpart to T2-7's end-of-span tick (item 8, ~7492, which guards s1 only).
  2. The base rim cuts the band obliquely. Past s0 the ruling's centre is off the domain, but the half-band on the obtuse side remains on-surface. The probe at li16 found the on-front v-interval [−4.54, 0.45] still present at du = −0.7 mm, and [−4.54, −1.02] at du = −3.23 mm.
- No row samples that region. T2-8's `emitTickWedgeRow` targets only the family's LAST index; on create its row li21 has spans `[]`, which is why it draws zero sites.

### 2.3 Sphere G5 is a flared seam gutter at the limb — a different defect

- li18, li21 and li24 all have s0 on the bottom-right limb, e.g. li24 s0 (608.85, 523.37).
- The ASCII raster shows G5 as the gutter between the li21 and li24 bands widening from about 1.75 mm to 3.5 mm toward the rim.
- Asked vs drawn for li24's ticks beside G5: the gutter side is asked +0.96…+1.19 mm and drawn in full, so the ticks are not cut, they are asked short. li21's ticks there ask 5.1–5.3 mm (the full band).
- Instrumenting `half()` (solveAt tick branch, ~6914) shows why: the neighbour sample at the SAME sweep parameter sits 4.8–6.0 mm **along the row** (alongU), so its projection on the flat v (2.3–3.0 mm) gives h ≈ 0.4–1.25 mm on li24's gutter side.
- It is NOT a span-end triangle. The span-continuation probe beyond li21's s0 finds an on-front band that slides outward in v ([0.22,1.57] → [2.24,3.47]) and is narrower than the plot floor (0.69 mm) after pen trims.
- At the limb the ruling's flat screen→param frame is singular. `fr.toParam(du≈−0.1, v≈−1.3)` from li24's s0 lands at (578, 504), on the far side of the sphere. This is why every frame-extrapolated mechanism, T2-8's included, reaches nothing there.

### 2.4 Levers measured for the sphere — none closes G5 within the bars (create sphere/hatch, G5 window, bare ≥0.5 mm, base 1.53 mm²)

| lever | G5 | why it fails |
|---|---|---|
| T2-8 wedge row (shipped) | 1.53 | 0 sites (measured by T2-8) |
| flat-frame continuation past s0 (v3/v4) | 1.53 | the singular frame maps to the far side; 23–31 refused offSurf/dir |
| param-anchored continuation (A below) | 1.53 | all 50 attempts "short": the sliver is below the plot floor |
| walked-reach edge cap in `half()` | 1.45 | shortfalls 0.3–0.7 mm; changes sites |
| abeam neighbour distance in `half()` | 1.65 | tip contact rises on 12/12 cells; B5 0→1 on test torus/hatch and test cone/hatch |
| gutter infill from the site's tick line (dark only) | 1.14 | create torus/hatch tip 0.035→0.36 (T2 bar 0.15 FAILS); ink +62 % |

⇒ The sphere is not build-ready (§5).

## 3. Mechanism A — SEC, "span-end continuation" (build-ready; fills the cone)

### 3.1 What it does

A **tick-only, deferred, non-site** pass:

1. In `emitMarks`' lattice loop, record `firstA` (the first placed site) next to `lastA`. This adds one `let` and one assignment; other laws are unaffected.
2. After T2-7's end-of-span tick, **if `law.shape === 'tick'` and `!mkWedgeActive`**, push two closures into a render-scope queue `mkEndQ` (declared beside `mkInk`, ~2798): `secSide(s0, −1, firstA − arcMM[s0])` and `secSide(s1, +1, arcMM[s1] − endA)`. `endA` is the item-8 end tick if it fired, else `lastA`.
3. Flush `mkEndQ` once, after `runMapper(N,false)` and the x-ray `runMapper(...,true)` (~12817) and before `flushDeferredRibbons()`. This follows the existing deferred-ribbon precedent.
   - Deferral is load-bearing. Run inline, SEC ink changed later rulings' clip outcomes and the site records moved on 10 of 24 cell×rig runs. Deferred, sites were byte-identical on **24/24**.
4. `secSide(sEnd, dir, off)`, for j = 1..8 at spacing `sv.P` of the end's own solve (positions ≤ 0.25P inside the end are skipped):
   - Extend the ruling's param line past sEnd using the end's own param-per-mm: `(paramAt(sEnd/n) − paramAt(kIn/n)) / Δarc`.
   - On each side, search δ ∈ {0.15, 0.35, 0.55, 0.75, 0.95}·hSt along `pitchStep` (hSt = 0.5/`markRowCoverage()`) for the first on-front sample. Stop when neither side has one.
   - Build a **fresh frame** at that sample: `frameFrom(sm, ld, st, pr)`. This is the fix for the singular-frame failure.
   - The tick spans that side's half-band, from the ruling to the band edge, converted with that frame's own mm-per-pitch-step, trimmed 0.25·PMINT at each end.
   - Do a dry `walkPoly`. If it draws less than the plot floor (`MK_TICK_PLOT_FLOOR·MIN_MARK_MM`), skip.
   - Otherwise place a centred tick of length `max(LPF, duty·drawn)`, where `duty = Σseg / (max seg − min seg)` of the end solve. This is **tone continuity by construction**.
   - Re-walk. **Admission:** refuse if any walked point lies within **1.0·w** of ANY ink in `mkInk`, with no lineIndex filter.
   - Otherwise `place()` with `mkClipArm` full radius (`rm = rp = 0`).
   - Never touch `mkStat.tickSites`.

A reference implementation, the exact measured code, is in the planner's transcript. Port it; do not re-invent it.

### 3.2 Measured — SEC at admission 1.0w vs base (d=50, both rigs, 6 cells each)

- **Sites:** `tickSites` byte-identical on 24/24 runs (12 cells × 2 rigs, SEC off vs on). SP5, B5 and B7 are therefore identical by construction.
- **B5 nonMono:** identical on 12/12.
- **Wedge windows, create cone/hatch** (W_L = [588,519,599,528], W_R = [603,518,614,528]):
  - bare ≥0.75 mm: **8.45 / 7.73 → 0.03 / 0.00 mm²**
  - bare ≥0.5 mm: 12.31 / 11.46 → 1.20 / 1.49
  - 19 ticks added; ink 1357 → 1400 mm (object only, no ground)
- **Wedge windows, test cone/hatch:** bare ≥0.75 mm 0.85 / 4.75 → 0.42 / 0.98.
- **tipContact:** ≤ base+0.002 on every cell. Worst cases: create torus/hatch 0.0352 → 0.0369 and test torus/contour 0.0609 → 0.0627. The named exception create torus/contour improves, 0.2532 → 0.2339.
- **markContact:** worst +0.008 (create torus/hatch 0.0704 → 0.0788).
- **over2RP** = 0 and **subMin** = 0 everywhere.
- **T12 inversions:** worst 3 → 4 (create cone/hatch), within ≤ 6.
- **Sphere/hatch:** 0 SEC ticks on both rigs, so no picture change there (disclosed).
- **Admission sweep:**
  - admission off: contour cells explode (create cone/contour tip 0.042 → 0.397);
  - 1.2w: same fill, marginally fewer ticks;
  - 1.6w: loses part of W_R (bare ≥0.5 mm = 5.5 mm²).
  - 1.0w is the smallest radius measured to hold contact.
- **Not claimed:** the cone right flank (window [608,494,620,524] only moves 26.66 → 24.07 at ≥0.5 mm), G1, G3, G6.

## 4. Acceptance bars (A = mechanism A). Fixture per bar: §1 unless noted

| id | clause it gates | bar | fixture | mutation (must trip) |
|---|---|---|---|---|
| **A1** NEW, BLOCKING | "fill the cone base wedges" (Jay's green G2 triangles) | bare ≥0.75 mm ≤ 0.50 mm² in each of W_L and W_R | create cone/hatch d=50 cam a, no ground | queued closure returns immediately → 8.45 / 7.73 |
| **A1t** NEW, reported | same, on the RGR rig | W_R bare ≥0.75 mm ≤ 1.5 mm² (measured 0.98) | test cone/hatch | same |
| **A2** NEW, BLOCKING | "do not touch the master grid / keep B5" | `tickSites` (+ `[I,R,P,L,drawn]` hook) deep-equal between SEC-mutated-off and shipped | 6 cells × 2 rigs, d=50 **and** 4 B7 cells × 2 rigs at d=220 | run the closure inline instead of deferring → sites differ (measured on ≥1 cell) |
| **A3** NEW, BLOCKING | "minimize tick contact" | tipContact ≤ base+0.005 on each of the 12 cell×rig combinations; existing T2/T3 aggregates and named sets unchanged | 12 at d=50 | admission off → create cone/contour 0.042 → 0.40 |
| **A4** NEW, BLOCKING (RED to be measured by the implementer) | "tone by spacing" (new population) | raster ink coverage inside W_L and W_R ≤ 1.10 × the coverage of the band strip abutting them; T12 inversions ≤ 6 (unchanged bar) | create + test cone/hatch | duty forced to 1 AND trims removed → ratio > 1.10 (**prove non-vacuous**) |
| **A5** existing | "a tick is not a line" (B9), plot floor | over2RP = 0, subMin = 0 incl. SEC marks | 12 at d=50 + d=220 B7 set | tick asked at 3·hSt → over2RP > 0 |
| **I1** NEW, BLOCKING | isolation | md5 of paths identical base vs shipped for every non-mkTick law × 8 mappers (**288 of 296 roster cells**) on sphere/cone/torus create d=50 | band-purity roster pattern | remove the `law.shape==='tick'` gate → an mkDashRamp cell's md5 changes (**prove, or pick a law where it does**) |
| **I2** NEW, reported | mkTick on the other 6 mappers (8/8 = 100 % of the mkTick row) | tip/mark contact, over2RP, subMin; no worse than base+0.005 | none, wireframe, crosshatch, spiral, stipple, contourSlice × 3 primitives × create | — |

Existing bars still gate unchanged: T1 SP5 ≥ 2.30 on ≥11/12; T2 and T3 with the create|torus/contour exception; T4 B5 with the two named exceptions (`create|torus/hatch`, `create|cone/hatch`, which are unchanged since sites are identical); T5/B7; T7; B8e; T2-8's `wedgeFillFrac` (unaffected: SEC skips wedge rows and pushes no sites).

**Goldens (rule 4):** `scene3d-mktick-wedge.test.js` `EXPECTED_SIGNATURE`, 12 cells at d=50, both rigs. The measured ink changes on **11 of 12** (every cell except create sphere/hatch). Each re-pin carries a contrast mutation (SEC off ⇒ the old hash returns) and a `## Bars changed` line.

Also run:
- `scene3d-mktick-band-purity` (hand-copied tick block + roster md5)
- `mark-laws-draw`
- `mktick-runaway`
- `mktick-banding`
- `one-pen-down-reachability`
- `tone-law-collapse` (Tier 1)

Grep every pin's fixture, not just the law name.

**Pictures (Jay's eye is the acceptance test):**
- `scripts/audit/scene3d-capture.js --rig create`, cone + sphere, hatch, mkTick, med, angle a.
- BEFORE from a `git archive` export of `8b8f275e`; AFTER from the lane.
- Side-by-sides `JAY_T28b_cone.png` and `JAY_T28b_sphere.png`.
- Native 3× crops: G2a (330,600,480,745), G2b (470,560,620,720), G5 (560,560,760,760), plus the W_L crop (~130,650,330,749).
- Evidence goes to MAIN `docs/3d-audit/fill-audit/after/T2-8b/`.
- **Label the sphere pair honestly: "unchanged — G5 not addressed (§5)."**

## 5. Sphere G5 — NOT build-ready. Open question for Jay

G5 measures 1.53 mm² (create, ≥0.5 mm clearance). The cone wedges measured 12.3 and 11.5 mm² on the same scale. It is a gutter flare driven by the skewed same-t neighbour in `half()`. Six levers are measured in §2.4; none holds the bars.

**The only candidate left is "limb-gutter infill" (LGI):**
- a deferred, non-site satellite in the inter-band gutter, measured by walking the site's own tick line;
- admission 1.0w, like A;
- targeted by the measured G5 signature: same-t neighbour along-row offset > RPn (G5: 4.8–6.0 mm vs RPn 4.47).

This targeting predicate is NOT yet measured. The untargeted versions failed T2.

**Ask Jay:** (a) accept G5 as inherent, or (b) fund an LGI prototype shown to him first ("SHOW ME FIRST" precedent), with a STOP if any T2/T3/T4 cell regresses.

## 6. Implementer brief (single unit, A only)

Paste §0 and §0b verbatim. Scope: `src/core/scene3d/surface-fill.js` only:
- the lattice loop ~7446–7495;
- a queue beside `mkInk` ~2798;
- the flush ~12817;
- new constants beside `MK_TICK_*`: `MK_TICK_SEC_MAXJ = 8`, `MK_TICK_SEC_ADMIT_PEN = 1.0`, the δ ladder, the 0.25·PMINT trims.

Tests: the helper port (bare-area instrument) and A1–A5, I1, I2 in `scene3d-mktick-spacing-tone.test.js`, plus the golden re-pins.

**STOP if:**
- any `tickSites` record changes;
- any T2/T3/T4 named set would need to grow;
- A1 needs an admission radius above 1.2w.

Report under `## Bars changed` (new A1–A5, I1, I2 and 11 re-pinned goldens), `## Pre-existing red` (reproduced at `8b8f275e` from a `git archive` export), and the sweep fraction (288/296 byte-identical + 8/8 mkTick measured).

### Critical Files for Implementation
- src/core/scene3d/surface-fill.js
- tests/unit/scene3d-mktick-spacing-tone.test.js
- tests/unit/scene3d-mktick-wedge.test.js
- tests/helpers/scene3d-mktick-spacing-tone.js
- tests/unit/scene3d-mktick-band-purity.test.js
