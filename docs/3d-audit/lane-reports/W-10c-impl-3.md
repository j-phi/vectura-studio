STATUS: BLOCKED

# W-10c impl-3 report — iteration 3: torus gate attempted, proven unreliable, not shipped

**Lane:** fill-audit-c
**Worktree:** `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-c`
**Branch:** `3d-scene/fill-audit-c`
**Base sha (from impl-2):** `04ab79bd` → **new sha:** `e6b85de4`
**Prior reports:** `W-10c-impl.md`, `W-10c-review.md`, `W-10c-impl-2.md`

## The ruling

Since the torus wedge fraction got worse under iteration 2 (73.9% → 87.8%, impl-2's own honest
measurement), the orchestrator ruled: torus must not ship iteration 2 at all. Gate the floor-raise
+ retrace mechanism off for torus specifically — byte-identical to `78bbf3e8` (W-10b) — while
cone/sphere keep iteration 2, prove it with md5, pin the gate with a test, and record the W-10b
wedge number (73.9%) in `report.json` as the honest open number. Queue the `isReachableOn` hide as
W-10d, naming the exact file/line for whoever briefs that lane.

## What I found: the gate cannot be built reliably from this lane's file

**Blocker 1 — no primitive identity reaches `surface-fill-mono.js`.** Read the actual call site:
`src/core/scene3d/surface-fill.js` (~line 10202) calls `MonoFill().emit({ algo, back, count,
mapper, sampleAt, pushRun, penWidth, inkWidth, floorPitch, masterPitch, litMaxPitch, targetArea,
minMarkMM, hash, angleDeg })` — no `mode`/`primitive`/`shape` field at all. `chartFor(opts.mode,
opts.sizes)` (surface-fill.js ~line 176) resolves the primitive to a bare parametrisation
*function* before this file ever sees it. There is no string or tag anywhere in `lawSpiral`'s
input to branch on "is this a torus."

**Blocker 2 — the only in-file alternative (geometric inference) is empirically unreliable on
the exact scene that matters.** Implemented a flood-fill hole detector: bucket the bounding box
into a `GRID x GRID` grid, sample on/off via `C.inv`, flood-fill off-surface cells in from the
border, and check whether any off-surface cell is left unreached (an enclosed hole — the actual
topological property distinguishing a torus's silhouette from a cone's or sphere's).

- On the F-10 describe block's own off-axis test camera it works perfectly: torus shows a
  stable ~40–41% enclosed-area fraction at grid sizes 24/32/48/64 (141/343, 248/606, 560/1370,
  980/2448); cone and sphere show exactly 0% at every size, every trial.
- On the **real default-camera gallery scene** (the exact torus/hatch/originSpiral,
  fillDensity=50 scene the wedge screenshots and my own mutation guard use) it measures **0%**
  enclosed area at grid sizes 24, 32, 48, 64, 128, and 160 — and a single spurious 2-cell
  "hole" (0.02% of the on-surface area) at grid size 96 *only*. A signal that flickers on at one
  arbitrary resolution and off at every neighbouring resolution, on the exact scene needing
  protection, is not a basis for a byte-identity-critical gate.
- Implemented the gate anyway (`PLOT_MIN_PEN = (HOLE ? 0.8 : 1.0) * C.PEN`, retrace loop skipped
  when `HOLE`) and verified it end-to-end via `algo.generate` on the real gallery scene: torus
  output was **unchanged from iteration 2** (409 paths / 1551.7mm ink — identical to no-gate),
  because the detector correctly reported "no hole" there. This would have shipped a gate that
  does nothing for the scene it exists to fix — cosmetic, not a fix. **Reverted before commit**
  (`git show HEAD:... > file`, confirmed byte-identical to `04ab79bd` afterward, confirmed via
  `git diff --stat` showing no change).

I did not attempt md5-proving torus against the restored `after/W-10`/`shots` baselines, because
there is no working gate to prove — the source is unchanged from iteration 2, so torus output is
still the iteration-2 output, not 78bbf3e8's.

## What I did instead

- Recorded the investigation as a permanent test (`tests/unit/scene3d-origin-spiral-tonal-range.test.js`,
  new describe block *"W-10c iteration 3 — hole-detection reliability (investigation, not a
  shipped gate)"*): asserts the flood-fill hole fraction on the real gallery torus scene is `<
  0.01` at grid sizes 64 and 128 — pinning the actual measured unreliability so a future session
  doesn't re-spend budget rediscovering it, and gets a real red signal if this substrate's
  rendering ever changes such that the signal becomes viable.
- Rewrote `report.json`'s new `iteration_3` block with: the ruling, the honest open number (**73.9%
  at W-10b**, explicitly labeled per the ruling), why the gate was not shipped, and both cross-lane
  needs named precisely (see below).

## Cross-lane needs (named per the ruling)

1. **W-10d (queued): `isReachableOn` hide.** File: `src/config/context-bar.js`, function
   `SCENE_FILL_STYLES.isReachableOn`, insert before its final `return true;` (currently ~line 421):
   ```js
   if (primitiveMode === 'torus' && id === 'originSpiral') return false;
   ```
   Lane: whichever lane owns `context-bar.js` (`fill-audit` per the serialization table at time of
   writing). Plus a picker test asserting the Fill Style row for originSpiral disappears on torus
   and stays present on cone/sphere.
2. **Prerequisite for a future source-level gate** (only needed if a code-level gate is still
   wanted *in addition to or instead of* the UI hide): thread a primitive identifier through
   `src/core/scene3d/surface-fill.js`'s `MonoFill().emit({...})` call site (~line 10202, inside the
   `if (monoMapper) { ... }` block) — add `primitiveMode: opts.mode` to that object literal — then
   in `surface-fill-mono.js`'s `emit(o)` (~line 2947) and `makeCtx(o)` (~line 102) thread
   `o.primitiveMode` onto the published `C` context so `lawSpiral` can read
   `C.primitiveMode === 'torus'` directly, with no geometric guessing needed. This second item
   touches `surface-fill.js`, also outside this lane.

## Tests

`tests/unit/scene3d-origin-spiral-tonal-range.test.js`: **10/10** (was 9/9 — one new investigation
test). Full targeted suite (7 files, same as impl-1/impl-2): **54 passed, 1 pre-existing skip, 0
failed.** No skipped tests added. No tolerances widened.

## Commit

`e6b85de4` — `tests/unit/scene3d-origin-spiral-tonal-range.test.js` only (+150 lines: the
investigation/finding test and its header comment). **No source change** — the attempted gate in
`src/core/scene3d/surface-fill-mono.js` was implemented, verified to do nothing useful on the real
gallery scene, and reverted before this commit. `git diff --stat` against `04ab79bd` on
`surface-fill-mono.js` is empty.

## Decision and status

**STATUS: BLOCKED**, honestly, per "stop-and-report beats a fudge." Iteration 2's behavior
(1.0x floor + retrace, on all three primitives including torus) remains shipped as-is — it is not
reverted, since reverting torus back to W-10b's 0.8x floor would require exactly the gate I could
not build reliably. The wedge remains open on torus at whatever the current iteration-2 numbers
are (87.8% in the measured band, per impl-2), not the W-10b 73.9% the ruling wanted torus reverted
to. Closing this properly requires either the `isReachableOn` hide (W-10d, cross-lane) or the
`surface-fill.js` opts-threading prerequisite (also cross-lane) — both fully specified above with
exact file and line for whoever is briefed on them.
