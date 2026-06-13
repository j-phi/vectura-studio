# Phase 3 — UX Requirements (3D Algorithm Panels)

**Role:** UX Lead synthesis of three lens reviews (cognitive-load, redundancy/consistency, control-type/mental-model) into a single coherent, testable requirements set.

**Scope:** The four 3D algorithm parameter panels — `spiral3d`, `polyhedron`, `meshTopography`, `imageSurface` — as defined in `src/ui/controls-registry.js`.

**Hard constraints honored throughout:**

- **Only the four sanctioned control types** (`range`, `select`, `checkbox`, `angle`). No new widget types (no 2D light picker, no segmented control, no joystick).
- **Never rename a control `id`.** Generators read `p.<id>` and `.vectura` presets serialize by `id`. All naming work is `label`-only unless a defect requires removal.
- **Defaults / serialization changes are higher-risk** and are explicitly flagged; label-only and type-swap changes that preserve values are the low-risk default.
- **These UX requirements layer on top of the product R-series; they never contradict it.** Where a lens fought an R requirement or app convention, the conflict is resolved below and the losing recommendation is dropped or downgraded.

**Relationship to the R-series (product requirements):** The R-series owns *wiring and gating* (what is live, what is hidden, what is removed). These UX requirements own *presentation* (grouping, disclosure, naming, control affordance) and three cross-cutting guards the R-series surfaced but did not fully specify. Sequencing dependencies on the R-series are called out per requirement.

---

## Conflicts resolved before writing requirements

| Conflict | Resolution |
|---|---|
| **Lens claim: convert spiral3d `yaw`/`pitch`, light dials, etc. to `angle`** vs. **source reality.** Source verified: spiral3d `yaw`/`pitch`/`roll` are `range`, not `angle`; `pitch` is `[-90,90]`. | `angle` dial is only correct for **compass-heading 0–360 wrap** parameters. Pitch/tilt/elevation are clamped off-plane angles and must stay `range`. Adopt the control-type lens's *safe subset only* (UX7). |
| **C2: normalize pitch/tilt range to `[-90,90]` everywhere.** Verified ranges diverge: spiral3d `[-90,90]`, polyhedron/imageSurface `[0,89]`, meshTopography `[-180,180]`. | Kept as **UX8**, but downgraded to P2 and explicitly flagged **not baseline-neutral** (changes reachable parameter space). Sequence with a baseline-regen wave (R1/R7), not the relabel wave. |
| **C1: relabel `rotate`/`tilt` → "Yaw"/"Pitch" across panels and expose Roll everywhere.** | Adopt the **relabel-only** half (UX5). Reject "expose Roll on polyhedron/imageSurface" this wave — it is a new control + default + baseline change with no defect backing it; log as a follow-up, not a requirement. |
| **T5: convert spiral3d `surfaceMode`/`outlineMode` selects → checkboxes.** | **Rejected as a requirement.** It needs a default/serialization migration (string→bool) and risks a *double* outline toggle once R-CC maps the shared `emphasizeOutline` onto spiral3d. The control-type lens itself flagged this. Folded into UX6 as a *naming-harmonization* note only; no type/default change. |
| **C3 / T7: polyhedron has two controls labeled "Hidden Lines" (`hiddenLineMode` shared block + `faceOpacityMode`).** R-CC injecting the shared block makes the collision active. | **Adopt as UX2 (P1).** This is a latent break of R10's and R-CONSIST's "no duplicate label per algo" assertion that the R-series text does not call out. Must land with/before R-CC. |
| **UX-1/UX-6/UX-3 (cognitive-load): collapse-by-default disclosure sections.** Source verified: `algo-config-panel.js:883-889` renders sections as flat `.control-section-title` with no `collapsed` support. | **Adopt as UX1**, but scoped: requires an *additive* optional `collapsed` flag on `{type:'section'}` defs plus renderer support. Must not break the byte-identity assumptions of the compile gate (the flag is additive and the section still renders a header → satisfies R-CONSIST rule (a)). Sequence *after* R-CC/R6/R7 so the per-algo reductions land first, then collapse what remains. |
| **UX-2 (split "Shading & Lines" into two tiers).** | **Rejected.** Directly tensions R-CONSIST rule (b) ("lock relative order / one header") and adds a new section the acceptance test asserts is singular. The disclosure collapse (UX1) achieves the same load reduction without splitting the locked header. Dropped. |
| **UX-4 (hoist `mode`/`solidType` discriminator above Surface Noise; segmented styling).** | Keep the *spirit* (discriminator legibility) but reject moving `mode` above the Surface Noise section — that contradicts R3's section ordering and the segmented-control styling needs a new type. Captured as a **documentation note under UX1**, not a standalone requirement. |
| **UX-8 / R5 (seed a self-occluding imageSurface mesh default to "demonstrate" See-Through).** | Endorse the cognitive-load lens: **prefer R5's no-default-change branch.** Captured as UX10 (panel must never show a control as falsely "dead"; use the R3 empty-state hint idiom instead of mutating defaults). No conflict with R5 — picks its documented second disposition. |

