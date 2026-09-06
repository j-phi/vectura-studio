STATUS: ACCEPT-WITH-FOLLOWUPS — oracle split is honest and correctly scoped (no src/ change,
retirement judge-authorized, classifier independently proven to distinguish a real dropped
ruling from a sub-pen gap); three concrete follow-ups required before this evidence set can be
trusted unattended (cluster-shape oracle margin, evidence capture regex, report.json schema).

# A3 (amended) — adversarial review

**Reviewer** (read-only in `.claude/worktrees/handoff-c`; nothing edited/stashed/committed
there — all adversarial probes ran against pure helper functions via `require()` from a
scratch script in `/private/tmp/claude-501/.../scratchpad/a3review/`, never touching the
worktree). Base `79c98ca8` → unit commit `d86cbf8d8e7b67eed8f742d36c481571df3d3ec4` (verified
via `git rev-parse HEAD`, matches `A3-impl.md` exactly). Tree verified clean
(`git status --short -- . ':!graphify-out'` empty; `git stash list` shows only unrelated
other-worktree entries, no A3 stash left behind — the implementer's logged `git stash push -u`
round-trip completed and popped cleanly).

## 1. Scope — only the allow-listed files, no `src/` change

`git diff 79c98ca8..HEAD --stat`:

```
tests/helpers/scene3d-ring-coverage.js             | 364 +++++++++++++++++----
tests/unit/scene3d-ribbon-f1b-streaks.test.js      | 143 ++++++--
tests/unit/scene3d-ring-coverage-reachability.test.js | 275 ++++++++++++++++
3 files changed, 706 insertions(+), 76 deletions(-)
```

Exactly the plan's/judge's allow-list. **No `src/` file, no other lane's file.** Read the full
diff on `scene3d-ring-coverage.js`: the four original fields (`ringFillRate`, `ringAreaMm2`,
`ringNotInkMm2`, `selfOccludedAreaMm2`) are computed from the same `ring`/`ink`/`excluded`
rasterization loop, only pulled out into `buildCoverageGrid` — the arithmetic is unchanged.
Confirmed empirically too (§4).

## 2. Reproduced the committed suite, one file at a time

```
npx vitest run tests/unit/scene3d-ribbon-f1b-streaks.test.js            44/44  (33.9s)
npx vitest run tests/unit/scene3d-ring-coverage-reachability.test.js     7/7  (10.4s)
npx vitest run tests/unit/scene3d-ribbon-wall-coverage.test.js          36/36  (44.0s, same
    pre-existing "[FillBoolean] polygon union failed on degenerate geometry" stderr as before —
    not a new regression)
```
Independently re-derived the per-law table (own script, `measure.js`, calling
`captureClipGroups`/`captureSelfOcclusionFootprint`/`measureRingFillRate` directly): matches
the impl report **to 4 decimal places** on every field:

| law | ringNotInkMm2 | Reachable | Unreachable | worst cluster |
|---|---|---|---|---|
| interlockWeave | 2.0587 | 0.1519 | 1.9069 | 19 cells, 0.1069 mm², 0.45×0.30 mm |
| onePenDown | 1.9969 | 0.0450 | 1.9519 | 8 cells, 0.0450 mm², 0.30×0.225 mm |
| trochoidLoop | 1.7100 | 0.1744 | 1.5356 | 22 cells, 0.1237 mm², **0.90×0.30 mm** |
| ampSpacing | 1.2319 | 0.0281 | 1.2037 | 3 cells, 0.0169 mm², 0.15×0.15 mm |
| weaveDepth | 0.8887 | 0.0056 | 0.8831 | 4 cells, 0.0225 mm², 0.225×0.225 mm |
| taperedEnds (ctrl) | 0.1125 | 0.0169 | 0.0956 | 2 cells, 0.0112 mm², 0.15×0.075 mm |

No discrepancy anywhere. The report's own disclosed gap (its 0.1744 vs the judge's 0.186 for
`trochoidLoop`, attributed to first-match-owner vs every-group-containing-cell semantics) is
real, disclosed, and moves no assertion outcome — confirmed.

## 3. Adversarial cases — does the classifier actually distinguish?

