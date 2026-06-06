# Plans

This file is the active repository punchlist. Update it whenever meaningful work starts, changes scope, or completes.

## Operating Rules
- Keep `Inbox`, `In Progress`, `Done`, and `Decisions` current in the same PR as the implementation.
- Move items instead of duplicating them when status changes.
- Record architecture-level decisions in `Decisions` so future work has a stable reference.

## In Progress
- Continue extracting shared Noise Rack runtime primitives; stack blend-combination logic is now centralized, with deeper sampler extraction still pending.
- Extend Noise Rack to the remaining direct consumers, now mainly any leftover bespoke samplers after Petalis per-modifier stack UI parity.
- Extend Layer Modifiers beyond the initial `Mirror` implementation once the group-like modifier container model has proven out in export, masking, and nested layer workflows.
- Fix the remaining strict Playwright Pattern fidelity regressions as product bugs, with `Autumn` horizontal-seam mismatch and representative `Bamboo` / `Bathroom Floor` / `Dominos` silhouette drift still failing source-faithful smoke coverage.

## Inbox
- **Morph Modifier Group** — generates interpolated transition paths between 2+ child layers' shapes, producing N graduated in-between rings that morph one shape into another — plotter-native shape blending integrated into the modifier container system. Implementation plan:

  ### Overview & User Mental Model

  The Morph Modifier Group follows the established modifier container contract: drop layers inside it, and it processes them. Where Mirror copies geometry across axes, Morph fills the space between child shapes with graduated intermediate paths. The user drops a circle layer and a wavetable layer into the group; the modifier generates N rings that begin as the circle and progressively become the wavetable. The originals remain visible. The output is plotter-ready — all emitted paths are polylines.

  The mental model is the Illustrator/Inkscape Blend tool, but pipeline-integrated. "Steps" is the number of intermediate states, not counting the originals: 6 steps between A and B produces 8 total path sets (A + 6 blends + B). With 3+ children the modifier chains sequentially — A→B→C — each consecutive pair gets its own morph segment. Child layer order in the layer tree determines morph direction; reordering children reverses or resequences the chain.

  Key use cases: concentric morphing geometric primitives (Rings → Lissajous blooming outward); shape-transition strips for plotter paper (Harmonograph → Wavetable → Spiral in sequence); topographic density fields (Topo at two frequency settings blended with 20 eased steps simulating terrain gradient).

  ### Modifier State Shape

  ```js
  // layer.modifier for type === 'morph'
  {
    type: 'morph',
    enabled: true,

    // Transition
    steps: 6,                        // int [1..64] — intermediate rings per child pair
    easing: 'linear',                // 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'cubic-in' | 'cubic-out'
    sequenceMode: 'sequential',      // 'sequential' (A→B→C open chain) | 'cyclic' (A→B→C→A loop)

    // Geometry normalization
    resampleCount: 128,              // int [8..512] — common vertex count after arc-length resampling
    resampleMode: 'arc-length',      // 'arc-length' (perceptually even) | 'uniform-index' (faster/coarser)
    correspondenceMode: 'centroid-angle', // 'centroid-angle' | 'nearest' (O(N²)) | 'arc-length'
    windingCheck: true,              // auto-reverse path B if reverse produces lower correspondence cost

    // Multi-path handling
    multiPathStrategy: 'merge-centroid', // 'index-match' | 'merge-centroid' | 'merge-longest'
    // merge-centroid is default when |pathCountA - pathCountB| > 3, else index-match

    // Output control
    emitSources: true,               // include original child paths in output alongside blends
    closureMode: 'auto',             // 'auto' | 'force-open' | 'force-closed'
    smoothing: 0.0,                  // 0=off, 1=full Catmull-Rom smoothing pass on output rings
  }
  ```

  All fields are primitives — fully JSON-serializable, roundtrips through the existing `JSON.parse(JSON.stringify(layer.modifier))` clone path in `engine.js` with no special handling. `morphedPaths` is a transient computed property on the group layer — never serialized, always re-derived by `computeAllDisplayGeometry()`.

  ### Controls (Panel Spec)

  | # | Control | Type | Default | Range / Options | Description |
  |---|---|---|---|---|---|
  | 1 | Steps | Integer slider | 6 | 1–64 | Intermediate rings generated between each consecutive child pair. |
  | 2 | Easing | Chip row | Linear | Linear / Ease In / Ease Out / Ease In-Out / Cubic In / Cubic Out | Distribution of interpolation weight. Ease In-Out clusters rings near both endpoints. |
  | 3 | Sequence Mode | Chip row | Sequential | Sequential / Cyclic | Sequential: A→B→C open chain. Cyclic: A→B→C→A closed loop. |
  | 4 | Resample Count | Integer slider | 128 | 8–512 | Vertices per path after normalization. Higher = smoother morphs; lower = faster compute. |
  | 5 | Correspondence | Chip row | Centroid + Angle | Centroid + Angle / Nearest / Arc Length | How source and target start-vertices are aligned before interpolation. |
  | 6 | Multi-Path | Chip row | Auto | Auto / Index Match / Merge Centroid / Merge Longest | When children have different path counts: Auto picks index-match for similar counts, merge-centroid for large mismatches. |
  | 7 | Emit Sources | Toggle | On | On / Off | Whether original child paths are included in output alongside blended rings. |
  | 8 | Closure | Select | Auto | Auto / Force Open / Force Closed | Resolves open-vs-closed ambiguity when children differ. Auto treats both as open. |
  | 9 | Smoothing | Slider | 0 | 0–1 | Selective Catmull-Rom pass on output rings. 0 = off; 1 = all corners; 0.3 touches corners >45°. |

  Panel header shows a live count: "2 children — morphing A→B" or "3 children: A→B→C (2 segments, 12 total steps)". With 0 or 1 visible children, shows a callout: "Add 2 or more child layers to begin morphing." Performance warning badge when total point budget (steps × resampleCount × childPairs) exceeds 200,000 points.

  ### Core Algorithm

  `applyMorphModifierToPaths(pathsPerChild, modifier, bounds)`:

  **Input:** `pathsPerChild: paths[][]` — index `i` is the array of paths for child layer `i`. Each path is `{x,y}[]`.

  1. **Guard.** If `pathsPerChild.length < 2` or `modifier.enabled === false`, return all paths concatenated (passthrough).
  2. **Representative path selection** using `multiPathStrategy`: `merge-centroid` averages all paths (resampled); `merge-longest` uses the path with most points; `index-match` morphs corresponding index-i paths in parallel, padding the shorter child's last path. Auto-select: if `|P-Q| > 3`, use `merge-centroid`; else `index-match`. Non-representative paths go into a `supplemental[]` list for raw emission.
  3. **Flatten curves.** If any representative path has `.in`/`.out` bezier anchors, call `GeometryUtils.flattenSmoothedPath`. Paths with `.meta.kind === 'circle'` flatten to `resampleCount` points around the circumference.
  4. **Resample** each representative path to exactly `resampleCount` vertices via arc-length parameterization.
  5. **Build morph pairs** from `sequenceMode`: `'sequential'` → `[(0,1),(1,2),...,(n-2,n-1)]`; `'cyclic'` appends `(n-1,0)`.
  6. **For each pair (A, B)**, align correspondence using `correspondenceMode` to find start-vertex rotation offset `r`. If `windingCheck` and `cost(reverse(B_rotated)) < cost(B_rotated)`, reverse B. Open paths skip rotation alignment and use endpoint distance heuristic instead. Mixed open/closed respects `closureMode`.
  7. **Generate `steps` interpolated rings per pair:**
     ```
     for i in 1..steps:
       t_raw = i / (steps + 1)   // excludes endpoints
       t = applyEasing(modifier.easing, t_raw)
       ring = A.map((a, v) => ({ x: a.x + (B[v].x - a.x) * t, y: a.y + (B[v].y - a.y) * t }))
       if modifier.smoothing > 0: apply selective Catmull-Rom pass
       emit ring
     ```
  8. **Assemble output:** if `emitSources`, emit original paths from each child (non-resampled); emit supplemental paths; emit all interpolated rings in pair order.
  9. **Degenerate cases:** child emits 0 paths → skip. `steps=0` → emit only child paths. `steps=0` + `emitSources=false` → empty output. All-coincident-points path → `resampleCount` copies of that point.

  **Caching:** `modGroup._morphCache = { signature, morphedPaths }` where `signature = JSON.stringify({ modifier, childStats })`. Reuse when signature matches. Invalidate on child regen or modifier param change.

  ### Path Morphing Math

  **Arc-length resampling** (`resamplePath(pts, N, closed)`):
  1. Build cumulative arc-length LUT: `cumLen[i] = cumLen[i-1] + dist(pts[i-1], pts[i])`. If closed, append `dist(pts[last], pts[0])`.
  2. Total length `L`. Target positions: closed → `k * L / N` for k=0..N-1; open → `k * L / (N-1)` for k=0..N-1 (endpoints exact).
  3. For each target, binary-search `cumLen` to find segment `[j, j+1]`, lerp within: `t_local = (target - cumLen[j]) / (cumLen[j+1] - cumLen[j])`.
  4. If `L < 1e-6`: return N copies of `pts[0]`.

  **Correspondence alignment** (`correspondenceAlign(A, B, mode)`):
  - `'centroid-angle'`: find vertex in B whose angle from its centroid best matches the angle of `A[0]` from A's centroid. O(N). Return rotation offset `r`.
  - `'nearest'`: for each candidate offset `r` in 0..N-1, compute `sum_v dist²(A[v], B[(v+r)%N])`. Return `r` minimizing sum. O(N²) — acceptable at N≤512; called once per regen, not per frame.
  - `'arc-length'`: no rotation; vertex 0 is at arc-length origin for both paths. Best for open paths.

  **Easing functions:**
  ```js
  const EASING = {
    'linear':      t => t,
    'ease-in':     t => t * t,
    'ease-out':    t => t * (2 - t),
    'ease-in-out': t => t < 0.5 ? 2*t*t : -1 + (4 - 2*t) * t,
    'cubic-in':    t => t * t * t,
    'cubic-out':   t => 1 - Math.pow(1 - t, 3),
  };
  ```

  **Selective Catmull-Rom smoothing** (when `smoothing > 0`): for each vertex `i`, compute turning angle between `(pts[i-1]→pts[i])` and `(pts[i]→pts[i+1])`. If `|angle| > (1 - smoothing) * π/4`, replace `pts[i]` with the Catmull-Rom midpoint using tension 0.5. Single-pass, skip endpoints on open paths.

  ### Files Changed

  | File | Change |
  |---|---|
  | `src/config/modifiers.js` | Add `morph` entry to `MODIFIER_DEFAULTS` and `MODIFIER_DESCRIPTIONS` (+15 lines) |
  | `src/core/morph-modifier.js` | **New file** — IIFE; `resamplePath`, `correspondenceAlign`, `blendPaths`, easing, `applyMorphModifierToPaths`, `applyModifierToMultiChildPaths` dispatch shim; appends to `window.Vectura.Modifiers` (~250 lines) |
  | `src/core/engine.js` | (1) `computeAllDisplayGeometry` post-pass: detect morph groups, collect `pathsPerChild`, call `applyModifierToMultiChildPaths`, store `modGroup.morphedPaths`; (2) `getRenderablePaths`: morph group → return `morphedPaths`, morph child → return `[]`; (3) `expandModifierLayer`: emit each morphed ring as a shape layer (+35 lines) |
  | `src/ui/panels/morph-panel.js` | **New file** — IIFE panel following `mirror-panel.js` pattern; `window.Vectura.UI.MorphPanel.build(uiCtx, layer, container)` (~280 lines) |
  | `src/ui/panels/algo-config-panel.js` | In `isModifier` branch, dispatch on `modifier.type === 'morph'` → `MorphPanel.build()`, else existing `MirrorPanel.build()` (+4 lines) |
  | `src/ui/panels/modifiers-panel.js` | Add `insertMorphModifier()` callable from Insert menu (+15 lines) |
  | `src/render/renderer.js` | When iterating layers: if `layer.isGroup && layer.morphedPaths?.length`, render `morphedPaths` using first child's pen/color settings (+6 lines) |
  | `index.html` | Two new `<script defer>` tags: `morph-modifier.js` (after `modifiers.js`), `morph-panel.js` (after `mirror-panel.js`) (+2 lines) |

  **Architecture note:** `applyModifierToPaths(paths, modifier, bounds)` processes one child's paths at a time — the mirror contract. Morph needs all children simultaneously. Resolution: add `applyModifierToMultiChildPaths(pathsPerChild, modifier, bounds)` as a new additive function in `morph-modifier.js`. The engine's post-pass calls this only for morph groups. Mirror code path is entirely unchanged.

  ### Work Units (parallel-deliverable)

  **M2 — Config registration** (`src/config/modifiers.js` only). Add `morph` entry to `MODIFIER_DEFAULTS` and `MODIFIER_DESCRIPTIONS`. Do this first — it unblocks M1, M3, M4.

  **M1 — Core math** (`src/core/morph-modifier.js` only). New IIFE. Implements: `resamplePath`, `correspondenceAlign`, `blendPaths`, all easing functions, `applyMorphModifierToPaths`, `applyModifierToMultiChildPaths` dispatch shim. Pure functions — testable with plain `{x,y}[]` arrays. No UI, no engine changes. Begin after M2.

  **M3 — Engine integration** (`src/core/engine.js` only). Three surgical additions: `computeAllDisplayGeometry` morph post-pass, `getRenderablePaths` morph routing, `expandModifierLayer` morph handling. Depends on M1 and M2. Can proceed in parallel with M4.

  **M4 — Panel UI** (`src/ui/panels/morph-panel.js` + 4-line change in `algo-config-panel.js`). New IIFE panel, all controls wired to `modifier.*` fields with live-update callbacks. Depends on M2 for defaults. Can proceed in parallel with M3.

  **M5 — Renderer + Insert menu + script tags** (`src/render/renderer.js`, `src/ui/panels/modifiers-panel.js`, `index.html`). Render `morphedPaths` from morph group layers. Add `insertMorphModifier()`. Add two script tags. Depends on M3.

  **M6 — Serialization round-trip test** (`tests/integration/morph-serialization.test.js`). Verifies `exportState → importState` preserves all morph modifier fields; `morphedPaths` absent from export; backward compat (older engine passthrough on unknown `type`). Depends on M1 + M3.

  **Dependency chain:** M2 first (15 min). Then M1, M3, M4 in parallel. M5 after M3. M6 after M3. Visual baselines last.

  ### Test Plan (RGR)

  **Stage 0 — Guard tests (write first, run before touching source; all must pass)**

  File: `tests/unit/morph-modifier-guard.test.js`
  - [ ] **GUARD-01** `applyModifierToPaths` with `type:'unknown'` returns cloned input — confirms passthrough behavior intact
  - [ ] **GUARD-02** `addModifierLayer('mirror')` produces `modifier.type === 'mirror'` — no silent migration
  - [ ] **GUARD-03** Mirror modifier roundtrips through `exportState/importState` after morph module loads — module isolation
  - [ ] **GUARD-04** `applyModifierToPaths` with `type:'morph'` currently returns passthrough — RED until M1 dispatch wired, GREEN after

  **Stage 1 — Geometry unit tests** (RED until M1; file: `tests/unit/morph-modifier.test.js` Group A)
  - [ ] **A-01** `resamplePath` identity: 3-point input, N=3 → 3 points
  - [ ] **A-02** `resamplePath` arc-length uniformity: square resampled to 100 points; max gap ≈ perimeter/100 ± 2%
  - [ ] **A-03** `resamplePath` single-point degenerate: returns N copies of that point, no crash
  - [ ] **A-04** `resamplePath` empty input → empty output
  - [ ] **A-05** `resamplePath` `.meta` preserved on output
  - [ ] **A-06** `correspondenceAlign` identical paths → offset 0
  - [ ] **A-07** `correspondenceAlign` rotated copy of A detected: `pathB = pathA.slice(4).concat(pathA.slice(0,4))` → offset 4
  - [ ] **A-08** `correspondenceAlign` mismatched lengths → throws with message
  - [ ] **A-09** `blendPaths(A, B, 0)` → points match A within 1e-9
  - [ ] **A-10** `blendPaths(A, B, 1)` → points match B within 1e-9
  - [ ] **A-11** `blendPaths(A, B, 0.5)` midpoints exact: `{0,0}` → `{10,10}` produces `{5,5}`
  - [ ] **A-12** `blendPaths` with easing: `easeIn(0.5) = 0.25`, blended point at 25% not 50%

  **Stage 2 — State creation tests** (RED until M2 + M1; Group C/D same file)
  - [ ] **C-01** `createModifierState('morph')` returns: `type='morph'`, `enabled=true`, `steps=6`, `easing='linear'`, `resampleCount=128`, `emitSources=true`
  - [ ] **C-02** Overrides applied over defaults: `createModifierState('morph', {steps:10})` → `steps=10`, other fields default
  - [ ] **C-03** `addModifierLayer('morph')` creates: `containerRole='modifier'`, `modifier.type='morph'`, `isGroup=true`
  - [ ] **C-04** Morph state roundtrips through `JSON.parse(JSON.stringify(...))` without loss
  - [ ] **C-05** `isModifierLayer` returns true for morph layers (type-agnostic check on `containerRole`)
  - [ ] **D-01** `applyModifierToPaths` dispatch: `type:'morph'` routes to morph handler; output has `steps+2` paths
  - [ ] **D-02** `applyModifierToPaths` dispatch: `type:'unknown_future'` still returns passthrough (GUARD-01 stays green)

  **Stage 3 — Core modifier function tests** (RED until M1; Group B same file)
  - [ ] **B-01** 0 children → returns `[]`
  - [ ] **B-02** 1 child, 0 targets → returns source paths unchanged
  - [ ] **B-03** 2 children, `steps=0` → returns `[pathA_clone, pathB_clone]`, no blends
  - [ ] **B-04** 2 children, 1 path each, `steps=5` → `output.length === 7` (source + 5 + target)
  - [ ] **B-05** Intermediate path centroids lie strictly monotone between source and target centroid
  - [ ] **B-06** Linear easing: gap between consecutive blend paths approximately constant (< 2% variance)
  - [ ] **B-07** EaseIn: first intermediate closer to source than last; non-uniform spacing
  - [ ] **B-08** Multi-path children (3 paths each), `steps=4`: `output.length === 18`
  - [ ] **B-09** Mismatched path counts (2 vs 4): no crash; shorter side padded; output count predictable
  - [ ] **B-10** `modifier.enabled=false`: source + target concatenated, no extra paths
  - [ ] **B-11** `smoothing=0` vs `smoothing=1`: smoothed bounding box differs for jagged input
  - [ ] **B-12** 3 children sequential: two morph segments present; B paths appear once as shared anchor

  **Stage 4 — Engine integration tests** (RED until M3; file: `tests/integration/morph-modifier-panel.test.js` Group A)
  - [ ] **INT-A-01** Full roundtrip: `addModifierLayer('morph')` + 2 children + `exportState/importState` → all morph fields intact, children have correct `parentId`
  - [ ] **INT-A-02** 0 visible children → `computeAllDisplayGeometry` does not throw; group emits 0 paths
  - [ ] **INT-A-03** 1 visible child → source paths passed through; count matches child path count
  - [ ] **INT-A-04** 2 children, `steps=3` → total rendered paths = 5 (1+3+1)
  - [ ] **INT-A-05** Invisible child (`visible=false`) excluded from morph chain
  - [ ] **INT-A-06** Removing the last child does not auto-delete the morph modifier group
  - [ ] **INT-A-07** Removing morph modifier dissolves it; children restored to root with `parentId=null`
  - [ ] **INT-A-08** Undo/redo restores modifier + child structure at each step

  **Stage 5 — Panel + edge case integration tests** (RED until M4; Groups B/C same file)
  - [ ] **INT-B-01** `MorphPanel.build()` renders steps slider, easing chips, sequence mode chips, correspondence chips
  - [ ] **INT-B-02** Steps slider change updates `modifier.steps` and triggers geometry recompute
  - [ ] **INT-B-03** Easing chip change updates `modifier.easing`
  - [ ] **INT-B-04** Panel state does not write any `_panel*` keys onto `modifier` object
  - [ ] **INT-B-05** Each state-changing panel action pushes history exactly once
  - [ ] **INT-B-06** Insert → "Morph Modifier Group" menu item exists; clicking it wraps selected layers
  - [ ] **INT-B-07** Layers dragged into morph group are auto-locked (type-agnostic lock on `containerRole === 'modifier'`)
  - [ ] **INT-B-08** Deleting morph modifier unlocks restored children (type-agnostic unlock)
  - [ ] **INT-C-01** 3 children sequential: A→B segment + B→C segment both present; B appears as shared anchor
  - [ ] **INT-C-02** Children with very different point counts: no crash; resampling normalizes before blend
  - [ ] **INT-C-03** Child with bezier-handle paths: `flattenSmoothedPath` called before resample; output has no bezier metadata
  - [ ] **INT-C-04** SVG export includes morph blend paths; path element count reflects `steps`

  **Stage 6 — Visual baselines** (last, after all unit + integration green)
  - [ ] **VIS-01** `morph-circle-to-wavetable-5steps` — Rings (3 rings) → Wavetable (4 lines), `steps=5`, `easing=linear`
  - [ ] **VIS-02** `morph-same-shape-passthrough` — identical Lissajous children, `steps=4`; all intermediate rings geometrically identical to endpoints
  - [ ] **VIS-03** `morph-easing-ease-in-out-7steps` — Flowfield → Spiral, `steps=7`, `easing=ease-in-out`; clustering near endpoints visible in SVG
  - [ ] **VIS-04** `morph-3-children-chain` — 3 children (simple shape, circle, wavetable), `steps=3`; two distinct morph segments in SVG

  **Existing tests at risk — run after every source change:**
  ```
  npm run test:unit -- --testPathPattern="modifiers|morph"
  npm run test:integration -- --testPathPattern="modifier-workflow|morph|engine-workflow"
  npm run test:visual
  ```
  High-risk: `tests/unit/modifiers.test.js` (dispatch guard); `tests/integration/modifier-workflow.test.js` (lock/unlock type-agnostic); `tests/visual/svg-baseline.test.js` mirrored-masked-circles baseline.

  ### MVP vs Future

  **In MVP:** `type:'morph'` created via Insert menu; 2-child sequential morph with arc-length resampling + centroid-angle correspondence; linear/ease-in/ease-out/ease-in-out/cubic-in/cubic-out easing; 3+ child sequential chaining; cyclic sequence mode; `emitSources` toggle; `correspondenceMode` chip; `multiPathStrategy` (auto/index-match/merge-centroid/merge-longest); `closureMode`; `windingCheck`; graceful fallback for 0/1 children with panel messaging; serialization roundtrip; performance warning badge; `MorphPanel.build()` in `morph-panel.js`; morph group children auto-locked; SVG export includes blend paths; full unit + integration + visual test suite.

  **Deferred:** Catmull-Rom smoothing pass; radial outward layout mode (offset per step); fixed-gap mm/px spacing; scale normalization toggle; per-segment step counts; polar lerp mode; morph preview animation; canvas guide overlays; Step easing (quantized jump cuts); canvas handles (Offset X/Y puck).

  ### Decisions

  - **New multi-child dispatch path, not a change to `applyModifierToPaths`.** Adds `applyModifierToMultiChildPaths(pathsPerChild, modifier, bounds)` as a new function in `morph-modifier.js`. Engine's post-pass calls it only for morph groups. Mirror behavior is entirely unchanged — zero risk of mirror regressions.
  - **Representative-path selection rather than N×M parallel morphing.** Morphing all N paths from child A to all M paths from child B when N≠M is visually uncontrollable. The representative-path model (merge to one shape per child, morph that shape) is predictable and composable. `index-match` remains available for explicit 1:1 parallel use.
  - **`morphedPaths` as a transient computed property, never serialized.** Consistent with how `effectivePaths` and `displayPaths` work — computed geometry is always re-derived from serialized layer definitions. The renderer reads `layer.morphedPaths` when `layer.isGroup && layer.morphedPaths?.length`. No structural renderer change required beyond that guard.

