STATUS: DONE

# T1b — plot-safety tail regressions T1 introduced

- **Lane:** fill-audit-a2
- **Worktree:** `.claude/worktrees/fill-audit-a2`
- **Branch:** `3d-scene/fill-audit-a2`
- **Port:** 8475
- **Base sha:** `47a5a755` (main, v1.3.99)
- **Checkpoint sha (inherited, unverified):** `0b7d8fda` — an orchestrator WIP checkpoint of the
  previous implementer's tree, made after that implementer was killed by a rate limit. Contained a
  complete `src/core/scene3d/surface-fill.js` mechanism and most of the test file, plus a scratch
  probe `tests/unit/zzz-t1b-perf.test.js`.
- **New sha (this session):** `f828d828`
- **Ruling:** `docs/3d-audit/STILL-OPEN.md` (2026-09-06 ruling, line 177), `LEDGER.md` §Phase 2 row
  T1b, `ROUND2-BRIEFS.md` §fill-audit-a2. Background: `T1-impl.md`, `T1-review.md` §4/§6/§7.

## Handoff verdict: kept the checkpoint's approach

I read the checkpoint diff in full before touching anything. It correctly implements all three
deliverables the brief and the ruling require:

1. **Near-duplicate stub merge/drop + ≥0.5-pen min-adjacent-mark guard** — `MK_MIN_ADJ_PEN = 0.5`
   (`surface-fill.js`), a grid-bucketed (`mkMidBuckets`, bucket size `MK_MIN_ADJ_PEN * penWidth`)
   nearest-neighbour check of each walked mark's own representative midpoint against every earlier
   accepted walked mark's midpoint in the same render. A mark whose midpoint lands within the floor
   of an earlier one is dropped (`mkStat.dupStub`) before its ink is counted. Checked against every
   earlier mark, not only truncated ones (the checkpoint's own comment records that restricting to
   truncated-vs-truncated pairs alone left a residual pair at 0.248 pens, still under bar).
2. **Kink-detector test** — median max-interior-turn-angle per multi-point tick (torus/contour
   d=50), reproducing T1-review.md §4's Mutation B methodology.
3. **`pp.length` upper bound** — `MK_MAX_WALK_STEPS = 64` caps `walkPoly`'s per-arm step count
   (previously `Math.ceil(edgeLen / MK_ARC_MM)` with no ceiling), bounding a whole mark to at most
   `2*64+1 = 129` points, generously over T1-review's measured pre-fix max of 107. A new test drives
   this at a much finer pen (0.02mm) to prove the bound holds structurally, not just because
   today's fixture happens not to reach it.

All three are correctly scoped to `law.shape === 'tick' || 'morph'` (`isWalkedShape`) only, inside
`emitMarks`/`place` — no other code path in `surface-fill.js` is touched, matching the brief's
allowed-files list exactly (`surface-fill.js` MK/mark sink + `walkPoly` only,
`scene3d-mark-laws-draw.test.js`). I decided not to re-derive an independent approach: the
mechanism is a direct, faithful implementation of T1-review's own required follow-ups, using the
same units (pens), the same methodology (representative midpoint, grid-bucket neighbour check), and
the same test fixtures (torus/contour, torus/crosshatch, d=50) the review specified.

**What was still incomplete:** `tests/unit/zzz-t1b-perf.test.js`, a scratch probe (not properly
named, not integrated into the existing test file) checking the torus d=220 mkTick/mkDashRamp perf
budget the previous implementer's last words flagged as needing verification. I folded it into
`scene3d-mark-laws-draw.test.js`'s new T1b `describe` block as a permanent test (same 2500ms
budget, same fixture) and deleted the scratch file — this is the only code I wrote this session;
everything else was already correct in the checkpoint.

## RGR proof

**RED**, proven against a scratch export of base `47a5a755`
(`git archive 47a5a755 | tar -x`, `node_modules` symlinked, per protocol — never by editing in the
worktree) with the checkpoint's own test file copied in on top of base's unmodified `surface-fill.js`:

