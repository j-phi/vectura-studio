STATUS: PLAN-READY

# MERGE PLAN — round 3 (three live `3d-scene/*-3` lanes → `main` @ v1.4.1)

**Written 2026-09-15 by the merge planner (Opus, read-only). Self-contained: an implementer can execute
this without reading `LEDGER.md`, `SESSION-SUMMARY.md`, `ROUND3-RESUME-BRIEFS.md` or the round-2 merge
docs. Every fact below was verified read-only with `git -C` on 2026-09-15; nothing was written, no
worktree was entered, no `cd` was used.**

> ⚠ **This plan MUST NOT pre-empt Jay's three open decisions (9-amendment, 10, 11, 12).** It ships what the
> lanes already contain, discloses the consequences in `CHANGELOG.md`, and builds nothing new. See §8.

---

## 0. VERIFIED STATE (re-verify each line before you start; all are `git -C` read-only)

| thing | value | how it was verified |
|---|---|---|
| MAIN | `6ffaf9c6` (GH-2, on top of `549b9ba9`, on top of `426cc5e4` v1.4.1) | `git -C . rev-parse HEAD` |
| `package.json` | **1.4.1** | `node -e "console.log(require('./package.json').version)"` |
| `3d-scene/fill-audit-a3` | **`c28b3490`** — 18 commits off `426cc5e4` | `git log --oneline 426cc5e4..3d-scene/fill-audit-a3` |
| `3d-scene/fill-collapse-3` | **`28cc745d`** — 9 commits off `426cc5e4` | same |
| `3d-scene/fill-audit-3` | **`141ed0b5`** — 2 commits off `426cc5e4` | same |
| `3d-scene/fill-audit-d3` | `426cc5e4` — **nothing to merge, skip it** | `git rev-parse` |
| `3d-scene/handoff-c3` | `426cc5e4` — **nothing to merge, skip it** | `git rev-parse` |
| all five `-3` worktrees | **CLEAN** — zero modified tracked files, zero untracked outside `graphify-out` | `git -C <wt> status --short -- . ':!graphify-out'` (empty for all five) |
| MAIN working tree | **DIRTY** — 5 modified + ~44 untracked docs/evidence paths (list in §1.2) | `git status --short -- . ':!graphify-out'` |
| `git stash list` | 7 entries, **none belongs to round 3** — 4 graphify-noise stashes on agent worktrees, `stash@{4}`/`{5}`/`{6}` are old `main` WIP from other efforts. **Do not touch any of them.** | `git stash list` |
| `graphify-out/` | **UNTRACKED and gitignored** (`.gitignore:14`; `git ls-files graphify-out` = 0 files) | see §2.5 — the round-2 "take either side and regenerate" rule is now MOOT |
| live dev servers | `8460` = MAIN's gallery (**DO NOT KILL**). No lane server on 8470/8475/8476/8481/8482. Two stray scratch-export servers (pids for `/private/tmp/claude-501/scratch-FWBb/post` :8461 and `/private/tmp/claude-501/scratch-T3/gitclone` :8495) — safe to kill | `pgrep -fl dev-server.js`, `lsof -nP -iTCP -sTCP:LISTEN` |

**Lane contents, for the merge-commit bodies:**

- **`fill-audit-a3` (`c28b3490`)** — T4 `a3b651f0` · W-36c `8adfd5af` · F1-placement `cd541f87` · W-36d `dcc91872` ·
  T4b `7f805654` · F1-erode `e2c3ca85` · T4c `6e1ed52f` · F1-amp `3bc61c32` · **T2-2 `9d911b05` REVERTED at
  `179d9218`** · F1-width-bar `42acff7b` · T2-3 `81925ee8` · F1-width-bar-b WIP `7d015e94` → verified `8780e97c` ·
  T3 `64b160a0` · W-31b `c28b3490`.
  **Files: `src/core/scene3d/surface-fill.js`, `src/core/geometry-utils.js`, `scripts/audit/scene3d-ribbon-width.js`,
  4 new `tests/helpers/`, 8 new + 4 edited `tests/unit/`. Nothing else.**
- **`fill-collapse-3` (`28cc745d`)** — U6 `2af329dd` · U9b+W-10d-3b+U6-2 `2b189b5f` · U7-2 `49a5ef88` ·
  U9b-2 `e10306e9` · U5b-4 `eb9707a8` · U7-2b `7d1a81ca` · **U5b-5 `28cc745d` (the CSS change)**.
  **Files: `src/config/context-bar.js`, `src/config/scene3d-tone-laws.js`, `src/core/scene3d/params.js`,
  `src/core/scene3d/shadows.js`, `src/ui/panels/scene3d-panel.js`, `src/ui/shell/context-bar.js`,
  `src/ui/skin/components.css`, `docs/tone-laws/laws.json`, `scripts/build-tone-laws.js`,
  `scripts/audit/u9b-shadow-display-evidence.js`, 8 test files.**
- **`fill-audit-3` (`141ed0b5`)** — W-38 `575f886d` · W-38b `141ed0b5`.
  **Files: `src/core/algorithms/scene3d.js`, `src/core/scene3d/params.js`, `src/ui/panels/scene3d-panel.js`,
  `tests/integration/scene3d-panel.test.js`, `tests/unit/scene3d-facet-min-rulings.test.js`.**

⚠ **`fill-audit-a3`'s HEAD WILL MOVE** — T2-3b is queued and not landed. See §9.

---

## 1. PRE-FLIGHT

### 1.1 Re-verify (run all of it; do not trust this document's shas)

```
git -C /Users/jayphi/Documents/github/vectura-studio rev-parse HEAD
git -C /Users/jayphi/Documents/github/vectura-studio status --short -- . ':!graphify-out'
git -C /Users/jayphi/Documents/github/vectura-studio stash list
for w in fill-audit-a3 fill-collapse-3 fill-audit-3 fill-audit-d3 handoff-c3; do
  echo "== $w =="
  git -C /Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/$w rev-parse HEAD
  git -C /Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/$w status --short -- . ':!graphify-out'
  git -C /Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/$w stash list
done
```

**STOP if** any `-3` worktree is dirty, or if any lane HEAD differs from §0 **other than `fill-audit-a3`
moving forward** (T2-3b). A dirty lane means an agent is still live — do not merge underneath it.

### 1.2 Commit MAIN's uncommitted round-3 docs FIRST (orchestrator's step, before any merge)

MAIN is dirty with **round-3 reports and evidence only** — no `src/`, no `tests/`. It must be committed
before the integration branch is created, so the integration branch is created off a clean, complete main.

**Modified (5):**
```
docs/3d-audit/STILL-OPEN.md
docs/3d-audit/fill-audit/after/F1-placement/report.json
docs/3d-audit/lane-reports/AGENT-PROTOCOL.md
docs/3d-audit/lane-reports/LEDGER.md
docs/3d-audit/lane-reports/SESSION-SUMMARY.md
```
**Untracked — evidence directories (11):**
```
docs/3d-audit/fill-audit/after/F1-amp/            docs/3d-audit/fill-audit/after/F1-erode/
docs/3d-audit/fill-audit/after/F1-width-bar/      docs/3d-audit/fill-audit/after/T2-2/
docs/3d-audit/fill-audit/after/T2-3/              docs/3d-audit/fill-audit/after/T3/
docs/3d-audit/fill-audit/after/U5b-4/             docs/3d-audit/fill-audit/after/U5b-5/
docs/3d-audit/fill-audit/after/W-31b/
docs/3d-audit/fill-audit/after/F1-placement/orchestrator-interlockWeave-med-before-after.png
docs/3d-audit/fill-audit/after/F1-placement/orchestrator-onePenDown-med-before-after.png
```
**Untracked — lane reports (33):**
```
F1-amp-impl.md F1-amp-review.md F1-erode-impl.md F1-erode-plan.md F1-erode-review.md
F1-placement-impl.md F1-placement-review.md F1-width-bar-b-impl.md F1-width-bar-b-verify.md
F1-width-bar-impl.md F1-width-bar-reshoot.md F1-width-bar-review.md HLR-subpen-impl.md
ROUND3-RESUME-BRIEFS.md T2-2-impl.md T2-2-review.md T2-3-impl.md T2-3-plan.md T2-3-review.md
T2-3b-moire-scout.md T3-impl.md T3-review.md T4b-impl.md T4b-review.md T4c-impl.md
U5b-4-impl.md U7-2-review.md U7-2b-U5b-5-impl.md U7-2b-U5b-5-review.md U9b-2-U5b-4-review.md
U9b-2-impl.md W-31b-impl.md W-31b-plan.md W-35b-plan.md W-36d-d5-scout.md W-36d-impl.md
W-36d-review.md tone-vacuity-sweep.md
```
plus the evidence sub-directories `T2-3-plan-evidence/`, `T2-3-review-evidence/`, `T2-3b-plan-evidence/`,
`W-35b-plan-evidence/`.

