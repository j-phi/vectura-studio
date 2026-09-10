STATUS: ACCEPT-WITH-FOLLOWUPS

# W-35 review — sliceEndOverlap (end overlap / edge-fidelity control)

Reviewer: adversarial reviewer, read-only. Worktree `.claude/worktrees/fill-audit-d2`, pinned range
`6dcc308f..323e2583` (HEAD confirmed `323e2583577c09ff46388842b2c2bf985b86fe4c`, `git status` clean
throughout this review — no edits/stashes made in the worktree). All numbers below were independently
reproduced, not copied from `W-35-impl.md`.

**Protocol note:** an earlier pass of this review was killed by a rate-limit while waiting on a
`run_in_background`-promoted `npx jest` invocation (wrong runner — this repo uses `vitest` via
`node scripts/run-vitest.js`, not jest; `npx jest` was silently resolving/hanging). Root cause fixed
this pass: every test run below used the correct runner, foreground, one file at a time, with
explicit `timeout` values; where a run still exceeded the tool's timeout and was auto-backgrounded,
its output file was `cat`'d once (not polled/Monitor'd) to retrieve the already-finished result.

---

## Secretary flags (addressed explicitly)

**(1) Is the crowd-cull confound real, or a convenient excuse to leave `generate()`?**
Reproduced independently, full `generate()` pipeline, sphere/camera-a, `sliceCount 26`:

| k | openRuns | totalPaths | total emitted length (px) |
|---|---|---|---|
| 0 | **22** | 26 | 1118.69 |
| 1 | **23** | 27 | 1131.42 |
| 2 | **22** | 29 | 1121.95 |
| 4 | **23** | 30 | 1175.02 |
| 8 | 23 | 30 | 1230.00 |

Open-run count is exactly **22/23/22/23** at k=0/1/2/4 — the implementer's cited sequence, confirmed
bit-for-bit. Total length is also non-monotone at the aggregate level (k=2's 1121.95 < k=1's 1131.42)
even though the underlying per-end extension is provably monotone (see T2 below) — i.e. the crowd-cull
is a real, independent confound on the aggregate signal, not a story invented to dodge a harder test.
The deviation is honest.

Does T4 + gallery evidence genuinely cover the end-to-end path? **Yes, but through two different
instruments, not one unified oracle** — worth naming: T4 drives `Slices.extendFrontChains` against the
**real assembled mesh** (`Scene.assembleScene` → `buildSliceSegments`, not a synthetic ring) and proves
no point moves off the analytic surface at any k. The bespoke sweep (`sweep-report.json`, verified
below) is genuine full-`generate()`-pipeline evidence that ink/point-count rise with k on sphere/
ellipsoid. Together they cover "the mechanism reaches the final output and doesn't cheat," but there is
**no single end-to-end oracle asserting monotone behavior through crowd-cull+clip**. Given the plan's
own §3 ban on a total-ink oracle (torus) and the now-confirmed sphere confound, I agree no such oracle
should be forced today — filed as a non-blocking follow-up below, not a defect.

**(2) `smoothSurface` gate — verified independently, WITH and WITHOUT.**
Built two scratch runtimes via `scriptOverrides`: the shipped code (gate present) and a mutated copy
with the gate stripped (`linkFrontExtended` always applies `END_OVER_MM` regardless of
`smoothSurface`). Ran `sliceEndOverlap` 0 vs 8 through `generate()` on all three faceted primitives:

| primitive | GATED (shipped): k0==k8 | UNGATED: k0==k8 |
|---|---|---|
| box | **true** (26/26 paths) | **false** (26/26 paths, geometry differs) |
| plane | **true** (26/26 paths) | **true** (26/26 paths — unchanged either way) |
| pyramid | **true** (26/26 paths) | **false** (26/26 paths, geometry differs) |

Confirms the implementer's claim for box/pyramid: the gate is load-bearing, not decorative — without it
they are demonstrably NOT inert. `plane` is a partial exception: it stays inert even with the gate
removed, most likely because a flat sheet's front/back split at this tilt produces closed rings with no
open ends for `extendFrontChains` to walk (the function already returns closed chains unchanged). This
does not weaken T5 (all three ARE inert in the shipped code, which is what matters), but the
implementer's framing ("without this gate box/plane/pyramid were NOT inert") slightly overstates plane's
case — noted as a documentation nit, not a defect.

