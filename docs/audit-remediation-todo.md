# Audit Remediation Todo (2026-07-07, verified + extended 2026-07-11)

Source: full-repo "unknown unknowns" audit (4-agent sweep: test blind spots, doc drift,
silent-failure risks, automation debt) run 2026-07-07, followed by a source-level
verification pass and a second discovery sweep on 2026-07-11. This file is the
executable punchlist. Each task is written so an agent with no prior context can pick
it up cold.

## Status — pick up here

Last updated 2026-07-12 (after commit `24d93c5`). **6 of 20 tasks done.** Full specifics
in the Done section at the bottom; commit hashes below are copy-pasteable for `git show`.

- **Done:** AUD-01 (`dd074f7`), AUD-03 (`6e8ac1c`), AUD-09 (`dc14b1d`), AUD-15.3
  (`cab94d9`), AUD-17 (`53e2365`), AUD-20 (`2229064`).
- **Unblocked — no decision needed, pick any of these next:** AUD-02, AUD-04, AUD-05,
  AUD-06, AUD-08, AUD-12, AUD-13, AUD-14, and AUD-15's items 1/4/5 (hooks:install
  parity, settings.local leftovers, `window.app` alias — item 2 is decision-gated,
  item 3 is done).
- **Recommended next task: AUD-02** (`formatVersion` + migration shim). Per
  Sequencing below, it's independent of every other task and is the other half of the
  P0 data-integrity core alongside the now-done AUD-03.
- **Blocked — do not start without Jay picking an option first:** AUD-07, AUD-10,
  AUD-11 (untrack step already done under AUD-20; the history-rewrite proposal and
  examples-relocation remain), AUD-15.2, AUD-16, AUD-18, AUD-19.

## Ground rules for any agent working this list

- **One task per commit.** Reference the task ID (e.g. `AUD-03`) in the commit message.
- **Commit, never push.** Stop after committing: print hash + one-line summary. Pushing,
  PRs, tags, and releases require Jay's explicit approval.
- **RGR is mandatory** for every behavior change: write the failing test first, watch it
  fail, fix, watch it pass. Each task below states its Red criterion.
- **Verify line numbers before editing.** File:line refs were captured 2026-07-07/11
  and may drift. Grep for the quoted code, don't trust the number.
- **Check for concurrent sessions** (`git status` fresh, not the session-start snapshot).
  `plans.md`, `CHANGELOG.md`, `src/config/defaults.js` are high-collision files —
  re-read immediately before editing.
- **Expect the version-bump hook**: any commit staging `src/`, `tests/`, or `index.html`
  auto-bumps the patch version and stages `package.json` + `src/config/version.js` +
  `index.html`. Don't fight it.
- Tasks marked **[DECISION: Jay]** must not be executed until Jay picks an option. Tasks
  marked **[APPROVAL GATE]** are destructive/publishing ops — never run autonomously.
- When a task completes, move its line to the Done section at the bottom of this file
  and update `plans.md` / `CHANGELOG.md` per the repo Documentation Contracts.

Priority: P0 = data-integrity or safety-net defects. P1 = broken pipelines / lost
coverage. P2 = debt and drift.

## Verification log (2026-07-11)

Claims from the 2026-07-07 agent sweep were re-checked against source. Results:

- **Confirmed verbatim:** AUD-02 (zero version fields in `engine.js` — grep for
  `version` returns nothing), AUD-03 (`rng.js` falsy-seed fallback, exact line read),
  AUD-05 (zero `catch` in `fill-boolean.js` AND `pathfinder-ops.js`), AUD-07
  (`visual.spec.js:6` env gate; `test:e2e` names exactly 4 spec files, mask-shift-drag
  absent), AUD-08 (`writeCookie` has no length check; the btoa comment at `app.js`
  ~767 confirms the 4096-byte rationale), AUD-10 (spot-checked 6 of the 16 components:
  none referenced in `index.html`), AUD-15.2 (bump-hook matcher is
  `^(src/|index\.html|styles\.css|tests/)` — `tests/` confirmed, and it still matches
  the deleted `styles.css`), AUD-19 (`scripts/sync-version.js` `bustQuery` stamps
  `?v=<version>` onto EVERY local `./`-prefixed script src and CSS href).
- **CORRECTED — AUD-01:** the guard is disarmed by **any stash OR any recover tag**
  (`! git stash list | grep -q . && ! git tag -l 'recover-*' | grep -q .`), not tags
  alone. The two stashes from 2026-06-13 disarm it even after all tags are deleted.
  Task rewritten below.
- **CORRECTED — AUD-04 (demoted P0 → P2):** `zip -r out real.txt missing.css` exits
  **0** (tested 2026-07-11, Info-ZIP): a missing name produces a warning, not a
  failure, when other names match. The release pipeline is NOT broken by the stale
  `styles.css` reference — it's cosmetic drift. Task demoted and rewritten.
- **RESOLVED — AUD-20:** the `src/` mystery weight is `src/inspiration/` — 68 MB, 67
  reference images. The dir is gitignored (`.gitignore:19`) but **11 images totaling
  ~25 MB were tracked before the ignore rule landed** and still ship in the release
  zip, git history, and the public Pages site. Zero references from `index.html`,
  `src/`, `tests/`, `scripts/`, or `.github/`. Task rewritten as a concrete untrack.
- **Hypotheses tested and killed** (do not re-raise): undo history is NOT unbounded
  (`maxHistory = SETTINGS.undoSteps ?? 20`, `app.js` ~208/1116); `structuredClone` has
  a proper JSON-round-trip fallback (`src/core/utils.js` ~29); a preset export/backup
  feature EXISTS (`preset-bundle.js` downloads `vectura-presets.json`); preset bundle
  import merges against fresh localStorage at write time (not a blind overwrite);
  `npm audit --omit=dev` = 0 vulnerabilities; scheduled CI is currently green
  (2026-07-07 cron run: success).

---

## P0 — Safety net and data integrity

### AUD-01 · Re-arm the destructive-git guard (stale checkpoints disarm it) [DECISION: Jay] — DONE, see Done section