Recommendations that were *considered and deliberately rejected* by the lenses (T2 2D light picker, T4 camera+focal merge, T6/T8 mode-select→checkbox / integer-slider→select) are **not** restated as requirements; they are recorded in the "Explicitly out of scope" section so reviewers don't re-raise them.

---

## Requirements

### UX1 — "Shading & Lines" and polyhedron "Effects" become collapsed-by-default disclosure sections

**Lenses:** cognitive-load (UX-1, UX-6, UX-3).
**Priority:** P2. **Risk:** Low–Med (renderer change, additive schema flag).
**Depends on:** R-CC, R6, R7 land first (so per-algo `showIf` reductions are applied before collapsing the remainder). **Does not** conflict with R-CONSIST rule (a) because the section header still renders.

**Change:**
1. Add an optional `collapsed: true` field to `{type:'section'}` section defs (additive; absent = today's always-open behavior).
2. Teach the section renderer at `src/ui/panels/algo-config-panel.js:883-889` to render `collapsed` sections as a collapsible disclosure, reusing an **existing** app idiom (the `global-section` collapsible header or the `pendulum-advanced` `<details>/<summary>` pattern in `components.css`). No new visual vocabulary.
3. Apply `collapsed: true` to the shared `Shading & Lines` section header (`SHADING_LINE_CONTROLS[0]`) on all four panels, and to polyhedron's `Effects` section header. Every control in both blocks defaults OFF/neutral (verified in `defaults.js`), so collapsing hides only optional finishing/deformation controls.

**Acceptance:**
- Schema: the `Shading & Lines` section def and polyhedron `Effects` section def carry `collapsed: true`; all other section defs are unaffected.
- Renderer test: a section def with `collapsed: true` produces a disclosure element that is closed on first render and whose header label is still present in the DOM (proves R-CONSIST rule (a) "header present" still holds).
- Geometry byte-identical (presentation-only; no `id`, default, or option change).

---

### UX2 — Eliminate the duplicate "Hidden Lines" label on polyhedron

**Lenses:** redundancy/consistency (C3), control-type (T7). **This is the single most important cross-cutting finding.**
**Priority:** P1. **Risk:** Low (label-only; possible control removal).
**Depends on / blocks:** Must land **with or before R-CC** and in the **same wave as R10/R-CONSIST**, or their "no two controls within any `CONTROL_DEFS[algo]` share an identical label" assertion goes red on polyhedron.

**Problem (verified in source):** polyhedron already declares `faceOpacityMode` with `label: 'Hidden Lines'` (registry:1791). The shared `SHADING_LINE_CONTROLS` block declares `hiddenLineMode` with `label: 'Hidden Lines'` (registry:89) and is spread into polyhedron (registry:1838). After R-CC keeps the shared block on polyhedron (all flags true), **polyhedron renders two controls labeled "Hidden Lines."**

**Change (pick one, in priority order):**
1. **Preferred:** verify whether R-CC's `hiddenLineMode` (3 options: back-face / remove / dash) supersedes polyhedron's `faceOpacityMode` (2 options: Dashed / Pruned). If it does, drop `faceOpacityMode` from polyhedron and let the shared control be the single hidden-line treatment.
2. **If both must coexist:** relabel `faceOpacityMode` `label` → **"Hidden Faces"** (or "Face Opacity"/"Occlusion") — it controls *face* opacity, not line visibility, so the rename is also more accurate. `id` unchanged.

**Acceptance:**
- Unit assertion: no two controls in `CONTROL_DEFS.polyhedron` share an identical `label` (passes after the rename/removal; this is the same assertion R10 and R-CONSIST use).
- If removal path chosen: `CONTROL_DEFS.polyhedron` has no `faceOpacityMode`; the generator's reader for `faceOpacityMode` is migrated to `hiddenLineMode` or removed; old presets carrying `faceOpacityMode` load without error.

---

### UX3 — Resolve the "Depth Strength" label collision (endorse R10) and de-crowd the Depth family

**Lenses:** cognitive-load (UX-5), redundancy/consistency (C5), control-type (T4).
**Priority:** P1. **Risk:** Low (label-only, zero baseline impact). **First (no-baseline) wave.**
**Relationship:** Strict **superset of R10** — does not contradict it.

**Change:**
1. Adopt R10 exactly: `focalLength` `label` "Depth Strength" → **"Perspective Strength"**; `depthCueStrength` `label` "Depth Strength" → **"Depth Cue Strength"** (all four panels).
2. Additionally relabel `depthBias` `label` "Depth Bias" → **"Occlusion Bias"** (it biases the painter/hidden-line z-compare per `image-surface.js:444`). This removes a *third* "Depth"-prefixed label co-visible with "Depth Cue Strength" in/near the shading block. `id` unchanged.

**Acceptance:**
- Unit assertion: no two controls within any `CONTROL_DEFS[algo]` share an identical `label`.
- No `label` in any 3D panel begins with "Depth " more than once (the three former "Depth*" labels are now "Perspective Strength", "Depth Cue Strength", "Occlusion Bias").
- Geometry byte-identical.

---

### UX4 — Uniform "inapplicable control" idiom: hidden, never disabled (codify R-CONSIST rule (c))

**Lenses:** cognitive-load (UX-7), redundancy/consistency (C7), control-type.
**Priority:** P1. **Risk:** None (audit/guard). **Endorses R-CONSIST.**

**Change:** Confirm one idiom across all four panels — every control that does not apply in the current configuration is **absent** via `showIf`, never greyed-out/disabled. This is the highest-leverage load reducer because it removes the dead spiral3d (~9) and imageSurface (~12) shading entries that the wiring requirements (R-CC, R6, R7) gate out.

**Acceptance:**
- Registry test asserts no 3D panel control renders in a disabled/greyed state as the inapplicable idiom (inapplicable ⇒ `showIf` falsy ⇒ absent).
- Cross-check with R-CONSIST acceptance (3): inapplicable controls absent (not merely disabled) for all four algos.

---

### UX5 — Unify the camera-orbit axis labels across all four View blocks

**Lenses:** redundancy/consistency (C1).
**Priority:** P1. **Risk:** Low (label-only; **ids unchanged**). Same wave as UX3.
**Resolves the verified inconsistency:** all four feed the same `rotatePoint({yaw,pitch,roll})` transform, but the View block shows the same axis under different labels ("Yaw" on spiral3d vs "Rotate"/"Tilt" on the other three).

**Change (labels only — never rename `rotate`/`tilt` ids):**
- polyhedron: `rotate` `label` → **"Yaw"**, `tilt` `label` → **"Pitch"**.
- meshTopography: `rotate` `label` → **"Yaw"**, `tilt` `label` → **"Pitch"** (keep `roll` → "Roll").
- imageSurface: `rotate` `label` → **"Yaw"**, `tilt` `label` → **"Pitch"**.
- spiral3d: already "Yaw"/"Pitch"/"Roll" — no change.

**Rejected sub-recommendation:** *do not* add a new Roll control to polyhedron/imageSurface this wave (new control + default + baseline change, no defect backing). Log as a follow-up.

**Acceptance:**
- Schema: the orientation controls labeled "Yaw"/"Pitch" exist on all four panels (and "Roll" where a roll control already exists: spiral3d, meshTopography).
- No control `id` changed from `rotate`/`tilt`/`yaw`/`pitch`/`roll`.
- No two controls within any panel share a label (UX3's assertion still passes).
- Geometry byte-identical.

---

### UX6 — Harmonize the "See-Through / Visibility / Faces" vocabulary across panels

**Lenses:** redundancy/consistency (C3), control-type (T5 — naming half only).
**Priority:** P2. **Risk:** Low (label-only; **no type/default change**).
**Depends on:** Run **after** R-CC and R5 land (the wiring/gating must settle first). This is a *naming* pass, not a control merge or type swap.

**Change (label-only; `id`/`type`/options unchanged):**
1. Reserve the words **"Hidden Lines"** for exactly one concept — the shared `hiddenLineMode` select (already enforced on polyhedron by UX2).
2. Pick one verb — **"See-Through"** — for "reveal geometry behind the front surface," matching imageSurface's existing `seeThrough` checkbox label:
   - spiral3d `surfaceMode` already exposes a "See-Through" option — keep.
   - meshTopography `contourVisibility` option "Full / Dashed Hidden" `label` → **"See-Through (dashed)"**.
3. Do **not** convert spiral3d `surfaceMode`/`outlineMode` selects to checkboxes (T5) — that needs a default/serialization migration and risks a double outline toggle with R-CC's `emphasizeOutline`. Out of scope.

**Acceptance:**
- After UX2 + UX6, no 3D panel has two controls labeled "Hidden Lines."
- The "reveal hidden geometry" affordance presents as a control whose label/option contains "See-Through" on every panel that offers it.
- No control `id`, `type`, default, or option `value` changed (option `label` text only).
- Geometry byte-identical.

---

### UX7 — Convert compass-heading 0–360° sliders to the `angle` dial (safe subset only)

**Lenses:** control-type (T1), with the lens's own caveats applied.
**Priority:** P2. **Risk:** Low (type-only; min/max/step/displayUnit preserved; randomization treats `angle` and `range` identically).

**Change:** `type: 'range'` → `type: 'angle'` for the verified full-circle (0–360, wraps) directional controls **only**:
- `lightAzimuth` (shared shading block) — light heading.
- `planeRotate` (meshTopography) — cutting-plane heading.
- `horizontalLineAngle` (imageSurface) — currently `[-180,180]`; convert only if the dial's 0–360 representation is acceptable for a bidirectional line angle, otherwise leave as `range` (line orientation is mod-180; document the decision).
- `topographyAngle` (imageSurface) — same `[-180,180]` caveat as above.

**Explicitly NOT converted (stay `range`):** `lightElevation` (0–90, off-plane pitch), `hatchAngle` (0–180, mod-180 line orientation where 0°/180° are identical lines but the dial would show them distinct), and all `pitch`/`tilt`/`planeTilt` (clamped off-plane angles). The dial's 360° wrap misrepresents clamped or mod-180 ranges.

This complements R6/R7 (which *hide* `lightAzimuth`/`hatchAngle` on the algos where they don't apply); the type swap only affects panels where the control remains visible.

**Acceptance:**
- Schema: `lightAzimuth` and `planeRotate` are `type: 'angle'` with unchanged min/max/step/displayUnit.
- `lightElevation`, `hatchAngle`, and every `pitch`/`tilt`/`planeTilt` remain `type: 'range'`.
- Randomization smoke test: the dice/randomize path produces a value for the converted `angle` controls (parity with prior `range` behavior).
- Geometry byte-identical for identical parameter values.

---

### UX8 — Normalize the pitch/tilt axis range across panels (baseline-affecting)

**Lenses:** redundancy/consistency (C2).
**Priority:** P2. **Risk:** Med — **NOT baseline-neutral** (changes reachable parameter space).
**Sequence:** Schedule in a **baseline-regen wave alongside R1/R7**, never in the label-only wave. All current defaults stay in range, so default renders do not change, but the slider's reachable space does.

**Change:** Standardize the pitch/tilt axis to **`[-90, 90]`** (spiral3d's existing range, the natural look-up/look-down hemisphere):
- polyhedron `tilt`: `[0,89]` → `[-90,90]`.
- imageSurface `tilt`: `[0,89]` → `[-90,90]`.
- meshTopography `tilt`: `[-180,180]` → `[-90,90]` (the over-wide range duplicated what yaw already covers past ±90).
- spiral3d `pitch`: already `[-90,90]` — no change.

Old presets with out-of-new-range tilt values still load (generators clamp via `finite`, not via the slider min/max).

**Acceptance:**
- Schema: the pitch/tilt control on all four panels has `min: -90, max: 90`.
- All `defaults.js` tilt/pitch defaults remain within `[-90,90]` (no default render changes; verify in the regen-wave baseline diff).
- A loaded preset with `tilt` outside `[-90,90]` renders without error (generator clamps independently of the slider).

---

### UX9 — Group imageSurface's flat Surface section and normalize spiral3d shape-dimension labels

**Lenses:** cognitive-load (UX-3), control-type (T3).
**Priority:** P2. **Risk:** Low (section grouping + label-only).
**Coordinates with:** R3 (Surface Noise ordering — different section, no collision), R4 (`smoothing`/Map Blur gate — relocation only).

**Change:**
1. **imageSurface Surface section** (the densest cluster, ~11 flat controls): split into **"Surface"** (`mode`, `mapType`, `artworkSize`, `amplitude`, `sampleDetail`) and a collapsed **"Map Adjust"** (`gamma`, `contrast`, `invert`, `clipBlackAreas`, `smoothing`/Map Blur, `normalFlipY`) — the tonemapping sub-task is conceptually distinct from geometry. Use the UX1 `collapsed` disclosure idiom. `mode` stays the first control in "Surface" (the master discriminator), satisfying the UX-4 legibility intent without moving it above Surface Noise (which R3 orders).
2. **spiral3d per-shape dimension labels:** since only one shape's controls are ever visible (`showIf` gates each to `p.shape===X`), drop the redundant shape-name prefix so the gated set occupies stable label slots: `baseRadius` "Cone Radius" → **"Radius"**, `coneHeight` "Cone Height" → **"Height"**, `cylinderRadius` "Cylinder Radius" → **"Radius"**, `cylinderHeight` "Cylinder Height" → **"Height"**, `capsuleRadius` "Capsule Radius" → **"Radius"**, `capsuleHeight` "Capsule Height" → **"Height"**. (`sphereRadius` is already "Radius"; equator/polar/ring/tube keep their distinguishing names.) `id`s unchanged. Do **not** merge controls into shared ids — that would corrupt per-shape defaults and break presets.

**Acceptance:**
- Schema: imageSurface has a `Surface` section and a `Map Adjust` section (with `collapsed: true` per UX1); the listed controls are partitioned accordingly.
- For any single `shape` value on spiral3d, the visible dimension controls are labeled only by their bare dimension ("Radius"/"Height"/etc.) with no shape-name prefix; no two visible-at-once controls share a label.
- No control `id`, default, or geometry changed.

---

### UX10 — No control may read as "dead" in the panel; use the empty-state hint idiom (reinforce R3, resolve R5)

**Lenses:** cognitive-load (UX-8), aligns R3 + R5.
**Priority:** P1. **Risk:** None (presentation policy).

**Change:** A control must never appear interactive while having no possible effect in the current configuration. Two enforcement paths, both already established by R3:
1. **Gate it** via `showIf` so it is absent when inapplicable (the dominant idiom; R3/R4/R5/R6/R7/R8/R9 already do this).
2. **When a control is gated by a subsystem the user must populate** (e.g., imageSurface `noiseMode`/`noiseAmount` gated behind a non-empty noise stack per R3), render the R3-style **empty-state hint** under the section header ("Add a noise layer to enable") so the gate never silently hides controls with no explanation.

For R5 specifically: **prefer R5's no-default-change branch** — do not mutate the imageSurface mesh default purely to make `seeThrough` "demonstrate." If product later chooses the self-occluding default, pair it with the R3 hint idiom so `seeThrough` never reads as dead. This UX requirement does not force either R5 branch; it forbids the "false dead reading" outcome.

**Acceptance:**
- imageSurface: with `noises: []`, both `noiseMode` and `noiseAmount` have falsy `showIf` AND the empty-stack hint renders under the Surface Noise header (matches R3 acceptance).
- No 3D panel control is simultaneously visible/enabled and provably a no-op in its current config across the audited default states (cross-check against the Phase 1 defect log's "dead control" list).

---

## Sequencing summary

| Wave | Requirements | Baseline impact |
|---|---|---|
| **Wave 1 — relabel/no-baseline** | UX3 (Depth labels), UX5 (camera-orbit labels), UX2 (polyhedron Hidden-Lines de-dup — with/before R-CC), UX6 (See-Through vocab — after R-CC/R5), UX9 part 2 (spiral3d shape labels), UX4 (idiom guard), UX10 (dead-control policy) | None (byte-identical) |
| **Wave 2 — presentation/type** | UX1 (collapsed disclosures — after R-CC/R6/R7), UX7 (`angle` dial subset), UX9 part 1 (imageSurface section split) | None (presentation/type only; identical values render identically) |
| **Wave 3 — baseline-regen** | UX8 (pitch/tilt range normalize) — bundle with R1/R7 | Reachable space changes; defaults stay in range (no default render change) |

**Test-discipline note (per CLAUDE.md / AGENTS.md):** each requirement carries a Red→Green assertion. Label/idiom changes are guarded by the registry/compile unit tests (`tests/unit/controls-registry-compile.test.js` and the per-algo schema assertions); type-swaps and section grouping get a renderer/integration test; UX8's range change must regenerate SVG baselines in the same commit. Bump the semver patch and run `npm run version:sync` on any landing wave.

## Explicitly out of scope (considered and rejected by the lenses — do not re-raise)

- **2D azimuth+elevation light picker** (T2) — requires a net-new vector/joystick control type; outside the four sanctioned types.
- **Merging `cameraDistance` + `focalLength` into one "depth" control** (T4) — they are two genuine camera axes; R10/UX3's relabel is the correct fix and merging would re-create the muddle.
- **Converting mode-naming selects (`vertexOcclusionMode`, `faceOpacityMode`) to checkboxes** (T6) — their options name two distinct modes, not presence/absence; a select is the honest affordance.
- **Converting low-range integer count sliders (`vertexRings`, `barHeightSteps`) to selects** (T8) — the app convention is sliders for ordinal integer counts.
- **Splitting "Shading & Lines" into two section headers** (UX-2 cognitive-load) — fights R-CONSIST's single locked shared header; UX1's collapse achieves the load reduction instead.
- **Exposing a new Roll control on polyhedron/imageSurface** (C1 second half) — new control + default + baseline with no defect backing; logged as a follow-up.
