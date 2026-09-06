# Agent protocol — 3D fill audit lanes (binding for every implementer / reviewer / judge)

Read first, in order: `docs/3d-audit/fill-audit-handoff.md`, `docs/3d-audit/STILL-OPEN.md`,
`docs/3d-audit/plan-W26-W27.md` (if your unit is W-26/W-27x), and `CLAUDE.md` → "Concurrent
Development & Working-Tree Safety". All paths below are relative to the MAIN repo
`/Users/jayphi/Documents/github/vectura-studio` unless you are told to work in a worktree.

## Where you work
- You are assigned ONE worktree under `.claude/worktrees/<lane>` and ONE port. Never edit any other
  worktree, never edit the main checkout's `src/` or `tests/`, never `git push`, never merge, never
  touch another lane's branch. Version bump hook cannot fire in a worktree — do not bump.
- Before anything: `git -C <worktree> status --short -- . ':!graphify-out'` and `git stash list`.
  If dirty with someone else's work, STOP and report.
- Dev server for your lane: `cd <worktree> && node scripts/dev-server.js <port>`; every evidence
  script prints `window.Vectura.APP_VERSION` and you compare it to the worktree's `package.json`.
- **Foreground only.** Never run tests or captures with `run_in_background`, and never arm a Monitor and end
  your turn to wait — three implementers stalled that way on 2026-09-05. Run vitest one file at a time in the
  foreground; if one file exceeds 15 min, kill it and rerun with `--pool=forks --poolOptions.forks.singleFork=true`.
- Machine is shared. Run TARGETED vitest files (`npx vitest run tests/unit/<file>`), not the full
  suite, unless your brief says otherwise. Timeouts under load are not regressions — rerun alone.

## Serialization by file (do not cross)
`surface-fill.js` → fill-audit-a · `surface-fill-mono.js` → fill-audit-c · `scene3d.js` faceted path +
`context-bar.js` → fill-audit · `hlr.js`/`shadows.js`/pen-fill/fill-boolean → handoff-c ·
`mappers.js` + slices (`scene3d.js` buildSliceSegments/contourSlice pass) → fill-audit-d.

## Every unit
1. RED first: a test that fails at the pre-fix tree and would catch the regression. Keep the
   oracle honest — never widen a tolerance, never re-pin a fingerprint without proof in the commit body.
2. GREEN: implement. Targeted tests pass. Guard tests named in your brief pass or are re-pinned WITH proof.
3. EVIDENCE: re-shoot the named cells from your worktree with
   `node scripts/audit/scene3d-capture.js --tier A|B --root <worktree> --port <port> --only '<regex>' --out docs/3d-audit/fill-audit/after/<W-id>`
   (run from MAIN so the output lands in main's gallery dir). BEFORE naming a cell, confirm it exists in
   `docs/3d-audit/fill-audit/manifest*.json` (there is no imported-mesh primitive and the five ribbon laws are
   never captured — twice today a brief named cells that do not exist); if no cell covers your unit, say so
   and capture a bespoke scene instead. Then write `after/<W-id>/report.json`
   (`after` paths MUST be `after/<W-id>/…`; byte-identical pairs must be explained). LOOK at the PNGs
   yourself (Read tool) and describe what you see in the report. Harness-clean is not app-clean. **Crop the
   defect region at NATIVE resolution before judging** (PIL crop → Read) — a whole 800 px cell hides sub-mm
   defects; on 2026-09-05 a cull that cut mid-ring breaks passed implementer, reviewer and every metric until the
   orchestrator cropped the hole region.
4. COMMIT in the worktree: only your files, `git add <explicit paths>`, message names the W-id and
   carries the before/after numbers. Then STOP. Never push.
5. Stop-and-report beats a fudge. If the oracle cannot be met honestly, ship the measurement and say so.

## Bars changed — mandatory disclosure
Any change to a numeric threshold, tolerance, count bar, or pinned fingerprint in an existing test — up OR down — must
appear in your report under a heading `## Bars changed` as `file:line — old → new — why`, and in the commit body. A bar
change with no entry is treated as a hidden regression and REJECTS the unit (two were caught only by reviewers on
2026-09-05: an ink-ramp bar 1.8 → 1.3 and an O2 sub-bar 5 → 10).

## Reviewers / judges
Read-only in the worktree. Reproduce the red proof in a scratch export
(`mkdir -p /private/tmp/claude-501/scratch-<W-id> && git -C <worktree> archive <pre-sha> | tar -x -C …`,
symlink `node_modules`) — never by editing or stashing in the worktree. Verdict: ACCEPT / ACCEPT-WITH-FOLLOWUPS /
REJECT with the exact numbers you measured. Check: vacuous-pass guards, widened tolerances, fingerprint
re-pins without proof, evidence from one pipeline/one zoom, image actually looked at.

## Reporting (context-protection protocol — mandatory)
Write your FULL report to `docs/3d-audit/lane-reports/<W-id>-<role>.md` (role = impl | review | judge;
append `-2`, `-3` for iterations). Include: lane, worktree, base sha → new sha, files touched, tests
(names + pass/fail counts), RED/GREEN proof numbers, evidence cells + what you SAW, open follow-ups,
and a first line `STATUS: DONE | DONE/FU | MEASURED | REVERTED | BLOCKED | REJECT | ACCEPT …`.
Your final message to the orchestrator is EXACTLY one line:
`REPORT docs/3d-audit/lane-reports/<file> — <STATUS> — <≤15 words>`
Nothing else. No summaries, no code, no logs.
