STATUS: ARTIFACT

# W-36d — d=5 scout: is the below-1.2 dip at Density 5 real or quantization?

Read-only scout. Scratch export only:
`git -C .claude/worktrees/fill-audit-a3 archive dcc91872 | tar -x -C
/private/tmp/claude-501/scratch-d5`, `node_modules` symlinked from main. No worktree or main
`src`/`tests` file was ever edited. One throwaway probe test
(`tests/unit/_scout-w36d-d5.test.js`) was added to the scratch copy only, run foreground via
`npx vitest run` with no timeout override needed (finished in ~5s), and the whole scratch dir
(`/private/tmp/claude-501/scratch-d5`) is deleted at the end of this scout — nothing survives
outside this report.

## (1) Raw integer nB staircase, d=1..10, sphere, `crosshatch`/`ladder`

Measured with the review's own `crossFamilyBCount(d, ratio)` helper (unmodified, copied
verbatim from `tests/unit/scene3d-curved-density-floor.test.js`), plus
`SurfaceFill.lastMasterGridStats` read after each call (an already-exposed test getter — no
source edit needed):

| d | N (family A, post-round) | Ncontinuous (pre-round) | nB(0.25) | nB(0.5) | nB(0.75) | nB(1.0) | ratio 0.25/1.0 |
|---|---|---|---|---|---|---|---|
| 1 | 7 | 7.470 | 7 | 6 | 6 | 5 | **1.400** |
| 2 | 8 | 7.689 | 7 | 6 | 6 | 6 | **1.167** |
| 3 | 8 | 7.913 | 7 | 6 | 6 | 6 | **1.167** |
| 4 | 8 | 8.144 | 7 | 6 | 6 | 6 | **1.167** |
| 5 | 8 | 8.382 | 7 | 6 | 6 | 6 | **1.167** |
| 6 | 9 | 8.627 | 8 | 7 | 7 | 6 | **1.333** |
| 7 | 9 | 8.879 | 8 | 7 | 7 | 6 | **1.333** |
| 8 | 9 | 9.139 | 8 | 7 | 7 | 6 | **1.333** |
| 9 | 9 | 9.406 | 8 | 7 | 7 | 6 | **1.333** |
| 10 | 10 | 9.680 | 9 | 8 | 8 | 7 | **1.286** |

`N`/`nB` at d=10 (9/7 = 1.2857) match the review's and impl's own d=10 numbers to the digit —
same helper, same fixture, independently re-run.

**The d=2..5 plateau is byte-identical, not just ratio-identical.** For every field measured
(`masterPitch`, `nA`, `nB` at all four ratios, `mmB`, `mmTotal`) the four rows d=2, d=3, d=4,
d=5 are bit-for-bit the same numbers (e.g. `masterPitch = 5.742766823643096` and
`mmB(ratio=1.0) = 246.40518633367986` at all of d=2/3/4/5). **The "d=5" dip is not a
Density-5-specific event — it is shared identically by d=2, d=3, and d=4.** The same is true of
the d=6-9 plateau (ratio 1.333 at all four). d=5 is simply one of four Density inputs that
happen to land on the same rounded integer.

## (2) The pre-rounding budget — found and printed

`surface-fill.js:5479-5480` (the master-grid block, unmodified in W-36c/d):

```js
N = clamp(Math.max(4, Math.round(calib / masterPitch)), 4, maxLines());
masterPitch = calib / N; // what the family ACTUALLY rules at, typically...
```

`calib / masterPitch` **before** this `Math.round` is `Ncontinuous` in the table above — it
grows smoothly and monotonically with Density (7.47 → 7.69 → 7.91 → 8.14 → 8.38 across d=1-5,
a genuine ~12% rise), while the rounded `N` that everything downstream actually uses is pinned
at 8 for four consecutive Density values. `masterPitch` (`calib/N`, the ROUNDED N) is exactly
what `ladderPairWantedPitch` divides by (`masterPitch / c` — the crossing family's own wanted
pitch, `surface-fill.js:4798-4800`), so the discretization in family A's own master grid
propagates directly into family B's pitch target. **This is the actual mechanism**, not a
`nB`-measurement rounding step invented for the ratio bar — it's the pre-existing
Density→line-count rounding (the same class of discretization the file's own F-01/W-01 comment
at line 5420 already documents and disclosed-fixed for a *coarser*, whole-range flattening;
this is the residual, expected +/-1-Density-wide sub-plateau any `Math.round` to a small integer
leaves behind, not a new defect).

