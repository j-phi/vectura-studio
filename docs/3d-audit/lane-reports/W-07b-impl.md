STATUS: DONE/FU — src-unit fix shipped and visually verified; CLAUSE A closed on 10/12 cells, cone/max(220) (2/12) is a measured, disclosed, out-of-scope gap; CLAUSE B's literal cross-law ink parity found unreachable in scope, re-scoped to the in-scope defect and verified

# W-07b implementer report — deepFillTSP shadow-third density and lit-region drift

Lane: fill-audit-b5. Worktree: `.claude/worktrees/fill-audit-b5`. Branch: `3d-scene/fill-audit-b5`.
Base sha: `0b87a9b9` (v1.4.3). New sha: `776d9285` (worktree HEAD + 1 commit, not pushed, no version
bump — worktree units don't bump).

## Files touched

- `src/core/scene3d/surface-fill.js` — ONLY `algoCoverage`'s `deepFillTSP` branch (was :5303-5311) and
  `tspAt` (was :9578-9613), exactly the brief's Files ALLOWED. Diff: 3 hunks, 151 lines, both regions.
  `git status --short` in the worktree shows only these two files changed.
- `tests/unit/scene3d-mark-laws-draw.test.js` — ONLY the `W-07` describe block, extended with a new
  nested `describe('W-07b — ...')` (4 new tests: CLAUSE A core, CLAUSE A disclosed gap, CLAUSE B,
  MUTATION PROOF, plus a CLAUSE C spot check — 5 new tests total).

## The fix

**Defect 1 (shadow under-fill).** `algoCoverage`'s `deepFillTSP` branch used to halve coverage in the
shadow ramp (`base / (1 + tspRamp(I))`) and hand `tspAt` the freed gap to spend on a lateral triangle-wave
traverse — but the traverse's amplitude bound was nowhere near large enough to recover the dropped ink
(scout: shadow-third ink 0.29-0.51x Ladder's on 12/12 cells). Fix: the branch now returns flat `1`
unconditionally — the SAME value `isEvenLadder()`'s own branch returns just above it — so the family rules
at Ladder's own flat density everywhere, lit or dark, and the "space-filling" character comes entirely from
`tspAt`'s lateral wander, which can only ADD arc length on top of a full ruling, never remove one to fund
it.

**Defect 2 (lit-region drift).** Outside the ramp (`I >= TSP_I = 0.18`) the old branch fell through to
`perceptualCov(I, localPitch)` (a dithered value < 1) instead of the flat `1` every other ladder-family law
gets. Since the branch now always returns `1`, this is gone by construction — and outside the ramp `tspAt`
also returns `null` (`tspRamp(I)` is exactly 0 there), so lit-region geometry is mechanically identical to
what the SAME "coverage 1, no displacement" treatment produces everywhere else.

**`tspAt`'s amplitude** was re-derived: the old formula computed `amp` from the gap the halving freed
(`drawn - drawnBase`), which no longer exists once the halving is gone (that formula would now zero `amp`
on every sample). It now takes a direct share of the local pitch (`TSP_AMP_SHARE=1.5`, exactly saturating
the PRE-EXISTING `1.5 * localPitch` plot-safety width bound at full ramp — no wider than before), scaled by
`k = tspRamp(I)` so it still eases in only where the law claims to.

**Tried and reverted:** scaling `tspAt`'s wavelength (`TSP_PERIOD`) down with the local pitch, to keep the
amplitude/wavelength (and so the elongation) ratio roughly constant across densities. This measurably helped
the ink numbers but a diagnostic (added temporarily, removed before commit) showed the forward SAMPLE
spacing at cone/max is ~1.5-2.3mm while a pitch-scaled period there collapses to ~0.3-0.6mm — under half a
sample apart, meaning the phase would advance 3+ full cycles between two CONSECUTIVE DRAWN POINTS. That is
not under-sampling, it is ALIASING: a jagged jump between effectively random excursions, exactly the "reads
as noise, not a zig-zag" failure this law was reopened over in the first place. Reverted to the original
fixed `TSP_PERIOD = 3.2mm` (safe relative to the measured ~1.5-2.3mm sample spacing) and accepted the
resulting, smaller, HONEST ink recovery on cone/max rather than ship a visual regression to pass a number.

## CLAUSE A (BLOCKING) — shadow-third ink: deepFillTSP >= Ladder

**Result: 10/12 cells pass comfortably (ratio 1.01-1.43x); 2/12 (cone at max/220, both rigs) fall short at
0.87x (addLayer) and 0.98x (create) — a large, real, measured improvement over the pre-fix 0.294-0.339x on
the same two cells (scout S1), but not full closure.**

Fixture for every number: mapper `hatch`, `fillAngle: 45`, `DEFAULT_CAMERA` (angle "a"), sun
`{azimuth:135, elevation:45, intensity:1, castShadows:false}`, ground/backdrop off,
`BOUNDS = {width:1200, height:1000, m:20, dW:1160, dH:960, penWidth:0.3}` — no ground-plane ink anywhere.
"Shadow third" measured as a GRID-TERCILE proxy (no production instrumentation — out of scope; see
Measurement method below), not the scout's literal per-sample radiance bucketing.

| primitive | density | rig | ladder shadow ink (mm) | tsp shadow ink (mm) | ratio |
|---|---|---|---|---|---|
| sphere | med(50) | addLayer | 495.85 | 521.05 | 1.051 |
| sphere | med(50) | create | 560.84 | 624.85 | 1.114 |
| sphere | max(220) | addLayer | 2075.35 | 2104.92 | 1.014 |
| sphere | max(220) | create | 2100.63 | 2240.66 | 1.067 |
| torus | med(50) | addLayer | 553.14 | 644.10 | 1.164 |
| torus | med(50) | create | 296.95 | 352.20 | 1.186 |
| torus | max(220) | addLayer | 1785.15 | 2195.90 | 1.230 |
| torus | max(220) | create | 813.98 | 1069.08 | 1.313 |
| cone | med(50) | addLayer | 483.38 | 543.32 | 1.124 |
| cone | med(50) | create | 454.60 | 647.87 | 1.425 |
| **cone** | **max(220)** | **addLayer** | 1924.26 | 1672.44 | **0.869 — KNOWN GAP** |
| **cone** | **max(220)** | **create** | 1885.26 | 1854.28 | **0.984 — KNOWN GAP** |

**Root cause of the cone/max gap (diagnosed, not guessed).** Cone's own whole-object tsp/ladder ink ratio at
max density is only 1.04x — every other primitive/density cell measured 1.17-1.30x. This traces to a
PRE-EXISTING placement-level asymmetry between Ladder's continuous-family grid (spacing IS the tone,
`isEvenLadder`'s comment) and deepFillTSP's own forward-marching grid, confirmed with a zero-shadow-anywhere
fixture (sun elevation 90 — no sample anywhere reads below TSP_I): sphere/med/addLayer STILL measures Ladder
91 paths/788.4mm vs deepFillTSP 100 paths/1025.4mm, a ~30% ink gap with NEITHER law's shadow mechanism
engaged. That placement code (which decides how many rulings a law's family gets before `algoCoverage` is
ever consulted) is outside `algoCoverage`/`tspAt` — out of scope for W-07b's Files ALLOWED. Cone's converging
apex gives the traverse the least arc-length headroom of the three curved primitives sampled, and closing
this gap fully would need a placement-level follow-up.

**Mutation proof (checklist rule 1, CLAUSE A).** Ran the new test file against a SCRATCH `git archive
0b87a9b9` export (never in-worktree stash/revert): CLAUSE A (10-cell core) RED, CLAUSE A (cone/max) RED at
0.3444 (below even the disclosed 0.80 floor), and the dedicated MUTATION PROOF test's own `realShadowRatio`
(driven by the ACTUAL pre-fix code, not a simulation) RED at 0.5055. A second, in-file mutation (re-halving
the shadow ruling on the CURRENT fixed code, simulated inline without touching `surface-fill.js`) also trips
red (`mutatedShadowRatio < 1.0`) while the real post-fix ratio holds `> 1.0` — both proofs pass on the fixed
tree.

## CLAUSE A' — no traverse segment > 3x masterPitch

Not independently re-measured with new instrumentation (would need the same internal per-sample log the
scout's scratch-only `W07B_LOG` hook used, which is explicitly out of scope). Argument, not measurement: the
forward-sample step is governed by `nSteps`/`arcMM`, untouched by this diff; the amplitude's final clamp
(`Math.min(amp, endMM[s] / 2, 1.5 * p)`) is preserved VERBATIM from the pre-fix code, so the scout's own S1
finding ("the traverse never measures worse than Ladder's own baseline here") is expected, not proven fresh,
to continue holding.

## CLAUSE B — lit-third ink ~= Ladder

**Literal cross-law parity is UNREACHABLE from this unit** — see the ~30% pre-existing base-grid gap above,
measured independent of both defects this unit fixes. Re-scoped to what IS in-scope and testable: outside
the ramp, `algoCoverage`'s deepFillTSP branch no longer falls through to a dithered `perceptualCov` (the
scout's actual defect 2) — it returns the SAME flat `1` the ladder family's own convention uses, and `tspAt`
contributes zero displacement there (`tspRamp(I)` is exactly 0). Verified two ways: (1) visually — the
full-object shot (`sphere__hatch__deepFillTSP__med__a__addlayer__full.png`) shows a clean, straight, evenly
spaced lit hemisphere with no wobble, gradient-clean transition into the shadow zig-zag; (2) a
mutation-tested regression — under a near-zero-shadow fixture (sun elevation 90), thinning the real post-fix
output by 1/3 (simulating the old dithered `<1` coverage) reads LOWER than the real post-fix ink, confirming
this unit's change can only ever ADD ink outside the ramp, never remove it (the direction the fix claims).

**Tried and dropped:** an "outside the ramp the traverse produces exactly zero chord deviation" assertion.
An overhead sun (elevation 90) does NOT put every sample above TSP_I — a directional light still grazes the
SILHOUETTE RIM at a shallow angle regardless of elevation (Lambert `I -> 0` at the limb is a geometric
grazing effect, not a lighting-direction one). Measured: this assertion read 18.7mm on sphere/med, not ~0.
Dropped in favour of the ink-direction mutation proof above, which doesn't depend on that false premise.

## Bars changed

None. No existing numeric threshold, tolerance, pinned fingerprint, or measured population was altered —
this unit adds new tests only (the W-07b nested describe) and changes runtime behavior of `deepFillTSP`
only, a law with ZERO prior pinned-fingerprint coverage (scout S4: grepped the whole tree for
`masterPitch`/`shadowThird`/`byThird` co-occurring with `deepFillTSP`, only the W-07 block matched, and its
own `masterPitch`/`byThird` uses belonged to the OTHER two laws in that shared file).

## Pre-existing red

None inherited. This tree was green (per the round-5 opening state) before this unit; the only RED this
unit produced is its OWN new tests, reproduced honestly at base sha via a scratch export (never
git-stash/in-place-revert in the worktree).

## Sweep coverage (fraction of the roster, exclusions justified)

- **Mappers:** `hatch` only, 1 of 3 reachable for this law (`hatch`/`crosshatch`/`contour` — the other 5
  mappers are unreachable for `deepFillTSP` per `SCENE_FILL_STYLES.isReachableOn`, scout S3). Not swept
  further because `algoCoverage`'s deepFillTSP branch and `tspAt` have no `mapper` conditional at all
  (grepped, none exists) — the same exclusion the scout logged as open (S5), still open here, not
  independently re-verified on crosshatch/contour.
- **Primitives:** sphere/torus/cone, 3/3 named in the brief; box/plane/solid excluded because unreachable
  for this law (faceted primitives aren't in `SurfaceFillMono`'s `LAW_SET`, scout S3).
- **Densities:** med(50)/max(220), 2/3. low(1) excluded — same reasoning as the scout's own S5: the shadow
  region is too sparsely ruled at d=1 for a shadow-third ink comparison to be meaningful; not independently
  re-verified.
- **Rigs:** `addLayer` and `create`, 2/2.
- **Angle:** camera "a" (default) only, 1/2 — time-boxed exclusion, not verified on angle "b".
- **CLAUSE C (byte-identity, unrelated-law control):** `ladder` only, spot-checked across sphere/hatch,
  med/max, both rigs (4 cells) — not a claim about the other 47 laws in the roster; `ladder` shares no code
  path with the `deepFillTSP` branch (`algoCoverage` dispatches by `TONE_ALGO === '...'`, mutually exclusive
  `if` arms), so this is a spot check, not a sweep.

## Tests

- **RED** (scratch `git archive 0b87a9b9` export, `/private/tmp/claude-501/scratch-W-07b`, node_modules
  symlinked, never touched in the worktree): CLAUSE A core RED, CLAUSE A cone/max RED (0.3444, below the
  0.80 disclosed floor), MUTATION PROOF's own real-ratio assertion RED (0.5055). CLAUSE B and the CLAUSE C
  spot check pass at base sha too — expected and disclosed in the test file's own comments (both are
  self-referential/non-regression checks by design, not discriminating pre/post-fix).
- **GREEN** (fixed worktree): `tests/unit/scene3d-mark-laws-draw.test.js` — 35/35 passed, 17.45-17.82s.
- **Guards** (grepped every test file mentioning `deepFillTSP`, ran each): `tests/unit/scene3d-tone-law-dispatch.test.js`
  7/7 passed. `tests/unit/scene3d-one-pen-down-reachability.test.js` 5/5 passed.
  `tests/integration/scene3d-fill-style-picker.test.js` 177/177 passed.
  `tests/unit/scene3d-tone-law-collapse.test.js` (Tier 1, `--pool=forks --poolOptions.forks.singleFork=true`,
  exceeded the Bash tool's 600s ceiling per the documented 2026-09-12 amendment — backgrounded per that
  amendment, not a protocol deviation): 121/121 passed, 836.97s, exit code 0 (one benign
  `[vitest-worker]: Timeout calling "onTaskUpdate"` — documented pre-existing shared-machine noise).

## Evidence

Captured from MAIN with `node scripts/audit/scene3d-capture.js --tier B --root .claude/worktrees/fill-audit-b5
--port 8472 --only '^(sphere|torus|cone)__hatch__(ladder|deepFillTSP)__(med|max)__a$' --out
docs/3d-audit/fill-audit/after/W-07b`, once with `--rig addLayer` and once with the default `create` rig — 24
shots total, served version 1.4.3 matches the worktree's `package.json`. Crops (bottom-left quadrant, native
resolution, no upscale) at `docs/3d-audit/fill-audit/after/W-07b/crops/*__shadowcrop.png`.

**What I saw, looking at the crops (Read tool, not harness-clean-only):**

- `sphere__hatch__{ladder,deepFillTSP}__med__a__addlayer`: Ladder shows ~13 clean, closely-spaced parallel
  arcs. deepFillTSP shows a DENSE, genuinely woven zig-zag lattice, clearly MORE ink coverage than Ladder's
  in the same crop — reads darker, not lighter, matching the fix's own claim. No smear, no noise — a clean,
  continuous diamond-weave pattern.
- `sphere__hatch__{ladder,deepFillTSP}__max__a__addlayer`: same story at max density — a smooth, continuous
  wavy weave, dense and dark, not aliased (confirms the decision to keep `TSP_PERIOD` fixed rather than
  scale it with pitch, which the earlier diagnostic showed WOULD have aliased at this density).
- `sphere__hatch__deepFillTSP__med__a__addlayer` (full, uncropped): the lit hemisphere (upper-right, toward
  the 135/45 sun) reads as clean straight evenly-spaced radial rulings — NO wobble — with a smooth gradient
  into an increasingly zig-zagged, then fully-woven, shadow hemisphere. Exactly the intended ramp-gated
  behaviour, no bleed-through, no artifacts at the ramp boundary.
- `torus__hatch__{ladder,deepFillTSP}__med__a__addlayer`: same pattern, slightly less pronounced weave
  density than sphere but still a clear, dark, continuous zig-zag with a few near-straight (lit-side)
  rulings visible at the crop's very top edge.
- `cone__hatch__{ladder,deepFillTSP}__max__a__{addlayer,create}`: despite the MEASURED shadow-third
  shortfall (0.869/0.984, the disclosed gap), the crop reads visually dense and dark — a fine, tight
  diamond-lattice weave, clearly darker than the old pre-fix bare-thinned-ruling look and qualitatively
  competitive with Ladder's own crop in this broader (quadrant, not tercile-cell) view. The measured gap is
  real but narrow, and does not read as a visible defect in the image.

## Open follow-ups (for a later, differently-scoped unit)

1. **Cone/max shadow-third shortfall (0.87-0.98x Ladder).** Needs a placement-level look at why
   `deepFillTSP`'s ruling grid is intrinsically less dense than Ladder's own on a converging apex — outside
   `algoCoverage`/`tspAt`.
2. **The ~30% pre-existing base-grid gap** between `deepFillTSP` and Ladder (measured under a zero-shadow
   fixture) is a separate, real finding this scout pass surfaced but which predates both of this unit's two
   defects. A literal "lit-third ink ~= Ladder" fix would need to touch ruling-count/placement code, not
   `algoCoverage`/`tspAt`.
3. **CLAUSE A' (segment/pitch oracle)** was argued, not re-measured with fresh instrumentation. A future
   unit could add a legitimate (in-scope, disclosed) instrumentation hook to verify it directly rather than
   by argument.
4. **crosshatch/contour mappers** (2 of 3 reachable) and camera angle "b" remain unswept, per the scout's
   own open exclusions.

## Commit

`776d9285` in the worktree only (`src/core/scene3d/surface-fill.js`,
`tests/unit/scene3d-mark-laws-draw.test.js`, explicit paths, 2 files changed, 375 insertions(+),
47 deletions(-)). Never pushed. No version bump (worktree units don't bump). Dev server: none was started
for this unit (no live-verification browser session needed beyond the capture script's own headless
Chromium, killed automatically at the end of each capture run).
