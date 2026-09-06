STATUS: ACCEPT

# W-25b review — scope the SPIRAL_MIN_TURNS floor to thin-cusp faces (fill-audit-d)

Reviewer: adversarial, read-only. Worktree inspected: `.claude/worktrees/fill-audit-d`
(clean, `git status --short -- . ':!graphify-out'` empty; no stray stashes of
this lane's work). Range reviewed: `767bed54..789ba0fa` (exactly one commit,
`789ba0fa`, is in range — a later implementer's commits on `scene3d.js` were
ignored per instructions and never touched by this unit anyway).

All work done in scratch archive exports, never by editing/stashing in the
worktree:
`/private/tmp/.../scratchpad/{before-767bed54,after-789ba0fa,pre-w25-55ddb720,w25-44797f53}`
(`git archive <sha> | tar -x`, `node_modules` symlinked from main).

## (1) Diff scope

`git diff 767bed54..789ba0fa --stat`:
```
 src/core/scene3d/mappers.js                    | 44 ++++++++----
 tests/unit/scene3d-mappers.test.js             | 93 ++++++++++++++++++++++++++
 tests/unit/scene3d-mesh-self-occlusion.test.js | 16 ++++-
 3 files changed, 138 insertions(+), 15 deletions(-)
```
Confirmed: only `mappers.js` (production) + two test files. In lane
(`mappers.js` → fill-audit-d). No `scene3d.js`, no other production file
touched.

## (2) RED / GREEN — reproduced from ARCHIVE exports, not hand-reverting

Per the coordinator's flag, I did **not** trust the implementer's
working-tree revert. I built a scratch tree (`red-check`) = `after-789ba0fa`
with `src/core/scene3d/mappers.js` **replaced by the file from
`before-767bed54`** (i.e. the real pre-fix production code, from a real git
archive of the pre-fix commit) while keeping `after-789ba0fa`'s test file.

RED (pre-fix `mappers.js` + post-fix tests), `npx vitest run
tests/unit/scene3d-mappers.test.js`:
```
Test Files  1 failed (1)
     Tests  3 failed | 25 passed (28)
 × a small NEAR-SQUARE region...(W-25b): expected 95 to be 77
 × a region right at the eccentricity clamp boundary...(W-25b boundary): expected 94 to be greater than 95
 × the default buckyball is byte-identical to the pre-W-25 fingerprint...(W-25b): expected 31 to be 21
```
Exactly the numbers in the impl report (95/94/31). GREEN at `after-789ba0fa`
unmodified: `28/28 passed`. Both independently reproduced, matching the
implementer's claim digit-for-digit.

## (3) Byte-identity claim — independently reproduced across three REAL trees

Copied the after-tree's fingerprint test onto two other real archive
exports and ran it there (not just trusting the implementer's sha claim
inside one file):

