STATUS: DONE

# W-35 — sliceEndOverlap (end overlap / edge-fidelity control) — implementer report

Lane: fill-audit-d2 (`.claude/worktrees/fill-audit-d2`, port 8481).
Base sha: `6dcc308f` (W-34b) → new sha: `323e2583577c09ff46388842b2c2bf985b86fe4c`.
Not merged, not pushed.

USER product request (Jay 2026-09-06,
`docs/3d-audit/fill-audit/user-reports/15-w27c-contourslice.png`): "You can
observe some minor imperfections where line segments end, creating
stairstepping. If this is to minimize overlap to prevent bleedthrough,
perhaps having a parameter we can control for this would make the most
sense? Increasing allows for subtly more overlaps and preserves outer edge
fidelity?"

Per `docs/3d-audit/lane-reports/W-35-plan.md`: nothing today deliberately
trims contourSlice ring ends for overlap avoidance. Every open front run is
simply truncated at a FACET boundary (`scene3d.js`'s per-triangle
`front`/`back` flag) — that facet quantisation is what produces the visible
stair-step, not a trim. This unit ships the requested KNOB. It does not, and
per the plan must not, remove the quantisation itself (that is Rank 2 /
W-32 Rank 4 — Jay's call, out of scope here).

## Files touched

- `src/core/algorithms/scene3d.js` — the contourSlice pass:
  - `END_OVER_MM = clamp(finite(sp.sliceEndOverlap, 0), -2, 8) * penWidth`,
    read next to the existing `sliceTreat` line.
  - New pure, module-level `extendFrontChains(frontSegs, backSegs,
    targetMm)`, defined beside `refineSliceRing` (not inside the per-object
    closure), exposed at `Scene3D.Slices.extendFrontChains` for direct unit
    coverage (the same rationale the file already uses for
    `refineRing`/`buildSliceSegments`). At `targetMm === 0` it returns
    `G3.linkSegments(frontSegs)` UNCONDITIONALLY — the literal first line of
    the pre-W-35 `linkPlane` — so the default is byte-identical **by
    construction**.
  - The one call site (`linkPlane(g.front)` inside the front-run emission
    loop) now reads `linkFrontExtended(g.front, g.back)`, a thin wrapper:
    `extendFrontChains(front, back, smoothSurface ? END_OVER_MM : 0)`
    followed by the SAME `refineSliceRing` call `linkPlane` already applies.
    `linkPlane(g.back)` (the fullContour dashes) is untouched.
  - Gate: `smoothSurface ? END_OVER_MM : 0` — forces the param to a no-op on
    box/plane/pyramid/faceted solid (their front/back split is exact
    geometry; extending past it would draw a genuinely back-facing plane).
    **This gate was NOT in the plan's own line-by-line prototype snippet and
    I added it explicitly** after re-reading §2.1's own stated requirement
    ("Inert (byte-identical) on box / plane / pyramid / faceted solid at any
    value — assert it") — confirmed via T5.
- `src/core/scene3d/params.js` — one `case 'sliceEndOverlap': return
  clamp(finite(value, 0), -2, 8);` adjacent to `case 'sliceVisibility':`
  inside the CtS I5 group (~line 731). Confirmed disjoint from U9's
  shadow-bag hunk (`fc8b0fba`, params.js:999-1042, a different function
  `clampShadowToneLaw`/`normalizeShadow` far from this switch case) and from
  fill-audit-2/W-10d-2: `params.js` was clean (no diff, no uncommitted WIP)
  in that worktree at the time this unit started.
- `src/ui/panels/scene3d-panel.js` — (a) one descriptor appended to
  `MAPPER_CONTROLS.contourSlice` after `sliceTilt`; (b) one `slider(...)`
  call appended after the imperative Tilt slider in the per-leaf contourSlice
  block. Both regions re-read immediately before editing (three-author
  hazard) — no collision found with U5b/W-28b/W-10d-3's prior edits.
- `src/config/context-bar.js` — **NOT touched**, confirmed per the plan:
  this file carries no contourSlice controls (`grep -n slice
  src/config/context-bar.js` → 0 hits); the Style-tab surface is rendered
  generically from `MAPPER_CONTROLS` by `renderControl`, so the descriptor
  above **is** the context-bar control.
- `user-presets/` / `src/config/user-presets.js` — **NOT touched**, confirmed
  per the plan: no shipped preset uses `mapper: 'contourSlice'`.

## Tests

**New: `tests/unit/scene3d-slice-end-overlap.test.js` — 30/30.**

- T1 (9 primitives × 2 cameras, 18 cases): `md5(sliceEndOverlap absent) ===
  md5(=0) === md5(the pre-fix HEAD tree via scriptOverrides)`. `plane` @
  camera b legitimately emits 0 contourSlice runs at that tilt (all three
  variants agree at count 0 — not a regression, disclosed in the test).
- T5: box/plane/pyramid byte-identical at k = -2, 0, 8.
- T6 (params.js half): `normalizeStyle` clamps to [-2,8], passes 0/mid-range
  through, `finite()`-guards a garbage value to 0; absent key stays absent
  (the 0-resolution is `generate()`-time, proven by T1). The panel-descriptor
  half of T6 lives in the integration file (below) — it is a live-DOM/
  `mapperDefaults` contract the unit harness cannot see.
- T2/T3: **exact** (not the plan's device-space ±10%) monotone arc
  advance/trim, measured directly against `Scene3D.Slices.extendFrontChains`
  on a controlled synthetic 64-point circle split into a front/back half.
  This is a **deliberate, disclosed deviation** from the plan's own
  generate()-level instrument — see "What I changed from the plan" below.
- T7 (mutation guard): `extendFrontChains`'s body text-mutated
  (`targetMm = 0` forced unconditionally) via `scriptOverrides`; the
  resulting advance at k=8 is < 1e-6mm against an expected 4.8mm — fails by
  ≥ 1,000,000x, comfortably clearing the plan's ≥ 5x bar.
- T4 (edge fidelity, sphere + ellipsoid, k ∈ {-2,-1,1,2,4,8}): every emitted
  point's `|F|/|∇F|` deviation from the analytic implicit surface never
  exceeds the k=0 baseline + 0.01mm — driven directly against
  `Scene3D.Slices.{inverseObjectTransform,localPlaneNormal,
  analyticProjectLocal}`, mirroring `scene3d-contour-slice.test.js`'s own
  W-27c section exactly (same technique, not a re-derivation).

**New test in `tests/integration/scene3d-panel.test.js` (36 → 37):**
mapper-switch-to-Slices seeds `sliceEndOverlap: 0` in `styleTable`, mounts
`input.ctrl-slider[aria-label="Slice end overlap"]` with min=-2/max=8/
step=0.25/value=0, and a drag writes the value through.

**Guards, unmodified, all still green:**
`scene3d-contour-slice.test.js` 57/57, `scene3d-contour-slice-corners.test.js`
25/25, `scene3d-mappers.test.js` 32/32, `scene3d-hlr.test.js` 11/11,
`scene3d-curves.test.js` 13/13, `scene3d-tone-law-params.test.js` 13/13
(params/normalize coverage — no dedicated `scene3d-params.test.js` exists).
All run foreground, one file at a time.

## Bars changed

**None.** Every fingerprint/count in the six guard files above is untouched
and passes at its original count (57/25/32/11/13/13). No numeric threshold
or tolerance in an EXISTING test was widened, narrowed, or re-pinned.

## What I changed from the plan (disclosed)

1. **Added the `smoothSurface` gate explicitly** at the call site
   (`extendFrontChains(front, back, smoothSurface ? END_OVER_MM : 0)`). The
   plan's prototype section didn't show this line, but its own §2.1
   explicitly requires faceted inertness; I verified with an early smoke
   test that WITHOUT this gate box/plane/pyramid were NOT inert at k≠0, then
   added the gate and re-verified (T5 now passes exactly because of it).
   **CORRECTION (W-35 review follow-up (b), applied at integration r2,
   2026-09-10): `plane` is inert WITHOUT the gate too.** A plane has no
   front/back chain split to extend in the first place, so it never
   demonstrates the gate's effect. Only **box and pyramid** actually support
   the claim above. T5 still legitimately covers all three (all three ARE
   inert with the gate); what is wrong is citing `plane` as evidence that the
   gate is what makes them inert.
2. **T2/T3 measured against `Scene3D.Slices.extendFrontChains` directly on a
   synthetic ring, not through `generate()`'s projected device-space
   output**, and the resulting tolerance is EXACT (`toBeCloseTo(…, 6)`), not
   the plan's ±10%. Reason (empirically confirmed before writing the test):
   measuring total open-run length through the full `generate()` pipeline
   conflates the extension itself with the PRE-EXISTING, unrelated
   W-27c-0a crowd-cull's per-ring survive/drop decision, which changes
   non-monotonically as extension changes each ring's shape near
   poles/saddles (measured directly: sphere's open-run COUNT is 22/23/22/23
   at k=0/1/2/4 before the aggregate length even enters into it). The
   plan's own §3 already forbids a total-ink oracle for exactly this
   reason ("Do not write an oracle on total ink … torus ink is NOT
   monotone"); the same confound reaches an aggregate length oracle on
   sphere too. Testing the exposed pure function in isolation gives a
   STRICTLY STRONGER (exact, not tolerance-based) proof of the one thing
   this unit actually changes, and is permitted by the plan's stop
   condition 4 ("Re-scope T2 … if it fails there, ship the measurement and
   stop"). T4's edge-fidelity check and the gallery/bespoke evidence still
   exercise the full `generate()` pipeline, so the mechanism is verified
   end-to-end even though T2/T3's precision bar does not live there.
3. **`extendFrontChains`'s pure helpers were factored out of the per-object
   closure into module scope** (not mentioned in the plan's file-touch list,
   which described "the extend/trim helper next to `linkPlane`"). This was
   necessary to expose them for T2/T3/T4/T7's direct testing without
   re-deriving the mechanism in test code (the same principle
   `buildSliceSegments`/`refineSliceRing`/`analyticProjectLocal` are already
   exposed for). The per-pass `linkFrontExtended` wrapper is now 4 lines
   (was ~140 inline) — net simpler, not a scope creep.

## Evidence

`docs/3d-audit/fill-audit/after/W-35/` (report.json has full numbers):

- **Gallery re-shoot** (`scripts/audit/scene3d-capture.js --tier A --root
  .claude/worktrees/fill-audit-d2 --port 8481 --only
  '(sphere|ellipsoid|torus|cone|cylinder|capsule)__contourSlice' --out
  docs/3d-audit/fill-audit/after/W-35`, run from MAIN): 42 cells captured.
  All 12 cells that also exist in `after/W-34/` are **byte-identical**
  (pathCount/totalPoints/inkMm) — confirms the no-op default at the full
  app/gallery pipeline level, not only inside the unit-test harness.
- **Bespoke sweep** (new `scripts/audit/w35-end-overlap-sweep.js`,
  sphere/ellipsoid/torus × k ∈ {-2,0,4,8}, full-resolution PNGs +
  `sweep-report.json`, `docs/3d-audit/fill-audit/after/W-35/bespoke/`):
  sphere/ellipsoid ink and open-run count rise with k (no self-occlusion to
  re-clip it away: sphere ink 1220.0 → 1243.8 → 1300.2 → 1355.2mm at
  k=-2/0/4/8). torus ink is deliberately NOT monotone (1098.6 → 1053.3 →
  1096.2mm at k=0/4/8, open runs 106 → 104 → 103) — the plan's own disclosed
  limitation: at large k on a strongly self-occluding body the extension is
  re-clipped by the shared HLR clipper, and this IS the safety valve (it
  prevents drawing through real occlusion), not a bug.
- **LOOKED at the images** (native-resolution crops, PIL, 3× nearest
  upscale, `crop_sphere_k{-2,0,8}.png`): at k=0 the sphere's outermost ring
  on the left limb runs short of its neighbours for a few pixels near the
  crop's mid-height — a small step/notch, matching Jay's screenshot. At k=8
  the same region shows the ring running continuously alongside its
  neighbours through the crop — the extension is visibly hugging the
  silhouette further, not just numerically. k=-2 vs k=0 is visually subtle
  (0.6mm total retraction at this zoom) but the unit-test measurement
  confirms it is real and monotone. torus's full-frame k=0 render was
  inspected and is healthy (no artefacts, no dropped rings visible at this
  zoom).
- **Live app verification** (Playwright — chrome-devtools MCP was owned by
  another live session per `CLAUDE.md`'s shared-browser rule):
  `style-tab-end-overlap.png` shows the Style tab, sphere/contourSlice
  object, "End overlap" slider rendered directly under Tilt with value
  3.50 (set programmatically to prove read/write), correct
  min/max/step. Simulated `.vectura` save/open cycle (JSON round-trip
  through the actual layer-params shape + `Params.normalizeStyleTable`, the
  same normalization a real load applies) preserves `sliceEndOverlap: 6.25`
  unchanged. One-undo-per-gesture confirmed architecturally, not as a new
  code path — the slider is wired with the SAME shared `liveSlider(...)`
  helper `sliceRotate`/`sliceTilt` already use (one `pushHist()` per drag,
  guarded by an `active` flag). A Slices → hatch → Slices mapper detour
  resets the value to 0 (NOT preserved) — this matches the EXISTING,
  pre-W-35 behaviour of `sliceCount`/`sliceRotate`/`sliceTilt` (none of the
  four contourSlice-only keys are in `persistentStyleKeys()`), so it is
  consistent precedent, not a W-35-introduced regression. Not called out as
  a defect; noted here for completeness per §4.4's live-app checklist.

## Docs contract (NOT edited in this worktree — orchestrator lands these)

| doc | exact line |
|---|---|
| `CHANGELOG.md` | "Slices: new **End overlap** control (−2…+8 pen widths, default 0 — no change to existing scenes)." |
| `README.md` (3D scene feature panel) | "Slices gains **End overlap** — how far each depth-slice ring is carried past (or pulled back from) the silhouette, in pen widths; default 0 = unchanged." |
| in-app help guide | Same sentence + trade-off: "increase for a continuous outer edge; decrease to keep wet ink off the outline." No shortcut added — shortcut list untouched. |
| `plans.md` | Mark the W-35 item done; note the stair-step **itself** remains open (Rank 2 / W-32 Rank 4 — Jay's decision, not this unit's). |
| `docs/3d-audit/lane-reports/LEDGER.md` + `STILL-OPEN.md` | Row 15 / the W-35 entry: landing sha `323e2583577c09ff46388842b2c2bf985b86fe4c`, finding = facet quantisation not an overlap-avoidance trim, knob shipped, ladder itself still open. |
| version | Patch bump via the commit hook at merge time — **not bumped by hand in this worktree** (a worktree cannot bump). |

## Open follow-ups (not this unit, filed per the plan)

- **W-35b** (rulings/surface-fill.js knob) — fill-audit-a2's, blocked on
  W-32's Rank decision. Not touched here.
- **Rank 2** (sub-facet terminator refinement) / **W-32 Rank 4** (true
  silhouette outline) — the actual removal of the stair-step. Both are
  look-changes to every contourSlice cell and are explicitly Jay's call
  per the plan's §1.5/§4.2/§4.3 stop condition 7. Not attempted here.
