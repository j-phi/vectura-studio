STATUS: DONE/FU

# W-30c impl — `shadows.js` receive-footprint correctness sweep

Lane: fill-collapse-2. Worktree: `.claude/worktrees/fill-collapse-2` (branch `3d-scene/fill-collapse-2`).
Base sha: `90f3411f` (U7, this lane's HEAD at the W-30c briefing). New sha: `79c07770`
(`1e528b94` F1, `79c07770` F2b+F3). Port 8482 (own dev server). No push, no merge, no version
bump (hook cannot fire in a worktree; verified `package.json`/`version.js`/`index.html`
byte-unchanged `90f3411f..HEAD`).

`git status --short -- . ':!graphify-out'` clean before starting and after the final commit.
`git stash list` showed only pre-existing unrelated agent-worktree stashes (untouched).
Read first, per the brief: `AGENT-PROTOCOL.md`, `W-30c-plan.md` in full, `W-30b-review.md` §5,
`UnitD-phase-impl.md`/`-review.md` §4.

## Scope decision — F2a parked as W-30d (stop condition invoked, as pre-approved)

The plan's own §7 stop condition: "If hoisting `lightClassifyEdges`/`lightFaceSign` out of
`build()` cannot be done while keeping every convex caster bit-identical, ship F2(b) alone... and
park F2(a) as W-30d." I read `casterSilhouetteLoops`'s bail check (`shadows.js:576`,
`Pa.y < -1e-6` / `Pb.y < -1e-6`) — it hardcodes a **ground-at-y=0** assumption specific to the
`build()` ground-shadow path. `buildFaceFootprint` casts footprints onto an **arbitrary receiving
face's own plane** (not necessarily y=0), so reusing that primitive correctly would require
generalizing the bail check to the receiving plane's own anchor/normal — a genuine, separate
engineering task, not a straight hoist. I judged this the risky part the plan flagged and invoked
the stop condition: **F2(a) is NOT done here.** Filed as **W-30d** with the plan's own numbers
carried forward: 22.08mm / 24.14mm largest-empty-disc, 35.5% / 45.8% of the torus footprint's area
not actually occluded (R2, unfixed). `shadows.js` itself is **byte-untouched** this unit
(confirmed: `git diff 90f3411f..HEAD -- src/core/scene3d/shadows.js` is empty) — handoff-c's file
ownership is undisturbed.

## Fixes shipped (rank order)

### F1 (R1) — area-light per-sub-sample occlusion · `src/core/scene3d/regions.js` · commit `1e528b94`

Exact edit per plan: moved the `shadowFn(P, light)` gate from above the `type === 'area'` branch to
after it, gating each of the N Fibonacci sub-samples on its own synthesized position
(`{ ...light, type: 'point', position: Ls }`). `ambient`/`point`/`spot` fall through unchanged
(reordering only, proven byte-identical by guard D).

**RED (§1c rig, box@(0,60,0), area light (-300,300,0) size120/samples6, march x 30->140/2mm),
measured against the pinned pre-fix tree (`VECTURA_PRE_W30C_A=1`):**
- A (penumbra exists, >=4 distinct values): pre-fix **3** → FAIL.
- B (accuracy, max|current−gated|<=0.05): pre-fix **0.3985** at x=136 → FAIL (matches plan exactly).
- C (penumbra width >=20mm): pre-fix **0mm** → FAIL.

**GREEN (current tree):** A=**23** distinct values, B max error **<=0.05** (holds), C width **>=20mm**
(holds — the graded band spans the march). Guard D (point light, same position, bit-identical march
old vs new tree): **PASS**, and the march genuinely crosses the point light's own hard shadow
(anti-vacuity).

Test: `tests/unit/scene3d-area-light-shadow-softening.test.js` — **8/8 pass** (RED confirmed
separately under `VECTURA_PRE_W30C_A=1`: 3/3 of the RED-block assertions fail as expected, 5/5
GREEN-block assertions pass unconditionally).

### F2b (R3) — occlusion-valid tone sample for hull-with-a-hole casters · `src/core/algorithms/scene3d.js` · commit `79c07770`