| tree | test result | fillCount / totalPoints / inkMm |
|---|---|---|
| `55ddb720` (pre-W-25, W-25's own parent) | **PASS** (1/28, 27 skipped via `-t`) | 21 / 1006 / 284.148 |
| `44797f53` (W-25, unconditional floor) | **FAIL**: expected 31 to be 21 | 31 / 1826 / 486.527 |
| `789ba0fa` (W-25b, this fix) | **PASS** (part of 28/28) | 21 / 1006 / 284.148 |

Confirms the fix's output is byte-identical to the commit immediately before
W-25 existed, and differs from W-25's own committed state exactly as
predicted. Not a self-referential claim — verified against the real
production code at all three commits.

## (4) The thin-cusp gate — definition, boundary, and the REJECT-flag question

Gate: `rawAspect = bw/bh` (raw pre-clamp bounding-box aspect of the face);
`isThinCuspFace = rawAspect < ECC_MIN(0.3) || rawAspect > ECC_MAX(3)`; floor
applies (`effPitch = min(pitch, rMax/SPIRAL_MIN_TURNS)`) only when BOTH
`isThinCuspFace` AND the original W-25 size condition hold (`Math.min`
against unfloored `pitch` is a no-op unless `rMax/SPIRAL_MIN_TURNS < pitch`).
This is a **strict narrowing** of W-25's original gate — it can only remove
cases W-25 used to floor, never add new ones — so it cannot logically
regress W-25's protection into a bigger gap than before W-25 existed.

Boundary test reproduced: aspect exactly 0.3 (`AT_BOUNDARY`) is NOT thin
(strict `<`), aspect 2.9/10=0.29 (`JUST_THIN`, one hair below) IS thin, and
the floored run has strictly more points than the unfloored one. Boundary
is deliberately pinned, not left to accidental FP behavior.

**Coordinator's REJECT-flag concern, addressed with real numbers.** The
implementer's report asserted Unit F's cusp faces measure "bw/bh ~0.18" but
supplied no direct instrumentation — only the pass/fail of the 5/5 guard
suite as indirect evidence. I do not accept indirect evidence for a
verdict-inverting claim, so I instrumented `trueSpiral` directly (a
temporary probe pushing `{bw,bh,rawAspect,rMax,pitch,isThinCuspFace,effPitch}`
onto `runtime.window.__W25B_PROBE__`, in the scratch `after-789ba0fa` export
only — never in the worktree) and ran the real Unit F torus fixture
(`tests/unit/scene3d-mesh-self-occlusion.test.js -t spiral`) end to end
through `engine.computeAllDisplayGeometry()`. Real measured numbers, 288
actual `trueSpiral` calls on the real fixture at real production pitch
(5.84mm):

- **102 of 288** calls have `isThinCuspFace: true`; of those, **all 102**
  actually get floored (`effPitch < pitch`, ratios 0.32–0.41× the base
  pitch) — the size condition and shape condition co-occur for every one of
  them on this fixture, exactly as the fix's docstring claims.
- `rawAspect` for the thin-cusp group ranges **0.177 – 5.70** (well outside
  `[0.3, 3]` on both sides) — the implementer's "~0.18" claim is confirmed
  almost to the decimal (measured minimum 0.17747…).
- `rawAspect` for the NOT-thin group (186 calls, unaffected by the floor)
  ranges **0.318 – 2.984** — comfortably inside `[0.3, 3]`, with real margin
  from the boundary (not clustered right at 0.3/3 where FP noise could flip
  the verdict).

This is the single most important finding of this review: **the aspect
values do NOT sit inside the clamp** — they sit outside it, for over a
third of the fixture's real faces, with the floor demonstrably still firing.
W-25's protection is measurably **still active**, not inert. The
coordinator's REJECT condition ("if they sit inside it... → REJECT") does
not obtain. This directly falsifies the "disguised revert" hypothesis: a
revert would have `isThinCuspFace` false for all 288 (or the fix would be a
no-op on this fixture); instead 35% of real calls are actively floored.

Survivor count with this instrumentation in place: `survivorPositions=0`,
matching the impl report; full suite `tests/unit/scene3d-mesh-self-occlusion.test.js`:
**5/5 passed**, unmodified from the committed test file.

**Residual, non-blocking risk:** the `[0.3, 3]` threshold is reused from the
eccentricity auto-fit's own stretch limit (a principled reuse, not an
arbitrary new number), and the boundary is pinned by a test — but it is
still a single geometric heuristic, not proven optimal for every possible
future mesh. A face whose aspect sits just inside `[0.3, 3]` (e.g. 0.32) but
is still visually elongated enough to read as a "stub" on some future
low-poly import is conceivable and not covered by either W-25's or W-25b's
tests. Flagging as a follow-up, not a defect in this unit — it's explicitly
the same boundary W-25's own RED test already used to describe "thin cusp."

## (5) Other fixtures — independently swept, not just the buckyball

Built a standalone fingerprint script (mirroring the real
`scene3d-mappers.test.js` `sceneParams`/`fills` helpers exactly: same
`styleTable`, `camera`, `ground`, `BOUNDS`) and ran the spiral mapper against
**every** `PRIMITIVE_PARAM_DEFAULTS` entry (`box, plane, sphere, ellipsoid,
cylinder, cone, torus, torusKnot, capsule, superellipsoid, pyramid, solid`)
at both `before-767bed54` and `after-789ba0fa`, hashing `(x,y)` for every
fill-path point:

```
box            SAME  (fillCount 14, totalPoints 624, inkMm 540.209)
plane          SAME  (14 / 627 / 1426.983)
sphere         SAME  (47 / 680 / 1344.861)
ellipsoid      SAME  (44 / 684 / 1740.456)
cylinder       SAME  (38 / 566 / 1145.433)
cone           SAME  (25 / 387 / 493.753)
torus          SAME  (34 / 390 / 348.442)
torusKnot      SAME  (26 / 310 / 194.585)
capsule        SAME  (47 / 637 / 1052.609)
superellipsoid SAME  (35 / 554 / 1553.588)
pyramid        SAME  (46 / 644 / 1223.391)
solid          DIFF  before: 31/1826/486.527  →  after: 21/1006/284.148
```
Only `solid` (the buckyball) changes. All 11 other default-primitive spiral
fingerprints are byte-identical (same sha256) between the two commits. Note
scope: this sweeps each primitive's **default** proportions only, not every
density tier in the gallery manifest — a reasonable, non-exhaustive but
representative sample, not a full combinatorial sweep.

