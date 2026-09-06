STATUS: DONE

# Unit D polish — phase-align the inside-footprint hatch family with the outside family

**Lane:** handoff-c
**Worktree:** `.claude/worktrees/handoff-c` (branch `3d-scene/handoff-c`)
**Base sha:** `d86cbf8d` (A3 landing) → **new sha:** `8e9b0991`
**Files touched:** `src/core/scene3d/shadows.js`, `tests/unit/scene3d-shadow-receive.test.js`, `scripts/unitd-phase-evidence.js` (new). `hlr.js` was not needed. `scene3d.js`/`mappers.js`/`params.js` were not touched (per lane boundary).

## Background

Unit D (abeacdff…19b48789) lets shadows land on other objects behind flag
`shadow.shadowReceiveOnObjects` (default OFF). On a flat receiver face, the
shadow footprint is drawn by clipping a "outside" hatch pass (the whole
face minus the footprint hole) and a separate "inside" hatch pass per
footprint polygon, both via `Shadows.hatchRingsEvenOdd`. The judge measured
the inside pass genuinely denser (1.45x) but reading as a patch of broken
dashes rather than a continuous denser texture, because the inside call's
marching-scan origin came from its own (small) ring's bounding box —
unrelated to the outside call's origin, even though both share the same
angle.

## Root cause

`hatchRingsEvenOdd`'s numeric-spacing branch computes its scan offsets as
`pMin + i*sp`, where `pMin` is the perpendicular-axis minimum of whatever
`rings` array THIS call received. The outside call receives
`outsideRings = [face].concat(footprintPolys)` (a big ring set); each
inside call later receives `[fp]` alone (one small ring) — a completely
different bounding box, hence a different, effectively arbitrary phase.
Measured on the two-object regression fixture (40mm box over a 320mm
plane, sun az90/el25, hatch/ladder, fillDensity 80/fillAngle 20): outside
pitch 8.7228 mm, inside pitch (pre-fix) 3.4440 mm, worst phase offset
1.682 mm = **0.1929x** the outside pitch (bar ≤0.05x).

## Fix

`src/core/scene3d/shadows.js` only. A module-level `WeakMap`
(`outerRingGridMemo`) keyed by ring **object identity** (never by value):
whenever `hatchRingsEvenOdd` is called with `rings.length > 1`, it records
`{angleDeg, spacing, anchor: pMin}` against every ring object in that call.
`scene3d.js`'s `footprintPolys` elements are literally the SAME array
objects passed both as holes of the outside call (via `.concat`) and later
alone as `[fp]` for each inside call — so when a later `rings.length === 1`
call recognizes its ring (same object, same angle), it:
1. picks `n = round(outerSpacing / thisSpacing)` (clamped ≥1),
2. sets `step = outerSpacing / n` (an exact integer submultiple),
3. continues the scan from the OUTSIDE call's own raw `anchor`, not its
   own ring's bounding box.

Every Nth inside ruling then lands exactly on an outside ruling's own
continuation; the rest are exact midlines. The original (non-memo) branch
is untouched byte-for-byte, so every other caller/scene is unaffected.

**Safety of the mechanism:** grepped every `hatchRingsEvenOdd(` call in
`shadows.js` — `[fp]` (a literal single-element ring array) is built
*nowhere else* in the codebase against this export, so no other call
site's ring can ever collide with a memo entry by accident. And the whole
branch is unreachable when the flag is off: `buildFaceFootprint`
(scene3d.js) returns `null` whenever `shadowReceiveOn` is false, so
`footprintPolys` is always `null`, the footprint-split code path (and
therefore the only site that ever calls `hatchRingsEvenOdd` with
`rings.length > 1` for this feature) never runs, and the memo is never
populated.

## RGR proof

- **RED** (shadows.js pinned to `d86cbf8d` via
  `VECTURA_PRE_UNITD_PHASE=1 npx vitest run tests/unit/scene3d-shadow-receive.test.js -t "Unit D polish"`):
  `expected 0.19288502900715768 to be less than or equal to 0.05` — the new
  RED-proof test fails as designed, reproducing the measured bug exactly.
- **GREEN** (current fixed code, no env var): 17/17 in
  `tests/unit/scene3d-shadow-receive.test.js`, including the new test
  `Unit D polish — inside-footprint rulings are phase-locked to the outside
  family (same angle, same phase, >=1.4x denser)`: worst phase ratio
  `9.77e-15` (≈0), density ratio 3.0x (bar ≥1.4x), angle mismatch 0.
