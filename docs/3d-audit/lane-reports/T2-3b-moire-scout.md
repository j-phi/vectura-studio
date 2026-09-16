STATUS: SCOUTED — UNDETERMINED

# T2-3b moiré scout — the diagonal banding T2-3-review.md found on `contour`

Read first, per the brief: `T2-3-review.md` (follow-up 2 / condition 11's photographed
"diagonal moiré/banding pattern" on `sphere/contour` + `cone/contour`, create rig,
native-resolution crops — new, not present pre-fix), `T2-3-impl.md` (what actually shipped:
the golden-ratio cross-row stagger at `layMark`, `surface-fill.js` ~:6594), and
`T2-3-plan.md` §3 Rank 1 (why the golden-ratio sequence was chosen — full-room amplitude,
spike-gated on wedge25/holeMax/O5, never evaluated against a moiré metric because none
existed yet).

**Everything below was measured in scratch exports, never in a worktree or MAIN.**
`mkdir -p /private/tmp/claude-501/scratch-moire/{pre,post}`; `pre` = `git archive 42acff7b`
(this unit's own base, `chan:'count'`, no length variation, no stagger — nothing to be
"pre-fix" of, since the mechanism doesn't exist yet); `post` = `git archive 81925ee8` (the
reviewed commit — note the `fill-audit-a3` worktree's current `HEAD` has since moved to
`7d015e94`, a later WIP checkpoint; the archive pins the reviewed sha exactly regardless).
`node_modules` symlinked from MAIN. Four additional on-disk scratch copies of `post` were
made to test alternative stagger formulas and a no-stagger control (`post-hashphase`,
`post-lattice2d-disk`, `post-nostagger`, all under `/private/tmp/claude-501/scratch-moire/`) —
these are patched COPIES, never the pinned `post` archive itself. Captures used MAIN's
`scripts/audit/scene3d-capture.js --root <export> --rig create|addLayer`, ports
8497–8501, each server killed immediately after its shard. Node/Python analysis used
`timeout: 600000`, foreground; several runs auto-backgrounded past the harness's 120s
default and were confirmed complete by polling for their output file, then reaped with
`kill`/`pkill` — never a `Monitor`, never treated as a fire-and-forget background job.

## Summary up front

