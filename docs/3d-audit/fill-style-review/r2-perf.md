# R2: Adversarial perf audit of Object 3D Fill Type / Fill Style with rotation

Auditor: read-only. `src/` was not changed. Every fix was prototyped in one of two ways:
- as a runtime wrap inside the page, or
- as a modified **copy** of a source file, served through Playwright `page.route()`.

Setup: repo `main` @ e609338c (v1.4.5), own `python -m http.server` on :8733 (now stopped), headless Chromium (Playwright), Node 20.
Scene: `engine.addLayer('scene3d')` (group + sphere object3d + light + ground), Fill Type hatch.
Drags are real `page.mouse` drags on the Y gizmo ring and on the camera orbit pad, plus CDP touch drags.
"Identity" means an FNV hash over every `x,y` of `group.scenePaths` (full float strings).
Harness and outputs: `fillstyle-audit/r2p/` (`lib.js`, `patches.js`, `e1…e6*.js`, `fullbench.js`, `ribbon-break.js`, `raster-erode.js`, `prof1.js`, `*.json[l]`, `shots/`).

**Visual verification:** draft and full frames were screenshotted in the real app (`r2p/shots/*-pair.png`).
The ribbon-erosion alternative was compared at pen scale (`shots/cmp-*.png`) and checked for geometric containment.
I did NOT do a manual (non-headless) session.

---

## 1. Verdict table: round-1 claims, verified by prototype