**Problem (corrected 2026-07-11).** The PreToolUse Bash guard in
`.claude/settings.json` blocks destructive git ops on a dirty tree only when there is
**no stash and no `recover-*` tag**:
`if [ -n "$(git status --porcelain)" ] && ! git stash list | grep -q . && ! git tag -l 'recover-*' | grep -q .; then … exit 2`
Any checkpoint anywhere — however old, however unrelated — reads as "today's work is
recoverable" and disarms the block. Right now BOTH disarm conditions are true: 7 stale
tags (`recover-ctxbar-collision`, `recover-font-review-1782944415`,
`recover-presquash-main`, `recover-text-mvp-6de881bf`,
`recover-text-wip-pre-band-merge`, `recover-tracer-checkpoint`, `recover-tracer-work`)
and 2 stashes from 2026-06-13. So `git reset --hard` / `git clean -f` / `git rebase` /
`git push --force` pass unblocked. Deleting tags alone will NOT re-arm it.

**Steps.**
1. **Harden the guard first** (this fixes the class and doesn't wait on triage):
   require a *recent* checkpoint rather than *any*. Preferred check: newest of
   (a) most recent stash creation time, (b) newest `recover-*` tag creatordate — must
   be within the last 30 minutes; otherwise block. Edit the hook command in
   `.claude/settings.json`. Keep the existing block message, add "(stale checkpoints
   don't count — create a fresh one)".
2. For each of the 7 tags: `git diff HEAD <tag> -- src tests`, summarize unique
   content, present keep/delete recommendations to Jay. Known context:
   `recover-tracer-*` relates to the uncommitted path-tracer work,
   `recover-ctxbar-collision` may hold the p3 scissors fix.
3. **[APPROVAL GATE]** Delete only the tags Jay approves: `git tag -d <tag>`.
4. Stash triage is owned by AUD-06 (stash@{0} holds unlanded tests; stash@{1} verified
   superseded). Do not drop stashes here.

**RGR.** Hooks aren't vitest-testable. Red/Green is a scripted manual proof, run before
and after the fix, in a throwaway worktree (`git worktree add`), never in the main
tree: dirty a file, create a `recover-test-dummy` tag backdated/old (or simply rely on
the existing stale tags pre-fix), attempt `git reset --hard HEAD` through the harness.
Before: passes (bad). After: **blocked** despite the stale checkpoint; then create a
fresh checkpoint and confirm the op is allowed. Record both transcripts in the commit
message body.

**DoD.** (a) Guard blocks destructive ops on a dirty tree when the newest checkpoint is
stale, and allows them with a fresh one. (b) All 7 tags triaged with a written verdict;
approved ones deleted. (c) `.claude/settings.json` change committed with the proof
transcript.

---

### AUD-02 · Add `formatVersion` + migration shim to `.vectura` serialization

**Problem.** `exportState()` / `importState()` (`src/core/engine.js` ~606/~657) emit a
bare layer dump with no schema version (verified: `grep -n version src/core/engine.js`
returns nothing). Load validation (`src/ui/ui-file-io.js` ~116) only checks
`state.engine && state.settings`. Params missing from an old file silently resolve to
*today's* defaults, so old files can render different art after a defaults change, with
no warning and no migration path. The only "version" in a file is a cosmetic display
string (`ui-file-io.js` ~70) that is never compared.

**Steps.**
1. Add `formatVersion: 1` to the object `exportState()` returns (top level, beside
   `engine`/`settings` — check where PresetSync.buildDoc and the preset bundler read the
   doc so presets get it too).
2. In `importState()` (or the single choke point both file-open and preset-apply flow
   through — find it first; do not patch two copies): if `formatVersion` is absent, treat
   as version 0 (legacy) and proceed. If `formatVersion` is greater than the app's
   current known version, load anyway but surface a non-blocking toast: "This file was
   saved by a newer version of Vectura Studio; some settings may not apply."
3. Add a `migrations` table keyed by version (empty for now except the 0→1 no-op) so the
   next format change has a place to live. Keep it in `engine.js` next to `importState`.
4. Document the field in `docs/` (wherever the .vectura format is described; if nowhere,
   add a short `docs/vectura-format.md`).

**RGR.** Red tests (must fail before the change):
- `exportState()` result contains `formatVersion === 1`.
- Loading a fixture JSON *without* `formatVersion` (copy a real
  `user-presets/**/*.vectura` and strip the field) succeeds and round-trips layers
  unchanged.
- Loading a fixture with `formatVersion: 999` succeeds AND the newer-version warning
  path is invoked (spy on the toast/notify function).

**DoD.** All three tests pass; every existing serialization test still passes
(`npm run test:unit && npm run test:integration && npm run test:e2e` — export/
serialization class per the Testing Matrix); saving then reopening a project in the
running app works (visual check per CLAUDE.md); existing preset `.vectura` files still
load (the bundler `npm run user-presets:bundle` output is unchanged or only gains the
field).

---

### AUD-03 · Fix `SeededRNG(0)` falling back to `Math.random()` (reproducibility bug) — DONE, see Done section

**Problem (verified against source 2026-07-11).** `src/core/rng.js:10`:
`this.state = seed ? seed : Math.floor(Math.random() * (this.m - 1));`
`0` is falsy → a saved seed of 0 renders differently on every open. SVG import hard-sets
`layer.params.seed = 0` (`src/ui/ui-file-io.js` ~174). `src/core/noise.js` (~9, ~29) has
the same falsy-seed pattern — audit every `new SeededRNG(` and `seed ?` site.
Note: `rings.js` adds constant offsets to the seed (`(p.seed ?? 0) + 23143`) to dodge
this locally — leave those offsets alone (changing them changes existing art).

**Steps.**
1. Change the null-check to explicit: `seed == null ? <random fallback> : seed` in
   `rng.js`, and equivalently in `noise.js` and any other falsy-seed site found by
   `grep -rn "seed ?" src/core/`.
2. LCG state 0 with a=1103515245, c=12345 → next state 12345 (not a fixed point), so
   seed 0 is safe; confirm in the test that the first few outputs from seed 0 are
   non-constant.
3. Add a comment in `rng.js` pinning the LCG constants: changing a/c/m silently
   re-renders every saved seed. Add a constants-lock unit test (assert the first 5
   outputs for seeds 0, 1, 42 against hardcoded expected values).

**RGR.** Red tests (must fail before the fix):
- `new SeededRNG(0)` twice → identical first-10 output sequences. (Currently fails:
  Math.random fallback.)
- Constants-lock test: hardcoded expected sequences for seeds 0/1/42. (The seed-0 row
  fails today; 1/42 rows are the pin going forward.)

**DoD.** Both tests pass; `tests/unit/algorithms-determinism.test.js` (which iterates
all `ALGO_DEFAULTS`) still passes; full unit + integration + visual suites green
(core-logic class). Behavior note for CHANGELOG: seed-0 layers were previously
non-deterministic, so no existing art is "changed" by this — say so explicitly.

---

## P1 — Broken pipelines and lost coverage

### AUD-05 · Guard the bare polygon-clipping call sites (uncaught throw path)

**Problem (verified: zero `catch` in both files).** Only the algorithm boundary
(`src/core/engine.js` ~1405) wraps geometry in try/catch. The compound/pathfinder
recompute path — `engine.js` ~1238 `PathfinderOps.refreshAllCompounds(this)` →
`recomputeCompound` → `src/core/fill-boolean.js` — calls
`polygonClipping.union/xor/difference/intersection` raw (~25 sites across
`fill-boolean.js`, `src/core/pathfinder-ops.js`, `src/core/geometry-utils.js`
~880/885/1159, `src/core/algorithms/svgdistort.js` ~37/41). mfogel/polygon-clipping
throws "Unable to complete output ring" on degenerate input, so one self-intersecting
user shape in a compound can throw uncaught through `applyState()`. Prior art: the
banded-bold work already established layered-retry + fallback patterns for this
library. Note: with no global error handler (see AUD-17), this throw currently means a
silently dead UI.

**Steps.**
1. Do NOT wrap all 25 sites individually. Add a single guarded wrapper inside
   `fill-boolean.js` (e.g. `safeOp(fn, ...args)` that try/catches, logs one console.warn
   with the op name, and returns `[]`), and route the exported ops through it.
2. `pathfinder-ops.js` calls `FB.*` so it inherits the guard; verify `geometry-utils.js`
   and `svgdistort.js` call sites also route through FB or get the same local guard.
3. Decide degradation semantics per call site: returning `[]` must degrade to
   "compound renders nothing / falls back to inputs", never to a crash. For
   `recomputeCompound` specifically, prefer falling back to the un-combined child paths
   so the user still sees geometry.

**RGR.** Red test (must fail = throw, before the fix): build a fixture layer whose
geometry makes polygon-clipping throw (a self-overlapping bowtie ring duplicated with a
near-degenerate offset is the known trigger; if hard to provoke, monkeypatch
`polygonClipping.union` to throw in the test and assert `refreshAllCompounds` does not
propagate). Prefer a real geometric repro; fall back to the monkeypatch only if a real
repro can't be built in ~30 min. Green: same input → no throw, compound falls back,
warn logged once.

**DoD.** Test passes; unit + integration + visual suites green (core-logic class);
manual check in the running app: create two shapes, make a compound, confirm normal
compounds still render identically (visual class).

---

### AUD-06 · Re-land the three regression tests lost in stash@{0}

**Problem.** `stash@{0}` ("vectura-wip-inplace-repair+tests", 2026-06-13) contains three
regression tests that never landed in HEAD:
1. `'Add Layer button opens the picker without auto-creating a layer'` (e2e,
   `tests/e2e/smoke.spec.js` +18 lines)
2. `'"+ Add Shading"/"+ Add Modifier" stay idempotent across re-renders (no listener
   accumulation)'` (`tests/integration/petal-designer-stacks.test.js` +37)
3. `'forces seed/transform/curve params (regression: updateLayerParams ran before the
   layer was pushed → silent no-op)'` (`tests/unit/engine_layers.test.js` +23)

The accompanying engine fix was superseded (no `window.Vectura.engine` references remain
in src/), but the guarded behaviors are unprotected.

**Steps.**
1. Extract: `git diff 'stash@{0}^' 'stash@{0}' -- tests > <scratchpad>/stash0-tests.patch`.
2. Apply each test, adapting to current APIs (the stash predates 3+ weeks of refactors;
   `window.Vectura.engine` is gone — route through whatever the current param-update
   entry point is; read `src/core/engine.js` `updateLayerParams` and the layers-panel
   code first).
3. Run each adapted test against HEAD. Two outcomes per test:
   - It **passes** → the behavior is intact; the test is pure regression armor. Keep it.
   - It **fails** → the June bug has resurfaced or was never fixed. STOP, report to Jay
     with the failure, and fix only with a separate RGR cycle.
4. Do NOT drop the stashes. Report to Jay when done so he can decide
   (`git stash drop` is destructive — [APPROVAL GATE]). Note stash@{1} was verified
   superseded (its `roll` param landed via `terrain.js`). Cross-ref AUD-01: the stashes
   also disarm the git guard, so once Jay approves dropping them, do it promptly.

**RGR.** Inverted here: these tests may pass immediately (behavior already correct). The
Red proof is per-test: temporarily break the behavior (e.g. re-introduce the listener
accumulation by commenting the guard) and confirm the test fails, then restore. State
in the commit body which tests got this mutation-proof.

**DoD.** Three tests (adapted) in HEAD and passing, each with a demonstrated ability to
fail; suites green per matrix (UI-interaction class: integration + e2e); stashes left
intact with a report to Jay.

---

### AUD-07 · Decide + fix the orphaned Playwright screenshot suite and stray e2e spec [DECISION: Jay]

**Problem (verified).**
(a) `tests/e2e/visual.spec.js:6` is gated by
`test.skip(!process.env.ENABLE_SCREENSHOT_VISUALS)` and only runs via
`test:visual:screenshots`, which appears in NO CI workflow and no aggregate script. Its
7 PNG baselines date from 2026-04-05/25; `src/render/renderer.js` has 112+ commits
since. The suite can't catch anything and the baselines are almost certainly stale.
(The vitest SVG baselines in `tests/baselines/svg/` DO run in CI — untouched by this
task.)
(b) `tests/e2e/mask-shift-drag.spec.js:131` (`'programmatic: dispatchEvent Shift+drag →
same result as real mouse'`) is un-skipped but `test:e2e` runs exactly four named specs
(`smoke`, `stroke-options`, `tool-drawer`, `iphone-mini`) — it runs nowhere.

**Options for Jay (a):**
1. **Revive**: regenerate baselines (`ENABLE_SCREENSHOT_VISUALS=1 npx playwright test
   visual.spec --update-snapshots`), add `test:visual:screenshots` to the daily-cron CI
   job (not PR-gating — screenshot tests are flaky across renderer/OS versions).
2. **Delete**: remove `visual.spec.js` + the `-snapshots/` PNGs + the npm script; rely
   on the SVG baselines. Cheaper, loses pixel-level canvas coverage.

**Steps once decided.** For (b) regardless of the (a) decision: add
`mask-shift-drag.spec.js` to the `test:e2e` file list in `package.json`, run it; if it
fails, report — do not skip it to get green.

**RGR.** For (b): Red = show the spec is currently not executed (`npm run test:e2e`
output lacks it); Green = it appears and passes. For (a)-revive: after regenerating,
deliberately perturb a renderer constant locally, confirm the suite fails, revert.

**DoD.** (b) spec runs in `test:e2e` and passes. (a) per decision: either baselines
regenerated + cron CI wiring committed + perturbation-proof shown, or suite fully
removed (spec + snapshots + script + any docs references). Docs contract: update
`docs/testing.md` + README testing table.

---

### AUD-08 · Surface silent persistence failures (cookie limit + localStorage quota)

**Problem (verified: `writeCookie` at `app.js:305` has no length check; btoa
comment at ~767 documents the 4096-byte rationale).**
(a) The pref cookie is ~3,788 of 4,096 bytes after commit 301f1f0 (~230 bytes of JSON
headroom) and will silently drop again as prefs grow. localStorage is now the primary
store (`app.js` ~729/766), so the mitigation exists but nothing warns when the cookie
leg dies.
(b) Preset/localStorage writes swallow quota errors silently in ~6 places:
`src/app/app.js` ~325, `src/ui/preset-bundle.js` ~104, `src/ui/preset-sync.js` ~55,
`src/ui/shell/tool-drawer.js` ~57, `src/ui/shell/context-bar.js` ~89,
`src/ui/components/harmonograph-preset-gallery.js` ~144/168. A preset "saved" in
private mode is silently lost.

**Steps.**
1. In `writeCookie`: if the encoded cookie string exceeds 4,000 bytes, skip the write
   and `console.warn` once per session (localStorage already covers persistence — do
   not toast for the cookie alone).
2. Create one tiny shared helper (suggest `src/ui/utils.js` or wherever storage helpers
   live — check first) `safeLocalStorageSet(key, value, {onFail})`. For *user-initiated
   saves* (preset save, preset bundle) `onFail` must toast: "Couldn't save — browser
   storage is full or disabled." For passive UI-state writes (tool-drawer, context-bar)
   keep silent-with-console.warn.
3. Replace the 6 swallow sites with the helper. Match each site's existing code style.

**RGR.** Red tests:
- Unit: stub `document.cookie` setter, feed `persistPreferences` a snapshot forced over
  4,000 bytes, assert the write is skipped + warn fired (currently: silent overflow).
- Integration: monkeypatch `localStorage.setItem` to throw `QuotaExceededError`, invoke
  the preset-save flow, assert the toast fires (currently: nothing).

**DoD.** Both tests pass; all 6 sites migrated; suites green (UI-interaction class);
manual check: save a preset normally in the running app, confirm no behavior change.

---

### AUD-09 · Stop losing errors in `.vectura` save/open — DONE, see Done section

**Problem.** `src/ui/ui-file-io.js`: `saveVecturaFile` (~67) is `try/finally` with **no
catch** — if `captureState()`/stringify throws, no file downloads, the progress bar
closes normally, and the user gets nothing. `openVecturaFile` (~131) catches but shows a
generic modal and never logs `err`, collapsing all failure modes into one opaque
message.

**Steps.**
1. `saveVecturaFile`: add a catch that (a) `console.error('saveVecturaFile failed', err)`
   and (b) toasts a failure message distinct from the success toast.
2. `openVecturaFile`: keep the friendly modal, add `console.error` with the real error,
   and include `err.message` in the modal's secondary/detail line if the modal supports
   one (read the modal helper first).

**RGR.** Red tests: monkeypatch `captureState` (or `JSON.stringify` via a cyclic layer
param injected into a test engine) to throw → assert failure toast + console.error
(currently: silent); feed `openVecturaFile` malformed JSON → assert console.error called
with the parse error (currently: not called).

**DoD.** Tests pass; suites green (export/serialization class: unit + integration +
e2e); manual: save + reopen a real project in the app still works.

---

### AUD-17 · Add a global error handler (uncaught errors are currently invisible) *(added 2026-07-11)* — DONE, see Done section

**Problem (verified: no `window.onerror` / `error` / `unhandledrejection` listener
anywhere in src/ or index.html).** Any uncaught exception — including the AUD-05
polygon-clipping throws until that lands — leaves the user with a silently broken UI:
no message, no recovery hint, nothing in their face. For a creative tool where users
have unsaved work in memory, "silently dead" is the worst failure mode.

**Steps.**
1. In the app bootstrap (`src/main.js` or early in `App` init — pick where `toast` is
   already reachable), add `window.addEventListener('error', …)` and
   `window.addEventListener('unhandledrejection', …)`.
2. Handler behavior: `console.error` the full error; show a rate-limited toast (at most
   one per ~10 s): "Something went wrong — your last action may not have applied. Save
   your work (Ctrl/Cmd+S) and check the console." Do not attempt auto-recovery.
3. Ignore benign noise: `ResizeObserver loop` warnings, cross-origin `Script error.`
   with no stack — filter those out explicitly.

**RGR.** Red integration test: dispatch a synthetic `ErrorEvent` (and a rejected
promise) on `window`, assert the toast fires and console.error was called. Fails today
(no handler). Also assert the rate limit: two errors back-to-back → one toast.

**DoD.** Tests pass; suites green (UI-interaction class); manual check in the running
app: `setTimeout(() => { throw new Error('test') })` in the console produces the toast
and doesn't break the app.

---

## P2 — Debt, drift, and bloat

### AUD-04 · Clean the stale `styles.css` reference out of `release.yml` *(demoted from P0 2026-07-11)*

**Problem (corrected).** `.github/workflows/release.yml:30` zips
`index.html styles.css src assets patterns README.md CHANGELOG.md`; `styles.css` was
deleted in v1.1.10. **Verified 2026-07-11: `zip` exits 0 when some names match** — the
missing file produces only a warning, so the release pipeline is NOT broken by this;
the artifact simply ships without a file that no longer exists (correct outcome,
misleading manifest). Separately noted as process context, not a defect: no release has
been cut since v1.2.0 (2026-06-15) while package.json has advanced 50+ patch versions.

**Steps.** Remove `styles.css` from the zip list; `ls` every other name to confirm
presence; confirm skin CSS ships via the recursive `src` entry (`src/ui/skin/*.css`).
While in there, also remove `styles\.css` from the version-bump hook matcher in
`.claude/settings.json` (same fossil, verified present 2026-07-11).

**RGR.** Infra: Red = current zip command emits the `name not matched` warning in a
local dry-run (scratchpad dir); Green = fixed command runs warning-free and `unzip -l`
shows index.html, `src/ui/skin/`, assets/, patterns/. Paste both in the commit body.

**DoD.** Workflow + hook matcher committed with dry-run proof. Do not create or push
any tag.

---

### AUD-10 · Decide the dead "Phase 1" component library [DECISION: Jay]

**Problem (verified: spot-checked 6 of 16 — none loaded by `index.html`).** 16 generic
components in `src/ui/components/` (`btn-pulse, color-pill, harmonograph-plotter,
image-input, layer-item, num-step, number-input, pen-item, pen-list, section, seg-ctrl,
select, slider, sw-toggle, tabs, tog-grp` — 2,152 LOC, committed 2026-05-06, untouched
since) are not loaded by `index.html` and referenced by zero loaded code, yet 16 passing
unit tests keep them looking alive. The real UI builds DOM directly and never adopted
the primitives.

**Options:** (1) **Delete** all 16 + their 16 tests in `tests/unit/components/` (the
recommendation — 2 months of non-adoption is the verdict); (2) **Adopt** — a much larger
migration, belongs in plans.md as its own effort, not here.

**Steps if delete.** Before deleting each file, `grep -rn "<RegisteredName>" src/
index.html` to re-verify zero references (registered names are on `window.Vectura.UI.*`
inside each file — read the IIFE tail). Delete component + matching test together.
Verify the 6 live siblings (`angle-dial, empty-state-illustrations,
harmonograph-motion-rack, harmonograph-preset-gallery, info-badge, preset-save-modal`)
are untouched.

**RGR.** Pure deletion of dead code = no behavior change; the proof is the full suite
green after deletion and the app booting clean (no console errors on load —
check with the browser or a Playwright smoke run).

**DoD.** 32 files removed, suites green, app boots with zero new console errors,
CHANGELOG + plans.md note the removal (and the "Phase 1 components" idea moved to
plans.md Decisions as "abandoned in favor of direct DOM").

---

### AUD-11 · Repo bloat: untrack generated graph files; history rewrite proposal [APPROVAL GATE — proposal only]

**Problem.** (a) `graphify-out/graph.json` (~10 MB) + `graph.html` (~5 MB) are rebuilt
and committed by the pre-commit hook on 384 of 725 commits → `.git` is 244 MiB (79 MiB
packed). (b) `examples/rain-nice-silhouette.vectura` is an **85 MB** tracked file (the
largest blob in history), plus 6–7 MB `wavetable-portrait.vectura` and
`spiral-wavestar.vectura`.

**Steps (safe part, do now).**
1. Add `graphify-out/graph.json` and `graphify-out/graph.html` to `.gitignore`;
   `git rm --cached` them; edit `scripts/hooks/pre-commit` so the graphify block stops
   `git add`-ing them (keep `GRAPH_REPORT.md` tracked — it's small and CLAUDE.md tells
   agents to read it). Verify the graphify post-checkout/post-commit hooks don't break
   when the files are untracked.
2. Move the 3 oversized examples out of the tree (e.g. `examples/` → keep small ones;
   large ones to a GitHub Release asset or external storage — ask Jay where) and remove
   from tracking. Note: the repo is PUBLIC with GitHub Pages serving main, so these
   files are also live-download URLs today — moving them changes public URLs.
3. Coordinate with AUD-20 (the stale-tracked `src/inspiration` images are the same
   class of cleanup).

**Steps (proposal only — do NOT execute).** Draft a `git filter-repo` plan to shed the
85 MB blob + ~380 duplicate graph blobs from history. This rewrites history → force-push
→ every clone/worktree invalidated. Given 7+ active worktrees and live sessions, the
plan must include a freeze window. Write the plan into this file under AUD-11 and stop.

**RGR.** Not behavior-changing. Proof: after step 1, make a scratch commit touching
`src/` and confirm `graph.json` is regenerated locally but NOT staged; `git status`
shows it ignored.

**DoD (this task).** Generated files untracked + hook updated + proof commit shown;
examples relocated per Jay's answer; history-rewrite PLAN written and explicitly not
executed.

---

### AUD-12 · Fix silently-passing guarded assertions in tests

**Problem.** 8 `if (el) expect(...)` sites go green if the control is removed/renamed.
Most consequential: `tests/unit/3d-shading-capability.test.js` ~280/349/350 (focal/cam
control contracts), `tests/integration/pendula-oscillator-controls.test.js` ~86 (the
core one-history-push-per-drag assertion), `tests/integration/illus-p3-text-taskbar.test.js`
~92, `tests/integration/wallpaper-center-rotate-handles.test.js` ~127. Find the full set
with: `grep -rn "if (.*) expect(" tests/ | grep -v "//"` and manual review.

**Steps.** Replace each guard with a hard existence assertion first
(`expect(el, '<control> missing').toBeTruthy()`) then the original assertion,
unconditionally. If a site is *legitimately* conditional (control only exists in some
mode), assert the mode precondition explicitly instead of silently skipping.

**RGR.** Red per site: with the guard removed, the test must still pass against HEAD
(if it fails, the guard was hiding a real regression — STOP and report that site to Jay
before "fixing" the test). Then mutation-proof one representative site: rename the
control ID locally, confirm the test now FAILS (before: passed silently), revert.

**DoD.** All ~8 sites converted; suites green; any site that was hiding a real failure
reported, not papered over.

---

### AUD-13 · Doc drift sweep: CLAUDE.md counts, CHANGELOG backfill

**Problem.** (a) CLAUDE.md says "13+ algorithm implementations" listing 15; the registry
has ~28 (missing pendula, rasterPlane, terrain, text, halftone, spirograph, svgDistort,
imageWeave, polyhedron, topoform, pattern, …) and says "petalis" where the key is
`petalisDesigner`. (b) CLAUDE.md's "741/936/950 tests" is ~4× stale (~3,342 tests / 424
files). (c) CHANGELOG.md top entry is 1.2.41; package.json is 1.2.52+ — 11+ undocumented
versions.