The "inside footprint" tone pass sampled exactly one point — the polygon centroid — assuming a
binary directional shadow. For a torus (hull fills its hole, R2), the centroid lands in the real
geometric hole, where `pointInShadow` correctly reports unoccluded, so the *whole* footprint
(including the genuinely occluded ring) rendered at the unshadowed pitch. Fix: if the centroid
isn't occluded, walk points 90%-toward each hull vertex (real projected caster-surface points) from
the centroid, use the first that IS occluded; if none is found, emit no inside pass (never
regresses to "draw unshadowed" — today's behavior for every already-occluded-centroid caster, i.e.
every convex caster, is untouched).

**RED (torus sx40/sy12/sz40 detail24 @(60,30,0), 500mm plane receiver, probe at the footprint's own
measured centroid), against the pinned pre-fix tree (`VECTURA_PRE_W30C_B=1`):**
- directional, probe(-4.34,0): ratio **0.916** (< control — *darker outside than the "shadow"*) → FAIL vs 1.3 bar.
- point, probe(150.07,0): ratio **1.000** (no shadow at all) → FAIL vs 1.3 bar.
- sphere control (unaffected): ratio **>=1.5** → holds even pre-fix, confirming the pin only breaks the torus path.

**GREEN:** directional ratio **2.869**, point ratio **3.021** — both clear the 1.3 bar by a wide
margin, matching the sphere's own 3.02 on the same rig. Test:
`tests/unit/scene3d-shadow-footprint-torus-visibility.test.js` — **6/6 pass**.

**Disclosed limitation (not fixed here, W-30d):** the fix makes the torus's shadow *visible*, not
*accurate* — the geometric hole still renders shadowed (visible in the evidence crop as a filled
blob, not an annulus with a lighter centre).

### F3 (R4) — footprint built from the wrong light when `lights[0]` is ambient · `src/core/algorithms/scene3d.js` · commit `79c07770`

`buildFaceFootprint` always used `light` (`== lights[0]`) and its derived `lightDir`. Since the UI
always appends new lights after the default sun, `lights[0]` is ambient whenever a user's first
manual add is ambient — and an ambient light has no position/direction, so `lightWorldDir` fell
back to its 135°/45° default and the positional light's shadow vanished. Fix, scoped to
`buildFaceFootprint` only (`light`/`lightDir` themselves are untouched — they also drive `toneOn`,
the specular term, `shadowReceiveOn`): pick `(p.lights || []).find(l => l.type !== 'ambient' &&
l.castShadows !== false) || light`. The tone-sample gate (F2b) also uses this resolved light so the
polygon and its shading agree.

**RED, full pipeline (sphere r20@(60,20,0), 500mm plane, probe(130,0) vs control(-150,0)), against
the pinned pre-fix tree (`VECTURA_PRE_W30C_C=1`):**
- `[ambient, point]` ratio: pre-fix **0.99999999999999** (effectively 1.00, "shadow is gone") → FAIL vs 2.0 bar.
- `[point, ambient]` control (point already first, unaffected): pre-fix ratio **holds** at >=2.0.

**GREEN:** `[ambient, point]` ratio **>=2.0** (fixed). Coverage added (closes STILL-OPEN.md line 8 —
point/spot/area were never driven through the full `generate()` pipeline together before):
point/spot/area alone all >=2.0 (each individually measured ~3x); `[point, ambient]` unaffected;
`[sun]`-only scene **md5-identical** old vs new tree (F3 is a structural no-op with no ambient in
the list). Test: `tests/unit/scene3d-shadow-receive-lighttypes.test.js` — **8/8 pass**.

## Guards (foreground, one file at a time)

| Suite | Result |
|---|---|
| `scene3d-shadow-footprint-direction.test.js` (W-30) | 17/17 |
| `scene3d-shadow-footprint-wiring.test.js` (W-30b) | 5/5 |
| `scene3d-shadow-receive.test.js` (Unit D — phase lock, density bar) | 17/17 |
| `scene3d-shadows.test.js` | 18/18 |
| `scene3d-tone-law-collapse.test.js` (U0 48-law byte-identity sweep) | **73/73** (no cell moved) |
| `scene3d-hlr-spatial-index-identity.test.js` | 6/6 |
| `scene3d-lighting.test.js` | 18/18 |
| `scene3d-ladder-uniform-field-spacing.test.js` | 9/9 |
| `scene3d-appdefault-facet-fill.test.js` | 7/7 |
| my 3 new files, combined | 22/22 |

