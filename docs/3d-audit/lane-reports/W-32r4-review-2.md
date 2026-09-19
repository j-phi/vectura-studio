STATUS: ACCEPT

# W-32 Rank 4 — re-review of the W-32r4c re-pin follow-up (border-4, lane HEAD `5d8574da`)

**Scope.** Light, three-condition re-review after the original `W-32r4-review.md` REJECT (three
undisclosed-red pinned-hash guard files over curved primitives: `scene3d-facet-min-rulings`,
`scene3d-box-density-bearing`, `scene3d-mktick-wedge`). Read-only in
`.claude/worktrees/border-4` (never edited/stashed/checked out; `git status` confirms clean
throughout). Scratch export of lane HEAD `5d8574da` under
`/private/tmp/claude-501/scratch-W32r4c/{pre,post}` (`pre` = `git archive b43fa4e3`, `post` =
`git archive 5d8574da`), `node_modules` symlinked from MAIN, Node v20.20.2, package.json 1.4.2 in
both. Two throwaway probe copies (`probe-facet`, `probe-mktick`) used only to substitute OLD
goldens back into the `post` source and confirm RED; both deleted immediately after use. The
entire scratch tree (`/private/tmp/claude-501/scratch-W32r4c/`) was deleted at the end of this
review. All vitest runs foreground, `timeout: 600000`, one file (or a small explicit list) per
command; no `run_in_background`, no Monitor.

## Condition 1 — the three named files are GREEN on lane HEAD, and the re-pins are proven — PASS

**GREEN, with counts, exit 0 on each:**
- `scene3d-facet-min-rulings.test.js`: **79/79** (was 67/79 at the REJECT).
- `scene3d-box-density-bearing.test.js`: **4/4** (was 3/4).
- `scene3d-mktick-wedge.test.js`: **58/58** (was 50/58).
- Combined single run of all three: **141/141**, matching the commit body's own "21 failed → 141/141"
  claim (12+1+8 = 21).
- The one recurring `[vitest-worker]: Timeout calling "onTaskUpdate"` unhandled-error line is the
  documented pre-existing shared-machine RPC noise (`ROUND3-RESUME-BRIEFS.md` §0b); exit code was 0
  on every run.

**Re-pin proof reproduced independently (not copied from the report):**
- `scene3d-facet-min-rulings`: substituted the 12 OLD `sphere` hashes (from `git diff
  fe5d67bf..5d8574da`) into a throwaway copy of the `post` source and reran — **12 failed / 67
  passed (79)**, exactly matching the review's original count. The file's own contrast/mutation
  proof, **T10 — mutation guard (non-vacuity)** ("forcing the floor back to the bare literal breaks
  T2/T3"), still trips (passes) on the real re-pinned `post` tree — confirmed in the full 79/79 run.
- `scene3d-mktick-wedge`: substituted the 8 OLD `sphere`/`cone` hashes into a throwaway copy —
  **8 failed / 50 passed (58)**, exactly matching. The file's own real-render contrast proof
  (**MUTATION-KILL 2**, `shipped (staggered) < no-stagger mutant`, both rigs/all six cells) still
  passes on the real re-pinned `post` tree — confirmed in the full 58/58 run.
- Both probe copies deleted immediately after use; no residue.

## Condition 2 — the pinned-hash/golden grep over curved primitives is complete — PASS

Ran my own independent grep against the `post` export (not the report's script): (a) every file
requiring `path-signature`/using `pathSignature`/`md5PathsAll`/`fingerprint(`/`createHash`, and
(b) every file with a `toBe('<hex-ish>')` or `EXPECTED`-map-style literal, both intersected against
mentions of `sphere`/`cone`/`cylinder`/`ellipsoid`/`capsule`. This surfaced 16 candidates, a
*superset* of the report's own list — it additionally flagged
`scene3d-fill-style-picker.test.js`, `scene3d-geometry-controls.test.js`,
`scene3d-faceted-tone-law.test.js`, `scene3d-solid-cap-reachability.test.js`, and
`scene3d-tone-quant-flow-live.test.js`, none of which appear in the report or commit body.

Inspected each: none pins a fixed literal golden over a curved primitive — `EXPECTED_CONTROLS` in
`scene3d-geometry-controls.test.js` is a UI-control-list map, not geometry; the `md5`/`fingerprint`
compares in the other four are all **self-referential** (`expect(x.md5).toBe(base.md5)` /
`expect(fingerprint(a)).not.toBe(fingerprint(b))`), which cannot go stale from a legitimate geometry
move because both sides are computed live. Ran all five anyway, per the "run any file the grep
finds that the report does not list" instruction: **47/47** (`scene3d-faceted-tone-law`,
`scene3d-solid-cap-reachability`, `scene3d-tone-quant-flow-live`, `scene3d-geometry-controls`
batched) plus **177/177** (`scene3d-fill-style-picker.test.js`, the large integration file) — all
green. Also checked for `toMatchSnapshot`/`__snapshots__` usage in `tests/unit`+`tests/integration`
(none — only the unrelated `tests/e2e/visual.spec.js-snapshots`) and for the exact
`toBe('<hex>:<digits>')` fingerprint pattern (only `scene3d-box-density-bearing.test.js`, already
covered). No other red or undisclosed pinned-hash file over a curved primitive exists on lane HEAD.

## Condition 3 — `## Bars changed` / commit body / boundary-ends / overshoot — PASS

- `W-32r4-impl.md`'s `## W-32r4c re-pins` → `## Bars changed` and the `5d8574da` commit body's own
  `## Bars changed` section list the same three files, the same old→new values (verified byte-for-
  byte for `scene3d-box-density-bearing.test.js`: `6c237f90:23012`/`3dc1b467:55668` →
  `56fa048b:29028`/`5ea7a962:61684` in both), and the same reasoning (pinned fingerprint hashes the
  whole `scenePaths` output; unaffected primitives/torus independently re-derived and confirmed
  unmoved) — no discrepancy between report and commit.
- `git diff fe5d67bf..5d8574da --stat` touches exactly the three named test files (55 insertions,
  22 deletions) — `tests/unit/scene3d-fill-boundary-ends.test.js` (W-32r4b) is **not** in the diff.
  Independently confirmed with `diff <(git show fe5d67bf:…) <(git show 5d8574da:…)` → byte-identical.
  Re-ran it read-only on `post`: **49/49**, matching the commit body's claim.
- `scene3d-fill-silhouette-overshoot.test.js` (this unit's own oracle): **401/401**, still green.

## Verdict: ACCEPT

All three conditions pass with independently-reproduced counts. The lane may merge: `5d8574da`
(border-4 HEAD) closes the REJECT from `W-32r4-review.md` — the three previously-undisclosed-red
guard files are now green (79/79, 4/4, 58/58) with proven, correctly-scoped re-pins; my own
independent grep for pinned-hash/golden files over curved primitives found the same set plus five
false-positive candidates (all confirmed non-golden and green, 224/224 combined); the `## Bars
changed` sections in the report and commit body agree; `scene3d-fill-boundary-ends.test.js` is
byte-identical/untouched (49/49); and the unit's own oracle remains 401/401.