**Steps.**
1. Regenerate the algorithm list from `src/core/algorithms/index.js` (the registry is
   the source of truth, not the directory listing — some files are shared utils).
   Update CLAUDE.md's Major Subsystems paragraph; replace hardcoded counts with an
   approximate phrasing that won't fossilize ("~28 algorithms; see
   `src/core/algorithms/index.js`").
2. Replace the test-count example with non-fossilizing phrasing ("all tests passing").
3. CHANGELOG backfill: `git log --oneline` for the commits between the 1.2.41 entry and
   HEAD; write one entry per released version where identifiable from the version-bump
   commits (`git log -p -- package.json` shows each bump). Group trivially small bumps
   ("1.2.42–1.2.45 — <summary>") rather than inventing detail. CHANGELOG.md is
   high-collision: re-read immediately before editing.

**RGR.** Docs-only → per the Testing Matrix, link/path sanity review only: every path
named in the edited sections must exist (`ls` each).

**DoD.** CLAUDE.md algorithm section matches the registry; no hardcoded fossil counts
remain; CHANGELOG covers through the current version; paths verified.

---

### AUD-14 · Consolidate copy-pasted test helpers (loadInJSDOM ×21, makeEngine ×10)

**Problem.** `tests/helpers/load-vectura-runtime.js` and `load-ui-component.js` exist,
yet 21 test files carry a private `const loadInJSDOM` and 10 a private `makeEngine`, and
the copies have already diverged (e.g. `tests/unit/3d-shading-capability.test.js` ~39
sets `pretendToBeVisual: true`; `tests/unit/preset-name-heuristics.test.js` ~15 does
not). A fix to one copy doesn't propagate.

