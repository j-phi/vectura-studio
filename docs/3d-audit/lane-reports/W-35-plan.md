STATUS: PLAN-READY

# W-35 — end-overlap / edge-fidelity parameter (planner report)

Unit: **W-35** (USER product request, Jay 2026-09-06,
`docs/3d-audit/fill-audit/user-reports/15-w27c-contourslice.png`). Verbatim:

> *"You can observe some minor imperfections where line segments end, creating stairstepping. If this
> is to minimize overlap to prevent bleedthrough, perhaps having a parameter we can control for this
> would make the most sense? Increasing allows for subtly more overlaps and preserves outer edge
> fidelit?"*

Planner: read-only, in a scratch export of **`fe491dfa`** (fill-audit-d2's HEAD = W-34 landed).
Lane: **fill-audit-d2** (`:8481`), plus two cross-lane files (§2.4).

## 0. Baseline discipline (secretary flag, answered)

**Every "today" number in this plan was measured on `fe491dfa`** — the post-W-34 tree — with the
audit rig's own scene (`PRIMITIVE_PARAM_DEFAULTS`, `fillDensity 50`, `toneLaw ladder`,
`sliceCount 26`, cameras a/b, pen 0.3 mm, `BOUNDS 320×220`). **No number here comes from the gallery
shots or from Jay's screenshot.** W-34's Fix A moved every clipped ring's point count and visibly
smoothed the ellipsoid, so a before/after built on the old gallery would overstate W-35; the
implementer must likewise baseline on `fe491dfa` (or on its own base sha) and never on `after/W-27c*`.

Jay's screenshot is still the *statement of the defect* — it is just not the *measurement* of it.

What the planner looked at (Read tool, native-resolution crops, all rendered from `fe491dfa`
geometry): `docs/3d-audit/lane-reports/W-35-plan-evidence/`
- `0-today-fe491dfa-left-limb.png` — ellipsoid, camera a, left limb, 2× of a 24 px/mm raster.
- `1-today-fe491dfa-ellipsoid-ring-end.png` — 7× zoom on one ring end (grey = silhouette/boundary
  edge ink, white = fill ink). **This is the stair-step**: the outermost ring runs alongside the
  outline, rides over it, and then **stops square**, leaving a notch; the next ring stops somewhere
  else, so the outer edge reads as a ragged ladder instead of one line.
- `2-prototype-k2-0p6mm.png`, `3-prototype-k8-2p4mm.png` — the same crop with this plan's prototype
  parameter at 2 and 8 pen widths (§4.1). At k=2 the end has moved along the outline and the notch is
  shallower; at k=8 the ring runs continuously through the crop and the notch is gone.
- Raw numbers: `today-endpoint-numbers.json`, `prototype-numbers.json` in the same directory.

⚠ Those PNGs are an **offline rasterisation of the emitted geometry** (0.3 mm round strokes at
24 px/mm), not an app screenshot. They are planning evidence. The implementer still owes real
app captures — §4.4.

---

## 1. The mechanism today, with file:line

### 1.1 Headline: **nothing trims the ring ends.** Jay's hypothesis is wrong, and that matters

