STATUS: DONE

# U9-2 (U9's two non-blocking follow-ups) — implementer report

Lane: handoff-c2. Worktree: `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/handoff-c2`,
branch `3d-scene/handoff-c2`, port 8470. Base fc8b0fba (U9, v1.3.99) -> new commit **ed778940**.
Working tree confirmed clean (`git status --short -- . ':!graphify-out'`, `git stash list`) before
starting.

## Scope

Per the orchestrator's brief, this unit lands `docs/3d-audit/lane-reports/U9-review.md`'s two
**non-blocking** follow-ups only:

1. Move `scripts/u9-shadow-resolve-evidence.js` out of the `scripts/` root (review's Hygiene item (8)).
2. Add a floor+band guard on the folded-id shadow `shadowPathCount` delta (review's follow-up 2; bar
   shape precedent: W-26b-3/C3, `LEDGER.md` "floor+band shape adopted as prescribed", `0930cb2d`).

## (1) Script relocation

`git mv scripts/u9-shadow-resolve-evidence.js scripts/audit/u9-shadow-resolve-evidence.js`. One
relative path needed fixing: the `outDir` default was `path.resolve(__dirname, '..', 'docs', ...)`,
which resolved to the repo root only because the script lived directly under `scripts/`. From
`scripts/audit/` that same expression resolves one level too shallow (`<repo>/scripts`), so it now
reads `path.resolve(__dirname, '..', '..', 'docs', ...)`. Nothing else in the script references its
own path. Added a short comment block noting the U9-2 move and the one-line fix, per the file's own
prior commenting convention.

**Re-run proof (no evidence re-shoot needed — no rendering change, per brief):** started this
worktree's dev server (`node scripts/dev-server.js 8470`), ran the moved script in the foreground from
its new path against a scratch output directory:

```
node scripts/audit/u9-shadow-resolve-evidence.js http://localhost:8470 <scratch-dir>
```

Output: `served version 1.3.99`, `SUMMARY {"ver":"1.3.99","beforeShadowPathCount":147,
"afterShadowPathCount":151,"controlShadowPathCount":190,"afterDiffersFromBefore":true,
"controlDiffersFromBefore":true}` — **byte-identical** to the numbers already committed in
`docs/3d-audit/fill-audit/after/U9/stats.json` (`beforeShadowPathCount: 147`,
`afterShadowPathCount: 151`, `controlShadowPathCount: 190`, both `*DiffersFromBefore: true`). This is
the prescribed proof of byte-identity in place of a re-shoot. Dev server stopped and the scratch output
directory removed afterward; no PNGs were regenerated or touched in the committed
`docs/3d-audit/fill-audit/after/U9/` directory.

## (2) `shadowPathCount` floor+band guard

Added one new test to `tests/unit/scene3d-shadow-tone-law.test.js`, immediately after the existing
`HEADLINE (U9)` geomSignature-inequality test, using the same fixture (`buildShadows` helper: box
40x40x40 at (0,20,0), ground enabled, one directional light az=160/el=45/castShadows, orthographic
camera pitch=55/dist=620/focal=520/zoom=1 — all already deterministic per the file's own
"determinism" test).

**Numbers, measured 2026-09-08 against this exact fixture (script run in-repo, then confirmed via
vitest):**
- Baseline: `sPaths(buildShadows({shadowToneLaw:'ladder'})).length` = **116**;
  `sPaths(buildShadows({shadowToneLaw:'fineLadder'})).length` = **120**. `deltaAbs` = **4**
  (matches the review's independently-measured order of magnitude — their bespoke sphere+ground
  scene gave 147->151, +2.72%; this fixture gives 116->120, +3.45%, same direction/magnitude).
- **Drift envelope** (11-point sweep, unrelated perturbations only: box size +-2, sun
  azimuth/elevation +-2 deg, camera pitch +-2 deg): `deltaAbs` ranged **2-4** paths (ratio 2.52%-3.64%)
  purely from those perturbations, never from the fill recipe itself.
- **Floor**: `deltaAbs > 1` — strictly below the whole measured drift envelope (min 2), strictly above
  the mutation's failure value (0, proven below).
- **Fingerprint band**: `deltaAbs` in `[4*0.9, 4*1.1]` = `[3.6, 4.4]` — a tighter, second independent
  check around the measured baseline delta, on top of the direct `toBe(116)`/`toBe(120)` pins (this
  fixture is deterministic, so exact pins are valid; the band is the explicitly-requested "+-10%
  fingerprint band" shape layered on top).

**Proof by mutation** (per protocol — scratch export, never edited/stashed in the worktree):

```
mkdir -p /private/tmp/claude-501/scratch-U9-2
git -C <worktree> archive fc8b0fba | tar -x -C /private/tmp/claude-501/scratch-U9-2
ln -s <worktree>/node_modules /private/tmp/claude-501/scratch-U9-2/node_modules
cp <worktree>/tests/unit/scene3d-shadow-tone-law.test.js  # (post-edit, with the new U9-2 test) into the scratch export
sed -i.bak "s/shadowToneLaw: clampShadowToneLaw(src.shadowToneLaw),/shadowToneLaw: clampStyleParam('toneLaw', src.shadowToneLaw),/" \
  /private/tmp/claude-501/scratch-U9-2/src/core/scene3d/params.js   # exact one-line inverse of the U9 fix, same mutation the U9 review used
cd /private/tmp/claude-501/scratch-U9-2 && npx vitest run tests/unit/scene3d-shadow-tone-law.test.js
```

Result: **3 failing** (of 23) — the pre-existing `HEADLINE (U9)` geomSignature test, the pre-existing
params-level `U9 —` folded-id test, **and the new U9-2 guard**:

```
FAIL ... U9-2 — folded-id shadow recipe delta on shadowPathCount has a floor + fingerprint band ...
AssertionError: expected 116 to be 120
```

I.e. under the mutation, `fineLadder` collapses back to `ladder`'s own count (116 == 116, `deltaAbs`
would be 0), tripping the guard's very first assertion (the baseline pin) before the floor/band
assertions are even reached — exactly the failure mode the guard exists to catch. Scratch export
removed after the proof.

## Guard tests run (foreground, one file at a time, per protocol)

- `tests/unit/scene3d-shadow-tone-law.test.js` — **23/23 passing** (22 -> 23, +1 new U9-2 test).
- `tests/unit/scene3d-shadow-tone-law-uniqueness.test.js` — **3/3 passing**, unmodified.
- `tests/unit/scene3d-tone-law-collapse.test.js` — **54/54 passing**, unmodified. This file took ~496s
  under heavy concurrent load from other lanes' sessions (observed 24+ vitest-related processes via
  `ps aux` while it ran) and the harness auto-backgrounded the foreground command past its 120s
  wrapper timeout; it was never started with `run_in_background` or a Monitor by choice, and I waited
  for it to finish rather than proceeding without its result, per protocol. One benign
  `[vitest-worker]: Timeout calling "onTaskUpdate"` appeared in the tail of the output after all 54
  tests had already reported passing (rpc-channel teardown noise under load, exit code 0) — not a test
  failure; consistent with AGENT-PROTOCOL's "timeouts under load are not regressions" note.