**Steps.**
1. Read both shared helpers; extend them to cover the union of options the private
   copies use (`pretendToBeVisual`, script lists, etc.) with per-call overrides.
2. Migrate mechanically, ONE test file per run of the suite (or small batches), because
   divergent copies mean identical-looking swaps can change JSDOM behavior. Any test
   that changes pass/fail status on migration gets investigated, not forced.
3. Leave a lint-style guard if cheap: a unit test that greps `tests/` for
   `const loadInJSDOM =` outside `tests/helpers/` and fails if found (prevents
   re-accretion).

**RGR.** Refactor with no intended behavior change: the RGR proof is suite-green before
AND after each batch, plus the anti-regression grep test (Red: fails today with 21
hits; Green: 0).

**DoD.** 0 private copies; grep-guard test in place; full unit + integration suites
green.

---

### AUD-15 · Small automation/process fixes (batch)

One commit per bullet; all are independent.

1. **hooks:install parity.** `.git/hooks/post-checkout` + `post-commit` are
   graphify-managed and NOT in `scripts/hooks/`, so `npm run hooks:install` won't
   reproduce them on a fresh clone. Copy them into `scripts/hooks/` and extend the
   install script. DoD: rm the two hooks in a scratch clone, run hooks:install, confirm
   restored byte-identical.
