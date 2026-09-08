# ROUND 2 — first-unit brief pointers (secretary, 2026-09-06 19:05 EDT)

All five lanes branch off **`main` 47a5a755 (v1.3.99, NOT pushed)**. Every implementer reads
`AGENT-PROTOCOL.md` first, then its lane section below. Ports are reserved; the gallery is served from
MAIN at `http://localhost:8460/docs/3d-audit/fill-audit/index.html`. Version-bump hook cannot fire in a
worktree — never bump. Commit in the worktree, then STOP. Never push.

Standing constraints that bind every section: serialization by file (below), `## Bars changed` disclosure is
mandatory, RED from a scratch `git archive` export (never `git stash` in the worktree), crop evidence at
NATIVE resolution before judging, one-line final message `REPORT <path> — <STATUS> — ≤15 words`.

---

## Lane fill-audit-a2 — first unit **T1b** (near-duplicate stub merge + min-spacing guard)

- **Worktree** `.claude/worktrees/fill-audit-a2` · branch `3d-scene/fill-audit-a2` · port **8475** · base **main 47a5a755**.
- **Brief status: PLAN-READY (no planner needed).** Brief lives in `LEDGER.md` §Phase 2, row **T1b**, and in
  `STILL-OPEN.md` (the 2026-09-06 ruling "T1's min-adjacent-mark spacing regression is a PLOT-SAFETY
  regression"). Background numbers: `T1-review.md` and `T1-impl.md`.
- **Files ALLOWED:** `src/core/scene3d/surface-fill.js` (the `MK`/mark sink and `walkPoly` only),
  `tests/unit/scene3d-mark-laws-draw.test.js`, plus a new test file if it is mark-sink scoped.
- **Files FORBIDDEN:** every other `src/` file. Specifically `surface-fill-mono.js`, `mappers.js`, `hlr.js`,
  `shadows.js`, `scene3d.js`, `context-bar.js`, `params.js`. Do not touch `surface-fill.js:5084-5157`
  (W-01 master grid) and do not re-open the ladder placement path (W-26/W-26b).
- **RED oracle (one line):** on torus/contour and torus/crosshatch at d=50, the worst adjacent-mark centre
  spacing is **0.032 pens** at `67c9752c` (bar: **≥ 0.5 pen**), no kink-detector test exists, and a single
  mark reaches **107 points** with no `pp.length` cap — all three fail before the fix.
- **Three deliverables, all RED first:** (1) merge/drop near-duplicate stubs + a ≥ 0.5-pen min-adjacent-mark
  guard; (2) a kink detector (T1's chevron passed all four oracles, O1's sagitta *higher* because the kink
  read as curvature); (3) an upper bound on `pp.length` (`walkPoly` steps are `ceil(edgeLen / MK_ARC_MM)`,
  `MK_MAX_PENS` budgets marks not points; measured max 107, p99 43, median 6).
- **OUT OF SCOPE:** bulk banding (pre-existing `MK_ROW_COV` scaffold — T3's).
- **Gallery cells to re-shoot: 6** (all verified present in `manifest.A.*.jsonl`), into `after/T1b/`:
  `torus__contour__mkTick__{low,med,max}__a`, `torus__crosshatch__mkTick__{low,med,max}__a`.
  Optional controls (also present): `torus__contour__ladder__med__a`, `sphere__contour__mkTick__med__a`.
- **Lane order after T1b:** W-36 (new, see below) → W-31 → W-32 → W-33 → F1-placement → T2 → T3 → **T4 FROZEN
  (needs Jay's W-06 decision)**.

---

## Lane fill-collapse-2 — first unit **U5b** (caveat visibility for folded laws)

- **Worktree** `.claude/worktrees/fill-collapse-2` · branch `3d-scene/fill-collapse-2` · port **8482** · base **main 47a5a755**.
- **Brief status: PLAN-READY (no planner needed).** Brief in `LEDGER.md` §Phase 2 row **U5b** + the standing
  ruling in `LEDGER.md` §Standing orchestrator rulings ("Folding a law must NOT hide its measured caveat")
  and `STILL-OPEN.md` line 163. Cluster context: `U1-U5-review.md` (the reviewer that found it).
- **Why it is BLOCKING BEFORE MERGE:** folding `bundleDither` (U4) and `contFieldTouch` (U5) hides their real
  measured caveats, because `fillStyleControls` renders the caveat line from the **resolved survivor id**,
  which has none. That is a product regression, not an acceptable cost of the collapse.
- **Files ALLOWED:** `src/config/context-bar.js`, `src/ui/panels/scene3d-panel.js`,
  `tests/unit/scene3d-tone-law-collapse.test.js`, `tests/integration/scene3d-fill-style-picker.test.js`.
- **Files FORBIDDEN:** `src/core/scene3d/surface-fill.js`, `surface-fill-mono.js`, `mappers.js`, `hlr.js`,
  `shadows.js`, `src/core/algorithms/scene3d.js`, `src/core/scene3d/params.js` (W-10d-2/-3 own that file).
- **RED oracle (one line):** at `8610fd66` (now on main) the caveat text for a **folded** id is absent from
  both the picker row and the Style tab; it must be present after the fix.
- **Contract:** render the caveat from the **ORIGINAL law id**, or carry caveats **per parameter value** in the
  collapse table, so the warning follows the folded parameter. Keep the (i) popover's blurb on the survivor —
  the two are conflated in the current code. **The same rule binds U6** — do not plan U6 around losing a caveat.
- **Gallery cells to re-shoot: NONE.** This is picker/Style-tab UI; no manifest cell renders panel chrome
  (verified — `after/U1-U5/` and `after/W-30/` carry no `shots/` either). Evidence = a real-app screenshot of
  the picker row and the Style tab with a folded id selected, plus the caveat text, saved under `after/U5b/`.
- **Lane order after U5b:** W-30b (one-line call-site swap, `buildFaceFootprint` → the W-30 projector) →
  **U6 FROZEN (needs Jay's `penStipple` decision)** → U7 → U8 → U9-coordination.

---

## Lane fill-audit-d2 — first unit **W-27c-0a iteration 4**

- **Worktree** `.claude/worktrees/fill-audit-d2` · branch `3d-scene/fill-audit-d2` · port **8481** · base **main 47a5a755**.
- **Brief status: PLAN-READY (no planner needed).** Two-part brief in `STILL-OPEN.md` line 169 and
  `LEDGER.md` §Phase 2 row **W-27c-0a**. Full history: `W-27c-0a-plan.md`, `-impl-3.md`, `-review-3.md`
  (iteration 3 = REJECT, kept on the branch for ring integrity — that work is already merged into main).
- **Part 1:** re-scope the crowding cull to the **saddle/pole zone**, where cross-plane rings genuinely
  converge, so the sparse **flat lower band** is left alone. Iteration 3's cull was unscoped: 70.8% ink
  retention was not an even thinning — the loss concentrated in the lower front band and in the left saddle's
  inner nested rings, several of which vanished entirely.
- **Part 2:** land the **four floor + ±10% bars** iteration 3 left measured-and-logged only (torus waist,
  sphere waist, torus `largestW`, sphere `largestW`), so the position is defended rather than unguarded.
- **Do NOT widen** the 0(b) fragment ceiling: keep it at **≤ 55**. Its earlier widening to 80 is exactly what
  let the mid-ring-break regression through undetected.
- **Files ALLOWED:** `src/core/algorithms/scene3d.js` **slices pass only** (`buildSliceSegments` ~:110-168,
  the `contourSlice` pass ~:3359-3440), `src/core/scene3d/mappers.js`,
  `tests/unit/scene3d-contour-slice.test.js`, `tests/unit/scene3d-mappers.test.js`.
- **Files FORBIDDEN:** `surface-fill.js`, `surface-fill-mono.js`, `hlr.js`, `shadows.js`,
  `src/config/context-bar.js`, `geometry-utils.js` fitter (never loosen `acceptable()`), and every part of
  `scene3d.js` outside the slices pass (that is fill-audit-2's file).
- **RED oracle (one line):** on the default torus rig the largest fused ink blob is **2.10 mm** (sphere
  **14.85 mm**) against a **≤ 0.9 mm** bar, and per-region ink retention in the flat lower band is below the
  floor iteration 3 measured — both fail before the fix.
- **Gallery cells to re-shoot: 6** (verified present — `after/W-27c-0a/shots/` already holds this exact set),
  into `after/W-27c-0a/` (iteration 4 subdir): `torus__contourSlice__ladder__{med,max}__a`,
  `sphere__contourSlice__ladder__{med,max}__a`, `solid__contourSlice__ladder__{med,max}__a`.
- **Accept "improved, not fixed"?** That is **Jay's §4 decision 5** — do not close the unit on it; report the
  numbers and stop. Lane order after: W-34 → W-35 (cross-lane: needs `params.js` + `context-bar.js`) →
  W-27c-0a-2 (needs a different mechanism).

---

## Lane fill-audit-2 — first unit **W-15c design D** (F-14: plane shows 3 rulings at d=50)

- **Worktree** `.claude/worktrees/fill-audit-2` · branch `3d-scene/fill-audit-2` · port **8476** · base **main 47a5a755**.
- **Brief status: PLAN-READY, but thin — recommend a short Opus planner pass before implementing.** The
  design-D brief is `W-15c-impl.md` §"What design C (or a design D) still needs" (lines 102-127); the root
  cause and the arithmetic are in `W-15c-plan.md`; what shipped (solo-orientation gate, N = 9) is in
  `W-15c-impl-2.md` and `W-15c-review.md`. Design C was **REVERTED** (6 files / 7 tests) — read why first.
- **What is still open:** the **graded multi-orientation case remains Density-blind** on its lit facets over
  most of the slider. `scene3d-box-density-bearing`'s `[86,86,86]` pin stands untouched. The plan's §2.4
  impossibility result shows no per-facet formula closes it without per-object ladder normalisation.
- **Design-D guidance (from the reverted C):** (1) gate **which** facets receive the grant far more tightly —
  C moved ink on facets the accepted "Density inert on lit facets over most of its range" invariant
  deliberately leaves alone; (2) target a **fractional/pitch** quantity directly rather than flooring to an
  integer count (C tied 25 vs 50 at 4 rulings); (3) re-derive `want`/`target` against **all six** guard
  files, not just the O20/O9 fixtures.
- **Files ALLOWED:** `src/core/algorithms/scene3d.js` **faceted path only**, `src/config/context-bar.js`,
  and the tests below. **Files FORBIDDEN:** `surface-fill*.js`, `mappers.js`, the slices pass
  (`buildSliceSegments` / `contourSlice` — fill-audit-d2's), `hlr.js`, `shadows.js`.
- **Guards that must stay green or be re-pinned WITH proof:** `scene3d-box-density-bearing`,
  `scene3d-facet-tone` (O20/O21), `scene3d-hatch-density-500`, `scene3d-subwindow-density`,
  `scene3d-appdefault-facet-fill`, and the calibration test.
- **RED oracle (one line):** on the graded (multi-orientation) box fixture, lit-facet ruling counts are
  `[86,86,86]` across d = 25/50/100 today — they must strictly increase, while the solo-orientation plane
  (already fixed at N = 9) and the box's own accepted invariants stay byte-identical.
- **Gallery cells to re-shoot: 4** (verified present in the manifests and in `after/W-15c/shots/`), into
  `after/W-15c-D/`: `box__hatch__ladder__med__a`, `solid__hatch__ladder__med__a`,
  `plane__hatch__ladder__med__a` (control — must not move), `plane__contour__ladder__med__a` (control).
- **Do NOT rebuild the gallery** — that is the orchestrator's alone.

---

## Lane handoff-c2 — first unit **U9** (shadow path resolve + uniqueness re-pin)

- **Worktree** `.claude/worktrees/handoff-c2` · branch `3d-scene/handoff-c2` · port **8470** · base **main 47a5a755**.
- **Brief status: PLAN-READY.** `W-22-24-W-18-plan.md` **§U9** (lines 557-585) — files, RED, GREEN, live
  verification and commit message are all written out. Related: `W-30-review.md` (this lane also owns the
  `shadows.js` projector) and `U1-U5-review.md`.
- **⚠ Dependency flag for the orchestrator (secretary):** the plan says U9 runs **LAST in Phase 1**, after
  **U8**. U8 has not run. The *shadow-resolve* half is actionable **now** — `ALIASES` is populated on main
  (`src/config/scene3d-tone-laws.js:909`) and `shadows.js:2713` clamps `shadowBag.shadowToneLaw` before
  `HATCH_LAW_RECIPES` (`shadows.js:1003`, dispatch at `:1195`), so the RED reproduces on main today. The
  *uniqueness re-pin to "offered × collapse options"* and the `onePenDown` /
  `TONE_LAW_NOT_DISTINGUISHABLE` handling are **U8-dependent** — either scope U9 to the resolve half and
  file the re-pin as U9b, or hold U9 until U8. **Orchestrator to rule.**
- **Files ALLOWED:** `src/core/scene3d/shadows.js` (~:2203 and the `normalizeParams` shadow bag at
  `src/core/scene3d/params.js` ~:900 — coordinate, `params.js` is contended with fill-collapse-2's W-10d-2),
  `tests/unit/scene3d-shadow-tone-law.test.js`, `tests/unit/scene3d-shadow-tone-law-uniqueness.test.js`.
- **Files FORBIDDEN:** `surface-fill.js`, `surface-fill-mono.js`, `mappers.js`, the slices pass,
  `src/config/context-bar.js`, `src/ui/panels/scene3d-panel.js` (U5b is editing those now).
- **RED oracle (one line):** a scene with `shadowToneLaw: 'fineLadder'` renders a **different** shadow
  texture on main than at the pre-U0 sha, because the alias shim rewrites it to `ladder` and the recipe falls
  through to the plain-hatch fallback — byte-identity must be restored.
- **Re-pin discipline:** the uniqueness sweep is a guard. Re-pinning it requires the old offered count, the
  new offered count and the collision count (must be **0**) in the commit body **and** under `## Bars changed`.
- **Gallery cells to re-shoot: NONE.** The gallery is **object-only**; no manifest cell renders a cast shadow
  (verified — `after/W-30/` and `after/UnitD-phase/` confirm the pattern). Evidence = a bespoke real-app
  capture: ground plane + directional light, `shadowToneLaw` stepped through each survivor and each
  sub-control option, screenshots into `after/U9/`.

---

## W-36 (NEW USER item, 2026-09-06 18:31 EDT) — **NEEDS PLANNER**

- **Lane:** fill-audit-a2 (`surface-fill.js` owner). **Recommended placement: its own unit, immediately after
  T1b and BEFORE W-31.** Do **not** fold it into W-31's brief — the two are different mechanisms (W-36 is a
  *count/share* regression in the crossing family; W-31 is *spacing evenness within* each family), and W-31's
  cell-shape measurement is meaningless while family B has ~1/10 of family A's lines. **W-31 must be
  re-measured after W-36 lands.**
- **User rule (verbatim):** *"make crosshatch have the same number of crosshatch lines as it has hatch lines
  unless there's a special algorithm that mandates this is not the case or variation is needed for
  highlight/shadow. This seems off."* Full report: `fill-audit/user-reports/16-crosshatch-sphere-one-family.md`.
- **Evidence:** sphere, Type = Crosshatch, Fill Style = Ladder, Fine rungs, Angle 45°, Density 50 renders ONE
  family of ~22 tilted bands and **no** crossing family. The orchestrator's montage counts cylinder ≈ 30 vs
  ≈ 5, ellipsoid ≈ 25 vs ≈ 4, T1 sphere ≈ 24 vs ≈ 8, against the pre-audit v1.3.98 cell
  `shots/A/sphere__crosshatch__ladder__med__a.webp` at ≈ 22 vs ≈ 20. **This is a regression introduced
  between v1.3.98 and the merge.**
- **Secretary's hypothesis (read-only, code cited):** **W-26b's cross-share change, not the Fine-rungs
  cascade and not a picker/param mismatch.**
  `CROSS_SHARE_BASE = 0.1` (`src/core/scene3d/surface-fill.js:4652`) feeds `crossShareOf`
  (`:4657-4660`) and `ladderCrossWantedPitch` (`:4661-4665`): at the shipped default
  `crossDensityRatio = 1` the crossing family's coverage target is `cA * 0.1`, so its wanted pitch is
  `masterPitch / cB` ≈ **10× family A's** — i.e. about one crossing line per ten primary rulings by
  construction. Where `cB` hits `LADDER_COV_MIN = 0.02` (`:4597`) or the `CROSS_DFMAX_BOOST_CAP = 20` step
  ceiling binds (`:9718-9720`), the crossing family can fall to **zero drawn rulings** inside the
  silhouette — Jay's sphere. **Ruled out:** the count path is untouched at ratio 1
  (`Math.max(2, Math.round(count / crossRatio))`, `:10771-10773`), and Fine rungs only adds tone rungs, not
  placement (`isEvenLadder()` at `:4559` routes `fineLadder` down the same continuous path).
- **The tension a planner must resolve:** `CROSS_SHARE_BASE` was deliberately set well under 50/50 to stop
  the two crossed families compounding to `1-(1-c)^2` saturation (W-26b-1's C1 fix, which took cylinder D220
  from 9326.7 → 5153.7 mm). Restoring line *parity* must not restore the saturation. The likely honest shape
  is a share that is near-parity in **count** while the two families share one plot-safety/coverage budget —
  not a return to two independently-full-coverage families.
- **RGR bar (as ruled):** cross-family drawn line count **== hatch-family count within ±10%** on
  sphere / cylinder / torus × ladder × d = 1 / 50 / 220, unless the law documents a deliberate asymmetry or
  the deviation lies in a highlight/shadow zone. **RED on Jay's scene** (sphere, crosshatch, ladder, fine
  rungs, 45°, d=50) and on the three montage cells. Guard that W-26b-1's anti-saturation win survives:
  cylinder D220 crosshatch ink must stay within the C1 band (≈ 5153.7 mm, +4.9% vs pre-W-26), not return
  to 9326.7.
- **Gallery cells to re-shoot: 9+** (all verified present in `manifest.A.*.jsonl` — crosshatch × ladder
  exists for all 12 primitives × low/med/max × angle a/b), into `after/W-36/`:
  `sphere__crosshatch__ladder__{low,med,max}__a`, `cylinder__crosshatch__ladder__{low,med,max}__a`,
  `ellipsoid__crosshatch__ladder__{low,med,max}__a`. Controls that must not move:
  `sphere__hatch__ladder__med__a`, `sphere__contour__ladder__med__a`.
- **Files ALLOWED (expected):** `src/core/scene3d/surface-fill.js` only, plus
  `tests/unit/scene3d-fill-even-spacing.test.js` / a new crosshatch-parity test.
  **FORBIDDEN:** everything else, and in particular `surface-fill.js:5084-5157` (the W-01 master grid).
- **Planner brief:** read-only in a scratch `git archive` export of `47a5a755`; return root cause with
  file:line, the RED oracle with **current measured counts** per cell, ranked fixes, the guard list that
  protects W-26b-1's C1 result, and the stop conditions.
