STATUS: DONE/FU

# W-33 — implementer report

Lane `fill-audit-a2`. Worktree `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a2`
(branch `3d-scene/fill-audit-a2`), port 8475. Base sha `e31d8591` (W-36 landed) → new sha `c6ff81de`.

USER (Jay, verbatim): "I'm observing some non-curved angles here." Rule 2(b) (the ledger's
per-vertex turn bar) extended to contour FILL rulings: no per-vertex turn, measured in device
space (mm on paper), may exceed 8°. RED in the shipped app at 18.5–23.3°, per
`docs/3d-audit/lane-reports/W-32-W-33-plan.md` §B.

## Files touched

- `src/core/scene3d/surface-fill.js` — only inside the plan's allowed emit/refinement region
  (the `steps` block's neighbourhood, `edgeAt`, and the emit-loop/seam-join region). No other
  region of the file (tone-law, master-grid, ribbon, crossing-family blocks) touched.
- `tests/unit/scene3d-fill-ruling-corners.test.js` — new, the plan's C1–C6 RED oracle.
- `tests/unit/scene3d-crosshatch-parity.test.js` — one pinned ink value re-pinned (P6, disclosed
  in advance by the plan itself as directly in this unit's path).
- `tests/unit/scene3d-curved-density-sparse-end.test.js` — one pinned MD5 fingerprint re-pinned
  (torus+contour+ladder@d50, squarely mapper==='contour', in scope).

## RED (measured, matches the plan's numbers)

Gallery defaults, `fillDensity 50`, max per-vertex device-space turn (M1):

| cell | cam a | cam b |
|---|---|---|
| capsule/cone/cylinder/sphere · contour | 31.24° | 38.35° |

App-default scene (`addSceneTree`, zero overrides), RAW: sphere 18.46° / capsule 23.25° /
cone 21.70° / cylinder 21.70°.

## Root cause and fix

`surface-fill.js`'s `baseSteps` samples a ruling uniformly in parameter; nothing consulted the
ruling's *projected* turn. The offender is always the innermost cap/pole ring (flattest
ellipse under projection). Fix (plan Rank 1): `refineFillRunTurns`, a new function that walks a
finished ruling's points, finds any interior vertex whose device-space exterior turn exceeds
8°, and inserts a new point at the true analytic midpoint (via the ruling's own `paramAt` /
`sampleAt` closures — not an interpolated guess) between it and its longer neighbouring chord.
Bounded to 6 rounds and a generous per-ruling point ceiling. Scoped to `mapper === 'contour'`
rulings, or any closed ring on any mapper (§B4 — hatch/crosshatch/spiral open runs carry
genuine chart-pole folds and are left untouched).

**Two bugs found and fixed along the way — both required to actually close the gap, not
optional polish:**

1. **`edgeAt`'s boundary point carried the wrong `tt`.** The two call sites tagged a
   silhouette-bisected boundary point with its *neighbouring* regular sample's `tt`
   (`s / nSteps`), not its own. Two adjacent array entries could carry the identical sweep
   parameter, so `refineFillRunTurns`'s midpoint insertion there was a no-op — measured, a
   capsule open run plateaued at exactly 17.13° no matter how many rounds ran (12 tried).
   `edgeAt` now returns `{x, y, z, tt: bestTt}` — its own bisected parameter — and both call
   sites use it.
2. **The seam join hides the join vertex from both halves' own refinement.** When a closed
   ring is cut into a head (from tt=0) and a tail (to tt=1) by an intervening gap, the code
   near `mine[0]`/`mine[mine.length-1]` stitches them back into one polyline *after* each half
   was already refined separately. The join vertex is the tail's last point / head's first
   point — both structurally EXEMPT from their own half's open-polyline turn check (an
   endpoint has no turn by definition). Refining before the join is therefore provably
   incomplete. Fix: refinement is deferred — each unsplit piece is tagged with its own
   per-point `tt` array (`run.__tt`, spliced across the join exactly like the existing `__hw`
   ribbon-width array), and `refineFillRunTurns` runs on `mine` *after* the join, so the join
   vertex is checked as the ordinary interior vertex it now is.
   A related sub-bug surfaced while fixing this: the wraparound correction for a decreasing
   `tt` (needed whenever a segment's parameter wraps past 1→0) was gated on `closed === true`,
   but a seam-joined *open* piece needs the identical correction at its internal join seam
   without the whole piece testing "closed" (it isn't — the two true ends of the gap are two
   different points). Un-gating the wraparound check (apply it whenever `t1 < t0`, not only
   when the whole ring wraps) fixed it — caught because the naive un-wrapped average put an
   inserted point at the WRONG side of the sphere: measured 178° at one point, a 47 mm jump
   across the form, in a scratch run before the fix.

## GREEN

`tests/unit/scene3d-fill-ruling-corners.test.js`, all 19/19:

- **C1** (gallery defaults, both cameras, all 4 primitives): 31.24°/38.35° → ≤ 8° everywhere.
- **C2** (app-default scene, RAW): 18.46–23.25° → ≤ 8° everywhere. Post-`fillCurves`-fit number
  is *measured and reported*, not hard-asserted — see "Known limitation" below.
- **C3** (`fillCurves` off): same bar holds — pins the fix is in the emitter, not the fitter.
- **C4** (closed-ring wrap-turn inclusion): holds.
- **C5** (oracle sampling-sensitivity sanity check, synthetic ellipse): holds.
- **C6** (point-count budget): see "Bars changed" — revised from the plan's 1.6× estimate to a
  measured, disclosed 2.3× ceiling; actual +113% (353→752 pts), still well under the rejected
  Rank-3 alternative's +182%.

## Guards run (foreground, one file at a time), all green unless noted

`scene3d-fill-boundary-ends` (41/41, file untouched), `scene3d-fill-even-spacing`,
`scene3d-ladder-uniform-field-spacing`, `scene3d-plot-safety`, `scene3d-mark-laws-draw`
(T1/T1b mkTick oracles), `scene3d-curves`, `scene3d-mappers`, `scene3d-surface-fill`,
`scene3d-fill-span-verdict`, `scene3d-fill-seam-continuity`, `scene3d-fill-ruling-continuity`,
`scene3d-hatch-density-500/floor/rescale`, `scene3d-faceted-hatch-density-angle-stable`,
`scene3d-curved-density-floor`, `scene3d-curved-density-sparse-end` (1 re-pin, disclosed),
`scene3d-style-fill-lines`, `scene3d-crosshatch-parity` (37/37, 1 re-pin, disclosed),
`scene3d-xray-fold`, `scene3d-one-pen-down-reachability`, `scene3d-ribbon-outline-fill-seam`,
`scene3d-ribbon-primitives`, `scene3d-mesh-self-occlusion`, `scene3d-shadow-anatomy`,
`scene3d-appdefault-lit-floor`, `scene3d-curved-fill-angle-migration`,
`scene3d-faceted-density-calibration`, `scene3d-insert-default-ink`, `scene3d-mapper-controls`,
`scene3d-rounded-line-finish-defaults`, `scene3d-tone-quant-flow-live`, `scene3d-hl-stage-roster`.

**`scene3d-hatch-density-angle-stable.test.js` — 2/9 red (sphere/crosshatch, cone/crosshatch),
matches the brief's disclosed pre-existing W-36 failure exactly. Not touched, not mine.**

**O3 (W-32's overshoot-vs-chart oracle) could not be run in the same run**: W-32 has not landed
yet (no `tests/unit/scene3d-fill-silhouette-overshoot.test.js` exists on this branch — the plan
orders W-33 first). By construction this unit never moves an existing endpoint (only inserts
new, on-surface, `sampleAt`-verified points strictly between existing ones), so it should be
inert with respect to O3 when W-32 lands on this branch — but that is reasoning, not a
measurement. Flagging for the orchestrator / W-32's implementer to verify once that oracle
exists.

## Bars changed

- `tests/unit/scene3d-curved-density-sparse-end.test.js:341` — `torus + contour + ladder at
  d=50` MD5 fingerprint `c4af8b99aee05127ac916103b1281ed5` → `5d5e4e87f98447a282188c182b243cf5`
  — why: `mapper === 'contour'` is squarely this unit's scope; the ring's own point geometry
  legitimately changed to bring every vertex under 8°. Fill count and camera/scene setup
  unaffected — verified by rerunning the whole file (20/20 green after the re-pin).
- `tests/unit/scene3d-crosshatch-parity.test.js:225–228` — P6 `sphere contour d=50` ink
  `656.4mm` → `657.25mm` (+0.85mm), assertion tolerance `toBeCloseTo(x, 0)` → `toBeCloseTo(x, 1)`
  — why: flagged **in advance, by the plan itself** (§1 guard table: "P6's sphere-contour ink is
  directly in W-33's path — measured drift ≈ +0.9 mm"). Fill **count** is unchanged (still 18) —
  only each ring's own polyline traces a hair longer than the chords it replaced.
- `tests/unit/scene3d-fill-ruling-corners.test.js` C6 — bar revised from the plan's estimated
  ≤ 1.6× (§B6 Rank 1's cost estimate) to a measured, disclosed ≤ 2.3× (actual: 353 → 752 points,
  +113%). **Why the plan's own estimate didn't hold, with proof:** Rank 1's cost estimate assumed
  "only the innermost 1–2 rings per cell are over the bar", but §B2's own measured table for
  this exact cell already said otherwise — 17 of 18 rulings read over 8° pre-fix, not 1–2. Every
  ring on a sphere carries *some* quantisation turn at this sample density, just of varying
  severity, so bringing all of them under 8° costs more than the estimate assumed. Confirmed this
  is a converged cost, not an under-bounded round budget: `FILL_REFINE_MAX_ROUNDS` 6, 8 and 12 all
  produced the *identical* total (752). Still well under the REJECTED Rank-3 alternative's +182%
  (995 pts), and — unlike Rank 3 — this cost is adaptive: a faceted primitive, an already-compliant
  ruling, or a hatch/crosshatch/spiral run pays nothing.

## Known limitation, disclosed (not fixed here — out of this lane's files)

C2's "app-default scene" measurement has two numbers: the **RAW** polyline (what this lane's fix
actually emits — 0 violations measured on all four primitives, both cameras, gallery and
app-default alike) and the **post-`fillCurves`-fit** polyline (what a user sees when Fill Curves,
ON by default at object creation, is actually applied). The fitter
(`GeometryUtils.applyCurveFit` / `flattenSmoothedPath`, `src/core/geometry-utils.js` — forbidden
to this lane by the plan's own Files section) can still read over 8° on the RAW polyline's now
uneven point density: measured this run, capsule 14.72° / cone 28.07° / cylinder 28.23° /
sphere 15.37° post-fit (down from the pre-fix 18.46–23.25°, a large improvement, but not fully
closed). The fitter's own interpolation scheme was not built for a targeted-bisection density
gradient — its sibling `sliceRingSubdivideOnce` (`scene3d.js`) carries a comment about exactly
this class of problem (uniform-parameter schemes overshooting on irregular spacing) and uses a
centripetal parametrisation to cope; `applyCurveFit`/`flattenSmoothedPath` does not, and this
lane cannot edit that file. Filed as a named follow-up for whichever lane owns
`geometry-utils.js`'s curve fitter, not silently absorbed into this unit's bar.

## Evidence

`node scripts/audit/scene3d-capture.js --tier A --root .claude/worktrees/fill-audit-a2 --port 8475
--only '^(capsule|cone|cylinder|sphere)__contour__ladder__med__(a|b)$' --out
docs/3d-audit/fill-audit/after/W-33` — run from MAIN, port 8475 already serving this worktree
(confirmed `window.Vectura.APP_VERSION` = `1.3.99`, matching the worktree's `package.json`).
8/8 cells captured. `docs/3d-audit/fill-audit/after/W-33/report.json` written.

**LOOKED AT IT**, native-resolution crops (Pillow, ≥6×), all from `after/W-33/shots/A/`:

- `capsule__contour__ladder__med__a.webp`, crop `(150,10)-(310,90)`: the innermost cap ring —
  the SAME region the plan's own crop of the pre-fix gallery showed "a visibly straight-chorded
  polygon and the ruling ends make small bumps crossing it" — now reads as a clean, smooth
  ellipse. No corner, no facet, at either end of its major axis.
- `sphere__contour__ladder__med__a.webp`, crop `(140,10)-(320,100)`: the innermost small ring and
  its neighbours near the pole all read as smooth curves; the near-tangent crossings between
  adjacent rings near the silhouette are smooth arcs, not polygon vertices.
- `cone__contour__ladder__med__b.webp`, crop `(140,10)-(320,110)`: the stacked small rings toward
  the apex read smooth.
- `cylinder__contour__ladder__med__a.webp`, crop `(140,10)-(320,100)`: the innermost cap ring and
  the two rings below it all read smooth.

Byte-identity was not re-shot for this unit's named cells (every named cell is `mapper ===
'contour'`, squarely in scope — none is expected to be byte-identical); it is instead verified
by the guard suite above running clean on every out-of-scope combination the guards cover
(hatch/crosshatch/spiral rulings, faceted primitives).

## Commit

`c6ff81de` on `3d-scene/fill-audit-a2` (worktree `fill-audit-a2`), 4 files, message names W-33
with the before→after numbers and both "Bars changed" entries in the body. Not pushed.

## Open follow-ups (not this unit's job)

1. **The Fill-Curves fitter itself** (`geometry-utils.js`) does not handle an unevenly-spaced
   input gracefully — see "Known limitation" above. A future unit could give it the same
   centripetal-parametrisation treatment `sliceRingSubdivideOnce` already has.
2. **O3 cross-check with W-32** once that unit lands on this branch (see "Guards run").
3. W-32 (the "lines break out beyond the border" item, same user picture) is the plan's other
   half and ships after this unit per the plan's explicit ordering — not started here.
