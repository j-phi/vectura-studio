STATUS: DONE

# W-15c implementation (iteration 2) — fill-audit lane

**Lane:** fill-audit · **Worktree:** `.claude/worktrees/fill-audit` (branch `3d-scene/fill-audit`, port 8476)
**Base:** `6d6b1b78` (revert of the failed design C) → **New HEAD:** `8bd1581b`
**Files touched:** `src/core/algorithms/scene3d.js`, `tests/unit/scene3d-faceted-density-calibration.test.js`,
`tests/unit/scene3d-box-density-bearing.test.js`, `tests/unit/scene3d-hlr-spatial-index-identity.test.js`,
`tests/baselines/scene3d/tone/shadow-additive-default.json`, `tests/baselines/scene3d/tone/shadow-inverse.json`.
`context-bar.js` was not touched (not needed, as the plan predicted). No forbidden files
(`surface-fill.js`, `surface-fill-mono.js`, `mappers.js`, `hlr.js`, `regions.js`) were touched.

## Brief and plan

Implemented `docs/3d-audit/lane-reports/W-15c-plan.md` exactly as written (§3.2's three edits), with one
directive from the orchestrator received mid-unit: ship the plan's recommended **N = 9** (face-plane
reading), not the alternative N = 3 (paper reading) the plan flagged as an owner decision. Rationale, as
relayed: the user experiences Density as the same control on every primitive, and the curved path already
delivers ~9 rulings at d=50 on a comparable extent — faceted faces must match that semantics, so F-14 stands
as a real defect rather than a self-consistent non-issue. This matches the plan's own recommendation (§4),
so no deviation from the plan was needed.

## The fix (3 edits, all in the faceted path of `scene3d.js`)

1. **New predicate `isSoloOrientation(record)`** (after `recordBands`, ~line 874): memoised per record,
   returns true iff every front face of the record shares one `normalWorld` (`dot >= 0.999`).
2. **`soloOrient` computed** immediately before `const plan = asks.map(...)` (~line 1544):
   `soloOrient = toneOn && zone && isSoloOrientation(record)`. The `zone &&` term is load-bearing (see below).
3. **`want` replaced** (was `Math.min(Math.floor(zoneCeil / f.covOne), FACET_MIN_RULINGS)`, now ~line 1604):
   ```js
   const ceilCount = Math.floor(zoneCeil / f.covOne);
   const soloDens = soloOrient
     ? Math.round((f.ext / Math.max(1e-6, hatchSpacing(styleParams.fillDensity))) - 0.5) : 0;
   const want = Math.min(ceilCount, Math.max(FACET_MIN_RULINGS, soloDens));
   ```

Every object with >= 2 visible orientations takes the byte-identical old grant (`soloDens` is always 0 there),
so every cross-facet ordering invariant the prior three designs broke is unchanged **by construction**.

## RGR proof

`tests/unit/scene3d-faceted-density-calibration.test.js`, test `RGR: the plane carrier tracks Density
instead of plateauing (F-14)`:

- **RED at base `6d6b1b78`**: `[1,10,25,50].map(fillLineCount)` on the app-default plane = `[3, 3, 3, 3]`,
  `expect(counts).toEqual([6, 6, 7, 9])` fails; the companion `counts[3] > counts[0]` assertion is also false
  (3 > 3). Confirmed by actually running the test against the pre-fix tree before writing the source change.
- **GREEN after the fix**: `[6, 6, 7, 9]` exact match. Companion test `the granted plane pitch stays inside
  the light zone ceiling` (`0.2992 / 3.149 <= Regions.formCeiling('L')`) also passes. File: 7/7.

Rendered plane rulings before → after: `3,3,3,3,19,65` → `6,6,7,9,19,65` across Density 1/10/25/50/100/220.
On-paper gap at d=50: 8.549mm → 3.149mm, coverage 0.0950 ≤ `formCeiling('L')` = 0.0987 — ceiling-bound and
plot-safe by construction, matching the plan's measurement exactly.

## Guard tests — run one file at a time (shared machine), all green

| file | result |
|---|---|
| `scene3d-facet-tone.test.js` | 15/15 |
| `scene3d-projected-pitch.test.js` | 17/17 |
| `scene3d-faceted-highlight-dispatch.test.js` | 12/12 |
| `scene3d-box-density-bearing.test.js` | 4/4 (1 re-pin, see below) |
| `scene3d-hatch-density-500.test.js` | 14/14, box series `[178,181,185,190]` unchanged |
| `scene3d-subwindow-density.test.js` | 3/3 (2 skipped, unrelated) |
| `scene3d-appdefault-facet-fill.test.js` | 7/7 |
| `scene3d-faceted-tone-law.test.js` | 19/19 — the 3 "toneLaw 'none' is Stage 0" tests (box/plane/solid) independently re-confirmed 3/3 with a `-t "Stage 0"` filter |
| `scene3d-fixture-single-source.test.js` | 19/19 |
| `scene3d-hlr-spatial-index-identity.test.js` | 6/6 (3 re-pins, see below) |

