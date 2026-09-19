STATUS: NOT-VERIFIED

# T3c-onset LIGHT VERIFY — round 5, lane fill-audit-a5

**Role:** verifier (read-only). **Unit:** `T3c-onset` (tests-only). **Worktree (read-only):**
`.claude/worktrees/fill-audit-a5` at `00e9bc7d`, base `6ebc76e8`. **Scratch:**
`/private/tmp/claude-501/scratch-T3c-verify/{export,gitclone}` (both deleted after use, per protocol —
never edited/stashed the worktree itself).

## 1. RED reproduces — MEASURED

This is a characterization pin, no pre-fix src tree (`src/` untouched). The relevant "RED" is: does the
new file even run outside an environment with usable git history? It does not.

- `git -C .claude/worktrees/fill-audit-a5 archive 00e9bc7d | tar -x -C .../scratch-T3c-verify/export`
  (protocol's prescribed method) produces a tree with **no `.git` directory**. Running
  `npx vitest run tests/unit/scene3d-mkdashramp-onset.test.js` there: **0/27 (27 skipped), suite FAIL** —
  `Error: Command failed: git show 75777240:src/core/scene3d/surface-fill.js` / `fatal: not a git
  repository (or any of the parent directories): .git`.
- In a **full** scratch clone with git history present (`git clone --local` of the worktree, checked out
  to `00e9bc7d`, `node_modules` symlinked), the file reproduces the report's own claim: **GREEN, 27/27**,
  9.7s. Numbers match the report's table exactly (spot-checked sphere/addLayer d=31 ratio 0.564317,
  d=32 ratio EXACTLY 1.0 and md5-identical, both independently reproduced).

So "RED reproduces" is true only in the narrow "would the mutation flip a currently-passing assertion"
sense (see §2) — the file's actual dependency on git history is a real environmental fragility, not a
false claim in the report (the report does say GREEN was reproduced via `git clone --local`, not
`git archive`, for exactly this reason, at line 27-31 of the impl report). Flagged fully under §3 below,
because it is disqualifying for this project's actual CI.

## 2. The mutation trips — MEASURED, independently reproduced

In the full-history scratch clone (`00e9bc7d`), directly mutated `src/core/scene3d/surface-fill.js` on
disk (M1: `Math.round` → `Math.floor` at line 2535, bypassing the test file's own internal mutation
harness entirely) and probed with a standalone script (`loadVecturaRuntime` against the mutated disk file
vs. the pre-T3c baseline, same metric the test uses):

```
sphere d=31: md5-identical-to-uncapped-baseline=false  ratio=0.564317   (matches real-fix d=31 exactly)
sphere d=32: md5-identical-to-uncapped-baseline=false  ratio=0.523055   (real fix: TRUE / ratio 1.0 — DIVERGES under M1)
torus  d=31: md5-identical-to-uncapped-baseline=false  ratio=0.561778   (matches real-fix d=31 exactly)
torus  d=32: md5-identical-to-uncapped-baseline=false  ratio=0.535076   (real fix: TRUE / ratio 1.0 — DIVERGES under M1)
```