## `## Bars changed`

This is a **NEW bar**, not a change to an existing one — the U9 review explicitly flagged that the
`shadowPathCount` delta (+2.72% on the implementer's bespoke scene) "has no bar of its own" before this
unit. No existing threshold, tolerance, count bar, or fingerprint elsewhere in the touched files was
widened, narrowed, or re-pinned.

- `tests/unit/scene3d-shadow-tone-law.test.js` (new test, immediately after the `HEADLINE (U9)` case,
  ~line 143 post-edit) — new bars: `ladderCount === 116`, `fineCount === 120`, `deltaAbs > 1` (floor),
  `deltaAbs` in `[3.6, 4.4]` (band). None pre-existed.

## Files touched

- `scripts/u9-shadow-resolve-evidence.js` -> `scripts/audit/u9-shadow-resolve-evidence.js` (git mv;
  `outDir` default path fixed by one extra `'..'`; comment block added).
- `tests/unit/scene3d-shadow-tone-law.test.js` — one new test (+42 lines), inserted after the
  `HEADLINE (U9)` case; nothing else in the file changed.

Diff stat: `2 files changed, 50 insertions(+), 2 deletions(-)`.

## Not touched (out of scope for U9-2)

Everything U9b named (uniqueness re-pin, `onePenDown`/`TONE_LAW_NOT_DISTINGUISHABLE` handling) — those
remain queued behind U8, unaffected by this unit. `docs/3d-audit/fill-audit/after/U9/` (PNGs,
`report.json`, `stats.json`) is untouched; only reproduced its numbers via a scratch capture, never
overwrote it.

## Commit

`ed778940` — `test(scene3d): U9-2 follow-ups — relocate shadow-evidence script, add shadowPathCount
floor+band guard` (message carries the same numbers verbatim). Working tree clean after commit
(`git status --short -- . ':!graphify-out'`). Not pushed.