Confirmed independently (grep over every `manifest.*.jsonl` under
`docs/3d-audit/fill-audit/`, including all `after/*/manifest.*.jsonl`): the
only `primitive` values that ever appear anywhere in the gallery are
`box/capsule/cone/cylinder/ellipsoid/plane/pyramid/solid/sphere/superellipsoid/torus/torusKnot`.
`importedMesh` is a `solidType`, not a `primitive`, and never appears as a
gallery cell — the implementer's claim that no imported-mesh gallery cell
exists is correct, and the coordinator's instruction to say so rather than
accept a substitute is followed: the Unit F fixture (§4 above) is the only
available evidence for the imported-mesh case, and it was independently
re-measured, not just re-run.

## (6) Stale header comment

`tests/unit/scene3d-mesh-self-occlusion.test.js` top-of-file VERDICT block:
the old "root cause traced to `Mappers.regionFill`'s polygon-union failing
on degenerate geometry" text is now explicitly labeled `(ORIGINAL, PRE-W-25
TEXT)`, preceded by a correction paragraph pointing at the file's own
"W-25 CORRECTION" inline comment and stating the spiral verdict is retired.
Read both; the correction is accurate (matches W-25's own commit message
and this review's own re-measurement in §4) and the historical text is
clearly fenced off, not silently left as if current.

## (7) PNGs looked at + report.json fields

Decoded both webp shots with `dwebp` and viewed them (Read tool):
- `after/W-25b/before-767bed54/shots/A/solid__spiral__ladder__med__a.webp`
  (31584 bytes, md5 `4a0b2a83…`) — every buckyball face shows a tight,
  ~1.4-turn double coil.
- `after/W-25b/shots/A/solid__spiral__ladder__med__a.webp` (22802 bytes, md5
  `bcaf36f6…`) — every face shows a single, looser "comma" curl.
Sizes/md5s match the impl report exactly; the visual difference matches the
numeric fingerprint diff (more turns/points before, fewer after) and matches
the impl report's description. Not byte-identical, which is expected and
correctly reflected by `byte_identical_pairs: []` / `identical_exceptions: []`
in `report.json`.

`report.json` field set: `id, title, branch, commit, before, after, notes,
tests, byte_identical_pairs, identical_exceptions` — matches the GH-1 base
schema plus `identical_exceptions`, a field already established by
`W-01`, `W-15c`, `W-27c-0`, `W-29`'s own `report.json` files (checked all
prior `after/*/report.json` field sets for precedent) — not an invented
field.

## Guards (spot-checked, not blindly trusted)

| suite | result | how verified |
|---|---|---|
| `scene3d-mappers.test.js` | 28/28 | ran myself, after-789ba0fa |
| `scene3d-mesh-self-occlusion.test.js` | 5/5 | ran myself (both `-t spiral` and full file), after-789ba0fa, with probe instrumentation active |
| `scene3d-contour-slice.test.js` / `scene3d-hlr-spatial-index-identity.test.js` / `scene3d-mapper-controls.test.js` / `scene3d-shadow-controls.test.js` | not re-run | diff (§1) proves zero production changes outside `mappers.js`; these suites exercise `scene3d.js`/`hlr.js` code this unit never touched, so a re-run adds no discriminating signal beyond what the diff already proves |

## Verdict: ACCEPT

Numbers: diff = 3 files (1 production), RED = 95/94/31 vs expected 77/95/21
(reproduced from a real archive, not a working-tree revert), GREEN = 28/28,
byte-identity = confirmed independently across 3 real commits
(55ddb720/44797f53/789ba0fa), Unit F real-fixture instrumentation = 102/288
`trueSpiral` calls still floored with `rawAspect` 0.177–5.70 (outside
`[0.3,3]`, NOT inside — falsifies the disguised-revert hypothesis),
survivors = 0/5 tests pass, other-fixture sweep = 11/12 primitives
byte-identical (only the intended buckyball diff), stale comment = fixed and
accurate, PNGs = looked at and match the numeric/verbal claims, report.json
= schema-consistent with precedent.

No follow-ups required to accept; one non-blocking note carried forward: the
reused `[0.3, 3]` eccentricity-clamp threshold is a principled heuristic, not
an exhaustively proven one — a hypothetical future low-poly import with a
face aspect just inside the clamp could still visually stub if it happens to
be unusually small; not observed on any current fixture, no action needed
now.