2. **Version-bump hook fires on tests/-only commits** (matcher verified:
   `^(src/|index\.html|styles\.css|tests/)`). Edit the PreToolUse matcher in
   `.claude/settings.json` to drop `tests/` (a test-only commit is not a product
   release). [DECISION: Jay — confirm this is unintended.] Interacts with AUD-19: fewer
   bumps = fewer cache invalidations on the public site. DoD: scratch commit staging
   only a test file does not bump package.json.
3. **Orphaned script.** Delete `scripts/benchmark_clone.js` (zero references). DoD:
   grep proves no references, suites unaffected. — **DONE, see Done section (AUD-15.3)**
4. **settings.local.json leftovers.** Remove one-off permission entries
   (`node /tmp/test-lissajous.js`, hardcoded gstatic curl, `.audit3d` mkdir). Show Jay
   the removal list in the commit body. DoD: entries gone, no active workflow depends
   on them.
5. **`window.app` global** (`src/main.js` ~8). Grep tests/ and src/ for `window.app`
   consumers first. If only tests use it, keep it but add
   `window.Vectura.app = app` as the canonical handle and migrate references
   opportunistically. Do NOT remove `window.app` in this pass (too many unknown
   consumers — e2e specs likely use it). DoD: canonical alias exists + a code comment
   marking `window.app` as legacy.

