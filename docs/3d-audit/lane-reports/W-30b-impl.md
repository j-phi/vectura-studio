STATUS: DONE

# W-30b — wire `buildFaceFootprint` to the W-30 per-light-type projector

Lane: fill-collapse-2
Worktree: `.claude/worktrees/fill-collapse-2` (branch `3d-scene/fill-collapse-2`), port 8482
Base sha: `1e681432` (U5b-2/3 checkpoint) → new sha: `57aa71b2`
Files touched: `src/core/algorithms/scene3d.js` (one call site), `tests/unit/scene3d-shadow-footprint-wiring.test.js` (new), `scripts/w30b-footprint-wiring-evidence.js` (new, bespoke evidence generator)
Files explicitly NOT touched: `src/core/scene3d/shadows.js` (handoff-c2's file — the projector itself was already correct/tested from W-30; nothing there needed to change), `params.js`, `hlr.js`, `surface-fill*.js`, `mappers.js`.

## What this unit is

W-30 (handoff-c, `0d405577`) shipped `Shadows.projectLightToPlane` — a
light-type dispatcher that gives a point/spot/area light a true PERSPECTIVE
shadow-receive footprint from its own world position, instead of the
parallel/default-direction projector `buildFaceFootprint` always used. That
projector was correct, tested (17/17 in `scene3d-shadow-footprint-direction.
test.js`) and **additive with zero existing lines touched** — but nothing in
production called it. `buildFaceFootprint` (`src/core/algorithms/scene3d.js`)
still unconditionally called `Shadows.projectAlongDirToPlane(P, lightDir,
anchor, normalWorldArg)`, so a point/spot/area light with
`shadowReceiveOnObjects` ON rendered **identically** before and after W-30
landed. This unit is the one-line wiring that makes it reachable.

## The fix

`src/core/algorithms/scene3d.js`, inside `buildFaceFootprint` (~1406-1433):

```js
const projectFootprintPoint = typeof Shadows.projectLightToPlane === 'function'
  ? (P) => Shadows.projectLightToPlane(P, light, anchor, normalWorldArg, lightDir)
  : (P) => Shadows.projectAlongDirToPlane(P, lightDir, anchor, normalWorldArg);
```
...used in place of the old unconditional `Shadows.projectAlongDirToPlane(...)`
call in the per-vertex projection loop. `light` and `lightDir` were already in
scope (computed once per `generate()` call, ~1303-1305). The fallback branch
(defensive only — `projectLightToPlane` is always present on this tree) keeps
the exact old behavior if the export were ever missing.

`Shadows.projectLightToPlane` dispatches on `light.type`/`light.position`: a
point/spot/area light with a real world position gets the perspective
projector (`projectFromPositionToPlane`, from the light's own position); a
directional (or any other) light falls straight through to the **same**
`projectAlongDirToPlane(P, lightDir, ...)` call this used before —
byte-identical for every directional-light scene, which is the whole reason
W-30 was safe to ship additively.

Diff is `+13/-1` on `scene3d.js` (12 lines of comment, 1 line of dispatch,
1 line changed in the loop body).

## Tests (RGR)

New file: `tests/unit/scene3d-shadow-footprint-wiring.test.js` — 5 tests, all
through the **full `AlgorithmRegistry.scene3d.generate()` pipeline** (not
`shadows.js` module-level, which `scene3d-shadow-footprint-direction.test.js`
already covers — this proves the production call site, not just the
primitive).

Rig: a large flat PLANE receiver object (sx=sz=1000, half-extent 500 — not
the special `p.ground`; `buildFaceFootprint`/`shadowReceiveOnObjects` is the
per-OBJECT flat-face receive path) + a BOX caster at `(60, 20, 0)`, size 40
(world y in [0,40], resting exactly on the receiver). A POINT light at
`(-300, 150, 0)` (intensity 4, range 2000 — turned up so the unshadowed
baseline clears the `[0.3]` tone threshold cleanly, since geometry is
position-only and unaffected by either knob).

- **Precondition test** (no render, pure geometry): using
  `Shadows.projectAlongDirToPlane`/`projectLightToPlane`/`convexHull`
  directly on the caster's 8 world corners, proves `PROBE = {x:140, z:0}` is
  **outside** the OLD (parallel/default-direction) footprint hull — via a
  bounding-box argument (OLD hull's max x is 80, PROBE.x=140 > 80, and a
  convex hull can never exceed its own point set's bounding box, so no
  polygon math is even needed) — and **inside** the NEW (perspective) hull,
  via ray-casting point-in-polygon against the real hull `Shadows.
  convexHull` returns.
- **Point-light ink-density test**: runs the full pipeline, measures ink
  density (mm of line length per unit area, the same `inkInWindow`/
  `clippedLenInBox` helpers `scene3d-shadow-receive.test.js`'s Unit-D-judge
  suite already uses for this exact mechanism) at PROBE vs a CONTROL point
  far outside both hulls. **RED (pinned `1e681432`, `VECTURA_PRE_W30B=1`):
  ratio = 1.0107** (fails the `>= 1.5` bar — old code shows no
  differentiation, PROBE reads as plain unshadowed baseline). **GREEN
  (current tree): ratio = 3.03.**
- **Directional-light sanity test**: same pipeline, SUN light, asserts
  receiver fills still emit (>0) — the parallel path is exercised and
  produces output either way.
- **Directional-light byte-identity guard** (separate `describe`, two
  runtimes — current tree + a `git show 1e681432:scene3d.js` override):
  `md5(JSON.stringify(receiverFills))` identical old vs new. Passes
  unconditionally (this is the "byte-identical for directional" contract,
  not a RED/GREEN pair).
- **RED-proof pin** (`describe` gated by `VECTURA_PRE_W30B=1`, same
  assertion as the point-light ink-density test): passes trivially without
  the env var (current/fixed tree), fails with it set (pinned `1e681432`) —
  the standard RGR-pin convention this codebase's other W-30-family tests
  already use (mirrors `scene3d-shadow-footprint-direction.test.js`'s own
  `W-30 RED-proof pin` block).

### RED proof (numbers)

```
VECTURA_PRE_W30B=1 npx vitest run tests/unit/scene3d-shadow-footprint-wiring.test.js
```
→ 4/5 pass, 1 fails: `expected 1.010740775350905 to be greater than or equal to 1.5`
(the RED-proof pin block's point-light ink-density assertion — the geometric
precondition, directional sanity, and byte-identity guard all pass regardless,
since none of them depend on the fix).

### GREEN proof

```
npx vitest run tests/unit/scene3d-shadow-footprint-wiring.test.js
```
→ 5/5 pass. Point-light probe/control ratio: **3.026957853723375** (measured
via a temporary `console.log`, removed before commit — the number is recorded
here and in the commit body, not left in the test file).

### Guards (all run targeted, foreground, one file at a time)

| suite | result |
|---|---|
| `scene3d-shadow-footprint-wiring.test.js` (new) | 5/5 |
| `scene3d-shadow-footprint-direction.test.js` (W-30's own) | 17/17 |
| `scene3d-shadow-receive.test.js` (Unit D) | 17/17 |
| `scene3d-shadow-overlap.test.js` (Unit C) | 4/4 |
| `scene3d-hlr-spatial-index-identity.test.js` | 6/6 |
| `scene3d-shadows.test.js` (general Shadows CONTRACT L2/L4) | 18/18 |

Combined targeted run of all six files together: **67/67 passed, 0 failed.**

Additionally ran the tone-law-collapse **U0 byte-identity sweep** (all 48
tone laws, directional-light scenes, `scene3d.js`'s heaviest single existing
consumer) targeted via `-t`:
```
npx vitest run tests/unit/scene3d-tone-law-collapse.test.js -t "byte-identity sweep: all 48 laws"
```
→ 1/1 pass (265s wall — genuinely measured work against 48 laws, matching
U0's own documented timings; the printed `[FillBoolean] polygon union failed
on degenerate geometry` warnings are pre-existing/benign, per `U0-impl.md`).
No collateral regression on the directional-light path from this change.

## Bars changed

None. No existing test threshold, tolerance, or pinned fingerprint was
modified — this unit is a one-line production call-site swap plus one new
test file.

## Evidence

No gallery cell exercises `shadowReceiveOnObjects` with a non-directional
light (default OFF, no manifest scene uses one) — per protocol, a bespoke
scene instead, captured with a **real before/after** in the actual app:
`scripts/w30b-footprint-wiring-evidence.js` (committed in this worktree)
starts two dev servers — this worktree on port 8482 (the fix) and a
`git archive 1e681432` scratch export on a throwaway port (the pre-fix tree,
the same scratch-export convention AGENT-PROTOCOL.md prescribes for
reviewers) — builds an identical scene3d layer programmatically in each via
`window.app.engine`, and kills both servers on exit. Output at
`docs/3d-audit/fill-audit/after/W-30b/` (12 PNGs + `report.json`).

Rig: sphere caster (radius 20, resting on the receiver) + a 500x500 flat
plane receiver (not `p.ground` — same reasoning as the unit test), point
light and spot light both at `(-300, 150, 0)`, `shadowReceiveOnObjects: true`.
A fixed world-space window (not an ink-bbox auto-fit, which trivially spans
the WHOLE receiver face since the "outside" hatch pass covers it uniformly
by design — that auto-fit was tried first and shrank the caster to a speck)
frames the caster + footprint region identically across every shot for a
fair comparison.

**LOOKED at all twelve PNGs, both full-frame and native-resolution crops:**

- **`point-before-full.png` / `point-before-crop.png`** (pre-fix, pinned
  `1e681432`): uniform diagonal hatch runs straight through/behind the
  sphere with **no distinct shadow patch anywhere near it** — the parallel/
  default-direction projector puts the footprint nowhere visible in this
  frame. Exactly the bug: a point light's receive-shadow footprint has no
  relationship to where the light actually is.
- **`point-after-full.png` / `point-after-crop.png`** (fixed): a clearly
  visible cluster of shorter, tighter-packed diagonal segments (denser
  hatch — the footprint's own "inside" pass) appears immediately to the
  lower-right of the sphere, on the far side from the light at
  `(-300, 150, 0)` — exactly where the true perspective shadow should fall.
- **`spot-after-full.png`**: visually identical to `point-after-full.png`
  (same light position) — confirms the spot branch of `projectLightToPlane`
  dispatches through the same positional path as point.
- **`directional-fixed-full.png` / `directional-pre-full.png`**: both show
  the SAME elongated shadow patch to the lower-left of the sphere (matching
  azimuth 90°/elevation 25°) — this path was never broken. The two PNGs are
  **byte-for-byte identical** (`md5`, both full and crop — see
  `report.json`'s `pngMd5` block), the strongest possible confirmation of
  the "directional stays free" claim, independent of the unit test's own
  path-data md5.

`report.json` carries per-shot `stats` (layer id, total path count, receiver
fill count, caster screen bbox), the `pngMd5` block, and a `looked` block
with the descriptions above.

## Commit

Committed in the worktree (`57aa71b2`): `src/core/algorithms/scene3d.js`,
`tests/unit/scene3d-shadow-footprint-wiring.test.js`,
`scripts/w30b-footprint-wiring-evidence.js` only. No `git push`.

## Docs contract

This is user-visible (a point/spot/area light's shadow-receive footprint on
another object's flat face now actually follows the light, instead of being
silently wrong). Suggested `CHANGELOG.md` line (not applied — orchestrator
owns `CHANGELOG.md` per the shared-file contention rule):

> Fixed: a point, spot, or area light's shadow-receive footprint on another
> object's flat face (Shadow → Receive on Objects) now follows the light's
> real position instead of a fixed default direction. Directional lights are
> unaffected.

No in-app help text names this mechanism specifically (it's an internal
consequence of the existing "Receive on Objects" shadow toggle), so no help
guide update is needed beyond the CHANGELOG line above.

## Follow-ups (not this unit's scope)

- **W-30c** (secretary's ranking, `STILL-OPEN.md` line 217) — a broader
  `shadows.js` correctness sweep, now that this wiring makes the projector
  reachable for the first time: nobody has seen it change a real picture
  until this commit, and Unit D's area-light softening gate (loses ALL
  softening when occluded, gate sits before the N-sample loop) and
  point/spot receive integration coverage are named there. Not started here
  — out of scope for a one-line call-site swap.
- True multi-sample soft footprints for area lights (mirroring `regions.js`'s
  Fibonacci-sphere `areaSampleOffset`) remain explicitly not implemented,
  same as W-30 itself noted — the ground-shadow path treats area lights as a
  single position too, so this fix matches existing precedent.