- **Guards, one at a time, all pass:**
  - `tests/unit/scene3d-shadow-receive.test.js` — 17/17 (every Unit D test)
  - `tests/unit/scene3d-shadow-overlap.test.js` — 4/4 (Unit C)
  - `tests/unit/scene3d-hlr-spatial-index-identity.test.js` — 6/6
  - `tests/unit/scene3d-shadows.test.js` — 18/18
  - `tests/integration/scene3d-fill-style-picker.test.js` — 126/126
  - 17 more shadow/tone-law unit files (`scene3d-cast-shadow-zones`,
    `scene3d-faceted-tone-law`, `scene3d-form-shadow-limb`,
    `scene3d-inverse-shadow`, `scene3d-shadow-anatomy`,
    `scene3d-shadow-controls`, `scene3d-shadow-cross-wave-continuity`,
    `scene3d-shadow-light-silhouette`, `scene3d-shadow-orbit`,
    `scene3d-shadow-tone-gradient`, `scene3d-shadow-tone-law-uniqueness`,
    `scene3d-shadow-tone-law`, `scene3d-shadow-zone-fragmentation`,
    `scene3d-tone-law-dispatch`, `scene3d-tone-law-params`,
    `scene3d-tone-law-plumbing`, `scene3d-tone-laws-config`) — 190/192
    passed, 2 pre-existing skips, 0 failures.
  - Flag-OFF byte-identity: argued structurally (see "Safety" above,
    `buildFaceFootprint` gate) and confirmed empirically by the byte-identity
    guard (`scene3d-hlr-spatial-index-identity`) and the full 190/192-test
    shadow/tone-law sweep being unaffected. No gallery cell exercises
    `shadowReceiveOnObjects` at all (it's a scene-level flag, off in every
    cell), so there is nothing to md5 there — the gallery was NOT rebuilt
    (per the 2026-09-05 process ruling that only the orchestrator rebuilds it).

## Evidence

`docs/3d-audit/fill-audit/after/UnitD-phase/` — a bespoke two-object scene
(no gallery cell reaches this flag), built via the new
`scripts/unitd-phase-evidence.js`, which runs the REAL production
`Vectura.AlgorithmRegistry.scene3d.generate` (loaded the same way the unit
tests do, via `tests/helpers/load-vectura-runtime` — the exact function
`engine.computeAllDisplayGeometry` calls, not a re-derivation), swaps
`shadows.js` for the pinned pre-fix content at `d86cbf8d` to get a genuine
"before", then restores the fixed file unconditionally (verified on disk
after every run).

A real-browser canvas screenshot (crop-then-upscale) was tried FIRST and
abandoned: it produced what looked like a "broken dash" patch in BOTH
before and after, which turned out to be a pure rasterization/upscale
alias — confirmed by dumping the real app's `g.scenePaths`: every receiver
fill path is a single unbroken 2-point chord in both states. The final
evidence instead renders the actual emitted paper-space paths directly as
crisp SVG (rasterized by a real Chromium page via Playwright, so no
upscale artifact).

Files, all looked at directly:
- `before-crop-mono.png` / `after-crop-mono.png` — both hatch families in
  ONE ink color (what a user actually sees). **BEFORE**: the footprint
  patch reads as a visibly uneven, clumpy scatter — some line-pairs nearly
  touching, others with a much wider gap, no consistent rhythm, clearly
  discontinuous from the surrounding rulings. **AFTER**: the same patch
  reads as a perfectly even, comb-like denser texture, continuous with the
  outside family's own rhythm — exactly the "continuous denser texture,
  not a patch of dashes" bar.
- `before-crop.png` / `after-crop.png` — diagnostic recolor (outer=white,
  inner=green) via instrumenting the already-exported
  `Shadows.hatchRingsEvenOdd` to tag each emitted line by which call
  produced it. Confirms WHY: before, green lines sit at an independent,
  effectively arbitrary pitch/phase; after, green lines are exactly 1/3
  divisions of the white grid's own raw origin.
- `before-full-mono.png` / `after-full-mono.png` — wider context (the full
  plane), confirming the crop's surroundings read sensibly and the box's
  own front-occlusion gap is unrelated to the fix.
- `capture-stats.json`, `report.json` — the numbers above plus file
  pointers and `identical_exceptions`-style notes (empty; nothing here is
  byte-identical by design since both before/after render the flag ON).

## Open follow-ups carried forward (from the Unit D handoff, unrelated to this unit)

- Area lights losing all softening when occluded, and point/spot receive
  not integration-covered (pre-existing Unit D note).
- Dense-scene perf ~4.3x with the flag ON (pre-existing Unit D note,
  unaffected by this fix — no new per-call cost beyond one WeakMap
  get/set per numeric `hatchRingsEvenOdd` call, and the memo path is a
  strict no-op unless a ring is recognized).

Nothing pushed, nothing merged. Commit `8e9b0991` is local to
`.claude/worktrees/handoff-c`.
