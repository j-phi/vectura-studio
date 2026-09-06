STATUS: DONE/FU

# W-30 — shadow-receive direction for non-directional lights

Lane: handoff-c
Worktree: `.claude/worktrees/handoff-c` (branch `3d-scene/handoff-c`)
Base sha: `8e9b0991` (Unit D phase-align) → new sha: see commit below
Files touched: `src/core/scene3d/shadows.js`, `tests/unit/scene3d-shadow-footprint-direction.test.js` (new),
`scripts/w30-footprint-direction-evidence.js` (new, bespoke evidence generator)
Files explicitly NOT touched (per brief): `params.js`, `hlr.js`, `surface-fill*.js`, `mappers.js`, `scene3d.js`.

## Finding recap

With `shadow.shadowReceiveOnObjects` ON, the flat-face shadow-RECEIVE footprint
(`scene3d.js`'s `buildFaceFootprint`, built on `Shadows.projectAlongDirToPlane` +
`Shadows.convexHull`) only ever had a **parallel** projector available, driven by
`Regions.Lighting.lightWorldDir(light)` — which reads `light.azimuth`/`light.elevation`
**unconditionally**, regardless of `light.type`. A point/spot/area light carries
`position` instead of azimuth/elevation, so `lightWorldDir` silently falls back to its
own default (135°/45°): the receive-shadow footprint landed in a direction with no
relationship to where the light actually sat — while the **ground**-shadow path
(`Shadows.build()`, same file) already gets this right via `projectShadowVertexPositional`
(a perspective projection from the light's own `position`).

## What was implemented (shadows.js only)

Two new exports, additive only — no existing function body touched (diff is
`+65/-0` on `shadows.js`):

1. **`projectFromPositionToPlane(P, Lp, planeAnchor, planeNormal)`** — perspective
   analog of the existing `projectAlongDirToPlane`: the ray from a light **position**
   `Lp` through world point `P`, continued to an arbitrary plane. Parametrized as
   `Lp + t·(P−Lp)`; `t=1` is `P` itself, so a valid shadow point requires `t > 1-eps`
   (must land beyond the caster, away from the light). Mirrors the math
   `projectShadowVertexPositional` already uses for the y=0 ground plane, generalized
   exactly the way `projectAlongDirToPlane` generalizes the parallel `projectShadowVertex`.

2. **`projectLightToPlane(P, light, planeAnchor, planeNormal, fallbackDir)`** —
   light-type dispatcher mirroring `build()`'s own `positional` detection (grep
   `shadows.js` for `positional`/`isSpot`/`isArea`): a point/spot/area light with a
   real world `position` gets the perspective projector above; a directional (or any
   other/absent-position) light keeps the **parallel** `projectAlongDirToPlane` via
   the caller-supplied `fallbackDir` — byte-identical to before this fix.