Full targeted sweep `tests/unit/scene3d` (115 files): **114 passed | 1 skipped, 1356 passed | 43 skipped,
0 failed.** Two unattributed `[vitest-worker]: Timeout calling "onTaskUpdate"` warnings under shared-machine
load (another lane, fill-audit-c, was running `scene3d-origin-spiral-tonal-range.test.js` concurrently) — the
protocol's known non-regression, not attributed to any failing test. Also present: pre-existing
`[FillBoolean] polygon union failed on degenerate geometry` console warnings from an unrelated torus
self-crossing fixture (documented in `STILL-OPEN.md`'s A3 notes) — not attributed to any failing test either.

**Full `tests/integration` (234 files), run once alone, as instructed**: **1929/1929 passed, 0 failed.**
Matches the plan's own claim exactly. One unattributed `onTaskUpdate` timeout, same non-regression pattern.

**`tests/visual` (6 files)**: 99 passed | 13 skipped (112) — up from the pre-fix 97, because the two
`scene3d-tone-baseline.test.js` goldens re-pinned below (previously failing) now pass.

## Re-pins (6 numbers — nothing else moves)

All six are a **direct, predicted consequence of the same mechanism**: a ground plane is itself a
single-orientation faceted object, so the solo-orientation gate opens on any scene whose ground carries
`mapper: 'hatch'` with no ground override.

1. `scene3d-box-density-bearing.test.js` — `fingerprint(50,'plane')`: `44270f5b:3738` → `10a710a6:3909`.
2. `scene3d-hlr-spatial-index-identity.test.js` — `facetedOverlap-orthographic-hatch|settled`: 129/258 →
   208/416 paths/points, hash → `0517b318738d3fd4dc7d31be0698487d85f4e96e31d6e9e8d300b9d2fa2e6875`.
3. Same file — `curvedOverlap-perspective-mixed-xray|settled`: 341/1099 → 404/1225, hash →
   `ecbcb9d941a2e397a7856f3de00e2618bd762ba5dddd809d2bbbcc76f87598c7`.
4. Same file — `denseMixed-8obj-shadows|settled`: 560/2303 → 651/2485, hash →
   `18588b303aa3f605bae7247b2979b1c13c63fb842376085dd0930dfc3d46c875`.
5. `scene3d-tone-baseline.test.js` golden `shadow-additive-default` (baseline JSON `totals.paths`): 219 → 284
   (regenerated via `VECTURA_UPDATE_BASELINES=1`, filtered to just this test with `-t`).
6. Same file, golden `shadow-inverse`: 58 → 126.

For 2–4, only the **SETTLED** row moves in all three scenarios — the **DRAFT** (`bounds.fastPreview`) row is
byte-identical to the pre-fix baseline in every case (measured directly, not assumed). This is consistent:
`draft` mode likely omits or simplifies ground fill entirely, so the mechanism this fix touches never engages
there. No fingerprint outside these six moved — verified by grepping the old hash/count values across
`tests/` after the fix and finding no remaining references.

No tolerance was widened and no ordering assertion was touched anywhere in this diff.

## Evidence (`docs/3d-audit/fill-audit/after/W-15c/`, in MAIN, not this worktree)

Captured via `node scripts/audit/scene3d-capture.js --tier A --root .claude/worktrees/fill-audit --port 8476
--only '<regex>' --out docs/3d-audit/fill-audit/after/W-15c` from main, per protocol. Per the coordinator's
mid-unit note about a concurrent gallery-integrity agent, I wrote **only** under `after/W-15c/` and did **not**
run any assemble/before-after/index-rebuild script — the orchestrator owns that rebuild. `report.json` is
written with `commit: "8bd1581b"`.

| cell | before md5 | after md5 | result |
|---|---|---|---|
| `plane__hatch__ladder__low__a` | `82a4c7dd...` | `d4a08b80...` | **changed** |
| `plane__hatch__ladder__med__a` | `ebbedc51...` | `64d8eb8c...` | **changed** |
| `plane__hatch__ladder__max__a` | `5bf75271...` | `5bf75271...` | byte-identical (expected — d=220 is past the plateau boundary d<65.3 on both sides, 65==65 rulings) |
| `plane__contour__ladder__{low,med,max}__a` | — | — | byte-identical ×3 (expected — contour never calls the carrier-grant block) |
| `box__hatch__ladder__med__a` | — | — | byte-identical (expected — box has 3 visible orientations, gate closed) |
| `solid__hatch__ladder__med__a` | — | — | byte-identical (expected — buckyball has 12 visible orientations, gate closed) |

The plan's `plane__hatch__none__*` and `plane__contour__none__*` cells (Stage 0 comparison) could **not** be
captured with `scene3d-capture.js` — Tier A's own printed manifest ("Tier A total shots: ... x 1 style x ...")
confirms it shoots only the default `ladder` toneLaw; there is no `none`-toneLaw cell in the Tier A roster to
shoot a before/after pair from, matching the plan's own caveat ("these cells are not in shots/A today"). In
place of images, I numerically re-verified Stage 0 directly against the running engine (scratch test file,
not committed): `toneLaw:'none'` plane counts at d=1/25/50/100 = `[3, 3, 3, 29]`, exactly unchanged, matching
the plan's §5.1 table to the digit.

**I looked at every PNG/webp pair by hand (Read tool):**

- `plane__hatch__ladder__med__a`: **before** shows three long, widely-spaced straight rulings crossing an
  otherwise empty diamond outline — the interior reads as bare paper with a stray mark on it, not a filled
  plane, exactly matching the plan's described defect. **After** shows a dense, evenly-spaced hatched
  surface with ~9 parallel rulings spanning the full diamond — it now reads as a genuinely filled plane.
- `plane__hatch__ladder__low__a`: **before** is 3 sparse rulings, visually near-identical to the pre-fix med
  image (the plateau's visual signature). **After** is 6 rulings — visibly denser than before, and still
  distinctly sparser than the after-med image (9 rulings), so low/med now carry a genuine visual
  distinction that did not exist pre-fix.
- `plane__hatch__ladder__max__a`: not re-viewed pixel-by-pixel (md5 already confirms byte-identical); both
  before and after already show a dense ~65-ruling hatched plane at d=220.
- The three `plane__contour__ladder__*` and the `box`/`solid` cells were confirmed byte-identical by md5 and
  not separately re-viewed (no rendering can differ if the bytes are identical).

## Off-guard-list spot-check (plan §10 item 3 — crosshatch/spiral mappers)

Not committed (scratch test files, deleted after use). Confirmed the plan's caveat that the grant is
carrier-only:

- Plane, `mapper:'crosshatch'`, d=1/10/25/50 → total ruling counts `[9, 9, 11, 14]`, with **two distinct
  ruling angles present at d=50** (174.8° carrier, 51.9° cross family B). Subtracting the carrier's own
  counts (`[6,6,7,9]`, identical to hatch mode) leaves family B contributing `[3,3,4,5]` — its own count
  grows independently of the fix, confirming family B is not frozen by this change, as the plan predicted.
- Plane, `mapper:'spiral'`, d=50 → 7 fill paths (mapper engages; not swept across densities — outside this
  plan's named cells, left as an open item).

## Open follow-ups (not in scope for this unit, per the plan's §10)

1. The graded (multi-orientation) case remains Density-blind on its lit facets over most of its range —
   `scene3d-box-density-bearing.test.js`'s `[86,86,86]` pin stands untouched. The plan's §2.4 proves no
   per-facet formula can close this without per-object ladder normalisation (a separate, larger unit).
2. `toneOn`-gated foreshortening compensation still means Density is face-plane mm untoned vs paper mm
   toned; this unit brings the toned SOLO facet into agreement with the untoned path, but the graded case
   stays divergent.
3. Spiral mapper on the plane spot-checked but not density-swept.

## Notes on process

- No O20/O9/O21 fixture inverted at any point — the guard suites (`scene3d-facet-tone`,
  `scene3d-projected-pitch`, `scene3d-faceted-highlight-dispatch`) all passed on the first run after the
  fix, with no re-pinning needed there (unlike designs A/B/C).
- A stray `node scripts/audit/scene3d-capture.js --help` (unrecognized flag, ran the default capture instead)
  was executed once by mistake before the real capture command; it hit "skip (exists)" on every shot because
  no `--out` override was given, so it wrote nothing new (confirmed via `git status`/`git diff --stat` on
  `manifest.A.1-1.jsonl` and `shots/` showing no changes). No harm done, noted here for transparency.
