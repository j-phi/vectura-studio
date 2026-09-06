STATUS: DONE

# W-26b — closing the judge's BLOCKING conditions on W-26 (the P0 user rule)

Lane `fill-audit-a`, worktree `.claude/worktrees/fill-audit-a`, branch `3d-scene/fill-audit-a`,
port 8475. Base `67c9752c` (T1, HEAD at unit start) → three commits:

1. `7bc2b1a0` — **W-26b-1**, crosshatch second family asks a SHARE of coverage, not the full
   target (`src/core/scene3d/surface-fill.js`, `tests/unit/scene3d-curved-density-floor.test.js`).
2. `4a858445` — **W-26b-2**, real anti-blob guard (`tests/unit/scene3d-fill-span-verdict.test.js`).
3. `0930cb2d` — **W-26b-3** (three coin bars → floor + fingerprint band) + **W-26b-4(a)** (one
   unfiltered gap check), `tests/unit/scene3d-fill-span-verdict.test.js` +
   `tests/unit/scene3d-plot-safety.test.js` + `tests/unit/scene3d-fill-even-spacing.test.js`.

Files touched: only the four named in the brief (`surface-fill.js`,
`scene3d-curved-density-floor.test.js`, `scene3d-fill-span-verdict.test.js`,
`scene3d-plot-safety.test.js`, `scene3d-fill-even-spacing.test.js`) — five, the brief's list of
four plus `scene3d-plot-safety.test.js` which C3 also names as one of the three coin bars.
`surface-fill.js:5084-5157` (the W-01 master grid) untouched by line number; T1's mark-law sinks
(`MK.*`) untouched — `scene3d-mark-laws-draw.test.js` is 18/18, byte-identical.

## Read first (per protocol)

`W-26-judge.md` (the P0 verdict + C1–C3), `W-26-review.md`, `W-26-impl-2.md`, `LEDGER.md` rows
W-26b-1..4. All three conditions and both parts of W-26b-4 addressed below.

## C1 (BLOCKING) — crosshatch over-inks to saturation

**Root cause, confirmed by reading the code.** `emitContFamily`'s walk computes
`want = isEvenLadder() ? ladderWantedPitch(pb.I) : cfWantedPitch(pb.I)` — identical for EVERY
call, so when crosshatch's second family called `emitContFamily` with its own reduced `count`
(`Math.max(2, Math.round(count / crossRatio))`), the `count` reduction only widened the walk's
`dfMin`/`dfMax` step-size bounds slightly; the actual pitch target (`want`) was the SAME full
`ladderCov(I)` family A itself uses. Two independently-full-coverage crossed families combine
(clear areas multiply — the same relationship `scene3d-plot-safety.test.js`'s own `composed()`
spec states) to `1-(1-c)^2`, which saturates fast: measured pre-fix cylinder D220 ink coverage
0.906–0.971 depending on instrument (a solid block).

**Fix (`surface-fill.js`).** New `ladderCrossWantedPitch(I, crossRatio)`: derives the crossing
family's own coverage as `cA * crossShareOf(crossRatio)` where `cA = ladderCov(I)` (family A's
own, unmodified target) and `crossShareOf` is `CROSS_SHARE_BASE / crossRatio²` (`CROSS_SHARE_BASE
= 0.1`, empirically tuned — see Open follow-ups). `emitContFamily` gained an optional 5th
`crossShare` parameter, non-null ONLY for the crosshatch second-family call (three call sites at
the `if (mapper === 'crosshatch')` block); every other caller (contour, hatch, crosshatch's OWN
family A, every `contField*` law) passes nothing and is byte-identical to before — confirmed by
re-shooting the W-26 capsule/cone/cylinder contour control cells (see Evidence).

