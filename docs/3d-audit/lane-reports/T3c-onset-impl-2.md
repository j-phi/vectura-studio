STATUS: DONE

# T3c-onset implementer — follow-up 2, round 5, lane fill-audit-a5

Follow-up to `T3c-onset-impl.md` (commit `00e9bc7d`), addressing `T3c-onset-verify.md`'s **NOT-VERIFIED**
finding: the new file's `getPreT3cSource()` called `execFileSync('git', ['show', '75777240:...'])`, which
fails under CI's real shallow clone (`actions/checkout@v7`, default `fetch-depth: 1`) — verified live
against a failing GitHub Actions run on main.

- **Worktree:** `.claude/worktrees/fill-audit-a5` · **branch** `3d-scene/fill-audit-a5` · **base sha**
  `00e9bc7d` · **new sha** `b1ab9ebd`.
- **File touched:** only `tests/unit/scene3d-mkdashramp-onset.test.js` — the two sibling files
  (`scene3d-mkdashramp-{discrete,single-pass}.test.js`) were NOT edited further, per the orchestrator's
  instruction (a separate CI-5 unit owns their own instance of the same pre-existing defect class,
  already documented as a systemic ~12-file issue in `T3c-onset-verify.md` §3).
- `git status --short -- . ':!graphify-out'` showed only this file, clean, both before and after.

## What changed

Replaced `getPreT3cSource()` (fixed-sha `git show`) with `getT3cNeutralizedSource()` — the SAME pattern
`R4-fix` (`ff37531d`) already used in items 1-2 of that commit, in the very two sibling files this unit
edits: build the comparison ("uncapped") tree by reading the CURRENT on-disk source
(`fs.readFileSync(SF_REL_PATH)`, no git, no `/private/tmp` path, no skip condition) and reverting ONLY
T3c's own `eachDrawn` gate via a needle-checked string replacement (`buildMutant`, the same helper M1/M2/M3
already used). This is NOT the "pinned golden signature" pattern from R4-fix item 3 (that pattern fits a
single spliced-block comparison; this file needs a full alternate-runtime comparison across 8 density
cells x md5 + ratio, which a live-computed reverted-mutant tree handles more directly and without a
hardcoded-hash maintenance burden).

Why this is a valid, even improved, substitute: it isolates "T3c's own contribution" MORE precisely than
the historical sha ever did, since it cannot be confounded by unrelated drift between `75777240` and
HEAD — exactly the class of defect `R4-fix` item 1 found and fixed once already (W-32 Rank 4's silhouette
refinement moved the T4b ink fixture between the two trees, unrelated to T3c).

## Numeric equivalence — verified before swapping

Ran both techniques (`getPreT3cSource()` via `git show` AND `getT3cNeutralizedSource()` via the reverted
mutant) side by side in a throwaway probe script (deleted after use) at d=31/d=32, all four fixtures:
identical to 6 decimal places on every cell.

| fixture | d=31 ratio (git-show) | d=31 ratio (neutralized) | d=32 md5-eq (both) |
|---|---|---|---|
| sphere/addLayer | 0.564317 | 0.564317 | yes |
| torus/addLayer | 0.561778 | 0.561778 | yes |
| sphere/create | 0.546621 | 0.546621 | yes |
| torus/create | 0.553640 | 0.553640 | yes |

No numeric finding changed. No bar changed. Only the mechanism that produces the comparison tree moved.

## RED / GREEN

- **GREEN, foreground, lane worktree:** 27/27, 9.36-9.76s (two runs, before and after the commit).
- **GREEN, foreground, real shallow clone (the actual CI repro):**
  `git clone --depth 1 --branch 3d-scene/fill-audit-a5 file:///…/fill-audit-a5 /private/tmp/claude-501/scratch-T3c-onset-2`,
  symlinked `node_modules`, ran the file: **27/27**, 9.94s. Confirmed the clone genuinely lacks the old
  sha first: `git cat-file -t 75777240` inside the shallow clone returns `fatal: Not a valid object name
  75777240` — the exact failure class `T3c-onset-verify.md` reproduced live against GitHub Actions.
  Deleted the scratch clone after use.
- **Guards rerun in the foreground (both sibling files, unaffected by this follow-up):**
  `scene3d-mkdashramp-discrete.test.js` 22/22, `scene3d-mkdashramp-single-pass.test.js` 20/20 (42/42
  combined run) — zero assertion edits, as before.

## `## Bars changed`

None. No assertion, `describe`, or `test` literal changed in this follow-up — verified by
`git show b1ab9ebd --stat` (1 file, 53 insertions/30 deletions, all inside comment blocks and the
`getPreT3cSource`/`getT3cNeutralizedSource` helper swap + the one `beforeAll` line pointing at the new
helper). The O17/O18/mutation-kill/floor-disclosure test bodies themselves are byte-identical to
`00e9bc7d`'s version — only the helper functions above them changed.

## Pre-existing red

None observed in this file or its guards. The systemic ~12-file `git show <fixed-sha>` pattern
`T3c-onset-verify.md` found (already breaking main's CI independent of this unit) remains open — not this
unit's file anymore, but still present in the two sibling files and ~9 others project-wide. Flagging again
for the orchestrator: this follow-up fixes only the ONE file this unit owns; a `CI-5`-class unit (per the
orchestrator's own framing) is needed to sweep the rest, including the two `scene3d-mkdashramp-*` siblings
this unit is now forbidden from touching further.

## Cleanup

Deleted the scratch shallow clone (`/private/tmp/claude-501/scratch-T3c-onset-2`) and the throwaway probe
scripts used to verify numeric equivalence before encoding the swap. Never started a server on 8471.

REPORT docs/3d-audit/lane-reports/T3c-onset-impl-2.md — DONE — git-show dependency removed; 27/27 green in a real `--depth 1` shallow clone.
