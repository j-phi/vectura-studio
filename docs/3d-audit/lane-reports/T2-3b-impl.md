STATUS: DONE

# T2-3b — implementer report

Lane `fill-audit-a3`, worktree `.claude/worktrees/fill-audit-a3`, branch
`3d-scene/fill-audit-a3`. Base sha `c28b3490` (verified clean, no stash, no
other WIP, before starting). Two commits, as directed:

- **Commit 1** `56481503` — deliverable (a): replace the vacuous
  `git show HEAD:` self-test.
- **Commit 2** `a8e2269f` — deliverable (b): fix the CONTOUR-mapper moiré
  (Rank 1) + ship its banding instrument as a bar.

Never pushed, never merged. Port 8475 not used — this unit needed no gallery
server, only `node`/`vitest` against the worktree and scratch `git archive`
exports (`/private/tmp/claude-501/scratch-T23b*`, all removed after use).

## Files touched

- `src/core/scene3d/surface-fill.js` — three lines inside the `lenChan`
  branch of `solveAt` (`:6539-6542` on `c28b3490`; comment block added
  around them). Nothing else in the file.
- `tests/unit/scene3d-mktick-wedge.test.js` — commit 1's golden-pin
  replacement, plus (commit 2) the `Lfloor` live-source assertion, the
  re-pinned 12 `pathSignature` goldens (Rank 1 changes mkTick's geometry),
  and the `O5` bar 3.0 -> 2.30.
- `tests/helpers/scene3d-mktick-band.js` — NEW. The banding instrument, a
  JS port of `T2-3b-plan-evidence/tools/band.py`.
- `tests/unit/scene3d-mktick-banding.test.js` — NEW. Instrument correctness,
  the gated bar, mutation-kill 1, the contrast mutation, the negative
  control, and a report-only pass over all six cells.

## lenChan consumers (blast-radius, per the orchestrator's added requirement)

`grep -n "chan:" src/core/scene3d/surface-fill.js` on `c28b3490` shows the
`MK` table has 12 rows; `chan: 'len'` appears on exactly ONE of them —
`mkTick` (`:2620`). Every other row is `'size'` (`mkDotScreen`, `mkLozenge`,
`mkChevron`, `mkCrossPlus`, `mkTriangle`), `'elong'` (`mkDashRamp`,
`mkSFlick`), `'count'` (`mkComma`, `mkRadialFlick`), `'amp'` (`mkScribble`)
or `'alt'` (`mkDotLozenge`). `solveAt`'s own selector
(`const lenChan = law.chan === 'len';`, `:6470`) is a plain equality, so
structurally NO other law can reach Rank 1's three lines — they live wholly
inside `else if (lenChan)`.

Separately discovered while building the sweep: of those 12 MK-table rows,
only FOUR are wired into the user-facing `toneLaw` roster at all
(`src/config/scene3d-tone-laws.js`'s `PRODUCTION` list) — `mkScribble`,
`mkTick`, `mkDashRamp`, `mkDotScreen`. Requesting any of the other eight by
id (`mkLozenge`, `mkChevron`, `mkComma`, `mkSFlick`, `mkCrossPlus`,
`mkTriangle`, `mkDotLozenge`, `mkRadialFlick`) logs "unknown toneLaw... 
falling back to 'ladder'" and never reaches `solveAt` with that law at all —
so the real blast radius, restricted to what a user can ever select, is
narrower than the 12-row table suggests.

**Measured, not just argued.** A byte-identity sweep of the three
non-`mkTick` PRODUCTION laws (`mkScribble`, `mkDashRamp`, `mkDotScreen`) x
all 8 mappers (`none, hatch, wireframe, crosshatch, contour, spiral,
stipple, contourSlice`) x 3 primitives (`sphere, cone, torus`) x 2 rigs
(`test, create`) x 2 densities (`d50, d220`) = **288 combinations**,
`pathSignature(paths, 4)` compared between a scratch `git archive c28b3490`
(pre-Rank-1) and this tree (post-Rank-1): **288/288 byte-identical, 0
diffs.** Combined with the grep proof and the negative-control mutation
below (which edits `mkComma`'s `L0` — a `countChan`-branch constant — and
re-renders `mkTick`, confirming `bandC` is unchanged to 1e-9), the blast
radius is confirmed at mkTick's own 12 cells (6 cells x 2 rigs), exactly the
plan's scope. Scratch dirs removed after the sweep.

## Deliverable (a) — commit `56481503`

`tests/unit/scene3d-mktick-wedge.test.js`'s "RED at the pre-fix tree" block
read `git show HEAD:...`, which IS the post-fix tree at the commit that
ships the file — reproduced exactly as briefed: **44 passed / 2 skipped / 1
failed file** before the fix. Replaced with the `W-38b` pattern:

- Leg 1: 12 pinned `pathSignature(paths, 4)` goldens (one per rig x cell),
  recorded from this tree with the table empty, pasted back verbatim.
- Leg 2: a live-disk-source mechanism assertion (`mkTick` is on
  `chan:'len'`, not `chan:'count'`).

File: **57/57 green** after commit 1 (before Rank 1 landed).

## Deliverable (b) — root cause, fix, and the bar

### Root cause (re-derived on `c28b3490`, line numbers below are THIS tree's)

`surface-fill.js:6539-6542`, the `lenChan` branch of `solveAt`:

```js
const t = clamp(1 - I, 0, 1);
const eased = (1 - MK_TICK_EASE_BLEND) * t + MK_TICK_EASE_BLEND * (t * t * (3 - 2 * t));
L = (law.LMIN || 0) * R + (law.L0 - (law.LMIN || 0)) * R * eased;
P = clamp(L / Math.max(1e-6, g), PMIN, MK_PMAX);
```

Unlike its `countChan` sibling three lines above (`:6509-6513`, which
re-solves `L = Math.min(g * P, capOf(P))` when `P` clamps to `PMIN`), this
branch derives `P` from `L` and stops. When `I` is in the midtone
(`[0.30, 0.90]` on the plan's own instrumented fixture), `P` pins at
`PMIN` and the delivered ink area `L*w/(R*P)` sags below `mkAsk(I)` by up to
25% — a second, unasked-for tone transfer printed along the isophotes. On
the `contour` mapper the row family follows the surface's own latitude, so
the isophote cuts obliquely across the rows and the sag reads as a
**diagonal** moiré — exactly `T2-3-review.md`'s photograph.

### The fix — Rank 1, applied exactly as `T2-3b-plan.md` §4 prototyped

```js
const Lease = (law.LMIN || 0) * R + (law.L0 - (law.LMIN || 0)) * R * eased;
const Lfloor = g * PMIN;
L = Math.min(law.L0 * R, Math.pow(Math.pow(Lease, 4) + Math.pow(Lfloor, 4), 1 / 4));
P = clamp(L / Math.max(1e-6, g), PMIN, MK_PMAX);
```

A smooth (4-norm) floor rather than a hard `max` (avoids adding a new
hard-edged isophote of its own), capped at the shipped `L0*R` (keeps
black-by-abutment bit-for-bit unchanged at the dark anchor).

### ORCHESTRATOR RULING implemented: option (A), alpha=1, L0=1.16

Shipped exactly as ruled — `MK.mkTick.L0` stays **1.16** (no constant
changes to the MK table at all); only the three `Lfloor` lines were added.

## Bars changed

- `tests/unit/scene3d-mktick-wedge.test.js:343` — **`O5 >= 3.0` -> `O5 >=
  2.30`.** Per the orchestrator's ruling on `T2-3b-plan.md` §4.4 option (A).
  Derivation (plan §3.4, re-verified on this tree): at the period floor
  (`P = PMIN`) the maximum deliverable ink-area fraction at a given tick
  length is `(L/R)*(w/PMIN) = 0.909*L/R`, so an area-correct tick has
  `L >= mkAsk(I)*R/0.909` — the tone *determines* the length over the whole
  midtone, and O5 (dark-third / light-third mean length) collapses onto the
  ratio of `mkAsk` over those thirds, which on this fixture is ~2.3-3.2.
  `O5 >= 3.0` was T2-3's own planner's PROXY for R1 ("tick length carries
  the tone"), not a number Jay chose, and sits above what an area-correct
  design at this row density can reach. Measured Rank 1 range on THIS tree:
  **2.330-3.221 (test) / 2.437-3.221 (create), monotone 12/12.** This is a
  LOWERED bar, disclosed here and in the commit body, per Jay's ruling
  quoted in the orchestrator's ruling above (do not re-lower further without
  the same §3.4 proof).
- `tests/unit/scene3d-mktick-wedge.test.js` — **POPULATION CHANGE, 12
  goldens re-pinned.** Rank 1 changes mkTick's geometry on all 12
  (rig, cell) combinations (this IS mutation-kill 1's own proof — see
  below). Old (pre-Rank-1, commit 1) values are in that commit's diff; new
  values pasted into the table in commit 2.
- `tests/unit/scene3d-mktick-banding.test.js` — **NEW bar** (does not modify
  an existing one): `bandC` per cell <= the shipped, never-flagged
  `mkDotScreen` reading on the identical fixture, for `sphere/contour` and
  `cone/contour`, both rigs — GATED. Plus a non-regression clause: `bandC`
  must not exceed the PINNED T2-3-shipped (pre-Rank-1) reading by more than
  5%. Both clauses PASS with margin on all 4 gated combinations (measured
  below). `torus/*` and `*/hatch` are measured (report-only test) but not
  gated — see "Torus disclosure" below.
- `src/core/scene3d/surface-fill.js` — **no MK-table constant changes.**
  `MK.mkTick.L0` stays 1.16, `LMIN` stays 0.18, `P0` stays 1.02,
  `MK_TICK_EASE_BLEND` stays 0.92, `MK_ROW_COV`/`MK_PMIN`/`MK_PMAX`/
  `MK_DARK_AREA`/`MK_LIGHT_AREA`/`MK_BAND_MAX_PASSES`/`MK_MIN_ADJ_PEN`/
  `MK_MAX_WALK_STEPS`/`MIN_MARK_PEN` all untouched. `wedge25`'s mean/ceiling
  bars and `siteCoverage >= 0.90` are unchanged and met with margin by
  Rank 1 (see per-cell table).

## Decision 13 for Jay

The banding fix (Rank 1, shipped) costs tick-length range: O5 moves from
3.008-4.281 (shipped, banded) to 2.330-3.221 (fixed, band-free), still
monotone 12/12 — length still visibly carries tone, just over a narrower
range, because an area-correct tick's length is arithmetically determined by
the tone at this row density (`T2-3b-plan.md` §3.4). The only measured route
to recovering BOTH the wider O5 range and the band-free result is halving
the row pitch (plan §3.3: `MK_ROW_COV` 1/3 -> 2/3 alone takes
`create|sphere/contour` `bandC` from 0.1172 to 0.0527, and with Rank 1 also
applied to 0.0447 — at or below pre). That is `MK_ROW_COV`/row-pitch code,
which this unit is explicitly FORBIDDEN to touch (it is T3's). Filed as
**T2-3c**, targeted at the row-pitch/`MK_ROW_COV` code, not this unit.

## Per-cell table — all six cells, both rigs (measured on `c28b3490` + Rank 1)

`bandC` = this unit's own instrument (`scene3d-mktick-band.js`); `wedge25`,
`holeMax`, `siteCoverage`, `O5` = the shipped, unmodified
`scene3d-mktick-wedge.js` helper. Fixture: `renderCell` (both test files),
`fillDensity: 50` ("med"), no ground/backdrop, `DEFAULT_CAMERA`, sun at
azimuth 135/elevation 45, `toneLaw: 'mkTick'`. `siteCoverage` reported, not
gating (proven blind to both the wedge and the moiré).

| rig | cell | O5 (>= 2.30) | wedge25 | holeMax | siteCoverage | bandC | mkDotScreen bandC (same fixture) |
|---|---|---|---|---|---|---|---|
| test | sphere/hatch | 3.158 | 0.0781 | 1.110 | 0.984 | 0.1171 | 0.1504 |
| test | sphere/contour | 2.364 | 0.0668 | 1.079 | 0.990 | **0.0435** | **0.0746** |
| test | torus/hatch | 2.330 | 0.0766 | 1.044 | 0.992 | 0.2265 (reported) | 0.2932 |
| test | torus/contour | 2.779 | 0.0874 | 1.081 | 0.990 | 0.2927 (reported) | 0.6733 |
| test | cone/hatch | 2.710 | 0.0697 | 0.984 | 0.983 | 0.1132 | 0.2499 |
| test | cone/contour | 2.953 | 0.0748 | 1.039 | 0.995 | **0.0221** | **0.0581** |
| create | sphere/hatch | 3.221 | 0.0544 | 0.992 | 0.981 | 0.0793 | 0.1490 |
| create | sphere/contour | 2.439 | 0.0649 | 1.038 | 0.991 | **0.0491** | **0.0659** |
| create | torus/hatch | 2.465 | 0.1381 | 0.980 | 0.991 | 0.2889 (reported) | 0.4229 |
| create | torus/contour | 3.063 | 0.1728 | 0.991 | 0.972 | 0.4696 (reported) | 0.4421 |
| create | cone/hatch | 2.437 | 0.0605 | 1.038 | 0.988 | 0.0892 | 0.2627 |
| create | cone/contour | 2.614 | 0.0411 | 0.995 | 0.999 | **0.0258** | **0.0444** |

**Gated cells (bold) all pass both `bandC` clauses with margin** (below
`mkDotScreen`, and see the non-regression table below).

### Torus disclosure (reported, not gated)

Torus reads high/noisy on `bandC` on BOTH the shipped and Rank-1 trees, and
on mkDotScreen too — it is not mkTick-specific. This instrument's object
mask (morphological closing then a full-row-pitch erosion) is dominated on
torus by the shape's own hole and fan convergence, exactly the
"pre-existing structural reading" `T2-3b-plan.md` §1.5 flagged for its
(more sophisticated, scipy-based) Python reference instrument — this JS
port's simpler closing is, if anything, MORE sensitive to it. `create rig
torus/contour` (0.4696) even reads slightly above its own mkDotScreen
reading (0.4421) — disclosed here rather than silently excluded. Torus is
reported (the `report-only` describe block in
`scene3d-mktick-banding.test.js` asserts only that the numbers are finite,
never gates them), consistent with the plan's own treatment.

## RED, at `c28b3490`, scratch `git archive` (never in the worktree)

Built `/private/tmp/claude-501/scratch-T23b-impl/` from `git archive
c28b3490`, `node_modules` symlinked, copied in the (yet-to-be-committed)
`scene3d-mktick-banding.test.js` + its helper, and ran the file
unmodified — this reproduces exactly what the file would have measured
had it existed at the base sha:

- **4 failed, 14 passed, 4 skipped (22 total).**
- The `Lfloor` live-source assertion: **FAIL** (no `Lfloor` on this tree —
  correct, that IS the fix this unit adds).
- `bandC <= mkDotScreen` (the gated bar): **FAIL on 3 of 4** —
  `test|sphere/contour` (0.0955 > 0.0746), `create|sphere/contour` (0.1121 >
  0.0659), `create|cone/contour` (0.0674 > 0.0444). **`test|cone/contour`
  narrowly PASSES even on the buggy tree** (0.0548 < mkDotScreen's 0.0581) —
  reported honestly rather than forced; Rank 1 still improves it
  substantially (0.0548 -> 0.0221, see the per-cell table).
- The two "5% non-regression" tests at this same tree trivially PASS (they
  compare the tree to its own pinned reading).
- MUTATION-KILL 1's two tests: **skipped** (its `beforeAll` throws — the
  `RANK1_NEEDLE` it looks for does not exist pre-Rank-1, by construction;
  N/A at this sha, not a defect).
- Instrument-correctness, contrast-mutation and negative-control tests: all
  **PASS** (self-contained math / unrelated constants, unaffected by
  whether Rank 1 has landed).

Scratch dir removed after the run.

## MUTATION-KILL 1 (blocking, permanent guard — this tree, post-Rank-1)

`scene3d-mktick-banding.test.js`'s own describe block: a real-render
mutation (`scriptOverrides`, `patchOne`) removes Rank 1's three lines,
restoring `L = Lease` exactly as T2-3 shipped it — no git history involved,
so this check never goes vacuous. **4/4 pass**: shipped (Rank-1) `bandC` <
no-Rank-1 mutant's `bandC` on both flagged cells, both rigs.

## CONTRAST mutation + NEGATIVE CONTROL (per the brief, §5.3's pattern
applied to bandC)

- **Contrast**: `MK_TICK_EASE_BLEND` 0.92 -> 0.90. `bandC` changes (by more
  than 1e-6) on both flagged cells (test rig) — **2/2 pass**. Proves the
  goldens/bandC are sensitive to the tone curve, not only to placement.
- **Negative control**: `mkComma`'s `L0` (a `countChan`-branch constant,
  provably unreachable from `lenChan`) nudged 1.30 -> 1.31. `bandC` on
  `mkTick` is unchanged to 1e-9 on both flagged cells (test rig) — **2/2
  pass**. Proves the instrument is not "any edit to the file trips it".

## Runaway-stroke census (§4.3's disclosure, reproduced on this tree, create
rig, all six cells, paths > 15mm)

| | count > 15mm | longest |
|---|---|---|
| pre-Rank-1 (scratch `c28b3490`) | 4 (all `sphere/hatch`) | 47.09mm |
| post-Rank-1 (this tree) | 4 (3 `sphere/hatch` + 1 `sphere/contour`) | 52.39mm |

Total count is NOT raised above pre's baseline (4 -> 4) — stop condition 5
does not trigger. Rank 1 does move one long stroke onto a flagged cell
(`sphere/contour`, which had zero pre-Rank-1), consistent with the plan's
own disclosure (§4.3) that this is a pre-existing class, not one Rank 1
creates. Not "fixed" per the plan's own closed avenue (clamping `L` against
the nominal pitch wrecks O5 and doesn't remove the path) — filed as an
open, disclosed item, not this unit's to solve.

## Guards — all run individually, foreground, this worktree

| file | result |
|---|---|
| `scene3d-mktick-wedge` (own) | 58/58 |
| `scene3d-mktick-banding` (own, new) | 22/22 |
| `scene3d-mkdashramp-dark-end` (T4b) | 4/4 |
| `scene3d-plot-safety` (T1b min-adjacent-mark) | 5/5 (1 pre-existing skip) |
| `scene3d-crosshatch-parity` (W-36c) | 91/91 |
| `scene3d-crosshatch-cell-shape` + `-b` (W-31) | 34/34 |
| `scene3d-ladder-uniform-field-spacing` | 9/9 |
| `scene3d-fill-ruling-corners` (W-33) | 19/19 |
| `scene3d-hatch-density-angle-stable` + `-faceted-` (W-36b) | 14/14 |
| `scene3d-fill-even-spacing` + `-span-verdict` | 23/23 |
| `scene3d-curved-density-floor` | 14/14 |
| `scene3d-curved-density-sparse-end` | 20/20 |
| `scene3d-hatch-density-500` | 14/14 |
| `scene3d-ribbon-f1b-streaks` | 44/44 |
| `scene3d-ribbon-wall-coverage` | 36/36 |
| `scene3d-ribbon-f1-amp` | 47/47 |
| `scene3d-mark-laws-draw` (**G4** — `mkDashRamp`'s band-width guard, NOT `mkTick`'s, confirmed by reading `:406-436`, still run and green) | 30/30 |

`shadows.js:1229` has its own, unrelated `mkTick` (a shadow-rendering
function keyed by the same string in a different table) — checked, not
touched. `W-31b`'s crosshatch placement work is live in the same worktree on
the same file; serialized by only touching the `lenChan` branch of
`solveAt`, confirmed by the 288-combo byte-identity sweep above that nothing
outside mkTick moved. One benign
`[vitest-worker]: Timeout calling "onTaskUpdate"` and
`[FillBoolean] polygon union failed on degenerate geometry` on stderr in the
ribbon files — pre-existing shared-machine noise, not a regression.

## Evidence

No gallery re-shoot was taken for this unit — the `T2-3b-plan-evidence/`
directory (already in MAIN's `docs/3d-audit/lane-reports/`) already carries
native-resolution before/after/proto crops for the exact Rank-1 patch
shipped here (`sphere__contour-create-native-pre-post-proto2.png` etc.),
recorded by the read-only planner. This implementer's own contribution is
the per-cell/bandC/O5 numeric table above, re-derived on `c28b3490` (the
plan measured on `81925ee8`); the numbers are close (e.g.
`create|sphere/contour` bandC 0.1172 (plan) vs 0.1121 (this tree,
pre-Rank-1) via this port's own instrument) and the qualitative picture —
smooth continuous PRE, sharp-edged diagonal-banded POST, markedly more even
Rank-1 — is unchanged by T3/W-31b, neither of which touches the tick code.

## Stop conditions checked

1. Jay ruled (A) — `O5` bar moved 3.0 -> 2.30, disclosed above, not by
   re-scoping the population, `LMIN` untouched.
2. N/A — (B) not shipped.
3. `scene3d-plot-safety` green (5/5, 1 pre-existing skip) — no plot-safety
   regression from Rank 1 lengthening midtone ticks.
4. Byte-identity: 288/288, 0 diffs outside mkTick's own cells.
5. Runaway-stroke census: count NOT raised above pre (4 -> 4); disclosed,
   not fixed, not hidden.
6. Pictures (plan's own crops, re-examined): PRE smooth comb, POST
   sharp-edged diagonal bands, Rank-1 markedly more even but not as smooth
   as PRE (PRE is a near-saturated design with little tone structure to
   band) — matches the −56.7%/−65.6% class numbers, not overclaimed.
7. One iteration — this is the fourth pass at the T2 item; shipped.

## Evidence (re-shot)

A real re-shoot was missing at first pass (plan evidence is not unit
evidence) — corrected now, no new commit needed (evidence only). Captured
FROM MAIN (`scripts/audit/scene3d-capture.js`) with `--root` = the worktree
at `a8e2269f`, both `--rig create` (port 8490) and `--rig addLayer` (port
8491), `--only` the six mkTick x med cells (`{sphere,torus,cone} x
{hatch,contour}`) plus `sphere/contour` and `cone/contour` at max density,
into `docs/3d-audit/fill-audit/after/T2-3b/`. `served version 1.4.1`,
matching the worktree's `package.json` at `a8e2269f`. 16 shots total (8 per
rig), all non-empty, none byte-identical to each other — full detail,
including the fixture block (rig/camera/density/non-default params/
ground-plane-ink disclosure) and every pathCount/inkMm, in
`docs/3d-audit/fill-audit/after/T2-3b/report.json`. Both ports killed after
the shard (`lsof` confirmed free).

**Byte-identical pairs**: none in this capture set — see `report.json`'s
`byte_identical_pairs` field (all 16 pathCounts distinct, 386-3634).

**Native-resolution crops, LOOKED at** (`docs/3d-audit/fill-audit/after/
T2-3b/crops/`), before = `docs/3d-audit/fill-audit/after/T2-3/shots/B/`
(the T2-3-shipped, pre-Rank-1 gallery shot already in MAIN — the honest
"before" for this unit, since T2-3b only touches the `lenChan` branch and
nothing else changed those pixels), after = this unit's own re-shoot:

- **`sphere-contour-native-before-after.png` + the tighter
  `sphere-contour-defect-crop-native.png`** (native px, no upscale): BEFORE
  shows a distinct dark wedge-shaped cluster of visibly shortened,
  clumped-together ticks sweeping diagonally through the mid-right of the
  lit flank — the reviewed defect, unmistakable. AFTER: that dark clumped
  cluster is markedly reduced — the ticks in that zone read closer to their
  row-neighbours' length instead of collapsing into a separate darker
  patch. **The diagonal BANDING is visibly reduced, not gone** — some
  residual unevenness remains (matches the measured −55.7%/−56.7%, not a
  0-reading). **A new, different, disclosed artefact is visible in AFTER
  only**: one long, straight diagonal stroke crosses the sphere that BEFORE
  does not have — this is the runaway-stroke census finding above (count
  unchanged at 4 vs pre's 4, longest moved from 47.09mm on `sphere/hatch`
  to 52.39mm on this cell), not a re-emergence of the moiré; it reads as a
  single thin line, not a dark clumped patch, and is visually distinguishable
  from the banding defect it sits next to.
- **`cone-hatch-native-before-after.png` + the tighter
  `cone-hatch-defect-crop-native.png`**: BEFORE shows a ragged, sawtooth
  boundary between the solid dark ticks and the isolated light dashes —
  visible stepped/jagged texture along the tone transition. AFTER: that
  boundary reads distinctly smoother and more continuous, with less
  scattered short-dash noise. No new stroke artefact on this cell (matches
  the runaway-stroke census: 0 paths over 15mm on `cone/hatch`, before and
  after).
- **Tick length still reads as tone, plainly, on both cells, before and
  after**: long ticks continue near the dark anchor, short/sparse ticks
  continue near the highlight, on both the BEFORE and AFTER crops — the
  fix changes the MIDTONE's coherence, not the overall light-to-dark
  read.

**Plain answer to the coordinator's question**: the sharp diagonal banding
is visibly reduced on both photographed cells (not fully eliminated — see
the "Torus disclosure" and "Decision 13 for Jay" sections above for the
measured residual and the frontier that keeps it from reaching zero at this
row density), and tick length still visibly carries tone on both cells,
both before and after the fix.

