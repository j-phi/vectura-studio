STATUS: PLAN-READY

# MERGE PLAN — round 4 (two live lanes → `main` @ v1.4.2)

**Written 2026-09-18 by the merge planner (Opus, read-only). Self-contained: an implementer can execute
this without reading `LEDGER.md`, `SESSION-SUMMARY.md`, `ROUND4-BRIEFS.md` or the round-2/3 merge docs.
Every fact below was verified read-only with `git -C` on 2026-09-18; nothing was written, no worktree was
entered, no `cd` was used, no test was run.**

> ⚠ **This plan MUST NOT pre-empt Jay's one open decision (11-amended).** It ships what the lanes contain,
> discloses the consequence in `CHANGELOG.md`, and builds nothing new. See §8.
>
> ⚠⚠ **ONE REAL, SEMANTIC CONFLICT IS EXPECTED AND IT IS MEASURED, NOT GUESSED.** Both lanes re-pinned the
> **same twelve** pinned-golden cells in `tests/unit/scene3d-mktick-wedge.test.js`, for **unrelated and both
> correct** reasons. **Neither side's pins are valid on the merged tree.** §2.5 is the whole procedure.

---

## 0. VERIFIED STATE (re-verify every line before you start; all `git -C`, read-only)

| thing | value | how it was verified |
|---|---|---|
| MAIN | **`b43fa4e3`** (`docs(3d-audit): round 3 CLOSED …`) | `git -C . rev-parse HEAD` |
| `origin/main` | **`b43fa4e3` — identical.** Round 3 was pushed on Jay's `push = A`. **`main` is NOT ahead of origin.** | `git rev-parse origin/main` |
| `package.json` | **1.4.2** | `node -e "console.log(require('./package.json').version)"` |
| `3d-scene/border-4` | **`5d8574da`** — 4 commits off `b43fa4e3` | `git log --oneline b43fa4e3..3d-scene/border-4` |
| `3d-scene/fill-audit-a4` | **`0f420747`** — 6 commits off `b43fa4e3`. ⚠ **THE TOP COMMIT IS AN UNVERIFIED T2-6 WIP CHECKPOINT (Incident 15 rate-limit kill). THIS HEAD WILL MOVE. See §9.** | same |
| `border-4` worktree | **CLEAN** (`.claude/worktrees/border-4`, at `5d8574da`) | `git -C <wt> status --short -- . ':!graphify-out'` → empty |
| `fill-audit-a4` worktree | **CLEAN at `0f420747`** — the earlier dirty T2-6 edits are now inside the WIP commit. **An implementer is live on this lane right now.** | same → empty |
| MAIN working tree | **DIRTY — round-4 docs/evidence ONLY** (4 modified + ~52 untracked under `docs/3d-audit/`). **No `src/`, no `tests/`.** Full list in §1.2. | `git status --short -- . ':!graphify-out'` |
| `git stash list` | 7 entries, **none belongs to round 4** — `stash@{0..3}` graphify noise on agent worktrees, `stash@{4}/{5}/{6}` old `main` WIP from other efforts. **Do not touch any of them.** | `git stash list` |
| `graphify-out/` | **untracked + gitignored** — cannot conflict | `git ls-files graphify-out` → 0 |
| live dev servers | **`8460` = MAIN's gallery — DO NOT KILL.** **`8475` = `fill-audit-a4`'s lane server — DO NOT KILL, an implementer owns it.** Nothing else listening on 84xx / 4173 / 8500. | `pgrep -fl dev-server.js`, `lsof -nP -iTCP -sTCP:LISTEN` |
| node | **v20.20.2**, `.nvmrc` v20.20.2 | `node -v` |

**Lane contents, for the merge-commit bodies:**

- **`border-4` (`5d8574da`) — 🏁 CLOSED AND FINAL for round 4.**
  W-32r4 WIP checkpoint `e47afc16` → W-32r4 `76a77f22` → W-32r4b `fe5d67bf` → W-32r4c `5d8574da`.
  Reviews: **`W-32r4-review.md` REJECT → `W-32r4-review-2.md` ACCEPT**; `W-32r4b-verify.md` VERIFIED.
  **Files (10):** `CHANGELOG.md`, `plans.md`, `src/core/algorithms/scene3d.js` (+207, the edge pass only),
  `tests/unit/scene3d-box-density-bearing.test.js`, `scene3d-curves.test.js`,
  `scene3d-facet-min-rulings.test.js`, `scene3d-fill-boundary-ends.test.js`,
  `scene3d-fill-silhouette-overshoot.test.js` (**new**, +423), `scene3d-hlr-spatial-index-identity.test.js`,
  `scene3d-mktick-wedge.test.js`. **Nothing else.**
- **`fill-audit-a4` (`0f420747`)** — T3b `e60d102e` (ACCEPT-WITH-FOLLOWUPS) · W-36e `a5d8a1be` (VERIFIED) ·
  F1-count `7ef20455` (VERIFIED) · T2-5 `75777240` (ACCEPT-WITH-FOLLOWUPS) · T3c `f0b0b0c8`
  (ACCEPT-WITH-FOLLOWUPS) · **T2-6 WIP `0f420747` (UNVERIFIED)**.
  **Files (10):** `src/core/scene3d/surface-fill.js` (+241 at `f0b0b0c8`, more at the WIP),
  `tests/helpers/scene3d-mktick-band-purity.js`, `tests/helpers/scene3d-mktick-gap-fill.js`,
  `tests/unit/scene3d-curved-density-floor.test.js`, `scene3d-mkdashramp-discrete.test.js` (**new**),
  `scene3d-mkdashramp-single-pass.test.js` (**new**), `scene3d-mktick-band-purity.test.js` (**new**),
  `scene3d-mktick-gap-fill.test.js` (**new**), `scene3d-mktick-wedge.test.js`,
  `scene3d-ribbon-fill-depth-count.test.js` (**new**). **Nothing else.**

---

## 1. PRE-FLIGHT

### 1.1 Re-verify — run all of it; do not trust this document's shas

```
M=/Users/jayphi/Documents/github/vectura-studio
git -C $M rev-parse HEAD                       # expect b43fa4e3…
git -C $M rev-parse origin/main                # expect the same
node -e "console.log(require('$M/package.json').version)"    # expect 1.4.2
git -C $M status --short -- . ':!graphify-out'
git -C $M stash list
for w in border-4 fill-audit-a4; do
  echo "== $w =="
  git -C $M/.claude/worktrees/$w rev-parse HEAD
  git -C $M/.claude/worktrees/$w status --short -- . ':!graphify-out'
done
git -C $M log --oneline b43fa4e3..3d-scene/border-4
git -C $M log --oneline b43fa4e3..3d-scene/fill-audit-a4
```

**STOP if**: `border-4` is not `5d8574da`; either worktree is dirty (an agent is live — do not merge
underneath it); `main` ≠ `origin/main` (someone pushed or committed); or `fill-audit-a4`'s HEAD is **still an
unverified WIP** — that last one is **§9, the only blocking condition of this merge**.
`fill-audit-a4` moving *forward to a verified T2-6 commit* is expected and is handled by §9.

### 1.2 Commit MAIN's uncommitted round-4 docs FIRST (orchestrator's step, before any merge)

MAIN is dirty with **round-4 reports and evidence only** — no `src/`, no `tests/`. Commit it so the
integration branch is created off a clean, complete `main`.

**Modified (4):** `docs/3d-audit/STILL-OPEN.md` · `docs/3d-audit/fill-audit-handoff.md` ·
`docs/3d-audit/lane-reports/LEDGER.md` · `docs/3d-audit/lane-reports/SESSION-SUMMARY.md`.

**Untracked — lane reports (~18):** `ROUND4-BRIEFS.md` · `F1-count-impl.md` · `F1-count-verify.md` ·
`T2-5-impl.md` · `T2-5-plan.md` · `T2-5-review.md` · `T2-5-plan-evidence/` · `T2-6-impl.md` ·
`T2-6-plan.md` · `T2-6-plan-evidence/` · `T3b-impl.md` · `T3b-review.md` · `T3c-impl.md` ·
`T3c-review.md` · `W-32r4-impl.md` · `W-32r4-plan.md` · `W-32r4-plan-evidence/` · `W-32r4-review.md` ·
`W-32r4-review-2.md` (plus `W-36e-*`, `W-36f-scout.md`, `W-32r4b-*` if still untracked — re-run
`git status` and take what is actually there).

**Untracked — evidence dirs:** `docs/3d-audit/fill-audit/after/{T2-5,T3b,T3c,W-32r4,W-36f}/` plus a
long tail of `**/shots/` subdirectories.

⚠ **`shots/` IS NOT COMMITTED.** Exclude it with a pathspec rather than by staging and un-staging:

```
git -C $M add -- docs/3d-audit/STILL-OPEN.md docs/3d-audit/fill-audit-handoff.md \
                 docs/3d-audit/lane-reports docs/3d-audit/fill-audit/after \
                 ':!docs/3d-audit/**/shots' ':!docs/3d-audit/**/shots/**'
git -C $M status --short --cached -- . ':!graphify-out'   # eyeball it: docs ONLY, no shots/
git -C $M commit -m "docs(3d-audit): round-4 lane reports + evidence (pre-merge)"
```
Check sizes first (`du -sh docs/3d-audit/fill-audit/after/*`) — a several-hundred-MB stage means a `shots/`
dir slipped through the pathspec. **Never `git add -A`.**