**Command — explicit paths only, never `git add -A`:**
```
git -C <MAIN> add docs/3d-audit/STILL-OPEN.md docs/3d-audit/lane-reports docs/3d-audit/fill-audit/after
git -C <MAIN> status --short --cached -- . ':!graphify-out'      # eyeball it: docs ONLY
git -C <MAIN> commit -m "docs(3d-audit): round-3 lane reports + evidence (pre-merge)"
```
The version hook **will not fire** (nothing under `src/`, `tests/`, `index.html` is staged) — confirmed by
reading `.claude/settings.json`'s PreToolUse matcher. `git status` afterwards must be clean apart from
`graphify-out`.

⚠ **`git add docs/…` will NOT pick up `shots/` inside the new `after/<W-id>/` dirs if they exist** — check
`du -sh` first; per the handoff, `after/*/shots` are **not** committed. If any new evidence dir carries a
`shots/` subdir, add the dir's contents explicitly and exclude `shots/`.

### 1.3 Kill lane dev servers — and the ones you must NOT kill

```
pgrep -fl "dev-server.js"
```
- **Port 8460 (`<MAIN>/scripts/dev-server.js 8460`) — LEAVE RUNNING.** It serves MAIN's gallery and the
  round-3 briefs pin it explicitly.
- Kill anything rooted in `.claude/worktrees/*-3` (lane ports 8470/8475/8476/8481/8482) and the two stray
  scratch-export servers under `/private/tmp/claude-501/scratch-*`. As of 2026-09-15 **no lane server is
  running**; only the two scratch ones are, and they are harmless.
- Start **one** server for the integration worktree on a free port (recommend **8490**) plus
  **`node scripts/dev-server.js 4173`** before `test:e2e` (Playwright's `reuseExistingServer`).

---

## 2. INTEGRATION BRANCH AND MERGE

### 2.1 Branch and worktree — a NEW worktree, never MAIN's tree

```
git -C <MAIN> worktree add /Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/integrate-r3 \
    -b 3d-scene/integrate-r3 main
ln -s /Users/jayphi/Documents/github/vectura-studio/node_modules \
      /Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/integrate-r3/node_modules
```
Do **not** integrate in MAIN's working tree (CLAUDE.md's checkpoint discipline: one active workstream per
worktree; MAIN is where the orchestrator works).

### 2.2 MERGE, do not rebase — and never squash

Same ruling as round 2, plus **one new round-3 reason that makes it binding rather than preferable**:

⚠ **Three round-3 test files pin a lane commit sha and read it back at runtime with `git show <sha>:<path>`:**
`tests/unit/scene3d-mkdashramp-low-end.test.js:49` (`T3_BASE_SHA = '8780e97c'`) and
`tests/unit/scene3d-ribbon-flat-field-placement.test.js:62` (`F1P_BASELINE_SHA = '8adfd5af'`), joined by the
already-merged `tests/helpers/pre-wip-surface-fill.js` (`1b157bc6`, `e047c9a7`) and five `BASE_SHA` pins from
rounds 1–2. **A rebase or a squash rewrites those shas out of existence and every one of those tests dies with
`fatal: invalid object name`.** `git merge --no-ff` keeps every lane commit reachable. **Never squash a lane.**

**Method, verbatim (hooks OFF for every git command — see §2.5):**
```
G="git -C /Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/integrate-r3 -c core.hooksPath=/dev/null"
$G merge --no-ff --no-commit 3d-scene/<lane>
#   ...inspect, resolve if anything conflicts...
$G commit -m "merge: <lane> (<units>)"
```

### 2.3 Merge order — `fill-collapse-3` → `fill-audit-3` → `fill-audit-a3`

**Computed from the actual file sets, not from ownership.** Overlap, `git diff --name-only 426cc5e4..<lane>`
intersected pairwise:

| pair | shared files |
|---|---|
| `fill-audit-a3` ∩ `fill-collapse-3` | **none** |
| `fill-audit-a3` ∩ `fill-audit-3` | **none** |
| `fill-collapse-3` ∩ `fill-audit-3` | **`src/core/scene3d/params.js`, `src/ui/panels/scene3d-panel.js`** |
| every lane ∩ `main` (`426cc5e4..6ffaf9c6`) | **none** — main moved only in `docs/` and `scripts/audit/` |

Rationale for the order:

1. **`fill-collapse-3` first.** It is the only lane touching the roster (`scene3d-tone-laws.js`,
   `laws.json`, `build-tone-laws.js`), `shadows.js`, both context-bar files and the CSS. It owns the larger
   hunk in both shared files. Landing the roster before the lane that *extends* the same panel
   (`fill-audit-3`) is the ordering that surfaced round 2's semantic conflict cheaply.
2. **`fill-audit-3` second.** Its two shared-file hunks land on top of collapse-3's, already in the tree.
   Two commits, five files — the cheapest place to discover a semantic clash in `scene3d-panel.js`.
3. **`fill-audit-a3` LAST, deliberately.** It is **provably disjoint from both other lanes** and it is the
   only lane whose HEAD will still move (T2-3b). Merging it last means a late T2-3b costs **one re-merge of
   one lane**, not a re-run of the chain.
4. **`fill-audit-d3` and `handoff-c3` are NOT merged** — both are at `426cc5e4`, zero commits. Say so in the
   merge report; do not create empty merge commits.

### 2.4 Expected conflicts — **ZERO, and this is a measured claim, not an estimate**

A read-only `git merge-tree` three-way simulation was run on 2026-09-15 at the shas in §0 (it writes no ref,
index or worktree). Conflict-marker counts:

```
git merge-tree 426cc5e4 3d-scene/fill-collapse-3 3d-scene/fill-audit-3   |  grep -c '<<<<<<<'   ->  0
git merge-tree 426cc5e4 3d-scene/fill-collapse-3 3d-scene/fill-audit-a3  |  grep -c '<<<<<<<'   ->  0
git merge-tree 426cc5e4 3d-scene/fill-audit-3    3d-scene/fill-audit-a3  |  grep -c '<<<<<<<'   ->  0
git merge-tree 426cc5e4 6ffaf9c6 3d-scene/<each lane>                    |  grep -c '<<<<<<<'   ->  0, 0, 0
```
The two "changed in both" files merge cleanly because the hunks are far apart:

| file | `fill-collapse-3` hunks | `fill-audit-3` hunks | verdict |
|---|---|---|---|
| `src/core/scene3d/params.js` | `@@ -1042,13 +1042,52 @@` (+40/−1) | `@@ -720,6 +720,11 @@` (+5) | 320 lines apart — auto-merges |
| `src/ui/panels/scene3d-panel.js` | `@@ -3263,14 +3263,46 @@` (+34/−2) | `@@ -401 @@`, `@@ -486 @@`, `@@ -1393 @@` (+22/−2) | 1870 lines apart — auto-merges |

**Files the round-2 checklist feared, and what the round-3 measurement says:**

- **`tests/unit/scene3d-tone-law-collapse.test.js` — NOT a merge hazard this round.** Checklist item 3 warned
  of a fourth author. Measured: **only `fill-collapse-3` touches it** (main's `e429cfc5` is already inside
  `426cc5e4`; neither other lane touches `tests/`-side collapse files). **No hand-merge. Zero conflicts.**
  You still re-run the file whole (§5).
- **`src/config/context-bar.js` / `src/ui/shell/context-bar.js` — NOT a hazard.** Round 2's conflict was
  collapse-2 vs fill-audit-2. Measured: **only `fill-collapse-3` touches either file.** W-38's "Min rulings"
  reaches the ctxbar through `MAPPER_CONTROLS` in `scene3d-panel.js`, not through `context-bar.js` — so
  `fill-audit-3`'s diff never opens either file. **This is a finding: the ledger's lane-ownership table
  predicted a `context-bar.js` touch from `fill-audit-3` that did not happen.**
- **`src/ui/skin/components.css` — single author.** Only `fill-collapse-3` edits any file under
  `src/ui/skin/`. **Item 26's fear that "other lanes' skin edits may reorder the cascade" is measurably
  unfounded on these three HEADs.** The e2e/visual run is still mandatory (§5.3).
- **`src/core/scene3d/shadows.js` — single author** this round (`fill-collapse-3`).

