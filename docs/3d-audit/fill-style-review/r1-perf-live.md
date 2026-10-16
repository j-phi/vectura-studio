# R1 — Live perf audit: Object 3D Type x Fill Style x rotation

Lens: b-live (measured in a real Chromium via Playwright, own server :8517, repo HEAD e609338c v1.4.5, headless, Apple-silicon Mac).
Setup per config: `app.engine.addLayer('scene3d')` (real scene tree: group + object3d child + light + ground), style written to the child's `params.style = {mapper, params:{fillCurves:true, toneLaw}}`, group selected, object scene-selected.
"Full regen" = wall clock of `app.regen()` (min of 3). "Rotate" = a REAL mouse drag on the Y gizmo ring (`page.mouse` down/move/up, 30 moves at ~16 ms cadence; 10 moves when regen > 250 ms), timing every `engine.generate` / `Algorithms.scene3d.generate` / `renderer.draw` call, rAF frame deltas, and PerformanceObserver long tasks.
Coverage: all 49 Fill Styles (48 roster ids + shipped default `ladder`) under hatch on sphere and box; every Type with the default law on sphere, box and torus; 6 slow laws x 5 other Types on sphere and torus; 2 ribbon laws x 4 Stroke Fill Styles. 194 configs in total.
Raw data: `r1-perf-live.json` (phase 1), `r1-perf-live-matrix2.json` (law x Type matrix), `r1-perf-profiles.json` (CPU profiles), `r1-perf-child-path.json` (object-selected path). Harness: `harness.js` + `inpage.js`, `ui-pick.js`, `child-path.js`.

## Headline

1. **Cost is set by the Fill Style, not by the Type.** With the default law, every Type costs 22–45 ms per regen on sphere and torus and about 1 ms on box, which is smooth (45–60 fps drag). Twelve RIBBON_LAWS (variable-width laws drawn as outline + pen-fill ribbons) cost **1.0–7.4 s per regen**. The wave/weave ribbon laws are the worst: trochoidLoop, weaveDepth, ampSpacing, onePenDown and interlockWeave cost 1.9–3.3 s under hatch. Under crosshatch or contour they cost **3.5–7.4 s**. The "mono" laws (turingStripe, mezzoRegion, voronoiWeb, etfKang, defectSplit) cost 250–700 ms. The ribbon laws are no-ops on spiral, stipple and wireframe, so those Types stay fast.
2. **The drag regenerates at full quality on every frame.** Drag regens are correctly coalesced to 1 per rAF (measured 1.00 regen/move and 1.00 algo/regen in all 194 configs; no stats or extra draws during the drag). But the "draft" preview is a no-op for scene trees, so each rotate step costs exactly the same as a full regen. Example: nibAngle costs 1053 ms per step and drags at 2.8 fps; trochoidLoop + crosshatch costs about 7 s per step and drags at 0.4 fps. Then the release triggers one more identical full regen.
3. **An idle main thread exists only for the default law.** Every non-default config with regen > 33 ms drops frames for its whole duration. One rotate step equals one long task of the same length.

## Bugs observed