| ID | R1 claim | Prototype | Before → after (ms) | Identity | Verdict |
|---|---|---|---|---|---|
| **B1/F1** | Group `generate(…,{preview})` drops the draft flag | Forward `preview` → `bounds.fastPreview` on group compose | Gizmo drag step: ladder 29.6 → **3.4**; taperedEnds 1072 → **3.2**; nibAngle 1075 → 3.1; trochoidLoop 3566 → **3.0**; turingStripe 406 → 3.0; etfKang 313 → 3.1. FPS 1.4–14 → **59–61**. Camera orbit: nibAngle 1045 → 3.3. Touch drag: identical numbers. | Settled frame unchanged; release still runs at full quality | **CONFIRMED.** The fix alone is not enough (see F5). |
| **F5** | A draft drops the chosen Fill Style | Hashed the draft frame across 6 laws | Every law's draft frame has the **same hash** (`359fee90`, 106 paths, 507 pts) as ladder. Screenshot: sparse flat diagonal hatch vs. the full law (`shots/B1-hatch-trochoidLoop-pair.png`). | — | **CONFIRMED, and severe.** The draft is a different picture, so release pops. |
| **B2/F2** | Panel edits generate the active child standalone, then recompose | (a) route a consumed child → owning group `generate`; (b) pass `_sceneConsumed` into `object3d.generate` | `app.regen()` with child active: ladder 78 → 36; taperedEnds 2036 → 964; **etfKang 4593 → 308**. Fill Style select → taperedEnds: wall 2188 → 1188, 2 algo calls → 1. | (a) and (b): `scenePaths` hash identical. (b) also gives identical `optimizedPaths`. (a) leaves optimization invalidated (same as the gizmo path; the draw is OK). | **CONFIRMED, and worse than R1 said:** the wasted standalone run can cost **14× the real compose** (NEW-2). |
| **B3** | Extra regen on gizmo mouse-up | — | After B1 the release is the only full render, so it is required. | — | **MOOT once B1 lands.** Keep the release regen; defer it (F6a). |
| **F3** | Precomputed rotators = 25–60 % off every curved frame | 4-slot trig memo inside `rotatePoint`, no destructuring | ladder 30.2 → 30.5 (0 %); etfKang 351 → 284 (−19 %); turingStripe 471 → 376 (−20 %); mezzoRegion 413 → 316 (−24 %); taperedEnds 968 → 920 (−5 %); contFieldTouch 50 → 43 | **bit-identical** (6/6 hashes) | **PARTLY CONFIRMED.** In Chrome it gives 0–24 %, not 25–60 % (the R1 numbers came from a Node/JSDOM profile). It is still worth doing: cheap and identical. Full call-site rotators would add a few % more. |
| **F7** | Turing hoist + ping-pong → 2× on turingStripe | Hoisted `Dv[k]`, inline clamp (same `\|\|0` semantics), ping-pong with border zeroing | turingStripe 435 → 418 (−4 %) | **bit-identical** | **REFUTED as a big win.** Chrome inlines `clamp` and the `slice()` cost is small. Do it only as hygiene. |
| **F8** (mono `inv`) | Mono laws are dominated by `inv`→`sampleAt` | Profiled in Chrome | etfKang: `tooClose` **26 % self** is the #1 hotspot. `inv` is 26 % inclusive. | — | **REFINED.** The real #1 mono hotspot is the streamline spacing grid (NEW-1). |
| **F4** (ribbon) | PenFill EDT on an axis-aligned bbox and `insetMultiPolygon` erosion dominate | Instrumented all four primitives | weaveDepth 2882 ms = inset **1657** (42 calls, ~40 ms each) + PenFill 832 + clip 33 + build 8. trochoidLoop 3202 = inset **2132** + PenFill 636. onePenDown 2571 = inset 1527 (**86 ms/call**) + PenFill 624. nibAngle 966 = inset 281 + PenFill **592**. | — | **CONFIRMED with a split.** Erosion dominates the wave laws (57–66 %). PenFill dominates the width laws (61–65 %). See §2. |
| **F4a** oriented PenFill | 10–30× fewer cells | Runtime wrap: rotate rings into the PCA frame, fill, rotate back | PenFill time −30 … −45 % (weaveDepth 832 → 470; nibAngle 592 → 337). Totals: nibAngle 966 → 718, weaveDepth 2882 → 2589. | Not identical. Coverage equal or higher (trochoid 0.9835 → 0.9994). | **CONFIRMED, but 1.4–1.8×, not 10–30×.** The fixed costs (labels, repair, chaining) do not shrink with the cell count. |
| **F9** | Ground shadow fields cost about 12 % | Hid the ground child | ladder full frame 36 → 18 ms (**ground = 50 % of the default frame**). nibAngle 1072 → 1060 (1 %). Draft (B1) 5.2 → 3.1. | — | **CONFIRMED and larger than stated** for the default and cheap laws. It is noise on the ribbon laws. |
| **F11** | No per-object reuse | 3 nibAngle spheres, drag one | Full compose 1078 → 3407 (linear in N). Release with B1: 1114 → 3319. Drag step with B1: 3.4 → 8.5. | — | **CONFIRMED.** Moving 1 of N objects re-runs all N. An LRU would make the release about 1/N. It does not help a camera orbit. |
| **F6** | Release does a full render + full panel DOM rebuild | Timed `ui.buildControls` | child 1.3 ms, group 1.1 ms | — | **Panel-rebuild half REFUTED** (negligible). The full-render-on-release half is CONFIRMED: it is the only remaining freeze after B1. |
| **F15** | `updateFormula`/gallery refresh on each orbit move | Wrapped and timed them | 21 calls / 20 moves = 2.7 ms total | — | **REFUTED** (≈0.13 ms per move). |
| **F16** | Slow frames reverse the gizmo unwrap | Not provoked (4–12 step drags all landed monotone: 9°/step) | — | — | **UNVERIFIED.** B1 removes the trigger in any case. |

## 2. The ribbon fix: alternatives to `insetMultiPolygon`, and the one that wins

The pipeline per stretch is: `build ribbon(centre, hw)` → `clip(region)` → `erode(pen/2)` = outline → `erode(pen·(0.5−overlap))` = fill region → `PenFill.fillRegion`.
Measured shares are in §1 (F4 row).

| Alternative | Prototype | weaveDepth | trochoidLoop | onePenDown | nibAngle | Notes |
|---|---|---|---|---|---|---|
| baseline | — | 2882 | 3202 | 2571 | 966 | — |
| (c) RDP-simplify erosion input (tol 3 % of inset) | `simp` | 2577 | 2659 | 2158 | 837 | inset −20 … −58 %. Cheap. Not identical. |
| (a) oriented PenFill only | `ORIENT` | 2589 | 3058 | 2475 | 718 | PenFill −30 … −45 % |
| (c)+(a) | `simp+orient` | 2142 | 2410 | 2047 | 535 | about 1.3× on waves, 1.8× on width laws |
| **(d) raster erosion from ONE oriented SDF, reused for both erodes** + oriented PenFill | `raster+ORIENT` (`r2p/raster-erode.js`) | **1146** (2.5×) | **1084** (3.0×) | **1151** (2.2×) | **607** (1.6×) | inset 1657 → 311, 2132 → 270, 1527 → 281 |
| (e) analytic: `clip(ribbon(c, hw−d), erode(region, d))` | not built | — | — | — | — | Erosion distributes over ∩ exactly. But erode(swept union) ⊋ union of narrower sweeps at self-crossings (trochoid/weave loops), so it leaves slivers at loop crossings. The region erosion also needs caching per object. It is weaker than (d) for the loop laws. |
| cache by ribbon | not built | — | — | — | — | A rotation changes every stretch, so the cache never hits during a drag or after a camera move. It helps only re-renders of an unchanged scene, which a compose memo (NEW-3) covers better. |

