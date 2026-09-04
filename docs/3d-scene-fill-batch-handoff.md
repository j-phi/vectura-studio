# 3D Scene fill-style batch — handoff

**Branch:** `3d-scene/fs-batch` · **Version:** 1.3.87 · **Date:** 2026-08-22
**Nothing is pushed. Nothing is merged to `main` or `3d-scene/unwire-highlight`.**

Serve the branch with `python3 -m http.server` from a worktree checked out on
`3d-scene/fs-batch`. It is 40+ commits ahead of `unwire-highlight` with no
divergence, so a fast-forward is clean if you want it on your own branch.

## Test state at handoff

- `tests/integration` — **1825/1825 green** (228 files).
- `tests/unit` — green except a documented pre-existing set that predates this
  batch and belongs to a separate in-flight effort: `scene3d-tone-law-dispatch`
  (~460s, 2 fail), ~11 scene3d *tone* files, 2 in `scene3d-faceted-tone-law`,
  2 in `scene3d-hlr-spatial-index-identity`.
- Three tests that sat on a "known red" list all session turned out to be
  **stale assertions, not defects** (border-offset normalization, a blanket
  button count, roster counts). They are fixed. Be suspicious of any new
  "known red" — it hid a real camera-dependent bug for hours.

## What landed

**Fill styles.** Empirical audit of all 48 laws × every Type (1536 cells,
browser-verified) → adversarial review → independent judge. `isReachableOn`
made mapper-aware so the picker stops offering provably inert options. The
Library/Experimental disclosure was removed entirely — all laws permanently
visible, no tier gate in the UI. `onePenDown` added to the roster (9 pen-downs
vs `ladder`'s 36 — strong plotter case), excluded from shadows where it
collides with `amplitudeOnly`.

**Monoline laws.** All nine now have measured tonal response. `turingStripe`
polarity fixed (a reaction-diffusion dispersion-relation bug, not a sign flip);
`mazeFill` was genuinely flat (0.988 → 1.372); `voronoiWeb` dark end extended;
`originSpiral` was structurally flat — its dr/dφ integral averaged pitch across
the whole silhouette so per-angle tone could never surface (0.975 → 1.504).

**Shadows.** Per-law geometry so 40 offered options render distinctly (was 41
options → 5 pictures, 26 identical to `ladder`). Row self-hides when Layers or
an area light routes to the zone path, where it would be inert. Tone gradient
added (`shadowToneDepth`, default 0.75, ON) driving the flat path from the
object's own `Regions` ladder — **see Open Issues, its expression is wrong.**

**3D scene UI.** Context bar converted to all icons (704px → 497px). Helper
gizmo toggle with hit-tests gated in lockstep. Fill-angle dial. Density
end-to-end through three independent hidden floors, capped at 220 where output
measurably saturates. Border + offset controls. (i) info panel, click-pinned,
across all six Fill Style render sites. Ground in the Add Objects shelf.
Drop-to-ground computing true rotated lowest point. Scene-child leaf types
removed from the primary algorithm picker.

**Correctness.** Panel↔context-bar sync — this was **silent data loss**: the
context bar read a `styleTable` never populated for scene-tree children, so a
single-field write reverted others. Expand-into-group was **silently running
flowfield** on 3D layers via an `Algorithms[type] || Algorithms.flowfield`
fallback. X-ray back geometry now paints and plots behind front geometry.
Border offset was camera-winding dependent. Y-rotation was a wrong-axis hit
test (nearest ring, not first in `x→y→z` order). Rotation normalizes to 0–360
live, mid-drag.

**Performance.** HLR gained a uniform bucket-grid occluder index — the
quadratic is gone (clipPath ratio 7.21 → ~3.0, 10–20× faster) with settled
output proven byte-identical by SHA-256 fingerprints. The draft flag now
actually reaches the clipper (it was built 40 lines before the flag existed).

## Open issues

1. **RESOLVED — shadow gradient renders shredded.** *Was:* it chopped each
   ruling into ~6mm chunks and kept/dropped them by duty, so the far end read
   as scattered stubs, not a thinning hatch — paths rose 535 → 2174 while ink
   *fell* 16110mm → 11583mm. *Fix (`443b4800`, `3d-scene/fs-z2-shadowfrag`):*
   tone is now expressed as ruling **spacing**, not fragmentation.
   `buildGradedSpacing` returns a `spacingAt(x,y) => mm` function that
   `hatchRingsEvenOdd`'s marching scan consumes, driven by the scene tone
   ladder through `Regions.coverageToSpacing` — the same primitive the
   uniform baseline already used. Rulings stay unbroken; only the gap widens
   toward the far tip. Result: 389 paths / 11529mm ink, with path count now
   monotone *decreasing* in depth (535/487/438/389/342 at depth 0/.25/.5/.75/1)
   and median ruling length constant at 24.33mm across all depths. Draft
   frames also came out ~17% faster than the chunker. See the cautionary note
   below — the first pass on this fix covered only 1 of 3 affected mark
   classes.
2. **RESOLVED — "No Tone" does not disable the shadow gradient.** *Was:*
   `shadowToneDepth` was independent of the selected Fill Style, so picking
   "No Tone" still rendered a gradient. *Fix:* gated in `build()` on the
   **raw** `shadowBag.shadowToneLaw === 'none'`, deliberately above the
   clamp (a clamp can launder an unknown id *into* `ladder` but never *out
   of* `none`), mirroring `surface-fill.js`'s Stage-0 sentinel.

**Cautionary note — the Issue 1 fix looked complete but wasn't.** The shadow
Fill Style picker filters options by `toneLawApplies`, which knows nothing
about the private `GRADEABLE_MARK_CLASSES` the spacing fix introduced. An
audit found 9 laws were still shredding and still user-reachable: `cross`
(`penReserve`, `penCross`, `mezzoRegion`) and `wave` (`mkScribble`,
`ampSpacing`, `weaveDepth`, `interlockWeave`, `trochoidLoop`,
`amplitudeOnly`). `penCross` was byte-identical before and after the first
fix (2856 paths, median ruling 30.65 → 5.51mm); `mkScribble` ran at 8.9× the
flat baseline. Root cause: the `cross`/`wave` recipes did raw `spacing * N`
arithmetic, which yields `NaN` once `spacing` is a function — wave silently
dropped every mark. Fixed by routing cross recipes through `scaleSpacing` and
wave recipes through `numericHint(spacing)` for amplitude only, leaving pitch
to the graded scan. `GRADEABLE_MARK_CLASSES` is now `hatch`/`cross`/`wave`.
Lesson: the picker's reachability predicate and the renderer's grading set
were two independent sources of truth over the same question — a fix that
satisfied one silently missed the other.

3. **Fill Method (the big one) is barely started.** Stage 0 landed —
   `toneQuantLevels`/`toneFlowMode` genuinely drive the engine and survive
   save/load — but **no UI writes either**, so from a user's seat nothing
   changed. Everything else remains. Judge's ruling and staged plan below.
4. **Shadow fill style is inert when Layers or an area light is on.** The row
   hides itself, so it is honest, but the capability is missing. That is
   Stage 3 of the shadow plan and requires re-tuning the pinned zone criteria.
5. Smaller: no face-count cap for geodesic/goldberg (only imported meshes are
   capped, at 12000); panel↔bar sync covers only the object3d leaf and only
   style fields, not `border.*`/x-ray/transform/shadow/pen.

## Accepted trades — do not "fix" these

- **Box hatch appears to drift ~12° below Density 100** (flat above it). No
  line ever rotates; the four families sit at 78/3/169/95° at every density.
  Only the ink balance moves, because a minimum-rulings guarantee holds some
  faces at fixed spacing while others scale. Removing it cuts drift to 2.4°
  **and makes a facet render as bare paper at Density 50**. Owner chose to keep
  the guarantee. Pinned in `tests/unit/scene3d-box-density-bearing.test.js`,
  labelled ACCEPTED with the reasoning inline.
- **Curved-object angle drift is occlusion weighting, not a bug.** Every line
  points correctly; which arcs survive hidden-line clipping changes with
  density, so the visible subset reweights. Fixing it is design work inside a
  9000-line tuned file.
- **Shadows stay floor-only.** Objects never receive cast shadows from other
  objects — `shadows.js` hardcodes the receiver. Logged as a Later item in
  `plans.md` with the full seam map and a 3–5 day estimate. A per-object
  "receives shadow" toggle must NOT ship meanwhile; it would change zero paths.

## Decisions waiting on the owner

1. **Method prose sign-off** — drafted, not landed. 8 open questions in the
   scratchpad draft. Two need answering before it can ship: whether "plot
   floor" should be user-facing wording (it means the minimum spacing a pen
   can resolve), and which of the 12 mark shapes to offer.
