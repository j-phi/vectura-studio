STATUS: ACCEPT

# T1b review — plot-safety guard against near-duplicate tick stubs, lane fill-audit-a2

Reviewed range **47a5a755..f828d828** (`0b7d8fda` orchestrator WIP checkpoint + `f828d828`
finishing commit) as a whole, entirely read-only in the worktree. Took `git archive` exports of
both pinned shas immediately (`/private/tmp/claude-501/scratch-T1b-{pre,post}`, `node_modules`
symlinked from the worktree) before the W-36 implementer began editing, and never read the
worktree's live files afterward. Both scratch dirs and all scratch artifacts (probe test files,
PNG crops, md5 dumps) were deleted at the end of this review.

## 1. RED — right reason, not a missing API

Copied the post-tree's test file onto the pre-tree (base `47a5a755`, unmodified `surface-fill.js`)
and ran `npx vitest run tests/unit/scene3d-mark-laws-draw.test.js`: **3 of 5 new T1b tests fail**,
exactly as claimed —
`torus/contour` and `torus/crosshatch` min-adjacent-spacing: `expected 0 to be greater than 20`
(field `SF.lastMarkStats.markMids` does not exist pre-fix); `pp.length` fine-pen bound:
`expected 469 to be less than or equal to 200`. Kink detector and perf ceiling pass at base
(guards, not RED proofs — correctly disclosed as such).

The min-adjacent-spacing RED is coupled to a new introspection field, so I independently verified
the *underlying* defect without touching that field: patched a **throwaway scratch-only** probe
into the pre-tree's `walkPoly` call site (recording every walked mark's own midpoint
unconditionally, no guard, no field) and measured raw min pairwise mark-midpoint spacing at base:
**torus/contour 0.0316 pens, torus/crosshatch 0.0319 pens** (n=514/1486 marks) — matching the
ruling's and T1-review's own 0.032/0.032 to 3 decimals. This proves the RED is for the real
geometric defect (near-duplicate stub midpoints genuinely violate the 0.5-pen floor at base), not
an artifact of the field's non-existence.

## 2. Mutation — disabling the guard re-fails

In the post-tree, disabled only the drop loop (`for (...) { if (false && ...` over the spacing
check, leaving `markMids` population and everything else intact) and re-ran the T1b tests:
**both min-adjacent-spacing tests re-fail**, with `minPens` measured at
**0.031626552585134... / 0.031856404694269...** — matching my independent base-tree probe numbers
to 8+ significant digits. This is strong, non-coincidental proof the guard (not some unrelated
factor) is what the tests actually gate, and that the tests measure the real underlying population.
Kink detector and `pp.length`/perf tests were unaffected by this mutation (as expected — disjoint
code paths) and continued to pass.

## 3. Oracle numbers — independently re-measured, exact matches

Re-ran the guard's own test file in the untouched post-tree: **23/23 pass**
(`npx vitest run tests/unit/scene3d-mark-laws-draw.test.js`). Instrumented a temporary console.log
on the assertion line (reverted after) to read the raw numbers:

| cell | minPens | marks attempted (n) | dupStub |
|---|---|---|---|
| torus/contour d=50 | **0.6998225...** | 502 | **4** |
| torus/crosshatch d=50 | **0.5001693...** | 1430 | **40** |