Reproduced the committed synthetic-void test (whole-build every-2nd-path drop): PASS as
reported, `ringNotInkReachableMm2` explodes past the 1.0 bar.

Built **two of my own cases the implementer did not test**, directly against
`buildCoverageGrid`/`classifyReachabilityAtDivisor`/`findUncoveredClusters` (no scene3d
render needed — pure polygon+segment geometry):

**Case A — two adjacent rulings dropped for 10 mm in the *middle* of an otherwise fully-inked
20×3 mm band** (far from every polygon edge, so nothing here is a corner effect):
```
reachableCount 1040 / unreachableCount 0   (100% REACHABLE)
biggest cluster: 1040 cells, 5.85 mm², 9.825 × 0.600 mm
isStreak (crossWidth>0.30 AND length>1.0)? TRUE
```

**Case B — the ribbon itself narrowed to 0.28 mm (just under one pen), zero ink at all**:
```
reachableCount 0 / unreachableCount 1068   (100% UNREACHABLE)
biggest cluster: 1068 cells, 6.007 mm², 20.025 × 0.300 mm
isStreak? FALSE
```

**The classifier distinguishes them correctly** — a genuine mid-band dropped ruling is called
100% reachable and flagged as a streak; a ribbon narrower than one pen is called 100%
unreachable and correctly not flagged, even though its uncovered area is enormous (6 mm²) and
20 mm long. This is not a REJECT: the predicate is not hiding a real defect behind
"unreachable," and it is not flagging harmless sub-pen geometry as a fake streak.

**Note for §5**: Case B's quantized cluster width lands at exactly 0.300 mm too (grid cell
size `penWidth/4 = 0.075 mm` means anything near one pen width quantizes to 4 cells) — the
same boundary value as `trochoidLoop`'s real worst cluster. This is a structural property of
the grid, not a coincidence specific to one law, but it does mean the `> 0.30` cluster-width
bar is *inherently* going to sit exactly on a cell boundary for anything near the pen-width
scale — see §5.

## 4. The five original RED assertions — retired, not widened, honestly

The original `test.each(LAWS)('... <= 0.18 mm² band ...')` (5 assertions, all RED at baseline:
2.06/2.00/1.71/1.23/0.89 mm² vs 0.18) are **deleted**, not softened in place. This is not a
unilateral tolerance widening — it is the binding judge brief's explicit instruction
(`A3-judge.md` §5 item A1: "do not assert `ringNotInkReachableMm2 <= 0.18`... Assert the raw
`ringNotInkMm2 < 3` as an anti-explosion guard... and record `ringNotInkReachableMm2` per law
as a **pinned diagnostic**, not as the unit's pass criterion"), issued *because* the judge
independently proved the 0.18 mm² band was lattice-bought (`trochoidLoop` 0.1800→0.1856 on a
finer search). Verified: the retired band is nowhere silently re-asserted; residual numbers
appear in every assertion's failure message (confirmed by reading the diff — e.g.
`` `${law}: ringNotInkReachableMm2=... ringUnreachableMm2=... (raw ringNotInkMm2=..., historical
band was <= 0.18)` ``); `STILL-OPEN.md`'s A3 bullet and the test file header both say the retired
band is not proof of anything. No test in the diff has a widened tolerance in the softening
sense — the explosion guard (< 3) and diagnostic ceiling (< 1.0) are both far above measured
values and were never meant to gate closure.

## 5. Cluster-shape oracle — real guard, but with essentially zero margin on one axis

Flagged by the coordinator; confirmed independently. The **only** assertion in the amended
file that can still fail is:
```
isStreak = c.crossWidthMm > 0.30 && c.lengthMm > 1.0
```
`trochoidLoop`'s real worst cluster measures **0.900 × 0.300 mm**. In floating point,
`4 * 0.075 = 0.29999999999999998890`, so `crossWidthMm > 0.30` is false **by one ULP**, not by
margin — a cluster growing by exactly one grid cell (0.075 mm) in cross-width, with no other
change, flips that sub-condition to true. The length sub-condition has more room (12 cells =
0.9 mm measured vs 14 cells = 1.05 mm needed to cross 1.0), so a single-axis 1-cell jitter
would not flip the *whole* assertion today — but a real defect that got modestly worse in a
spatially-correlated way (both dimensions growing together, which is exactly how a real corner
artifact would grow) is not implausible.