How (d) works: the clipped ribbon is rasterized once in its PCA frame at `cs = d/4` (pen/8) by PenFill's own `buildField`. The outline is the iso-contour at `pen/2`. The fill region is the iso-contour of the **same field** at `pen·(1−overlap)`; Euclidean SDF levels compose, so `erode(R,a+b)` is just a deeper level. This removes both polygon-clipping sweeps.

Quality (`shots/cmp-weaveDepth.png`, `cmp-trochoidLoop.png`, `cmp-nibAngle.png`, 14 mm crops at pen width):
- The two versions are visually equivalent.
- PenFill coverage of the fill region is equal or better (weaveDepth 0.958 → 0.9986, onePenDown 0.833 → 0.997).
- Ink area is −2 … −7 % at a one-cell safety offset (`LVL=1`) and about the same at `LVL=0.5`.

Containment (CHECK: every outline vertex vs the clipped input):
- **0 vertices outside the ribbon** at any level.
- nibAngle has 0 shallow vertices at LVL ≥ 0.5.
- weaveDepth keeps 36–258 of about 25 k vertices up to 0.14 mm shallower than `pen/2`. These are at sharp concave corners: the contour cuts the corner chord.

So the production version needs a guard. Two options: clip the outline against the exact `erode(region)` once per object, or drop the shallow vertices.

The vertex count is +4 … +40 %. Raise the contour `simplifyTol` from `cs·0.25`.

Estimate: M (a PenFill API `fillRegionFromField(field, level, …)`, plus an `erodeLevels` helper, plus a containment guard, plus a golden refresh).
Expected: wave laws 2.2–3×, width laws 1.6×.
Reusing the same field inside PenFill (skip its second `buildField`) should give a further ~20–30 %. That part is not prototyped.

## 3. The draft must keep the law: a law-preserving draft tier, prototyped

Prototype (`e2-lawdraft.js`, `patches.LDR`): during a drag, run the **full** compose, so the tone, the law's ruling placement and the chart wrap all survive. Only `ribbonize()` short-circuits: it returns the weighted centreline (`run.weightScale = mean(wPts)`), which the renderer already strokes wider.

| Law | Full frame | B1 flat draft | **Law draft** | Look (screenshots) |
|---|---|---|---|---|
| taperedEnds | 1072 | 3.2 | **32** | matches the full frame |
| nibAngle | 1075 | 3.1 | **30** | matches; a few weighted dots overshoot the limb slightly (no clip) |
| trochoidLoop | 3566 | 3.0 | **39** | matches (`shots/lawdraft-hatch-trochoidLoop-pair.png`) |
| weaveDepth | ~3100 | 3 | **54** | matches |
| onePenDown | ~2400 | 3 | **42** | matches |
| turingStripe | 406 | 3.0 | 465 | **no help** (mono law, no ribbons) |
| etfKang | 313 | 3.1 | 322 | **no help** |

Panel sliders on the object Style/Object tabs, taperedEnds (`e3-gaps-*-panel.json`):

| Path | Per-frame cost | Commit | Law visible during the drag? |
|---|---|---|---|
| base | 978–1111 ms (7 ms wasted standalone draft + ~1 s full recompose) | 2210 ms (2 full) | yes |
| B1+B2a | **14–18 ms** | 1006 | **NO**: flat hatch. A Fill density drag shows nothing of the law. This is the "static diagonal lines" regression that `scene3d-panel.js:2172-2179` already warns about. |
| LD+B2a | **33–39 ms** | 1021 | **yes** |