**RGR.** Items 1–4 are infra: proof-by-demonstration in the commit body as described.
Item 5: suites green; one new unit assertion that `window.Vectura.app === window.app`.

---

### AUD-16 · Pick and add a LICENSE (public repo currently has none) [DECISION: Jay] *(added 2026-07-11)*

**Problem (verified).** The repo is **PUBLIC** (`gh repo view`: visibility PUBLIC,
homepage `https://j-phi.github.io/vectura-studio/`) with a live GitHub Pages
deployment, and there is **no LICENSE file and no `license` field in package.json**.
Default copyright law applies: all rights reserved — visitors legally cannot use, fork,
or redistribute the code they can freely read, and any outside contribution arrives
with unclear terms. Whatever Jay's intent (open-source it or keep rights reserved),
the current state expresses neither.

**Options:** (1) MIT or Apache-2.0 (permissive, matches the vendored deps —
polygon-clipping and opentype.js are MIT, Inter is OFL with its license already
vendored); (2) a source-available/no-commercial license (PolyForm etc.); (3) explicit
"All rights reserved — source visible for reference only" notice.

**Steps once decided.** Add `LICENSE` at repo root; add the matching `"license"` field
to package.json; add a License section to README; inventory vendored third-party
licenses in the commit body (verify the OFL text stays alongside `inter-400.ttf` —
required by OFL).