**The stagger sequence is not the cause.** Disabling it completely (`room = 0`, i.e. the
exact `dbad2d88`/`9d911b05` centred-tick geometry but with T2-3's own `L0=1.16`/`BLEND=0.92`)
leaves the banding visually and quantitatively unchanged. Four different offset generators —
the shipped golden-ratio fractional part, van der Corput, an additive per-row phase reusing
the codebase's own pre-existing `gold` decorrelator, and a fully row-and-tick-indexed 2D
low-discrepancy lattice that structurally cannot carry the row-radius coherence the review's
condition 8.2 hypothesized — all produce native-resolution crops and FFT contrast readings
that agree with the shipped sequence to within a few percent. The banding **is real**
(confirmed in a from-scratch rasterisation of the algorithm's own returned vector paths, not
a screenshot/webp artefact) and **is new to T2-3** (absent in a freshly-captured `42acff7b`
render of the same six cells), but its source sits upstream of the `layMark` insertion point
the review and the brief both pointed at. My own attempt at a moiré-contrast instrument
(§3) does not work — it fires backwards on the one control it must pass — so this is filed
UNDETERMINED rather than closed with a fix.

## 1. MEASURE — the banding is real, new, and not contour-exclusive

**Native-resolution visual confirmation, regenerated fresh (not copied from the review).**
`scene3d-capture.js --tier B --root <export> --rig create --only
'^(sphere|torus|cone)__(hatch|contour)__mkTick__med__a$'`, six cells, both `pre` (`42acff7b`)
and `post` (`81925ee8`), 3× PIL crops of the lit-flank/highlight-approach region (right 65% ×
middle 70%, the same framing convention the review used):

- `pre` (`42acff7b`, `chan:'count'`) — **sphere/hatch and sphere/contour both clean**: a
  smooth comb of same-length ticks, spacing widening toward the highlight, no visible
  grouping. (crops:
  `docs/3d-audit/fill-audit/after/T2-3/moire-scout/pre-create/shots/B/*.webp`)
- `post` (`81925ee8`, shipped golden stagger) — **sphere/hatch, sphere/contour, and
  cone/contour all show the same diagonal dark/light grouping**, several row-pitches wide,
  sweeping across the highlight-approach region. This is visible on **`sphere/hatch`, a
  mapper the review's own crop set did not flag** — `T2-3-impl.md`'s evidence section only
  crops `cone/hatch` and `torus/contour`; the review added `sphere/contour`/`cone/contour`
  but did not separately re-examine `sphere/hatch`/`torus/hatch`/`cone/hatch` at the same
  crop tightness. My own crop of `sphere/hatch` (`post-create`) shows banding of comparable
  visual strength to `sphere/contour`. **I cannot confirm the review's specific "hatch is
  clean, contour is not" split — my own crops don't reproduce that separation.**
  (`docs/3d-audit/fill-audit/after/T2-3/moire-scout/post-create/shots/B/*.webp`)
- **Not a screenshot/webp artefact.** I rasterised `sphere/contour`'s own returned vector
  paths directly from mm coordinates (an independent stamping routine in Python, 8 px/mm,
  no browser involved: `analyze.py`'s `rasterize_ink`) and the identical diagonal banding is
  present at native raster resolution — it is a property of the emitted geometry, not of
  the app's canvas/webp pipeline.

**Quantitative — 2D FFT of a detrended local-ink-density field**, all six cells × both
rigs, `post-golden` (the shipped sequence): local ink density (box filter, window
≈0.6×rowPitch) minus a heavy Gaussian blur (σ≈3×rowPitch, isolating the intended
whole-object tone gradient) leaves a residual texture; 2D FFT of that residual (Hann-windowed,
masked to the shaded silhouette) finds a dominant off-DC peak:

| cell | rowPitch (mm) | period (mm), test/create | contrast (p95–p5 ink-fraction), test/create |
|---|---|---|---|
| sphere/hatch | 4.50 | 15.76 / 19.31 | 0.593 / 0.507 |
| sphere/contour | 4.45 | 15.71 / 19.29 | 0.597 / 0.534 |
| torus/hatch | 4.52 | 32.38 / 13.50 | 0.751 / 0.661 |
| torus/contour | 4.52 | 32.25 / 13.56 | 0.684 / 0.627 |
| cone/hatch | 4.43 | 31.11 / 33.11 | 0.482 / 0.504 |
| cone/contour | 4.51 | 31.14 / 32.95 | 0.508 / 0.494 |

Periods run **3×–7× the row pitch** (a coarse grouping of several adjacent rows, not a
row-to-row alternation) and appear on **every one of the twelve cell×rig combinations**,
hatch included. Full per-cell JSON:
`/private/tmp/claude-501/scratch-moire/../.../scratchpad/moire/data/post-golden.metrics.json`
(scratch, not committed — see Evidence).

## 2. CAUSE — the hypothesized mechanism (condition 8.2) is refuted by direct experiment

**The hypothesis under test** (`T2-3-review.md` §8.2, and the brief's own framing): the
golden-ratio stagger's `idx = a / sv.P` (`surface-fill.js:6597`, `post` = `81925ee8`) aliases
against the row index because, on a `contour` mapper's nested rings, arc length along a row
scales with the row's own radius (`a_j(θ) ≈ r_j·θ` for row `j` at radius `r_j`), so
`idx_j(θ) = r_j·θ / P(θ)` is a smooth *multiplicative* stretch between adjacent rows rather
than a simple shift — any deterministic scrambling of `idx` (golden fractional part, van der
Corput, …) would still show a coherent phase drift as `θ` sweeps. Corroborating context: the
row family axis really does differ by mapper (`surface-fill.js:5489-5491`, `contour` rules
axis `a`, everything else rules `(-sin,cos)` of `fillAngle` — a fixed direction, so hatch
rows are plain translations of each other, not radius-scaled). This is a real, well-formed
hypothesis, and the SAME file has working precedent for exactly this kind of per-row
decorrelation already sitting unused nearby: `emitMarks`'s own top-of-function `li`/`gold`
(`surface-fill.js:6078-6079`, `gold = frac(li·GOLDEN_STEP)`), reused by an unrelated law's
zig-zag phase at `surface-fill.js:9223`
(`ph = (arcMM[s]/TSP_PERIOD + lineIndex·GOLDEN_STEP)·2π`) — T2-3's own stagger never
references `gold` at all.

**Direct experiment, four candidates, patched into `layMark`'s `if (law.shape === 'tick')`
block (`surface-fill.js:6594-6602`), each rendered fresh via `loadVecturaRuntime`'s
`scriptOverrides` (never touching the pinned `post` archive):**

| candidate | formula (replaces `idx`/`uu` at :6597-6598) | native crop vs shipped | FFT contrast vs shipped |
|---|---|---|---|
| golden (shipped) | `uu = frac(idx·φ)` | — (baseline) | — (baseline) |
| van der Corput | `uu = vdc(round(idx))`, base-2 | indistinguishable | within 2% every cell×rig |
| hashphase | `uu = frac(idx·φ + gold)` — reuses the pre-existing per-row `gold` | indistinguishable (checked `sphere/contour`, `cone/contour`, create rig, native crops) | within 1% every cell×rig |
| lattice2d | `uu = frac(counter·φ + li·ψ)`, `counter` a per-tick-placement running index (NOT `a/P`), `ψ=0.38196...` — structurally severs `idx` from arc-length/radius entirely | indistinguishable (`sphere/contour`, create rig) | within 1% every cell×rig |
| **no-stagger** (`room = 0`, i.e. T2/T2-2's own centred geometry at T2-3's `L0`/`BLEND`) | — | **still shows the diagonal grouping** (crop: `.../moire-scout/post-nostagger-create/shots/B/sphere__contour__mkTick__med__a.webp`) | within 5% every cell×rig (e.g. `sphere/contour` contrast 0.623/0.533 vs shipped 0.597/0.534) |

The no-stagger control is decisive: **with the stagger term physically absent from the
render, the same coarse diagonal grouping is still there.** No candidate — including
`lattice2d`, which cannot express a radius-coherent drift by construction — moved the
contrast metric or the visible crop. The mechanism the review named is not what's producing
the picture.

**Best-supported alternative (not closed).** T2-3 is the first accepted unit to make row
length vary continuously with LOCAL, per-row tone at all (`solveAt`'s `lenChan` branch,
`surface-fill.js:6475-6491`: `L`/`P` solved independently per row from that row's own
sampled `I`, with no cross-row smoothing) — `chan:'count'` (pre-fix) never exposed this,
since its ticks are fixed-length. Combined with `MK_ROW_COV = 1/3`
(`surface-fill.js:2397`) inflating the row pitch to `R = pitchAtStep(...)/MK_ROW_COV`
(`:6427`), only a **handful of rows actually carry marks across the visible silhouette**
(directly counted from the `lineIndex` instrumentation below: 5–17 rows per cell×rig, not
the hundreds a dense along-row tick count might suggest). With that few independently-solved
rows sampling a continuously-varying `I(position)`, neighbouring rows' own average tick
length can differ by an amount that reads as a discrete "band" once length is the thing that
carries tone — a sampling/quantization effect of R1 at low row density, not a beat between
two frequencies. **This is the leading hypothesis, not a proven one** — I did not run the
confirming experiment (e.g. show the banding shrinks as row density rises, or that
`MK_ROW_COV` correlates with band period), and it is out of this scout's file scope
(`MK_ROW_COV`/`solveAt`'s `countChan` sibling belong to T3/earlier units per
`T2-3-plan.md`'s own forbidden-files list) to touch.

**A direct cross-row coherence measurement was attempted and is inconclusive, disclosed
honestly.** I instrumented `layMark` to log `[x, y, cOff, lineIndex]` for every tick
(`window.__T23B_LOG__`, read back via the same `window` object `loadVecturaRuntime` aliases
to `context.window` — the mismatched-global bug the T2-3 reviewer's own `premise-sweep.js`
hit does not apply here). With only 5–17 rows per cell, percentile-resampled cross-row
correlation of `cOff(a)` came back noisy and did not show a clean adjacent-row-vs-distant-row
separation (e.g. `torus/contour` test rig, the one cell with enough rows: lag-1 |corr| 0.214
vs lag-15+ |corr| 0.155 — a small, not decisive, gap). This measurement is too underpowered
(too few rows) to confirm or rule out row-to-row coherence in `cOff` itself; it neither
supports nor refutes the alternative hypothesis above, and is reported for completeness, not
as evidence either way.

## 3. INSTRUMENT — attempted, and it fails the one check it has to pass

Proposed bar: the §1 contrast metric (p95–p5 of the detrended local-ink-density residual),
gated ≤ pre-fix's own value + envelope. **This does not work, and I am reporting the failure
rather than shipping it.**

Pre-fix (`chan:'count'`) publishes no `tickField`/tone data at all — the instrument's
"shaded, non-highlight" mask (which `post` gets from `mkStat.tickField`'s republished tone
samples) has no equivalent source pre-fix. The only substitute available without adding new
instrumentation to the pre-fix tree is a dilated hull of the ink mask itself (pad ≈1.2×
nominal row pitch), which does **not** exclude the highlight region. Run through the
identical detrend/FFT pipeline:

| cell | contrast, **pre**-fix (dilated-ink proxy mask) | contrast, **post**-fix (true tone mask) |
|---|---|---|
| sphere/hatch | 0.828 / 0.811 (test/create) | 0.593 / 0.507 |
| sphere/contour | 0.843 / 0.812 | 0.597 / 0.534 |
| torus/hatch | 0.892 / 0.990 | 0.751 / 0.661 |
| torus/contour | 0.860 / 0.886 | 0.684 / 0.627 |
| cone/hatch | 0.870 / 0.874 | 0.482 / 0.504 |
| cone/contour | 0.897 / 0.886 | 0.508 / 0.494 |

**Pre-fix reads HIGHER than post-fix on all twelve cell×rig combinations** — the instrument
fires RED on the tree both the reviewer and I visually confirm is clean, and reads
comparatively GREEN on the tree that has the artefact. This is the exact failure mode item 3
of the brief warned against ("does not trip on the wedge fix's legitimate tone gradient") —
my σ≈3×rowPitch (~13mm) Gaussian detrend is not aggressive enough to remove the *intended*
whole-object brightness taper (which legitimately spans the whole silhouette, tens of mm),
and without a true highlight-exclusion mask pre-fix, that taper dominates the reading. A
working version of this bar would need (a) a real tone-threshold mask on both trees — which
means instrumenting the pre-fix `chan:'count'` path with the same kind of field republishing
`tickField` already does for post, out of this scout's read-only scope — and/or (b) a
substantially more aggressive low-frequency exclusion (or a frequency-domain band-pass done
properly in Fourier space rather than a spatial Gaussian subtraction) before contrast is
read. **Not delivered.** No bar is proposed for gating; §1's numbers stand as descriptive
measurement only.

## 4. CANDIDATE — none of the tested sequences fix the banding; one preserves the numbers

Because §2's control experiment shows the banding is independent of the stagger term
entirely, **no candidate among the four tested removes it** — the fix, if one exists, has to
be sought upstream (§2's alternative hypothesis), not in the offset generator. What IS
answerable now: which of the three alternative generators is safe to ship as a drop-in
replacement of the shipped golden sequence, judged against `T2-3-impl.md`'s own six-cell
gates, re-run against each candidate's actual render output via the SHIPPED, unmodified
`tests/helpers/scene3d-mktick-wedge.js` (`measureWedge`/`lengthCarriesTone`, required
directly, never edited):

| candidate | six-cell mean wedge25 (bar ≤0.080 test / ≤0.095 create) | worst per-cell wedge25 vs its ceiling | worst O5 reading (bar ≥3.0, monotone) |
|---|---|---|---|
| golden (shipped) | 0.07622 / 0.08878 — **PASS** | all 12 under ceiling | `torus/hatch` 3.008/3.039 — thin, but **PASS** |
| van der Corput | 0.07604 / 0.08889 — **PASS** | all 12 under ceiling | `torus/hatch` create **2.730 — FAILS the ≥3.0 gate** |
| hashphase | 0.07612 / 0.08899 — **PASS** | all 12 under ceiling | `torus/hatch` 3.101/3.127 — **PASS, clears with more margin than shipped** |
| lattice2d | 0.07608 / 0.08902 — **PASS** | all 12 under ceiling | `torus/hatch` test **2.855 — FAILS the ≥3.0 gate** |

All four leave `wedge25`/`holeMax` within ~0.5% of shipped on every cell (consistent with
§2 — the stagger's positional perturbation is too small relative to the wedge instrument's
own `rowPitch/2` splat radius to move that metric). **O5 is the discriminator**, and it moves
because an offset tick near a silhouette limb can get truncated differently than a centred
one (`T2-3-review.md` §3 already found this exact effect in its own cluster-mutation:
"clustering changes which sites get truncated by the walk near limbs") — `torus/hatch` is
the plan's own thinnest-margin cell (3.008/3.039 shipped) and both `vdc` and `lattice2d` push
it under 3.0 on one rig each.

**If a future unit needs to touch the offset generator for reasons unrelated to this
scout's finding, `hashphase` is the only one of the three that is a safe drop-in**: it
matches shipped `wedge25`/`holeMax` most closely of the three (≤0.001 delta every cell) and
is the only one that does not regress any of the twelve O5 readings — it is also the smallest
diff (one added term, reusing an existing in-scope variable, no new state). It does **not**
visibly or measurably reduce the moiré (§2), so shipping it would not close this finding —
it would only be a safe substitution if some other reason required one.

## What I did not do

- Did not test the alternative hypothesis's own confirming experiment (row-density sweep /
  `MK_ROW_COV` sensitivity) — those constants are outside this scout's read-only remit and
  belong to earlier units per `T2-3-plan.md`'s forbidden-files list.
- Did not deliver a working, gateable moiré bar (§3) — reported as a failed attempt with a
  named root cause, not silently dropped.
- Did not resolve why my own crops don't reproduce the review's specific "hatch clean /
  contour affected" split — flagged as an open discrepancy between this scout and
  `T2-3-review.md` §11, not adjudicated here.

## Evidence

Scratch exports (`/private/tmp/claude-501/scratch-moire/{pre,post,post-hashphase,
post-lattice2d-disk,post-nostagger}`) and analysis scripts/data
(`render-cells.js`, `log-offsets.js`, `analyze.py`, `analyze_log.py`, `analyze_pre.py`,
`coherence.py`, `six-cell-gate.js`, `data/*.json`) live under this session's scratchpad,
not committed — reproducible from the commands/needles quoted above. Capture PNGs kept in
MAIN at `docs/3d-audit/fill-audit/after/T2-3/moire-scout/` (six subdirectories: `pre-create`,
`pre-addlayer`, `post-create`, `post-addlayer`, `post-hashphase-create`,
`post-lattice2d-create`, `post-nostagger-create`), each with its own `manifest.B.*.jsonl`.
All capture dev-servers (ports 8497–8501) were killed immediately after their shard.

REPORT docs/3d-audit/lane-reports/T2-3b-moire-scout.md — UNDETERMINED — stagger sequence ruled out; likely upstream tone-solve, not closed