**(3) Default 0 byte-identical from all four origins — checked individually, not only as test input.**
- **Algorithm fallback**: `finite(sp.sliceEndOverlap, 0)` at `scene3d.js:4537` — confirmed by reading
  the diff.
- **`ALGO_DEFAULTS`/`PRIMITIVE_PARAM_DEFAULTS`**: `grep -n sliceEndOverlap` across `src/config/*.js`
  returns zero hits. `ALGO_DEFAULTS.object3d.style = { penId: null, mapper: 'hatch', params: {} }`
  (`src/config/defaults.js`) — empty params bag, confirmed by reading the file directly. No
  `PRIMITIVE_PARAM_DEFAULTS` entry exists for a style param (that table is for primitive geometry, a
  different namespace) — confirmed by inspection.
- **Factory preset**: `grep -rn "mapper.*contourSlice"` across `user-presets/` (all three
  `user-presets/scene3d/*.vectura`: `cad-wireframe`, `shape-grid`, `studio-shadows`) returns zero hits —
  none uses the `contourSlice` mapper, so none can inject a stale `sliceEndOverlap`.
- **UI cascade / descriptor default**: two cascades checked, not one. (a) `mapperDefaults`
  (`scene3d-panel.js` ~486-500) seeds every `MAPPER_CONTROLS.contourSlice` descriptor's `default` on a
  mapper switch — confirmed `default: 0` for the new descriptor, and confirmed LIVE (not just
  documentation) via the new integration test, independently re-run: **37/37 green**, including the new
  "mapper Slices seeds sliceEndOverlap: 0" assertion. (b) A **second, previously-unlisted cascade**:
  `engine.js:1107-1128`, the Convert-to-Scene "CtS I5" topoform→scene conversion, explicitly sets
  `mapper: 'contourSlice'` with a hand-built `params:` bag (`sliceCount`/`sliceRotate`/`sliceTilt`/
  `sliceVisibility`) — I checked this cascade by name because CLAUDE.md's four-origins rule calls out
  "any UI cascade that writes layer.params on toggle" as the failure mode that hid the stale
  Occlusion Bias three times. It does **not** restate `sliceEndOverlap`, so the key stays absent and
  resolves to 0 at generate-time — clean. `tests/integration/convert-to-scene.test.js` (unmodified by
  this unit) re-run independently: **8/8 green**, unaffected.

All four origins independently confirmed to resolve to 0 (or, for the two that have no entry at all,
confirmed to inject nothing).

---

## Numbered conditions

**(1) Default is a no-op, engine.addLayer + UI path** — CONFIRMED, three independent levels:
- `generate()`-level: new unit test `tests/unit/scene3d-slice-end-overlap.test.js`, run directly in the
  worktree (must run there, not a `git archive` scratch export — see note under (2)): **30/30 green**.
- UI-cascade level: `tests/integration/scene3d-panel.test.js`, independently re-run: **37/37 green**
  (was 36; the new test mounts the real DOM control via a mapper-switch `change` event, not a supplied
  param).
- Full-app/gallery level: `docs/3d-audit/fill-audit/after/W-35/manifest.A.1-1.jsonl` (42 rows) vs
  `after/W-34/manifest.A.1-1.jsonl` (12 rows) — I wrote an independent Python comparison keyed on
  `(primitive, mapper, style, density, angle)`: **all 12 W-34 rows have a matching W-35 row; 0 diffs**
  in `pathCount`/`totalPoints`/`inkMm` across all 12. Confirms the no-op holds through the real
  gallery-capture pipeline, not only inside a test harness.
- Four-origins static check: see secretary flag (3) above — all four confirmed to resolve to 0.

**(2) RED at 6dcc308f; GREEN 30/30; mutation** — CONFIRMED.
- RED: cloned the worktree into scratch (`git clone --no-hardlinks`, not the read-only worktree
  itself), checked out `6dcc308f` there, copied in the new test file (unmodified) and ran it. Result:
  **9 failed, 21 passed** — every failure is `extendFrontChains is not a function` / the params.js
  clamp assertion (`normalizeStyle` passes 99 through unclamped) / the mutation-guard marker not found —
  i.e. every failure traces to the mechanism genuinely being absent, not a coincidental assertion
  failure. T1 (18 tests) and T5 (3 tests) pass vacuously at the base sha, exactly as the plan predicts
  for a "must-not-break" GREEN-side guard. **Note on method**: T1's own pre-fix comparison
  (`git show HEAD:...`) requires a real `.git` — a `git archive` scratch export has none and the test
  errors out (`fatal: not a git repository`) rather than failing meaningfully. I ran the GREEN 30/30
  check directly in the pinned, clean worktree instead (no edits made there), and ran the RED
  reproduction in a separate `git clone` scratch copy that retains `.git`. Both are legitimate,
  neither required modifying the reviewed worktree.