**RGR.** Docs-only: link/path sanity per the Testing Matrix. Red = `ls LICENSE*` empty
and `grep '"license"' package.json` empty (today); Green = both present and consistent.

**DoD.** LICENSE + package.json field + README section, all naming the same license;
vendor-license inventory in the commit body.

---

### AUD-18 · Multi-tab: zero cross-tab coordination for shared storage *(added 2026-07-11)* [DECISION: Jay]

**Problem (verified: no `storage` event listener and no `BroadcastChannel` anywhere in
src/).** Two open tabs share the preference cookie/localStorage and the preset
localStorage keys with no coordination:
- Preferences are written wholesale (last writer wins): tab B closing clobbers every
  preference change tab A made this session.
- Preset writes merge against fresh localStorage at write time (verified in
  `preset-bundle.js` `importBundle` — good), BUT `mode: 'replace'` overwrites a
  system's presets wholesale from the acting tab's data, and no tab ever *reads* the
  other's writes: preset lists in the UI go stale until reload, so a user can delete or
  overwrite in tab A what they just saved in tab B without either tab noticing.

**Recommended scope (minimal hardening):** listen for `window` `storage` events on the
preset keys and refresh the in-memory preset lists/UI; accept last-writer-wins for
preferences but document it. Full live-sync (BroadcastChannel for layers/undo) is a
feature, not hardening — if wanted, log in plans.md separately.

**Steps.** Find the preset read/registry surface (`preset-sync.js` /
`preset-bundle.js` / whatever caches lists in memory); add one `storage` listener that
invalidates/refreshes on the preset key prefix; debounce; ignore same-tab writes
(storage events already only fire cross-tab).

**RGR.** Red integration test: construct a `StorageEvent` for a preset key and
dispatch on `window`; assert the preset list refresh path runs (fails today — no
listener). Green after.

**DoD.** Listener in place, test green, suites green (UI-interaction class); manual
two-tab check in the running app: save a preset in tab A, see it appear in tab B's
picker without reload.

---

### AUD-19 · Cache-invalidation blast radius: every commit expires every visitor's whole JS cache *(added 2026-07-11)* [DECISION: Jay]

**Problem (fully verified).** `index.html` carries **184 `?v=`-stamped local
script/CSS URLs** (~182 script tags, essentially all deferred), and
`scripts/sync-version.js` `bustQuery` rewrites the `?v=` stamp on **every** local
`./`-prefixed script src and CSS href to the new version on every bump (regex at
`sync-version.js:27-28`; the file's own comment documents this as the intended
single-cache-key design). Because the auto-bump hook fires on nearly every commit
(including test-only ones — AUD-15.2), and GitHub Pages deploys every push to main,
**each push invalidates all ~180 cached JS/CSS files for every visitor**, turning
every visit after any commit into a full re-download of the app.

**Steps.**
1. Options for Jay: (a) accept and document (simplest — correctness-first, cache
   granularity sacrificed; the sync-version.js comment shows this was a deliberate
   trade); (b) land AUD-15.2 + stop bumping on non-product commits, shrinking
   invalidation frequency (recommended, near-free); (c) per-file content hashes —
   heavy machinery against the no-build ethos; recommend against.
2. Whichever is chosen, record the decision + rationale in this file and plans.md
   Decisions.

**RGR.** Decision/infra task: no product behavior change. Proof for (b) is AUD-15.2's
scratch-commit demonstration.

**DoD.** Decision recorded; any hook change proven per AUD-15.2.

---

### AUD-20 · Untrack the 11 stale-tracked `src/inspiration` images (~25 MB shipping by accident) *(added 2026-07-11, resolved from discovery)* — DONE, see Done section

**Problem (verified).** `src/inspiration/` holds 67 reference images (68 MB — the
entire mystery weight of the 73 MB `src/`). The dir is gitignored (`.gitignore:19:
/src/inspiration/`), but **11 images totaling ~25 MB were tracked before the ignore
rule was added** and remain tracked (gitignore does not untrack). Zero references from
`index.html`, `src/`, `tests/`, `scripts/`, or `.github/` — they are not runtime
assets. Consequence: ~25 MB of inspiration JPGs ship in every clone, in the release
zip (`release.yml` zips `src` recursively), and on the public Pages site. The other 56
images are correctly local-only.

**Steps.**
1. `git ls-files src/inspiration` → confirm the 11; re-verify zero references
   (`grep -rln "inspiration" index.html src/ tests/ scripts/ .github/`).
2. `git rm --cached src/inspiration/*` (cached only — files stay on disk; the existing
   ignore rule takes over). This is reversible and does not touch working files.
3. Note in the commit body: blobs remain in git history until AUD-11's history-filter
   plan executes; this task only stops shipping them forward.

**RGR.** Infra: Red = `git ls-files src/inspiration | wc -l` → 11 and the AUD-04
dry-run zip contains the JPGs; Green = 0 tracked and the dry-run zip is ~25 MB smaller.
Paste both in the commit body.

**DoD.** 0 tracked files under `src/inspiration/`; images still present on disk;
dry-run zip shrinkage shown; suites green (nothing references the images, so
`test:fast` suffices).

---

## Sequencing and dependencies

_(See "Status — pick up here" at the top for the current done/unblocked/blocked
snapshot; this section is the reasoning behind that ordering, kept for reference.)_

- ~~AUD-01 first~~ **DONE.** It re-armed the safety net every other task relies on.
- ~~AUD-02 and AUD-03 are independent of everything; do them early~~ — **AUD-03 DONE,
  AUD-02 still open** and is now the last piece of the P0 data-integrity core.
- ~~AUD-17 early too~~ **DONE.**
- AUD-06 before AUD-14 (re-land lost tests before churning test helpers). Both open.
- AUD-15.2 before/with AUD-19 (bump frequency is the cheap lever on cache blast
  radius). Both open, both decision-gated.
