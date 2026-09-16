STATUS: ACCEPT-WITH-FOLLOWUPS

# F1-placement — adversarial review (lane fill-audit-a3)

**Reviewer.** Read-only in `.claude/worktrees/fill-audit-a3`. Pinned range `8adfd5af..cd541f87`
(`32ec6ef0` = dead predecessor's unverified WIP, `cd541f87` = this session's verified commit).
Reproduced everything in scratch exports at `/private/tmp/claude-501/scratch-F1P/{pre,post}`
(`git archive 8adfd5af`/`cd541f87` from the worktree, `node_modules` symlinked from MAIN). No file
in the worktree was edited, stashed, checked out, or reset. `git -C <worktree> status --short --
. ':!graphify-out'` is clean at the end of this review, as it was before I started.

**One methodology note, in my own favor of honesty over the implementer's own standard:** my first
pass at guard condition 8 measured `scene3d-curved-density-floor.test.js` at the WORKTREE'S CURRENT
HEAD (`dcc91872`) and got 14/14, apparently contradicting the impl report's "13/13". Investigation
(`git log --oneline` on the worktree) showed `dcc91872` is **one commit past `cd541f87`** — a later,
separate, already-closed unit (W-36d, tests-only, `+1` test to this exact file, per `LEDGER.md` row
4a) landed on this lane AFTER F1-placement. Re-run against my `cd541f87`-pinned scratch export gave
**13/13**, exactly matching the impl report. **No discrepancy — my error, corrected before writing
this up.** Recorded here because it is exactly the kind of "worktree moved since the report was
written" trap the protocol warns reviewers about.

## Condition 1 — primary oracle (deep-blank >2mm) — ACCEPT, independently reproduced

