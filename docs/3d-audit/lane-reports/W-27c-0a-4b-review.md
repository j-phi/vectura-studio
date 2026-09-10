STATUS: ACCEPT

# W-27c-0a-4b — adversarial review

Reviewer: read-only. Lane `fill-audit-d2`, pinned range `c6dd6130..be5cfcf8`, single commit
`be5cfcf8` (`tests/unit/scene3d-contour-slice.test.js` +437/-0 — confirmed via
`git -C .claude/worktrees/fill-audit-d2 diff --stat c6dd6130..be5cfcf8`, no other file touched).
Worktree was NOT read after the initial `git archive` exports (the W-34 implementer was editing it
concurrently); all measurement below is in from-scratch scratch exports at
`/private/tmp/claude-501/scratch-W27c4b-review-{pre,post,truepre}` (pre=c6dd6130, post=be5cfcf8 —
identical `src/` to pre since this unit only adds tests, truepre=47a5a755 = iteration 3, the real
pre-fix codebase), symlinked to the worktree's `node_modules`. All three scratch dirs and a
throwaway `zz-review-md5-probe.test.js` were removed at the end; nothing was ever edited in the
worktree.

## 1. Six new guards — pinned values reproduced myself at be5cfcf8

Ran the full file at `be5cfcf8` (`--pool=forks --poolOptions.forks.singleFork=true`, foreground):
**57/57** (51 pre-existing + 6 new). Every printed number matches the impl report and
`report.json` bit-for-bit:

| test | metric | value | floor/envelope | fingerprint band |
|---|---|---|---|---|
| cone ink-survival | pathCount | 22 | >=16 | [20, 25] (±10% of 22) |
| | totalInk | 787.1837864801333mm | >0.85×inert | [708.46, 865.90]mm (±10% of 787.18) |
| | waist | 0.037187845102731314mm | (pct1<25 envelope) | >=0.03348mm (0.0372×0.90, floor only) |
| cylinder ink-survival | pathCount | 26 | >=20 | [23, 29] (±10% of 26) |
| | totalInk | 1075.0079194083032mm | >0.85×inert | [967.51, 1182.51]mm (±10% of 1075.01) |
| cone base-band ring count | bottom=10 (inert=10) | >=round(10×0.7)=7 | >=floor(10×0.90)=9 |
| cylinder wall-band ring count | mid=26 (inert=26) | >=round(26×0.7)=18 | >=floor(26×0.95)=24 |
| cone engine blobCount/largestW | 44 / 31.3mm | <60 / <40mm | <=ceil(44×1.10)=49 / <34.43mm |
| cylinder engine blobCount/largestW | 2 / 41.7mm | <10 / <50mm | <=ceil(2×1.10)=3 / <45.87mm |

Shape confirmed: each test is a real, generous-margin envelope PLUS a separate tight ±10%
(±5% for the two ring-band fingerprints) band pinned to the exact `be5cfcf8`-measured value, as
claimed (W-26b-3 shape, minus the drift-envelope half — same simplification review-4 accepted for
the original four bars, and this rig is deterministic seed=1 with no camera/light randomization, so
there is nothing for a drift envelope to guard against).

## 2. Non-vacuity — independently mutation-tested, two separate mutations

Applied directly to the **post** (`be5cfcf8`/`c6dd6130`, identical `src/`) export's
`src/core/algorithms/scene3d.js`, never the worktree:

**Mutation A: `CROWD_MIN_DISTINCT_LEVELS` 2 → 1.** Reran `-t "W-27c-0a-4b"`: **exactly 4 of 6 trip**,
with numbers that reproduce the true iteration-3 (`47a5a755`) values to full precision:
- cone ink-survival: `626.6701491719745` fails `>669.1062185081133` (0.85×inert)
- cylinder ink-survival: `950.9684934645634` fails `>=967.509`
- cone base-band: `8` fails `>=9`
- cylinder wall-band: `23` fails `>=24`
- cone/cylinder engine-pipeline blobCount/largestW: **do not trip** (values move to 25/26.3 and
  3/40.9 respectively — both still comfortably inside their ceiling bands).