Recommended tier policy:
1. If the last settled compose was ≤ 40 ms, run full quality during the drag (no pop for ladder, contField*, bundle*, pen*, mk*).
2. Otherwise, use the law-draft tier (ribbon bypass). Mono laws additionally need a lattice coarsening factor (Turing NX/NY, Voronoi seeds, streamline `STEP`/separation ×1.5–2). That is not prototyped; at 200–460 ms they would otherwise stay at 2–5 fps.
3. Use the flat Phase-1 hatch only as the last resort, when the law draft itself exceeds about 60 ms.

## 4. NEW findings (gap hunt)

| ID | Finding | Evidence | Location | Fix / identity |
|---|---|---|---|---|
| **NEW-1** | The streamline spacing grid in mono laws is the #1 mono hotspot. Cells are `PMAX` wide with string keys, so each `tooClose` scans a large neighbourhood of 0.34 mm-spaced points through template-string `Map` lookups. | `tooClose` 26 % self (etfKang), 19 % (mezzoRegion). Numeric keys alone: −6 %. **Grid ÷4 + numeric keys + hoisted d²:** etfKang 330 → 233, mezzoRegion 367 → 264, defectSplit 301 → 222. Combined with F3: etfKang **330 → 197 (−40 %)**, mezzoRegion −40 %, defectSplit −40 %, originSpiral −22 %. | `surface-fill-mono.js:551-571`. The same string-key pattern appears at `surface-fill-mono.js:1662, 2038, 2150`, `surface-fill.js:6484, 6784, 7223, 7414, 10483, 12125`, `torus-occlusion.js:440` | **bit-identical** (hashes equal for all 6 mono laws). S. |
| **NEW-2** | The B2 waste is not 2×. The standalone child run uses the scene3d factory defaults, not the scene, and for some laws it costs far more than the real compose. | `app.regen()`, child active, etfKang: **4593 ms, of which ~4.3 s is the discarded standalone run**, vs 308 ms with B2 fixed (14.9×). taperedEnds 2036 → 964. | `object3d.js:21-22,89`; `app.js:1290` | identical `scenePaths`. S. |
| **NEW-3** | There is no compose memo. `computeAllDisplayGeometry` recomposes **every** scene group at full quality on 22 call sites, most of which do not touch the scene: SVG export, layer reorder/move/duplicate/remove, the pens panel, stroke options, modifiers, divisions, and mirror-guide drags (`renderer.js:7521`, **per pointermove**). | **SVG export of trochoidLoop: 3507 ms, of which 3.3 s is `getExportSnapshot`→`computeAllDisplayGeometry`→ a scene recompose.** The SVG string itself takes ~50 ms (ladder 56 ms, 26 KB; trochoid 450 KB). The pens panel calls `generate(sceneRoot)` **and then** `computeAllDisplayGeometry()` (`pens-panel.js:395-397`), so it composes twice. | `engine.js:2516-2560, 2645`; `ui-file-io.js:618` | Add a per-group dirty/input signature (canonical stringify of `assembled` + bounds + pen widths). Skip the compose when it is clean and `!_pathsFromDraft`. Identical. M. **After B1 this becomes mandatory for correctness:** a clean-but-draft group must recompose before export/expand. |
| **NEW-4** | B1 + B2 without a law draft would regress style sliders. The object panel's `mkCommitKit.liveSlider` (`scene3d-panel.js:830-845`) routes **every** slider, including Fill density and law sub-settings, through `regenDraft`. Only the group panel has `liveSliderFull`. | Measured above (§3): after B1+B2a, a Fill density drag shows the flat hatch. | `scene3d-panel.js:826-860` vs `:2172-2179` | Ship B1 together with the law-draft tier, or give the object kit a `full`/style flag. |
| **NEW-5** | Ground + shadow is half of every cheap frame. | ladder 36 → 18 ms with the ground hidden. Draft 5.2 → 3.1. | `shadows.js:1547-1640`, `:2666` | F9 (scanline PIP + segment grid) is the fix for cheap laws. It is worth more than F3 for the default look. |
| **NEW-6** | Multi-object cost is strictly linear, including the release. 3 spheres: 3.4 s per release even after B1. | §1 F11 row | `scene3d.js:4579` | F11 LRU (identical if the key is complete). It is the only lever for "move one of N". |
| **NEW-7** | Panel number fields and slider commits cost 2 full composes (B2) **plus** the per-frame draft. Typing a yaw value costs ~2.1 s on taperedEnds today. | `commitMs` 2213 / 2128 | `scene3d-panel.js` commit → `app.regen()` | Fixed by B2. |