Copied the new test file + helper (`tests/unit/scene3d-ribbon-flat-field-placement.test.js`,
`tests/helpers/scene3d-blank-map.js`) into the `pre` scratch export (genuinely absent there — new
files) and ran them directly against the untouched `8adfd5af` `surface-fill.js` (confirmed
`grep -c wvPlaceCov` = 0 in `pre`, 4 in `post`; no `VECTURA_PRE_F1P` env var needed or used since the
export's own source is already old).

**RED at pre, 7/22 failed, named:**
- `interlockWeave — PRIMARY: dist>2.0mm blank area…` → `deepBlank=3.0200mm2` (claim: 3.02 — exact)
- `onePenDown — PRIMARY…` → `deepBlank=4.0000mm2` (claim: 4.00 — exact)
- `trochoidLoop — PRIMARY…` → `deepBlank=1.7900mm2` (claim: 1.79 — exact)
- `interlockWeave — largest dist>0.8mm cluster…` → 45.89mm² (matches condition-2 pre-fix table exactly)
- `trochoidLoop — largest dist>0.8mm cluster…` → 55.67mm² (matches condition-2 pre-fix table exactly)
- `RED-1(a) … Prototype B is not a no-op` — fails at pre by construction (no prototype present); not
  a real defect, expected at a pre-fix tree copy.
- `condition 4 … byte-identical` — errors (`fatal: not a git repository`) because the scratch export
  has no `.git`; environmental artifact of my reproduction method, not a test or code defect (see
  Condition 4 below for how I verified this independently).

**GREEN at post (`cd541f87`, unmodified):** 21/22 pass; PRIMARY assertions pass for all three
subjects; only the same git-dependent byte-identity test fails for the same environmental reason.

Numbers match the impl report and `report.json` exactly, independently re-derived, not copied.
**ACCEPT.**

## Condition 2 — total-area bar restated — ACCEPT, disclosure present and honest

Re-derived directly (no reliance on the implementer's console.log claim): reran the RED-2 cluster
tests in `post` with a one-line temporary `console.log` added to a throwaway copy of the test file in
my own scratch dir (never touched the worktree). Got, for `interlockWeave`:
`{"areaMm2":39.81,"lengthMm":27.4,"crossWidthMm":6.9,"centroid":{"x":137.78,"y":74.52}}` —
matches the report's `39.81 (27.4×6.9mm)` exactly. `onePenDown` 21.27 (23.3×3.0), `trochoidLoop`
14.03 (19.2×2.7) — both exact matches too. `## Bars changed` in the impl report discloses these as
new bars (`RED2_LARGEST_CLUSTER_MM2 = 45`, `RED2_LARGEST_EXTENT_MM = 30`) with justification.

**The bar does NOT separate pre- from post-fix per law** — confirmed directly: pre-fix `onePenDown`
39.04mm² < post-fix `interlockWeave` 39.81mm². The report says so plainly and does not hide it
behind condition 1. **ACCEPT** — disclosed as required, and condition 1 (which does separate cleanly,
with ≥3.6x margin both sides) is correctly identified as the actual gate.

## Condition 3 — RED-1(b) restated, not retired — ACCEPT

Independently reran the "drawn perpendicular gap" test in both `pre` and `post` scratch exports:

- Pre-fix: `interlockWeave 10.37, onePenDown 12.83, trochoidLoop 18.30` — exact match to report.
- Post-fix (Prototype B): `interlockWeave 7.58, onePenDown 11.20, trochoidLoop 3.50` — exact match
  to the implementer's **corrected** numbers, and confirms the predecessor's original comment
  (`11.9/12.4/5.1`, "RETIRED") really was wrong on two of three laws — the implementer's own
  self-correction stands up.

The orchestrator's ruling was: gate it, or ship a measured stop-report on this ONE condition,
disclosed under `## Bars changed` — "silently downgrading to measured, not gated" is what REJECTS.
The implementer's disposition ("measured, NOT gated … RESTATED per the orchestrator's ruling, not
RETIRED") is the SAME final disposition the dead predecessor shipped, but it is not silent here: it
appears under `## Bars changed`, with the corrected numbers, and with an arithmetic proof that no bar
can separate the populations (pre-fix min 10.37 < post-fix max 11.20 — I verified this inequality
myself from the numbers above). That is the ruling's "only honest alternative," executed, not evaded.
**ACCEPT.**

## Condition 4 — byte-identity — ACCEPT, verified two independent ways

1. **Real captures, md5 by hand** (not trusting the report's claim):
   `torus__hatch__ampSpacing__{med,max}__a`, `torus__hatch__weaveDepth__{med,max}__a`,
   `cone__contour__ampSpacing__med__a` — **all 5 MD5-identical** between
   `docs/3d-audit/fill-audit/after/F1-placement/shots/B/` and the top-level gallery baseline
   `docs/3d-audit/fill-audit/shots/B/`. Exact match to the report's claim.
2. **Unit-harness (18/18 combinations)** — ran the condition-4 describe block directly **in the
   worktree** (it has `.git`, so the test's own `git show 8adfd5af:…` mechanism works; this is not
   read-write, running vitest does not touch tracked files, confirmed clean after): **1 passed, 21
   skipped** (filtered to just this test), i.e. **the 18-combination byte-identity assertion PASSED**,
   in 176.6s (report claimed 156s — reasonable machine-load variance, one benign
   `[vitest-worker] onTaskUpdate` timeout warning, pre-existing documented noise, exit clean).

The `cone__contour__amplitudeOnly__med__a` non-match is correctly explained (in scope of
`isWaveLaw() && !isWv6()`, not in the must-not-move list) — I confirmed `isWaveLaw()`'s member list
independently in the diff (`interlockWeave`/`trochoidLoop`/`amplitudeOnly`/`onePenDown` are the four
flat-coverage wave laws touched by the fallthrough). **Also independently confirmed a THIRD control,
`taperedEnds`, is untouched**: its `deepBlank=0.26mm2, largestCluster=50.97mm2 (38.1×18.6mm)` line
printed byte-for-byte identically in both my pre-export and post-export console output — extra,
unasked-for corroboration that the fix is correctly scoped. **ACCEPT.**

## Condition 5 — regression finding — ACCEPT, exact numbers reproduced, this is the real finding

Confirmed both guard files are byte-identical between `pre` and `post` scratch exports (only
`surface-fill.js` differs), so any outcome difference is attributable purely to the fix, not to a
stale/copied test file.

- `scene3d-ribbon-f1b-streaks.test.js`: **pre 44/44 PASS**, **post 36/44 (8 fail)** — I independently
  ran both and the 8 failing test names I got are **identical, word for word**, to the report's list
  (7 interlockWeave + `interlockWeave`/`trochoidLoop` lattice-sensitivity + streak-shape pair).
- `scene3d-ribbon-wall-coverage.test.js`: **pre 36/36 PASS**, **post 35/36 (1 fail)** —
  `interlockWeave — near-pen ribbons are coverage-clean (ring-fill-rate >= 0.995)`, failure message
  `expected 0.9363204944266638 to be greater than or equal to 0.995` — the **exact 13-decimal number**
  the report cites, independently reproduced, not copied.
- The `[FillBoolean] polygon union failed on degenerate geometry: … Unable to complete output ring
  starting at [130.00326666903993, 71.24728773095754]. Last matching segment found ends at
  [149.07770364394608, 76.54293880299473]` warning fired in my own post-export run, at the same
  coordinates the report cites.

**The implementer's central finding — that the dead predecessor's "pre-existing red" claim was
vacuous (comparing the post-fix worktree to itself via an env var neither guard file reads) — is
correct and I verified it the same way the implementer describes: `VECTURA_PRE_F1B` ≠
`VECTURA_PRE_F1P`, and `wall-coverage.test.js` reads no pre-fix flag at all.** This is real,
substantive review work by the implementer, not a rubber stamp of the WIP. **ACCEPT** on the
measurement; see "Open item" below on what to do about it.

## Condition 6 — same event as condition 2's cluster? — largely yes, with numbers, not fully provable

Extracted the interlockWeave RED-2 cluster's actual centroid at post (not just the range the report
gives): `centroid (137.78, 74.52)`, `length 27.4mm`, `crossWidth 6.9mm` → bbox roughly
x:[124, 152], y:[71, 78]. The erode-fallback `[FillBoolean]` failure's two endpoints,
`(130.00, 71.25)` and `(149.08, 76.54)`, **both fall inside that bbox**, and the cluster centroid sits
almost exactly at their midpoint. This is stronger corroboration than the report's own "~x137-165,
y71-98" range gives credit for — the centroid is dead-center on the erode-failure segment. **Answer:
YES, with numbers, at the confidence the implementer already claimed** (very likely the same event,
not proven as the literal same polygon — the two oracles use different region/clip definitions, as
the report says, and I did not attempt to trace `insetMultiPolygon`'s internal polygon IDs to prove
literal identity within this review's budget either).

## Condition 7 — mutation checks — ACCEPT, oracle is non-vacuous

**(a) Revert the wiring.** In a scratch copy of `post`, removed the one wiring line
(`if (isWaveLaw() && !isWv6()) return wvPlaceCov(localPitch);` at `surface-fill.js:4431`) and reran
the PRIMARY deep-blank tests: **all 3 went RED again**, with values `3.02 / 4.00 / 1.79 mm²` —
identical to the true pre-fix numbers. This proves the oracle is sensitive to the actual mechanism,
not to something incidental, and that the fix's effect size is real (mutation kill confirmed).

**(b) Trivial centreline-only fill.** The anti-vacuity `describe` block asserts `stats.wide > 0` for
each subject law (`wide` is a real counter, incremented only in the CLS_RIBBON branch that builds a
genuine multipolygon — confirmed by reading `surface-fill.js:7156`, distinct from the `wallEmpty`/
`erodeEmpty`/`wallCentres` centreline-fallback counters). A fix that "cheated" by turning most ribbon
fill into bare centrelines would drive `wide` toward 0 and would also crater the object's total ink —
neither happened (ink moved only −5.3% to −5.8%, and only ONE stretch of ONE law substituted a
centreline, per condition 5's own `erodeEmpty` count of exactly 1). I judge this a real, non-vacuous
guard, with the caveat that `stats.wide > 0` alone is a low bar (it does not bound *how much* of the
improvement is genuine wide coverage vs. partial substitution) — a stricter guard would assert `wide`
does not *fall* relative to pre-fix, which is checked qualitatively in the stop-conditions section
of the plan but not asserted as a numeric bar in this test file itself. Not a blocker; worth a
follow-up note.

## Condition 8 — guard spot-check — ACCEPT (one stale count explained above, not a defect)

Spot-checked 4 of the 24 claimed-green guards, including both curved-density files, all pinned to
`cd541f87`:

| file | report claim | my measurement | match |
|---|---|---|---|
| `scene3d-curved-density-floor.test.js` | 13/13 | 13/13 (in `cd541f87`-pinned scratch export) | yes |
| `scene3d-curved-density-sparse-end.test.js` | 20/20 | 20/20 (worktree, unaffected by later commit) | yes |
| `scene3d-ribbon-weightscale-invariant.test.js` | 18/18 | 18/18 | yes |
| `scene3d-fill-boundary-ends.test.js` | 41/41 | 41/41 | yes |

All four non-vacuous (real numeric assertions on fill counts / ring-fill-rate / geometry, not
"no throw").

## Condition 9 — look at the pictures — done, corroborates the implementer's own honesty

Cropped `torus__hatch__interlockWeave__med__a` before/after at 3x native resolution on the lower-front
band, and ran a pixel-diff heatmap across the full 800×335 frame. **The diff is broadly distributed
across ~5-6 of 8 grid columns**, not concentrated in one obvious blob — consistent with the
implementer's own statement that they "could not visually confirm the ~36mm² thinned stretch by eye…
the reconstruction proof… is what establishes it, not the screenshot." I independently corroborate
that this is an accurate, non-evasive description, not a convenient excuse — the pixel evidence
supports it.

**`onePenDown` before/after is a different story and is dramatic and immediately visible**: before
shows bold, solid, filled triangular ribbon teeth; after shows a visibly and uniformly **much
thinner**, almost wireframe zigzag across the entire band. This matches the report's description
exactly ("bolder, more solid triangular teeth" → "visibly thinner, more line-like"). Given
`onePenDown` has zero guard failures and its RED-2 numbers improved substantially (39.04→21.27mm²),
I read this the same way the report does — the intended effect of even, screen-driven placement
(more, thinner rulings) rather than a defect — but it is a visually significant style change that
Jay should look at before calling this "closed," per stop condition 7 (no F1 screenshot has been
bench-confirmed by eye anywhere in the repo, and this unit correctly does not claim F1 CLOSED).

## The open item — this is why the unit is not a plain ACCEPT

**Plan §14, stop condition 3 is explicit:** *"`ringFillRate` < 0.995 on any of the five, or
`degenerate > 0`, or `wide` falls for any of the five"* is listed as a **stop-and-report** condition,
not a ship-with-disclosure one. Measured (by both the implementer and independently by me):
`interlockWeave` `ringFillRate` 0.99688 → **0.93632** (post) and `degenerate` 0 → **1** (post) — this
literally fires stop condition 3 as written. Set against that, `AGENT-PROTOCOL.md`'s general "Every
unit" section explicitly allows "stop-and-report beats a fudge… ship the measurement and say so," and
the implementer did exactly that: disclosed the numbers in full, named the two now-red guard files,
traced the mechanism to a pre-existing `insetMultiPolygon` robustness gap the plan's own §9 already
flagged as open, explicitly declined to fix it (outside allowed file scope), explicitly declined to
call the unit DONE, and asked the orchestrator to rule on one of three named options. **This is the
correct behavior under the general protocol, but it is a real, measured collision with this specific
plan's own stop condition, and the collision is not resolved — only escalated.** It should not block
the mechanism (which is correctly scoped, well-tested, matches Jay's ship-Prototype-B ruling, and
whose blast radius the implementer traced and bounded), but it **should** block calling this unit
fully closed until the orchestrator rules on: (a) grant scope to re-pin `f1b-streaks`/
`wall-coverage`'s `interlockWeave` bars to reflect the now-understood condition-2 trade-off, or (b)
rule the fallout acceptable as-is, or (c) something else. I concur with the implementer that MEASURED,
not DONE, is the honest status.

## Verdict

| condition | verdict |
|---|---|
| 1 — primary oracle | ACCEPT — independently reproduced, exact numbers |
| 2 — total-area bar restated | ACCEPT — disclosed, honestly non-separating, correctly subordinated to condition 1 |
| 3 — RED-1(b) restated | ACCEPT — corrected numbers verified, disclosure satisfies the ruling |
| 4 — byte-identity | ACCEPT — verified two independent ways (md5 + in-worktree unit harness) |
| 5 — regression finding | ACCEPT — exact numbers reproduced; predecessor's vacuous-proof claim confirmed wrong |
| 6 — same-event overlap | Plausible and well-supported by centroid math; not proven as literal polygon identity (matches the report's own hedge) |
| 7 — mutation checks | ACCEPT — real mutation kill confirmed; anti-vacuity guard is real but not maximal |
| 8 — guard spot-check | ACCEPT — 4/4 match once correctly pinned to `cd541f87` |
| 9 — pictures | Done — corroborates implementer's own honest "could not confirm by eye" on interlockWeave; onePenDown's thinning is real and should go in front of Jay |

**Overall: ACCEPT-WITH-FOLLOWUPS.** The mechanism is correct, correctly scoped (three independent
byte-identity/no-scope-leak proofs), and every claimed number in the implementer's report and
`report.json` reproduces exactly under independent re-derivation — this is unusually clean
verification work for a unit that started from a dead predecessor's unverified checkpoint. The one
substantive open item is real: shipping Prototype B trips this plan's own stop condition 3 on
`interlockWeave` (`ringFillRate` 0.93632 < 0.995, `degenerate` 1 > 0), and while the implementer's
disclosure is thorough and honest and matches the general protocol's "ship the measurement" escape
hatch, the orchestrator still needs to explicitly rule on the `f1b-streaks`/`wall-coverage` fallout
before this unit — or F1 as a whole — can be called closed. Follow-ups: (1) orchestrator ruling on
the guard fallout (options a/b/c as the implementer framed them); (2) F1-amp (condition 5's
serialized follow-up) is still required before F1 is closed; (3) Jay's own bench look at
`onePenDown`'s visibly-thinner ribbon style, not just `trochoidLoop`, before sign-off.
