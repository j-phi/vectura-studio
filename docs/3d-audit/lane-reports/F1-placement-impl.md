STATUS: MEASURED

# F1-placement — implementer report (lane fill-audit-a3)

**Worktree:** `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a3`
**Branch:** `3d-scene/fill-audit-a3`
**Base sha:** `8adfd5af` (W-36c) → **Final sha: `cd541f87`**
**Predecessor WIP:** `32ec6ef0` (UNVERIFIED, dead — implementer killed by rate limit 2026-09-11)

This implementer's role was mostly *verification*, not authorship: the predecessor's WIP already
contained the correct, correctly-scoped fix (Prototype B / LOCAL) and a comprehensive new oracle
file. I verified every claim in its `report.json` against this tree myself, found one of them
**materially wrong** (the "pre-existing red" claim on two guard files), corrected the record, and
shipped. **No `src/` file was touched in this session.**

## STEP 0 — WIP verification

Ran all four required checks, foreground, one at a time:

| test file | result |
|---|---|
| `scene3d-ribbon-flat-field-placement.test.js` (new) | **22/22 PASS** |
| `scene3d-mark-laws-draw.test.js` | **30/30 PASS** (matches T4/W-36c's number) |
| `scene3d-ladder-uniform-field-spacing.test.js` | **9/9 PASS** |
| `scene3d-style-fill-lines.test.js` | **15/15 PASS** |

**WIP is GREEN. Adopted as-is** (files: `src/core/scene3d/surface-fill.js` +31,
`tests/helpers/scene3d-blank-map.js` +196 new, `tests/unit/scene3d-ribbon-flat-field-placement.test.js`
+470 new). I made exactly one change on top: corrected a stale/wrong comment block in the test file
(condition 3's numbers and "retired" framing — see below). No assertion changed.

## The five ruled conditions

**Condition 1 — PRIMARY oracle, deep-blank (>2mm), ±10% band.** Re-derived RED myself via
`VECTURA_PRE_F1P=1` (this test file correctly reads that flag): pre-fix `3.02 / 4.00 / 1.79 mm²`
(interlockWeave/onePenDown/trochoidLoop) — matches the WIP's claim exactly, and confirms the plan's
own §10 figures (11.89/14.70/12.15, from base `3c88605f`) are stale for this tree. Prototype B:
`0.03 / 0.00 / 0.00 mm²`. Bar `≤0.5mm² (±10%→0.55)` — inside both populations with ≥3.6x margin.
**GREEN, independently reproduced.**

**Condition 2 — total-area bar restated.** Re-derived via a temporary unconditional `console.log`
in the two RED-2 assertions (added, run, values recorded, then manually reverted — `git diff`
confirmed clean before the final commit). Pre-fix largest `>0.8mm` cluster `45.89 / 39.04 / 55.67 mm²`;
Prototype B `39.81 / 21.27 / 14.03 mm²`. Bars `≤45mm² area, ≤30mm extent` — matches the WIP's claim
exactly. **Disclosed under `## Bars changed` below** (these are new bars for a new oracle, not a
change to an existing bar, but the plan explicitly calls raising them "a bar change" if Prototype B
is shipped, so I am treating the disclosure as mandatory either way).

**Condition 3 — RED-1(b) restated, not retired.** This is where I found a real defect in the WIP's
own paperwork, not its code. The test file's own comment claimed post-fix ratios `11.9/12.4/5.1`
(interlockWeave/onePenDown/trochoidLoop) and used the word **"RETIRED"** — directly contradicting the
orchestrator's binding ruling ("RESTATED, not RETIRED"). I re-measured this myself, twice, foreground:

- Pre-fix (`VECTURA_PRE_F1P=1`): ratio `10.37 / 12.83 / 18.30` — matches the WIP's rounded
  `10.4/12.8/18.3`.
- Post-fix (Prototype B, as shipped): ratio **`7.58 / 11.20 / 3.50`** — does **NOT** match the WIP's
  claimed `11.9/12.4/5.1` for two of the three laws.

I do not know why the WIP's comment had different numbers than what I measured on the identical
commit — possibly a transcription error from an earlier iteration, possibly a stale run. What
matters is the disposition survives re-measurement: **the populations still overlap** (pre-fix
minimum `10.37` is *less than* post-fix maximum `11.20`), so no single bar in `[10.37, 11.20]` passes
every post-fix law while failing every pre-fix law. I proved this arithmetically, not just asserted
it. Per the orchestrator's ruling ("gate it, or if measurement proves it cannot separate pre from
post, ship a stop-report on that one condition with the numbers, disclosed under `## Bars changed`")
— **I am shipping the stop-report disposition**, with corrected numbers, in the test file comment
(`tests/unit/scene3d-ribbon-flat-field-placement.test.js:287-311`, this commit) and here. The test
still only asserts a non-discriminating sanity ceiling (`ratio < 200`) — deliberately not a gate, and
now honestly labeled as such.

**Condition 4 — byte-identical WV6 laws.** Re-verified:
- Unit-harness: 18/18 combinations (ampSpacing/weaveDepth × torus/sphere/cone × density 25/50/100)
  byte-identical pre/post-fix ink — the test's own describe block, re-ran, PASS (156s).
- Real captures: **5/6** byte-identical by md5 to the top-level gallery baseline: `torus/ampSpacing`
  (med+max), `torus/weaveDepth` (med+max), `cone/ampSpacing`. The 6th, `cone__contour__amplitudeOnly__med__a`,
  is **NOT** byte-identical — and this is **correct**, not a leak: `amplitudeOnly` is one of
  `isWaveLaw()`'s four pre-Round-6 members (`interlockWeave: 1, trochoidLoop: 1, amplitudeOnly: 1,
  onePenDown: 1` at `surface-fill.js:75`), not a WV6 law, so `isWaveLaw() && !isWv6()` legitimately
  includes it in `wvPlaceCov`'s scope. It is **not** in stop-condition-1's must-not-move list
  (`ampSpacing`, `weaveDepth`, `taperedEnds`, `weightSmoothstep` only). The plan's resume-brief text
  calling it a "control" was imprecise — I'm flagging the correction here rather than silently
  treating the mismatch as a leak.

**Condition 5 — F1-amp handoff.** Disclosed, not implemented. `wvRamp(I)` returns `0` for every
`I ≥ WV_I0 = 0.62` for all three subject laws (no Round-6 amplitude floor), so a plain-ruling
highlight stripe is still geometrically unavoidable after placement alone. **This is NOT "F1
CLOSED."** F1-amp must be serialized after this unit, same file, same lane.

## Pre-existing red — CORRECTED (this is the substantive finding of this session)

The brief instructed me to reproduce, at `8adfd5af`, the exact failing test names for
`scene3d-ribbon-f1b-streaks.test.js` (8/44) and `scene3d-ribbon-wall-coverage.test.js`, and confirm
they're identical to the final-commit set — on the premise (from the dead predecessor's `report.json`)
that this redness is pre-existing and "not caused by the fix." **That premise is wrong, and I can
prove it.**

**Why the predecessor's own proof was vacuous.** Its comparison ran the SAME worktree test file with
`VECTURA_PRE_F1P=1` set, on the theory that this reproduces the pre-fix tree. It does not:
`scene3d-ribbon-f1b-streaks.test.js` reads a **different** env var (`VECTURA_PRE_F1B`, gated to its
own `d5af9e30` baseline, unrelated to F1-placement), and `scene3d-ribbon-wall-coverage.test.js` reads
no pre-fix flag at all. Setting `VECTURA_PRE_F1P=1` while running either file changes nothing — both
of the predecessor's "pre-fix" and "post-fix" runs executed the **identical post-fix worktree code**.
Comparing a thing to itself and calling the match "proof of no regression" is the exact vacuous-proof
failure mode `W-38` was rejected for.

**True pre-fix measurement.** Built a scratch export: `git archive 8adfd5af | tar -x`, `node_modules`
symlinked from MAIN, grepped to confirm `wvPlaceCov` is genuinely absent. Ran both files there:

- `scene3d-ribbon-f1b-streaks.test.js`: **44/44 PASS**
- `scene3d-ribbon-wall-coverage.test.js`: **36/36 PASS**

**Post-fix measurement (the shipped worktree, Prototype B, final sha `cd541f87`):**

- `scene3d-ribbon-f1b-streaks.test.js`: **36/44** (8 fail — 7 interlockWeave, plus 1 more
  interlockWeave-class assertion; 2 of the 8 are trochoidLoop's lattice/streak checks)
- `scene3d-ribbon-wall-coverage.test.js`: **35/36** (1 fail — interlockWeave)
- `onePenDown`: **0 failures** in either file.

**Failing test names, post-fix (`cd541f87`), `scene3d-ribbon-f1b-streaks.test.js`:**
```
interlockWeave — the existing ring-fill-rate contract still holds (>= 0.995)
interlockWeave — raw ringNotInkMm2 stays inside a sane anti-explosion guard (< 3 mm²)
interlockWeave — pen-unreachable-corrected residue is a recorded diagnostic, not the pass bar
interlockWeave — lattice sensitivity: doubling the divisor moves the reachable-cell count by <= 1 cell
trochoidLoop — lattice sensitivity: doubling the divisor moves the reachable-cell count by <= 1 cell
interlockWeave — no uncovered cluster reads as a lengthwise streak
trochoidLoop — no uncovered cluster reads as a lengthwise streak
interlockWeave — anti-vacuity: no coverage bought with centrelines
```
**`scene3d-ribbon-wall-coverage.test.js`:**
```
interlockWeave — near-pen ribbons are coverage-clean (ring-fill-rate >= 0.995)
```

**These sets are NOT identical to the true pre-fix set (which is empty, 44/44 and 36/36 clean) — the
brief's premise that they must match does not hold, because the premise itself was built on the
predecessor's flawed comparison.**

### Root cause, traced

Using `tests/helpers/scene3d-ring-coverage.js`'s own grid/ring/ink data (the exact structures the two
guard files read), I wrote a throwaway probe script that dumps `stats`/`coverage` numerically and
rasterizes the ring polygons (blue), final ink (white), and uncovered cells (red) as a PNG directly
in document-mm space (no dependency on the screenshot's camera transform).

**interlockWeave, numeric:**

| | pre-fix (`8adfd5af`) | post-fix (Prototype B) |
|---|---|---|
| `ringFillRate` | 0.99688 | **0.93632** (bar ≥0.995) |
| `ringNotInkMm2` | 2.059 | **38.948** (bar <3) |
| `stats.degenerate` | 0 | **1** |
| `stats.erodeEmpty` | 0 | **1** |

**trochoidLoop, numeric** (a much milder version of the same phenomenon, no erosion failure):

| | pre-fix | post-fix |
|---|---|---|
| `ringFillRate` | 0.99751 | 0.99627 (fails the ≥0.995 bar narrowly) |
| `ringNotInkMm2` | 1.710 | 2.469 (still under the <3 bar) |
| `stats.degenerate` | 0 | 0 |

**Mechanism:** `ribbonize()`'s erode-then-fill path (`surface-fill.js` ~:7208-7228). Under Prototype
B, one `CLS_RIBBON` stretch's erosion produces an empty outline+fill multipolygon — a pre-existing
`insetMultiPolygon`/FillBoolean robustness gap the plan's §9 already named ("insetMultiPolygon
swallowed-failure ladder"), **exposed** by Prototype B's changed geometry, not introduced by it. The
code's own fallback fires: `if (!any) { ribbonRefuse('erodeEmpty'); outp.push(centrePass(st.a, st.b));
return; }` — it does **not** leave a total void; it substitutes a bare single-pen centreline for that
one stretch's usual full-width ribbon fill.

**I looked at it.** Reconstructed the exact document-space geometry for both trees (screenshots below
are attached under `docs/3d-audit/fill-audit/after/F1-placement/`, filenames `postfix-interlockWeave_render.png`
/ `prefix-interlockWeave_render.png` are NOT committed — they're scratch artifacts; the numbers and the
description here are the record). Pre-fix: a clean, unbroken zigzag pattern with ~5 stray red flecks
(366 uncovered cells total, 0.13% of the grid). Post-fix: the same pattern, except one ~25-30mm run
(two clusters, 18.75mm² + 17.65mm² = 36.4mm², together 99% of interlockWeave's 36.64mm² reachable
residue) shows the family's usual solid wide-ribbon fill replaced by a single thin centreline — visible
as a thin white zigzag threading through an otherwise-red (uncovered) band, not a total black hole.

**Relationship to condition 2.** This thinned stretch is very likely the **same event** as condition
2's own already-disclosed `39.81mm²` restated-bar cluster for interlockWeave — the magnitudes are
close (39.81 vs 38.95mm²) and so is the document-space location (both ~x137-165, y71-98mm on this
fixture). If they are the same event, this is **not a new, undisclosed catastrophe** — it is the
already-priced-in Prototype-B trade-off (condition 2: "B measures more area but far less depth"),
just also visible through two OLDER guard files whose bars (`ringFillRate ≥ 0.995`,
`ringNotInkMm2 < 3`) were never re-pinned to accommodate that ruled trade-off. I could not prove
within this unit's budget that they are the literal same polygon (the two oracles use different
region/clip definitions — RED-2 rasterizes distance-to-nearest-ink over the front-visible region;
the ring-coverage oracle checks per-clip-group polygon coverage), so I am reporting both readings
honestly rather than asserting an unproven identity.

**Why I did not fix it.** `tests/unit/scene3d-ribbon-f1b-streaks.test.js` and
`tests/unit/scene3d-ribbon-wall-coverage.test.js` are **outside F1-placement's allowed-file scope**
(only the new oracle file is allowed). `insetMultiPolygon`/`ribbonizeCore`/the erosion pipeline are
explicitly forbidden files per this brief and the plan's §12. Per the resume brief's own instruction
("do NOT try to fix it — it points at the self-occlusion/erosion pipeline, outside your allowed
files"), I characterized it instead of touching it.

**This is the reason this unit is MEASURED and not DONE.** The orchestrator needs to rule on one of:
(a) grant scope to re-pin `f1b-streaks`/`wall-coverage`'s interlockWeave bars to reflect condition 2's
already-ruled trade-off, or (b) rule that this fallout is acceptable to ship as-is (two now-red guard
files, one real-but-modest visual thinning of one stretch out of ~40), or (c) something else. I did
not revert or block the commit — the WIP's own fix mechanism and RED-2 oracle are sound and match
Jay's decision 4=A ruling — but I am not calling this DONE while two previously-green guard files are
now red as a direct, traced consequence of shipping it.

## Guards — all run individually, foreground, `timeout: 600000`

24 files, all green (some carry pre-existing, unrelated skips):

`scene3d-curved-density-floor` 13/13 · `scene3d-curved-density-sparse-end` 20/20 ·
`scene3d-ribbon-f7-self-occlusion` 2/2 · `scene3d-ribbon-c3-rule5` 6/6 ·
`scene3d-ribbon-outline-fill-seam` 4/4 · `scene3d-ribbon-wall-region-clip` 1/1 ·
`scene3d-ribbon-weightscale-invariant` 18/18 · `scene3d-ribbon-primitives` 14/14 ·
`scene3d-ribbon-f6-self-occlusion` 2/2 · `scene3d-fill-even-spacing` 12/12 ·
`scene3d-fill-span-verdict` 11/11 · `scene3d-fill-ruling-continuity` 10/10+1 skip ·
`scene3d-fill-seam-continuity` 5/5 · `scene3d-fill-boundary-ends` 41/41 ·
`scene3d-plot-floor-obj` 12/12 · `scene3d-plot-safety` 5/5+1 skip ·
`scene3d-tone-algo-default` 6/6 · `scene3d-hatch-density-500` 14/14 ·
`scene3d-subwindow-density` 3/3+2 skips · `scene3d-appdefault-lit-floor` 4/4+1 skip ·
`expand-scene3d-weight-to-strokes` 5/5 · plus the two flagged files above and the four STEP-0 files.

Every guard's own non-trivial numbers were read from the actual test output (no vacuous "no throw"
passes accepted).

## Bars changed

- `tests/unit/scene3d-ribbon-flat-field-placement.test.js:110` — **new bar**
  `RED2_DEEP_BLANK_MM2 = 0.5` (±10% → 0.55). Not a change to a prior bar (new oracle file). Condition
  1's PRIMARY gate. Set inside both re-derived populations on this tree: pre-fix worst case 1.79mm²
  is 3.6x the bar; post-fix worst case 0.03mm² is 16x under it.
- `tests/unit/scene3d-ribbon-flat-field-placement.test.js:118-119` — **new bars**
  `RED2_LARGEST_CLUSTER_MM2 = 45`, `RED2_LARGEST_EXTENT_MM = 30`. Condition 2's restated total-area
  bar, per Jay's ship-Prototype-B ruling (Prototype B measures more area, far less depth, than the
  plan's original 32mm²/25mm, which was tuned for Prototype A). B's worst case 39.81mm²/27.4mm sits
  under both bars with working margin.
- `tests/unit/scene3d-ribbon-flat-field-placement.test.js:287-311` — **comment-only correction, no
  assertion changed.** The predecessor's comment claimed post-fix RED-1(b) ratios `11.9/12.4/5.1` and
  called the disposition "RETIRED". Corrected to the numbers I actually re-measured on this tree
  (`7.58/11.20/3.50`) and to "RESTATED, not RETIRED" per the orchestrator's ruling, with an explicit
  proof that the pre-fix/post-fix populations overlap (so no bar can be set) inline in the comment.

No bar in `scene3d-ribbon-f1b-streaks.test.js` or `scene3d-ribbon-wall-coverage.test.js` was touched —
those files are outside this unit's allowed scope. Their `ringFillRate ≥ 0.995` / `ringNotInkMm2 < 3`
bars are the ones now failing for interlockWeave; see "Pre-existing red — CORRECTED" above.

## Evidence

Re-shot from this worktree (port 8475, `window.Vectura.APP_VERSION` confirmed `1.4.1` matching
`package.json`), landing in MAIN's `docs/3d-audit/fill-audit/after/F1-placement/`. The directory
already held the dead predecessor's stale shots (12 `.webp`, dated Sep 11) — moved aside, and my
fresh re-render came back **byte-identical by md5** to every one of them (confirming determinism:
the production code is unchanged since `32ec6ef0`), then I overwrote with my own fresh capture as the
tree's evidence of record.

Cells: `torus__hatch__{interlockWeave,onePenDown,trochoidLoop,ampSpacing,weaveDepth}__{med,max}__a` +
`cone__contour__{ampSpacing,amplitudeOnly}__med__a` — all 12 present, all re-shot.

**LOOKED at all subject cells (Read tool), native-resolution crops of the lower-front band beneath
the inner hole:**

- **interlockWeave** (before vs after, 2x-zoomed lower-band crop): both show the same general
  weave structure — a run of clean uniform zigzag teeth on the right two-thirds, a busier/more
  irregular run on the left third (present in BOTH before and after — a genuine feature of the
  weave's geometry at this camera angle, not a fix artifact). A simple pixel diff of before vs after
  shows only small, scattered tooth-tip shifts distributed around the whole ring (consistent with
  legitimate re-placement), **not** a large solid patch — the actual erosion-fallback defect (above)
  sits at a different location than where I initially suspected from casual inspection, and is
  visible only via the direct document-space reconstruction, not as an obvious anomaly in the
  screenshot at this zoom. I want to be honest that I could not visually confirm the ~36mm² thinned
  stretch by eye in the rendered `.webp` at the resolution captured — the reconstruction proof (numeric
  + rasterized from the same source data) is what establishes it, not the screenshot.
- **onePenDown** (before vs after, lower-band crop): a real, visible difference — before shows bolder,
  more solid triangular teeth; after shows a visibly thinner, more line-like zigzag across much of the
  band. Given onePenDown has **zero** guard failures and its RED-2 numbers improved substantially
  (condition 2: 39.04→21.27mm²), I read this as the intended effect of even screen-placement (more,
  thinner rulings replacing fewer, thicker ones) — not a regression.
- **trochoidLoop** (before vs after, lower-band crop): visually indistinguishable at this zoom — matches
  its much smaller numeric shift (ringFillRate 0.9975→0.9963).

`identical_exceptions` (byte-identical to gallery baseline, confirmed by md5): `torus/ampSpacing`
(med, max), `torus/weaveDepth` (med, max), `cone/ampSpacing` — 5 of 6 controls, per condition 4.
`cone/amplitudeOnly` is the expected exception (see condition 4 above — it's in scope, not a leak).

## Files touched this session

- `tests/unit/scene3d-ribbon-flat-field-placement.test.js` — comment-only correction (287-311).
- `docs/3d-audit/fill-audit/after/F1-placement/report.json` — rewritten with corrected findings.
- `docs/3d-audit/fill-audit/after/F1-placement/shots/B/*.webp` — 12 files, freshly re-shot (gitignored,
  not tracked).
- `docs/3d-audit/fill-audit/after/F1-placement/manifest.B.1-1.jsonl` — regenerated by the capture script.
- This report.

No other file in the worktree was modified. `src/core/scene3d/surface-fill.js` and
`tests/helpers/scene3d-blank-map.js` are exactly as the predecessor's WIP left them (verified via
`git diff` before commit — only the one comment-correction file was staged).

## Recommendation

Ship the mechanism (it's correct, well-tested, and matches Jay's ruling) but **do not close F1 or
this unit as DONE** until the orchestrator rules on the `f1b-streaks`/`wall-coverage` fallout above.
F1-amp (condition 5) is the next unit in this lane, serialized after this one, per the ruling.