2. **Capability gate before Wave parameters.** Several Wave knobs look like
   they cannot move a pixel — `aFlo`/`aMax` are expressed as a share of line
   spacing but an absolute 0.34–0.80mm clamp overrides them, and `ampSpacing`
   vs `weaveDepth` differ in four such fields yet render near-identically.
   Recommendation: build the gate first, or Stage 3 ships dead controls.
3. **Shadow gradient plot cost** — 4× path count at the default. May resolve
   itself once the gradient is re-expressed as spacing; re-measure after.

## Fill Method plan (judge's ruling, abridged)

**Do not reparent the picker.** `select.js:29` is a native `<select>`, and its
own header says why: platform keyboard nav, type-ahead and the mobile picker
come free. The OS renders the option list outside the flyout, so list length
costs zero rows — rows are the scarce resource. **Method is an adjustment
level, not a navigation level.** Only ~12 of 48 laws are genuinely "one
algorithm, different parameters" (6 table-driven marks/waves, 6 sharing a
bundle chassis); 25 are structurally different and 11 are singletons.

**Scope:** one hand-authored `src/config/fill-methods.js` that the **engine
reads** — not a mirror with a parity test, or the guarantee is procedural.
Lift only `MK` (12 rows) and `WV6` (10 rows + 4 consts). Explicitly not `ADJ`,
`CONT` or `PEN`.

