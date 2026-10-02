# Fill Style Review — Implementation Plan

Source: the audit reports in this folder (r1-*, r2-*, r3-*). Summary page: `fill-style-review.html`.
Raw scripts, data and screenshots: `/private/tmp/claude-501/-Users-jayphi-Documents-github-vectura-studio/48119a39-9d8e-4fac-8680-9d39db38bd0b/scratchpad/fillstyle-audit/` (r2/, r2p/, r3/, r3m/).

Integration branch: `3d-scene/fill-review` (worktree `../vectura-fill-review`). Each unit branches from it and is merged back by the orchestrator. Do not push.

## Jay's decisions (2026-10-02)

1. **Shadow looks:** keep as many shadow looks as possible, when they are materially different. A merge must never remove a materially different shadow texture. Restore the 17 shadow textures that earlier folds made unreachable, where they are materially different (hash/visual check), and give the shadow Fill Style picker the sub-controls it needs to reach them.
2. **Seed:** wire the Seed field (and RANDOMIZE) in the algorithm side panel to every random/hash site in scene3d fills. Saved documents must keep their look: a load-time migration marks legacy layers so they keep the legacy hash; new layers and any explicit Seed edit use the seed.
3. **Ribbon perf fix:** output change accepted. Refresh goldens deliberately and say so in the commit.

## Units and phases

Phases are serialized; units inside one phase touch disjoint files and may run in parallel.

### Phase 1 (parallel)
- **U1 Pipeline perf** — B1 (draft flag to scene groups, engine.js:3338-3344 / 2717), F5 (law-preserving draft tier: ribbons as weighted centrelines; mono laws get a reduced-density draft), B2 (object3d.js:21 isConsumed), B3 (defer + cancel the release render), export/recompose cache (NEW-3, 22 call sites). Files: engine.js, object3d.js, renderer.js, src/core/algorithms/scene3d.js.
- **U2 Kernel perf** — ribbon distance-field erode + rotated PenFill grid (pen-fill.js, surface-fill.js ribbonize/erode region only), mono streamline grid + precomputed rotator (surface-fill-mono.js tooClose, geometry3d.js), turingStripe allocations, ground-shadow scanline/grid (shadows.js). Files: pen-fill.js, geometry3d.js, surface-fill-mono.js, shadows.js, surface-fill.js (ribbon section only).
- **U3 Panel reach** — Object 3D panel parity with the scene Style editor (cross angle, angle ref, link fill, dot, line type, wobble), expose hidden-but-live engine params (wobbleScale, overstroke, spiralPitch, contourStep, shadowToneDepth, toneQuantLevels, xrayHiddenEdges, mark shapes, curvature-field hatch), Density cap 500, gate/hide controls that do nothing in a context (Triple hatch under non-Ladder, Tone Bands/Coverage off Ladder, Specular on curved, highlight Bands), fix wrong "no effect" greying on Spiral/Stipple, Assign pen on Object 3D rows. Files: src/ui/panels/scene3d-panel.js, ctxbar files, layers panel, params.js UI metadata only.

### Phase 2 (serial, after phase 1 merges)
- **U4 Engine defects + seed + Stroke Fill** — Stroke Fill on tree objects (scene3d.js:4630), seed wiring (decision 2), mono crosshatch duplicate pass (mono:2956), mono Density/Angle inert, mono Contour == Hatch, fieldMetric drops sigmoid, rungMode perceptual regression, turingStripe alignment ×0.0, curved stipple ignores Jitter, penCross / mkDotScreen ignore existing keys, three-pen tier tag lost (scene3d.js:4845).
- **U5 Merges** — M1–M6, M9, R3-1…R3-9, NEW-2/3, NEW-6/7 (one key per concept, cross angles from one source), plus shadow-look restoration (decision 1). Every merge ships a load migration (old id → new id + params) with a byte-identity test.

### Phase 3
- **U6 New artistic controls + pen routing** — tone gamma/contrast, wave wavelength + crest phase, nib angle/contrast, taper length/tip width/highlight softness, turingStripe alignment/maturity/scale, light-relative hatch angle, depth fade, tone band / pen tier → real pens, maze/voronoi chaining at emit. Defaults reproduce today's output.

## Rules for every unit
- Read AGENTS.md and CLAUDE.md first. RGR: a test that fails before and passes after.
- Run the Testing Matrix suites for the change class. Live-verify in the running app with Playwright on your own port (never the chrome-devtools MCP).
- Commit on your unit branch. Do not push, merge, or touch main.