Both exported on `Vectura.Scene3D.Shadows` (not added to the CommonJS `module.exports`
block, matching the existing precedent — `projectAlongDirToPlane`/`convexHull`/
`hatchRingsEvenOdd` aren't in that block either).

## Scope limit — read this before assuming production changed

**`scene3d.js`'s `buildFaceFootprint` call site is untouched** (`scene3d.js` is owned
by a different lane in this audit round — AGENT-PROTOCOL.md's serialization table).
It still calls `Shadows.projectAlongDirToPlane(world[i], lightDir, anchor, normalWorldArg)`
with `lightDir = Regions.Lighting.lightWorldDir(light)` computed once, regardless of
`light.type` — i.e. **the production bug is not fixed yet**. This unit lands the
correct, tested, reusable primitive in `shadows.js`; wiring `buildFaceFootprint` to
call `Shadows.projectLightToPlane(P, light, anchor, normal, lightDir)` instead is a
follow-up for whichever lane next owns `scene3d.js`. Filed as `W-30b` in
`docs/3d-audit/STILL-OPEN.md`. This is why STATUS is DONE/FU, not DONE.

## Tests

New file: `tests/unit/scene3d-shadow-footprint-direction.test.js` — 17 tests, all
calling `shadows.js` exports directly (module-level, not through `scene3d.js`'s
`generate()`, since that pipeline isn't wired yet):

- `Shadows — W-30 flat-face receive footprint direction (current/fixed code)` (3 tests):
  new exports exist; directional light is byte-identical to the existing parallel
  projector; a point light with no/malformed `position` falls back to the parallel
  projector (never throws/NaN).
- `Shadows — W-30 per-light-type direction fixtures` (`describe.each` × point/spot/area,
  11 tests): OLD (parallel, azimuth/elevation-blind — reproduces EXACTLY what
  `buildFaceFootprint` calls today) footprint direction is >15° off the real
  light→caster ray; NEW (`projectLightToPlane`) agrees within 5° (10° for area);
  receive-path direction agrees with an independent ground-shadow oracle for the
  SAME light within 5°; footprint sits on the far side of the caster from the light
  (point/spot only).
- `W-30 RED-proof pin (8e9b0991)` (2 tests, `makeMultiFilePreShaRuntimeOptions`
  pinning only `shadows.js` to this lane's base sha): sanity that the pin has neither
  new export; the SAME "agrees within 5°" assertion as the GREEN test, run
  unconditionally — passes trivially on current code, must fail on the pin.

### RED proof (numbers)

```
VECTURA_PRE_W30=1 npx vitest run tests/unit/scene3d-shadow-footprint-direction.test.js
```
→ 16/17 pass, 1 fails: `expected 34.48605003557483 to be less than or equal to 5`
(point light case — matches the independently-computed "OLD is WRONG" angle in the
main describe block, so this is not a vacuous or coincidental failure).

### GREEN proof

```
npx vitest run tests/unit/scene3d-shadow-footprint-direction.test.js
```
→ 17/17 pass. Measured angles (from the evidence script, same numbers the tests assert against):

| light type | OLD angle error (deg) | NEW angle error (deg) |
|---|---|---|
| point | 34.49 | 0.88 |
| spot | 36.35 | 0.68 |
| area | 34.49 | 0.88 |
| directional | n/a (byte-identical) | n/a |

### Guards (all run targeted, foreground, one file at a time)

| suite | result |
|---|---|
| `scene3d-shadow-footprint-direction.test.js` (new) | 17/17 |
| `scene3d-shadow-receive.test.js` (Unit D, incl. phase-align) | 17/17 |
| `scene3d-shadow-overlap.test.js` (Unit C) | 4/4 |
| `scene3d-hlr-spatial-index-identity.test.js` | 6/6 |
| `scene3d-shadows.test.js` (general Shadows CONTRACT L2/L4) | 18/18 |
| `scene3d-cast-shadow-zones.test.js` | 7/7 |
| `scene3d-form-shadow-limb.test.js` | 4/4 (2 pre-existing skips) |
| `scene3d-inverse-shadow.test.js` | 6/6 |
| `scene3d-shadow-anatomy.test.js` | (in combined run below) |
| `scene3d-shadow-controls.test.js` | 8/8 |
| `scene3d-shadow-cross-wave-continuity.test.js` | 23/23 |
| `scene3d-shadow-light-silhouette.test.js` | (in combined run below) |
| `scene3d-shadow-orbit.test.js` | 3/3 |
| `scene3d-shadow-tone-gradient.test.js` | 28/28 |
| `scene3d-shadow-tone-law-uniqueness.test.js` | 3/3 |
| `scene3d-shadow-tone-law.test.js` | 20/20 |
| `scene3d-shadow-zone-fragmentation.test.js` | 12/12 |

Combined run of the 12 remaining shadow-family suites: **139 passed, 2 pre-existing
skipped, 0 failed**. Total across every suite run this session: **201 tests, 0
failures**. No test was widened, re-pinned, or skipped.

## Bars changed

None. No existing test threshold, tolerance, or pinned fingerprint was modified —
this unit only adds two new exported functions and one new test file.

## Evidence

No gallery cell exercises `shadowReceiveOnObjects` with a non-directional light
(default OFF, and no cell scene uses one) — per protocol, a bespoke scene instead:
`scripts/w30-footprint-direction-evidence.js` (committed in this worktree), output
at `docs/3d-audit/fill-audit/after/W-30/` (point.png/spot.png/area.png/directional.png
+ .svg + `report.json`).

Geometry mirrors the test fixtures exactly (sphere caster at (0,40,0) r=15, wall
receiver at world x=-100 spanning y∈[0,90] z∈[-60,60]), rendered as an oblique
(cavalier) 2D diagram: light (yellow), caster + 6 rim points (white/grey), receiver
wall (drawn as its actual quad, not just a profile line), OLD footprint (red,
production/parallel-default-direction), NEW footprint (green, `projectLightToPlane`).

**LOOKED at all four PNGs, native-resolution crop taken on `point.png`** (crop
region y=380..950, the caster/ray-divergence zone):

- **point / spot / area**: the GREEN dots land visibly **on** the drawn wall quad,
  exactly where the light→caster ray naturally continues. The RED dots land well
  **below and entirely outside** the wall's own Y-extent [0,90] — for the point
  light, OLD's world footprint point is `(-100, -101.4, 100)`, ~101mm below the
  wall's bottom edge (y=0). This is a stronger finding than the angle number alone:
  the production bug doesn't just get the bearing wrong, it plots the footprint off
  the physical receiving surface entirely for this fixture.
- **directional**: only green is visible — red is drawn exactly underneath it
  (byte-identical, confirmed both by eye and by `JSON.stringify(oldFootprint) ===
  JSON.stringify(newFootprint)` → `true` in `report.json`).

`report.json` GH-1 fields: `oldAngleDegFromExpected` / `newAngleDegFromExpected` per
light type, `byteIdenticalOldVsNew: true` for the directional (byte-identical) cell,
`null` for the three non-directional cells (angle-based measurement, not a byte
comparison — there is no "before" byte-identical baseline for those since the bug
was never byte-identical to a correct answer).

## Commit

Committed in the worktree: `src/core/scene3d/shadows.js`,
`tests/unit/scene3d-shadow-footprint-direction.test.js`,
`scripts/w30-footprint-direction-evidence.js` only. No `git push`.

## Follow-up (filed as W-30b in STILL-OPEN.md)

Wire `scene3d.js`'s `buildFaceFootprint` (~line 754-778) to call
`Shadows.projectLightToPlane(P, light, anchor, normalWorldArg, lightDir)` instead of
always calling `Shadows.projectAlongDirToPlane(P, lightDir, anchor, normalWorldArg)`
— the one-line site the `lightDir` variable is already computed at (~line 652-653).
Needs a `scene3d.js`-owning lane; add an RGR test through the full `generate()`
pipeline (byte-identical for directional stays free, point/spot/area footprint
geometry changes) once that lane is free. Optional nice-to-have noted but not
implemented: true multi-sample soft footprint for area lights (mirroring
`regions.js`'s `areaSampleOffset` Fibonacci-sphere sampling) — the ground-shadow
path itself doesn't do this either (area is treated identically to point/spot for
direction, single position), so this fix matches existing precedent rather than
inventing new behavior.