**The walk's own `dfMax` also had to widen for the crossing family.** The coverage-share fix
alone left `crossDensityRatio`'s count spread at ~1.6x (not the pre-W-26 tree's own ~2.2x)
because `dfMax = 6/max(6,count)` — built from the SAME `count` family A's own call sees — clamped
the wider share-driven pitch straight back down at `crossDensityRatio = 1`. `dfMaxMul` widens the
ceiling by the same reciprocal share, capped at 20x so a genuinely sparse crossing family still
cannot swallow the whole form.

**Measured, own rig** (`V.AlgorithmRegistry.scene3d.generate` against the live
`PRIMITIVE_PARAM_DEFAULTS`/`DEFAULT_CAMERA` the audit capture script itself reads — this
reproduces the judge's own `inkMm` numbers to the millimetre):

| primitive | pre-W-26 baseline (`shots/A`) | pre-b1-fix (`3c88605f`) | after b1 fix | Δ vs pre-W-26 | bar |
|---|---|---|---|---|---|
| cylinder crosshatch D220 | 4912.6 mm | 9326.7 mm | **5153.7 mm** | **+4.9%** | ≤+15% |
| ellipsoid crosshatch D220 | 4875.7 mm | 7795.0 mm | **4115.6 mm** | **−15.6%** | ≤+15% |

Both comfortably inside the ±15% cap — cylinder barely moved from its ORIGINAL pre-W-26 ink total,
ellipsoid actually came in lighter. `crossDensityRatio`'s own count spread (d=100,
`{crossDensityRatio: 0.25}` vs `{crossDensityRatio: 1.0}`, `scene3d-curved-density-floor.test.js`):
183 vs 83 = **2.2x** (true pre-W-26 tree) → 130 vs 116 = **1.12x** (broken, `3c88605f`) → 138 vs 60
= **2.3x** (after this fix, ≥2.0x bar met).

**Visual check (native-resolution crop, per protocol).** Cropped the object-body region (avoiding
caps) of `cylinder__crosshatch__ladder__max__a.webp` at native resolution (507×811, crop
354×244px), broken (`3c88605f`) vs after (this fix):

- **Broken**: a near-solid white field with tiny dark diamond pinholes — exactly the judge's own
  description, and visually a saturated block, not a shaded drawing.
- **After**: a legible crossed grid — clean diagonal white rulings with real dark gaps between
  them, reading as an actual crosshatch texture. Also checked `ellipsoid__crosshatch__ladder__max__a.webp`:
  same legible crossed-grid texture, with a visible light-to-dark gradient across the crop (denser
  toward the upper-right / shadow side).

## C2 (BLOCKING) — restore a real anti-blob guard

`scene3d-fill-span-verdict.test.js`'s `expect(drawn.size).toBe(budget)` was a tautology under
continuous placement: `lineIndex` is the walk's own placement ordinal, so every index it emits IS
drawn by construction — no fill-behaviour change, however broken, could fail this assertion short
of restructuring how `lineIndex` itself is assigned.