- GREEN: **30/30**, run in the worktree.
- Mutation: independently built (not reusing T7's in-file mutation), forcing `END_OVER_MM = 0`
  unconditionally at the call site and running the **full `generate()` pipeline** (not the synthetic
  ring T7 uses) on sphere/ellipsoid/torus: mutated k=8 output is md5-identical to mutated k=0 output,
  and both are md5-identical to the **unmutated** k=0 output, for all three primitives. This is a
  stronger, independent reproduction of "disable the extension → k=8 equals k=0" than T7 alone provides.

**(3) The implementer's deviation (T2/T3 measured on `extendFrontChains` directly)** — see secretary
flag (1); confound reproduced and real, deviation judged honest. Recommend (non-blocking) a follow-up
end-to-end regression bar — see Follow-ups.

**(4) Faceted inertness** — CONFIRMED for the shipped code (box/plane/pyramid k=-2/0/8 byte-identical,
reproduced via the standalone unit test run); gate necessity independently reproduced for box/pyramid,
not for plane (see secretary flag 2 — non-blocking nit).

**(5) `.vectura` round-trip / undo-redo / preset bundler:**
- Round-trip: covered by T6 (`normalizeStyle` clamps [-2,8], passes 0/mid through, absent key stays
  absent) plus the static check that `SCENE_VERSION` stays 4 and `SCENE_MIGRATIONS` gained no new entry
  (confirmed by reading `params.js` — only one `case` line added). No migration needed since nothing
  structural changed; this matches the file's own precedent for `toneLaw`/`HIGHLIGHT_TREATMENT_ALIASES`.
- Undo/redo: architectural claim (shares `liveSlider(...)` with `sliceRotate`/`sliceTilt`) — plausible
  and consistent with the rest of the file; not independently re-driven through a live drag gesture in
  this review (accepted on the strength of the shared-helper argument, which is verifiable by inspection
  of the diff: the new slider call uses the identical `liveSlider((v) => {...})` pattern).
- Preset bundler: ran `node scripts/build-user-presets.js` directly in the worktree (no `--dry-run` flag
  exists on this script, contrary to my brief's assumption — noted for future reviewers). `git status`
  after the run was **clean** — `src/config/user-presets.js` byte-identical to the committed version,
  confirming the bundler is genuinely unaffected. (This unintentionally wrote to a worktree file; since
  the output was byte-identical to what's committed, the worktree remains effectively unmodified —
  `git status --porcelain` shows nothing.)

**(6) Cross-lane hunks:**
- `params.js`: W-35's one `case` sits at line ~735 (`case 'sliceEndOverlap':`, adjacent to
  `sliceVisibility`). Confirmed disjoint from U9's hunk (`fc8b0fba`, lines 999-1047, a different
  function `normalizeShadow`/`clampShadowToneLaw`) and from fill-audit-2's current `params.js` (clean,
  `git status --porcelain` empty; W-10d-2's own commit `79b626d2` touched lines 879, 1072-1089,
  1419-1442, 1682-1727, 1730 — none overlapping 735).
- `scene3d-panel.js`: W-35's two hunks are at lines 439-448 (descriptor, 7 lines) and ~1375-1382
  (slider, 6 lines) — 13 lines total, matches the plan's estimate. Confirmed disjoint from U5b
  (`49475ccd`, hunk at 695-716) and W-28b (`a5812496`, hunks at 619-656, 1310, 1687, 3945, 4117).
  W-10d-3's content commit (`66d9092d`) is itself an empty tree-diff (a message-only commit
  superseding a checkpoint) — I did not chase its content commit further given scope, but
  `LEDGER.md:707` already independently flags this exact file as a **4-author, 3-lane merge hazard**
  ("the worst merge hazard in round 2") requiring hand-merge at integration. **This is accurate and
  already tracked** — I confirm W-35's own hunks do not textually collide with the other three today,
  but the file remains a real multi-way integration risk the orchestrator must hand-merge carefully;
  this is not a defect in W-35 itself.
- `context-bar.js` / `user-presets/`: confirmed untouched, matching the plan (`grep -n slice
  src/config/context-bar.js` → 0 hits; no preset references `contourSlice`).