U0's 48-law sweep took **574.5s** under heavy shared-machine contention (3-4 concurrent
vitest sessions from other worktrees observed via `ps` throughout the run — matches
AGENT-PROTOCOL's "machine is shared" warning); it threw one benign `[vitest-worker]: Timeout
calling onTaskUpdate` RPC-heartbeat error under that contention (documented pre-existing hazard in
`vitest.config.js`'s own coverage-contention comment) with **zero test failures** — not a
regression. All 4 shadow-related generator guards were run before AND is what proves F1/F2b/F3
did not move a single one of the 48 tone-law cells, satisfying the plan's explicit stop condition
("If any F2 change moves a U0 tone-law cell, stop and report").

Unit D's own bars (phase lock ~0.05x, density ~1.4x) and the directional byte-identity guards
inside `scene3d-shadow-footprint-wiring.test.js` all passed unmodified — no tolerance was touched.

## Perf

Area-light dense-scene rig (sphere caster + 500mm plane, `shadowReceiveOnObjects` ON, area light):
3 runs each, flag OFF `131/101/94ms`, flag ON `116/109/103ms`, **ratio 1.006x** — well inside the
plan's `<=1.15x` area-light budget and its `<=1.10x`/`1.00x` budgets for F2/F3 respectively (F3 is
one `Array.prototype.find` per `generate()`, structurally 0x for every scene whose `lights[0]` is
already a shadow caster).

## Byte-identity — verified, not asserted

- **U0's 48-law sweep**: 73/73 green (table above).
- **Every convex caster (sphere/box), all 4 light types**: the evidence PNGs
  (`docs/3d-audit/fill-audit/after/W-30c/footprint-{sphere,box}-{point,directional}-{before,after}.png`)
  are **pixel-identical, 0 differing pixels** (PIL `ImageChops.difference`, `bbox=None`) — verified
  programmatically, not inferred from file size.
- **`[sun]`-only scene**: md5-identical old vs new tree (F3 guard, in
  `scene3d-shadow-receive-lighttypes.test.js`).
- **Point-light march at the F1 rig's exact light position**: bit-identical old vs new tree (F1
  guard D, in `scene3d-area-light-shadow-softening.test.js`).

## Evidence

`docs/3d-audit/fill-audit/after/W-30c/` (bespoke — verified 0 hits for `shadowReceiveOnObjects` and
no `point`/`area` light across `manifest.A.1-50.jsonl` + `manifest.B.1-5.jsonl`, matching the
plan's §6 claim, re-verified this session with `grep -c`). Two-server true before/after: this
worktree on 8482, a `git archive` scratch export of `90f3411f` on 8483 (both killed on exit),
via `scripts/w30c-shadows-evidence.js`.

- **`w30c-footprint-shapes`** (sphere/box/torus x point/directional, less-grazing light
  `(-160,260,60)` per the W-30b reviewer's own recommendation, framed from the footprint's own
  world bbox + margin): **LOOKED at native-resolution crops.**
  - sphere & box, both light types: crop diff confirms 0-pixel change (see byte-identity above) —
    not separately re-described visually since the pixel diff is the stronger proof.
  - **torus, directional** (`crop-torus-dir-before.png` / `-after.png`): BEFORE is uniform hatch
    with no visible shadow at all around the torus. AFTER shows a clear, dense, roughly egg-shaped
    dark blob directly below/beside the torus — the shadow is now visible. The blob is **solid**,
    not annular — R2 (hole not fixed) is visibly still present, exactly as disclosed.
  - **torus, point** (`crop-torus-point-before.png` / `-after.png`): same pattern — BEFORE no
    shadow, AFTER a dense filled patch under the ring.
- **`w30c-area-penumbra`** (§1c rig, before/after): the two 3D-scene PNGs are **pixel-identical**
  (0 differing pixels) — a genuine finding, not an oversight: `buildFaceFootprint`'s render pathway
  only ever samples ONE point for "inside" and one constant for "outside" (the "binary hard shadow"
  design, R3's own root cause), so it cannot expose a continuous per-point gradient even though F1
  makes the underlying `combinedIntensity` computation correct at every point — proven instead by
  the **intensity-profile table** captured in `report.json` and plotted at
  `area-penumbra-profile-plot.png`: before = 3 distinct values (hard 0/0.5645 step), after = 23
  distinct values tracking the per-sample-gated reference. **This is a real, disclosed gap between
  "the math is right" (F1, proven) and "the render shows it" (not this unit's scope for the
  footprint-interior sampling granularity) — filed as a W-30d/W-30e follow-up: make
  `buildFaceFootprint`'s inside pass sample MULTIPLE interior points for a graded pitch, not one.**
- **`w30c-multilight`** (`[ambient, point]`, before/after): **LOOKED.** BEFORE: uniform hatch, no
  shadow near the sphere. AFTER: a small but clearly denser hatch patch appears right where the
  point light's shadow falls. Confirms F3 visually, not just by ratio.

`window.Vectura.APP_VERSION` printed by the evidence script matched this worktree's
`package.json` (`1.3.99`) on the "after" server; the "before" server (scratch export of `90f3411f`)
reported the same version since no version bump happened between `90f3411f` and this unit's commits.

## Open follow-ups (W-30d, and one new W-30e candidate)

1. **W-30d — R2, non-convex caster footprint accuracy** (F2a, parked per the plan's own stop
   condition): 22.08mm / 24.14mm largest-empty-disc, 35.5% / 45.8% of the torus footprint's area
   not actually occluded. Requires generalizing `casterSilhouetteLoops`'s ground-at-y=0 bail check
   to an arbitrary receiving plane (anchor/normal) before it can be reused outside `build()`'s own
   ground-shadow path — a real engineering task, not a straight hoist, which is why I did not force
   it under this unit's time/risk budget.
2. **New candidate (not filed as a numbered unit, flagging for the orchestrator to name one) —
   `buildFaceFootprint`'s "inside" pass is single-sample even after F1/F2b.** F1 fixed the area
   light's underlying intensity computation; F2b fixed the torus's binary visibility. Neither makes
   an area light's penumbra visible in the receive-shadow render itself, because the render
   pathway was built for a binary directional shadow and never grew multi-point interior sampling.
   Evidenced above (`w30c-area-penumbra`'s pixel-identical PNGs vs its very different intensity
   profile).
3. Everything else the plan explicitly dismissed stays dismissed: the spot-cone omission (§2, last
   row — unreachable by construction) and the "abrupt-end" framing artifact (§1e — a viewing/crop
   issue, not a `shadows.js` defect; not re-opened here).

## Bars changed

None. No numeric threshold, tolerance, count bar, or pinned fingerprint was widened, narrowed, or
re-pinned anywhere in this unit's diff.

## Suggested CHANGELOG lines (docs contract — not applied to CHANGELOG.md, per the brief; for the
orchestrator to fold in at integration)

### Fixed
- **3D scene shadow receive: area lights now soften correctly when partially occluded**, instead
  of losing all softening the instant their centre ray is blocked (`src/core/scene3d/regions.js`).
- **3D scene shadow receive: a non-convex caster (a torus) now casts a VISIBLE shadow** on other
  objects' flat faces, instead of none at all — the shadow's shape still over-covers the caster's
  own geometric hole (tracked as a follow-up) but is no longer invisible
  (`src/core/algorithms/scene3d.js`).
- **3D scene shadow receive: an ambient light listed before a point/spot/area light no longer
  deletes that light's cast shadow** (`src/core/algorithms/scene3d.js`).

## Files touched

- `src/core/scene3d/regions.js` (F1)
- `src/core/algorithms/scene3d.js` (F2b, F3)
- `tests/unit/scene3d-area-light-shadow-softening.test.js` (new, O2)
- `tests/unit/scene3d-shadow-footprint-torus-visibility.test.js` (new, R3-focused oracle)
- `tests/unit/scene3d-shadow-receive-lighttypes.test.js` (new, O3)
- `scripts/w30c-shadows-evidence.js` (new, evidence capture)
- `docs/3d-audit/fill-audit/after/W-30c/*` (evidence, in MAIN)

Commits (in the worktree, not pushed): `1e528b94` (F1), `79c07770` (F2b+F3).

REPORT docs/3d-audit/lane-reports/W-30c-impl.md
