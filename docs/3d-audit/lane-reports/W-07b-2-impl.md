STATUS: DONE — mechanism redone, all BLOCKING clauses pass, all guards green, evidence captured and looked at

# W-07b-2 implementation — deepFillTSP shadow-third density done with structure, not amplitude

Role: implementer (Sonnet). Worktree `.claude/worktrees/fill-audit-b5`, branch `3d-scene/fill-audit-b5`,
port 8472 (used only for the evidence capture, killed after; verified free). Binding plan:
`docs/3d-audit/lane-reports/W-07b-2-plan.md`. Rejection being redone:
`docs/3d-audit/lane-reports/W-07b-review.md` (REJECT of `776d9285`). Base sha `0b87a9b9` (v1.4.3).
Final worktree HEAD: `5eb81cfb` (revert `4d3501f7` + this unit's implementation commit). Not pushed, no
version bump (worktree — the hook cannot fire there per AGENT-PROTOCOL.md).

## Step 0 — revert

`git revert --no-edit 776d9285` → new commit `4d3501f7` (worktree). Verified
`git diff 0b87a9b9 4d3501f7 -- src/core/scene3d/surface-fill.js tests/unit/scene3d-mark-laws-draw.test.js`
is empty — the revert is byte-identical to base on both files. No part of 776d9285 was kept (the plan's
own §6 flag 2 says explicitly: do NOT keep its lit fix).

## Mechanism implemented (plan §1.1, `src/core/scene3d/surface-fill.js`)

1. `isEvenLadder()` (line 4959-4960): added `|| TONE_ALGO === 'deepFillTSP'`.
2. `algoCoverage`'s deepFillTSP branch (was lines 5278-5311): deleted — dead code after (1); replaced with
   a 5-line pointer comment.
3. `tspAt` (was lines 9558-9613): replaced with `tspAmp` / `tspPeriod` / `tspPrep` / `tspPlace` / `tspNrm`
   / `tspVerts` and the two constants `TSP_CORRIDOR = 0.4`, `TSP_PERIOD_PITCH = 1.6`.
4. Emit-loop call site (was lines 10044-10046): lays `tspVerts(s)`'s point list, NaN `tt` on every
   displaced/inserted vertex.
5. `tspRamp`'s comment (near line 1893): updated ("half the rulings" language removed — comment only).

All of the plan's scratch-only `globalThis.__W07B2_*` knobs and the `W7LOG` hook were stripped — grepped
the final source, zero occurrences of either.

Diff stat: `src/core/scene3d/surface-fill.js` — this unit's diff is contained entirely in regions 1-5 above;
no other line touched. `tests/unit/scene3d-mark-laws-draw.test.js` — only the `W-07` describe block, a new
nested `describe('W-07b-2 …')` appended after the existing 3 W-07 tests (which are untouched and still
pass).

## Tests added

`tests/unit/scene3d-mark-laws-draw.test.js`, nested `describe('W-07b-2 …')` inside the existing `W-07`
describe (only region touched in this file, per plan §4). 26 new tests (file: 17 → 43).

Fixture for every number below, unless stated otherwise: mapper hatch (contour/crosshatch noted per
test), fillAngle 45, DEFAULT_CAMERA (angle a), sun `{azimuth 135, elevation 45, intensity 1, castShadows
false}`, ground and backdrop **off** (no ground-plane ink in any total), BOUNDS `{1200x1000, m 20,
penWidth 0.3}`, density med=50/max=220, rig addLayer = `PRIMITIVE_PARAM_DEFAULTS`, rig create =
`PRIMITIVE_CREATE_DEFAULTS` merged over them — the same construction 776d9285's own (reverted) test used
as `buildRiggedParams`.

- **CLAUSE A (BLOCKING)** — whole-object fill ink (`meta.kind !== 'sceneEdge'`): deepFillTSP >= 1.01x
  Ladder, 12/12 hatch cells (sphere/torus/cone x med/max x both rigs). MEASURED min ratio **1.0208**
  (torus/med/create), max **1.1725** (sphere/med/addLayer) — matches the plan's own table exactly.
  MUTATION PROOF (traverse-off): with amplitude forced to 0, `tspVerts` returns null everywhere and the
  emit loop takes the SAME code path Ladder's own does (provable by inspection of the call site) —
  deepFillTSP degenerates to byte-identical Ladder output. Substituting Ladder's own ink collapses the
  ratio to 1.0000 on all 12 cells — RED.
- **CLAUSE A' (BLOCKING)** — every deepFillTSP fill segment longer than 3x masterPitch has both ends AND
  its midpoint within 0.1mm of a Ladder fill segment on the same cell (any long segment IS the ruling,
  never a traverse hop). MEASURED worst deviation **0.0000mm** on 12/12 hatch cells (plan: worst 0.0001mm
  — consistent). MUTATION PROOF: decimating the real corrected path (drop 3 of every 4 vertices, including
  the traverse's own turning points) re-trips the bound on **12/12** cells (worst deviation 0.12-1.30mm).
- **CLAUSE X (BLOCKING, new bar)** — proper (non-endpoint, non-adjacent-same-path) fill x fill crossings,
  whole object: deepFillTSP <= Ladder. MEASURED **equal to Ladder on 12/12 hatch cells** (0-22) and
  **12/12 contour cells** (Ladder 0 everywhere, deepFillTSP 0 everywhere). MUTATION PROOF: amplifying each
  interior vertex's own deviation from its local chord midpoint by 3x (proxy for 776d9285's
  `TSP_AMP_SHARE=1.5`, ~3.75x this unit's `TSP_CORRIDOR=0.4`) produces 595-11725 crossings on hatch and
  135-1328 hairpins on contour (see CLAUSE D) — RED on 12/12 both mappers.
- **CLAUSE B (BLOCKING)** — lit/mid unchanged: an ambient light of intensity 0.25 (min measured I = 0.25 >
  TSP_I = 0.18) forces the ramp empty; deepFillTSP is byte-identical to Ladder. MEASURED identical **6/6**
  (sphere/torus/cone x med/max, rig addLayer). Oracle sanity check: under the ordinary (non-ambient) sun,
  deepFillTSP is NOT byte-identical to Ladder — proves the equality check is not vacuous.
- **CLAUSE D (BLOCKING, new bar)** — contour mapper has no hairpin spikes (turn > 150deg vertices):
  deepFillTSP <= Ladder (0) on 12/12 contour cells. MEASURED **0 on 12/12**. This also closes the §5.4
  pre-existing contour-mapper defect (base and 776d9285 both carry it, undiscovered by either W-07b
  report because both swept `hatch` only).
- **crosshatch sweep (3/3 cells, med, addLayer)** — CLAUSE A and A' asserted (X deliberately excluded per
  plan §5.5: the zig-zag legitimately crosses the OTHER family's own rulings more often than a straight
  line would, and the output carries no family tag to separate same-family from cross-family crossings).

### RED proof — historical, via scratch `git archive`

Per the harness instructions, no git/child_process/`/private/tmp` path appears in the committed test file
(grepped, confirmed clean) — the committed tests are pure `algo.generate()` calls. The historical RED
proof was produced OUT OF BAND, in scratch trees under
`/private/tmp/claude-501/scratch-W-07b-2-impl/{base,rejected,mutant-nan}` (`node_modules` symlinked to the
worktree's), never by editing/stashing the worktree:

- **`base` = `git archive 0b87a9b9`** (pre-fix). The new test file copied in and run:
  **7/43 fail** — exactly CLAUSE A, CLAUSE A', CLAUSE X (hatch), CLAUSE B, crosshatch CLAUSE A, contour
  CLAUSE D, plus the CLAUSE-X-mutation test's own body (which reads pre-fix TSP output and finds 0
  crossings to begin with, an artifact of base's own near-inert traverse, not a defect in the mutation
  logic itself). All 3 pre-existing W-07 tests and the rest of the file stay green — this unit's tests are
  additive-only.
- **`rejected` = `git archive 776d9285`** (the REJECTED unit). The new test file copied in and run:
  **6/43 fail** — CLAUSE A' (hatch and crosshatch), CLAUSE X (hatch and contour), CLAUSE B, CLAUSE D.
  **CLAUSE A itself PASSES on 776d9285** — exactly the review's own finding: the amplitude-only fix bought
  the ink bar, but at the cost of the crossing/segment/hairpin bars this unit adds. This is direct evidence
  the new bars catch precisely the defect the reviewer measured (4.3-6.4x Ladder's own crossing rate) that
  the old CLAUSE-A-only test could not.
- **`mutant-nan`** = this unit's own real fix, source-patched to remove ONLY the NaN-tt guard at the
  emit-loop call site (`q.__t != null ? (s - 1 + q.__t) / nSteps : tt` instead of `NaN`) — a genuine,
  faithful mutation of the shipped mechanism (not a proxy), reproducing exactly what `refineFillRunTurns`
  would do if the guard were absent. Full file run: **1/43 fails — CLAUSE D alone** (200 hairpins on the
  first tripped cell, `expected 200 to be less than or equal to 0`). Every other clause (A, A', X, B and
  all their mutation proofs) is untouched by this specific guard, exactly as expected — this is the
  cleanest possible proof that the NaN-tt guard is load-bearing for CLAUSE D and nothing else.

### GREEN — worktree, real fix

`npx vitest run tests/unit/scene3d-mark-laws-draw.test.js` (foreground): **43/43 passing**, 26.84s.

## Guards (plan §5)

Run in the worktree, foreground, `timeout: 600000` each:
- `scene3d-mark-laws-draw.test.js` — 43/43 (see above; supersedes the plan's stated "30/30" baseline
  because this unit's own sweep is broader than the plan's minimum).
- `scene3d-tone-law-dispatch.test.js` — **7/7** (346.4s; heavily contended by an unrelated, concurrently
  running `npm run test:unit` full-suite process on this shared machine — not started by this session. One
  pre-existing benign `[vitest-worker]: Timeout calling "onTaskUpdate"` RPC warning, exit code 0 — matches
  the documented shared-machine noise in ROUND3-RESUME-BRIEFS.md §0b, not a regression).
- `scene3d-one-pen-down-reachability.test.js` — **5/5** (28.0s; pre-existing `[FillBoolean] polygon union
  failed on degenerate geometry` stderr noise, also documented pre-existing).
- `integration/scene3d-fill-style-picker.test.js` — **177/177** (64.6s).
- `scene3d-tone-law-collapse.test.js` (singleFork) — **121/121** (825.5s; started foreground with
  `timeout: 600000` per §0b, exceeded the tool's 600s ceiling and was backgrounded exactly as the
  documented amendment describes, then completed exit 0 with the same benign onTaskUpdate warning).
- Pin check (rule 4): grepped all 4 guard files for `deepFillTSP` — every hit is a roster-list entry or
  caveat text (`scene3d-tone-law-dispatch.test.js:43`, `scene3d-one-pen-down-reachability.test.js:35`,
  `scene3d-tone-law-collapse.test.js:1923,1942`, `scene3d-fill-style-picker.test.js:196,2091`). No geometry
  fingerprint is pinned on deepFillTSP anywhere.

## Evidence

Captured from MAIN with the exact command in the brief, both rigs:
```
node scripts/audit/scene3d-capture.js --tier B --root .claude/worktrees/fill-audit-b5 --port 8472 \
  --only '^(sphere|torus|cone)__(hatch|contour)__(ladder|deepFillTSP)__(med|max)__a$' \
  --out docs/3d-audit/fill-audit/after/W-07b-2
node scripts/audit/scene3d-capture.js --tier B --root .claude/worktrees/fill-audit-b5 --port 8472 --rig addLayer \
  --only '^(sphere|torus|cone)__(hatch|contour)__(ladder|deepFillTSP)__(med|max)__a$' \
  --out docs/3d-audit/fill-audit/after/W-07b-2
```
Both runs printed `served version 1.4.3` (matches the worktree's `package.json`). 48 shots total under
`after/W-07b-2/shots/B/`; dev server (port 8472) killed after capture, verified free (`lsof -i :8472` empty).

Native, un-upscaled bottom-left-quadrant crops made for all 48 shots (`after/W-07b-2/crops/*__shadowcrop.png`).
**Looked at directly (Read tool, native resolution)** on 8 representative crops spanning both mappers, all
3 primitives, both densities, both rigs:
- `sphere__hatch__deepFillTSP__med__a` — a clean, even, same-period 45deg sawtooth on every ruling, no
  self- or neighbour-crossing scribble. The paired `sphere__hatch__ladder__med__a` crop shows the SAME
  ruling positions with no traverse — deepFillTSP visibly adds ink on the identical scaffold (CLAUSE A,
  visually confirmed).
- `sphere__hatch__deepFillTSP__max__a` and `torus__hatch__deepFillTSP__max__a` — a fine, regular
  diamond-weave texture at max density, no scribble, no stray long strokes.
- `cone__hatch__deepFillTSP__med__a` — same clean sawtooth on a converging-apex primitive.
- `sphere__contour__deepFillTSP__med__a` and `cone__contour__deepFillTSP__max__a__addlayer` — a clean
  zig-zag on the contour mapper too, no hairpin ticks or spikes (CLAUSE D, visually confirmed).

This reads exactly as the plan's own §3 description ("a clean, deliberate zig-zag hatch... a fine, regular
diamond-weave texture... no scribble and no crossings") and is visibly the opposite of the REJECTED unit's
scribble (`docs/3d-audit/fill-audit/after/W-07b/crops/*shadowcrop*`).

## Bars changed

None. Every assertion added by this unit is new (`describe('W-07b-2 …')`); the 3 pre-existing W-07 tests
are untouched and still pass unmodified. No existing threshold, population, or fixture was touched.

## Pre-existing red

None found in the guard suites attributable to another unit (T2-7's mkTick edits are outside this unit's
Files Allowed region and were not touched).

## Open follow-ups (carried from the plan, not this unit's scope)

1. Pre-existing Ladder seam duplicate at closed-chart frac≈1/frac 0 (plan §7.1) — `emitContFamily`'s own
   lane, not touched here.
2. `docs/tone-laws/laws.json` → `scene3d-tone-laws.js` mechanism text for deepFillTSP is stale (plan §7.2).
3. Fill x silhouette-edge crossings (2 of 12 cells show proto slightly above Ladder, plan §7.3) — flagged,
   not gated.
4. Camera angle b and density low are not measured; crosshatch has no same-family crossing oracle.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