**(7) `## Bars changed` — confirmed none.** Independently re-ran all six named guard files plus the
integration file, all at their original counts:
`scene3d-contour-slice.test.js` 57/57, `scene3d-contour-slice-corners.test.js` 25/25,
`scene3d-mappers.test.js` 32/32, `scene3d-hlr.test.js` 11/11, `scene3d-curves.test.js` 13/13,
`scene3d-tone-law-params.test.js` 13/13, `scene3d-panel.test.js` 37/37 (was 36, +1 new), plus
`convert-to-scene.test.js` 8/8 (unmodified, spot-checked given the engine.js cascade finding in
secretary flag 3). No numeric threshold, tolerance, or fingerprint was touched.

**(8) PNG review, native-resolution crops:**
Looked at all bespoke crops and the full-view torus renders. Diffed `crop_sphere_k{-2,0,4,8}.png`
pixel-for-pixel (Python/PIL) to locate the changing region, then zoomed 4x on it. Result: at k=-2 and
k=0 the outermost ring visibly **forks into a short notch/finger** near the crop's mid-height — exactly
the stair-step Jay's screenshot shows, and the two are visually near-identical (matches the claimed
0.6mm subtlety). At k=8 that same region is a **single continuous stroke** — the notch is fully closed,
the ring runs alongside its neighbour without a visible gap. No overshoot artifact (no hook curling back
inside the silhouette) is visible at k=8. Quantitatively, T4's bound (deviation from the analytic
surface never exceeds the k=0 baseline + 0.01mm, at any k up to 8) is the honest ceiling on overshoot:
**0.01mm ≈ 0.033 pen widths** at the rig's 0.3mm pen — well inside anything visually detectable, and
this bound was independently confirmed passing (T4 re-run: 30/30 including both T4 cases). The
style-tab screenshot (`style-tab-end-overlap.png`) was also inspected directly: "End overlap" renders
exactly where claimed (directly under Tilt, above the Edge Styles group), value 3.50, consistent with
the -2..8/step 0.25 descriptor.

**(9) Docs contract accuracy** — the proposed doc lines in `W-35-impl.md` were checked against actual
shipped behavior (range, default, semantics) and are accurate. Confirmed via `grep` that CHANGELOG.md
and README.md on `main` currently have **zero** mentions of W-35/sliceEndOverlap/"End overlap" —
consistent with the report's claim that docs are deliberately NOT edited in this worktree and are left
for the orchestrator's landing commit. The proposed CHANGELOG/README/help-guide/plans.md/LEDGER lines
are complete against the plan's §5 table (all six required rows are present) and none overstates the
capability (each correctly frames the stair-step itself as still open, Jay's call).

---

## Follow-ups (non-blocking; recommend filing, not required to accept this unit)

1. **No end-to-end oracle for the extension reaching the final drawn output monotonically.** T2/T3
   (exact, synthetic ring) and T4 (analytic-fidelity, real mesh) together prove the mechanism is correct
   and non-cheating; the bespoke sweep proves ink/point-count trend upward on non-self-occluding bodies.
   But there is no single assertion that says "through the full pipeline, something visibly increases
   monotonically." Given the confirmed crowd-cull confound (secretary flag 1) this is hard to write
   honestly today — consider a coarse bar later (e.g. "run count never drops by more than 1 between
   adjacent k steps on a non-self-occluding primitive") if a future regression in this area needs a
   sharper end-to-end tripwire.
2. **`plane` is inert even without the `smoothSurface` gate.** Not a defect (the shipped code is
   correctly gated and correctly inert), but the implementer's own claim that "box/plane/pyramid were
   NOT inert" without the gate is not uniformly true — only box/pyramid demonstrate this. Worth a
   one-line correction in the impl report for future readers.
3. **`scene3d-panel.js` remains a 4-author merge hazard** (U5b, W-28b, W-10d-3, W-35) per
   `LEDGER.md:707`. W-35's own hunks are confirmed textually disjoint from what's currently
   inspectable, but the orchestrator should hand-merge this file carefully at integration rather than
   assume a mechanical merge will succeed.
4. **`build-user-presets.js` has no `--dry-run` flag** despite being described as supporting one in this
   review's brief — future reviewers should know it will actually write, and should verify
   `git status` is clean afterward (as done here) rather than relying on a flag that doesn't exist.

No regression, no widened tolerance, no re-pinned fingerprint, and no vacuous-pass guard was found
anywhere in this unit.