Jay asks whether the stair-step is a deliberate overlap-reduction ("to minimize overlap to prevent
bleedthrough"). It is not. There is **no silhouette inset, no plot-safety end trim, and no
overlap-avoidance rule anywhere on the contourSlice path.** Measured on `fe491dfa`, signed distance
from every open run's endpoint to the drawn outline (silhouette + boundary `sceneEdge` ink), positive
= outside the projected front-face footprint:

| cell (camera a) | open runs | closed rings | endpoints | inside | outside | median \|d\| | max \|d\| | max in pens (0.3) |
|---|---|---|---|---|---|---|---|---|
| ellipsoid | 23 | 4 | 46 | **0** | 44 | 0.080 mm | **0.351 mm** | 1.17 |
| sphere | 22 | 4 | 44 | 1 | 42 | 0.055 mm | 0.367 mm | 1.22 |
| torus | 43 | 1 | 86 | 34 | 50 | 0.030 mm | 0.149 mm | 0.50 |
| cone | 22 | 0 | 44 | 11 | 19 | 0.035 mm | 0.302 mm | 1.01 |
| cylinder | 26 | 0 | 52 | 24 | 28 | 0.027 mm | 0.076 mm | 0.25 |
| capsule | 25 | 5 | 50 | 0 | 45 | 0.022 mm | 0.182 mm | 0.61 |
| ellipsoid (camera b) | 23 | 4 | 46 | 0 | 42 | 0.023 mm | **0.443 mm** | 1.48 |
| sphere (camera b) | 24 | 3 | 48 | 0 | 48 | 0.023 mm | 0.314 mm | 1.05 |

On the smooth convex primitives **not one endpoint is short of the outline** — they all sit *on or
just past* it, by up to 1.5 pens. So the visible defect is not a gap left by a trim; it is that the
ring **ends at all**, at a position that is quantised, and that neighbouring rings end at
differently-quantised positions.

### 1.2 What actually decides where a ring ends: the per-facet front flag

`src/core/algorithms/scene3d.js`

- `:4382` — `const frontFlags = record.faces.map((f) => !!(f && f.front));` — one boolean per **mesh
  facet**.
- `:4386-4393` — `buildSliceSegments({ world, faces, front: frontFlags, … })`.
- `:171` — inside `buildSliceSegments`: `const isFront = front ? front[f] !== false : true;` and
  `:182` `segments.push({ a: pts[0], b: pts[1], front: isFront, plane: level });` — **every cut
  segment inherits its facet's front/back flag verbatim.**
- `:4403-4407` — `byPlane` splits each plane's cuts into `g.front` / `g.back`.
- `:4488-4494` — `linkPlane(g.front)` links **only the front segments** into open chains and (on a
  smooth surface) refines them (`refineSliceRing`, W-34 Fix A supplies `project`).
- `:4533` — `linkPlane(g.front).forEach(...)` → crowd cull → `clipper.clipPath` → `emitRuns`.
- `:4574` — `linkPlane(g.back)` is emitted only as see-through dashes under `fullContour`.

So the visible half of every ring is terminated **at a facet boundary**. The terminator the eye
expects (where the surface normal turns perpendicular to the view) lies *inside* a facet; the code can
only cut at facet edges, so it truncates to the nearest facet edge, and then `refineSliceRing` snaps
the surviving points onto the **analytic** surface — which is why the end lands slightly *outside* the
drawn, inscribed mesh outline (§1.1's positive offsets) instead of neatly on it.

**Quantisation scale, measured (`fe491dfa`, ellipsoid camera a):** median terminal-segment length
0.908 mm with a median terminal turn of 3.20° (max 5.72°); at `detail 26` (the creation default)
0.700 mm / 1.92°; at `detail 48` 0.334 mm / 1.06°. It scales as 1/detail — the signature of facet
quantisation, and nothing else.

### 1.3 The constants roster — which are live at the ends, and which are proven inert

| constant | file:line | value | role at a ring END | verdict |
|---|---|---|---|---|
| per-facet `front` flag | `scene3d.js:171`, `:4382` | — | **sole determinant** of the front chain's ends on every primitive | **THE mechanism** |
| `refineSliceRing` | `scene3d.js:755`, wired `:4484-4494` | — | moves the surviving points onto the analytic surface ⇒ ends land up to 0.44 mm OUTSIDE the drawn outline | secondary, W-34's |
| `SELF_OCCLUDE_BIAS` | `hlr.js:56` | 6 mm | none on ellipsoid/sphere | **proven inert**: rebuilt with 0.05 mm, ellipsoid and sphere are **byte-identical** (ink 1321.7784 / 1118.6882 mm, run counts 23+4 / 22+4). On the **torus** it is decisive (43 → 102 runs, micro-gaps return) — that is W-27c item 0(b), not W-35 |
| `HLR_BIAS` | `scene3d.js:31` | 0.05 mm | anti-z-fight only | inert at the ends |
| `MIN_RUN_MM` | `scene3d.js:34`, applied `:3046` | 0.6 mm | can delete a whole sub-0.6 mm run; never shortens a surviving one | not the stair-step (no ellipsoid/sphere run is near the floor) |
| `SLICE_CLIP_WORK` | `scene3d.js:201` | 35 000 000 | overflow ⇒ emit RAW (un-clipped) — that would *lengthen*, never trim | not engaged at gallery scale; implementer must confirm `workUsed < budget` on its cells |
| `SLICE_SAMPLE_STEP` / HLR `SAMPLE_STEP` | `scene3d.js:200`, `hlr.js:58` | 2.5 mm | clip crossings are **bisected** (`hlr.js:441-455`), so a run stops on the true crossing, not a sample short | not a trim |
| crowd cull `CROWD_CULL_K` / `CROWD_MIN_ARC_MULT` / `CROWD_MIN_DISTINCT_LEVELS` | `scene3d.js:335, 416, 428` | 0.8 / 3 / 2 | drops **whole rings** before clipping (`:4533-4553`) | changes which rings exist, never where one ends |

**Answer to the brief's question:** it is **one mechanism, not several constants** — and it is not a
constant at all, it is the facet-resolution front/back classification. Every constant that *could*
have been the "deliberate trim" is measured and cleared above.

### 1.4 contourSlice vs surface-fill rulings — cross-lane, and it is a DIFFERENT mechanism

The same *user-visible* complaint exists on hatch/contour/spiral **rulings**, but its cause is not
shared: ruling ends come from `surface-fill.js`'s region-boundary sampling (`edgeAt`), and the only
"inset" in that file, `adj.endInset` (`surface-fill.js:2851`, consumed `:8093-8098`), is a
`bundleLozenge` tone-law mark shape, not a silhouette trim. W-32 has already measured ruling endpoint
overshoot there (0.096–0.150 mm at creation defaults; up to 0.366 mm on the gallery's under-tessellated
rig) and its §A6 ranks four fixes.

**Scope ruling: W-35 is the SLICES path only** (`scene3d.js`'s contourSlice pass; lane fill-audit-d2).
A matching knob for rulings is **W-35b**, and it belongs to **fill-audit-a2** (`surface-fill.js`), after
W-32 has decided its own Rank. Do not let one implementer take both — `surface-fill.js` is another
lane's file and W-36/W-31/W-32/W-33 are queued in it.

### 1.5 Relationship to W-32 Rank 4 (asked for explicitly)

`W-32-W-33-plan.md` §A6 Rank 4 — *"refine the BORDER to the true silhouette (the W-27 treatment applied
to silhouette/boundary edges) — the only fix that satisfies W-32 and W-35 together"* — is the
**structural** answer to the same root cause from the other side. W-32's overshoot and W-35's
stair-step are both consequences of the drawn outline being an **inscribed facet polygon** while the
fill/slice geometry is **analytic**:

- Rank 4 moves the **outline** out to the true silhouette. That removes W-32's overshoot and it makes
  the ring ends land *on* a smooth curve, so the ladder loses its most visible cue.
- W-35's parameter moves the **ring ends** along the ring. It does not need Rank 4 and does not block
  it, and it gives Jay the *control* he asked for — Rank 4 gives him no knob at all.

They are **complementary, not alternatives**, and the parameter survives Rank 4 unchanged (its unit is
pen widths of arc along the ring; it never references the outline's geometry). **W-35 must not be sold
as "the fix" for the stair-step**: at the default it changes nothing, and even at max it hides the
ladder rather than removing the quantisation. If Jay wants the ladder *gone*, that is Rank 4 (large,
cross-lane, `scene3d.js` edge pass + `hlr.js`) or a sub-facet terminator refinement (§4.2 Rank 2) —
both are decisions for Jay, filed here, not for an implementer.

---

## 2. Parameter design

### 2.1 Identity

| field | value |
|---|---|
| param key | **`sliceEndOverlap`** (style param, contourSlice-only; sits with `sliceCount` / `sliceRotate` / `sliceTilt` / `sliceVisibility`) |
| UI label | **End overlap** (aria: *"Slice end overlap"*) |
| unit | **pen widths** (multiplied by the document `penWidth` at use, exactly as `CROWD_CULL_K * penWidth` already does at `scene3d.js:4526`) |
| range | **−2 … +8**, step 0.25 |
| default | **0** — a no-op, byte-identical (§3 T1, prototype-proven §4.1) |
| semantics | **> 0**: each open front run is continued along **its own ring** past the facet cut by `k × penWidth` mm of arc — more overlap at the silhouette, better outer-edge fidelity (Jay's ask). **< 0**: each open front run is trimmed by `\|k\| × penWidth` mm of arc — less ink piling on the outline, for wet-ink plotting (Jay's stated trade-off). |
| gate | **smooth surfaces only** — the same `smoothSurface && analyticProject` gate the refinement and the crowd cull already use (`scene3d.js:4420`, `:4528`). On a faceted primitive the front/back split is EXACT geometry and extending past it would draw onto a genuinely back-facing plane. **Inert (byte-identical) on box / plane / pyramid / faceted solid at any value** — assert it. |

Naming rationale: `slice*` prefix matches the four existing contourSlice keys, so `mapperDefaults`'
carry set, the panel table and the clamp switch all read consistently; "overlap" is Jay's own word.

### 2.2 Where the value comes from (the four-origins rule — CLAUDE.md § Configuration)

There is **no** `ALGO_DEFAULTS` entry and **no** factory preset for any contourSlice style param
today: `src/config/defaults.js:2156-2168` ships `styleTable.scene = { penId: null, mapper: 'wireframe',
params: {} }` and `ALGO_DEFAULTS.object3d.style = { penId: null, mapper: 'hatch', params: {} }` —
both with **empty params bags**. So a new key has exactly **three** origins, and all three must read 0:

1. `scene3d.js` — `finite(sp.sliceEndOverlap, 0)` in the pass.
2. `params.js` — `case 'sliceEndOverlap': return clamp(finite(value, 0), -2, 8);`.
3. `scene3d-panel.js` — the `MAPPER_CONTROLS.contourSlice` descriptor's `default: 0`.

⚠ The descriptor default is **live**, not documentation: `mapperDefaults` (`scene3d-panel.js:486-491`)
seeds `out[d.key] = carry(cur, d.key, cloneDefault(d.default))` on every mapper switch, so a non-zero
descriptor default would silently write a non-zero value into the bag on a hatch → Slices detour.
**A test must pin all three to 0 in one assertion** (§3 T6) — this is precisely the stale-Occlusion-Bias
failure mode CLAUDE.md warns about.

### 2.3 Serialization / `.vectura` round-trip

`Params.normalizeStyle` (`params.js:834-846`) is a per-key clamp with pass-through: a key with a
`clampStyleParam` case is clamped, any other finite number passes through unchanged. So:

- With the clamp case added, a saved `sliceEndOverlap` round-trips **clamped**, and a document saved
  by an older build (key absent) resolves to 0 — i.e. today's picture. **No `SCENE_MIGRATIONS` step and
  no `SCENE_VERSION` bump** (nothing structural changed — the same reasoning the file already records
  for `toneLaw` and `HIGHLIGHT_TREATMENT_ALIASES`).
- Undo/redo and the per-scope (scene / object / face) style write path need no change: the control
  writes through `commitStyle` like every other `MAPPER_CONTROLS` descriptor.

### 2.4 Files touched — and the two cross-lane hazards

| file | edit | hazard |
|---|---|---|
| `src/core/algorithms/scene3d.js` | the contourSlice pass only: read `sp.sliceEndOverlap` near `:4380-4394`; add the extend/trim helper next to `linkPlane` (`:4488-4494`); swap the **one** call site `:4533`. ~55 lines, all inside the slices block | **fill-audit-d2's own file and own block** — this lane owns the slices pass. Do not touch the faceted path or `mappers.js` |
| `src/core/scene3d/params.js` | **one `case` + a 4-line comment**, inside the CtS I5 group at `:723-731` | **HELD by fill-collapse-2** (U5b work is in `scene3d-tone-laws.js` + `params.js`). Minimal-touch rule: add the case **adjacent to `case 'sliceVisibility':` at `:731`**, change nothing else in the file, and announce it to the orchestrator before starting so fill-collapse-2 can serialise. If fill-collapse-2 is mid-edit, **wait** — do not merge around it |
| `src/ui/panels/scene3d-panel.js` | (a) one descriptor in `MAPPER_CONTROLS.contourSlice` (`:437-441`); (b) one `slider(...)` in the imperative per-leaf block (`:1348-1371`) so the Object tab matches the Style tab | **Three-author hazard** — this file is edited by several lanes. Re-read both regions **immediately before** editing; on "file modified since read", re-read and merge, never overwrite |
| `src/config/context-bar.js` | **NONE** | Checked: this file holds the fill-style roster and reachability rules only; it carries **no** contourSlice controls (`grep -n slice src/config/context-bar.js` → 0 hits). The context-bar/Style surface is rendered generically from `MAPPER_CONTROLS` by `renderControl` (`scene3d-panel.js:4078-4142`), so the descriptor in (a) **is** the context-bar control. The brief's "`context-bar.js`" surface does not exist for this param — say so in the impl report rather than inventing an edit |
| `user-presets/` + `src/config/user-presets.js` | **NONE** | No shipped preset uses `mapper: 'contourSlice'` (checked all three `user-presets/scene3d/*.vectura`), so nothing to re-bundle. Do **not** hand-edit `user-presets.js`. If Jay later wants a demo preset, that is a separate `.vectura` file + `npm run user-presets:bundle` |

---

## 3. RED oracle

New file **`tests/unit/scene3d-slice-end-overlap.test.js`** (new file — do not edit
`scene3d-contour-slice.test.js` or `scene3d-contour-slice-corners.test.js`; both carry W-27c-0a-4b's and
W-34's pinned fingerprints and must stay untouched, and both must still pass 57/57 and 25/25).

Rig: the audit rig of §0 (gallery `PRIMITIVE_PARAM_DEFAULTS`, `fillDensity 50`, `sliceCount 26`,
cameras a and b), driven through `AlgorithmRegistry.scene3d.generate` with a pass-through StyleCascade
stub, exactly as `scene3d-contour-slice.test.js` already does.

| # | assertion | RED today | why it is honest |
|---|---|---|---|
| **T1 — no-op default** | md5 of every emitted `sceneFill` path (x,y to 9 dp) at `sliceEndOverlap` absent **==** at `= 0` **==** the pre-fix tree, on `{ellipsoid, sphere, torus, cone, cylinder, capsule, box, plane, pyramid} × {a, b}` | vacuous before the fix (the key does nothing) ⇒ it is a **GREEN-side must-not-break**, run against a `git show <base>:…scene3d.js` override in the same process (the technique W-34 §5 used) | the one assertion that makes the param shippable |
| **T2 — the knob moves the end, monotonically** | on ellipsoid + sphere (no self-occlusion ⇒ the clip cannot re-cut), the **arc advance** of each open run's endpoint along its own ring is `k × penWidth ± 10%` for k ∈ {1, 2, 4, 8}; the advance is strictly increasing in k | RED (no advance at any k) | measures the contract directly, not a proxy |
| **T3 — negative retracts** | same rig, k ∈ {−1, −2}: each end retreats by `\|k\| × penWidth ± 10%` and total emitted ink **decreases** | RED | Jay's other direction |
| **T4 — edge fidelity is not bought by leaving the surface** | at every k, every emitted point's distance to the object's **analytic** surface ≤ the k=0 maximum + 0.01 mm (drive `Slices.analyticProjectLocal`, as `scene3d-contour-slice.test.js` already does) | RED-by-construction for the rejected Rank-3 design (§4.2), GREEN for Rank 1 | this is W-32 O3's anti-cheat, imported deliberately: **no fix may work by pulling ink off the surface** |
| **T5 — faceted inertness** | box / plane / pyramid / faceted solid: md5 identical at k ∈ {−2, 0, 8} | vacuous today ⇒ GREEN-side guard | §2.1's gate |
| **T6 — one default, three origins** | `clampStyleParam('sliceEndOverlap', undefined) === 0` **and** `MAPPER_CONTROLS.contourSlice` descriptor `default === 0` **and** a scene generated with the key deleted md5-matches one with `0` | RED (no case, no descriptor) | the stale-default trap (§2.2) |
| **T7 — mutation guard (non-vacuity)** | with the extension helper stubbed to a no-op, T2 must FAIL by ≥ 5× on ellipsoid | — | proves T2 is load-bearing, in the shape reviewers have demanded all round |

**Do not** write an oracle on total ink. Measured on the prototype (§4.1): sphere ink is **not
monotone** in k (1118.69 → 1126.61 → 1110.30 → 1149.41 → 1179.68 mm at k = 0/1/2/4/8) and torus ink
**falls** (897.10 → 928.15 → 891.94 → 883.24 → 885.84 mm, runs 44 → 45 → 44 → 42 → 40) because the
lengthened ring is legitimately re-clipped and re-culled. That is correct behaviour and an ink bar
would reject it. Arc advance per end (T2) is the honest quantity.

---

## 4. Ranked designs, exact edits, and evidence

### 4.1 **Rank 1 — extend/trim along the ring itself. PROTOTYPE-VERIFIED.**

Built and measured in this planning pass (a third scratch export, patched via `scriptOverrides`; the
worktree was never touched). Mechanism:

1. Read once, next to `const sliceTreat = strokeTreatment(sp);` (`scene3d.js:4394`):
   `const END_OVER_MM = clamp(finite(sp.sliceEndOverlap, 0), -2, 8) * penWidth;`
2. Beside `linkPlane` (`:4488`), add `linkFrontExtended(g)`:
   - **`END_OVER_MM === 0` ⇒ `return linkPlane(g.front);`** — the literal call site of today, which is
     what makes T1 exact rather than approximately equal.
   - otherwise: link the **whole** ring for this plane, `linkSegments([...g.front, ...g.back])` (the
     two chains share their crossing points *bit-for-bit* — `edgeCross` computes each shared facet-edge
     crossing from the same two vertices with identical arithmetic, `scene3d.js:133-142`), locate each
     front chain's two endpoints in that closed ring, and walk outward accumulating world-space arc
     until `END_OVER_MM`, interpolating the final partial edge. Negative k walks **inward** along the
     front chain instead, trimming.
   - refine the extended chain with the **same** call `linkPlane` uses (`refineSliceRing` +
     `analyticProject` + W-34's `project`), so the added points are analytic-surface points, not chords.
3. Swap the single call site `:4533` `linkPlane(g.front)` → `linkFrontExtended(g)`.
   `linkPlane(g.back)` at `:4574` is untouched (fullContour dashes are unchanged, by design — say so
   in the report).
4. Everything downstream — crowd cull, `clipPath`, `MIN_RUN_MM`, `emitRuns` — is unchanged and still
   sees the run. The clipper is therefore the **natural safety valve**: extension that runs into real
   occlusion is cut, which is why the torus's ink falls at large k instead of drawing nonsense.

**Prototype numbers (`fe491dfa` + this patch, ellipsoid/sphere/torus, camera a, md5 over emitted
`sceneFill` geometry):**

| primitive | k=0 md5 vs unpatched | k=0 ink | k=1 | k=2 | k=4 | k=8 |
|---|---|---|---|---|---|---|
| ellipsoid | **identical** `2da44441c7b9` | 1321.7784 | 1330.5416 | 1339.2112 | 1344.5038 | 1390.7215 |
| sphere | **identical** `8b08610b346f` | 1118.6882 | 1126.6071 | 1110.2973 | 1149.4147 | 1179.6778 |
| torus | **identical** `aff2924210f5` | 897.1044 | 928.1545 | 891.9389 | 883.2395 | 885.8400 |

**The no-op default is proven, not asserted** — md5 and ink match the unpatched runtime to the last
digit on all three primitives, and endpoint-to-outline distance is unchanged
(ellipsoid max 0.351 mm at k=0 in both).

Visual, same framing, same crop (`W-35-plan-evidence/`, §0): k=0 shows the squared-off end and the
notch; k=2 moves the end along the outline and shallows the notch; k=8 runs the ring continuously
through the crop. Endpoint→outline distance **does not grow** with k (ellipsoid max 0.351 → 0.355 →
0.354 → 0.343 → 0.341 mm), i.e. the extension hugs the silhouette rather than flying off it — which is
exactly "preserves outer edge fidelity", and is the T4 property in observational form.

**Known limitation to state in the impl report, not to hide:** at large k on a strongly self-occluding
body (torus) the extension is re-clipped and whole runs can disappear (44 → 40 runs at k=8). Cap the
slider at 8 pens and say so in the help text.

### 4.2 Rank 2 (NOT for this unit — file it) — sub-facet terminator refinement

Compute the true front/back transition **inside** the facet (bisect the ring against the analytic
`n · view = 0` condition, the way `refineSliceRing` already Newton-snaps to the surface) and cut there
instead of at the facet edge. This **removes** the quantisation rather than papering over it: it is the
slices-side twin of W-32's Rank 4, it moves every contourSlice ring on every smooth primitive
(so it invalidates W-27c-0a-4/4b's fingerprints and every contourSlice gallery cell), and it has no
byte-identical default. **It is a look change to a shipped treatment — the same class as W-34's Fix C —
and therefore Jay's call, not an implementer's.** Recorded here so nobody attempts it inside W-35.

**Explicitly rejected: a straight tangent stub.** Extending along the terminal segment's direction
leaves the surface within a millimetre and would be caught by T4 — and it is the very family W-32's O3
was written to forbid.

### 4.3 Guards that must still pass (named, with today's counts on `fe491dfa`)

`tests/unit/scene3d-contour-slice.test.js` **57/57** (includes W-27c-0a-4b's six cone/cylinder
fingerprints and the seven torus O2 metrics), `scene3d-contour-slice-corners.test.js` **25/25** (W-34's
M1/M2/T3/T4 + mutation guard), `scene3d-mappers.test.js` 32/32, `scene3d-hlr.test.js` 11/11,
`scene3d-curves.test.js` 13/13, plus `tests/integration/scene3d-panel.test.js` for the new control.
Foreground, one file at a time.

**Expected `## Bars changed`: NONE.** With the default at 0 every existing fingerprint is
byte-identical (§4.1). If any bar moves, the design has been mis-implemented — **stop and report**;
do not re-pin.

### 4.4 Evidence the implementer owes

The gallery has **no** param sweep and cannot make one: `scene3d-capture.js:219` hard-codes
`params: { fillAngle: 45, fillDensity: densityValue, toneLaw: item.style }`. So:

1. **Gallery re-shoot (unchanged output, as proof of the no-op):**
   `node scripts/audit/scene3d-capture.js --tier A --root <worktree> --port 8481 --only
   '(sphere|ellipsoid|torus|cone|cylinder|capsule)__contourSlice' --out
   docs/3d-audit/fill-audit/after/W-35` — run from MAIN. These cells **do** exist (confirmed:
   `after/W-34/manifest.A.1-1.jsonl` lists all ten). Byte-identical pairs are expected here and **must
   be explained in `report.json`**, per protocol.
2. **Bespoke sweep (the real evidence):** copy `buildAndMeasure` (`scene3d-capture.js:194-262`) into
   `scripts/audit/w35-end-overlap-sweep.js`, adding `sliceEndOverlap` to the style bag, and shoot
   **torus and sphere (and ellipsoid) at k ∈ {−2, 0, 4, 8}**, same camera, same framing
   (`frameAndCrop`'s `FIXED_ZOOM`). Then **crop the ring-end region at native resolution** (PIL/magick
   → Read) and describe what you see. A whole 800 px cell hides a 0.3 mm feature — this is the failure
   mode that got past three agents on 2026-09-05.
3. **Live app verification (non-negotiable):** add a contourSlice object in the running app on
   `:8481`, drag the **End overlap** slider min → 0 → max, screenshot each, confirm one undo per
   gesture, confirm the value survives a mapper detour (Slices → hatch → Slices) and a
   `.vectura` save/open round-trip. The chrome-devtools MCP browser may be owned by another session —
   use Playwright (`tests/e2e` helpers) rather than fighting the lock.

---

## 5. Docs contract (all four are required — this is a user-facing capability)

| doc | what to write |
|---|---|
| `README.md` | one row/line in the 3D scene feature panel: Slices gains **End overlap** — how far each depth-slice ring is carried past (or pulled back from) the silhouette, in pen widths; default 0 = unchanged |
| in-app help guide | the same sentence plus the trade-off in Jay's own terms: *increase for a continuous outer edge; decrease to keep wet ink off the outline*. (No shortcut is added, so the shortcut list is untouched — say so explicitly in the impl report) |
| `CHANGELOG.md` | one entry under the new version: "Slices: new **End overlap** control (−2…+8 pen widths, default 0 — no change to existing scenes)". **Re-read the top of the file immediately before editing** — it is a top-collision file |
| `plans.md` | mark the W-35 item done and record that the *stair-step itself* remains open (Rank 2 / W-32 Rank 4 are Jay's decision) |
| `docs/3d-audit/lane-reports/LEDGER.md` + `STILL-OPEN.md` | row 15 / the W-35 entry updated with the landing sha and the finding that the stair-step is facet quantisation, not an overlap-avoidance trim |
| version | patch bump via the commit hook (a worktree cannot bump — **do not bump by hand**; the merge does it) |

---

## 6. Lane recommendation and ordering

- **Lane: fill-audit-d2 (`:8481`)**, one implementer, base sha `fe491dfa`. It owns the slices block of
  `scene3d.js`; W-34 has just landed there, so there is no rebase risk inside the block.
- **Order: W-35 BEFORE W-27c-0a-2.** W-27c-0a-2 (residual saddle/pole merging) is
  **PLANNING-DEFERRED** and, per the W-27c-0a-4 review, its next step is to *measure* a shorter or
  adaptive `CROWD_MIN_ARC_MULT` / a peak-local-density trigger. W-35 at its default changes nothing, so
  it cannot disturb that measurement; the reverse is not true — a new cull mechanism changes which
  rings exist and would force W-35's evidence to be re-shot. W-35 is also the smaller, closed unit and
  it is a **USER product request**, which outranks a deferred internal follow-up.
- **Cross-lane sequencing:** announce the one-line `params.js` touch to the orchestrator before
  starting so **fill-collapse-2** can serialise; re-read the two `scene3d-panel.js` regions immediately
  before editing (three-author hazard). If either file is being edited right now, **W-35's `scene3d.js`
  work can still start** — the param can be read with `finite(sp.sliceEndOverlap, 0)` before the clamp
  case exists — but it must not be committed until both surfaces are in.
- **W-35b (rulings, `surface-fill.js`) is fill-audit-a2's** and must wait for W-32's Rank decision.
- **For Jay, together with W-34's Fix C** (§4.2 Rank 2 and W-32 Rank 4): the *knob* ships now; the
  *removal* of the stair-step is a look change to a shipped treatment and needs his word.

---

## 7. Stop conditions

Stop, write the report, and hand back rather than pressing on if any of these is true:

1. **T1 is not exact.** If k=0 is not md5-identical to the pre-fix tree on all ten cells, the design has
   leaked into the default path. Do not "explain" a 1e-9 difference — restructure so the k=0 branch is
   the literal `linkPlane(g.front)` call.
2. **Any existing bar moves.** A single changed fingerprint in `scene3d-contour-slice.test.js` or
   `scene3d-contour-slice-corners.test.js` means the default is not a no-op. Never re-pin.
3. **`params.js` or `scene3d-panel.js` is dirty with another lane's work.** Stop and report; do not
   layer edits on top of someone's uncommitted change.
4. **T2 cannot be met honestly** because the extension is eaten by the clipper on the chosen primitive.
   Re-scope T2 to ellipsoid/sphere (documented above as the non-self-occluding pair) — but if it fails
   *there*, ship the measurement and stop.
5. **The live app shows the ends moving off the surface**, or the slider produces a visible hook curling
   back inside the silhouette at max. Reduce the cap, re-measure, and disclose the change in range.
6. **Anyone proposes editing `surface-fill.js`** to give rulings the same knob. That is W-35b, another
   lane, and out of scope by §1.4.
7. **Anyone proposes making the stair-step go away** (Rank 2 / W-32 Rank 4) inside this unit. That is a
   look change on every contourSlice cell — Jay's decision, §4.2.

---

## Bars changed

**None.** This is a plan; it moves no threshold. The implementer's expected entry is also "none" —
see §4.3.

## Appendix — how the planner's numbers were produced (reproducible)

Scratch export of `fe491dfa` (`git archive | tar -x`, `node_modules` symlinked), three offline
harness scripts driving `tests/helpers/load-vectura-runtime` in a plain node process:
(a) endpoint/outline geometry (`today-endpoint-numbers.json`), (b) terminal-stub and detail-sweep
statistics, (c) the Rank-1 prototype via `scriptOverrides` on `src/core/algorithms/scene3d.js`
(`prototype-numbers.json`). Rasterised crops at 24 px/mm with a 0.3 mm round stroke. The worktree
`.claude/worktrees/fill-audit-d2` was never read-modified, never stashed, never checked out; the
scratch directory has been removed.