**Resolution rules if the simulation is wrong at merge time (it will be re-run; a3's HEAD moves):**

| file | rule |
|---|---|
| `src/core/scene3d/params.js` | **Union both.** `fill-audit-3` adds one `case 'facetMinRulings'` in the style-param switch (~line 720); `fill-collapse-3` adds the `penInterleave`/`penMode` block (~line 1042). Neither deletes the other's key. Any conflict here means a hunk moved — take both sides, then run `npx vitest run tests/unit/scene3d-fill-style-display-params.test.js`. |
| `src/ui/panels/scene3d-panel.js` | **Union both.** `fill-audit-3` adds `D_FACETFLOOR` to `MAPPER_CONTROLS.hatch` and `.crosshatch`, adds `'facetMinRulings'` to `persistentStyleKeys()`'s base array, and one live slider at ~1393. `fill-collapse-3` adds the U5b-4 shadow-row caveat at ~3263. **If `persistentStyleKeys()` conflicts, the base array is a UNION — `['fillDensity','fillAngle','toneLaw','facetMinRulings']` plus whatever the collapse chain adds. Never drop a key to resolve.** |
| `tests/unit/scene3d-tone-law-collapse.test.js` | Single author. If it conflicts, a lane HEAD moved — **STOP** and re-verify §0 before resolving. |
| `graphify-out/**` | **Cannot conflict — it is untracked and gitignored** (`.gitignore:14`, `git ls-files graphify-out` = 0). If you somehow see it in a conflict, something staged it by mistake: `git rm -r --cached graphify-out` and move on. |
| anything else | **STOP condition 1 (§8).** The simulation above is a fact about these shas. A new conflict means a HEAD moved or the wrong branch was merged. |

### 2.5 Hooks during the merge

- **Disable git hooks on every merge/commit command** with `-c core.hooksPath=/dev/null`. The graphify
  post-checkout hook rebuilds the graph on branch switch and the pre-commit hook rebuilds it on every commit;
  both are pure time cost now (graphify-out is gitignored, so nothing is staged), but the post-checkout hook
  has aborted checkouts in this repo before.
- **Exception — the version-bump commit (§6) must run WITHOUT `core.hooksPath=/dev/null`?** No: the version
  bump is a **Claude Code PreToolUse hook**, not a git hook, and it is unaffected by `core.hooksPath`. Use
  `-c core.hooksPath=/dev/null` there too. See §6 for why the PreToolUse hook will deliberately no-op.

---

## 3. RECONCILIATION ON THE INTEGRATED TREE

### 3.1 Tests expected RED after the merge — the complete list, with a disposition each

| test | expected | disposition |
|---|---|---|
| `tests/unit/scene3d-mktick-wedge.test.js` | **44 passed / 2 skipped / 1 FAILED** at `fill-audit-a3 @c28b3490` | 🛑 **FIX — this is a MERGE BLOCKER.** Its `:278` self-test does `execSync('git show HEAD:src/core/scene3d/surface-fill.js')`, which on any clean tree reads the *loaded* source — structurally vacuous, and here it has degraded into an outright failure. **Owned by T2-3b (queued, not landed).** Do **not** re-pin, do **not** skip, do **not** "resolve creatively". Either (a) T2-3b lands first and the file goes green (§9), or (b) merging with a red test violates CLAUDE.md's pre-commit rule and you **STOP and report**. |
| `tests/unit/scene3d-ribbon-f1b-streaks.test.js` | **44/44 GREEN** | ✅ **Verify only.** The nine F1 reds were the acceptance criteria of F1-erode (`e2c3ca85`) and F1-amp (`3bc61c32`, which closed the last two `trochoidLoop` reds); both are inside `c28b3490`. **A red here is a real regression, not an inherited one.** |
| `tests/unit/scene3d-ribbon-wall-coverage.test.js` | **36/36 GREEN** | ✅ Verify only. Same provenance. |
| `tests/unit/scene3d-mesh-self-occlusion.test.js` | **GREEN** | ✅ **No action.** Round 2 already reconciled it — the header at `:33` now reads "0 survivors — GREEN, and no longer intentionally RED". Confirmed identical on all four refs. |
| `tests/unit/text-fill-watertight.test.js` | **UNKNOWN** — header at `:21` says "EXPECTED TO FAIL until the composite fills are…" | ⚠ **CLASSIFY, do not fix.** Non-3D, pre-existing, owned by no audit unit. Run it on **unmodified `main`** first: `npx vitest run tests/unit/text-fill-watertight.test.js`. If red on main too → pre-existing, **open a W-id and record it**, do not touch it in the merge. If green on main and red after the merge → **STOP condition 2**. |
| everything else | **GREEN** | Any other red is a merge interaction. Disclose with arithmetic; never re-pin. |

**Baseline to compare against** (round-2 merge at v1.4.1, zero failures): unit **5199**, integration **1973**,
e2e **62**, visual **99**, perf **10**. Round 3 adds **9 new unit files + 1 new integration file** (listed in
§0), so unit and integration must **rise**. A **drop** in either count is a signal, not noise.

### 3.2 `## Bars changed` at merge — the standing rule

Every threshold, tolerance, count bar, pinned fingerprint **or measured population/fixture** you touch while
reconciling goes in the merge report under `## Bars changed` as `file:line — old → new — why`, **and in the
merge commit body**. Round 2 moved exactly one pin. **Budget for round 3: zero.** If `test:ci` demands a
re-pin, that is STOP condition 2 (§8) until you can prove the interaction with numbers.

### 3.3 Behaviours NO SINGLE LANE COULD TEST — six checklist items with concrete checks

Each of these is a cross-lane interaction that exists only on the integrated tree. **The round-1 and round-2
merges each found a live product defect exactly here.** Do all six.

**(a) W-38's `facetMinRulings` × T3/T4's mark-law density response on faceted primitives.**
W-38 (`fill-audit-3`) raises the ruling count a facet is granted in `faceHatchLines` (`scene3d.js`); T3
(`fill-audit-a3`) fixed the `mkDashRamp` dash count at Density 1 and T4 restored the Density-220 band. Neither
lane has the other's code. **Check:** on the integration branch, a **box** (and a **pyramid**) + `hatch` +
`mkDashRamp`, sweep `facetMinRulings` ∈ {1, 3, 8} × density ∈ {1, 50, 220}. **Bar:** dash count must stay
monotone in density at every floor value (T3's own property) and T4's slab guard `G4` must not trip
(`npx vitest run tests/unit/scene3d-mkdashramp-dark-end.test.js` and `-low-end.test.js`).

**(b) W-38's new "Min rulings" panel row × U5b-4/U7-2's caveat paragraph, in the SAME two surfaces.**
`fill-audit-3` adds `D_FACETFLOOR` to `MAPPER_CONTROLS.hatch`/`.crosshatch` and a live slider at
`scene3d-panel.js:~1393`; `fill-collapse-3` adds the shadow-row caveat renderer at `scene3d-panel.js:~3263`
and the ctxbar caveat surface. **Check, in the running app (`node scripts/dev-server.js 8490`):** select a
scene3d layer, set the fill style to `hatch`, pick a **folded** law (e.g. `penStipple` → `penInterleave`),
then open **both** the docked Style panel **and** the ctxbar Style flyout. **Bar:** the caveat paragraph AND
the "Min rulings" slider both render on both surfaces; neither suppresses the other; the flyout does not
overflow its 232 px min-width. **Screenshot both.**

**(c) U5b-5's CSS ellipsis rule × the merged flyout's content.**
Its own guard asserts the **CSS source text** (jsdom has no layout engine), so it passes even if the rule is
overridden. **Read-only specificity audit already done and it is clean:** `.ctxbar-fly-ctl .ctrl-sel` is
**(0,2,0)** at `components.css:~12096`; the only other multi-class `.ctrl-sel` rules are
`.ctrl-sel-wrap .ctrl-sel` (0,2,0, line 255 — sets `width` only), `.fcs-divisions-select .ctrl-sel`
(0,2,0, line 13563 — `width` only) and `.ctxbar-fly-ctl.ctxbar-fly-mixed .ctrl-sel` (0,3,0, line 12095 —
sets **`color` and `font-style` only**). **No rule anywhere claims `overflow`, `text-overflow` or
`white-space` on `.ctrl-sel`. No property collision exists.** **Check:** re-run the grep on the *merged*
file (`git grep -n "ctrl-sel" -- src/ui/skin/`), then open the **Shadow flyout** in the running app and
screenshot the Fill Style row showing **"Duty Cycle · Constant"** ellipsised (`…`), not cut to
"Duty Cycle · Constar". Plus `test:visual` + `test:e2e` (§5.3).

**(d) W-38's `persistentStyleKeys()` base list × the collapse chain's `STYLE_PARAMS` resolution.**
`fill-audit-3` adds `'facetMinRulings'` to the base array; `fill-collapse-3` changes what
`SCENE3D_TONE_LAWS.STYLE_PARAMS` contains (U6/U7-2/U9b-2). They feed the same union and only the merged tree
has both. **Check:** save a `.vectura` carrying a **folded** `toneLaw` **and** a non-default
`facetMinRulings` (say 8), reload it, and confirm (i) `facetMinRulings` survives the round trip, (ii)
`effectiveLaw` still resolves the folded id, (iii) the caveat still renders. **This is the same shape as the
defect the round-2 merge found** (a pre-collapse bag read through an un-seeded resolver).

**(e) F1's ribbon placement/erosion × W-38's facet floor on faceted primitives.**
F1's `wvPlaceCov` reserve decides *which* rulings survive; W-38 changes *how many exist* on a facet. Only
the merged tree has both. **Check:** **box** and **geodesic** + `hatch` + `interlockWeave` and `onePenDown`,
at `facetMinRulings` 1 and 8. **Bar:** F1-width-bar's measured per-law floors must still hold —
`interlockWeave` **0.8316 mm**, `trochoidLoop` **0.7030 mm**, `onePenDown` **0.7041 mm** (from `42acff7b`).
Run `npx vitest run tests/unit/scene3d-ribbon-width-bar.test.js` and
`npx vitest run tests/unit/scene3d-ribbon-width-create-rig.test.js`.

**(f) U9b-2's shadow write-back / U6's mark-class move × T4's band-pass mark geometry.**
`shadows.js` (`fill-collapse-3`) dispatches on **mark class** and draws its own `HATCH_LAW_RECIPES` recipe;
U6 moved `penStipple` from `'dot'` to `'hatch'`, so it now takes the hatch path. T4 (`fill-audit-a3`) changed
what a `morph`-shaped mark *is* (a band of up to `MK_BAND_MAX_PASSES = 6` parallel passes,
`surface-fill.js:2468`). **Check:** a lit scene with a cast shadow, `hatch` + `mkDashRamp`, density 220 and 1.
**Bar:** U9-2's `shadowPathCount` delta band **[3.6, 4.4]** must still hold —
`npx vitest run tests/unit/scene3d-shadow-tone-law-uniqueness.test.js` and
`npx vitest run tests/integration/scene3d-shadow-writeback.test.js`. **Screenshot the Density-1 shadow**: the
"dashes are bands" effect (§4 decision 12) will be visible there and must be **recorded, not fixed**.

---

## 4. THE 30 CHECKLIST ITEMS — every one, with a command or a file

Items are restated in their operative form. **Where an item was already discharged or withdrawn, that is
stated and no work is owed.**

| # | requirement | command / file | status going in |
|---|---|---|---|
| 1 | *"Rebase every lane onto main before merging."* | **OVERRULED — `git merge --no-ff`, never rebase, never squash** (§2.2; three tests pin lane shas and a rebase kills them). Record the overrule in the merge report. | ruling |
| 2 | *"Bump the version FROM the current `package.json`, one bump at merge."* | `node -e "console.log(require('./package.json').version)"` → **1.4.1**; bump to **1.4.2** per §6 | owed |
| 3 | *"Hand-merge `tests/unit/scene3d-tone-law-collapse.test.js` FIRST — four authors."* | **DISCHARGED BY MEASUREMENT.** `git diff --name-only 426cc5e4..3d-scene/<lane> -- tests/unit/scene3d-tone-law-collapse.test.js` → only `fill-collapse-3`. Zero conflicts. **Still re-run the file whole** (§5.2, Tier 1). | no hand-merge |
| 4 | *"Re-verify every byte-identity / md5 / fingerprint claim after integration."* | `npx vitest run tests/unit/scene3d-hlr-spatial-index-identity.test.js` + the per-lane identity tests (`scene3d-ribbon-f1-amp`, `scene3d-facet-min-rulings`, `scene3d-fill-style-effective-law`). Never carry a pre-merge pass count forward. | owed |
| 5 | *"Relocate in-worktree reports/evidence; delete leftover probe files."* | `git -C <integrate-r3> ls-files tests/ \| grep -E 'zzz-|-perf\.test\.js$'` and `ls <MAIN>/scripts/*.js`. **Round-3 lanes are clean here** — all reports are already in MAIN (§1.2) and both new scripts are correctly under `scripts/audit/`. Verify, expect nothing. | verify |
| 6 | *"Confirm `effectiveLaw` reads two distinct mechanisms (style bag shim-reconstruction vs shadow bag raw pass-through)."* | `npx vitest run tests/unit/scene3d-fill-style-effective-law.test.js` + §3.3(d)'s round-trip | owed |
| 7 | *"Verify the ctxbar caveat for RAW folded ids after integration."* | §3.3(b) + §3.3(d). **This is the item that found round 2's live product defect — do it in the running app, not in jsdom.** | owed |
| 8 | *"Re-run U1–U5's five survivor/folded pairs through U7's multi-primitive × density harness."* | `npx vitest run tests/unit/scene3d-tone-law-collapse.test.js` (singleFork; the harness lives there) and confirm the five clusters are dimensioned, not sphere-only | owed |
| 9 | *"`shadows.js` will have a third stake by merge — do not assume one author."* | **DISCHARGED.** `git diff --name-only 426cc5e4..3d-scene/<lane> -- src/core/scene3d/shadows.js` → only `fill-collapse-3`. Single author this round. | none |
| 10 | *"Regenerate W-33's `torus + contour + ladder @ d=50` golden hash against the truly-merged source."* | **DONE IN ROUND 2** (the one pin that moved). **Do not re-pin it again.** Verify it is green: `npx vitest run tests/unit/scene3d-curved-density-sparse-end.test.js` | verify |
| 11 | *"Run the W-27c item-1 contourSlice x-ray failure hunt on the rebased tree."* | **CLOSED GREEN in round 2** (17/17, 38/38 — it never existed on the merged tree). No action. | closed |
| 12 | *"Correct the `910` → `5851` point-count typo in `79b626d2`'s commit body."* | **DONE IN ROUND 2.** No action. | closed |
| 13 | *"Land W-35's docs contract (`sliceEndOverlap`)."* | **DONE IN ROUND 2.** No action. | closed |
| 14 | *"W-35's four review follow-ups (record-and-decide)."* | **DONE IN ROUND 2**, except the standing note **`build-user-presets.js` has NO `--dry-run` flag** — if you run it, verify with `git status`, never trust a flag. | note only |
| 15 | *"Run U9b (with W-10d-3b) on the integrated tree."* | **DELIVERED AS A LANE UNIT** — U9b landed at `2b189b5f` on `fill-collapse-3` and U9b-2 at `e10306e9`. Verify, do not redo: `npx vitest run tests/unit/scene3d-shadow-tone-law-uniqueness.test.js` + §3.3(f). | verify |
| 16 | *"Apply the U5b-2/3 CHANGELOG line; fix the briefs' Files-ALLOWED housekeeping."* | **DONE IN ROUND 2.** Round 3's equivalent is §7's CHANGELOG block. | closed |
| 17 | *"The orchestrator's wrap-up set owed on MAIN."* | **(a) Unit F's intentionally-red test — DONE in round 2.** Still owed, all verifiable with one grep each: **(b)** `docs/3d-audit/fill-audit/findings.json:236` false C-05 "byte-identical" claim → correct to *"near-duplicate; ink 1459–2202 mm on torus/hatch/med"* (`contFieldTouch` 3879.9 vs `contFieldSigmoid` 1459.0 mm, 2.7×); **(c)** `docs/3d-audit/fill-audit/after/W-25/report.json:14` "engaging only for small/thin regions" → W-25b measured **102/288** `trueSpiral` calls floored at aspect 0.177; **(d)** `docs/3d-audit/lane-reports/W-26-impl-2.md:424` claims hatch's 1.2 bar "still measures higher" — the ramp **fell 1.369 → 1.229 (−10.2 %)**; and `tests/unit/scene3d-plot-safety.test.js:243,262`'s `q(0.98)` bar has **no `## Bars changed` disclosure anywhere** — write one. | **owed (4 edits)** |
| 18 | *"Rebuild the gallery LAST, once, after everything else lands."* | §7 of this plan. **Orchestrator only.** | owed |
| 19 | *"Relocate every bespoke evidence script under `scripts/audit/`."* | `ls <MAIN>/scripts/*.js \| grep -vE 'build-\|sync-\|run-vitest\|dev-server\|patch-\|skin-new\|push-and-watch'`. Round-3 lanes are already compliant (`scripts/audit/scene3d-ribbon-width.js`, `scripts/audit/u9b-shadow-display-evidence.js`). Check for **`scripts/w28b-face-count-threshold-evidence.js`** at the root — a round-2 leftover — and move it. | owed |
| 20 | *"Numbers that must NOT be copied forward verbatim."* | **Do not write these into `CHANGELOG.md`:** U8's "426/426" (true: a 51/51 row, **447** total) · U6's "550" (true: 53/53 row, **544** total) · U9b-2's "328" (true sum of its own addends: **312**) · W-27c-0a-6's "fires only on the torus's level-6 ring" (it fires on **three** rings) · W-30d's "the fix" for the thin-torus void (it raises the ceiling ~3.5–4×, it does **not** remove it). | binding |
| 21 | *"CHANGELOG must carry documented limitations, not just features."* | Round-2's two (W-30d's 465:1–488:1 thin-torus ceiling; W-35's `sliceEndOverlap` default-0 no-op) are already in. **Round 3 adds two more — see §7's `### Known limitations` block.** | owed |
| 22 | *"Guards whose green rests on ARGUMENT rather than a re-run."* | Re-run on the integrated tree: `npx vitest run tests/unit/scene3d-hlr-spatial-index-identity.test.js` (**never carry a pre-merge pass count**) and the U0 48-law byte-identity sweep inside `tests/unit/scene3d-tone-law-collapse.test.js`. | owed |
| 23 | **`git show HEAD:` idiom sweep — hunting BROKEN instances as well as vacuous ones.** | **SWEPT READ-ONLY 2026-09-15. Full result and disposition table below this table.** | **1 blocker + 1 unowned** |
| 24 | *"Sweep BOTH cameras when re-verifying anything in the slices pass."* | **No round-3 lane touches the slices pass** (`fill-audit-d3` is empty; nothing edits `mappers.js` or the `contourSlice` path). **No action, but keep the rule** for §3.3's F1 checks: F1-width-bar-b already showed `onePenDown` differs materially between camera a (0.920 mm) and camera b (0.91425 mm) on a 4-vs-6-stretch population. | rule only |
| 25 | *"Reconcile every intentionally-red test."* (the specific claim was **withdrawn**; the **general sweep is still owed**) | **SWEPT READ-ONLY 2026-09-15**, identical on main and all three lanes: `git grep -n -iE "intentionally[ -]red\|expected to fail\|\.fails\(\|test\.skip\(\|it\.skip\(" <ref> -- tests/`. **Result:** every hit is either an environment guard (`smoke.spec.js` tablet-touch skips, `visual.spec.js`'s `ENABLE_SCREENSHOT_VISUALS` gate, `mask-shift-drag.spec.js`, `skin-muted-contrast.test.js`, `fill-param-plumbing.test.js:302`) or already reconciled (`scene3d-mesh-self-occlusion.test.js:33`). **Exactly ONE hit is unclassified: `tests/unit/text-fill-watertight.test.js:21`** — see §3.1. **No audit unit claims it → open a W-id.** | **1 to classify** |
| 26 | **"The merge's `test:ci` MUST include e2e AND visual — round 3 lands a CSS change."** | §5.3. Plus the specificity audit, **already done read-only in §3.3(c) and clean**. | owed |
| 27 | *"Record which rig each `after/<W-id>/` directory was shot on."* | **MECHANICAL.** Every directory predating `6ffaf9c6` was shot on the **`create`** rig. Command: `for d in docs/3d-audit/fill-audit/after/*/; do grep -l '"rig"' "$d"report.json 2>/dev/null \|\| echo "$d NO RIG FIELD -> create"; done`. Then add `"rig": "create"` (or `"addLayer"`, or `"create+addLayer"` for `GH-2`, `F1-erode`, `F1-amp`, `F1-width-bar*`) to every `after/<W-id>/report.json`. ⚠ **And record the consequence beside it: an unexplained byte-identical before/after pair may mean the GALLERY CANNOT SEE THE FIX (rig mismatch), not that the fix does nothing** — F1-erode's `torus/hatch/interlockWeave` cell is byte-identical on `create` (`pathCount=226, totalPoints=9042, inkMm=2006.6, wide=30` both ways) while the fix is plainly visible on `addLayer`. | **owed** |
| 28 | *"Sweep the suite for vacuous d=220 tone claims."* | **SWEPT 2026-09-13 — ZERO hits** (`tone-vacuity-sweep.md`). **NO ACTION AT MERGE.** Keep the durable note: **tone-preservation bars are measured at d=50.** | closed |
| 29 | **"CHANGELOG MUST DISCLOSE W-36c's side effect, whichever way Jay answers decision 11."** | §7. **Word it as a stated consequence with the retune explicitly pending — do NOT pick (A) or (B).** | owed |
| 30 | **"Audit every ink number in the round-3 reports for ground-plane inclusion — one line per report."** | **AUDITED READ-ONLY 2026-09-15. Result and the mechanical disposition rule below this table.** | **owed (24 reports)** |

### Item 23 — the sweep, run read-only on `main` and all three lanes

Commands actually run (a `git show HEAD` text grep alone is **not enough** — `scene3d-slice-end-overlap.test.js`
uses `execFileSync('git', ['show', 'HEAD:'+REL])` and a naive grep walks past it):

```
git grep -n -E "git show HEAD:|git show HEAD " <ref> -- tests/ scripts/
git grep -n -E "exec(File)?Sync"              <ref> -- tests/
```
for `<ref>` ∈ {`6ffaf9c6`, `3d-scene/fill-audit-a3`, `3d-scene/fill-collapse-3`, `3d-scene/fill-audit-3`}.

**Every hit on the integrated tree, with a disposition:**

| file:line | form | verdict |
|---|---|---|
| `tests/unit/scene3d-mktick-wedge.test.js:278` (a3) | `execSync('git show HEAD:src/core/scene3d/surface-fill.js')` — **LIVE** | 🛑 **BROKEN, not merely vacuous — the file runs 44 passed / 2 skipped / 1 FAILED at its own landing commit.** Third instance of the idiom in this audit, first that fails. **Owned by T2-3b. MERGE BLOCKER (§3.1, §9).** |
| `tests/unit/scene3d-slice-end-overlap.test.js:131` (already on `main`, W-35) | `execFileSync('git', ['show', 'HEAD:'+SCENE3D_REL])` — **LIVE** | ⚠ **VACUOUS FOREVER, and NO UNIT OWNS IT.** On a clean tree `HEAD` ≡ the loaded source, so `preFixHarness` and `H` execute byte-identical code and T1's "byte-identical default" leg can never fail. **Merge action: open a W-id** (replace with an absent-key/equality oracle plus a mutation proof, or pin a **fixed** historical sha the way `scene3d-hlr-spatial-index-identity.test.js` does). **Do not fix it inside the merge** — it is a tests-only unit with its own bar. |
| `tests/helpers/pre-wip-surface-fill.js:24,60,89` | `git show ${PRE_WIP_SHA}:…` (`1b157bc6`, `e047c9a7`) | ✅ **CORRECT PATTERN** — fixed historical pins. No action. **But see §2.2: never rebase/squash, or these shas vanish.** |
| `tests/unit/scene3d-area-light-shadow-softening.test.js:184` | `BASE_SHA = '90f3411f'` | ✅ correct pattern |
| `tests/unit/scene3d-shadow-footprint-wiring.test.js:73` | `BASE_SHA = '1e681432'` | ✅ correct pattern |
| `tests/unit/scene3d-shadow-receive-lighttypes.test.js:55` | `BASE_SHA = '90f3411f'` | ✅ correct pattern |
| `tests/unit/scene3d-mkdashramp-low-end.test.js:57` (a3, **new**) | `T3_BASE_SHA = '8780e97c'` | ✅ correct pattern — T3 explicitly avoided the idiom (its `:45` comment says so) |
| `tests/unit/scene3d-ribbon-flat-field-placement.test.js:74` (a3, **new**) | `F1P_BASELINE_SHA = '8adfd5af'` | ✅ correct pattern |
| `tests/unit/scene3d-shadow-tone-gradient.test.js:177` | **comment only** — provenance of the pinned constant `{ n: 136, ink: 2798.9287 }` | ✅ no action; this is the recommended shape |
| `tests/unit/scene3d-facet-min-rulings.test.js:35` (fill-audit-3) | **comment only** — W-38b's note that it *replaced* the idiom with 60 pinned goldens | ✅ no action |
| `tests/unit/scene3d-tone-laws-config.test.js`, `tests/unit/skin/skin-sdk.test.js` | `execFileSync(node, …)` — run a script, no `git` | ✅ irrelevant |

**Post-merge verification for every sha-pinned test:** confirm each pin is reachable from the integration
branch before running the suite —
`for s in 1b157bc6 e047c9a7 90f3411f 1e681432 8e9b0991 2d931b1a 83d1e021 8780e97c 8adfd5af; do git -C <integrate-r3> cat-file -e $s^{commit} && echo "$s ok" || echo "$s MISSING"; done`.

### Item 30 — the ink/ground-plane audit, run read-only on 29 round-3 reports

`grep -icE "ground[- ]?plane|ground plane" <report>` against every round-3 report carrying ink numbers:

- **Reports that DO state ground-plane inclusion (5):** `F1-width-bar-reshoot.md`, `F1-width-bar-b-impl.md`,
  `W-38-impl.md`, `W-38-review.md`, `U6-impl.md`.
- **Reports that carry ink numbers and say NOTHING about the ground plane (24):** `T4-impl.md`,
  `T4-review.md`, `T4b-impl.md`, `T4b-review.md`, `T4c-impl.md`, `W-36c-impl.md`, `W-36c-review.md`,
  `F1-placement-impl.md`, `F1-placement-review.md`, `F1-erode-impl.md`, `F1-erode-plan.md`,
  `F1-erode-review.md`, `F1-amp-impl.md`, `F1-amp-review.md`, `F1-width-bar-impl.md`,
  `F1-width-bar-review.md`, `F1-width-bar-b-verify.md`, `T2-3-impl.md`, `T2-3-review.md`, `T3-impl.md`,
  `T3-review.md`, `W-31b-impl.md`, `W-31b-plan.md`, `T2-2-impl.md`.

**This is annotation, not re-measurement.** The construction decides it, and the construction is readable:

| rule | evidence | verdict |
|---|---|---|
| **A** — any number from `scripts/audit/scene3d-capture.js`, **either rig** | `scene3d-capture.js:270–272` hides the live `sceneGround3d` descendant (`groundChild.visible = false`) and `:291` sets `q.ground = { enabled: false }`; `inkMm` at `:329–351` then sums only what remains | **EXCLUDES ground** |
| **B** — any bespoke harness that does not explicitly disable the ground | `F1-width-bar-reshoot.md` §"ground hidden" measured the residual as a **near-constant ~2269 mm across every law** on the torus/hatch fixture | **INCLUDES ground** |
| **C** — `tests/helpers/scene3d-ribbon-width.js` `measureRibbonWidth()` | never touches the ground child | **object-only by construction** (a width, not an ink total) |
| **D** — `tests/helpers/scene3d-ribbon-width-create-rig.js` | sets `g.params.ground = { enabled: false }` explicitly, with a structural guard asserting the literal | **EXCLUDES ground, guarded** |

**Merge task:** for each of the 24, identify which harness produced its numbers (the report names its script),
apply rule A/B/C/D, and add **one line** under the report's numbers: *"Ink totals EXCLUDE / INCLUDE
ground-plane ink (measured via `<script>`; rule <A/B/C/D>)."* ⚠ **A stop-condition percentage computed with
ground included against a baseline computed without it is simply a different number** — the ~35–40 %
divergence that cost three units to diagnose was exactly this. **Nothing may be carried into `CHANGELOG.md`
or a future baseline until its line exists.**

---

## 5. TEST PLAN

### 5.1 The binding rule, verbatim

> Run every vitest file in the FOREGROUND with the Bash tool parameter `timeout: 600000` (ten minutes).
> Never use `run_in_background`, never arm a Monitor and end your turn. If a file still exceeds ten minutes,
> kill it and rerun alone with `--pool=forks --poolOptions.forks.singleFork=true`, again with
> `timeout: 600000`.

**Node 20 is required** (`.nvmrc` v20.20.2). No `NODE_OPTIONS`. `vitest.config.mjs` already sets
`testTimeout`/`hookTimeout` 180000 and `poolOptions.forks.maxForks: 4` — those bound vitest, **not** the Bash
tool; `timeout: 600000` is the one that stops the backgrounding. **Run one file per command** — under
`singleFork` a multi-file batch can silently truncate to the first file's results.

### 5.2 Known-slow files (§0b's list, verbatim)

**Tier 1 — the only one, and it exceeds the tool's 600 000 ms ceiling:**
`tests/unit/scene3d-tone-law-collapse.test.js` — 121 tests, measured **390 s → 1045.63 s** across this audit.
**Start it foreground with `--pool=forks --poolOptions.forks.singleFork=true` and `timeout: 600000`, LET THE
TOOL BACKGROUND IT when the ceiling hits, carry on with other verification, and read the result from the
tool's own completion notification. Do NOT pass `run_in_background`, do NOT arm a Monitor, do NOT end your
turn waiting.** 600 000 ms is the tool maximum — there is nothing higher to ask for. **This is a tool
constraint, not a protocol deviation.**

**Tier 2 — near or over the default 120 s under load; give each `timeout: 600000`:**
`tests/integration/scene3d-fill-style-picker.test.js` (166–170 tests) ·
`tests/unit/scene3d-mark-laws-draw.test.js` · `tests/unit/scene3d-ribbon-wall-coverage.test.js` (44.0 s) ·
`tests/unit/scene3d-ribbon-f1b-streaks.test.js` (33.9 s) ·
`tests/unit/scene3d-hlr-spatial-index-identity.test.js` · `tests/unit/scene3d-mesh-self-occlusion.test.js` ·
`tests/unit/scene3d-shadow-receive.test.js` · `tests/unit/scene3d-shadow-anatomy.test.js` ·
`tests/unit/scene3d-shadows.test.js` · `tests/unit/scene3d-shadow-tone-gradient.test.js` ·
`tests/unit/scene3d-curved-density-floor.test.js` and `-sparse-end.test.js` ·
`tests/unit/scene3d-contour-slice.test.js` (67/67 in 23.3 s — **Tier 2, not Tier 1**; the earlier Tier-1
listing was a secretary error, corrected 2026-09-12).

**Benign, not regressions:** a single `[vitest-worker]: Timeout calling "onTaskUpdate"` RPC warning with
**exit code 0**; `[FillBoolean] polygon union failed on degenerate geometry` on stderr; one documented
`scripts/run-vitest.js` retry that then passes. **Two different failures are a failure.**

### 5.3 The run — `npm run test:ci`, split into its suites, foreground, one at a time

`test:ci` = `test:unit && test:integration && test:e2e && test:visual && test:perf`. **Run the suites
separately** so a failure is attributable:

```
# 1. targeted first — the cross-lane checks and the blockers, one file per command, timeout: 600000
npx vitest run tests/unit/scene3d-mktick-wedge.test.js                       # MUST be 47/47 (see §9)
npx vitest run tests/unit/scene3d-ribbon-f1b-streaks.test.js                 # expect 44/44
npx vitest run tests/unit/scene3d-ribbon-wall-coverage.test.js               # expect 36/36
npx vitest run tests/unit/scene3d-facet-min-rulings.test.js
npx vitest run tests/unit/scene3d-ribbon-width-bar.test.js
npx vitest run tests/unit/scene3d-ribbon-width-create-rig.test.js
npx vitest run tests/unit/scene3d-mkdashramp-dark-end.test.js
npx vitest run tests/unit/scene3d-mkdashramp-low-end.test.js
npx vitest run tests/unit/scene3d-shadow-tone-law-uniqueness.test.js
npx vitest run tests/unit/scene3d-fill-style-effective-law.test.js
npx vitest run tests/unit/scene3d-hlr-spatial-index-identity.test.js
npx vitest run tests/unit/text-fill-watertight.test.js                       # classify (§3.1)
npx vitest run tests/integration/scene3d-shadow-writeback.test.js
npx vitest run tests/integration/scene3d-fill-style-picker.test.js
npx vitest run tests/integration/scene3d-panel.test.js
npx vitest run tests/unit/scene3d-tone-law-collapse.test.js --pool=forks --poolOptions.forks.singleFork=true

# 2. then the suites
npm run test:unit
npm run test:integration
node scripts/dev-server.js 4173 &     # pre-start so Playwright's reuseExistingServer finds it
npm run test:e2e                      # see the workers note below
npm run test:visual
npm run test:perf
```

**`test:e2e` notes — both matter for item 26:**
- **Run it with `--workers=1`.** Round 1 reproduced a 100 %-deterministic hang on the default `workers: 2`
  under load (both workers finish `smoke.spec.js`, then the process stalls before the summary) and 0 %
  serialized. `test:e2e` runs five `playwright test` invocations in sequence — append `--workers=1` to each,
  or run them individually.
- ⚠ **`test:e2e` ENUMERATES its specs** — `smoke`, `stroke-options`, `tool-drawer`, `import-3d`,
  `iphone-mini`. **`mask-shift-drag.spec.js` is never run by it and `visual.spec.js` is env-gated.** So the
  suite alone may not exercise the ctxbar flyout that U5b-5's CSS rule targets. **The live screenshot in
  §3.3(c) is therefore not optional — it is the only evidence that the CSS change works in a real browser.**

**Baseline to beat (round-2 merge, v1.4.1, zero failures):** unit 5199 · integration 1973 · e2e 62 ·
visual 99 · perf 10. Unit and integration must **rise** (10 new test files). Record the exact counts in the
merge report.

---

## 6. VERSION

**1.4.1 → 1.4.2.** Plain semver patch; the third digit is unbounded — never reset it.

All three lanes still read **1.4.1** in `package.json` (they branched off `426cc5e4`, which is 1.4.1), so the
merges themselves produce **no `package.json` conflict**. Bump **once, by hand, on the integration branch,
after the last lane merges**:

```
node -e "const p=require('./package.json');p.version='1.4.2';require('fs').writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')"
npm run version:sync
```

**Expected diff — accept nothing else: exactly 3 files.** `package.json` (1 line),
`src/config/version.js` (`Vectura.APP_VERSION = '1.4.2'`), and `index.html` (~446 changed lines / ~222 `?v=`
cache-busters, **zero `v=1.4.1` left**). That churn is the normal substitution, not unrelated drift.

**On the PreToolUse version-bump hook** (`.claude/settings.json`): it fires on a Bash `git commit` (not
`--amend`) only when the staged set touches `src/`, `tests/` or `index.html` **and `package.json` is not
already staged**. **Because you stage `package.json` yourself, the hook detects it and exits early — no
double bump.** Stage all three explicitly:

```
git -C <integrate-r3> add package.json src/config/version.js index.html
git -C <integrate-r3> -c core.hooksPath=/dev/null commit -m "chore: v1.4.2 — 3D Scene fill audit round 3"
```
Verify afterwards: `node -e "console.log(require('./package.json').version)"` → `1.4.2`, and
`grep -c 'v=1.4.1' index.html` → `0`.

---

## 7. DOCUMENTATION CONTRACT

Per CLAUDE.md: **any repository change** ⇒ `plans.md`, `CHANGELOG.md`, README release notes, `version:sync`.
**Feature capability** ⇒ `README.md`, `plans.md`, `CHANGELOG.md`. **UI behaviour / help** ⇒ `README.md`,
in-app help guide, in-app shortcut list.

⚠ `CHANGELOG.md`, `plans.md` and `README.md` are named in CLAUDE.md as the **highest-collision files across
parallel sessions**. **Re-read the target region immediately before editing.** On a "file modified since
read" error, re-read and **merge** your change into the new content — never overwrite with your remembered
version.

### 7.1 `CHANGELOG.md` — draft block

```markdown
## 1.4.2 — 3D Scene fill audit, round 3

### Added
- **3D Scene — "Min rulings" (per fill style).** Hatch and Crosshatch styles gain a *minimum facet
  rulings* control (1–8, default 3). It sets the fewest rulings a flat facet may receive when Density
  asks for fewer. Lower values (1–2) keep the tone ladder's contrast but leave facets nearly bare;
  higher values (4–8) fill the lit facets at the cost of that contrast. **Default 3 is byte-identical
  to previous releases.** No effect on smooth shapes, on Contour / Spiral / Stipple fills, or on the
  ground plane.

### Changed
- **3D Scene — fill style list is shorter and clearer.** *Pen Stipple*, *Pen Pitch Match* and *Pen
  Facing* now appear as modes of **Pen Interleave** rather than as three separate styles; the style
  count drops from 33 to 30. Existing documents keep their look — a saved style resolves to the same
  drawing. **Pen Stipple has also moved from the "dot" group to the "hatch" group in the picker**,
  because that is how it actually draws.
- **3D Scene — every folded fill style now explains itself in plain language.** The style picker and
  the context-bar flyout show each style's own caveat, written for users rather than as audit prose,
  on both the Fill Style row and the Shadow row.
- **3D Scene — dark end of Dash Ramp restored.** At maximum Density a Dash Ramp fill now lays down a
  full dark tone again instead of thinning out. Marks are drawn as a short band of parallel passes so
  they can carry the ink.
- **3D Scene — low end of Dash Ramp fixed.** At Density 1 a sphere now draws a readable row of dashes
  instead of one or two; dash count rises smoothly with density across the whole range.
- **3D Scene — tick fills cover the bare wedge.** Tick-based fills no longer leave an un-ticked band
  where rows line up; rows are staggered against one another.
- **3D Scene — wave-ribbon fills are placed evenly across the form.** The deep bare strip that
  appeared on the lower front of a torus is gone and the weave now runs continuously around the
  whole shape, including the highlight band. See *Known limitations* for the weight trade.
- **3D Scene — crosshatch spends a full hatch budget per family.** Each of the two crossed families
  now carries the ruling count a single-family hatch would, with a new cap so maximum Density does
  not fill solid. See *Known limitations*.

### Fixed
- **3D Scene — context-bar flyout labels no longer cut off mid-word.** A long fill-style label in a
  narrow flyout now ends in an ellipsis ("Duty Cycle …") instead of being clipped to a fragment
  ("Duty Cycle · Constar").
- **3D Scene — the Shadow row shows the shadow's own recipe.** A shadow using a folded style now
  displays that style's own settings and caveat rather than the surviving style's.
- **3D Scene — wave-ribbon fills no longer collapse to a bare centreline.** A swallowed geometry
  failure inside the fill inset step was being treated as success, which left a single thin line
  where a ribbon belonged.

### Known limitations
- **Crosshatch at maximum Density: the tone dial has no effect on cell size.** The new
  anti-saturation cap — added so Density 220 does not fill solid — binds at the top of the range, so
  turning the tone dial there changes nothing. This is the trade the cap exists to make; **whether
  the cap's onset should be retuned so some tone authority survives at maximum density is an open
  product decision and is not settled by this release.**
- **Wave-ribbon fills read lighter than before.** Fixing the bare strip redistributes ink rather than
  removing it (total ruling length is unchanged to +0.1 %), but the ribbons are measurably thinner —
  most on *One Pen Down*. **Whether to restore the previous ribbon weight while keeping the new even
  placement is an open product decision and is not settled by this release.**
- **Dash Ramp marks are bands, not single strokes.** The band mechanism that restored the dark end
  applies at every density, so at Density 1 each dash reads as a thick tile rather than a thin
  stroke.
- *(carried)* The thin-torus shadow blank-void ceiling returns at a major:minor tube ratio of about
  465:1–488:1 — unreachable through the UI, reachable via a hand-edited or imported `.vectura`.
- *(carried)* `sliceEndOverlap` defaults to 0 and is byte-identical there — no visual change on upgrade.
```

⚠ **Item 29 compliance:** the first *Known limitations* bullet states the cap's **consequence**, not just the
cap, **and explicitly marks the retune as an open decision.** Do **not** write "accepted" or "will be
retuned" — that pre-empts decision 11 (§8).
⚠ **Item 21 compliance:** four limitations, two new + two carried.
⚠ **Item 20 compliance:** no count from the forbidden list (426/426, 550, 328, "level-6 ring only", "the fix")
appears anywhere above.

### 7.2 `README.md`
- Add the **"Min rulings"** control to the 3D Scene feature group's `<details>` full-feature panel
  (**feature capability ⇒ README required**).
- Add the v1.4.2 block to release notes; **keep only the 3 most recent inline** and push the fourth into the
  `<details><summary>Older releases…</summary>` panel.
- The fill-style count changes 33 → 30 — grep for a hard-coded count: `grep -n "33 fill\|33 styles" README.md`.

### 7.3 In-app help + shortcut list
- **UI behaviour change ⇒ in-app help required.** `D_FACETFLOOR` already ships a `help:` string in
  `scene3d-panel.js`; confirm the in-app help guide's 3D Scene section mentions the control, and that the
  fill-style list in help reflects 30, not 33. **No shortcut changed — no shortcut-list edit.**

### 7.4 `plans.md`
- Move round-3's landed items out of the Inbox; record the still-open items with their owners:
  **decisions 9-amendment / 10 / 11 / 12 (Jay)**, **T2-3b**, **T2-4**, **F1-count**, **W-36e**,
  **the `scene3d-slice-end-overlap.test.js` vacuous leg (new W-id, item 23)**,
  **`text-fill-watertight.test.js` classification (new W-id, item 25)**, and the unscheduled list
  (W-33's fitter follow-up · W-32 Rank 4 · W-07b · `insetMultiPolygon` ladder · U10–U12 · the W-29 stub family).

### 7.5 `docs/3d-audit/fill-audit-handoff.md`
- Update the "Current as of" line, the local `main` sha, and the version. Record the round-3 merge sha and
  that **nothing is pushed**.

---

## 8. THE GALLERY REBUILD (orchestrator's own step — implementers are barred)

**Run it LAST, once, after every merge, the version bump and the docs land.** Implementers must never touch
`scene3d-assemble.js`, `scene3d-audit-findings.js` or `scene3d-before-after.js`.

```
node scripts/audit/scene3d-assemble.js       --out docs/3d-audit/fill-audit
node scripts/audit/scene3d-audit-findings.js --out docs/3d-audit/fill-audit
node scripts/audit/scene3d-before-after.js   --out docs/3d-audit/fill-audit
```
Then reload `http://localhost:8460/docs/3d-audit/fill-audit/index.html` and **look at it**.
`shots/` and `after/*/shots` are **not** committed; the manifests, `report.json`s, findings and `index.html`
are. Do item 27's rig annotation (§4) **before** the rebuild so the Before/After cards carry the rig.

### The `--rig addLayer` second-tier question — **RECOMMENDATION: not now.**

**Rebuild the default `create` tier in full (3480 cells) as above, and add `--rig addLayer` shots ONLY for
the ribbon/wave-law cells** — the one defect class proven blind on `create`:

```
node scripts/audit/scene3d-capture.js --tier B --rig addLayer --root <integrate-r3> --port 8490 \
  --only '^torus__(hatch|crosshatch|contour)__(interlockWeave|trochoidLoop|onePenDown|amplitudeOnly)__(med|max)__[ab]$' \
  --out docs/3d-audit/fill-audit/after/MERGE-r3
```

Reasons, in order of weight:

1. **A full second tier doubles a multi-hour capture and ~373 MB of uncommitted shots for no
   decision-relevant gain.** GH-2 already proved the tier reaches the defect on exactly the ribbon cells
   (`torus__hatch__interlockWeave__med__a`: pre `7f805654` = thin wireframe zigzag, post `e2c3ca85` = full
   ribbon), and the default `create` rig is **byte-identical** to before GH-2, which is the property the
   3480-cell gallery is pinned to.
2. **Decision 10's evidence packet is already complete on both rigs** (`after/F1-amp/`, 12 cells × 2, plus
   `after/F1-erode/`'s runtime crops, plus per-law ink and width numbers). Nothing further is being measured
   before Jay answers. A second tier would add pictures to a packet that is already closed.
3. **If Jay answers 10 = B (F1-weight), the `addLayer` tier becomes that unit's acceptance surface** — and
   then it should be built deliberately, scoped to the wave laws, as part of that unit's brief. Building it
   speculatively now commits the gallery to a shape a decision may not want.

**Record the recommendation and the reasoning in the merge report so the next session does not re-ask it.**

---

## 9. STOP CONDITIONS, AND WHAT MUST NOT HAPPEN

**Stop, do not "resolve creatively", write the report, and report one line.**

1. **A conflict in a file this plan says merges clean.** §2.4 is a measured fact about the shas in §0. A new
   conflict means a lane HEAD moved (expected only for `fill-audit-a3`) or the wrong branch was merged.
   Re-run the `git merge-tree` simulation and re-verify §0 before touching anything.
2. **Any re-pin demanded by `test:ci`.** The round-3 budget is **zero**. A fingerprint that moves in a merge
   is either a real cross-lane interaction (disclose it, with arithmetic, under `## Bars changed`) or a
   mistake. **It is never "just update the expected value".**
3. **`tests/unit/scene3d-mktick-wedge.test.js` still red.** See §9a.
4. **A test that is green on unmodified `main` and red after the merge.** That is a merge-caused regression:
   fix at source with a RED→GREEN proof, or stop.
5. **Any lane worktree found dirty at pre-flight.** An agent is live; do not merge underneath it.

**What must NOT happen, under any circumstance:**

- ❌ **No `git push`.** Not the integration branch, not `main`, not tags. Local `main` is 44+ ahead of
  `origin/main` and stays that way. Pushing, opening a PR, merging remotely and tagging are all publishing
  operations requiring Jay's explicit word.
- ❌ **No pre-empting decisions 9-amendment, 10, 11 or 12.** Do not build F1-weight. Do not retune W-36c's
  cap onset. Do not reopen W-32 Rank 4. Do not add a single-pass dash threshold. **The CHANGELOG discloses
  each consequence and marks the choice open — that is the whole of the merge's obligation here.**
- ❌ **No re-pin without proof.** A widened tolerance, a moved fingerprint, **or a narrowed population /
  changed fixture** — all three are bar changes and all three require `file:line — old → new — why` in the
  report **and** the commit body. "The number is unchanged" is not a defence when the population moved.
- ❌ **No `git reset` (any mode), `git checkout -- <tracked>`, `git restore`, `git clean`,
  `git stash drop|clear`, `git rebase` or `git push --force` in any dirty tree** — and none of them at all
  without (a) a recovery point (`git tag recover-merge-r3 $(git stash create)` or a WIP commit) and (b)
  Jay's explicit naming of that operation. **Never `git reset --hard main` to sync a worktree.** Before any
  such operation, re-run `git status` + `git stash list` **in the current worktree** — the session-start
  snapshot is stale.
- ❌ **No `git add -A`.** Explicit paths, then `git status --short --cached` and eyeball it. If unrelated WIP
  appears, stop and ask.
- ❌ **No squash, no rebase, no `--ff`** — §2.2: three tests read lane commits back by sha at runtime.
- ❌ **Do not kill the dev server on port 8460** (MAIN's gallery).
- ❌ **Do not touch `stash@{4}`, `stash@{5}`, `stash@{6}`** — old `main` WIP from other efforts.
- ❌ **Do not fix `tests/unit/scene3d-slice-end-overlap.test.js`'s vacuous leg inside the merge.** File a
  W-id; it is a tests-only unit that needs its own mutation proof.
- ❌ **Do not run any test with `run_in_background` or a Monitor.** Foreground, `timeout: 600000`, one file
  per command.

### 9a. What T2-3b's landing changes in this plan — the refresh placeholder

T2-3b is **queued and not landed**. It lands on `3d-scene/fill-audit-a3`, on top of `c28b3490`, as **one
unit**: replace the broken `git show HEAD:` self-test in `tests/unit/scene3d-mktick-wedge.test.js` with a
golden pin, **and** fix the undisclosed diagonal moiré T2-3's stagger introduced on the **contour** mapper,
with its own moiré bar. Both halves touch `surface-fill.js` / `scene3d-mktick-wedge.test.js` — **`fill-audit-a3`
files only, disjoint from both other lanes.** So:

**When T2-3b lands, do exactly this and nothing else changes:**

1. **Refresh §0's `fill-audit-a3` HEAD.** `git -C <MAIN> rev-parse 3d-scene/fill-audit-a3` — record the new
   sha in the merge report and in the merge-3 commit body.
2. **Re-run the merge simulation for that lane only:**
   `git merge-tree 426cc5e4 3d-scene/fill-collapse-3 3d-scene/fill-audit-a3 | grep -c '<<<<<<<'` and
   `git merge-tree 426cc5e4 3d-scene/fill-audit-3 3d-scene/fill-audit-a3 | grep -c '<<<<<<<'` — **both must
   still be 0.** A non-zero count means T2-3b reached outside its lane: **STOP condition 1.**
3. **Refresh §3.1's red list.** `tests/unit/scene3d-mktick-wedge.test.js` moves from
   *44 passed / 2 skipped / 1 FAILED* to **47/47 green** (46 + the replacement golden; confirm the actual
   count from T2-3b's own report rather than from this number). **With that, the merge has ZERO expected
   reds** and every remaining entry in §3.1 is a verify-only row plus the one `text-fill-watertight`
   classification.
4. **Refresh §4 item 23's table.** The `scene3d-mktick-wedge.test.js:278` row moves from 🛑 *BROKEN — merge
   blocker* to ✅ *replaced by a pinned golden*. **The `scene3d-slice-end-overlap.test.js:131` row does NOT
   move** — it stays unowned and still needs its own W-id.
5. **Re-run these three files before the full `test:ci`**, because T2-3b edits the same mark sink T2-3, T3,
   T4 and W-36 all wrote to: `npx vitest run tests/unit/scene3d-mktick-wedge.test.js`,
   `npx vitest run tests/unit/scene3d-mark-laws-draw.test.js`,
   `npx vitest run tests/unit/scene3d-curved-density-sparse-end.test.js`. **If the re-measured golden hash in
   the last file moves, that is a finding, not a re-pin.**
6. **Add T2-3b's moiré fix to the CHANGELOG's *Changed* block** — one line, in the same plain-language
   register as §7.1's other entries.
7. **Nothing else in this plan changes.** Merge order, conflict rules, version, docs contract, test plan,
   gallery recommendation and stop conditions are all unaffected, because `fill-audit-a3` merges **last** and
   is **provably disjoint** from both other lanes.

**If T2-3b is NOT going to land before the merge:** the merge is **BLOCKED**, because merging with a known
red test violates CLAUDE.md's non-negotiable pre-commit rule and the alternative — re-pinning or skipping the
test — is forbidden by the standing "no re-pin without proof" ruling. **Report that, do not work around it.**

---

## 10. POST-MERGE ORDER (recommended)

1. Merge 1 `fill-collapse-3` → merge 2 `fill-audit-3` → merge 3 `fill-audit-a3` (§2.3), each `--no-ff` with a
   commit body naming its units.
2. Reconciliation checks §3.3 (a)–(f), in the running app where the item says so, with screenshots.
3. Targeted tests, then the five suites (§5.3).
4. Checklist items 17(b)(c)(d), 19, 23's two W-ids, 25's one W-id, 27's rig annotation, 30's 24 report lines (§4).
5. Version bump to **1.4.2** (§6).
6. Docs: `CHANGELOG.md`, `README.md`, in-app help, `plans.md`, `fill-audit-handoff.md` (§7).
7. Gallery rebuild + the scoped `--rig addLayer` shots (§8).
8. Write `MERGE-impl-r3.md` (status line first, `## Bars changed` mandatory) and **STOP**. Print the merge
   sha and a one-line summary. **Do not fast-forward `main` onto the integration branch until a merge review
   has come back ACCEPT** — that was the round-2 sequence and it caught things.
9. **Never push.**
