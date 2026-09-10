STATUS: DONE

# W-27c-0a-6 — refineSliceRing: fix the torus level-6 contourSlice non-convergence (implementer report)

Lane: fill-audit-d2. Worktree: `.claude/worktrees/fill-audit-d2` (branch
`3d-scene/fill-audit-d2`), port 8481. Base sha: `49cf0e3e` (W-27c-0a-5). New
sha: `392696ac`. Files touched (only the allowed two):
`src/core/algorithms/scene3d.js` (slices block — `refineSliceRing` only, 28
inserted lines) and `tests/unit/scene3d-contour-slice.test.js` (re-pin +
new describe block). Not pushed.

## 0. Input from the coordinator, addressed

Mid-task the coordinator forwarded `W-27c-0a-5-review.md`
(ACCEPT-WITH-FOLLOWUPS): the 8 rounds are NOT load-bearing, and four of
W-27c-0a-5's new bars pin a round-count ARTIFACT (the non-convergence this
unit fixes), not anything real. Instructed: re-pin exactly those four with
the convergence fix as proof, leave the tiny-ring COUNT pin (5 of 47)
untouched. Done — see `## Bars changed` below; the count pin (`small.length
=== 5`, `rings.length === 47`) was not touched anywhere in this diff.

## 1. The defect (measured by W-27c-0a-5, confirmed again here)

Default torus, `sliceCount 26`. Of 47 total front contourSlice rings,
exactly 5 arrive at `refineSliceRing` with `<=4` raw points. The level-6
ring's two raw points sit **0.0038mm apart** — above `refineSliceRing`'s own
`DUP_EPS` (1e-4mm) seam-dedup, so never merged — and its own total raw
length (2 edges, open ring) is **0.0041mm**. Feeding this into the
centripetal Catmull-Rom subdivision drives genuine non-convergence: it
burns every one of `SLICE_REFINE_MAX_ROUNDS` (8), balloons to **513
points**, and its device-space max turn never drops under the 8° stop
condition (measured **179.99932751408932°** at round 8). Harmless only
because the drawn length stayed ~0.004mm, ~75x under one pen width (0.3mm).

## 2. Why widening `DUP_EPS` is not a safe fix (measured, not assumed)

Measured raw adjacent-point gaps across all six primitives (sphere, torus,
ellipsoid, cone, cylinder, capsule; default rig; `sliceCount 26`) in a
scratch instrumentation of `linkSegments`' own raw output (never
committed):

- The pathological gap is 0.0038mm.
- Legitimately dense rings (46-84 raw points, real fine tessellation, NOT
  tiny) on sphere/ellipsoid/cone/capsule carry adjacent-vertex gaps as
  large as **0.0074mm** (cone, level 18) and **0.0058-0.0074mm** (capsule,
  level 23) — bigger than the pathological ring's own 0.0038mm gap.
- A single absolute per-edge epsilon therefore cannot separate "the
  pathological pair" from "real fine-tessellation detail" — any threshold
  wide enough to catch 0.0038mm also risks merging real geometry on other
  rings with legitimately smaller margins than expected (the closest
  false-positive-adjacent legitimate gap, capsule 0.004024mm, is only 5.7%
  above the pathological gap — no safe absolute cut exists there).

## 3. The fix — a whole-ring raw-length hazard gate

`refineSliceRing` (src/core/algorithms/scene3d.js, right after the existing
`base.length < 3` bail): for a ring with `base.length <= 4`, sum its raw
perimeter (open, `n-1` edges); if that total is `< 0.05mm`, return the
original `worldPts` unrefined — the same no-op-on-tiny-input shape the
existing `< 3` bail already uses.

**Why 0.05mm, and why scoped to `<=4` points**: measured the raw length of
every `<=4`-raw-point ring on all six primitives (default rig). Excluding
the pathological ring, the next-smallest is **0.235mm** (cone, level 4) —
**4.7x** above the 0.05mm gate. The pathological ring's own length
(0.0041mm) sits **12x** below the gate. Both margins measured directly (see
the new "safety margin" test, §5). Every `rawCount===2` ring already bails
at the pre-existing `< 3` check regardless of length (several of these are
themselves near-zero-length, e.g. sphere level 18/23 at ~0.0001-0.00002mm —
unaffected either way, confirmed unreachable by the new gate). Scoping to
`<=4` points (rather than a bare length check with no point-count gate)
keeps the fix's footprint provably confined to the exact ring class named
in the defect, with zero risk to any larger ring regardless of its length.

## 4. RGR proof

**RED** (scratch `git archive 49cf0e3e`, node_modules symlinked, deleted
after use): copied the final (post-fix) test file into the scratch export
and ran `tests/unit/scene3d-contour-slice.test.js` there — **4 of 67 tests
fail**, exactly the four re-pinned bars plus the two new W-27c-0a-6 core
tests use the same underlying numbers:

- `W-27c-0a-5 ... the five rings — exact discrete signature ...` (level-6's
  `finalCount` band and exact `roundsUsed` check fail: actual 513/8 vs
  re-pinned expected 3/0)
- `W-27c-0a-5 ... the level-6 near-degenerate ring ... stays a harmless
  micro-stub, not a blob` (re-pinned `roundsUsed` exact check and
  `finalCount<=10` ceiling both fail against the unfixed 8/513)
- `W-27c-0a-6 ... every torus contourSlice front ring converges ...`
  (finds exactly 1 non-converged ring: level 6, `roundsUsed:8,
  deviceMaxTurn:179.99932751408932` — the RED proof this unit was asked
  for)
- `W-27c-0a-6 ... the fixed level-6 ring: subdivision skipped ...`
  (`roundsUsed` actual 8 vs expected 0)

The other 63 tests (including the new "other four tiny rings are
byte-identical" and "safety margin" tests, which don't depend on the fix)
pass at RED too, confirming the fix's footprint claim independently of the
fix itself.

**GREEN at `392696ac`**: full file **67/67** (57 pre-existing + 6
W-27c-0a-5 + 4 new W-27c-0a-6).

**Direct before/after measurement** (same reconstruction, run against both
trees): level-6 ring — `roundsUsed` 8 → **0**; `finalCount` 513 → **3**;
`finalLengthMm` 0.0040003198533569585 → **0.004099155900223327**;
`deviceMaxTurn` 179.99932751408932° → **180°** (exact, the raw chord's own
angle, no longer a subdivision artifact). All 47 torus front rings now
satisfy "rounds used < max OR final device turn <= 8°" (0 non-converged,
was 1). The other four tiny rings (level 2/3pt, level 2/4pt, level 21/2pt,
level 25/4pt) are **byte-identical** before/after (dedicated test).

## 5. Guards (foreground, one file at a time, per protocol)

| suite | result |
|---|---|
| `tests/unit/scene3d-contour-slice.test.js` (full file) | **67/67** (57 pre-existing + 6 W-27c-0a-5 + 4 new W-27c-0a-6) |
| `tests/unit/scene3d-contour-slice-corners.test.js` (W-34's corner tests, W-34b's ceiling) | **25/25**, unaffected |
| `tests/unit/scene3d-slice-end-overlap.test.js` (W-35, k=0 byte-identity) | **30/30**, unaffected |
| `tests/unit/scene3d-mappers.test.js` | **32/32** |
| `tests/unit/scene3d-hlr.test.js` | **11/11** |
| `tests/unit/scene3d-curves.test.js` | **13/13** |
| `tests/unit/scene3d-mesh-self-occlusion.test.js` | **5/5** (pre-existing `[FillBoolean]` console noise, unrelated — matches STILL-OPEN.md's Unit-F entries) |
| `tests/unit/scene3d-hlr-draft-flag-wiring.test.js` | **2/2** |
| `tests/unit/scene3d-hlr-spatial-index-identity.test.js` | **6/6** |
| `tests/unit/scene3d-tone-law-params.test.js` | **13/13** |

Ran the first three together in one foreground invocation as well:
**122/122**.

## 6. Byte-identity sweep (full app pipeline, beyond the required guards)

In-process md5 of `Vectura.AlgorithmRegistry.scene3d.generate()` output,
comparing the pre-fix tree (`49cf0e3e`, loaded via `loadVecturaRuntime`'s
`scriptOverrides` with `git show 49cf0e3e:src/core/algorithms/scene3d.js`)
against the fixed worktree, across **all six primitives** (sphere, torus,
ellipsoid, cone, cylinder, capsule) × **2 cameras** × **2 densities**
(med/max) × `contourSlice`: **0 of 24 cells differ**. The fix's only
possible effect (the torus level-6 ring) is below the render/rounding
resolution even before any pixel is drawn.

## 7. Evidence capture

Confirmed all four named cells exist in `manifest.A.1-1.jsonl` before
capturing. From MAIN, against the fixed worktree:

```
node scripts/audit/scene3d-capture.js --tier A --root .claude/worktrees/fill-audit-d2 \
  --port 8481 --only '^torus__contourSlice__ladder__(med|max)__(a|b)$' \
  --out docs/3d-audit/fill-audit/after/W-27c-0a-6
```

4/4 shots `ok`. Then built a disposable `git worktree add --detach
<scratch> 49cf0e3e` (pre-fix), served on port 8482, and re-shot the same 4
cells there as the true "before" (confirmed via `lsof`/process check
actually serving that export; scratch worktree removed via `git worktree
remove --force` immediately after, port freed).

**Result: all 4 cells are byte-identical (md5-matched .webp files)** —
`pathCount 107`/`totalPoints 3421`/`inkMm 1098.6` for med-a/max-a and
`pathCount 103`/`totalPoints 3259`/`inkMm 1000.7` for med-b/max-b, matching
exactly before and after. (Note: these numbers differ from the STALE
`docs/3d-audit/fill-audit/shots/A/torus__contourSlice__ladder__*` gallery
baseline, `appVersion 1.3.98`, `pathCount 109`/`inkMm 1123.2` — that
mismatch is the pre-existing, already-documented W-34 delta
[W-34-impl.md §6], unrelated to this unit; the correct "before" for
isolating THIS unit's own diff is the pre-49cf0e3e-vs-post-fix comparison
above, not the stale gallery shot.)

`docs/3d-audit/fill-audit/after/W-27c-0a-6/report.json` written with the
full explanation (byte-identity is expected and correct here, not an
evidence gap).

**LOOKED** at `torus__contourSlice__ladder__med__a.webp` (Read tool, native
resolution): a healthy torus contourSlice ladder — dense concentric rings
following the tube, both saddle-adjacent "eye" pinch regions showing normal
evenly-spaced rings, no visible blob, fusion, or defect anywhere in the
frame. Exactly the predicted outcome (the level-6 ring's ~0.004mm drawn
length is far below anything visible at this render scale), and the
md5-identity is a strictly stronger confirmation than a visual crop diff
(0 bytes differ, not merely "looks the same").

## 8. `## Bars changed`

| file:line | old | new | why |
|---|---|---|---|
| `tests/unit/scene3d-contour-slice.test.js` — `EXPECTED5` level-6 entry (W-27c-0a-5's discrete-signature test) | `finalCount: 513, finalLengthMm: 0.0040003198533569585, deviceMaxTurn: 179.99932751408932, roundsUsed: 8` | `finalCount: 3, finalLengthMm: 0.004099155900223327, deviceMaxTurn: 180, roundsUsed: 0` | Convergence fix (§3/§4 above) genuinely changes these values — the ring no longer subdivides. Per the coordinator's forwarded review, this bar previously pinned a round-count ARTIFACT; it now pins the real, non-round-cap-dependent post-fix shape. |
| `tests/unit/scene3d-contour-slice.test.js` — level-6 harmlessness test, `roundsUsed` exact check | `expect(lvl6.roundsUsed).toBe(8)` | `expect(lvl6.roundsUsed).toBe(0)` | Same fix; this ring's `roundsUsed` is now a real 0 (the hazard gate bails before subdivision), not sensitive to `SLICE_REFINE_MAX_ROUNDS` at all any more. |
| `tests/unit/scene3d-contour-slice.test.js` — level-6 harmlessness test, `finalCount` ceiling | `expect(lvl6.finalCount).toBeLessThanOrEqual(700)` | `expect(lvl6.finalCount).toBeLessThanOrEqual(10)` | Per the review, the old `700` ceiling was itself a function of round-count doubling, not a meaningful bound. Now that the ring skips subdivision, `finalCount` is the raw 3-point count — tightened to `10` (3x headroom) so a future regression BACK toward subdivision (the hazard gate silently stops firing) is caught immediately instead of allowing up to 700 points again. |

Per the coordinator's explicit instruction, the tiny-ring **count** pin
(`rings.length === 47`, `small.length === 5`) is **untouched** — it is
computed from raw pre-refine `linkSegments` output, independent of this
fix. No other existing bar, tolerance, count ceiling, or fingerprint in
this file was touched (confirmed: the two OTHER continuous-output bars on
this ring, `finalLengthMm`/`deviceMaxTurn`'s ±10% bands, already
comfortably contained the new values without needing to move — checked,
not assumed).

## 9. Commit

Worktree `fill-audit-d2`, sha `392696ac`. Staged files:
`src/core/algorithms/scene3d.js`, `tests/unit/scene3d-contour-slice.test.js`
(exactly the two allowed files — confirmed via `git status --short -- . ':!graphify-out'`
both before and after staging). No version bump (worktree, per protocol).
Not pushed.

## 10. Open follow-ups

None filed by this unit. The level-6 ring's underlying near-degenerate raw
geometry (a real, if currently harmless, feature of the torus's own
saddle-adjacent tessellation at this exact slice-plane level) is untouched
— this fix removes the wasted, previously-non-convergent subdivision
around it, not the raw geometry itself. If a future change (slice-plane
placement, mesh-detail default, or similar) grows this specific ring's raw
extent past ~0.05mm, the hazard gate will stop firing and subdivision will
resume normally on now-larger, presumably well-conditioned input — no
action needed unless that same growth also reintroduces a near-degenerate
sub-DUP_EPS-adjacent case at a different scale, which is out of scope to
predict here.
