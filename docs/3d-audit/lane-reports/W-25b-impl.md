STATUS: DONE/FU

# W-25b — scope the SPIRAL_MIN_TURNS=2 floor to thin-cusp faces (fill-audit-d)

## Lane / tree
- Worktree: `.claude/worktrees/fill-audit-d` (branch `3d-scene/fill-audit-d`)
- Base HEAD (recorded before this unit): `767bed54` (fix(scene3d): W-27c item 0(b))
- New HEAD: `789ba0fa` (fix(scene3d): scope the SPIRAL_MIN_TURNS floor to thin-cusp faces, not just small ones (W-25b))
- Files touched: `src/core/scene3d/mappers.js`, `tests/unit/scene3d-mappers.test.js`,
  `tests/unit/scene3d-mesh-self-occlusion.test.js` (header comment fix only). No
  other files touched; worktree was clean before and after (`git status --short
  -- . ':!graphify-out'` empty both times).

## Background
W-25 (`44797f53`) added `SPIRAL_MIN_TURNS=2` in `trueSpiral` (mappers.js) so
Unit F's thin-cusp torus faces no longer degenerate to a near-straight radial
stub: `effPitch = Math.min(pitch, rMax / SPIRAL_MIN_TURNS)`. A reviewer
measured this gate is **not** a no-op on the default buckyball: at density 50
(pitch 7.2mm, so the size-only threshold `pitch * SPIRAL_MIN_TURNS` is
14.4mm), every one of the buckyball's 16 visible faces has `rMax` 7.04-8.40mm
— comfortably under the threshold — so W-25's gate fires on all of them,
despite their aspect ratio sitting at 0.87-1.15 (near-regular
pentagons/hexagons, nothing like a sliver). The brief asked to decide between
(A) retune the floor to engage only on genuinely thin-cusp faces, keeping the
Unit F fix and restoring buckyball byte-identity, or (B) own the buckyball
diff with a fingerprint test.

## Decision: (A), retune

### Root cause
W-25's gate was a **size** condition only (`rMax < pitch * SPIRAL_MIN_TURNS`)
— it never checked **shape**. A small-but-regular face and a small-and-thin
face both satisfy the size condition; only the second is the actual defect
class the fix meant to describe.

### Fix
`trueSpiral` already computes `bw`/`bh` (bounding-box width/height) and
clamps `ecc = clamp(bw/bh, ECC_MIN=0.3, ECC_MAX=3)` for its eccentricity
auto-fit. The RAW, pre-clamp ratio `rawAspect = bw/bh` falling outside that
same `[0.3, 3]` range is exactly what "thin cusp" already meant in the
original W-25 RED test's own title ("bw/bh well outside the eccentricity
clamp"). W-25b adds that as a second, ANDed condition:

```js
const rawAspect = bw / bh;
const isThinCuspFace = rawAspect < ECC_MIN || rawAspect > ECC_MAX;
const effPitch = isThinCuspFace ? Math.min(pitch, rMax / SPIRAL_MIN_TURNS) : pitch;
```

`ECC_MIN`/`ECC_MAX` were hoisted to named constants (previously inline
literals `0.3`/`3` in the `clamp()` call) so the gate and the auto-fit share
one definition. The change can only **shrink** the floor's reach (never adds
a case beyond what W-25 already covered), so it cannot reopen a gap W-25
fixed elsewhere.

## Measured numbers (real production path, not isolated math)

Instrumented the real `trueSpiral` calls for the default buckyball (density
50, mapper spiral) via a temporary probe hook (removed before commit,
confirmed `git diff` clean): all 16 visible faces have `bw`/`bh` in
`[12.42, 16.14]`, aspect ratio in `[0.866, 1.155]` (well inside `[0.3, 3]`),
`rMax` in `[7.04, 8.40]`mm, pitch 7.2mm (`pitch * SPIRAL_MIN_TURNS` = 14.4mm
— every face is under the size threshold, confirming the reviewer's finding
digit-for-digit).

Full-pipeline fingerprint (real `algo.generate`, real StyleCascade, the exact
`sceneParams`/`solidBuckyball` harness the new unit test uses), spiral
mapper, density 50, buckyball:

| tree | fillCount | totalPoints | inkMm | sha256 (first 8) |
|---|---|---|---|---|
| `55ddb720` (pre-W-25, W-25's own parent) | 21 | 1006 | 284.148 | `038f174b` |
| `44797f53` (W-25, unconditional floor) | 31 | 1826 | 486.527 | `3b4cdfa6` |
| `789ba0fa` (this fix, working tree = HEAD) | 21 | 1006 | 284.148 | `038f174b` |

This fix's output is **byte-identical** to the commit immediately before
W-25 existed, and differs from W-25's own committed state exactly as the
reviewer predicted.

Pure-module (`Mappers.regionFill`) cross-check on a synthetic near-square
face matching the real buckyball proportions (bw=16, bh=15, pitch=7.2):

| tree | run count | main run length | winding (turns) |
|---|---|---|---|
| `55ddb720` (pre-W-25) | 2 | 77 | 1.178 |
| `44797f53` (W-25, unconditional) | 3 | 95 | 1.463 |
| `789ba0fa` (this fix) | 2 | 77 | 1.178 |

## RGR proof

Three new tests added to `tests/unit/scene3d-mappers.test.js`, all in the
existing `Scene3D.Mappers.regionFill (pure)` describe block (plus one in the
top-level describe for the full-pipeline fingerprint):

1. `'a small NEAR-SQUARE region (not a thin cusp) is unaffected by the W-25
   min-turns floor even though it sits below the size threshold (W-25b)'`
2. `'a region right at the eccentricity clamp boundary (aspect 0.3) still
   counts as thin-cusp (W-25b boundary)'` — pins the strict-inequality
   boundary behavior (`< ECC_MIN`, not `<=`) so a future off-by-one edit
   would flip a passing assertion, not silently do nothing.
3. `'the default buckyball is byte-identical to the pre-W-25 fingerprint at
   density 50 (W-25b)'` — the fingerprint test above, using the real
   `algo.generate` path.

**RED proof** (reproduced by temporarily reverting the shape gate in the
working tree back to W-25's unconditional `effPitch = Math.min(pitch, rMax /
SPIRAL_MIN_TURNS)`, running the suite, then restoring the fix — `git diff`
confirmed clean after restoring):

```
× a small NEAR-SQUARE region... (W-25b)
  → expected 95 to be 77
× a region right at the eccentricity clamp boundary... (W-25b boundary)
  → expected 94 to be greater than 95
× the default buckyball is byte-identical to the pre-W-25 fingerprint... (W-25b)
  → expected 31 to be 21
```

All 25 pre-existing tests in the file (including the thin-sliver W-25 test
and its no-op-guard test) still passed unmodified during this RED run —
confirming the revert only affected the new tests' target behavior.

**GREEN proof** (fix restored):

```
tests/unit/scene3d-mappers.test.js: 28/28 passed
```

## Guards (run one at a time in the foreground, per protocol)

| suite | result |
|---|---|
| `scene3d-mappers.test.js` | 28/28 |
| `scene3d-mesh-self-occlusion.test.js` (Unit F) | 5/5 — `ORIGINAL_SURVIVOR_KEY` retirement and residual-count assertions unchanged and still pass |
| `scene3d-contour-slice.test.js` | 42/42 |
| `scene3d-hlr-spatial-index-identity.test.js` | 6/6 |
| `scene3d-mapper-controls.test.js` | 15/15 |
| `scene3d-shadow-controls.test.js` | 8/8 |

(The `[FillBoolean] polygon union failed on degenerate geometry` console
lines during the mesh-self-occlusion run are pre-existing, expected noise
from the `contour` mapper case on that fixture — unrelated to `spiral` /
this fix; the file's own header documents this.)

## Stale comment fix (reviewer note)
`tests/unit/scene3d-mesh-self-occlusion.test.js`'s top-of-file VERDICT block
still described the spiral mapper's root cause as "root cause traced to
`Mappers.regionFill`'s polygon-union failing on degenerate geometry" — which
W-25's own commit message disproved. The header now says the spiral verdict
is stale-as-written, points to the file's inline "W-25 CORRECTION" comment
(added by W-25 further down in the same file, which already had the correct
analysis) for the current state, and explicitly preserves the original text
labeled as historical, not current.

## Evidence (main checkout, `docs/3d-audit/fill-audit/after/W-25b/`)

Re-shot `^solid__spiral__(none|ladder)__med__a$` (the only style present for
`solid__spiral` in the manifest is `ladder`; there is no `imageSurface`
"none" entry) via `node scripts/audit/scene3d-capture.js --tier A --root
.claude/worktrees/fill-audit-d --port 8481 --only
'^solid__spiral__(none|ladder)__med__a$' --out
docs/3d-audit/fill-audit/after/W-25b` — captured AFTER (fix in place) into
`after/W-25b/`, then temporarily reverted the shape gate again and captured
BEFORE into `after/W-25b/before-767bed54/` (767bed54 = this unit's base
HEAD, same code as W-25's committed state for this file), then restored the
fix and reconfirmed 28/28 green before committing.

No imported-mesh primitive exists anywhere in the audit gallery's manifest
(`grep` over all `manifest.*.jsonl` on main: primitives are only
`box/capsule/cone/cylinder/ellipsoid/plane/pyramid/solid/sphere/superellipsoid/torus/torusKnot`
— imported OBJ/STL meshes are a unit-test-only fixture, never a gallery
cell) — the brief's "an imported-mesh spiral cell if one exists in the
manifest" does not exist; the Unit F fixture is covered instead by the
`scene3d-mesh-self-occlusion.test.js` guard re-run above (5/5, unchanged).

`report.json` written with the same fields as `after/W-25/report.json`
(GH-1 schema: `id, title, branch, commit, before, after, notes, tests,
byte_identical_pairs`), plus an empty `identical_exceptions` array since the
before/after pair is NOT byte-identical (that's the point of the fix).

**LOOK (both PNGs decoded from webp and viewed via the Read tool):** before
(before-767bed54) shows every face of the buckyball with a visibly denser,
tighter ~1.5-turn coil — a real, undecided cosmetic change to the shipped
default. After (this fix) shows the original, looser single "comma"-style
curl per face — visually restoring the pre-W-25 default look. The two shots
are NOT byte-identical (before: 31584 bytes / md5 `4a0b2a83...`; after:
22802 bytes / md5 `bcaf36f6...`), consistent with the numeric fingerprint
diff above.

## Open follow-ups (not this unit's scope)
- Residual sub-0.05mm HLR occluder-precision seam on the imported torus
  fixture (`hlr.js`, not `mappers.js`) — recorded by W-25, still open, needs
  its own W-id (per STILL-OPEN.md and LEDGER.md).
- `docs/3d-audit/fill-audit/after/W-25b/` and this report are, like every
  other lane's evidence this session, uncommitted on main pending the
  orchestrator's wrap-up commit (GH-1's own established pattern — main's
  `git status` already shows `A3`, `W-10c`, `W-15c`, `W-27c`, `W-27c-0`,
  `W-29` in the same untracked state).