Both exactly match the impl report (0.6998/0.5002, 4/40 dropped — crosshatch right at the 0.5
floor by construction). Also independently re-measured raw `algo.generate()` output (not the
engine's full display-geometry pipeline, but directly comparable) at both trees:

| cell | pathCount before→after | inkMm before→after | maxPts (before/after) |
|---|---|---|---|
| torus/contour d=50 | 538 → 535 | 2738.8 → 2727.9 | 33 / 33 |
| torus/crosshatch d=50 | 1505 → 1467 | 6151.4 → 6038.7 | 21 / 21 |
| sphere/contour d=50 (control) | 696 → 694 | 3067.8 → 3062.2 | 19 / 19 |

These match the impl report's "real-app pipeline" numbers to the exact decimal on every cell —
tick length range (max points per mark) and every other statistic besides the dropped-mark ink is
confirmed unchanged, exactly as claimed. `MK_MAX_WALK_STEPS` genuinely does not bind at the shipped
0.3mm pen on any of the three named fixtures.

Perf: re-measured `torus d=220` mkTick/mkDashRamp standalone — **482ms / 267ms**, comfortably under
the 2500ms budget (report's own numbers: 496/279ms; both runs consistent given shared-machine
variance).

## 4. `## Bars changed` and probe cleanup

`git diff --numstat 47a5a755..f828d828 -- tests/unit/scene3d-mark-laws-draw.test.js` →
**115 insertions, 0 deletions** — pure addition, no existing assertion touched. Confirms
"Bars changed: none" is accurate. `tests/unit/zzz-t1b-perf.test.js` is **absent** from the
finishing-commit tree — folded into the real `T1b` describe block as claimed, not left as a
scratch probe.

## 5. Performance

Confirmed above: 482ms/267ms vs the 2500ms G6 budget, both laws, torus d=220, hatch mapper.

## 6. Byte-identity of every non-mkTick law

Wrote an independent md5 sweep (not the implementer's script) — `ladder`, `mkDashRamp`,
`mkDotScreen`, `mkScribble` × `{sphere, torus}` × `{hatch, contour}` × `{d=1, 50, 220}` = 48 cells,
plus 12 more with `mkLozenge` (falls back to `ladder`, harmless): **60/60 identical between the two
trees, 0 mismatches.** Notably this includes **`mkDashRamp`**, which is also `isWalkedShape`
(`shape:'morph'`) and therefore also runs through the new guard and the walk-step cap — it came out
byte-identical on every sampled cell, meaning the fix's practical effect (this fixture set) is
narrowly confined to `mkTick`, not merely "confined by allowed-files" — a stronger and better result
than the brief required.

## 7. Guards

Re-ran three of the claimed 14 files myself, foreground, in the untouched post-tree:
`scene3d-mark-laws-draw` 23/23, `scene3d-plot-safety` 5/5 (+1 skipped), `scene3d-curved-density-floor`
13/13 — all match the impl report's counts exactly.

## 8. Evidence images

Read `docs/3d-audit/fill-audit/after/T1b/report.json` and the committed PNGs (converted from webp).
`torus/contour/mkTick/med` at full frame shows pronounced light/dark banding (pre-existing,
out-of-scope `MK_ROW_COV` texture, not a T1b defect) but reads as one coherent weave; a native-res
crop at the region the report names (x460-560/y140-210) shows a clean wedge/limb boundary with no
visible overlapping-ink blot. The `torus/crosshatch/mkTick/med` crop near the inner-hole rim shows
a coherent woven texture of discrete, separated dash/tick marks — no visible hole or gap where
marks were dropped.

Comparing against the committed `after/T1/` capture (not the true baseline — the report itself
flags this, and I independently reproduced why: the T1 capture's inner-hole silhouette shape
visibly differs from T1b's for reasons unrelated to T1b, consistent with unrelated lanes W-26/
W-26b/W-27x changing geometry between the two captures) confirms the report's own caution not to
diff against `after/T1/` directly. I could not stand up a live dev-server capture myself under the
foreground-only constraint, so I did not reproduce a byte-exact pixel diff against a fresh
`47a5a755` render — but the underlying geometry numbers (§3 above) match the implementer's real-app
pipeline claims to the exact decimal, which is strong indirect evidence the images reflect the same
underlying data the report describes.

**On the orchestrator's observation** ("torus/contour/mkTick med before/after visually identical"):
confirmed as the expected outcome for this unit. Only 3-4 marks out of ~500-1500 are dropped per
cell (dupStub 4/40/2 measured) — under 1% of the drawn ink — so at full-frame 800px zoom the
before/after are expected to look identical to the eye; the effect is only visible in a
native-resolution crop of the specific silhouette-edge region, exactly as both the implementer's
report and the AGENT-PROTOCOL's own native-crop requirement anticipate. This is not a sign the fix
did nothing — the numeric before/after (0.032→0.6998/0.5002 pens, dupStub counts, ink deltas) prove
it did — it is a sign the fix is correctly narrow and tail-only, as the ruling scoped it to be.

## 9. Merge note — `1193cbe1`

`1193cbe1` ("round byte-identity/golden comparisons to fix arm64 vs x86_64 CI drift") touches
exactly four files: `scene3d-charts-parity.test.js`, `scene3d-curved-density-sparse-end.test.js`,
`scene3d-hlr-spatial-index-identity.test.js`, `scene3d-mesh-invariants.test.js`. It does **not**
touch `scene3d-mark-laws-draw.test.js` or `scene3d-plot-safety.test.js` — confirming
`STILL-OPEN.md`'s own claim for the mark-laws-draw file. `1193cbe1` sits on `main` after this
worktree's base `47a5a755` (`git merge-base --is-ancestor` confirms it is NOT an ancestor of
`47a5a755`), so it has not yet reached this branch. One thing worth flagging for whoever rebases
this branch: `1193cbe1` **does** touch `scene3d-hlr-spatial-index-identity.test.js`, one of the 14
guard files T1b (and T1 before it) re-ran green — that golden hash was regenerated by `1193cbe1`
for CI-precision reasons unrelated to T1b, so per `STILL-OPEN.md`'s own standing warning, that
guard's pass count should be re-verified after this branch is rebased onto a main that includes
`1193cbe1`, not carried over from this report. Not a T1b defect — a pre-existing rebase note that
applies to every round-2 lane.

## Verdict

**ACCEPT.**

Diff is exactly the two allowed files (216/+115 insertions, 2 deletions, both inside
`surface-fill.js`'s `emitMarks`/`place`/MK-constants region), matching the brief's allowed-files
list precisely. RGR proof is real and independently reproduced, including an out-of-band
verification (a scratch-only, non-worktree probe) that the RED is driven by the actual geometric
defect and not merely a missing field. Mutation testing confirms the guard — not some coincidental
factor — is what the tests gate, with numbers matching my independent base-tree measurement to 8+
significant digits. Every numeric claim in the impl report (spacing bars met, dupStub counts, real
pipeline path/ink deltas, max-points-per-mark, perf) was independently reproduced to the exact
decimal. Byte-identity holds not just for the allowed-files scope but empirically for every other
law sampled, including the other `isWalkedShape` law (`mkDashRamp`) that could in principle have
been touched. `## Bars changed: none` is accurate (0 deletions in the test diff) and the scratch
perf probe was genuinely folded in and deleted, not just claimed. `1193cbe1` does not touch this
unit's files directly; the one indirect note (guard `scene3d-hlr-spatial-index-identity` will need
re-verification after a future rebase) is a pre-existing cross-lane rebase concern, not a defect
introduced here.

No follow-ups needed beyond what the ruling already scoped out (T3/U3 bulk banding, W-31/W-36
ordering) — those are correctly disclosed as out of scope, not gaps in this unit.

REPORT docs/3d-audit/lane-reports/T1b-review.md — ACCEPT — RGR+mutation+numbers all independently reproduced exactly; no defects found.