- ~~AUD-20 is unblocked and mechanical~~ **DONE** (the untrack step; its zip-shrink
  proof still rides on AUD-04's dry-run, and AUD-04 is still open). Both feed AUD-11's
  history-filter plan.
- ~~Decisions needed from Jay: AUD-01 (tag deletions)~~ **RESOLVED** (2026-07-12, see
  Done section). Still outstanding: AUD-07 (revive vs delete screenshots), AUD-10
  (delete vs adopt components), AUD-15.2 (tests/ bump trigger), AUD-11 (examples
  destination), AUD-16 (license choice), AUD-18 (multi-tab scope), AUD-19 (cache
  strategy).

## Done

- **AUD-01** (2026-07-12, `dd074f7`). Guard hardened: newest of (latest stash creation
  time, latest `recover-*` tag creatordate) must be within 30 minutes or the op is
  blocked, replacing the old any-checkpoint-disarms-it check. RGR proof (throwaway
  worktree): pre-fix hook against a dirty tree + a 2020-dated stale tag → exit 0
  (wrongly allowed); post-fix hook, same state → exit 2 BLOCKED; post-fix hook with a
  1-second-old tag → exit 0 (allowed); clean-tree sanity → exit 0 regardless of
  checkpoints. Full transcript in the `dd074f7` commit body.
  Tag triage verdict (spot-checked each tag's most distinctive unique content against
  current HEAD source — not an exhaustive line-by-line diff): all 7 tags are fully
  superseded by landed work and were approved for deletion by Jay (2026-07-12):
  - `recover-ctxbar-collision` — show-panel restore gating; landed verbatim in
    `src/ui/shell/context-bar.js` (`showPanelNeedsRestore`, `paneDefaultWidth`, etc.).
  - `recover-font-review-1782944415` — area-text frame attachment; landed in
    `src/core/algorithms/text.js` (`attachGlyphs`, `textFrame`, `cellsForAnchor`).
  - `recover-presquash-main` — pre-squash safety net (its commit is not an ancestor of
    HEAD — history was rewritten); its test files (`stroke-style-model.test.js`,
    `text-outline-ops.test.js`, etc.) all exist in HEAD.
  - `recover-text-mvp-6de881bf` — strikethrough/underline decoration controls +
    Vectura variant/weight split; landed in `src/ui/ui-text-panel.js` (`STYLE_EXCL`,
    `variantSelect`, etc.).
  - `recover-text-wip-pre-band-merge` — Google Fonts popularity sort, hidden text-algo
    flag, panel section reorder; landed (`POPULARITY_RANK` in `google-fonts.js`,
    `hidden: true` in `defaults.js`, matching section order in `ui-text-panel.js`).
  - `recover-tracer-checkpoint` — pre-edit baseline for the path-tracer work below;
    superseded once that work landed.
  - `recover-tracer-work` — minimal-anchor path tracer; landed in
    `src/core/geometry-utils.js` (`GeometryUtils.reduceAnchors`), wired into
    `src/core/google-fonts.js`, with `tests/unit/geometry-reduce-anchors.test.js`
    present.
  All 7 tags deleted via `git tag -d` (2026-07-12, no `--force`, reflog-recoverable).
  Excluded from triage: `recover-other-session-wip-2026-07-12` and its matching
  stash — an active checkpoint from another live session, left untouched. Stash
  triage (`stash@{0}`/`stash@{1}`) remains owned by AUD-06, not touched here.

- **AUD-15.3** (2026-07-12, `cab94d9`). Deleted `scripts/benchmark_clone.js` — zero
  references from `src/`, `tests/`, `scripts/`, or `package.json` (grep-verified).

- **AUD-20** (2026-07-12, `2229064`). `git rm --cached` the 11 stale-tracked
  `src/inspiration/*.png` (~25 MB); zero code references confirmed; images remain on
  disk, already covered by the existing `.gitignore` rule. Blobs remain in git history
  until AUD-11's history-filter plan executes.

- **AUD-03** (2026-07-12, `6e8ac1c`). `rng.js`'s `seed ? seed : <random>` treated seed 0
  as falsy, so `SeededRNG(0)` reseeded from `Math.random()` every construction — SVG
  import hard-sets `seed = 0`, so every imported layer and any saved seed-0 layer
  rendered non-deterministically. Fixed to `seed == null ? <random> : seed`. Algorithm
  call sites already used the null-safe `p.seed ?? 0`, so only the constructor needed
  the fix. Added a constants-lock test pinning the LCG's first-5-output sequences for
  seeds 0/1/42. RGR in `tests/unit/rng-noise.test.js`. Full unit (256/256) + visual
  (34/34) green; one pre-existing unrelated integration failure
  (`pendula-preset-gallery.test.js` "auto-applied to a fresh layer") verified caused by
  a concurrent session's uncommitted edit to `user-presets/pendula/default.vectura`
  (reproduces identically with this commit's diff reverted).

- **AUD-09** (2026-07-12, `dc14b1d`). `saveVecturaFile` was try/finally with no catch —
  a thrown `captureState()`/stringify meant no file downloaded and zero user feedback.
  Added a catch: `console.error` + a danger toast distinct from the success toast.
  `openVecturaFile` already caught and toasted but never logged the real error; added
  `console.error(err)` alongside the existing rollback/toast/modal. RGR: two new tests
  in `tests/integration/menus/toast-wireups.test.js`. Full unit (256/256) + integration
  (168/169, same pre-existing unrelated failure as AUD-03) + e2e (53/53 + 7 skipped)
  green.

- **AUD-17** (2026-07-12, `53e2365`). No `window.onerror`/`unhandledrejection` listener
  existed anywhere — any uncaught exception left the UI silently dead. Added
  `installGlobalErrorHandler()` (`src/app/app.js`, called from `App`'s constructor):
  `console.error` + a rate-limited (max 1/10s) danger toast, benign-noise filtered
  (ResizeObserver loop warnings, stackless cross-origin `Script error.`), installed once
  per window via a guard flag (App is constructed repeatedly within the same jsdom
  window across test files). RGR: `tests/integration/global-error-handler.test.js`
  (synthetic `ErrorEvent`/`unhandledrejection` dispatch, rate-limit collapse, noise
  filters, no-listener-stacking on repeated `App()`). Full unit (256/256) + integration
  (169/170, same pre-existing unrelated failure) + visual (34/34) green; full parallel
  `test:e2e` showed 38 `smoke.spec.js` flakes from resource contention with other
  concurrent sessions on this machine — re-ran both projects serially
  (desktop-chromium 27/28 + 1 skipped, tablet-touch-chromium 22/28 + 6 skipped), both
  clean, confirming no real regression.