- **Pendula studio — Phase 3/4 remaining (tactile + craft + export).** Shipped so far is in Done; still to build:
  - **Per-loop morph animation export** (the second time axis: a series of distinct evolving figures) — blocked on a frame-packaging decision (no zip lib in the no-build repo).
  - **Plotter hygiene on export** — randomize closed-loop seam start ("reloop") to avoid the pen ink-blot artifact.
  - **Optional node/matrix view** over the existing `{sourceId, targetParamPath, amount, …}` edge data (cheap — the data model already supports it).
  - **Deferred by design (judge-ranked lower / higher-risk):** the skeuomorphic main-canvas "Bench" (drag gears/arms/force vectors), the Patchbench node graph, the Twin-Elliptic machine type, a true-physics coupled-pendulum RK4 mode (log as a PRH hardening idea), and an elastic rubber-band linkage.
- **Push pending.** 18 local commits on `main` (`95cd813` → HEAD) — harmonograph play fix through the Pendula studio, plotter bug fixes, Phases 3/4, the plot-range/clarity/duration/docs slice, the pluck-pad/padlock/macro/drawn-LFO round, the grouped preset gallery, the pluck-pad-predictability + Micro-Tuning/error-copy fixes, the Phase pad + Motion-Rack-above-plotter reorder, and the pop-out floating plotter — are NOT yet pushed (per commit-don't-push pacing).
- **Meridian branch e2e shape-rect drift.** `tests/e2e/smoke.spec.js:1044 — shape reticle cursor appears for shape tools but selection restores normal cursor behavior` fails on `meridian-blue-skin` with a ~0.6 px Alt-drag rect midpoint drift vs `worldStart`. Passes cleanly on `main` (HEAD `6663bc9`). Verified pre-existing relative to Phase 5 — failed identically at the Phase 4 closure HEAD (`65290de`). Likely a layout shift introduced in Phases 2-4 (workspace pane chrome, padding/border drift) that nudges `getBoundingClientRect` between `worldStart` capture and Alt-drag mouse-down. Investigate canvas-bounding-rect timing in `src/render/renderer.js`. Visually rectangles still render correctly; this is a precision drift not a behavioral break.
- **Meridian Phase 3 menu deferrals.** Three menu wirings still use bespoke handlers and would benefit from primitive-based migration: (a) Layer-add submenu (`src/ui/shortcuts.js:517-565`) — needs `UI.overlays.Menu` to support submenus + custom item renderers; (b) Pen palette dropdown (`src/ui/panels/pens-panel.js:141-219`) — needs a new `UI.Menus.Palette` composing `overlays/Menu` chrome + custom swatch grid; (c) `this.openModal` → `UI.overlays.Modal` primitive promotion across the 7 centered modals (CSS rewrite vs class-name shim — pick an approach during the work).
- Migrate the remaining algorithm-local legacy noise paths (`flowfield`, `grid`, `rings`, `horizon`) onto `NoiseRack.defaultConfigFor` to finish the universal-noise convergence.
- Extract the remaining algorithm-tuning magic numbers (wavetable `0.45` / `0.866` / `0.5`, topo `0.45` / `0.866`, spiral tile constants, etc.) into `src/config/algorithm-tuning.js`.
- Reconcile the divergent `applyTile` implementations across `rainfall` / `wavetable` / `topo` / `spiral` and either unify them into `algorithm-utils.js` or formally document the per-algorithm contract.
- Investigate whether the `layer.origin` `{x:0, y:0}` back-compat default for pre-0.8.24 `.vectura` files preserves the prior bounds-derived behavior (renderer falls back to `profile.{width,height}/2` only when `origin` is absent — the new default may shift visuals on legacy saves).
- Extract more shared Noise Rack runtime primitives from the duplicated `wavetable` / `spiral` / `rainfall` implementations into `src/core/noise-rack.js`.
- Add tests for Noise Rack determinism, serialization, UI normalization, and algorithm parity across migrated systems.
- Add GitHub-side rulesets / branch protection, merge queue, and Project fields once the repository settings are available to configure.
- Decide whether to gate PRs on lint after introducing a repo-wide ESLint config that is compatible with the current browser-IIFE codebase.
- Add drag-to-mask layer assignment and richer silhouette providers for currently open-line-only algorithms once their envelope rules are stable.
- Add more modifier types beyond `Mirror`, reusing the shared modifier-container layer model and left-panel modifier registry.

## Done
- **Preset gallery hides "Custom" until the layer diverges, flips to it instantly on any param change (2026-06-06, v1.1.62).** Follow-on polish: "Custom" was always the first row (a permanent deselect affordance) which now reads as clutter since every layer starts on a named preset. The gallery derives whether the layer is still on its preset by comparing live params to `{...defaults, ...preset.params}` (ignoring the transform/preserve set + `preset`/`label`); Custom is rendered only when diverged (then first + active, named preset deselected). The trigger flips to "Custom" the instant any param changes and back the instant the exact value is restored (manual or Undo) — driven by `app.regen()` calling a `refresh()` hook the gallery registers on mount (`this._activePresetGalleryRefresh`), so the param-comparison stays the single source of truth with no per-edit instrumentation. `preservedKeys` passed from the panel mount. RGR in `universal-preset-gallery.test.js` (Custom absent fresh + after apply; trigger flips to Custom on param edit + regen and back on restore; appears active after edit + rebuild). Full suite green (unit 1490, integration 500, visual 13, perf 5).
- **Default-state presets — every algorithm initializes on a named, selected, first-in-list preset (2026-06-06, v1.1.61).** Follow-on to the universal preset system: a fresh layer no longer opens on the unnamed "Custom" state. Each of the 18 algorithms now sets `ALGO_DEFAULTS[type].preset` to a real preset rendered first in the gallery and active on mount. Three reuse the matching curated preset (wavetable→Rolling Hills, topo→Mountain Range, phylla→Sunflower); the other 15 gained a new "Default" preset (group Classic, empty `params` ⇒ byte-identical to the factory defaults, doubling as a one-click reset). Tests updated (harmonograph/pendula libraries 4→5; pendula-algorithm default assertion `custom`→`pendula-default`; new init-selection assertions in `universal-preset-gallery.test.js`). All 102 geometry-bearing presets validated; full suite green (unit 1490, integration 499, visual 13, perf 5).
- **Universal preset system — thumbnail gallery for all 18 algorithms (2026-06-06, v1.1.60).** Replaced the patchwork (harmonograph/pendula gallery, petalis/terrain `<select>`, rings/svgDistort no UI, 12 algorithms preset-less) with one component, one apply path, one mount condition. Layer 0: `harmonograph-preset-gallery.js` exports the generic `Vectura.UI.PresetGallery` (HG alias kept) with a `drawThumb` that dispatches by layer type — HG-family via `HarmonographCore.evaluatePath`, all others via `Algorithms[type].generate(p, rng, noise, bounds)` (heavy params capped, try/catch → empty canvas); `preset-libraries.js` re-keyed by layer type so the mount is a dynamic `PresetLibraries[layer.type].length > 0` check; the 4 bespoke apply blocks collapsed into one `applyPreset(layer, id)` with a per-algorithm `EXTRA_PRESERVED` set; `controls-registry.js` injects a Presets section + preset control into the 14 algorithms that lacked one. Build/infra: `build-user-presets.js` scans every `user-presets/<algorithm>/` dir; new `build-user-wallpaper-recipes.js` bundles `user-presets/wallpaper/*.vectura` into the recipe gallery (`wallpaper-presets.js` `list()` appends `USER_WALLPAPER_RECIPES`); pre-commit hook auto-rebuilds both on staged `.vectura`. Layer 1: 58 new presets (12 algorithms + rings/svgDistort) under the universal vocabulary Classic/Geometric/Organic/Complex/Evolving/User; 31 existing presets gained group tags; harmonograph "Detuned" → "Geometric". Every geometry-bearing preset validated (88/88) to render non-degenerate output (svgDistort exempt — needs an imported SVG). RGR: new `universal-preset-gallery.test.js`; `pendula-preset-gallery.test.js` updated for the Classic→Geometric→Evolving order; harness canvas stub gained `setTransform`/`resetTransform`/`getLineDash`. Full suite green (unit 1490+, integration 489, visual 13, perf 5).
- **Rectangle-lattice wallpaper mirrors lock tile angle to 90° (overlap fix) (2026-06-02, v1.1.57).** Reported as visible overlap on a Rectangle + 2-fold + Straight (pmm) pattern with Tile angle 55°. Root cause: a rectangular lattice is perpendicular by definition and all its groups (pm/pg/pmm/pmg/pgg) carry a mirror/glide whose symmetry only tessellates at 90°, but `LOCKED_AXES.rectangular.tileAngle` was `false`, so the slider sheared the cell into a parallelogram — `reflect(angleA2)∘reflect(angleA1)` then composes to `2·(angleA2−angleA1)` ≠ 180°, so the four ops stop forming a consistent group and the copies overlap/gap. (The genuine free-angle case is the Parallelogram/oblique lattice, p1/p2.) Fix: flip the rectangular `tileAngle` lock to `true`, and coerce a stored non-canonical angle to 90° (60° hex) in `applyWallpaperMirrorToPaths` so pre-lock/hand-edited `.vectura` files self-correct; lock note re-pointed to the Lattice row. RGR across `wallpaper-groups.test.js` (rectangular locks angle, oblique free, rhombic/square/hex unchanged), `mirror-panel.test.js` (Rectangle disables the angle slider + is-locked), `modifiers.test.js` (pmm 55°≡90°, oblique p2 still honors 55°). Full suite green (unit 1489, integration 474, visual 13, e2e 44+1).
- **Motion Rack — in-place re-target + info panels (2026-06-01, v1.1.56).** Two enhancements to the pendula Motion Rack, delivered by parallel implement → adversarial-review → judge agent teams. (1) Each existing edge row gained an in-place **re-target `<select>`** so a routing can be re-pointed (Paper Rotation → Loop Drift) without delete/re-add; amount is left untouched. (2) An **info `(i)` badge on every rack element** (rack header, +LFO, +Macro, shape, sync, rate, depth, polarity, drawn editor, macro value, edge target/amount) via a one-line `infoBtn(key)` helper that reuses the existing global `.info-btn` delegated handler (hover teaser + click-opens-modal), plus 5 new `pendula.motion.*` INFO entries (rack/addLfo/addMacro/macroValue/drawn) so no badge dangles. RGR in `pendula-studio.test.js` (re-target select tracks `targetParamPath` + amount unchanged; info buttons emitted; no-dangling-keys). Full suite green (unit 1484, integration 474, visual 13, e2e pass).
- **Wallpaper recipe state-leak fix (2026-06-01, v1.1.55).** Recipe cards rendered differently depending on the previously-selected recipe (Brick Path → Harlequin looked different from Op-Art → Harlequin) because the apply handler did `Object.assign(mirror, p.mirror)` over the live mirror and each `p.mirror` is a partial — so every field a recipe omits (`tileHeight`, `domainScale`, `rotation`, `variantV1`, `centerX/Y`) leaked in from the prior recipe. Fixed by resetting the preset-settable geometry subset to `createWallpaperMirror()` factory defaults before merging the partial (`Object.assign(mirror, geomDefaults(), p.mirror)`); the reset is factory-derived so it can't drift, and identity/UI fields are preserved. The **Surprise me** roll shares the same clean base, so a panned center no longer survives a roll. Delivered by parallel implement → adversarial-review → judge agent teams. RGR in `wallpaper-gallery-panel.test.js` (order-independence across three apply paths, factory-reset assertion, identity preserved, Surprise center reset). Full suite green (unit 1484, integration 474, visual 13, e2e pass).
- **Pendula Phase 3/4 tactile + craft round (2026-05-31, commits `0dd458d` + gallery).** Three slices delivered by parallel RGR + adversarial-review subagents on disjoint files. **(B) Pluck pad + dice padlocks** — each pendulum card leads with a drag-vector pluck pad (length→amplitude on ampX/ampY, angle→direction on phaseX/phaseY); numeric amp/phase moved into an Advanced disclosure; per-param padlocks (in `layer.params.pendulumParamLocks`) let Dice skip frozen params. **(C) Motion Rack macros + draw-your-own LFO** — a static 0–1 Macro source patched to many edges at once, and a `drawn` LFO shape with a per-loop curve editor, both serialized and baked through the unchanged `evaluateSource`. **(C) Craft-ladder preset gallery** — the flat dropdown becomes grouped thumbnail cards (Classic → Detuned → Evolving) via new `harmonograph-preset-gallery.js`, sharing one apply path. Review fixes: pluck pad pointer-only (was double-firing pointer+mouse), drawn-editor `--ui-*` tokens, orphaned-lock cleanup on delete. Full suite green (unit 1484, integration 449); all four features verified live in-browser.
- **Pendula plotter — plot-range, clarity, duration, param docs + docs sync (2026-05-31, commit `8b3ee99`).** (1) **Plot range** start/stop: a dual-thumb slider above Reveal commits `plotStart`/`plotEnd` (0–100%) and truncates the figure by arc length at the shared `HarmonographCore.evaluatePath` seam, so **both the main canvas and the virtual-plotter ghost** truncate (the reveal retraces the visible slice). Full range is a byte-identical no-op (determinism + `pendula==harmonograph` equality preserved); legacy `.vectura` files default to full. Commits on release with undo; overlapping thumbs grabbable via pointer-proximity z-index. (2) **Virtual-plotter clarity**: DPR-scaled backing store (≤3×), logical-coordinate drawing, responsive CSS preserved. (3) **Duration** max 120 → 600s. (4) **Info modals**: every Pendula/harmonograph param now has human-friendly copy, plus `pendula.*` mirror entries that fixed previously-dead Pendula info buttons. (5) **Docs sync (Priority A, was OWED)**: README + in-app help corrected to reveal-only, Pendula row / Motion Rack / machine types / Export Animated SVG documented (the in-app shortcuts list already registered Pendula). Adversarially reviewed (no CRITICAL; 3 MEDIUM fixed). Full suite green (unit 1477, integration 428); verified live in-browser (10–80% → canvas + ghost both 4199 pts). Built Wave 1 with parallel technical-writer + reviewer subagents on disjoint files.
- **Pendula — kinetic-harmonograph studio (2026-05-31).** New `pendula` algorithm built in parallel with the untouched `harmonograph` (delegates its static render to harmonograph's generator). Shipped across 9 commits (`95cd813` → `735164d`): **Phase 1** — fixed the dead play button (a float index crashed the rAF loop after one frame) + live looping playback + a shared, pipeline-free `HarmonographCore.evaluatePath`. **Phase 2** — the Motion Rack: temporal LFOs (sine/tri/saw/square/S&H/random; free or synced-to-loop) drag-assigned to any parameter via a typed edge matrix in `layer.params.motion`, plus 4 motion-bearing presets, all serialized. **Plotter bug fixes** — an LFO is parameterized by the figure's own progress `t` and baked PER-SAMPLE into geometry, so the grey ghost is static (reveal-only playback, red line traces it on a loop) and `harmonograph.generate()` routes through the same evaluator so the main canvas + SVG export + the live Motion-Rack-edit all reflect the LFOs. **Phase 3** — machine types (Lateral / Pintograph, where damping is forced to 0 for perpetual loops), tasteful Dice/Mutate (`applyHarmonographFamilyBias` — ratio-snapped freqs, low-band damp), per-pendulum mini-traces + a freq-ratio readout; deleted the dead `pendulum-list.js`. **Phase 4** — `File → Export Animated SVG…` (draw-on SMIL `stroke-dashoffset`, looping), kept separate from the canonical plotter SVG. Key modules: `src/core/algorithms/{pendula,harmonograph-core,harmonograph-modulation}.js`, `src/ui/components/harmonograph-motion-rack.js`, `src/ui/export-animated-svg.js`. Planned via adversarial fact-find + judge subagent workflows; Phase 3 built with parallel subagents on disjoint files. Full suite green (unit 155 files / 1473 tests, integration 63 / 423). Remaining tactile/craft/export items + owed human-facing docs are in Inbox.
- **Wallpaper gallery polish round 2 (2026-05-22).** Follow-on to the 2026-05-21 audit. (a) Icon strokes now use the resolved `--mp-type-color` token (skin-aware; in cacheKey). (b) Selected recipe/group card is unmistakable — glow ring + tint + corner check badge + `aria-pressed`; a recipe highlights only while the live mirror still matches it (`matchesPresetMirror`), else the bare-group card does. (c) **Anti-swastika motif** — the reference glyph changed from a straight-legged hook (which a 4-fold rotation turns into a swastika) to a curved spiral comma (rotates into a floral pinwheel). (d) Info popovers (Lattice/Rotation/Mirrors) rewritten in plain language keyed to the visible chip labels — they no longer decode the p/c/1/2/m/g notation that is hidden by default. (e) **Curation/dedup** — because icons are canonical + scale-normalized, recipes that were "group X at default" duplicated their group card; removed Windowpane(p4m), Hex Bloom(p6m), Kaleidoscope(p3m1), Star Anise(p31m), one near-identical pgg rectangle, and Pinwheel; renamed Herringbone→Switchback, Frieze March→Procession, Rolling Tide→Brick Path; the **p4 "Quarter-Turn" group card** is now presented + applied on a 45° diagonal (icon matches result). 15 curated recipes remain. New/updated tests across `wallpaper-presets`, `wallpaper-preview`, `wallpaper-gallery-panel`; full unit (1423) + integration (371) + visual (13) green. **Needs visual review (can't pixel-verify headlessly):** the new curved motif under all 17 groups, the p4 diagonal, and that no remaining pair reads as too-similar.
- **Wallpaper gallery audit — icon/label/range/a11y fixes (2026-05-21).** Multi-team audit (visual / UX / code review) of the wallpaper recipes + Build settings. Root cause of "icons change when you click and don't match the pattern": gallery thumbnails were rendered from the layer's live `effectivePaths`, which already carries the applied wallpaper transform, so every recipe click recomputed that geometry and repainted all cards (compounding drift). Fixes shipped: (1) gallery icons are now **canonical** — rendered from a fixed reference motif under each group's symmetry, never live geometry (`wallpaperSourcePaths` removed); (2) explicit `WALL_GROUP_SHORT` map gives every group a ≤3-word card title instead of the description-sentence fragment (p4g was "Quarter-turn rotations plus glide mirrors instead of straight ones" → "Square Glide"); (3) Build tile-angle range widened 60–120° → 45–135° so sub-60° recipe/randomizer values are reproducible, and bogus 180/270 dial ticks removed; (4) a11y: `aria-pressed`, descriptive `aria-label`, `aria-hidden` thumbs, `:focus-visible` ring, recipe sublabel now names the symmetry, sublabel/section font sizes bumped. integration tests in `wallpaper-gallery-panel.test.js`. **Follow-up (all the originally-deferred items, now resolved):** (a) honest recipe renames — Herringbone→Switchback, Tatami→Lockstep (both `pgg`), Honeycomb→Hex Bloom (`p6m`), Frieze March→Procession (`pmg`); Courtyard kept (its `rotation:45` reads as a diagonal panes variant, visually distinct from Windowpane). (b) tile-angle dial rebuilt as a top-semicircle **range gauge** (upright = 90° square, tilt = skew toward 45/135) selected via `data-dial-mode`, replacing the dead-zone-prone full-compass mapping; pattern-angle dial stays a true compass. (c) per-group variant labels — Crisp/Airy for the 3-fold groups + p4g, **Open/Woven** for the 6-fold groups where v1 overlaps into a denser weave. (d) **icon quality** — DPR-scaled backing store (crisp on Retina, dpr in the memo key), fixed-lattice-window framing for consistent pitch/density across all cards, a connected chiral motif placed on the fundamental-domain centroid (never clips to nothing), constant ~1.2px stroke, removed competing bg fill. New tests across `wallpaper-gallery-panel` and `wallpaper-preview`; full unit (1420) + integration (368) + visual (13) green.
- **Wallpaper mirror — creative experience layer (2026-05-21, v1.1.41).** Built on top of the composable-symmetry standardization, this turns the engineer-y chip picker into a gallery-first artist tool, delivered by four parallel agent teams against locked `window.Vectura` interface seams (zero shared-file overlap by design). (1) `WallpaperPreview` (`src/ui/panels/wallpaper-preview.js`) — a pure, cached, lazily-painted thumbnail substrate that runs `Modifiers.applyWallpaperMirrorToPaths` offscreen on the user's own geometry. (2) `WallpaperPresets` (`src/ui/panels/wallpaper-presets.js`) — 21 curated named recipes (`list()`, single source of truth; deliberately NOT mirrored into `presets.js` since a mirror-modifier config is a different shape than algorithm `params`) plus a constraint-locked `randomize()` that is provably always a valid group. (3) `mirror-panel.js` `wallConfig` — default **Styles** gallery (cards = 17 groups in plain language + recipes, each a live preview) and **Surprise me** dice with Shift-lock; the chip editor moves behind a **Build** mode toggle (`SETTINGS.wallpaperPanelMode`, default `styles`); confusion fixes: re-wired glossary popovers, snap-feedback chip flash + plain-language note, always-on friendly name badge, reworded copy (Tile scale / Pattern angle / Crisp·Airy), touch-safe lock notes. (4) `renderer.js` — on-canvas center puck (`centerX/centerY`) + rotate ring (`rotation`) following the existing `latticeA/B` + `mirrorAxisRotate` patterns. New tests: `wallpaper-preview` (19 unit + 3 perf), `wallpaper-presets` (14 unit), `wallpaper-gallery-panel` (8 integration), `wallpaper-center-rotate-handles` (12 integration), updated `mirror-panel` assertions. Full local suite green: 1417 unit + 361 integration + 13 visual + 5 perf (e2e CI-gated). Also fixed a pre-existing orphaned `<<<<<<< HEAD` conflict marker committed into `CHANGELOG.md` at `b31bc47`.
- **Wallpaper modifier — composable symmetry chips (2026-05-21, v1.1.33).** Flat 17-cell crystallographic atlas replaced with three orthogonal chip rows (lattice / rotation / mirrors) that derive the group ID via a new `WallpaperGroups.featuresToGroupId` + `nearestValidGroup` resolver. Invalid combinations snap deterministically (rotation snaps to the nearest legal value for the lattice; mirrors snap to the closest in a per-(lattice, rotation) chain with an escalate-not-relax rule for already-mirrored states — e.g. `p3m1` → hex rot 6 lands on `p6m`, not `p6`). `createWallpaperMirror` dual-writes `mirror.group` (engine continues reading this) and the composable `mirror.symmetry` tuple; both roundtrip through the existing `JSON.parse(JSON.stringify(...))` clone path in `engine.js` without an import backfill. Legacy `.vectura` files without `symmetry` derive it on render. Crystallographic IDs (`p4m`, `p3m1`, …) hidden by default behind a new `Document Setup → History & Preferences → Show crystallographic group names` toggle (`SETTINGS.showCrystallographicNames`, persisted with the existing cookie flow). New ⌘← / ⌘→ shortcut cycles through every group sharing the current lattice in canonical order (rotation asc, then mirror complexity), wrapping. 13 new resolver tests in `tests/unit/wallpaper-groups.test.js`; 10 new composable-symmetry tests + 4 updated lattice-keyed assertions in `tests/unit/mirror-panel.test.js`; full `test:ci` green (1384 unit + 341 integration + 13 visual + 44 e2e). `cmm` is now correctly classified under `rhombic` rather than the legacy ad-hoc `sq` bucket.
- **Pen tool Alt-drag bezier handle freeze.** While drawing a new pen point, `Alt/Option` now preserves the mirrored handle's last position and lets the active bezier handle move independently. Regression coverage added in `tests/unit/renderer-pen-snap-to-origin.test.js`; README, in-app shortcuts, and changelog updated.
- **Modal hardening — audit Bugs-4 (Unreleased).** `openModal()` legacy path no longer assigns untrusted HTML strings to `innerHTML`. String bodies route through a new inline sanitizer that parses the markup into an inert `<template>` fragment, walks every element, and strips `on*` event-handler attributes, `<script>`/`<style>`/`<iframe>`/`<object>`/`<embed>` subtrees, and `javascript:` URLs before appending. Esc-to-close (document-level capture-phase listener, bound for the lifetime of the open modal and explicitly removed on close to avoid leaks), Tab/Shift+Tab focus trap on the `.modal-card` (cycles through focusable descendants; falls back to `tabindex="-1"` on the card when none are present), and deterministic focus-restore on close (restores `document.activeElement` snapshot taken at open time) all land alongside. The two `ui-file-io.js` error toasts (`Invalid File`, `No Paths Found`) were migrated to Node bodies. 7-test integration suite at `tests/integration/modals/modal-hardening.test.js`; 1041 unit + 281 integration + 13 visual + 2 perf all green; e2e green (1 unrelated flaky retry).
- **Meridian cleanup chain — closed (1.1.10, 2026-05-20).** All four deferred deletions landed: (1) `src/ui/_ui-legacy.js` drained across units 1.5–1.10 then deleted in `7088a2f`; (2) `styles.css` drained across units 2.1–2.7 then deleted in `3123da7`; (3) every `var(--color-*)` reference under `src/` rewritten to `var(--ui-*)` (steps 3.1 + 3.2 = `a4b2cb1`), classic-skin alias maps inlined and `--color-*` defaults dropped from `components.css` (step 3.3a = `9d4207d`); (4) `data-theme` root mirror attribute + fallback read dropped (step 4.1 = `879b5b8`). New CSS now lands exclusively in `src/ui/skin/`. Original orchestrated breakdown at `~/.claude/plans/re-evaluate-our-meridian-ui-linked-lantern.md` (22 work units across 5 steps).
- **Repository operating model established.** Canonical version sync (`npm run version:sync`), human-curated `CHANGELOG.md`, README release notes, expanded Mermaid architecture diagrams, and Codex doc-maintenance rules are all live.
- **GitHub governance scaffolding landed.** Structured issue forms, Dependabot config, CODEOWNERS, release-note categorization, and documented GitHub Project / ruleset expectations in `docs/github-governance.md`.
- **Noise Rack design + universal convergence.** Shared multi-engine noise stack model designed and shipped to every noise-capable algorithm; remaining algorithm-local legacy paths (`flowfield`, `grid`, `rings`, `horizon`) tracked separately in Inbox.
- **Pathfinder panel — full Illustrator parity (1.0.35).** Multi-selection sidebar now exposes all ten Illustrator Pathfinder operations on 2+ selected layers, organized into a single collapsible `Pathfinder` section that mirrors the Align panel structure. Four **Shape Modes** (Unite, Minus Front, Intersect, Exclude) produce non-destructive compound shapes via `createCompound` + `Expand`; six new **Pathfinders** (Divide, Trim, Merge, Crop, Outline, Minus Back) dispatch through a unified `Vectura.PathfinderOps.applyPathfinder(engine, layers, op, mode)` and produce destructive baked output grouped under a new `groupType: 'pathfinder'` container. Silhouette mode chord-closes open paths; Shape-Only mode restricts to closed shapes. Outline preserves source `strokeWidth` (plotter-ready line-art divergence vs Illustrator's 0pt). Divide capped at 8 input layers to bound the `2^n` arrangement cost. Empty results skip history and surface a transient hint. 32 new unit RGR tests + 15 new integration tests cover ops, dispatch, undo round-trip, error paths, and panel enablement/collapse. Outline icon redesigned to distinguish from Divide. Pathfinder Options dialog (precision / drop-unpainted) deferred — see PRH-002. Spec: `docs/pathfinder-requirements.md`.
- **Export Stroke Override toggle (1.0.12).** Added a switch in the Optimization panel above the Stroke (mm) slider, defaulting OFF so the SVG export honors each pen's configured width. Turning it ON surfaces the slider and applies a global uniform stroke that overrides the per-pen widths. State persists across sessions and `.vectura` saves; export consumption gated at `src/ui/ui-file-io.js`. Three new integration RGR tests cover off→pen-wins, on→slider-wins, and off+penless→SETTINGS fallback.
- **Meridian Blue skin migration (5 phases, branch `meridian-blue-skin`).** Six shipping skins (Modern: `dark`, `lark`, `light`; Classic: `classic-dark`, `classic-lark`, `classic-light`) share one swappable `<link id="active-skin">` driven by `SkinManager.activate()`. Token system unified on `--ui-*` with legacy `--color-*` aliases preserved during the styles.css transition. UI architecture split from a single 16,288-line `ui.js` into ~60 satellite modules under `src/ui/{shell,panels,components,overlays,modals,menus,skin}` using the locked `bind(deps)` DI-bag pattern. Empty-state illustrations + indeterminate progress bar wire into save / SVG export / engine generations exceeding ~200 ms. Reduced-motion compliance + keyboard a11y audit scripted in `tests/unit/skin/`. Skin-authoring SDK ships at `npm run skin:new -- <id>` + `docs/skin-authoring.md` — new skins land with one CSS file + one manifest entry, zero JavaScript edits. Test totals over the migration: 416 → 742+ unit, +114 integration, 13 visual at 0-px diff. Per-phase actuals in `docs/design/meridian-migration-plan.md`. **Cleanup deferred (tracked separately as a single dependency chain):** delete `_ui-legacy.js` (~8,300 lines), delete `styles.css` (~4,665 lines), strip `--color-*` aliases, drop `data-theme` mirror.
- Rebuilt the onboarding tour around an extensible step engine: visuals (highlight, dashed circles, popover), action helpers (open menus / expand sections), and `When.*` completion factories now live in separate composable layers, and steps may declare multiple in-place `phases`. New tour content guides press-and-hold algorithm selection (Rings) → algorithm swap via dropdown → tune & re-seed (Randomize Params at the *top* of the pane) → layers + mask → +Add Layer → Mirror Modifier Group → mirror playground → export. Popover is draggable on play-around steps so guidance stays on screen while users interact with the canvas.
- Added per-tool custom canvas cursors and consolidated the shape primitives into a single long-press toolbar group. V (Selection) shows a filled black arrow, A (Direct Selection) an outline arrow, P (Pen) a fountain-pen tip — all rendered via SVG-as-cursor data URLs. F (Fill) hides the system cursor in favor of a DOM overlay: a paint-bucket icon anchored at the cursor with a fill-point dot, plus a 96 px circular magnifier (~4× zoom) of the canvas pixels under the cursor that auto-flips between quadrants so it stays inside the canvas viewport. A new `shape-line` primitive (keyboard `U`) rounds out the shape group alongside rect / oval / polygon; lines emit as open two-anchor paths and route through the existing shape pipeline. The Rectangle / Oval / Line / Polygon flat buttons collapsed into one parent button with the same long-press UX as the Selection group: single-tap activates the most-recently-used variant; long-press opens the variant submenu. The algorithm submenu's hover highlight now matches the toolbar's active-tool blue (`#38bdf8` / `rgba(56,189,248,.12)`) for a unified focus-cue.
- Hardened the Pattern Designer SVG-import path against XSS by routing imported tiles through a new shared `Vectura.SvgSanitize.sanitize()` (strips `<script>`, `<foreignObject>`, all `on*` attributes, rewrites `javascript:` href/xlink:href). The file-open SVG path now uses the same sanitizer in place of its narrower inline `stripEventHandlers`. Two previously-silent `catch` blocks in `pattern.js` now `console.warn('[Pattern] …')` so failures stop being invisible. New regression cases extend `tests/unit/security_xss.test.js`.
- Persisted `layer.origin` in `.vectura` save/load (engine `exportState`/`importState`), with a `{x:0, y:0}` default for files saved before this change. The field is consumed by renderer transform math, so prior round-trips could drift scale and rotation. Round-trip integration test added.
- Fixed `worldToSourcePoint` precision: tiny-but-nonzero scales now use a sign-preserving `1e-6` epsilon clamp instead of falling back to `1`, which broke true inversion.
- Encapsulated engine layer mutations: added `VectorEngine.reorderLayers()`, `deleteLayersById()`, and `setActiveLayerId()` with input validation; UI delete/group/mirror-insert callsites now route through them instead of assigning directly to `engine.layers` / `engine.activeLayerId`. 14-test unit suite added.
- Migrated `topo`, `phylla`, and `terrain` off legacy noise objects to `NoiseRack.defaultConfigFor(algorithmId, params)`, completing the universal-noise convergence for these algorithms. Visual baselines unchanged. (`flowfield`, `grid`, `rings`, `horizon` legacy paths still pending — tracked in Inbox.)
- Extracted Rainfall (`noiseScale`, `gustScale`, `spiralFactor`, `paddingMax`) and Wavetable (`defaultZoom`) tuning constants into a new `src/config/algorithm-tuning.js` registry. Rainfall hex ratio is now `Math.sqrt(3)/2` (precision gain).
- Deduplicated math utilities: new `src/core/algorithm-utils.js` (`Vectura.AlgorithmUtils`) is now the single source of `clamp`, `clamp01`, `lerp`, `frac`, `applyPad`; ~26 inline duplicates removed across 18 files. `applyTile` left inline per algorithm — its semantics diverge meaningfully and a single canonical version would alter rendering.
- Consolidated UI inline-SVG icons into a single `src/ui/icons.js` registry (`Vectura.Icons.{layer,tool,misc}`). Layer-panel set (34 icons, previously embedded in `ui.js`) and Petal Designer toolbar set (23 icons, previously embedded in `ui-petal-designer.js`) extracted; ring icon for algorithm param-group headers folded in. Pure refactor — `_LVL_I` field and `renderIcon()` wrapper still work as before for callers, no visual diff (visual baselines pass). Static SVGs in `index.html` left as-is so they render before JS loads.
- Added a new **Terrain** algorithm focused on realistic plotter-ready terrain: heightfield-driven scanlines with selectable perspective (orthographic / one-point / two-point / isometric), native ridged-multifractal mountains, V/U valleys with sinuous axes, steepest-descent rivers that carve the heightfield, and an ocean clamp with optional marching-squares coastline. Per-column hidden-line removal so distant rows compress through projection, not faked spacing. Six style presets (`Alpine Range`, `Rolling Hills`, `Canyon Mesa`, `Archipelago`, `River Delta`, `Tundra Flats`). Coexists with `Horizon`. Unit tests + visual baselines added.
- Consolidated Horizon (Terrain) UX: renamed `Depth Compression` → `Terrain Depth` (inverted so high = more foreground rows), merged the duplicated Terrain Form center cluster + Center Dampening group into one `Center Region` panel sharing Width / Edge Softness / Compress at Horizon, moved `Symmetry Blend` to Terrain Noise as `Noise Mirror`, and stripped mountain noise to a single `Mountain Amplitude` (zoom/frequency/seed gone; seed shared with global). ~26 knobs → 15. Tests updated, baselines regenerated.
- Fixed Horizon (Terrain) parameter directions and wiring: `Center Depth` now carves a downward valley, `Shoulder Lift` and `Ridge Sharpness` raise terrain upward, `Skyline Relief` attenuates the full terrain expression toward the horizon (visible without noise), the convergence/fan lines bend with the terrain when shape or noise is active, `Floor Height` becomes a bidirectional offset (-100..100, default 0), and Additional Noises in the rack now displace the terrain regardless of the `Enable Terrain Noise` master toggle (which still gates the built-in mountain noise). Visual baselines `horizon-valley.svg`, `horizon-shoulders.svg`, and `horizon-flat-grid.svg` regenerated.
- Improved Horizon mountain coherence: anchored the mountain noise depth-axis so adjacent rows skin a single mountain surface and `Mountain Amplitude` can be pushed well above 5 without rows tangling. Added a `Compress at Horizon` sub-control to `Center Dampening` that tapers the dampened band toward the vanishing point, forming an upward-pointing triangular mask. Visual baselines `horizon-valley.svg` and `horizon-shoulders.svg` regenerated.
- Made Horizon terrain noise opt-in: replaced the always-on rack default with an `Enable Terrain Noise` toggle, a built-in mountain noise (amplitude/zoom/seed), and a `Center Dampening` group (strength + width + softness + falloff) that attenuates the mountain toward the vanishing point. The existing noise rack is retained as `Additional Noises` for layering extras on top.
- Fixed Wavetable `Isometric` so `Line Gap` now controls the visible cell spacing from a single shared lattice model, `Row Shift` shears the entire lattice coherently, and deterministic plus SVG-baseline regressions now lock the behavior in through the repo's RGR workflow.
- Updated the stale Export SVG smoke/integration test flow so Line Sort preview assertions now force a real unchecked-to-checked transition under the current default-enabled setting, leaving only the known Pattern fidelity failures in the CI smoke lane.
- Corrected Noise Rack polygon zoom direction so larger zoom values now enlarge polygon footprints consistently across shared and algorithm-local samplers, and normalized vertical line-displacement sign so positive amplitudes move grid/line-stack offsets upward while leaving radial/vector-field semantics unchanged.
- Unified shared toolbar generation in `ui.js` so the main canvas, Petal Designer, and Pattern Texture Designer all consume one configurable tool-definition registry, and added `Fill` / `Erase Fill` to the shared tool set with shortcut/help coverage.
- Upgraded the Pattern Texture Designer fill workflow to support nested closed regions, additive ancestor-stack fills, drag-pour fill/erase, `Alt/Option` temporary erase while filling, and a `Show Gaps` tolerance slider with yellow gap diagnostics plus auto-close actions for closable seam endpoints.
- Added a custom Pattern tile workflow: a runtime merged registry for bundled plus saved custom patterns, local/project persistence for custom tiles, `.vectura` project round-tripping, inline Pattern Texture Designer import/save/load actions, and a live `3x3` validation preview that blocks saving seam-invalid SVG tiles.
- Added representative Pattern source-fidelity coverage that scans the full Hero tile catalog, selects compound-fill archetypes including `Autumn`, `Bamboo`, and `Bank Note`, and records the still-broken seam/silhouette cases as expected-fail Playwright regressions so the renderer gaps stay visible without redlining CI.
- Fixed fill-built Pattern extraction so overlapping SVG fill subpaths now collapse to the visible silhouette boundary, tightened seam-chain pairing so `Autumn` grid tiles reconnect cleanly across the horizontal seam, and added unit plus Playwright regressions for the affected Hero patterns and seam continuity.
- Fixed the Pattern-layer Texture Designer initialization so the default fallback texture now appears immediately on first open, and moved the designer directly below the texture selection grid above `Scale`.
- Moved export and optimization controls out of Document Setup into a dedicated Illustrator-style Export SVG modal with a left-side preview, right-side settings, bottom-right actions, and zoom/pan inspection.
- Fixed the Export SVG modal `Line Sort` overlay preview so legend colors/thickness and preview mode are modal-local only; the primary canvas no longer shows export-preview overlay state, and cancel fully clears it.
- Tightened Export SVG optimization header layout so section info icons stay immediately to the right of their titles.
- Fixed Export SVG section-header info buttons so they attach to the title label instead of the reorder grip dots.
- Adjusted Export SVG section-header info buttons so they render immediately after the title span as sibling elements.
- Fixed Export SVG section-header info panes so they expand below the full header bar instead of inside the header row.
- Added Document Setup project-state units (`metric` / `imperial`), unit-aware paper/margin/stroke/tolerance controls, blueprint-style paper dimensions outside the canvas, a `Clear Saved Preferences` action for cookie-backed UI state, `Cmd/Ctrl + K` toggle behavior, and regression coverage for the full workflow.
- Fixed multi-layer `Line Sort` so shared optimization scope now carries through preview, stats, overlay rendering, and optimized SVG export instead of degrading to per-layer sorting.
- Added `Lissajous` `Truncate Start` / `Truncate End` endpoint-length sliders, defaulted both to `0%`, and flipped `Close Lines` to default off so users can shorten each end explicitly before enabling tail trimming.
- Refined `Lissajous` `Close Lines` so loose endpoints trim to self-intersection cutpoints instead of forcing end-to-start closure, and added focused unit coverage for trimmed-tail plus no-crossing cases.
- Fixed snapshot-based Undo/Redo for document-mutating layer-structure edits by storing real post-mutation structural states, restoring multi-selection sets, and adding integration regressions for grouping, reparenting, masking, and modifier/container edits.
- Fixed `Remove Hidden Geometry` export to correctly clip ancestor-masked layers using `displayMaskActive` instead of `layer.mask?.enabled`, so child layers clipped by a parent mask are properly trimmed on export.
- Improved accessibility across all UI: theme-aware canvas reticle cursor, `prefers-reduced-motion` support, `aria-live` on notification toasts, modal focus management, `aria-pressed`/`aria-current`/`aria-expanded` on interactive controls, visible focus rings, and a minimum 11 px text-size floor.
- Added a full dark/light shell theme with a header sun/moon toggle, cookie-backed personal theme preference, theme-aware renderer/helper chrome, and automatic `Pen 1` plus document-background syncing when the theme flips.
- Fixed circle-backed mask edits so once a mask is reshaped through direct anchor editing it drops stale canonical circle metadata and reclips descendants to the edited outline, with unit and Playwright regressions.
- Fixed optimized SVG export so `Export Optimized` no longer reuses masked display geometry as its raw source when `Remove Hidden Geometry` is off, with engine/integration/Playwright regressions.
- Removed the duplicate top-level `Remove Hidden Geometry` checkbox from Document Setup so Export Settings remains the sole default-on control for that export-only behavior, with integration and Playwright regressions.
- Added live mask-parent transform preview so moving/resizing/rotating a mask parent ghost-renders its masked descendants against the transformed silhouette until release, with unit/integration/Playwright coverage.
- Added an Illustrator-style reticle cursor for Rectangle/Oval/Polygon tools and single selected primitive shapes in Selection, while preserving center-out `Alt/Option` drawing and existing handle cursors.
- Fixed generator algorithm switching so non-`expanded` layers no longer silently acquire `sourcePaths`, changing the Algorithm dropdown regenerates the artboard immediately, and CI now checks the geometry-change path in both integration and Playwright smoke coverage.
- Added Illustrator-style shape authoring with Rectangle/Oval/Polygon tools, editable shape metadata on `expanded` layers, and Selection/Direct corner-rounding interactions.
- Added `Remove Hidden Geometry` to export settings so SVG export can switch between destructive visibility-trimmed output and non-destructive clip-path preservation for masked/frame-hidden geometry.
- Replaced source-selected clipping with Illustrator-style parent masks so visible parent silhouettes clip all indented descendants recursively, legacy `sourceIds` masks are cleared on load, and export mirrors the masked subtree exactly.
- Added `Hide Mask Layer` on parent masks so the parent can remain the active clipping silhouette while its own artwork is suppressed from canvas, stats, and SVG export.
- Added Layer Modifiers v1 with `Insert > Mirror Modifier`, group-like modifier container rows, modifier-aware effective geometry, and full-canvas mirror-axis stacks that apply sequentially to child layers before display/export.
- Added mirror-guide overlays and interactions: dashed non-exporting axes, reflection-direction triangles, separate rotate handles, per-axis show/hide-lock-delete controls, and stack-level add/show-hide/lock/clear actions.
- Fixed Mirror Modifier layer-tree behavior so children can be dragged back out to the root, deleting a modifier dissolves only the wrapper and preserves its children, and `+ Add` under a selected modifier creates a drawable child instead of a pseudo-`mirror` layer.
- Fixed Mirror Modifier child editing so selecting a nested drawable child returns the left panel to normal `Algorithm` mode and keeps algorithm, parameter, and transform editing active inside the mirrored subtree.
- Fixed mirrored closed-mask handling so a mask parent under a Mirror Modifier now contributes the mirrored closed silhouette union, masked descendants clip against both mirrored lobes, and SVG plus screenshot baselines lock the mirrored-mask scene visually.
- Fixed Rectangle/Polygon authoring so new primitive layers no longer inherit `Curves` from the previously active generator layer, and rotated primitive selections now keep selection bounds plus corner-rounding handles aligned to the transformed shape geometry with deterministic and screenshot coverage.
- Added an agentic harness source-of-truth document and synchronized PR-template expectations.
- Added baseline automated test coverage for unit, integration, e2e smoke, visual, and perf workflows.
- Established existing Mermaid-based architecture documentation in the README.
- Built an advanced stacked-noise foundation in `wavetable`, with related layered-noise behavior already present in `spiral` and `rainfall`.
- Added the first shared Noise Rack runtime primitive in `src/core/noise-rack.js` and wired shared blend-combination behavior into `wavetable`, `spiral`, and `rainfall`.
- Migrated `rings` to Noise Rack with stacked noise layers, preserved ring-local drift/sample-radius controls, and per-noise `Orbit Field` / `Concentric` / `Top Down` projection.
- Migrated `topo` to Noise Rack with stacked field layers while preserving the existing contour mapping modes and moving fractal controls into per-noise-layer settings.
- Migrated `flowfield`, `grid`, and `phylla` onto Noise Rack stacks while preserving their algorithm-specific master controls.
- Routed Petalis drift and the existing noise-driven Petalis modifier samplers through Noise Rack-compatible stack evaluation, and restored local Playwright smoke runs with a system-Chrome fallback plus local video suppression.
- Fixed shared image-noise control behavior by rendering `Invert Color` as a checkbox, correcting `Noise Width` direction in the affected samplers, and centering default polygon noise in the remaining off-center algorithms.
- Reworked `Rings` `Concentric` mode into a seam-corrected ring-path sampler, improved the apply-mode help text, and added a `Center Diameter` control for widening the innermost ring.
- Replaced the remaining one-off Petalis modifier noise sliders with nested Noise Rack stacks in the main controls and Petal Designer modifier cards, while preserving legacy modifier-scale fallback behavior.
- Added a live masking/display-geometry engine stage, row-level `Mask` controls in the Layers panel, and `Convert To Geometry` materialization into expanded lines.

## Decisions
- In Wavetable `Isometric`, `Line Gap` refers to visible cell spacing and `Row Shift` applies as a coherent lattice shear across all three line families rather than offsetting only the horizontal rows.
- Positive Noise Rack amplitude only implies “up” for generators that convert noise directly into screen-space vertical displacement; radial, orbit, and vector-field consumers keep their existing amplitude semantics.
- Export configuration stays single-sourced through the existing `SETTINGS` object and layer optimization state; the Export SVG modal is only a preview/configuration surface and must not introduce a second export rules path.
- Document Setup unit choice is serialized with the project, but all internal physical geometry, paper, margin, stroke, and optimization math stays normalized in millimeters.
- Blueprint-style document-dimension labels are editor-only canvas chrome and never export.
- `Lissajous` exposes explicit endpoint truncation before `Close Lines`: `Truncate Start` and `Truncate End` remove 0-100% of arc length from each end, and `Close Lines` defaults to off.
- `Lissajous` `Close Lines` is a tail-trimming affordance, not a forced path-closure toggle: it preserves open paths and only replaces loose endpoints with exact self-intersection cutpoints when valid tail crossings exist.
- UI theme is a personal preference rather than project state: dark/light persists only through the existing cookie-preference snapshot, while `.vectura` project files continue to serialize document colors and pens without carrying a UI theme switch.
- `Noise Rack` is the product and architecture name for the universal multi-engine noise stack.
- `Universal` means every current noise-capable algorithm, not only new features and not only `wavetable`.
- `package.json` is the canonical app version source. Sync derived version surfaces with `npm run version:sync`.
- `README.md`, `plans.md`, `CHANGELOG.md`, the visible app version, and any affected in-app help/shortcut text are part of the required documentation surface for meaningful feature work.
- Layer Modifiers use explicit modifier-container layers (`containerRole = 'modifier'`) instead of overloading ordinary generator layers, so drag/drop nesting, export, and future modifier types share one tree model.
- Mirror Modifier axes are infinite reflection lines clipped only for guide drawing; multiple mirrors apply in stack order from top to bottom, and later mirrors operate on already-mirrored geometry.
- Mirror guide visibility/locking is editor-only state; dashed guides, triangles, and rotate handles never export, but mirrored child geometry does.
- Masking now follows an Illustrator-style parent-owned model: the visible parent layer is the mask, all descendants are clipped recursively, and the legacy source-layer mask workflow is retired rather than migrated.
- Mask parents can optionally hide their own artwork while still contributing silhouette clipping to descendants and export clip paths.
- `sourcePaths` are reserved for manual `expanded` geometry; generator-backed layers must always regenerate from their algorithm when the layer type changes.
- Live mask preview is editor-only: it never mutates layer geometry or export data, and it uses the active mask parent’s temporary transformed silhouette only while the drag is in progress.
- In `Rings`, `Top Down` means a universal world-space XY field beneath the artwork; `Concentric` means seam-corrected path-space sampling around each full ring loop; `Orbit Field` preserves the legacy ring-local orbital sampler.
- Live masking is non-destructive by default. Parent masks affect only descendants at display/export time; checked `Remove Hidden Geometry` trims hidden export geometry destructively while unchecked export preserves hidden source paths with SVG clip paths.
- `Remove Hidden Geometry` is export-only and defaults to on: checked exports physically trim hidden geometry to the current visible frame, unchecked exports preserve hidden source paths and recreate visibility with SVG clip paths.