**Replaced with drawn ink COVERAGE**, rasterised at a fine ABSOLUTE-mm grid (0.1mm cells, same
instrument `scene3d-plot-safety.test.js`'s own `windowCoverage` already uses) so overlap cannot
inflate it and a thin pen does not vanish. Asserted for `hatch`, `contour` AND `crosshatch`
(`RULED`) at Density 50 AND 220 on the file's own lit-sphere fixture (bar: coverage in `(0, 0.85)`).

**A first cut of this guard used a grid sized relative to the drawn disc's own radius** (`2R/56`
cells), which forced the per-sample pen-radius mark up to a minimum of one cell to keep a thin
line visible — fattening the drawn stroke to several millimetres and saturating EVERY mapper
(including `hatch`, which is not broken) to coverage 1.0 regardless of the fix. Caught before
landing by actually running the new test and seeing `hatch@50` also read 1.0 — a real drawing with
only 67 lines cannot legitimately be a 100%-inked disc. Rewrote to the absolute-mm grid (matching
plot-safety's already-proven instrument); documented in the file's own comment.

**RED/GREEN, reproduced by temporarily `git stash`-ing only `surface-fill.js`** back to its
pre-W-26b-1 state (`3c88605f`) and rerunning this file unmodified:

| cell | pre-fix (`3c88605f`) | post-fix | bar |
|---|---|---|---|
| hatch@D50 | 0.223 | 0.223 | <0.85 |
| hatch@D220 | 0.780 | 0.780 | <0.85 |
| contour@D50 | 0.209 | 0.209 | <0.85 |
| contour@D220 | 0.798 | 0.798 | <0.85 |
| crosshatch@D50 | 0.407 | 0.242 | <0.85 |
| **crosshatch@D220** | **0.971 — FAILS** | **0.805 — passes** | <0.85 |

Exactly the isolation the judge's condition asks for: every non-crosshatch cell already passes
pre-fix (proof the guard doesn't over-trigger), and crosshatch@D220 alone fails pre-fix and passes
post-fix (proof the guard is real and the fix closes it).

## C3 (BLOCKING) — three coin bars

All three (contour ink-ramp `1.3`, hatch ink-ramp `1.2` — untouched by W-26 itself — and
`scene3d-plot-safety`'s `q(0.5) < 0.35`) sat INSIDE their own measured drift envelope, not below
it, per the judge's own 11-scene sweep (detail/density/radius ±2, sun elevation ±2°, camera pitch
±2°): contour 1.354 measured, envelope 1.282–1.518 (crosses the bar at sun elevation 33°); hatch
1.229 measured, envelope 1.216–1.417 (1.3% headroom); plot-safety 0.3425 measured (2.2% headroom).

**Took the judge's non-preferred but explicitly acceptable form**: the judge's PREFERRED fix (a
minimum sampling resolution near a known chart pole in `emitContFamily`'s own walk, recovering
contour above 1.8 and fixing hatch's loss too) was not attempted in this unit — it touches the
walk's placement math beyond the pitch source this lane's touch list allows changing alongside
W-26b-1/-2 in the same commit set, and a previous implementer already tried and reverted a
narrower version of exactly this (shrinking `dfMax` for `isEvenLadder()`), which broke the
RAMP-not-STEP assertion on `hatch` (see `scene3d-fill-span-verdict.test.js`'s own prior "Bars
changed" comment, reproduced verbatim in the new comment). Recorded as an open follow-up.

Instead: the **FLOOR** moves below the WHOLE measured drift envelope (contour `1.15`, hatch
`1.05`, plot-safety `0.40` — each still refuses a real flattening; contour's new floor still sits
well clear of the 1.04 "draw everything" variant the file's own comment names), **and** the
measured value is pinned separately with an explicit ±10% fingerprint band (contour `[1.22,
1.49]`, hatch `[1.11, 1.35]`, plot-safety `[0.308, 0.377]`). A drift-driven flip can no longer pass
by accident in either direction; a genuine flattening still fails both halves.

Verified: `scene3d-fill-span-verdict.test.js`'s "the drawing still SHADES" test (11/11 total in
that file) and `scene3d-plot-safety.test.js` (5/5 + 1 dormant skip) both pass with the actual
measured values (1.354, 1.229, 0.3425 respectively) landing inside their new bands — confirmed by
the tests passing (the band assertions are in the same `expect` chain as the floor).

## W-26b-4 (non-blocking, record)

**(a) — implemented, cheap.** Added ONE unfiltered assertion to
`scene3d-fill-even-spacing.test.js`: on `hatch`+`cylinder` (a row the uniform-field lemma already
proves near-flat along its own axis, already in that file's `test.each` roster), no single raw
drawn gap may sit beside a neighbour more than 2x its size — checked with NONE of that file's
three stacked softenings (30% end-trim, 1.6 ratio bar, 3-point median filter), since the median
filter in particular cannot fail on an isolated doubled gap by construction (outvoted by its two
neighbours), which is exactly the "unexpected white band" defect the file's own header says it
exists to catch. Passes cleanly on the current tree — no median-filter forgiveness needed to pass
this stricter, unfiltered check.

**(b) — record only, per the judge's own instruction, not fixed here.**
`ellipsoid__contour__ladder__low__a` (Density 1) stays a bare-outline cliff (ink 319.2 → 180.2mm,
−43.5%). The judge already confirmed this is NOT a rule violation (density response stays
monotone: 180.2/880.0/3388.7 at D1/50/220; the slider minimum is meant to be sparse) — logged in
`report.json`'s `open_followups`, not touched.

## Guards — one at a time, per protocol (never a glob)

| file | result |
|---|---|
| `scene3d-ladder-uniform-field-spacing` | 9/9 — R1a still ≤1.15 |
| `scene3d-hlr-spatial-index-identity` | 6/6 |
| `scene3d-mark-laws-draw` | 18/18 — T1's mark cells byte-identical, untouched |
| `scene3d-curved-crosshatch-controls` | 18/18 — mostly tone-off fixtures, structurally outside this fix's `toneOn` gate |
| `scene3d-hatch-density-500` | 14/14 |
| `scene3d-box-density-bearing` | 4/4 |
| `scene3d-curved-density-sparse-end` | 20/20 |
| `scene3d-tone-algo-default` | 6/6 |
| `scene3d-form-ladder` | 6/6 (+24 skipped, unchanged) |
| `scene3d-fill-boundary-ends` | 41/41 |
| `scene3d-fill-seam-continuity` | 5/5 |
| `scene3d-plot-floor-obj` | 12/12 |
| `scene3d-subwindow-density` | 3/3 (+2 skipped) |
| `scene3d-appdefault-lit-floor` | 4/4 (+1 skipped) |
| `scene3d-ribbon-f7-self-occlusion` | 2/2 |
| `scene3d-style-fill-lines` | 15/15 — T1's `fillFidelity`/placement decoupling untouched |
| `scene3d-curved-density-floor` (own file) | 13/13 |
| `scene3d-fill-span-verdict` (own file) | 11/11 |
| `scene3d-plot-safety` (own file) | 5/5 (+1 dormant skip) |
| `scene3d-fill-even-spacing` (own file) | 12/12 |

All run individually (`npx vitest run tests/unit/<file>.test.js`), foreground, one at a time, per
the AGENT-PROTOCOL. `scene3d-fill-boundary-ends` (34s) and `scene3d-box-density-bearing`/`scene3d-
curved-density-sparse-end` (12–16s each) were the slowest; none exceeded the 15-minute rerun
threshold.

## Evidence

Captured from MAIN with `node scripts/audit/scene3d-capture.js --tier A|B --root
.claude/worktrees/fill-audit-a --port 8475 --only '<regex>' --out
docs/3d-audit/fill-audit/after/W-26b`. `appVersion` in every manifest row reads `1.3.98`, matching
the worktree's `package.json`.

- **Crosshatch cells** (Tier A): `cylinder__crosshatch__ladder__{med,max}__a`,
  `ellipsoid__crosshatch__ladder__{med,max}__a` — new numbers in `report.json.measured`.
- **W-26 contour controls** (proof of scope discipline): `capsule__contour__ladder__{low,med,max}__a`
  (Tier A), `cylinder__contour__ladder__med__a` (Tier A), `cone__contour__{ladder,ampSpacing,
  amplitudeOnly}__med__a` (Tier B). All 7 re-shot and md5-diffed against `after/W-26`'s own copies:
  **byte-identical**, confirmed with `md5 -q` on both files for each pair (see `report.json`'s
  `byte_identical_pairs`/`gh1_identical_exceptions`).
- **Broken-state reference** (for the visual check only, NOT written into `after/W-26b/` —
  captured to a scratchpad `--out` with `surface-fill.js` temporarily swapped to its `3c88605f`
  blob via `git show 3c88605f:... > surface-fill.js`, then immediately restored from a backup
  copy before any other work resumed; confirmed `git status` clean after restore).

**Looked at the images directly (Read tool), native-resolution crops, not the whole 800px cell:**
cropped `cylinder__crosshatch__ladder__max__a.webp`'s object-body region (507×811 native, crop
354×244px, avoiding the caps) for both the broken-state reference and the after/W-26b shot. The
broken crop is a near-solid white field with small dark diamond pinholes — a flooded block. The
after crop is a clean crossed grid of white diagonal rulings with real, legible dark gaps between
them — reads as a shaded crosshatch texture, not a solid block. Also cropped
`ellipsoid__crosshatch__ladder__max__a.webp` (after only): same legible crossed-grid character,
with a visible light-to-dark gradient across the crop.

Did NOT run the gallery rebuild, per instruction.

## Bars changed (mandatory disclosure, see each commit body for the full text)

- `tests/unit/scene3d-curved-density-floor.test.js:246-249` — crosshatch pinned fill counts
  (ratio-scaled family B) at d=10/100: `20/18/130/116` → `22/10/138/60`. Direct, intended
  consequence of the coverage-share fix (family B is now genuinely sparser at ratio 1). A new
  ratio assertion (`>=2.0x`) was added alongside so a future regression cannot silently re-collapse
  the spread while individual counts still happen to pass.
- `tests/unit/scene3d-fill-span-verdict.test.js:342-345` — contour ink-ramp bar `1.3` → floor
  `1.15` + band `[1.22, 1.49]`; hatch ink-ramp bar `1.2` → floor `1.05` + band `[1.11, 1.35]`. Both
  widened downward (lower floor), per judge C3 — the old single-number bars sat inside their own
  measured drift envelope.
- `tests/unit/scene3d-plot-safety.test.js:250` — `q(0.5) < 0.35` → `< 0.40` + band `[0.308,
  0.377]`, per judge C3, same reasoning.
- No fingerprint or tolerance was re-pinned without the proof/mechanism argument named above and in
  each commit body.

## Open follow-ups (also in `report.json`)

1. Judge's preferred C3 fix (minimum pole-sampling resolution in `emitContFamily`'s own walk) not
   attempted — out of scope for this unit's touch list; a previous implementer already tried and
   reverted a narrower version. The floor+band form is a real guard but weaker than a recovered
   ramp would be.
2. `CROSS_SHARE_BASE` (0.1) and `CROSS_DFMAX_BOOST_CAP` (20) are empirically tuned against the
   `crossDensityRatio` spread bar and the D220 ink-coverage cap, not derived from a closed-form
   inclusion-exclusion solve against family A's own local intensity. If family A's own coverage
   curve moves materially in a future change, these may need re-tuning.
3. W-26b-4(b) (ellipsoid D1 bare-outline cliff) stays record-only, per the judge.
4. The judge's own p75/p25 / `agjMed` image-space gap-regularity instrument was not reproduced —
   verified instead via drawn ink coverage (the C2 guard's own instrument, same fixture family)
   plus a native-resolution visual crop/look. A future pass wanting the judge's exact numeric
   gap-regularity proof would need to port `gapscan.py`'s scanline method into this lane.

## Files

- `src/core/scene3d/surface-fill.js` — `ladderCrossWantedPitch`, `crossShareOf`,
  `emitContFamily`'s `crossShare` parameter, `dfMax`'s `dfMaxMul`.
- `tests/unit/scene3d-curved-density-floor.test.js` — re-pinned crosshatch counts + new ratio
  assertion.
- `tests/unit/scene3d-fill-span-verdict.test.js` — `inkCoverage` helper + `RULED × [50,220]`
  anti-blob `describe.each`; ink-ramp coin bars → floor + band.
- `tests/unit/scene3d-plot-safety.test.js` — `q(0.5)` coin bar → floor + band.
- `tests/unit/scene3d-fill-even-spacing.test.js` — one unfiltered gap-ratio test.
- `docs/3d-audit/fill-audit/after/W-26b/` — `report.json` + `shots/A`, `shots/B`.