Gap areas checked with **no new issue**:

| Area | Result |
|---|---|
| Camera orbit (`apply3DRotationDrag`) | rAF-coalesced, 1 regen per move; behaves exactly like the gizmo; B1 fixes it identically. |
| Touch drag (CDP touch events) | Same pipeline and the same numbers. |
| Undo history | Exactly **1** snapshot per drag gesture (pushed on the first move). 8 KB, 0.2 ms. Path geometry is not snapshotted. |
| Memory over a 100-step drag | Base ladder: heap 57 MB → 79–179 MB sawtooth → **30 MB after GC**. B1 nibAngle: 60 → 113 → **31 MB after GC**. No leak; there is GC churn only. |
| Draw / stats / optimize on dense output (39 k pts) | `draw` 9.4 ms, `updateStats` 0.7 ms, `optimizeLayers` 15 ms. Not a factor. |
| Panel rebuild on a Fill Style switch | `buildControls` 1.1–1.4 ms. Not a factor. |
| Escape-cancel of a gizmo drag | Already does a full `generate`, so a draft cannot persist after B1. |

## 5. Recommended fix sequence

| # | Change | Measured / estimated gain | Identity | Effort |
|---|---|---|---|---|
| 1 | **B1 + law-draft tier + adaptive tier choice** (one unit; NEW-4 forbids B1 alone). Set `_pathsFromDraft` on the group. | Drag: ribbon laws 1–3.6 s → **30–55 ms** with the law visible. Default and cheap laws stay full quality (≤ 40 ms). | Settled output identical | M |
| 2 | **B2**: route a consumed child's `generate` to the owning group (option a for preview, so panel drafts get the tier) and keep `optimizeLayers` (option b semantics) for commits | Panel edits ½ to **1/15** (etfKang 4.6 s → 0.3 s); slider frames 1 s → 35 ms | identical | S |
| 3 | **NEW-3** compose memo, plus "recompose if `_pathsFromDraft`" before export/expand | SVG export 3.5 s → ~0.06 s on an unchanged scene; unrelated UI edits become free | identical | M |
| 4 | **NEW-1** numeric fine grid (+ the other 10 string-key grids) and **F3** rotator | Mono laws −40 % | bit-identical | S |
| 5 | **F6a** defer and cancel the release settle (idle/timeout, cancelled by the next pointerdown) | Rapid nudges stop stacking seconds of freezes | identical | S |
| 6 | **Ribbon (d)**: shared oriented SDF erosion + oriented PenFill + containment guard | Settle 2.2–3× (wave), 1.6× (width) | golden refresh | M |
| 7 | **F9** shadow scanline + segment grid | ~15–18 ms off every frame (50 % of the default frame) | bit-identical | S–M |
| 8 | **F11** per-object fill LRU | Release with N objects → ~1/N | identical if the key is complete | M |
| 9 | Mono-law draft coarsening factor | Mono drags 200–460 ms → est. 50–100 ms | drag only | M |
| 10 | F6b Web Worker for the settle | Removes the remaining 0.4–1.2 s freeze | identical | L |
| — | F7 (Turing hoist), F15, F16, panel rebuild | Measured as negligible. Only F7 is worth doing, as hygiene. | — | — |

After steps 1–6, the worst case (trochoidLoop + crosshatch) goes from **7 s per drag frame + 7 s release** to about **40–80 ms per drag frame + ~2.3 s release** (deferred). Step 10 removes that freeze too.

## 6. Saturation judgement

The audit is **saturated for the "Fill Style × rotate" complaint.**
- Round 2 confirmed the dominant cause (B1), with exact numbers.
- It showed that B1 is unsafe alone (F5 + NEW-4) and prototyped a working law-preserving tier.
- It quantified the ribbon split and found a 2.2–3× erosion replacement.
- It corrected two over-estimates (F3, F7) and refuted three minor items (F6-rebuild, F15, panel cost).
- Its gap hunt found 7 new items. Only NEW-1, NEW-2 and NEW-3 are material.

Untested gaps that remain, all minor: `voronoiWeb` and `turingStripe` internals beyond F7 (each still 320–350 ms), the B4 curve finish under the raster variant, a manual (non-headless) feel check, and F16 under real coalesced pointer events.

Another audit round would hit diminishing returns. The next useful step is implementation (sequence §5), with a live re-measure after units 1–3.