This is the same "resolution/margin-bought" failure pattern the judge already found and
retired in the mm² band, recurring one level down. It is **not dishonest** — §3 proves the
underlying mechanism is sound, and today's exact numbers are printed in the assertion message,
not hidden — but it is a fragile regression guard: a future *unrelated* geometry change could
flip this specific test without there being a real new streak, or a real modest streak growth
could stay hidden if it only crosses one of the two axes. There is also no committed RGR proof
for *this exact assertion* (only for the underlying `ringNotInkReachableMm2` diagnostic in
`scene3d-ring-coverage-reachability.test.js`); my Case A above is the missing proof and should
be added to the suite.

**Required before this can be trusted as an unattended regression guard (follow-up, not
blocking today's ACCEPT):**
1. Add Case A (or equivalent) as a committed test proving the *actual gating assertion* in
   `scene3d-ribbon-f1b-streaks.test.js` — not just the diagnostic — goes RED for a genuine
   synthetic streak.
2. Give the thresholds real margin over today's measured worst instead of sitting on it: e.g.
   assert `crossWidthMm > 0.30` only above a rounding-safe margin (`0.33`), or pin
   `worstClusterAreaMm2`/`worstClusterDims` per law as an explicit diagnostic (as already done
   for `ringNotInkReachableMm2`) with a small tolerance band (the coordinator's ±10%
   suggestion is reasonable), alongside the boolean gate rather than instead of it.

## 6. Pen width and geometry basis (not render)

`PEN_WIDTH = 0.3` is a literal constant in both test files, annotated "BOUNDS default" and
matches `tests/fixtures/scene3d-shadow-anatomy.js:52` (`penWidth: 0.3`) — the app's actual
default. `classifyReachabilityAtDivisor` and `buildCoverageGrid` operate purely on ring-group
polygon vertices (`pointInRings`, `distToSegment`) and line-segment ink paths — no canvas,
image, or pixel data anywhere in the computation. Confirmed by reading the full function
bodies, not just the diff.

## 7. STILL-OPEN.md wording

`docs/3d-audit/STILL-OPEN.md` line 49 was read and diffed against `A3-judge.md`'s exact §5
item A3 block — verbatim match through "...not to a coverage metric," with the implementer's
own honest addendum ("Implementation landed... F1 STAYS OPEN — this closes nothing above")
appended, not substituted. F1 is explicitly kept OPEN, with the two carried-forward leads
correctly routed: the ink pinhole to `fill-audit-a`, the placement gap to W-26. Nothing in the
wording implies closure. This file is edited in MAIN's tree, uncommitted — the implementer
flagged this explicitly (pre-existing ~25 other uncommitted `docs/3d-audit/*` files from other
lanes already sitting there) rather than silently leaving it; reasonable, not this unit's own
mess to clean up alone.

## 8. Evidence — byte-identity is real, but the capture is the wrong cells (coordinator flag #2)

`after/A3/report.json` states byte-identity in prose (`byte_identical_pairs` array with inline
reasons + the mandatory A4 caveat in `notes`, in the judge's required wording: residue
invisible at tier-A zoom, cluster coordinates named, "this unit therefore proves nothing about
the user's complaint, which stays open"). Confirmed present, matches A3-impl.md.

**Byte-identity itself does not need separate re-derivation**: since §1 confirms `git diff
79c98ca8..HEAD` touches only test/helper files, nothing that participates in rendering
changed, so pixel-identical output for any cell is a logical certainty, not merely a claim —
stronger than re-running the capture pipeline myself would prove. (SHA-256 of the 4 stored
`after/A3/shots/A/*.webp` files independently computed; consistent with a single true capture,
no corruption signature like the `after/W-10` gallery-corruption case in STILL-OPEN.md line 51.)

**But the coordinator's flag is correct and more important**: all 4 re-shot cells are
`torus__{hatch,contour}__ladder__{med,max}__a` — `ladder` never reaches `CLS_RIBBON`
(`wide === 0` for all 4, per the manifest) — so **this evidence set cannot show anything about
F1 even in principle**, exactly as the report itself admits. The report stops at admitting the
gap; it does not fix it, and it should have been cheap to fix:

**Gallery cells for the actual F1 tone laws already exist**, captured in an earlier session
(`docs/3d-audit/fill-audit/shots/B/`, dated 2026-09-04, real non-corrupt WebP files verified —
e.g. `torus__hatch__interlockWeave__med__a.webp` 35 KB, `file` confirms valid WebP):
```
torus__hatch__{interlockWeave,onePenDown,trochoidLoop,ampSpacing,weaveDepth}__{low,med,max}__{a,b}
```
30 cells total, exactly the mapper (`hatch`) the F1B test itself builds
(`buildTorusLaw`'s default `mapper: 'hatch'`) and exactly the 5 laws under test. **These were
never captured into `after/A3/`.** The orchestrator should add a dedicated F1 evidence unit
using:
```
node scripts/audit/scene3d-capture.js --tier B --root <worktree or archive> --port <free> \
  --only '^torus__hatch__(interlockWeave|onePenDown|trochoidLoop|ampSpacing|weaveDepth)__(low|med|max)__(a|b)$' \
  --out docs/3d-audit/fill-audit/after/<new-W-id>
```
(or re-use the existing `shots/B/` cells directly if their provenance/commit is confirmed
clean — check for the same corruption signature as the W-10 case in STILL-OPEN.md line 51
before trusting them as-is).

## 9. report.json schema gap (minor, fixable)

`scripts/audit/scene3d-before-after.js` (lines ~134–153, ~337–363) reads a specific
`identical_exceptions: { "<basename>": { identical: true, reason } }` map to render a
byte-identical pair as **"byte-identical (explained)"** — anything identical without an entry
in that exact map renders as **"byte-identical — UNEXPLAINED"** (a warn-styled pill), *even if*
the report's `notes`/`byte_identical_pairs` prose explains it. `after/A3/report.json` uses only
`byte_identical_pairs` (a plain annotated string array) — confirmed by reading the file — and
has no `identical_exceptions` key. This convention was formalized by the concurrent **GH-1**
unit (also documented in `STILL-OPEN.md`, which retrofitted exactly this map onto `W-01` and
`W-03`). Once the gallery HTML is rebuilt, all 4 A3 cells will show the orange "UNEXPLAINED"
badge despite being legitimately explained — a real, if cosmetic, gap against the now-current
convention. Fix: add
```
"identical_exceptions": {
  "torus__hatch__ladder__med__a.webp": { "identical": true, "reason": "oracle-side unit, no src/ change; ladder never reaches CLS_RIBBON" },
  ... (3 more)
}
```

## Verdict

**ACCEPT-WITH-FOLLOWUPS.** The oracle split itself is sound: no `src/` change, the retirement
of the 0.18 mm² band was judge-authorized and honestly disclosed (not a quiet widening), the
reachable/unreachable predicate is geometry-based at the app's real default pen width, and two
adversarial cases I built independently (a real mid-band dropped ruling vs. a sub-pen-width
ribbon) show the classifier genuinely distinguishes a streak from an unreachable gap rather
than being able to hide one behind the other. F1 correctly stays OPEN and is routed to the
right places (W-26, fill-audit-a).

Not blocking, but required before the deliverable is complete:
1. **Cluster-shape oracle margin** (§5) — add a committed RGR proof for the actual gating
   assertion, and give its thresholds real headroom instead of sitting on today's exact
   measured worst case.
2. **Evidence capture** (§8) — re-shoot (or validate and reuse) the 30
   `torus__hatch__<law>__<density>__<angle>` cells that actually exercise CLS_RIBBON; the
   current `after/A3/` evidence is non-probative by the report's own admission and a fix is
   cheap.
3. **report.json schema** (§9) — add `identical_exceptions` so the rebuilt gallery badges the
   4 cells "explained" instead of "UNEXPLAINED."

None of these change the honesty of what shipped or reopen the closure question — they
harden a unit that is already correctly conservative (F1 stays open) against becoming
misleading later.