| ID | Bug | Evidence | Where |
|---|---|---|---|
| B1 | **Draft preview never reaches the scene compositor.** `engine.generate(groupId, {preview:true})` returns early for groups into `_composeSceneGroup`, which hard-codes `fastPreview: false`. So `previewDetailScale` returns 1, `draft` is false, and tone, ribbons, SurfaceFill, HLR and shadow booleans all run at full quality on every drag frame. `preview3dQuality='draft'` is set but is inert without `fastPreview`. | All 194 drag runs: `dragAlgoFast = 0` and drag step cost equals full regen cost. On the object3d leaf path, the same params with fastPreview=true took **8 ms vs 1037 ms** (nibAngle). | `src/core/engine.js:3338-3344` (group early-return drops `options`), `src/core/engine.js:2717` (`fastPreview: false`). Drag scheduler: `src/render/renderer.js:10541-10560`. Panel slider `regenDraft` (`src/ui/panels/scene3d-panel.js:830,2136`) is affected the same way. |
| B2 | **Double regen when the Object leaf is active** (the normal state after you click the object to open its Style tab). `app.regen()` calls `engine.generate(childId)`, which runs `object3d.generate` → the full standalone scene3d pipeline. The output is then discarded, because `getRenderablePaths` returns [] for `_sceneConsumed`. After that, `computeAllDisplayGeometry` recomposes the group a second time. `isConsumed()` checks `params._sceneConsumed` / `bounds._sceneConsumed`, but the engine sets the flag on the **layer** (`layer._sceneConsumed`), so the guard never fires. | Picking Fill Style = trochoidLoop through the real `select[aria-label="Fill style"]`: **2 algo calls of 6106 + 6120 ms = one 13.3 s long task** (Playwright's next action then timed out at 30 s). Type → crosshatch with ladder: 45 + 31 ms. `app.regen()` with nibAngle and the leaf active: 2151 ms instead of 1040 ms. | `src/core/algorithms/object3d.js:21-22,89`; engine flag set at `src/core/engine.js:2673-2694`; recompute at `src/core/engine.js:3654`. |
| B3 | **Redundant full regen on release.** `_endSceneObjectGizmoDrag` runs `engine.generate(layer.id)` at full quality right after the last rAF regen, which already was full quality (because of B1). The output is identical except for the 360° wrap. It then also runs `buildControls`. | Release regen ≈ step cost (for example 7.8 s for torus/contour/weaveDepth). | `src/render/renderer.js:~11560-11585` |
| B4 | Post-compose curve finish adds up to 280 ms per regen on the wave laws (gen − algo: trochoidLoop 281 ms, onePenDown 277 ms). It runs on every drag frame. | phase-1 json, `regen.runs[].gen - algo` | `_applySceneCurveFinish` `src/core/engine.js:2875` → `GeometryUtils.reduceAnchors` `geometry-utils.js:2109` |
| B5 | Fill Style is silently inert on some Types/primitives (UX/perf consistency, not a crash). On **box** + hatch, 38 of 48 laws produce byte-identical paths/points to ladder: all ribbon, bundle and pen laws. The mono/network laws do apply on box and are slow there (voronoiWeb 630 ms, mezzoRegion 629 ms). On sphere, the ribbon laws are inert under spiral, stipple and wireframe. | phase-1 / matrix2 path+point counts | — |

No exceptions, page errors or console.errors occurred in any of the 194 configs.

## Hot functions (CPU profile, CDP Profiler, 200 µs sampling, 8-step rotate + 1 regen)

Ribbon laws (nibAngle, trochoidLoop, weaveDepth; crosshatch/contour variants). Inclusive time for trochoidLoop+crosshatch is 62.0 s of 67.9 s in `ribbonize`:
- `ribbonizeCore` `src/core/scene3d/surface-fill.js:8059` → per-stretch closure `surface-fill.js:8253` → `flush` `surface-fill.js:9043/9213`
- **`erode` `surface-fill.js:8025` → `GeometryUtils.insetMultiPolygon` `src/core/geometry-utils.js:1252` → `FillBoolean.safeOp` `src/core/fill-boolean.js:75` → polygon-clipping `run` `src/vendor/polygon-clipping.umd.js:2371`**: 68–75 % of the wave/weave laws' time (46.5 of 62 s; torus/contour/weaveDepth 68.2 of 72.1 s). The self time is in the sweep line: `compare` :1199/:1347, `Tree.remove` :291, `Tree.add` :262, `splay` :139, `afterState` :1766, `getIntersection` :1575. GC is 6–8 %.
- **`PenFill.fillRegion` `src/core/pen-fill.js:1394`** (ribbon interior fill), called from `surface-fill.js:8434`: 69 % of nibAngle (6.85 of 9.9 s). Self time: **`edt` `pen-fill.js:186`** (distance transform, 32.5 % self on nibAngle, 26 % on weightModulated), `uncoveredBlobs` :1308, `componentMaxDepth` :901, `levelBuckets` :956, `labelComponents` :294, `contourLoops` :444, `buildField` :212.
- So, per stretch, every ribbon does one boolean inset (polygon-clipping) and one raster EDT fill. Cost scales with stretch count: about 60–90 µs per output point; up to 274 µs/pt on torus/contour.

Mono laws (turingStripe, mezzoRegion), 300–700 ms:
- `lawTuring` `src/core/scene3d/surface-fill-mono.js:2441` (13.5 % self), `tooClose` `surface-fill-mono.js:559` (21.6 % self on mezzoRegion; streamline spacing test, looks O(n²)), `inv`/`at` `surface-fill-mono.js:391/114` → `SurfaceFill.sampleAt` `surface-fill.js:5688` → `Geometry3D.rotatePoint` `src/core/algorithms/geometry3d.js:35` (13–15 % self).
- turingStripe also spends 0.6 s inclusive in curve finish (`reduceAnchors` `geometry-utils.js:2109`).

Default law (ladder), about 30 ms. No dominant hot spot: shadows `build` `src/core/scene3d/shadows.js:2666` (about 17 ms/regen, including polygon-clipping union for `ownSilhouette` `shadows.js:3056`). This would also be skipped in draft if B1 were fixed.

Every frame is also wrapped by `patchedGenerate` `src/ui/menus/engine-progress-tap.js:42`, but its overhead is negligible.

## What would fix "slow and choppy" (for the fix-planning lens; not implemented)
- B1: plumb `options.fastPreview` through `generate()` → `_composeSceneGroup` bounds. This immediately makes drag frames take the draft path (flat hatch, no ribbons/tone/shadow booleans, measured 6–8 ms vs 1 s). The trade-off is that the tone look disappears mid-drag; an alternative is a ribbon-only bypass (centrelines in draft).
- B2: make object3d's `isConsumed` read the layer flag (pass `_sceneConsumed` through bounds), or skip `algo.generate` for consumed children in `engine.generate`. This halves the cost of every panel edit while an object is selected.
- B3: skip the release regen when the last rAF regen already ran at full quality, or after B1 keep it as the only full regen.
- Throttle/budget: a ribbon law at 1–7 s per frame can never be interactive at full quality. Consider caching the ribbon build per stretch, a worker, or capping `RIBBON_MAX_PATHS`/stretches in preview.

## Ranked table (worst rotate step first; all 194 configs)

Columns: full regen = `app.regen()` wall (min of 3); algo = `Algorithms.scene3d.generate` alone; points = output points; rotate step = per-frame `engine.generate` during a real gizmo drag (p50, max); FPS = rAF frames per second during the drag; release = regen on mouse-up.

| # | Primitive / Type / Fill Style | Full regen (app.regen) ms | scene3d algo ms | paths | points | µs/point | Rotate step p50 ms (max) | Drag FPS | Longest task ms | Release regen ms |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | torus / contour / weaveDepth | 7433 | 7394 | 535 | 26991 | 273.9 | 7320 (8516) | 0.4 | 8524 | 7847 |
| 2 | sphere / crosshatch / trochoidLoop | 7050 | 6497 | 1012 | 74205 | 87.5 | 7101 (7959) | 0.4 | 7993 | 7090 |
| 3 | sphere / crosshatch / weaveDepth | 5751 | 5413 | 494 | 67725 | 79.9 | 5731 (6024) | 0.5 | 6037 | 5198 |
| 4 | sphere / hatch / trochoidLoop (sfs serpentine) | 4411 | 3924 | 651 | 50560 | 77.6 | 4485 (5253) | 0.6 | 5271 | 4427 |
| 5 | sphere / contour / weaveDepth | 4048 | 3908 | 429 | 42387 | 92.2 | 4326 (4544) | 0.7 | 4555 | 4336 |
| 6 | sphere / contour / trochoidLoop | 3849 | 3545 | 719 | 43632 | 81.2 | 3765 (5578) | 0.8 | 5594 | 4434 |
| 7 | torus / contour / trochoidLoop | 3872 | 3838 | 440 | 17914 | 214.3 | 3735 (3879) | 0.8 | 3885 | 3637 |
| 8 | sphere / hatch / trochoidLoop (sfs contourParallel) | 3325 | 3257 | 984 | 34916 | 93.3 | 3339 (3626) | 0.9 | 3639 | 3212 |
| 9 | sphere / hatch / trochoidLoop | 3355 | 3065 | 647 | 39210 | 78.2 | 3331 (3653) | 0.9 | 3666 | 3271 |
| 10 | sphere / hatch / trochoidLoop (sfs spiral) | 3242 | 2955 | 647 | 39210 | 75.4 | 3317 (3683) | 0.9 | 3695 | 3342 |
| 11 | sphere / hatch / trochoidLoop (sfs concentric) | 3178 | 3097 | 1113 | 36978 | 83.8 | 3204 (3511) | 0.9 | 3530 | 3180 |
| 12 | sphere / hatch / weaveDepth | 3489 | 3285 | 339 | 38155 | 86.1 | 3137 (3228) | 1 | 3236 | 2959 |
| 13 | sphere / hatch / ampSpacing | 2746 | 2528 | 467 | 35825 | 70.6 | 2788 (2923) | 1.1 | 2932 | 2788 |
| 14 | sphere / hatch / onePenDown | 2400 | 2120 | 262 | 30638 | 69.2 | 2317 (2421) | 1.2 | 2427 | 2349 |
| 15 | sphere / hatch / interlockWeave | 2120 | 1874 | 316 | 30317 | 61.8 | 2150 (2216) | 1.4 | 2223 | 2034 |
| 16 | sphere / crosshatch / nibAngle | 2009 | 1972 | 428 | 30069 | 65.6 | 1934 (2039) | 1.6 | 2045 | 1748 |
| 17 | torus / crosshatch / trochoidLoop | 2018 | 1951 | 550 | 22683 | 86.0 | 1785 (2026) | 1.8 | 2034 | 1870 |
| 18 | torus / crosshatch / weaveDepth | 1616 | 1558 | 635 | 21155 | 73.6 | 1542 (1592) | 2 | 1599 | 1195 |
| 19 | sphere / hatch / nibAngle (sfs serpentine) | 1257 | 1232 | 295 | 16820 | 73.2 | 1202 (1302) | 2.5 | 1307 | 1171 |
| 20 | sphere / hatch / whiteBand | 1222 | 1200 | 294 | 16952 | 70.8 | 1125 (1221) | 2.6 | 1226 | 1132 |
| 21 | sphere / hatch / taperedEnds | 1193 | 1169 | 301 | 16741 | 69.8 | 1068 (1123) | 2.7 | 1128 | 1075 |
| 22 | sphere / hatch / nibAngle | 1083 | 1062 | 294 | 15349 | 69.2 | 1053 (1129) | 2.8 | 1134 | 1039 |
| 23 | sphere / hatch / nibAngle (sfs concentric) | 1009 | 989 | 418 | 14966 | 66.1 | 975 (1030) | 3.1 | 1035 | 974 |
| 24 | sphere / hatch / isophoteWidth | 1067 | 1046 | 286 | 14677 | 71.3 | 964 (1009) | 3 | 1013 | 961 |
| 25 | sphere / hatch / nibAngle (sfs contourParallel) | 989 | 976 | 387 | 9028 | 108.1 | 948 (1001) | 3.2 | 1005 | 939 |
| 26 | torus / hatch / trochoidLoop | 996 | 962 | 408 | 11609 | 82.9 | 918 (1071) | 3.3 | 1076 | 1008 |
| 27 | sphere / hatch / nibAngle (sfs spiral) | 959 | 940 | 294 | 15349 | 61.2 | 914 (973) | 3.2 | 978 | 928 |
| 28 | torus / hatch / weaveDepth | 798 | 771 | 432 | 10682 | 72.1 | 800 (905) | 3.6 | 910 | 619 |
| 29 | sphere / contour / nibAngle | 747 | 721 | 348 | 21192 | 34.0 | 711 (731) | 4.2 | 736 | 703 |
| 30 | sphere / crosshatch / turingStripe | 687 | 554 | 627 | 37000 | 15.0 | 704 (849) | 3.9 | 887 | 867 |
| 31 | box / hatch / voronoiWeb | 632 | 630 | 1621 | 10871 | 58.0 | 625 (668) | 4.8 | 673 | 639 |
| 32 | torus / contour / nibAngle | 578 | 563 | 419 | 8513 | 66.2 | 572 (594) | 5.1 | 599 | 585 |
| 33 | box / hatch / mezzoRegion | 632 | 629 | 857 | 26865 | 23.4 | 550 (629) | 5.2 | 637 | 625 |
| 34 | sphere / crosshatch / etfKang | 456 | 428 | 571 | 26982 | 15.9 | 544 (610) | 5.6 | 615 | 555 |
| 35 | torus / crosshatch / nibAngle | 542 | 527 | 360 | 11297 | 46.6 | 505 (544) | 5.8 | 548 | 438 |
| 36 | box / hatch / turingStripe | 500 | 498 | 446 | 26480 | 18.8 | 489 (558) | 6.2 | 565 | 504 |
| 37 | box / hatch / etfKang | 426 | 424 | 318 | 16730 | 25.4 | 430 (440) | 6.6 | 445 | 423 |
| 38 | box / hatch / defectSplit | 415 | 414 | 484 | 17347 | 23.9 | 403 (426) | 7.1 | 430 | 417 |
| 39 | sphere / contour / turingStripe | 378 | 314 | 412 | 18871 | 16.6 | 402 (481) | 7 | 514 | 501 |
| 40 | sphere / hatch / turingStripe | 399 | 332 | 412 | 18871 | 17.6 | 382 (464) | 7.3 | 473 | 461 |
| 41 | sphere / hatch / weightModulated | 415 | 406 | 222 | 5682 | 71.5 | 382 (433) | 7.5 | 437 | 269 |
| 42 | sphere / crosshatch / weightModulated | 462 | 453 | 246 | 7758 | 58.4 | 379 (421) | 7.6 | 426 | 282 |
| 43 | sphere / hatch / weightSmoothstep | 465 | 455 | 221 | 5729 | 79.4 | 324 (404) | 8.2 | 408 | 259 |
| 44 | sphere / hatch / mezzoRegion | 316 | 299 | 666 | 18357 | 16.3 | 316 (420) | 8.3 | 425 | 404 |
| 45 | sphere / hatch / voronoiWeb | 301 | 291 | 1483 | 9197 | 31.7 | 314 (343) | 8.8 | 371 | 361 |
| 46 | torus / crosshatch / turingStripe | 291 | 277 | 488 | 11432 | 24.2 | 303 (362) | 9.1 | 378 | 368 |
| 47 | sphere / contour / etfKang | 256 | 241 | 384 | 13862 | 17.4 | 295 (341) | 9.2 | 345 | 316 |
| 48 | sphere / hatch / etfKang | 255 | 241 | 384 | 13862 | 17.4 | 289 (345) | 9.4 | 349 | 321 |
| 49 | torus / hatch / nibAngle | 264 | 255 | 302 | 5798 | 44.0 | 275 (302) | 10.2 | 306 | 241 |
| 50 | sphere / hatch / defectSplit | 256 | 244 | 355 | 13106 | 18.6 | 268 (332) | 10.2 | 348 | 338 |
| 51 | box / hatch / originSpiral | 258 | 257 | 402 | 11054 | 23.2 | 265 (291) | 10.8 | 295 | 265 |
| 52 | box / hatch / dutyConst | 248 | 247 | 1022 | 11166 | 22.1 | 245 (253) | 11.5 | 260 | 250 |
| 53 | torus / crosshatch / etfKang | 211 | 193 | 654 | 10834 | 17.8 | 225 (273) | 11.7 | 300 | 291 |
| 54 | box / hatch / endShorten | 226 | 225 | 296 | 8150 | 27.6 | 223 (226) | 12.2 | 236 | 226 |
| 55 | box / hatch / mazeFill | 208 | 205 | 5300 | 14910 | 13.7 | 206 (216) | 12.7 | 223 | 210 |
| 56 | torus / hatch / turingStripe | 182 | 175 | 366 | 5960 | 29.3 | 188 (235) | 13.5 | 242 | 232 |
| 57 | torus / contour / turingStripe | 181 | 174 | 366 | 5960 | 29.1 | 188 (245) | 13.4 | 249 | 235 |
| 58 | sphere / contour / weightModulated | 156 | 151 | 232 | 4570 | 33.1 | 164 (226) | 15.6 | 230 | 220 |
| 59 | torus / hatch / etfKang | 145 | 135 | 449 | 5661 | 23.8 | 153 (184) | 16.1 | 207 | 197 |
| 60 | torus / contour / etfKang | 145 | 135 | 449 | 5661 | 23.8 | 152 (195) | 15.9 | 199 | 184 |
| 61 | sphere / hatch / dutyConst | 145 | 135 | 752 | 10159 | 13.3 | 150 (198) | 16.1 | 205 | 196 |
| 62 | sphere / hatch / originSpiral | 143 | 135 | 478 | 8597 | 15.7 | 146 (197) | 17.5 | 200 | 188 |
| 63 | torus / contour / weightModulated | 138 | 134 | 290 | 2167 | 62.0 | 139 (155) | 18.2 | 168 | 159 |
| 64 | sphere / hatch / endShorten | 121 | 118 | 263 | 6398 | 18.4 | 127 (169) | 19.3 | 174 | 165 |
| 65 | sphere / hatch / mazeFill | 114 | 107 | 3429 | 10881 | 9.8 | 117 (155) | 19.4 | 160 | 151 |
| 66 | torus / crosshatch / weightModulated | 51 | 50 | 252 | 904 | 55.4 | 103 (191) | 23 | 194 | 77 |
| 67 | torus / hatch / weightModulated | 48 | 47 | 248 | 696 | 67.7 | 85 (105) | 27.2 | 107 | 62 |
| 68 | sphere / hatch / mkTick | 63 | 58 | 891 | 9683 | 5.9 | 63 (85) | 32.7 | 90 | 71 |
| 69 | sphere / hatch / amplitudeOnly | 60 | 54 | 270 | 4002 | 13.4 | 58 (187) | 32.7 | 191 | 63 |
| 70 | torus / wireframe / ladder | 49 | 44 | 1903 | 3806 | 11.6 | 49 (71) | 35.7 | 76 | 49 |
| 71 | torus / wireframe / weaveDepth | 49 | 45 | 1903 | 3806 | 11.7 | 49 (65) | 35.7 | 70 | 48 |
| 72 | torus / wireframe / turingStripe | 50 | 45 | 1903 | 3806 | 11.7 | 48 (69) | 35.7 | 74 | 49 |
| 73 | torus / wireframe / trochoidLoop | 49 | 44 | 1903 | 3806 | 11.6 | 48 (71) | 35.7 | 76 | 48 |
| 74 | torus / wireframe / etfKang | 49 | 44 | 1903 | 3806 | 11.6 | 48 (64) | 35.7 | 69 | 48 |
| 75 | torus / wireframe / nibAngle | 49 | 44 | 1903 | 3806 | 11.7 | 48 (64) | 35.7 | 70 | 47 |
| 76 | torus / wireframe / weightModulated | 49 | 44 | 1903 | 3806 | 11.5 | 48 (70) | 35.8 | 75 | 48 |
| 77 | torus / contourSlice / ladder | 48 | 44 | 294 | 4429 | 10.0 | 47 (64) | 38.9 | 67 | 49 |
| 78 | torus / spiral / ladder | 47 | 45 | 300 | 1808 | 24.7 | 47 (60) | 41.3 | 63 | 49 |
| 79 | sphere / wireframe / weaveDepth | 47 | 39 | 2449 | 5246 | 7.5 | 46 (48) | 37.2 | 55 | 45 |
| 80 | sphere / hatch / contFieldTouch | 46 | 41 | 355 | 5955 | 7.0 | 45 (61) | 41 | 65 | 51 |
| 81 | sphere / hatch / bundleSubNib | 45 | 40 | 353 | 4208 | 9.6 | 45 (67) | 42.8 | 72 | 50 |
| 82 | torus / contour / ladder | 46 | 43 | 294 | 2405 | 18.0 | 45 (64) | 42.8 | 67 | 48 |
| 83 | sphere / hatch / mkDotScreen | 45 | 35 | 325 | 8846 | 4.0 | 43 (70) | 43.5 | 74 | 48 |
| 84 | sphere / wireframe / trochoidLoop | 46 | 38 | 2449 | 5246 | 7.2 | 43 (50) | 42 | 57 | 44 |
| 85 | sphere / wireframe / turingStripe | 43 | 36 | 2449 | 5246 | 6.8 | 41 (49) | 43 | 55 | 41 |
| 86 | sphere / wireframe / nibAngle | 43 | 36 | 2449 | 5246 | 6.8 | 41 (43) | 44.4 | 53 | 44 |
| 87 | sphere / wireframe / weightModulated | 42 | 35 | 2449 | 5246 | 6.6 | 41 (46) | 44.7 | 52 | 41 |
| 88 | sphere / wireframe / ladder | 42 | 35 | 2449 | 5246 | 6.6 | 40 (47) | 44.4 | 55 | 45 |
| 89 | sphere / wireframe / etfKang | 41 | 34 | 2449 | 5246 | 6.5 | 40 (48) | 44.6 | 54 | 39 |
| 90 | torus / crosshatch / ladder | 41 | 40 | 256 | 925 | 43.5 | 40 (50) | 44 | 53 | 40 |
| 91 | sphere / hatch / contFieldSurface | 39 | 36 | 304 | 3814 | 9.3 | 39 (45) | 45.3 | 52 | 44 |
| 92 | torus / spiral / weaveDepth | 39 | 38 | 270 | 1089 | 34.6 | 39 (41) | 44.8 | 0 | 38 |
| 93 | torus / hatch / ladder | 38 | 37 | 250 | 709 | 52.8 | 38 (54) | 44.5 | 57 | 38 |
| 94 | torus / stipple / ladder | 40 | 39 | 306 | 921 | 42.6 | 38 (52) | 44.5 | 55 | 37 |
| 95 | torus / stipple / weaveDepth | 39 | 38 | 340 | 1159 | 32.4 | 38 (40) | 44.9 | 0 | 38 |
| 96 | torus / spiral / turingStripe | 39 | 37 | 263 | 855 | 43.5 | 38 (58) | 44.6 | 61 | 41 |
| 97 | torus / spiral / trochoidLoop | 39 | 38 | 260 | 753 | 50.2 | 38 (49) | 44.4 | 51 | 39 |
| 98 | torus / spiral / nibAngle | 38 | 37 | 265 | 873 | 42.0 | 38 (60) | 44.6 | 63 | 39 |
| 99 | torus / spiral / etfKang | 38 | 37 | 263 | 855 | 43.0 | 37 (40) | 44.8 | 0 | 38 |
| 100 | sphere / hatch / bundleCount | 38 | 35 | 292 | 2918 | 11.9 | 37 (54) | 44.4 | 57 | 42 |
| 101 | sphere / hatch / bundleDither | 37 | 34 | 292 | 2926 | 11.5 | 37 (54) | 44.2 | 58 | 47 |
| 102 | torus / spiral / weightModulated | 38 | 37 | 259 | 746 | 49.5 | 37 (60) | 44.8 | 62 | 42 |
| 103 | sphere / hatch / contFieldFore | 36 | 33 | 280 | 3288 | 10.1 | 37 (56) | 44.4 | 59 | 43 |
| 104 | torus / stipple / trochoidLoop | 37 | 36 | 287 | 789 | 45.1 | 37 (39) | 44.8 | 0 | 36 |
| 105 | torus / stipple / etfKang | 37 | 36 | 299 | 873 | 41.1 | 37 (39) | 44.9 | 0 | 37 |
| 106 | sphere / hatch / bundleEased | 37 | 34 | 281 | 2739 | 12.3 | 37 (51) | 44.7 | 55 | 37 |
| 107 | torus / stipple / turingStripe | 39 | 38 | 299 | 873 | 43.5 | 37 (38) | 44.8 | 0 | 37 |
| 108 | torus / stipple / nibAngle | 37 | 36 | 305 | 914 | 38.8 | 36 (39) | 44.9 | 0 | 37 |
| 109 | sphere / hatch / bundleLozenge | 36 | 33 | 289 | 2746 | 11.9 | 36 (39) | 44.8 | 0 | 37 |
| 110 | torus / stipple / weightModulated | 37 | 36 | 284 | 767 | 46.7 | 36 (37) | 44.9 | 0 | 36 |
| 111 | sphere / hatch / contFieldQuant | 37 | 33 | 273 | 3201 | 10.4 | 36 (45) | 45 | 0 | 39 |
| 112 | torus / none / ladder | 38 | 37 | 244 | 488 | 75.0 | 36 (51) | 44.6 | 53 | 35 |
| 113 | sphere / spiral / weaveDepth | 38 | 34 | 270 | 3312 | 10.2 | 35 (38) | 44.9 | 0 | 37 |
| 114 | sphere / hatch / bundleHandoff | 35 | 33 | 280 | 2677 | 12.1 | 35 (54) | 44.5 | 57 | 39 |
| 115 | sphere / stipple / weaveDepth | 37 | 31 | 1376 | 8995 | 3.5 | 35 (37) | 44.9 | 55 | 42 |
| 116 | sphere / hatch / contFieldSigmoid | 33 | 30 | 262 | 2833 | 10.7 | 34 (37) | 44.9 | 0 | 37 |
| 117 | sphere / hatch / mkDashRamp | 36 | 33 | 413 | 4027 | 8.1 | 33 (40) | 44.9 | 0 | 35 |
| 118 | sphere / hatch / deepFillTSP | 35 | 32 | 227 | 2258 | 14.0 | 33 (57) | 44.5 | 60 | 37 |
| 119 | sphere / contourSlice / ladder | 34 | 31 | 224 | 3675 | 8.3 | 33 (35) | 45 | 0 | 33 |
| 120 | sphere / crosshatch / ladder | 33 | 30 | 262 | 2861 | 10.6 | 32 (37) | 44.9 | 55 | 46 |
| 121 | sphere / hatch / penReserve | 35 | 32 | 363 | 2238 | 14.2 | 32 (35) | 46 | 0 | 36 |
| 122 | sphere / hatch / phaseFineLadder | 31 | 29 | 229 | 1744 | 16.7 | 32 (44) | 45.7 | 0 | 32 |
| 123 | sphere / hatch / fineLadder | 32 | 30 | 228 | 1710 | 17.7 | 31 (51) | 45.2 | 54 | 32 |
| 124 | sphere / spiral / ladder | 32 | 29 | 221 | 1497 | 19.5 | 31 (41) | 46.8 | 0 | 38 |
| 125 | sphere / hatch / penCross | 30 | 28 | 251 | 1902 | 14.7 | 30 (33) | 48.6 | 0 | 32 |
| 126 | sphere / hatch / mkScribble | 30 | 28 | 221 | 1527 | 18.0 | 30 (33) | 50.2 | 0 | 29 |
| 127 | sphere / hatch / perceptualRamp | 31 | 29 | 220 | 1458 | 19.8 | 30 (41) | 50.3 | 0 | 29 |
| 128 | sphere / stipple / trochoidLoop | 34 | 30 | 735 | 4508 | 6.7 | 30 (39) | 46.8 | 0 | 34 |
| 129 | sphere / spiral / nibAngle | 30 | 27 | 251 | 2449 | 11.2 | 30 (32) | 49.5 | 0 | 33 |
| 130 | sphere / hatch / penPitchMatch | 32 | 30 | 271 | 1686 | 17.9 | 29 (32) | 50 | 0 | 29 |
| 131 | sphere / spiral / turingStripe | 31 | 28 | 262 | 2270 | 12.5 | 29 (31) | 52.4 | 0 | 34 |
| 132 | sphere / hatch / penInterleave | 31 | 29 | 325 | 1739 | 16.4 | 29 (34) | 51.7 | 0 | 33 |
| 133 | sphere / stipple / ladder | 32 | 29 | 987 | 6272 | 4.5 | 29 (47) | 49.9 | 51 | 32 |
| 134 | sphere / spiral / trochoidLoop | 33 | 31 | 241 | 1927 | 15.9 | 29 (32) | 50.4 | 0 | 32 |
| 135 | sphere / hatch / penStipple | 31 | 29 | 279 | 1679 | 17.5 | 29 (46) | 50.8 | 50 | 33 |
| 136 | sphere / stipple / turingStripe | 31 | 27 | 906 | 5705 | 4.8 | 29 (31) | 52.9 | 0 | 29 |
| 137 | sphere / spiral / etfKang | 30 | 27 | 262 | 2270 | 11.9 | 29 (36) | 50.2 | 0 | 31 |
| 138 | sphere / hatch / penFacing | 31 | 29 | 404 | 1787 | 16.3 | 29 (32) | 53.4 | 0 | 30 |
| 139 | sphere / stipple / nibAngle | 32 | 28 | 958 | 6069 | 4.7 | 29 (32) | 50.3 | 0 | 30 |
| 140 | sphere / spiral / weightModulated | 31 | 29 | 255 | 1810 | 15.7 | 29 (31) | 51.3 | 0 | 38 |
| 141 | sphere / hatch / lozengeStipple | 29 | 27 | 262 | 1558 | 17.3 | 29 (45) | 54.4 | 0 | 33 |
| 142 | sphere / hatch / ladder | 31 | 29 | 227 | 1713 | 16.8 | 28 (34) | 53.2 | 73 | 28 |
| 143 | sphere / contour / ladder | 30 | 28 | 219 | 1828 | 15.1 | 28 (32) | 54.7 | 0 | 29 |
| 144 | sphere / stipple / etfKang | 29 | 26 | 906 | 5705 | 4.6 | 28 (35) | 53.3 | 0 | 29 |
| 145 | sphere / stipple / weightModulated | 29 | 27 | 698 | 4249 | 6.3 | 28 (29) | 54.9 | 0 | 35 |
| 146 | sphere / hatch / none | 27 | 25 | 220 | 1411 | 17.9 | 26 (40) | 57.1 | 0 | 27 |
| 147 | sphere / none / ladder | 23 | 22 | 197 | 742 | 29.5 | 23 (32) | 59.1 | 0 | 23 |
| 148 | box / contour / ladder | 3 | 3 | 138 | 303 | 9.2 | 3 (4) | 59.6 | 0 | 3 |
| 149 | box / spiral / ladder | 2 | 1 | 143 | 882 | 1.4 | 1 (2) | 59.9 | 0 | 1 |
| 150 | box / stipple / ladder | 2 | 1 | 204 | 1083 | 1.3 | 1 (2) | 59.8 | 0 | 1 |
| 151 | box / hatch / perceptualRamp | 1 | 1 | 146 | 292 | 3.1 | 1 (1) | 59.7 | 0 | 1 |
| 152 | box / hatch / contFieldTouch | 1 | 1 | 146 | 292 | 3.4 | 1 (1) | 59.8 | 0 | 1 |
| 153 | box / hatch / ladder | 1 | 1 | 146 | 292 | 3.4 | 1 (1) | 59.8 | 0 | 1 |
| 154 | box / hatch / nibAngle | 1 | 1 | 146 | 292 | 3.4 | 1 (1) | 59.8 | 0 | 1 |
| 155 | box / hatch / weightModulated | 1 | 1 | 146 | 292 | 3.4 | 1 (1) | 59.8 | 0 | 1 |
| 156 | box / hatch / weightSmoothstep | 1 | 1 | 146 | 292 | 3.4 | 1 (1) | 59.8 | 0 | 1 |
| 157 | box / hatch / fineLadder | 1 | 1 | 146 | 292 | 3.4 | 1 (1) | 59.9 | 0 | 1 |
| 158 | box / hatch / phaseFineLadder | 1 | 1 | 146 | 292 | 3.4 | 1 (1) | 59.7 | 0 | 1 |
| 159 | box / hatch / lozengeStipple | 1 | 1 | 146 | 292 | 3.1 | 1 (1) | 59.7 | 0 | 1 |
| 160 | box / hatch / deepFillTSP | 1 | 1 | 146 | 292 | 3.4 | 1 (1) | 59.7 | 0 | 1 |
| 161 | box / hatch / bundleCount | 1 | 1 | 146 | 292 | 3.4 | 1 (1) | 59.7 | 0 | 1 |
| 162 | box / hatch / bundleSubNib | 1 | 1 | 146 | 292 | 3.4 | 1 (1) | 59.7 | 0 | 1 |
| 163 | box / hatch / bundleEased | 1 | 1 | 146 | 292 | 3.4 | 1 (1) | 59.7 | 0 | 1 |
| 164 | box / hatch / bundleDither | 1 | 1 | 146 | 292 | 3.4 | 1 (1) | 59.7 | 0 | 1 |
| 165 | box / hatch / bundleLozenge | 1 | 1 | 146 | 292 | 3.1 | 1 (1) | 59.7 | 0 | 1 |
| 166 | box / hatch / bundleHandoff | 1 | 1 | 146 | 292 | 3.4 | 1 (1) | 59.7 | 0 | 1 |
| 167 | box / hatch / contFieldSigmoid | 1 | 1 | 146 | 292 | 3.4 | 1 (1) | 59.7 | 0 | 1 |
| 168 | box / hatch / contFieldSurface | 1 | 1 | 146 | 292 | 3.1 | 1 (1) | 59.8 | 0 | 1 |
| 169 | box / hatch / penInterleave | 1 | 1 | 146 | 292 | 3.4 | 1 (1) | 59.9 | 0 | 1 |
| 170 | box / hatch / penStipple | 1 | 1 | 146 | 292 | 3.1 | 1 (1) | 59.7 | 0 | 1 |
| 171 | box / hatch / penReserve | 1 | 1 | 146 | 292 | 3.4 | 1 (1) | 59.8 | 0 | 1 |
| 172 | box / hatch / penCross | 1 | 1 | 146 | 292 | 3.4 | 1 (1) | 59.7 | 0 | 1 |
| 173 | box / hatch / penPitchMatch | 1 | 1 | 146 | 292 | 3.4 | 1 (1) | 59.8 | 0 | 1 |
| 174 | box / hatch / penFacing | 1 | 1 | 146 | 292 | 3.8 | 1 (1) | 59.7 | 0 | 1 |
| 175 | box / hatch / mkScribble | 1 | 1 | 146 | 292 | 3.1 | 1 (1) | 59.7 | 0 | 1 |
| 176 | box / hatch / mkTick | 1 | 1 | 146 | 292 | 2.7 | 1 (1) | 59.6 | 0 | 1 |
| 177 | box / hatch / mkDashRamp | 1 | 1 | 146 | 292 | 3.1 | 1 (1) | 59.9 | 0 | 1 |
| 178 | box / hatch / ampSpacing | 1 | 1 | 146 | 292 | 3.1 | 1 (1) | 59.7 | 0 | 1 |
| 179 | box / hatch / interlockWeave | 1 | 1 | 146 | 292 | 3.1 | 1 (2) | 59.7 | 0 | 1 |
| 180 | box / hatch / trochoidLoop | 1 | 1 | 146 | 292 | 3.4 | 1 (1) | 59.8 | 0 | 1 |
| 181 | box / hatch / amplitudeOnly | 1 | 1 | 146 | 292 | 3.1 | 1 (1) | 59.8 | 0 | 1 |
| 182 | box / crosshatch / ladder | 1 | 1 | 155 | 310 | 2.9 | 1 (1) | 59.7 | 0 | 1 |
| 183 | box / contourSlice / ladder | 1 | 1 | 155 | 336 | 3.0 | 1 (1) | 59.8 | 0 | 1 |
| 184 | box / hatch / none | 1 | 1 | 145 | 290 | 2.8 | 1 (1) | 59.8 | 0 | 1 |
| 185 | box / hatch / taperedEnds | 1 | 1 | 146 | 292 | 3.1 | 1 (1) | 59.7 | 0 | 1 |
| 186 | box / hatch / isophoteWidth | 1 | 1 | 146 | 292 | 3.4 | 1 (1) | 59.8 | 0 | 1 |
| 187 | box / hatch / whiteBand | 1 | 1 | 146 | 292 | 3.1 | 1 (1) | 59.9 | 0 | 1 |
| 188 | box / hatch / contFieldFore | 1 | 1 | 146 | 292 | 3.4 | 1 (1) | 59.7 | 0 | 1 |
| 189 | box / hatch / contFieldQuant | 1 | 1 | 146 | 292 | 3.1 | 1 (1) | 59.7 | 0 | 1 |
| 190 | box / hatch / mkDotScreen | 1 | 1 | 146 | 292 | 3.1 | 1 (1) | 59.8 | 0 | 1 |
| 191 | box / hatch / weaveDepth | 1 | 1 | 146 | 292 | 3.1 | 1 (1) | 59.8 | 0 | 1 |
| 192 | box / hatch / onePenDown | 1 | 1 | 146 | 292 | 3.1 | 1 (1) | 59.9 | 0 | 1 |
| 193 | box / none / ladder | 1 | 1 | 129 | 258 | 3.5 | 1 (1) | 59.9 | 0 | 1 |
| 194 | box / wireframe / ladder | 1 | 1 | 132 | 264 | 3.4 | 1 (1) | 59.8 | 0 | 1 |