The **PreToolUse version-bump hook will not fire** (nothing under `src/`, `tests/`, `index.html` is
staged) — confirmed by reading `.claude/settings.json`'s matcher.

### 1.3 Dev servers — what to kill and what not to

```
pgrep -fl "dev-server.js"
```
- **Port 8460 (`<MAIN>/scripts/dev-server.js 8460`) — LEAVE RUNNING.** MAIN's gallery.
- **Port 8475 (`fill-audit-a4`) — LEAVE RUNNING** unless §9 has confirmed the lane implementer is finished.
- Start **one** server for the integration worktree on **8490** (free), plus
  `node scripts/dev-server.js 4173` before `test:e2e` (Playwright's `reuseExistingServer`).

---

## 2. INTEGRATION BRANCH AND MERGE

### 2.1 A NEW worktree, never MAIN's tree

```
G0="git -C /Users/jayphi/Documents/github/vectura-studio"
$G0 worktree add /Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/integrate-r4 \
    -b 3d-scene/integrate-r4 <the docs commit from §1.2, or b43fa4e3 if §1.2 produced nothing>
ln -s /Users/jayphi/Documents/github/vectura-studio/node_modules \
      /Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/integrate-r4/node_modules
```
CLAUDE.md: one active workstream per worktree; MAIN is where the orchestrator works. **Do not integrate in
MAIN's tree, and do not reuse `integrate-r3`.**

### 2.2 MERGE, do not rebase — and never squash

**Binding, not preferable.** Round 4 adds a *new* reason on top of round 3's:
`tests/unit/scene3d-mkdashramp-discrete.test.js:80` pins **`T3C_BASE_SHA = '75777240'`** — a commit that
exists **only on the `fill-audit-a4` lane** — and reads it back at runtime with
`execFileSync('git', ['show', …])`. `scene3d-mkdashramp-single-pass.test.js:85` pins
`T3B_BASE_SHA = 'b43fa4e3'` (main). Joined by nine older pins (§4 item 23). **Rewriting history with a
rebase or a squash destroys `75777240` and that test dies with `fatal: invalid object name`.**

```
G="git -C /Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/integrate-r4 -c core.hooksPath=/dev/null"
$G merge --no-ff --no-commit 3d-scene/<lane>
#   ...inspect, resolve, then...
$G commit -m "merge: <lane> (<units>)"
```
`-c core.hooksPath=/dev/null` on **every** git command: the graphify post-checkout hook has aborted
checkouts in this repo before, and the pre-commit hook is pure time cost (graphify-out is gitignored).
The **version bump hook is a Claude Code PreToolUse hook, not a git hook** — `core.hooksPath` does not
affect it; §6 handles it.

### 2.3 Measured file overlap — the whole of it

`git diff --name-only b43fa4e3..<lane>`, intersected:

| pair | shared files |
|---|---|
| `fill-audit-a4` ∩ `border-4` | **exactly one: `tests/unit/scene3d-mktick-wedge.test.js`** |
| each lane ∩ `main` (`b43fa4e3..HEAD`) | **none** — `main` has not moved since both lanes branched |

**`src/` is provably disjoint:** `border-4` = `src/core/algorithms/scene3d.js` (edge pass) only;
`fill-audit-a4` = `src/core/scene3d/surface-fill.js` only.

`git merge-tree b43fa4e3 3d-scene/fill-audit-a4 3d-scene/border-4 | grep -c '<<<<<<<'` → **1**
(one conflict hunk, in that one file). **Re-run this simulation immediately before merging** — a4's HEAD
moves (§9).

### 2.4 Merge order — **`border-4` FIRST, `fill-audit-a4` SECOND**

Three reasons, in order of weight:

1. **`border-4` is CLOSED and FINAL; `fill-audit-a4`'s HEAD will still move (T2-6).** Merging the stable
   lane first means a late T2-6 costs **one re-merge of one lane**, not a re-run of the chain. This is the
   round-3 ordering rule applied to round 4's facts.
2. **The conflict must be resolved on a tree that already contains the edge refinement.** The twelve
   goldens are hashes of the **whole `scenePaths` output — fill *and* edge together** (W-32r4c's own commit
   body says so explicitly). Re-deriving them is only meaningful once `scene3d.js`'s refined edge is in the
   tree. Landing `border-4` first puts the conflict inside merge #2, where the tree is already correct.
3. **`border-4` carries `CHANGELOG.md` and `plans.md` edits.** Landing them first means §7's doc work
   *edits the final text* instead of racing it. `fill-audit-a4` touches neither file, so there is no
   contention.

### 2.5 The conflict, and the rule for it — **`tests/unit/scene3d-mktick-wedge.test.js`**

**The measured facts.** The file pins an `EXPECTED_SIGNATURE` map of 12 `pathSignature` goldens
(3 primitives × 2 mappers × 2 rigs). Extracted read-only from all three refs:

| cell | `b43fa4e3` (base) | `border-4` `5d8574da` | `fill-audit-a4` `0f420747` |
|---|---|---|---|
| `test\|sphere/hatch` | `af0b4a91…` | **`fec6f83a…`** | **`e1d6e011…`** |
| `test\|sphere/contour` | `93933cdf…` | **`b1b3def0…`** | **`4e4524ab…`** |
| `test\|torus/hatch` | `7c12b6b4…` | *unchanged* | **`cd2c062e…`** |
| `test\|torus/contour` | `aa9ea62c…` | *unchanged* | **`e1312b97…`** |
| `test\|cone/hatch` | `828e0284…` | **`dacfc575…`** | **`eb8ce546…`** |
| `test\|cone/contour` | `3aff4e5c…` | **`3760b050…`** | **`9703754b…`** |
| `create\|sphere/hatch` | `7de0d679…` | **`1ea20309…`** | **`58b1b7f1…`** |
| `create\|sphere/contour` | `ee6137a0…` | **`6b6edd1e…`** | **`239b2fbc…`** |
| `create\|torus/hatch` | `46725241…` | *unchanged* | **`41d0659d…`** |
| `create\|torus/contour` | `558ff66b…` | *unchanged* | **`8a752bfb…`** |
| `create\|cone/hatch` | `552411c8…` | **`14097362…`** | **`d1c30487…`** |
| `create\|cone/contour` | `3a64b05a…` | **`d9a36e63…`** | **`2b1234f1…`** |

`border-4` moved **8** (sphere + cone, both mappers, both rigs; **torus untouched — its convexity gate
excludes the torus**, and that untouched pair is W-32r4c's own in-file proof the gate holds).
`fill-audit-a4` at the T2-6 WIP moved **all 12** (T2-5 moved 4; T2-6's graded comb moved the rest).

**THE RULE — take neither side.** A golden pinned on one lane cannot be valid after the other lane's
geometry lands, and both causes are real and both were reviewed. **Re-derive all twelve on the MERGED
tree and re-run this file's own contrast mutation.** Procedure:

1. **Resolve the text, not the numbers.** Keep **both** provenance comment blocks — `fill-audit-a4`'s
   T2-5/T2-6 note and `border-4`'s W-32r4c note — and **one** `EXPECTED_SIGNATURE` object. Populate it
   with either side's values *purely so the file parses*; they are placeholders and you will overwrite
   every one.
2. **Measure.** `npx vitest run tests/unit/scene3d-mktick-wedge.test.js` (foreground, `timeout: 600000`).
   Each pin is an `expect(...).toBe(golden)`, so vitest prints the **received** value for every failure.
3. **Write the twelve received values in**, then re-run the file whole.
4. **Re-run the file's own contrast mutations — they are tests inside the same file, so step 3's whole-file
   run does it, and both must still trip:** `MUTATION-KILL 2` (the T2-3 stagger disabled by substituting
   `const room = 0;` into the real source, ~`:181`–`:198`, gating the six-cell mean `wedge25` bar at
   `:471`) and the `O5` length-ratio + monotonicity bars at `:422`. **A re-pin that leaves a mutation
   passing-when-it-should-fail is not a re-pin, it is a broken oracle — STOP.**
5. **Add a THIRD provenance comment** stating the merged-tree derivation, and disclose **all twelve** under
   `## Bars changed` as
   `tests/unit/scene3d-mktick-wedge.test.js:<line> — <a4 value> / <border-4 value> → <merged value> — re-derived on the merged tree; neither lane's pin is valid once the other's geometry lands`.

**The falsifiable prediction that makes this honest — check it, do not assume it:**

- **The four `torus/*` cells must come back byte-identical to `fill-audit-a4`'s values** (`cd2c062e…`,
  `e1312b97…`, `41d0659d…`, `8a752bfb…`). The torus is excluded by W-32r4's convexity gate, so only a4's
  fill change may move it. **If a torus cell differs from a4's value, the convexity gate leaked into the
  torus — that is a real product defect, not a re-pin. STOP.**
- **The eight `sphere/*` and `cone/*` cells must differ from BOTH sides.** They carry a fill delta *and*
  an edge delta. **If one comes back byte-identical to `fill-audit-a4`'s value, the edge refinement did
  not reach that cell** — investigate before accepting; do not write the number down and move on.

### 2.6 Resolution rules for everything else

| file | rule |
|---|---|
| `CHANGELOG.md`, `plans.md` | **`border-4` only.** Cannot conflict at merge. §7 edits the post-merge text; **re-read the region immediately before editing** (CLAUDE.md's highest-collision files). |
| `src/core/algorithms/scene3d.js` | **`border-4` only.** Any conflict here means a lane HEAD moved → **STOP condition 1**. |
| `src/core/scene3d/surface-fill.js` | **`fill-audit-a4` only.** Same. |
| the 8 other `border-4` test files | **single author.** Any conflict → STOP condition 1. |
| the 8 other `fill-audit-a4` test files | **single author.** Same. |
| `graphify-out/**` | **cannot conflict** — untracked and gitignored. If you see it staged: `git rm -r --cached graphify-out`. |
| anything else | **STOP condition 1.** §2.3 is a measured fact about these shas. |

---

## 3. RECONCILIATION ON THE INTEGRATED TREE

### 3.1 Expected-red list, with a disposition each

| test | expected after the merge | disposition |
|---|---|---|
| `tests/unit/scene3d-mktick-wedge.test.js` | **12 pinned-golden failures, by construction** (both sides' pins are stale) | 🔧 **RE-DERIVE per §2.5, disclose all twelve under `## Bars changed`.** This is the one planned re-pin of the round. **Not** a regression, **not** "just update the expected value" — the mutation re-run is what separates the two. |
| `tests/unit/scene3d-facet-min-rulings.test.js` | **79/79 GREEN with `border-4`'s 12 sphere hashes** | ✅ **Verify only.** `border-4` re-pinned the sphere entries for its edge change; `fill-audit-a4`'s fill changes are scoped to the `mkTick`/`mkDashRamp` laws and this file drives `ladder`/`etfKang` only (verified read-only: no `mkTick`/`mkDashRamp` occurrence in the file). **A red here means a4's fill change reached a non-mkTick law — bisect it; do not re-pin.** |
| `tests/unit/scene3d-box-density-bearing.test.js` | **4/4 GREEN** with `border-4`'s sphere `fingerprint(50)`/`fingerprint(150)` | ✅ Verify only. Same reasoning. ⚠ The file **throws on its first failing expect**, so d=150's value is masked until d=50 passes — a single failure here may hide a second. |
| `tests/unit/scene3d-curves.test.js`, `tests/unit/scene3d-hlr-spatial-index-identity.test.js` | **GREEN** with `border-4`'s re-pins | ✅ Verify only. `hlr-spatial-index-identity` is a **byte-identity guard** — this audit has caught that class re-pinned without proof before. **Never carry a pre-merge pass count forward; re-run it on the merged tree.** |
| `tests/unit/scene3d-fill-boundary-ends.test.js` (49/49, incl. W-32r4b's `SIL_SAGITTA_BAR_MM = 0.20`) and `tests/unit/scene3d-fill-silhouette-overshoot.test.js` (401/401) | **GREEN** | ✅ Verify only. Both drive `DEFAULT_STYLE`, never `mkTick`/`mkDashRamp` (verified read-only). **A red means a4's fill change moved a fill endpoint under the default law — a real finding.** |
| the six new/edited `fill-audit-a4` test files (`mktick-band-purity`, `mktick-gap-fill`, `mkdashramp-discrete`, `mkdashramp-single-pass`, `ribbon-fill-depth-count`, `curved-density-floor`) | **GREEN** | ✅ Verify only. **The prediction and its basis:** W-32r4 measured **fill ink byte-identical (0.000 % on 132 cells)** — only whole-`scenePaths` fingerprints move, and every bar in these six is fill-measured (`meta.kind === 'sceneFill'` filters, ruling-length sums, per-cell RP thresholds). **Record that immunity as MEASURED, not argued.** |
| `tests/unit/scene3d-curved-density-sparse-end.test.js` (W-33's md5 goldens over torus/cone/sphere) | **GREEN** | ✅ Verify only — `border-4`'s own sweep ran it green on its lane; it drives `ladder`/`taperedEnds`/`bundleCount`, none of them a4's laws. **Round 3 re-pinned W-33's golden once; do not re-pin it again.** |
| `tests/unit/text-fill-watertight.test.js` | **68/68 GREEN** | ✅ No action. Round 3 reclassified it: its "EXPECTED TO FAIL" header is stale documentation, green on main and on the merged tree. |
| everything else | **GREEN** | Any other red is a merge interaction. Disclose with arithmetic; never re-pin. |

**Baseline to compare against** (round-3 merge at v1.4.2, zero failures): unit **5630 passed + 44 skipped
(5674)** · integration **1998** · e2e **62 + 7 skipped** · visual **99 + 13 skipped** · perf **10**.
Round 4 adds **5 new unit files** on a4 (`mkdashramp-discrete`, `mkdashramp-single-pass`,
`mktick-band-purity`, `mktick-gap-fill`, `ribbon-fill-depth-count`) **+ 1** on border-4
(`fill-silhouette-overshoot`) **= 6**, so unit must **rise**. Integration is untouched by both lanes — it
should be **flat at 1998**. **A drop in either is a signal, not noise.**

### 3.2 `## Bars changed` at the merge — the standing rule

Every threshold, tolerance, count bar, pinned fingerprint **or measured population/fixture** you touch
while reconciling goes in the merge report under `## Bars changed` as `file:line — old → new — why`, **and
in the merge commit body**. **Round-4 budget: the twelve `scene3d-mktick-wedge` goldens of §2.5, and
nothing else.** Anything beyond them is **STOP condition 2** until you can prove the interaction with
numbers.

### 3.3 Behaviours NO SINGLE LANE COULD TEST — four checks, each with a bar

These exist only on the integrated tree. **Rounds 1, 2 and 3 each found a live product defect exactly
here.** Do all four, and **LOOK at the pictures at native-resolution crop** (a whole 800 px cell hides
sub-mm defects — that is how a cull cutting mid-ring passed implementer, reviewer and every metric).

**(a) T2-6's GRADED BAND COMB × W-32r4's REFINED SILHOUETTE, on the CONE.**
T2-6 replaces the right-hand fragments with a geometric run of sub-ticks `each_j = e0·ρ^j` whose sum is
`sv.L` (ink area bit-identical), **longest at the dark edge** — i.e. it deliberately pushes mark ends
*toward the band edge*. W-32r4 simultaneously moves the drawn cone outline **outward** onto the analytic
silhouette (the old chord polygon sat up to 0.52 pen inside it). Neither lane has the other's code, and
the comb has never been drawn against a refined outline.
**Check:** `npx vitest run tests/unit/scene3d-mktick-gap-fill.test.js` and
`npx vitest run tests/unit/scene3d-mktick-band-purity.test.js` on the merged tree.
**Bars:** gap-fill's per-cell `A1b` floors must hold on `cone/hatch` and `cone/contour`, both rigs
(the two `create|torus/*` cells are excluded by the file's own `bandOn` gate — that exclusion is the
lane's, not yours); band-purity's **`O-C2` over-long-tick census must stay 0** on `cone/hatch` **and** its
`MUTATION-KILL` (force `nOver = 1` on `torus/contour`) must still trip.
**Then look:**
`node scripts/audit/scene3d-capture.js --tier B --rig create --root <integrate-r4> --port 8490 --only '^cone__(hatch|contour)__mkTick__(med|max)__[ab]$' --out docs/3d-audit/fill-audit/after/MERGE-r4`
and **crop the cone's right flank at native resolution**. **Bar for the eye:** no sub-tick end may cross
the refined grey outline. If one does, the comb is now over-running a border that moved outward under it —
record it, name it as a round-5 unit, do **not** fix it inside the merge.

**(b) T3c's DASH-LENGTH BOUND × the REFINED BORDER, on SPHERE ends.**
T3c bounds dash length below `MK_BAND_ONSET_D` (avg dark-mark length at `sphere/hatch` d=1:
3.33 → 1.95 mm) so dashes read as discrete. The sphere's drawn outline has moved outward by up to 0.52 pen.
A bounded dash that used to terminate *at* the chord outline now terminates *inside* the refined one — or
past it.
**Check:** `npx vitest run tests/unit/scene3d-mkdashramp-discrete.test.js`,
`…-single-pass.test.js`, `…-low-end.test.js`, `…-dark-end.test.js` — all green, **and**
`npx vitest run tests/unit/scene3d-fill-boundary-ends.test.js` (49/49, the sagitta bar) on the merged tree.
**Then look:** capture `^sphere__hatch__mkDashRamp__(low|med)__[ab]$` and crop the silhouette band.
**Bar for the eye:** dashes at the silhouette read as discrete marks riding the rulings (Jay's own words
for T3c, which its picture met on the lane) — **not** as barbs crossing the outline, and **not** as a
gap opening between the last dash and the border.

**(c) T2-5/T2-6's mkTick mechanism × `scene3d-facet-min-rulings`'s pins.**
Round 3's merge found exactly this shape: W-36c's crosshatch change moved this file's goldens from another
lane. `border-4` has now re-pinned its **12 sphere entries**, and `fill-audit-a4` is live in the
mark-law sink beside it.
**Check:** `npx vitest run tests/unit/scene3d-facet-min-rulings.test.js` (**expect 79/79**) and
`npx vitest run tests/unit/scene3d-box-density-bearing.test.js` (**expect 4/4**).
**Bar:** green with `border-4`'s values, unmodified. **If red:** bisect on scratch `git archive` exports
(never in a lane worktree) to decide whether a4's fill change reached `ladder`/`etfKang`. **A re-pin here
requires that bisection, the causal commit, and a control showing the box/solid/plane entries unmoved** —
which is exactly the proof round 3's merge produced for the same file.

**(d) W-36e's INTERIOR CROSSHATCH BAR × the border refinement — and the ELLIPSOID, the case no test covers.**
W-36e added an interior-shape sub-bar (`crossFamilyBInk` step ratio ≥ 1.02 at r = 0.25/0.8/0.9/1.0,
d = 10 and 100) to `scene3d-curved-density-floor.test.js`. **Read-only finding, already measured:** that
bar's own fixture is the **TORUS** (`:189`), which W-32r4's convexity gate **excludes** — and the file's
other curved describes count with `paths.filter(p => p.meta.kind === 'sceneFill')` (`:64`), i.e. fill-only.
**So the naive expectation is total immunity — verify it rather than assert it.**
**Check:** `npx vitest run tests/unit/scene3d-curved-density-floor.test.js` (green), then the case **no
test covers**: the **ellipsoid**, W-32r4's own worst cell (0.72 pen), which no crosshatch or tick unit has
ever looked at. Capture `^ellipsoid__crosshatch__(ladder|mkTick)__(med|max)__[ab]$` on the merged tree and
**crop the outline at native resolution**. **Bar for the eye:** the crosshatch families terminate on the
refined outline, not inside it and not across it; no new bare rim. **Record what you see either way** —
a clean ellipsoid is the evidence that `border-4`'s worst cell survives a4's densest fill.

---

## 4. THE CHECKLIST — rounds 2/3 restated in operative form, plus round-4's own

Items discharged in earlier rounds are marked and owe nothing.

| # | requirement | command / file | status |
|---|---|---|---|
| 1 | *"Rebase every lane before merging."* | **OVERRULED — `git merge --no-ff`, never rebase, never squash** (§2.2; `T3C_BASE_SHA = '75777240'` is a lane commit read back at runtime). Record the overrule. | ruling |
| 2 | Bump the version **from** the current `package.json`, once, at the merge | `node -e "…"` → **1.4.2** → **1.4.3** (§6) | owed |
| 3 | Hand-merge the multi-author file first | **DISCHARGED BY MEASUREMENT.** The only file with two authors is `scene3d-mktick-wedge.test.js` (§2.5). No other file has more than one. | measured |
| 4 | Re-verify every byte-identity / md5 / fingerprint claim **after** integration | `scene3d-hlr-spatial-index-identity`, `scene3d-curves`, `scene3d-facet-min-rulings`, `scene3d-box-density-bearing`, `scene3d-ribbon-fill-depth-count` (F1-count's 30/30 md5 sweep). **Never carry a pre-merge pass count forward.** | owed |
| 5 | Relocate in-worktree reports / delete leftover probe files | `git -C <integrate-r4> ls-files tests/ \| grep -E 'zzz-\|-perf\.test\.js$'` and `ls <MAIN>/scripts/*.js`. Round-4 lanes are clean (all reports already in MAIN). Verify, expect nothing. | verify |
| 10 | W-33's `torus + contour + ladder @ d=50` golden | **Re-pinned once in round 2. DO NOT re-pin again.** Verify green: `npx vitest run tests/unit/scene3d-curved-density-sparse-end.test.js` | verify |
| 14 | `build-user-presets.js` has **no `--dry-run`** | Standing note. If you run it, verify with `git status`, never trust a flag. | note |
| 18 | Rebuild the gallery **LAST**, once | §7b. **Orchestrator only.** | owed |
| 19 | Every bespoke evidence script under `scripts/audit/` | `ls <MAIN>/scripts/*.js \| grep -vE 'build-\|sync-\|run-vitest\|dev-server\|patch-\|skin-new\|push-and-watch'`. Round-4 lanes added no root-level script. | verify |
| 20 | Numbers that must **NOT** be copied forward verbatim | **Do not write into `CHANGELOG.md`:** U8's "426/426" · U6's "550" · U9b-2's "328" · W-27c-0a-6's "fires only on the torus's level-6 ring" · W-30d's "the fix" for the thin-torus void. **New for round 4: do not write T2-5 clause (a) as "partial"** — the reviewer explicitly rejects that label and rules it **~0 % of the substantive ask**; and **do not quote `MK_BAND_ONSET_D = 35` as the onset** — T3c's reviewer measured the true cliff at **d ≈ 32**. | binding |
| 21 | CHANGELOG must carry **limitations**, not just features | §7.1's `### Known limitations` — round 3's, **amended** for W-36f, plus round 4's own. | owed |
| 22 | Guards whose green rests on ARGUMENT rather than a re-run | Re-run on the integrated tree: `scene3d-hlr-spatial-index-identity` and the U0 48-law byte-identity sweep inside `scene3d-tone-law-collapse`. | owed |
| 23 | **`git show HEAD:` idiom sweep — BROKEN as well as vacuous instances** | **SWEPT READ-ONLY 2026-09-18 on `b43fa4e3` and both lanes. Table below.** | **1 unowned, still** |
| 24 | Sweep **both cameras** when re-verifying anything in the slices pass | **No round-4 lane touches the slices pass.** Rule only — but it applies to §3.3's captures: shoot camera `a` **and** `b`. | rule |
| 25 | Reconcile every intentionally-red / skipped test | Re-sweep on the merged tree: `git grep -n -iE "intentionally[ -]red\|expected to fail\|\.fails\(\|test\.skip\(\|it\.skip\(" -- tests/`. Round 3 closed every hit (`text-fill-watertight` reclassified 68/68 green). **Expect no new hit; a new one is a lane leaving a skip behind.** | owed |
| 26 | `test:ci` must include **e2e AND visual** | §5.3. **Round 4 ships NO CSS change** — but `border-4` changes what is *drawn* on every curved primitive, which is exactly what `test:visual` baselines. **Not optional.** | owed |
| 27 | Record which **rig** each `after/<W-id>/` dir was shot on | For each new round-4 evidence dir: `grep -l '"rig"' <dir>/report.json \|\| echo "$dir NO RIG FIELD"`. Add `"rig": "create"` / `"addLayer"` / `"create+addLayer"`. ⚠ **And the consequence beside it: an unexplained byte-identical before/after pair may mean the GALLERY CANNOT SEE THE FIX (rig mismatch), not that the fix does nothing.** | owed |
| 28 | d=220 tone-vacuity sweep | **Closed 2026-09-13, zero hits.** Durable note: tone-preservation bars are measured at **d=50**. | closed |
| 29 | **CHANGELOG must disclose the crosshatch cap's consequence, whichever way Jay answers** | §7.1. **Round 4 amends it: a retune was MEASURED INFEASIBLE.** Word it as a stated measurement with the choice explicitly pending. **Do NOT pick (A) or (B).** | owed |
| 30 | **Ground-plane inclusion stated beside every ink number** | **AUDITED READ-ONLY 2026-09-18 — result and rule below.** | **owed (8 reports)** |
| **R4-1** | **NEW — the curved-primitive golden grep (standing rule), run on the MERGED tree** | Table and command below. | **owed** |
| **R4-2** | **NEW — the fixture-statement audit** (§0 rule 3: every number states rig, camera, density, non-default params, **and** ground-plane inclusion) | Table below, folded into item 30. | **owed (8 reports)** |
| **R4-3** | **NEW — decision 11-amended is PENDING: no CHANGELOG line may pre-empt Jay** | §7.1 + §8. | **binding** |
| **R4-4** | Round-3 review's two doc follow-ups | **(a)** the `scene3d-slice-end-overlap.test.js` vacuous-leg item in `plans.md` still **lacks a numbered W-id** — assign one. **(b)** README has **five** inline release-note headings (1.4.2/1.4.1/1.4.0/1.3.99/1.3.85); the README Standard is **three**. Round 4 adds a sixth — push the surplus into the `<details>` panel (§7.2). | **owed** |

### Item 23 — the sweep, run read-only on `b43fa4e3` and both lanes

```
git grep -n -E "git show HEAD:|git show HEAD "  <ref> -- tests/ scripts/
git grep -n -E "exec(File)?Sync"                <ref> -- tests/
```
(a bare `git show HEAD` text grep is **not enough** — `scene3d-slice-end-overlap.test.js` builds the
argument list and a naive grep walks past it.)

| file:line | form | verdict |
|---|---|---|
| `tests/unit/scene3d-slice-end-overlap.test.js:44,127` (already on `main`, W-35) | `execFileSync('git', ['show', 'HEAD:'+SCENE3D_REL])` — **LIVE** | ⚠ **VACUOUS FOREVER, AND STILL NO UNIT OWNS IT** — third round running. On a clean tree `HEAD` ≡ the loaded source, so the "byte-identical default" leg can never fail. **Merge action: assign it a numbered W-id in `plans.md` (item R4-4a). Do NOT fix it inside the merge** — it is a tests-only unit that needs its own mutation proof. |
| `tests/unit/scene3d-mkdashramp-discrete.test.js:80` (a4, **new**) | `T3C_BASE_SHA = '75777240'` | ✅ correct pattern — **but the sha is LANE-ONLY. §2.2 (no rebase, no squash) is what keeps it alive.** |
| `tests/unit/scene3d-mkdashramp-single-pass.test.js:85` (a4, **new**) | `T3B_BASE_SHA = 'b43fa4e3'` | ✅ correct pattern (main's own sha) |
| `tests/unit/scene3d-mktick-wedge.test.js:~282` | **comment only** — T2-3b's record that it *removed* the idiom | ✅ no action |
| `tests/unit/scene3d-facet-min-rulings.test.js:35`, `scene3d-shadow-tone-gradient.test.js:177` | **comment only** | ✅ no action |
| `tests/helpers/pre-wip-surface-fill.js:16,107` (`1b157bc6`, `e047c9a7`) and the sha-pinned tests (`90f3411f`, `1e681432`, `8e9b0991`, `2d931b1a`, `83d1e021`, `8780e97c`, `8adfd5af`, `d5af9e30`, `ecc50c16`, `57e86f48`) | fixed historical pins | ✅ correct pattern |
| `scene3d-tone-laws-config.test.js`, `skin/skin-sdk.test.js` | `execFileSync(node, …)` — no `git` | ✅ irrelevant |

**Post-merge reachability check — run it before the suites:**
```
for s in 1b157bc6 e047c9a7 90f3411f 1e681432 8e9b0991 2d931b1a 83d1e021 8780e97c 8adfd5af \
         d5af9e30 ecc50c16 57e86f48 b43fa4e3 75777240; do
  git -C <integrate-r4> cat-file -e ${s}^{commit} && echo "$s ok" || echo "$s MISSING"
done
```
**`75777240` MISSING ⇒ someone squashed or rewrote a lane. STOP.**

### Item R4-1 — the curved-primitive golden grep, on the MERGED tree

**Standing ruling (2026-09-18, from W-32r4's REJECT):** *an edge-geometry change must run **every**
pinned-golden file over curved primitives before commit — **grep, don't recall**.* W-32r4's fix, oracle,
evidence and both disclosed re-pins all reproduced exactly; it was rejected because **the tree was not
green** in three files it never ran (21 assertions). **Round 4's merge puts an edge change and a fill
change in one tree, so the rule applies to the merge itself.**

```
git -C <integrate-r4> grep -nE "toBe\('[0-9a-f]{32,64}'\)|EXPECTED_SIGNATURE|EXPECTED_T1|pathSignature|md5PathsAll|fingerprint\(" -- tests/
```
**Candidate set measured read-only on `b43fa4e3`** (34 files carry a golden/md5/signature form; these are
the ones whose fixtures include a curved primitive — run every one):

`scene3d-mktick-wedge` · `scene3d-facet-min-rulings` · `scene3d-box-density-bearing` ·
`scene3d-curves` · `scene3d-hlr-spatial-index-identity` · `scene3d-curved-density-sparse-end` ·
`scene3d-curved-density-floor` · `scene3d-contour-slice` · `scene3d-slice-end-overlap` ·
`scene3d-faceted-tone-law` · `scene3d-solid-cap-reachability` · `scene3d-area-light-shadow-softening` ·
`scene3d-shadow-footprint-torus-hole-accuracy` · `scene3d-shadow-footprint-wiring` ·
`scene3d-shadow-receive-lighttypes` · `scene3d-ribbon-width-bar` · `scene3d-ribbon-width-create-rig` ·
`tests/visual/scene3d-tone-baseline` · plus round-4's own new files (`scene3d-mktick-band-purity`,
`scene3d-mktick-gap-fill`, `scene3d-mkdashramp-discrete`, `scene3d-mkdashramp-single-pass`,
`scene3d-ribbon-fill-depth-count`, `scene3d-fill-silhouette-overshoot`).

⚠ **The whole set is inside `test:unit` + `test:visual`, so §5.3's suite run covers it — but run the list
TARGETED FIRST**, one file per command. The point of the rule is that a suite failure 40 minutes in is a
worse place to discover a stale golden than a two-minute targeted run.

⚠ **And re-apply the older companion ruling:** *when a sweep reports a changed law, grep for pins on that
law and check the **fixture** each pin uses — not just the law name.* A law-name match is a hit list, not a
verdict: primitive, mapper **and** density must agree before a pin is at risk **and** before you may call
it safe. **Re-pinning a guard that was never threatened is the same class of damage as missing one that
was.**

### Items 30 + R4-2 — ground-plane and fixture statements, audited read-only on the round-4 reports

`grep -icE "ground[- ]?plane"` and `grep -icE "\brig\b"` against every round-4 report carrying ink numbers:

| report | ink numbers | ground-plane stated | rig named | action |
|---|---|---|---|---|
| `T3b-impl.md` | 9 | **no** | yes (9) | **add one line** |
| `T3b-review.md` | 6 | **no** | yes (7) | **add one line** |
| `W-36e-impl.md` | 2 | **no** | **no** | **add rig + ground line** |
| `W-36e-verify.md` | 2 | **no** | **no** | **add rig + ground line** |
| `F1-count-impl.md` | 1 | **no** | yes (1) | **add one line** |
| `T3c-review.md` | 1 | **no** | yes (9) | **add one line** |
| `W-32r4-review.md` | 3 | **no** | yes (1) | **add one line** |
| `W-36f-scout.md` | 9 | **no** | yes (3) | **add one line** |
| `T2-5-plan.md`, `T2-5-impl.md`, `T2-6-plan.md`, `W-32r4-plan.md`, `W-32r4-impl.md` | — | **yes** | yes | ✅ compliant, no action |

*(Re-run the two greps after §9 — T2-6's finished `T2-6-impl.md` will add a row.)*

**This is ANNOTATION, not re-measurement.** The construction decides it and the construction is readable:

| rule | evidence | verdict |
|---|---|---|
| **A** — any number from `scripts/audit/scene3d-capture.js`, **either rig** | `:270–272` sets `groundChild.visible = false`; `:291` sets `q.ground = { enabled: false }`; `inkMm` at `:329–351` sums what remains | **EXCLUDES ground** |
| **B** — a bespoke harness that does not explicitly disable the ground | measured residual is a near-constant **~2269 mm across every law** on the torus/hatch fixture | **INCLUDES ground** |
| **C** — a unit harness that builds one primitive directly (`SurfaceFill.buildObject`, `Scene3D.generate()` on a single-object doc) | no ground child ever exists | **object-only / N/A** |
| **D** — `tests/helpers/scene3d-ribbon-width-create-rig.js` | sets `g.params.ground = { enabled: false }` with a structural guard | **EXCLUDES, guarded** |

**Merge task:** for each report above, identify the harness (the report names its script), apply
A/B/C/D, and add **one line** under its numbers: *"Ink totals EXCLUDE / INCLUDE ground-plane ink (measured
via `<script>`; rule `<A|B|C|D>`). Fixture: rig `<create|addLayer>`, camera `<a|b>`, density `<d>`,
non-default params `<…>`."*
⚠ **A stop-condition percentage computed with ground included, against a baseline computed without it, is
simply a different number** — the ~35–40 % divergence that cost three units to diagnose was exactly this.
**Nothing goes into `CHANGELOG.md` or a future baseline until its line exists.**

---

## 5. TEST PLAN

### 5.1 The binding rule, verbatim

> Run every vitest file in the FOREGROUND with the Bash tool parameter `timeout: 600000` (ten minutes).
> Never use `run_in_background`, never arm a Monitor and end your turn. If a file still exceeds ten
> minutes, kill it and rerun alone with `--pool=forks --poolOptions.forks.singleFork=true`, again with
> `timeout: 600000`.

**Node 20 required** (`.nvmrc` v20.20.2); no `NODE_OPTIONS`. `vitest.config.mjs` already sets
`testTimeout`/`hookTimeout` 180000 and `poolOptions.forks.maxForks: 4` — those bound **vitest**, not the
Bash tool; `timeout: 600000` is the one that stops the backgrounding. **Run one file per command** — under
`singleFork` a multi-file batch can silently truncate to the first file's results.

### 5.2 Known-slow files

**Tier 1 — the only one, and it exceeds the tool's 600 000 ms ceiling:**
`tests/unit/scene3d-tone-law-collapse.test.js` — 121 tests, measured 390 s → 1045 s across this audit
(846.78 s in T2-5's own run). **Start it foreground with `--pool=forks --poolOptions.forks.singleFork=true`
and `timeout: 600000`; LET THE TOOL BACKGROUND IT when the ceiling hits; carry on with other verification;
read the result from the tool's own completion notification. Do NOT pass `run_in_background`, do NOT arm a
Monitor, do NOT end your turn waiting.** 600 000 ms is the tool maximum. **This is a tool constraint, not
a protocol deviation.**

**Tier 2 — near or over the default 120 s under load; give each `timeout: 600000`:**
`tests/integration/scene3d-fill-style-picker.test.js` (177 tests) · `scene3d-mark-laws-draw.test.js`
(**T2-5/T3b/T3c's own oracle file — heaviest of the round**) · `scene3d-ribbon-wall-coverage.test.js`
(44 s) · `scene3d-ribbon-f1b-streaks.test.js` (34 s) · `scene3d-hlr-spatial-index-identity.test.js` ·
`scene3d-mesh-self-occlusion.test.js` · `scene3d-shadow-receive.test.js` · `scene3d-shadow-anatomy.test.js` ·
`scene3d-shadows.test.js` · `scene3d-shadow-tone-gradient.test.js` · `scene3d-curved-density-floor.test.js`
and `-sparse-end.test.js` · `scene3d-contour-slice.test.js` (67/67 in 23 s — **Tier 2, not Tier 1**).
**New this round, treat as Tier 2 until measured:** `scene3d-mktick-band-purity.test.js` and
`scene3d-mktick-gap-fill.test.js` (both render 6 cells × 2 rigs plus mutation re-renders).

**Benign, not regressions:** one `[vitest-worker]: Timeout calling "onTaskUpdate"` RPC warning with
**exit code 0**; `[FillBoolean] polygon union failed on degenerate geometry` on stderr; one documented
`scripts/run-vitest.js` retry that then passes. **Two different failures are a failure.**

### 5.3 The run — `npm run test:ci`, split into its five suites, foreground, one at a time

`test:ci` = `test:unit && test:integration && test:e2e && test:visual && test:perf`. **Run the suites
separately** so a failure is attributable.

```
# 1. THE CONFLICT FILE FIRST — it is the only planned re-pin (§2.5)
npx vitest run tests/unit/scene3d-mktick-wedge.test.js

# 2. item R4-1's curved-primitive golden grep set, one file per command
npx vitest run tests/unit/scene3d-facet-min-rulings.test.js           # expect 79/79
npx vitest run tests/unit/scene3d-box-density-bearing.test.js         # expect 4/4
npx vitest run tests/unit/scene3d-curves.test.js
npx vitest run tests/unit/scene3d-hlr-spatial-index-identity.test.js  # byte-identity guard, fresh run
npx vitest run tests/unit/scene3d-curved-density-sparse-end.test.js   # W-33's golden — do NOT re-pin
npx vitest run tests/unit/scene3d-curved-density-floor.test.js        # W-36e's interior bar
npx vitest run tests/unit/scene3d-contour-slice.test.js
npx vitest run tests/unit/scene3d-slice-end-overlap.test.js
npx vitest run tests/unit/scene3d-faceted-tone-law.test.js
npx vitest run tests/unit/scene3d-solid-cap-reachability.test.js
npx vitest run tests/unit/scene3d-ribbon-width-bar.test.js
npx vitest run tests/unit/scene3d-ribbon-width-create-rig.test.js

# 3. the two lanes' own oracles and the §3.3 cross-lane checks
npx vitest run tests/unit/scene3d-fill-silhouette-overshoot.test.js   # expect 401/401
npx vitest run tests/unit/scene3d-fill-boundary-ends.test.js          # expect 49/49 (sagitta bar)
npx vitest run tests/unit/scene3d-mktick-band-purity.test.js
npx vitest run tests/unit/scene3d-mktick-gap-fill.test.js
npx vitest run tests/unit/scene3d-mktick-banding.test.js
npx vitest run tests/unit/scene3d-mktick-runaway.test.js
npx vitest run tests/unit/scene3d-mkdashramp-discrete.test.js
npx vitest run tests/unit/scene3d-mkdashramp-single-pass.test.js
npx vitest run tests/unit/scene3d-mkdashramp-low-end.test.js
npx vitest run tests/unit/scene3d-mkdashramp-dark-end.test.js
npx vitest run tests/unit/scene3d-ribbon-fill-depth-count.test.js     # F1-count's 30/30 md5 sweep
npx vitest run tests/unit/scene3d-mark-laws-draw.test.js              # Tier 2 — O1, G4, T4b
npx vitest run tests/unit/scene3d-silhouette-contiguity.test.js
npx vitest run tests/unit/scene3d-border-contiguity.test.js
npx vitest run tests/unit/scene3d-tone-law-collapse.test.js --pool=forks --poolOptions.forks.singleFork=true

# 4. then the five suites
npm run test:unit
npm run test:integration
node scripts/dev-server.js 4173 &     # pre-start so Playwright's reuseExistingServer finds it
npm run test:e2e                      # see the notes below
npm run test:visual
npm run test:perf
```

**`test:e2e` notes — both matter for item 26:**
- **Run it with `--workers=1`.** Round 1 reproduced a 100 %-deterministic hang at the default
  `workers: 2` under load, 0 % serialized. `test:e2e` is five sequential `playwright test` invocations —
  append `--workers=1` to each, or run them individually.
- ⚠ **`test:e2e` ENUMERATES its specs** — `smoke`, `stroke-options`, `tool-drawer`, `import-3d`,
  `iphone-mini`. **`mask-shift-drag.spec.js` is never run by it and `visual.spec.js` is env-gated.**
- **`test:visual` is the suite that matters most this round** — `border-4` changes what is drawn on every
  curved primitive, and `tests/visual/scene3d-tone-baseline.test.js` is a pinned-golden file over curved
  primitives (item R4-1). **A moved visual baseline is a re-pin and needs the same proof as any other —
  never `npm run test:update` to make it green.**

**Record the exact counts** against §3.1's baseline in the merge report.

---

## 6. VERSION

**1.4.2 → 1.4.3.** Plain semver patch; the third digit is unbounded — never reset it.

Both lanes read **1.4.2** in `package.json` (they branched off `b43fa4e3`), so the merges themselves produce
**no `package.json` conflict**. Bump **once, by hand, on the integration branch, after the last lane
merges**:

```
node -e "const p=require('./package.json');p.version='1.4.3';require('fs').writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')"
npm run version:sync
```

**Expected diff — accept nothing else: exactly 3 files.** `package.json` (1 line),
`src/config/version.js` (`Vectura.APP_VERSION = '1.4.3'`), `index.html` (~446 changed lines / ~222 `?v=`
cache-busters, **zero `v=1.4.2` left**). That churn is the normal substitution, not drift.

**On the PreToolUse version-bump hook** (`.claude/settings.json`): it fires on a Bash `git commit`
(not `--amend`) only when the staged set touches `src/`, `tests/` or `index.html` **and `package.json` is
not already staged**. **Because you stage `package.json` yourself, the hook exits early — no double bump.**
It is a Claude Code hook, so `-c core.hooksPath=/dev/null` neither disables it nor needs to.

```
git -C <integrate-r4> add package.json src/config/version.js index.html
git -C <integrate-r4> -c core.hooksPath=/dev/null commit -m "chore: v1.4.3 — 3D Scene fill audit round 4"
```
Verify: `node -e "console.log(require('./package.json').version)"` → `1.4.3`;
`grep -c 'v=1.4.2' index.html` → `0`.

---

## 7. DOCUMENTATION CONTRACT

Per CLAUDE.md: **any repository change** ⇒ `plans.md`, `CHANGELOG.md`, README release notes, `version:sync`.
**Feature capability** ⇒ `README.md`, `plans.md`, `CHANGELOG.md`. **UI behaviour / help** ⇒ `README.md`,
in-app help guide, in-app shortcut list. **Round 4 changes no UI control and no shortcut** — no in-app
shortcut-list edit is owed.

⚠ `CHANGELOG.md`, `plans.md` and `README.md` are CLAUDE.md's named **highest-collision files**.
**Re-read the target region immediately before editing.** On a "file modified since read" error, re-read
and **merge** your change into the new content — never overwrite with your remembered version.

⚠⚠ **`border-4` ALREADY WROTE ITS OWN `CHANGELOG.md` AND `plans.md` ENTRIES** (verified read-only:
a 10-line `### Fixed` block for W-32 Rank 4 naming the 0.72 → 0.02 pen result, the byte-identical fill ink
and the torus exclusion; and an 8-line `plans.md` amendment closing decision-9-amended and correcting the
round-2 W-35 framing). **They land with merge #1. DO NOT DUPLICATE THEM — verify they survived the merge,
read correctly beside round 3's entries, and leave them alone.** Everything in §7.1 below is *additional*.

### 7.1 `CHANGELOG.md` — draft block

Append into the existing `## Unreleased` section. **This repo has no per-version headings inside the
changelog** — round 3 set that precedent deliberately, and a fresh `## 1.4.3` heading would be
inconsistent with history.

```markdown
### Changed
- **3D Scene — Dash Ramp draws discrete dashes at low Density.** Below a density threshold each
  mark is now a single pass rather than a band of parallel passes, and its length is bounded, so a
  sparse sphere reads as discrete dashes riding the rulings instead of one thick tile or a row of
  broken rulings. Mid and high Density are byte-identical — the band mechanism that carries the
  dark end is untouched. (T3b, T3c)
- **3D Scene — tick fills no longer grow ticks past their own band.** A tick is now sized against
  its band rather than against the local ruling pitch, so a band wide enough for several ticks
  receives several instead of one over-long one. Total ink is within 0.6 % and the seam overlap is
  unchanged. (T2-5)
- **3D Scene — tick fills grade toward the dark edge of each band.** Within a band, ticks now run
  as a graded comb — longest at the dark edge, shortening away from it — so the bare strip at the
  bottom of a wave band is narrower. Ink area per band is unchanged by construction.
  **The result is an improvement rather than a completion: the gaps shrink but do not close, and
  whether this reads correctly is being judged by eye, not by a bar.** (T2-6)

### Known limitations
- **Crosshatch at maximum Density: the tone dial still has no effect on cell size, and retuning
  the cap's onset has been measured and cannot deliver one.** Every onset setting that restores
  tone authority at Density 220 breaks the coverage calibrator the cap exists to satisfy, and one
  primitive (the cylinder) never reaches meaningful authority at that density under any setting.
  **Whether to accept this as inherent, or to fund a different mechanism — tone acting on
  crosshatch angle or on pen weight rather than on cell size — is an open product decision and is
  not settled by this release.**
- **Tick fills: the bare strip at the bottom of a wave band is narrower, not gone.** The graded
  comb redistributes tick length within each band rather than adding ink, so a residual gap
  remains on the steepest bands. **Whether the remaining gap is acceptable is being judged by eye
  and is not settled by this release.**
- **The refined silhouette border does not cover the torus** — its silhouette is non-convex, so the
  refinement is gated off there and the torus keeps the previous mesh-chord outline.
  *(`border-4`'s own CHANGELOG entry already states this. Verify it reads this way after the merge
  rather than adding a second bullet.)*
- *(carried, round 3)* Wave-ribbon fills read lighter than before — accepted (decision 10 = A).
- *(carried, round 3)* Dash Ramp marks are bands, not single strokes, **above** the new low-density
  threshold.
- *(carried)* The thin-torus shadow blank-void ceiling at a major:minor tube ratio of ~465:1–488:1.
- *(carried)* `sliceEndOverlap` defaults to 0 and is byte-identical there.
```

**Not in `CHANGELOG.md`:**
- **W-36e** — tests-only (a new interior sub-bar on the crosshatch dial). No user-visible change ⇒
  `plans.md` only.
- **F1-count** — observability only; `ribbonize()` gains a `fillEmpty` counter, output **md5-identical
  30/30**. No user-visible change ⇒ `plans.md` only. *(If you prefer to honour "any repository change ⇒
  CHANGELOG" literally, one line under an `### Internal` heading is acceptable — but do not dress an
  internal counter as a feature.)*
- **W-36f** — closed MEASURED/PARKED, **no code shipped**. Its outcome is disclosed as the amended
  *Known limitations* bullet above, and nowhere else.

⚠ **Item 29 / R4-3 compliance:** the first *Known limitations* bullet states the **measurement** and marks
the choice **open**. Do **not** write "accepted", "will be retuned", or "there is no fix" — all three
pre-empt decision 11-amended.
⚠ **Item 20 compliance:** no forbidden number appears — no "426/426", "550", "328", "level-6 ring only",
"the fix"; T2-5 clause (a) is **not** called "partial"; **`MK_BAND_ONSET_D = 35` is not quoted as the
onset** (T3c's reviewer measured the cliff at d ≈ 32; the constant is a follow-up, not a published fact).

### 7.2 `README.md`
- Add a **`### 1.4.3`** release-notes block.
- **Item R4-4b:** the file currently has **five** inline release headings (1.4.2, 1.4.1, 1.4.0, 1.3.99,
  1.3.85) before the `<details><summary>Older releases…</summary>` panel; the README Standard is **three
  most recent inline**. Adding 1.4.3 makes six. **Move the surplus (1.4.0 and older) into the `<details>`
  panel** so 1.4.3 / 1.4.2 / 1.4.1 remain inline.
- **No new user-facing control shipped this round** — no feature-list edit is owed. Confirm rather than
  assume: `grep -n "Min rulings\|fill styles" README.md`.

### 7.3 In-app help + shortcut list
- **No control added, no shortcut changed ⇒ nothing owed.** The standing gap (`src/ui/modals/help-shortcuts.js`
  has **no 3D Scene section at all**) is pre-existing and already tracked in `plans.md` — **do not open it
  inside the merge.**

### 7.4 `plans.md`
- Move round 4's landed items out of the Inbox: **T3b, T3c, T2-5, T2-6, F1-count, W-36e, W-32r4 + r4b + r4c**.
  *(`border-4` already amended the decision-9 line — build on that text, do not replace it.)*
- Record the still-open items with owners: **decision 11-amended (Jay)** · **W-36f** (parked pending it) ·
  **T2-5 clause (b)** — the `L0` 1.16 → 1.05 seam-overlap trade, **measured but not shipped; Jay's ruling
  owed** · **T2-6's residual gap, eye-gated** · **`MK_BAND_ONSET_D` re-derivation (true cliff d ≈ 32)** ·
  **the torus exclusion from the refined silhouette** · **item R4-4a: a numbered W-id for
  `scene3d-slice-end-overlap.test.js`'s vacuous `git show HEAD:` leg** (third round unowned) · **W-07b** ·
  the unscheduled list (W-33's fitter follow-up, `insetMultiPolygon` ladder, the W-29 stub family,
  U10–U12 which stay W-26-blocked).

### 7.5 `docs/3d-audit/fill-audit-handoff.md`
- Update the "Current as of" line, the local `main` sha, and the version. Record the round-4 merge sha.
  **State the push status truthfully** — see §8.

### 7b. THE GALLERY REBUILD (orchestrator's own step — implementers are barred)

**Run it LAST, once, after every merge, the version bump and the docs land.** Implementers must never touch
`scene3d-assemble.js`, `scene3d-audit-findings.js` or `scene3d-before-after.js`.

```
node scripts/audit/scene3d-assemble.js       --out docs/3d-audit/fill-audit
node scripts/audit/scene3d-audit-findings.js --out docs/3d-audit/fill-audit
node scripts/audit/scene3d-before-after.js   --out docs/3d-audit/fill-audit
```
Then reload `http://localhost:8460/docs/3d-audit/fill-audit/index.html` and **look at it**. `shots/` and
`after/*/shots` are **not** committed; the manifests, `report.json`s, findings and `index.html` are.
Do item 27's rig annotation **before** the rebuild so the Before/After cards carry the rig.

⚠ **Round 4 is the first round whose merge changes what EVERY CURVED PRIMITIVE's OUTLINE looks like.** The
`create`-tier gallery is 3480 cells and the border moves in a large fraction of them. **Expect a wide
before/after diff and say so in the report** — it is the expected consequence of W-32 Rank 4, not drift.
**Carry round 3's recommendation forward: do NOT build a full second `--rig addLayer` tier** (it doubles a
multi-hour capture and ~373 MB of uncommitted shots for no decision-relevant gain). Shoot `--rig addLayer`
only for the cells §3.3 names:
```
node scripts/audit/scene3d-capture.js --tier B --rig addLayer --root <integrate-r4> --port 8490 \
  --only '^(cone|sphere|ellipsoid)__(hatch|contour|crosshatch)__(mkTick|mkDashRamp|ladder)__(low|med|max)__[ab]$' \
  --out docs/3d-audit/fill-audit/after/MERGE-r4
```
⚠ **Before naming any cell, confirm it exists in `docs/3d-audit/fill-audit/manifest*.json`** — briefs have
twice named cells that do not exist. If no cell covers a check, say so and capture a bespoke scene.

---

## 8. STOP CONDITIONS, THE PUSH RULE, AND WHAT MUST NOT HAPPEN

**Stop, do not "resolve creatively", write the report, and report one line.**

1. **A conflict in a file this plan says merges clean.** §2.3 is a measured fact about these shas. A new
   conflict means a lane HEAD moved (expected only for `fill-audit-a4`) or the wrong branch was merged.
   Re-run `git merge-tree` and re-verify §0 before touching anything.
2. **Any re-pin beyond §2.5's twelve.** The budget is exactly those twelve. Anything else is either a real
   cross-lane interaction (disclose it with arithmetic under `## Bars changed`) or a mistake. **It is never
   "just update the expected value".**
3. **`fill-audit-a4`'s HEAD is still an unverified WIP at merge time.** See §9.
4. **A test green on unmodified `main` and red after the merge.** A merge-caused regression: fix at source
   with a RED→GREEN proof, or stop.
5. **Either lane worktree found dirty at pre-flight.** An agent is live; do not merge underneath it.
6. **A `torus/*` golden in §2.5 that does not match `fill-audit-a4`'s value.** The convexity gate leaked —
   a product defect, not a re-pin.

### The push rule

**Jay's standing answer is `push = A`: push after the merge with a verified `test:ci`.** He gave it on
2026-09-17 and `origin/main` = `main` = `b43fa4e3` because of it. **So the push condition for round 4 is
the same as round 3's was after he answered: merge → all five `test:ci` suites green → merge review comes
back ACCEPT → fast-forward `main` → push.**

⚠ **But the sequence is not optional and neither is the review.** Concretely:
1. **Do NOT push from the integration branch.** Ever.
2. **Do NOT fast-forward `main` onto `3d-scene/integrate-r4` until a merge review has come back ACCEPT** —
   that was the round-2 and round-3 sequence and it caught things both times.
3. **The implementer's job ENDS at "committed on the integration branch + `MERGE-impl-r4.md` written".**
   The fast-forward, and then the push, are the **orchestrator's** steps, in that order, after the review.
4. **If anything in list 1–6 above fired, or any suite is red, the push condition is NOT met** — report and
   stop. A green-locally-only claim is not a verified `test:ci`.

**What must NOT happen, under any circumstance:**

- ❌ **No pre-empting decision 11-amended.** Do not retune the crosshatch cap's onset. Do not build the
  angle-or-pen-weight alternative. **The CHANGELOG discloses the measurement and marks the choice open —
  that is the whole of the merge's obligation here.**
- ❌ **No re-pin without proof.** A widened tolerance, a moved fingerprint, **or a narrowed population /
  changed fixture** — all three are bar changes and all three need `file:line — old → new — why` in the
  report **and** the commit body. "The number is unchanged" is not a defence when the population moved.
- ❌ **No squash, no history rewrite, no `--ff`** — §2.2: `T3C_BASE_SHA = '75777240'` is a lane commit read
  back by `git show` at runtime.
- ❌ **No destructive git operation in a dirty tree** — the reset family, `git checkout -- <tracked>`,
  `git restore`, `git clean`, `git stash drop|clear`, history rewrites, or a force push — and none of them
  at all without (a) a recovery point (`git tag recover-merge-r4 $(git stash create)` or a WIP commit) and
  (b) Jay's explicit naming of that operation. **Never hard-reset a worktree onto `main` to sync it.**
  Re-run `git status` + `git stash list` **in the current worktree** first — the session-start snapshot is
  stale.
- ❌ **No `git add -A`.** Explicit paths, then `git status --short --cached` and eyeball it.
- ❌ **Do not kill the dev server on port 8460** (MAIN's gallery) **or 8475** (a live lane, §1.3).
- ❌ **Do not touch `stash@{4}`, `stash@{5}`, `stash@{6}`** — old `main` WIP from other efforts.
- ❌ **Do not fix `tests/unit/scene3d-slice-end-overlap.test.js`'s vacuous leg inside the merge.** Assign
  the W-id; it is a tests-only unit that needs its own mutation proof.
- ❌ **Do not run any test with `run_in_background` or a Monitor.** Foreground, `timeout: 600000`, one file
  per command.
- ❌ **Do not run `npm run test:update`.** A moved visual baseline is a re-pin.
- ❌ **Do not commit anything under `**/shots/`** (§1.2).

---

## 9. THE `fill-audit-a4` PLACEHOLDER — T2-6 is IN FLIGHT and its HEAD WILL MOVE

**Measured state at the time of writing:** `3d-scene/fill-audit-a4` = **`0f420747`**,
`wip(3d-audit): T2-6 checkpoint (unverified) — implementer killed by rate limit 2026-09-18`. The worktree
is clean at that commit; a replacement implementer is finishing on top of it.
`docs/3d-audit/lane-reports/T2-6-impl.md` reads **`(placeholder — being finalized, roster sweep in
flight)`**.

> 🛑 **MERGING AN UNVERIFIED WIP CHECKPOINT IS STOP CONDITION 3.** Round 3's precedent is exact: its plan
> named one blocker (a broken self-test owned by a queued unit) and ruled that merging with it unresolved
> **violates CLAUDE.md's non-negotiable pre-commit rule**, while the alternatives — re-pinning or skipping —
> are forbidden by the standing no-re-pin-without-proof ruling. **The same ruling applies here.** If T2-6
> has not landed as a verified commit with a finished `T2-6-impl.md`, the merge is **BLOCKED**. Report it;
> do not work around it.

**When T2-6 lands verified, do exactly this — nothing else in this plan changes:**

1. **Refresh §0's `fill-audit-a4` HEAD.** `git -C <MAIN> rev-parse 3d-scene/fill-audit-a4`; record the new
   sha in the merge report and in merge #2's commit body. Confirm `T2-6-impl.md` no longer says
   "placeholder" and carries a `STATUS:` line and a `## Bars changed` section.
2. **Re-run the file-overlap measurement:**
   `comm -12 <(git diff --name-only b43fa4e3..3d-scene/fill-audit-a4|sort) <(git diff --name-only b43fa4e3..3d-scene/border-4|sort)`
   — **must still be exactly `tests/unit/scene3d-mktick-wedge.test.js`.** A second shared file means T2-6
   reached outside its lane: **STOP condition 1.**
3. **Re-run the conflict simulation:**
   `git merge-tree b43fa4e3 3d-scene/fill-audit-a4 3d-scene/border-4 | grep -c '<<<<<<<'` — a small count
   (1–2 hunks) confined to that one file is expected. **Anything in another file: STOP condition 1.**
4. **RE-EXTRACT §2.5's golden table** — T2-6's final commit may move values again:
   ```
   P=tests/unit/scene3d-mktick-wedge.test.js
   for r in b43fa4e3 3d-scene/fill-audit-a4 3d-scene/border-4; do
     echo "== $r"; git show "${r}:${P}" | grep -E "^ +'(test|create)\|"
   done
   ```
   *(zsh eats `$r:t` as a modifier — the `${r}:${P}` braces above are required.)*
   Replace the table's third column. **The RULE does not change** — take neither side, re-derive all twelve
   on the merged tree, re-run the in-file mutations, disclose all twelve under `## Bars changed`. **And the
   two falsifiable predictions still hold: the four `torus/*` cells must equal a4's values exactly; the
   eight `sphere/*` and `cone/*` cells must differ from both sides.**
5. **Re-run T2-6's own neighbours before the full suite**, because it edits the same mark sink T2-3, T2-5,
   T3, T3b, T3c and W-36 all wrote to: `scene3d-mktick-wedge`, `scene3d-mktick-band-purity`,
   `scene3d-mktick-gap-fill`, `scene3d-mktick-banding`, `scene3d-mktick-runaway`,
   `scene3d-mark-laws-draw`, `scene3d-curved-density-sparse-end`. **If the re-measured md5 golden in the
   last file moves, that is a finding, not a re-pin.**
6. **Check whether T2-6 added a file.** The WIP already adds `tests/helpers/scene3d-mktick-gap-fill.js` and
   `tests/unit/scene3d-mktick-gap-fill.test.js`; a final commit may add more. Update §0's file list and
   §3.1's expected unit-count rise accordingly.
7. **Adjust §7.1's T2-6 CHANGELOG bullet** to match what actually shipped — in particular whether the gaps
   close or only narrow. **Keep the eye-gated framing: the plan, the prototype note and the orchestrator
   all recorded "gaps shrink but remain", and Jay's eye check is the gate. Do not upgrade it to "fixed".**
8. **Re-run items 30 / R4-2's two greps** over the finished `T2-6-impl.md` and add its row.
9. **Nothing else changes.** Merge order, conflict rules, version, docs contract, test plan, gallery
   recommendation and stop conditions are all unaffected, because `fill-audit-a4` merges **second** and is
   **provably disjoint from `border-4` in `src/`**.

**If T2-6 is abandoned rather than finished:** the lane's last *verified* commit is **`f0b0b0c8` (T3c)**.
Merging `f0b0b0c8` instead of the WIP is legitimate — but it is a **different merge**: re-extract the
golden table at `f0b0b0c8` (there, only **4** of the 12 cells moved, all from T2-5 — `test|torus/contour`,
`test|cone/hatch`, `create|torus/contour`, `create|cone/hatch`), drop §7.1's T2-6 CHANGELOG bullet and its
*Known limitations* bullet, and say plainly in the report that T2-6 was not merged. **Do not cherry-pick
out of the WIP.**

---

## 10. POST-MERGE ORDER (recommended)

1. §1.2 docs commit on MAIN (orchestrator) → §2.1 worktree → merge 1 `border-4` → merge 2 `fill-audit-a4`,
   each `--no-ff`, commit body naming its units and its lane sha.
2. §2.5's golden re-derivation and the in-file mutation re-run.
3. §3.3's four cross-lane checks, with native-resolution crops, camera `a` **and** `b`.
4. §5.3's targeted files, then the five suites, foreground, one at a time.
5. Checklist items 23 (the W-id), 27 (rig annotation), 30 + R4-2 (8 report lines), R4-1 (the golden grep),
   R4-4 (the two round-3 doc follow-ups).
6. Version bump to **1.4.3** (§6).
7. Docs: `CHANGELOG.md`, `README.md`, `plans.md`, `fill-audit-handoff.md` (§7) — building on `border-4`'s
   own entries, never duplicating them.
8. Gallery rebuild + the scoped `--rig addLayer` shots (§7b).
9. Write `MERGE-impl-r4.md` (status line first, `## Bars changed` mandatory, all twelve goldens listed) and
   **STOP.** Print the merge sha and a one-line summary.
10. **Merge review → ACCEPT → orchestrator fast-forwards `main` → orchestrator pushes** (§8's push rule).
    **Not before, and not by the implementer.**