**The anti-inert guarantee** is the point: a small CI gate (~20–25 renders)
asserting each declared, UI-visible parameter changes output between min and
max. Full 1536-cell sweep is nightly/manual — both designers predicted a slow
gate gets switched off. This fails red today on `toneQuantLevels`.

**Stages:** S0 done · **S1 Mark method (~3 days) — ship this if only one
ships** · S2 shadow-surface unification (blocked on the shadow work) · S3 Wave
(droppable) · S4 capability artifact · S5 Bundle, not scheduled.

**Never delete a law id.** `clampStyleParam` (`params.js:692-700`) silently
rewrites unknown ids to `ladder` with no migration record, so deletion
re-renders saved documents. Gate in the picker instead.

## Gotchas worth carrying forward

- **`|| DEFAULT` dispatch fallbacks caused three separate bugs** this batch —
  expand rendering flowfield, unknown tone laws clamping to `ladder`,
  `onePenDown` silently rendering as `amplitudeOnly`. Each turned "unsupported"
  into "confidently wrong output". Worth a sweep for other such sites.
- **Same hazard family, a fourth instance: silent `NaN`, not a wrong
  default.** The `cross`/`wave` shadow recipes computed `spacing * N`
  directly; once `spacing` became a function (the ruling-spacing gradient
  fix), that arithmetic produced `NaN` and wave marks vanished with no error
  or console warning. An untyped assumption about a parameter's shape is the
  same class of hazard as an unhandled id — both convert "unsupported" into
  "silently wrong" instead of a loud failure.
- **Tests can pass on a camera the app never ships.** The border-offset suite
  was green at yaw 0/pitch 0 while the default scene camera is yaw −30/pitch 20,
  where the behaviour was inverted.
- **A green suite can cover a dead contract.** `toneQuantLevels` was clamped,
  forwarded, and pinned by two test files while `surface-fill.js` never read it
  — and reported the value back out as metadata.
- **Verify in the app, not the harness.** Density reached 200 twice while
  spheres stayed pixel-identical; the shadow picker offered 41 options that
  rendered as 5 pictures.
- `docs/tone-laws/laws.json` **is** tracked (a generated header claiming
  otherwise was corrected). Regenerate with `node scripts/build-tone-laws.js`;
  unchanged input is a byte-identical no-op.
- Context-bar controls are selected by **`aria-label`**, not visible text,
  since the icon-only conversion.
</content>