**Mutation B: `CROWD_CULL_K` 0.8 → 3.0` (much wider crowding radius, LEVELS restored to 2).**
Same 4 trip again (cone totalInk 561.02, cylinder totalInk 909.62, cone base-band 6/10→7/10 across
bands, cylinder wall-band 22/26); the 2 engine-pipeline tests again pass (blobCount/largestW drop
further, to 1/0.95mm and 0/0mm — moving further inside the ceiling, not toward it).

**Cross-check**: I also copied the test file onto the true `47a5a755` export (no mutation, the real
pre-fix commit) and reran — **the same 4 of 6 fail**, with numbers matching Mutation A's to full
precision (`626.6701491719745`, `950.9684934645634`, `8`, `23`), and `md5` of the two exports'
`scene3d.js` differ (`4da80904…` vs `d9d0bcb9…`, matching the impl report's stated prefixes). This
independently confirms the RGR proof, not just the report's own claim of it.

**Verdict on non-vacuity**: 4 of 6 guards demonstrably trip under two independent, unrelated
mechanism mutations — not vacuous. The 2 that never trip (engine-pipeline blobCount/largestW
ceilings) are structurally incapable of tripping from ANY tuning of this mechanism in either
direction — once a primitive is already at its cull-inert ceiling (100% retained, confirmed §3),
"more aggressive" can only shrink the ceiling metrics further and "less aggressive" is already a
no-op — exactly the class of limitation §4 discloses, and the disclosure is honest about it (it
doesn't claim these two are live mechanism guards). This mirrors review-4 §4's own finding for the
original four floor+10% bars (also confirmed there as "not blocking" for the identical reason).

## 3. "Cull is inert on cone/cylinder" — reproduced with an independent md5, not just decimal equality

Wrote a standalone public-API-only probe (`zz-review-md5-probe.test.js`, since deleted) computing
md5 of the full front-fill point-set (6-decimal-rounded) for `active` (real BOUNDS, penWidth 0.3) vs
`inert` (penWidth 1e-6) at `be5cfcf8`:

- cone: `activeMd5 = inertMd5 = 2817c4437183d1c89488de945f95f3c0` (22 paths both)
- cylinder: `activeMd5 = inertMd5 = ff998e79febcfba6b1fa70824665f5b1` (26 paths both)

Byte-identical, confirmed independently — the crowding cull is a genuine no-op on both primitives
at this configuration.

## 4. Floor-limitation disclosure — present and accurate

The comment block above the new `describe` (test file lines ~2187-2209) restates review-4 §4's
finding — waist can only stay same/increase and largestW same/shrink under this mechanism's
subtractive-only tuning, so the four existing torus/sphere floor+10% bars cannot fail from
retuning `CROWD_CULL_K`/`CROWD_MIN_ARC_MULT`/`CROWD_MIN_DISTINCT_LEVELS` — and extends the same
argument to the new cone/cylinder guards, on the grounds that both primitives are already
byte-identical to their own cull-inert ceiling. My own mutation testing (§2) directly confirms this
extension is accurate: neither mutation could move the cone/cylinder engine-pipeline ceiling tests
at all. The disclosure is honest, not self-serving — it does not claim these two tests are live
regression catchers.

## 5. Scope — no `src/` change; nothing pre-existing moved

`git diff --stat c6dd6130..be5cfcf8`: exactly one file, `tests/unit/scene3d-contour-slice.test.js`,
`+437/-0`. Zero deletions means, trivially, no pre-existing line (assertion, threshold, or
fingerprint) was altered — the "Bars changed" table's own claim ("no existing bar was touched") is
correct by construction, not just by the report's say-so. The one entry the report itself discloses
under "Bars changed" (its own `*0.90`→`*0.95` self-correction on a brand-new bar, caught before
finalizing) is not a hidden-regression case — there is no prior value it moved away from.

## 6. Full-file pass count and evidence cells actually inspected

**57/57 at `be5cfcf8`** (§1), confirmed in the foreground, not backgrounded.

Verified `docs/3d-audit/fill-audit/after/W-27c-0a-4b/` on disk: `shots/A/` holds the 4 named "after"
cells (`{cone,cylinder}__contourSlice__ladder__{med,max}__a.webp`, med/max byte-identical file sizes
confirmed, matching the report's med==max claim) and `before-47a5a755/shots/A/` holds the true
apples-to-apples "before" (not the stale faceted-ring gallery baseline — correctly avoided, as the
report flags). Converted all 4 to PNG (`sips`) and looked at them myself, including native-resolution
crops:

- **Cone base band** (rows 350-738, full width): visual full-image comparison looked
  near-identical at a glance, so I went quantitative — horizontal-scanline bright-pixel crossing
  counts at y=400..700 are consistently HIGHER in `after` than `before` at every sampled row (e.g.
  y=600: 20 vs 19; y=500: 18 vs 16; y=450: 15 vs 13), confirming more ink/rings survive in `after`,
  matching the measured 8/10→10/10 base-band restoration in direction and rough magnitude. The extra
  ring sits among the outer/silhouette-adjacent arcs, not the innermost ones, which is why a coarse
  crop of just the bottom 260 rows looked deceptively identical — I re-cropped wider (350-738) and
  measured rather than trusting the first eyeball pass.
- **Cone apex** (top 120 rows): bright-pixel coverage 2.822% (`after`) vs 2.833% (`before`) —
  effectively identical, no fused tip, consistent with waist byte-identical to RED.
- **Cylinder right-edge** (x=380-end, y=300-500, 3x zoom): visually `after` shows one
  region of adjacent thin lines merged into a solid wider white band not present in `before`;
  confirmed quantitatively — bright-pixel coverage in that exact region is 44.6% (`after`) vs 42.3%
  (`before`), consistent with the claimed restored ring(s) on the wall.
- **Cylinder cap rims** (top/bottom 110 rows each): coverage 4.56%/16.06% (`after`) vs
  4.55%/15.85% (`before`) — no meaningful difference, consistent with the claim that all restored
  rings are mid-wall, not at either cap.

All four visual/quantitative checks agree with the report's own descriptions in both direction and
approximate magnitude. Harness-clean is confirmed app-clean here, independently.

## Verdict: ACCEPT

All three of review-4's blocking items are met: (2) cone/cylinder contourSlice is now measured,
disclosed, and guarded; (3) the floor-limitation disclosure is in the test file itself, accurately
scoped (independently confirmed via mutation testing, not just trusted). Scope stayed inside this
unit's own brief (tests-only, zero `src/` change, zero pre-existing assertions touched). The one
soft spot — 2 of the 6 new guards (engine-pipeline blobCount/largestW ceilings) cannot be tripped by
any tuning of this mechanism, only by an unrelated future change elsewhere — is explicitly and
accurately disclosed in the test file's own comment, not hidden, and is the same class of narrow-but-
real guard review-4 already accepted for the four pre-existing torus/sphere bars. No follow-up
required.

REPORT docs/3d-audit/lane-reports/W-27c-0a-4b-review.md