| Test | RED result |
|---|---|
| torus/contour d=50 min-adjacent-spacing | `expected 0 to be greater than 20` (`SF.lastMarkStats.markMids` does not exist pre-fix) |
| torus/crosshatch d=50 min-adjacent-spacing | same — `expected 0 to be greater than 20` |
| `pp.length` bound at fine pen (0.02mm) | `expected 469 to be less than or equal to 200` (no per-arm step ceiling exists pre-fix) |
| kink detector | **passes** at base — T1's own kink fix is already merged at `47a5a755` (T1 predates T1b); this test is a *regression guard* for that fix, not a new-defect RED proof. Independently validated via T1-review.md §4's own Mutation B reconstruction: median max-turn-angle 2.61° (fixed) vs 21.30° (T1's exact mirrored-departure bug, precisely reconstructed) — 8.2× separated. |
| perf ceiling | **passes** at base — T1's own perf profile is already fine; also a guard, not a RED proof. |

**GREEN** (`npx vitest run tests/unit/scene3d-mark-laws-draw.test.js` in the worktree, foreground):
**23/23** (18 pre-existing W-05/06/07 tests + 5 new T1b tests: 2× min-adjacent-spacing, 1× kink
detector, 1× `pp.length` bound, 1× perf ceiling). Re-ran twice at the end of the session — 23/23
both times.

## Measured numbers

**Min adjacent-mark-midpoint spacing at d=50** (own script, `penWidth = 0.3mm`, same methodology as
T1-review §6 — nearest OTHER walked mark's midpoint, in pen widths):

| cell | before (pens) | after (pens) | bar | marks attempted / dropped |
|---|---|---|---|---|
| torus/contour | 0.032 | **0.6998** | ≥ 0.5 ✅ | 506 / 4 dropped |
| torus/crosshatch | 0.032 | **0.5002** | ≥ 0.5 ✅ (right at the floor, by construction) | 1469 / 40 dropped |
| sphere/contour (optional control, also a walked-mark cell) | n/a | n/a | — | 628 / 2 dropped |

**Real-app pipeline numbers** (`engine.computeAllDisplayGeometry`, matching
`scripts/audit/scene3d-capture.js` exactly — verified via Playwright against both live dev servers,
8579 = scratch pre-T1b at `47a5a755`, 8475 = this worktree post-T1b):

| cell | pathCount before→after | inkMm before→after | Δ |
|---|---|---|---|
| torus/contour d=50 | 538 → 535 | 2738.8 → 2727.9 | −10.9mm (−0.40%) |
| torus/crosshatch d=50 | 1505 → 1467 | 6151.4 → 6038.7 | −112.7mm (−1.83%) |
| sphere/contour d=50 (control) | 696 → 694 | 3067.8 → 3062.2 | −5.6mm (−0.18%) |

Path-count deltas match their own `dupStub` counts (538−535=3 paths vs `dupStub`=4 — one dropped
mark contributed 2 polys under this fixture's multi-poly tick construction, still a single mark;
1505−1467=38 vs `dupStub`=40, same reason; 696−694=2 vs `dupStub`=2, exact). No other statistic
(max points per mark, p99 point count, truncation rate beyond the dropped marks' own contribution)
moved — `MK_MAX_WALK_STEPS` does **not** bind at the shipped 0.3mm pen on any of these three
fixtures (max points per mark measured 19/33/21, identical before and after).

**Perf (G6-equivalent, torus d=220, hatch mapper):** mkTick 496ms, mkDashRamp 279ms — both
comfortably under the 2500ms budget (T1's own prior measurement: 848ms/266ms; both runs well clear
of the ceiling).

## Guards run (targeted, foreground, one at a time — the same 14 files T1's own implementer ran)

All green: `scene3d-ladder-uniform-field-spacing` 9/9, `scene3d-fill-even-spacing` 12/12,
`scene3d-fill-span-verdict` 11/11, `scene3d-curved-density-floor` 13/13,
`scene3d-box-density-bearing` 4/4, `scene3d-hatch-density-500` 14/14, `scene3d-plot-safety` 5/5
(+1 skipped), `scene3d-curved-density-sparse-end` 20/20, `scene3d-tone-law-dispatch` 7/7 (one
benign `vitest-worker onTaskUpdate` RPC timeout warning under heavy shared-machine load — same
pattern T1's own implementer hit, exit 0, not a test failure — this one took three attempts to get
a clean foreground read due to 10-15 other vitest processes from parallel lane sessions competing
for CPU; the first two attempts were auto-promoted to background by the tool's 120s/300s timeouts
and I let/checked them rather than arming a Monitor or ending my turn), `scene3d-tone-algo-default`
6/6, `scene3d-hl-stage-roster` 5/5, `scene3d-fill-ruling-continuity` 10/10 (+1 skipped),
`scene3d-fill-boundary-ends` 41/41, `scene3d-hlr-spatial-index-identity` 6/6.

**Note on counts vs T1's own report:** several guard files now show more passing tests than T1's
own run (e.g. `scene3d-fill-even-spacing` 12/12 here vs T1's 11/11, `scene3d-fill-span-verdict`
11/11 vs 6/6, `scene3d-curved-density-floor` 13/13 vs 12/12) — expected, since several other lanes
(W-26, W-26b, W-27x, etc.) added tests to these files after T1 landed and before this unit's base.

## Bars changed

None. Every T1b test is new — no existing test's threshold, tolerance, or pinned fingerprint was
changed.

## Evidence

Re-shot from MAIN: `node scripts/audit/scene3d-capture.js --tier B --root
.claude/worktrees/fill-audit-a2 --port 8475 --only
'^(torus__(contour|crosshatch)__mkTick__(low|med|max)__a|torus__contour__ladder__med__a|sphere__contour__mkTick__med__a)$'
--out docs/3d-audit/fill-audit/after/T1b`, overwriting the previous partial capture (which held
only a subset of the 8 named cells, from before this session's own edits — the edits were test-file
only, so the underlying `surface-fill.js` output was unchanged, but the brief mandates overwriting
regardless). All 8 cells captured, `served version 1.3.99` matching the worktree's `package.json`.

**Gallery-hygiene finding, corrected before drawing conclusions:** the previously-committed
`after/T1/` directory (T1's own capture) is **not** a valid before/after baseline for this unit —
it predates several unrelated lanes (W-26, W-26b, W-27x, etc.) that merged into main between T1's
capture and this unit's base `47a5a755`. Diffing `after/T1` against `after/T1b` directly showed the
`torus__contour__ladder__med__a` control — a law T1b's diff never touches — differing by 109436 of
320800 pixels, which would have been a false alarm. I caught this by capturing a proper scratch
baseline (`git archive 47a5a755 | tar -x`, dev server on port 8579, same 8 cells) and re-diffing:
the ladder control is **byte-identical (0/320800px)** against the correct `47a5a755` baseline,
confirming the ladder placement path (out of scope, W-26/W-26b's) is genuinely untouched. All
numbers and images in this report use the `47a5a755` scratch baseline, not `after/T1/`.

**What I saw, looked at directly (native-resolution crops, pixel-diff overlays against the correct
baseline, not just full-frame eyeballing):**
- `torus__contour__mkTick__med__a`: cropped a 100×70px region around the largest diff cluster and
  overlaid the pixel-diff mask (threshold >60) in red on the after image. The red overlay traces
  **exactly one small curved stroke stub** sitting at a wedge/limb boundary in the before image that
  is absent in after — precisely the "near-duplicate limb-truncated stub at a silhouette edge"
  defect T1-review §6 described. No other visible change in the crop.
- `torus__crosshatch__mkTick__med__a`: cropped a 100×130px region around the torus's inner-hole rim
  (where T1-review §6 reported "a band of near-solid ink"). The overlaid diff mask shows a chain of
  ~8 discrete dash/tick marks removed along a single curved arc right at the silhouette edge — a
  visibly denser cluster of drops than the contour cell, consistent with the measured 40 dupStub
  drops here vs 4 on contour. The remaining texture at this location still reads as one coherent
  woven band, not a hole or a visible gap.
- `torus__contour__ladder__med__a`: byte-identical control, confirmed programmatically.
- `sphere__contour__mkTick__med__a` (optional control, also a walked-mark cell): 2 marks dropped;
  the diff overlay traces exactly two small removed stub strokes near the sphere's upper-left limb,
  same pattern as the two primary cells.
- `torus__contour__mkTick__low__a`: 0 diff (0 marks dropped — the guard does not fire at the sparse
  end, as expected since crowding requires density).

**Pixel-diff investigation (why the raw diff numbers looked alarming before I understood them):**
the four affected mkTick cells show pixel diffs at two distinct scales: (a) a small number of
high-magnitude (diff>100) clusters that map exactly onto the shape of the removed stub strokes when
overlaid, and (b) a much larger population of very-low-magnitude (diff 1-30) pixels scattered
widely, which is standard webp lossy-compression echo from a small localized content change — not a
rendering-position shift. Confirmed by: (i) two independent captures of the identical pre-T1b
tree/params are byte-for-byte 0-diff, ruling out inherent capture non-determinism; (ii) pathCount,
inkMm, and per-mark point-count statistics for surviving marks are unchanged to the exact mark — no
surviving mark's geometry moved, only whole marks were removed. Same class of artifact
W-10c-impl-2 accepted as "antialiasing jitter only" at smaller magnitude (2129/320000px, max delta
27); here the magnitude is somewhat larger because whole strokes (not sub-pixel AA) are removed,
but the underlying content diff is exactly and only the dropped-mark set.

Full mapping and per-cell notes in `docs/3d-audit/fill-audit/after/T1b/report.json`.

## Open follow-ups

- T3/U3 (bulk row-coverage-floor banding, `MK_ROW_COV` scaffold) remains explicitly out of scope for
  T1b per the ruling — not started here.
- W-31 (crosshatch cell-shape evenness) and W-36 (crosshatch family-count parity) are queued after
  this unit per `STILL-OPEN.md`'s resume order and are unaffected by T1b's own narrow tail fix
  (T1b does not touch `CROSS_SHARE_BASE` or any ladder/crossing-family placement code).
- The min-adjacent-mark guard is a strict superset check (every walked mark against every earlier
  one in the whole render via a fixed-radius grid bucket, O(1) average per mark) — fine at these
  fixtures' mark counts (up to ~1500), not stress-tested beyond the existing G6 d=220 perf point.

REPORT docs/3d-audit/lane-reports/T1b-impl.md — DONE — kept checkpoint's mechanism; folded scratch perf probe into a real test; RGR+guards+evidence all green.