A second, textually-closer "crosshatch budget" rounding exists at
`surface-fill.js:11217-11219` (`Math.max(2, Math.round(count / crossRatio))`, the `count` arg
passed to family B's `emitContFamily` call) — checked and ruled out as the driver: `count` here
is already the POST-round `N` (8 at d=5), and this value only sets the walk's `dfMin`/`dfMax`
step-size bounds, not the placed ruling count directly; its own pre/post-round ratio is a
trivial, ratio-independent 4.0 (`8/0.25=32` vs `8/1=8`) and does not track the measured 1.167.
The real driver is (1) above — the master-grid `N` rounding that sets `masterPitch`.

## (3) Would a user see a difference at d=5, ratio 0.25 vs 1.0?

At d=5 (sphere, `crosshatch`/`ladder`, default fixture):

| | ratio=0.25 | ratio=1.0 | delta |
|---|---|---|---|
| nB (crossing family rulings) | 7 | 6 | **+1 ruling (+16.7%)** |
| nA (primary family rulings) | 5 | 5 | 0 |
| total rulings (nA+nB) | 12 | 11 | +1 |
| ink mm, crossing family only | 284.91 | 246.41 | **+38.5 mm (+15.6%)** |
| ink mm, total (both families) | 502.30 | 463.80 | **+38.5 mm (+8.3%)** |

Turning the dial from 1.0 to 0.25 at d=5 adds one whole ruling to the crossing family and
~15.6% more ink in that family (~8.3% more total ink) — on a sparse 11-12-ruling fill, one
extra line is visually noticeable, not "near-inert." The 1.167 ratio *looks* close to flat only
because the counts involved (6 vs 7) are small integers; in percentage/absolute terms the dial
is doing a comparable amount of work at d=5 as it does at d=10 (where 7→9 reads as the
"healthy" 1.286).

## Verdict

**ARTIFACT.** The sub-1.2 ratio at d=5 is integer quantization at a small ruling count, not a
dial-specific near-inert lower half:

- It is not unique to d=5 — d=2, d=3, and d=4 produce the bit-for-bit identical `nB` values (and
  the identical 1.167 ratio) because all four round `calib/masterPitch` to the same `N=8`.
  `Ncontinuous` itself (the true, pre-round demand) rises smoothly and by a real ~12% across
  that same span — the continuous mechanism is not flat; only its Math.round to a small integer
  is.
- The dip traces to the pre-existing master-grid `N = round(calib/masterPitch)` step
  (`surface-fill.js:5479`), the same discretization class the file's own F-01/W-01 comment
  already names as expected at the sparse end — not a new W-36c/d-introduced defect and not
  something specific to `crossDensityRatio`.
- User-visible check confirms it: at d=5 the dial still moves ink by +8-16% and adds a whole
  ruling between 0.25 and 1.0 — a real, if coarse, response, not inertness.
- The practical consequence for the audit: the `nB(0.25) >= 1.2 x nB(1.0)` floor is **not
  reliable at any Density below ~10** — d=1 reads 1.400, d=2-5 read 1.167, d=6-9 read 1.333,
  purely from which integer `N` a given Density happens to round to, not from a smooth trend
  that dips specifically at 5. This is a sharper, corrected version of W-36c-review's/W-36d-
  review's own d=5 finding: not "the dial is genuinely near-inert one density below where
  anyone looked," but "the ratio metric is small-integer noise below d≈10 on either side of
  1.2, and 1.2 must never be asserted anywhere in that band regardless of direction." The
  committed W-36d sub-check only asserts at d=10/d=100, both outside this noisy band, and
  remains correctly scoped — no change to the shipped test is implied by this finding.

Scratch dir (`/private/tmp/claude-501/scratch-d5`) deleted at the end of this scout; no probe
file left in any worktree or in main's `tests/`/`src/`.