Confirms: under M1, d=32 is **still active** (ratio ~0.52-0.54, not 1.0) — the O17 "d=32 bound is
inactive, md5-identical" assertion would fail (go RED) exactly as the report claims, and d=31 is
unaffected (matches the real fix, consistent with the report's own "O18 floor unguarded" disclosure).
Restored the file (`git diff --stat` empty afterward) and reran the full suite: GREEN, 27/27, confirming
restoration.

Also reran the file's **own internal** M1/M2/M3 mutation-kill block (all 3 tests, all 4 fixtures each) as
committed — 3/3 pass, matching the report.

**Guard files rerun in the foreground, matching the report's numbers exactly:**

| file | result | report claim |
|---|---|---|
| `scene3d-mkdashramp-onset.test.js` | 27/27 | 27/27 |
| `scene3d-mkdashramp-discrete.test.js` | 22/22 | 22/22 |
| `scene3d-mkdashramp-single-pass.test.js` | 20/20 | 20/20 |
| `scene3d-mkdashramp-low-end.test.js` | 13/13 | 13/13 |
| `scene3d-mkdashramp-dark-end.test.js` | 4/4 | 4/4 |
| `scene3d-mark-laws-draw.test.js` | 30/30 | 30/30 |

All run singly, `--pool=forks --poolOptions.forks.singleFork=true`, foreground, none exceeded 30s.

## 3. `## Bars changed` accuracy — ACCURATE, but a disqualifying undisclosed CI risk found

`git diff 6ebc76e8 00e9bc7d` touches exactly 3 files: new `scene3d-mkdashramp-onset.test.js` (311 lines,
all new), and comment-only additions in `scene3d-mkdashramp-discrete.test.js` (+14) and
`scene3d-mkdashramp-single-pass.test.js` (+16). Read both diffs in full: **zero assertion, `describe`, or
`test` lines touched** in either existing file — matches the report's "Bars changed: None" exactly. O19's
docstring correction is accurately described.

The disclosed **"O18 floor unguarded"** item: independently confirmed honest, not just claimed. My own
M1 disk-mutation probe (§2) shows d=31 unaffected by the mutation while d=32 diverges — exactly the
asymmetry the report describes. Correctly and prominently disclosed in the report, the file's own
docstring, and the commit body.

**Disqualifying finding — git-history / shallow-clone dependency (not disclosed in the report):**

The new file's `getPreT3cSource()` calls `execFileSync('git', ['show', '75777240:...'])` — a fixed,
old commit SHA, same pattern as the two sibling files it edits. This **fails under CI's actual shallow
clone**, verified two independent ways:

1. Local repro: `git clone --depth 1 --branch main file:///…/vectura-studio shallow-test` (matches
   `actions/checkout@v7`'s default `fetch-depth: 1`, which `.github/workflows/test.yml` does not override
   on any of its jobs), then `git show 75777240:src/core/scene3d/surface-fill.js` inside it →
   `fatal: invalid object name '75777240'` (reproduced, "GIT SHOW FAILED (as expected under shallow
   clone)").
2. Live evidence: `gh run view 35454205820 --log-failed` (the actual "Tests" workflow run on `main`,
   already completed with status **failure**) shows, verbatim: `fatal: invalid object name '75777240'`,
   `fatal: invalid object name 'b43fa4e3'`, plus 8 other pinned SHAs across the same test family — the
   **exact SHA this new unit's file uses** is one of the currently-failing objects in CI right now.

This pattern (`execFileSync('git', ['show', '<fixed-sha>', ...])`) is **not new to this unit** — it
already existed in 11 other `tests/unit/*.js` files, including the two files this unit edits, before
`00e9bc7d`. Main's CI ("Tests" workflow, `unit` job) is confirmed already broken by it independent of this
change. So this is a pre-existing, systemic defect, not a regression this unit introduced. But the unit's
own brief and the reviewer's checklist explicitly require confirming new tests don't depend on git history
under a shallow CI clone, and this new file **adds a 13th instance of the same failure mode** without
disclosing, testing around, or flagging the risk anywhere in the report. The report's own "GREEN, 27/27"
claim (impl report line 33, and the commit body) is true only in an environment with git history present
(the lane worktree, or a full clone) — it has never been true, and cannot be true, in the project's actual
CI environment as configured today.

## Verdict

**NOT-VERIFIED.** §1 and §2 hold up under independent, hands-on reproduction — the report's numbers,
mutation-kill claims, and O18 disclosure are all honest and match exactly. §3's numeric-bars claim is also
accurate. But the explicit git-history/shallow-clone check fails: the new file cannot pass in CI as
configured (`actions/checkout@v7`, default depth 1, no `fetch-depth: 0` override anywhere in
`.github/workflows/test.yml`), confirmed against a real shallow clone locally and against a live, already-
failing GitHub Actions run on this exact repo. This is a pre-existing pattern across ~12 files, not unique
to T3c-onset, but the new unit propagates rather than avoids or flags it, and the report never mentions
CI/shallow-clone risk. Recommend: before this merges, either (a) file a fix (fetch full history in the CI
checkout step, or rework `getPreT3cSource`/sibling helpers to bundle the pre-fix source as a checked-in
fixture instead of `git show <sha>`), filed as its own unit since it's systemic, not scoped to this file
alone, or (b) explicitly accept and disclose the known-broken CI state as a call for Jay.

REPORT docs/3d-audit/lane-reports/T3c-onset-verify.md — NOT-VERIFIED — new file's `git show <sha>` fails under CI's real shallow clone (confirmed live).
