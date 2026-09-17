STATUS: ACCEPT-WITH-FOLLOWUPS

# MERGE REVIEW — round 3 (`3d-scene/integrate-r3`, 06c46203..52fdbca3 + staged reconciliation)

Reviewer: read-only. Never edited, stashed, checked out, reset or committed in
`.claude/worktrees/integrate-r3`. Verification was done three ways: (a) a scratch `git archive HEAD`
export of the worktree with the staged `git diff --cached` patch applied on top
(`/private/tmp/claude-501/scratch-merge-r3`, patch applied cleanly, `node_modules` symlinked from MAIN,
node v20.20.2), (b) scratch `git archive <sha>` exports of individual lane commits for bisection
(`/private/tmp/claude-501/scratch-{bisect,opd,sct,fillaudit3}-*`, each deleted after use), and (c) direct
**read-only** `npx vitest run` against the real worktree itself for every test that shells out to
`git show` (those fail in a `.git`-less `git archive` export with `fatal: not a git repository` — a
scratch-export artifact identical to the one round 2's reviewer documented, not a merge defect; the
worktree itself has a real `.git` and was never written to). All scratch directories are deleted at the
end of this review; no probe file was left in MAIN or the worktree.

## 1 — The three re-pins

**(a) `tests/unit/scene3d-facet-min-rulings.test.js`, 12 crosshatch T1 goldens.**
Reproduced the claimed RED: restoring the OLD 12 hashes onto the merged tree gives **exactly 12
failures out of 79** (all `pyramid|crosshatch|*` and `sphere|crosshatch|*`, box/plane/solid crosshatch
unaffected) — digit-for-digit the report's symptom. Bisected by running the identical test file (copied,
since it lives only on `fill-audit-3`) against scratch exports of `fill-audit-a3` commits with only the
test file added: **0/12 of these hashes fail at `a3b651f0` (T4, pre-W-36c)**, and the same **12/12 fail
starting at `ac412d61`/`8adfd5af` (W-36c)** — an exact, independently-derived bisection to the commit the
report names, not merely a repetition of its claim. `fill-audit-3` alone (its own lane tip, `141ed0b5`)
is **79/79 GREEN** with the OLD hashes, confirming the file's own lane never saw this and the cause is
purely cross-lane. `8adfd5af` carries `W-36c-review.md: STATUS ACCEPT-WITH-FOLLOWUPS`. **Verdict: attributed correctly, to a reviewed unit, not a hidden regression.**

**(b) `tests/unit/scene3d-one-pen-down-reachability.test.js`, `ladderPaths * 4` → `* 6`.**
Reproduced RED: OLD bar (`*4` = 200) fails on the merged tree at **273** (`expected 273 to be less than
200`), matching the report exactly. Bisected on scratch exports of `fill-audit-a3`, copying only the test
file forward: **GREEN at `8adfd5af`** (98 paths, well under 200); **RED starting at `cd541f87`**
(F1-placement) at **244** (matches report's 244 exactly); **`3bc61c32`** (F1-amp) measures **273**
(matches both the report and the merged tree's own number exactly). GREEN on unmodified `main` (5/5).
All three F1 commits carry `ACCEPT-WITH-FOLLOWUPS` reviews. The re-pin's own primary claim
(`stats.stretches < ladderPaths`, the chain-count assertion) is untouched and still passes; only the
secondary outline-ring sanity ceiling moved. **Verdict: attributed correctly, legitimate cross-lane
consequence of three reviewed units, non-vacuous margin (300 vs measured 273, still far below the old
bar's 200).**

**(c) `tests/integration/scene3d-self-crossing-tone.test.js`, `1.4` → `1.3`.**
Reproduced RED: OLD bar fails on the merged tree at **1.3792435077154686** (`expected … to be greater
than 1.4`), matching the report to 13 decimal places. Bisected: **GREEN at `main` (6ffaf9c6)** and at
**`8adfd5af`**; **RED starting at `cd541f87`** and measuring **1.3697097664425555** (matches report
exactly); **`3bc61c32`** measures **1.3792435077154686** — byte-for-byte identical to the merged tree's
own number, confirming F1-erode/F1-amp moved the ratio *toward* the bar, not away, exactly as claimed.
The `mid` band gate and the `taperedEnds` control both remain unaffected in every run.
**Is the justification honest disclosure or a fudge?** Ruled **honest disclosure**. Four independent
reasons: (1) the number is not merely asserted, it is reproduced by bisection above with an exact match;
(2) the CHANGELOG's "Known limitations" block independently states the mechanism ("redistributing ink
evenly … necessarily softens the light/dark asymmetry") and quantifies it elsewhere ("total ruling length
unchanged to +0.1%"), and explicitly marks the trade as **open, not resolved** — it does not use "accepted"
or "will be retuned"; (3) the margin is modest (≈6% headroom below the measured 1.3792), not a wholesale
gutting — the guard still discriminates by an order of magnitude from the slab regime it exists to catch
(the file's own docstring cites a 0.629→0.147 coverage collapse for that regime, i.e. the ratio would
approach ~1.0 under a real regression, nothing close to 1.3); (4) the re-pin is explicitly tied to Jay's
still-open decision 10 (F1-weight) rather than silently closing it — a future retune is invited, not
foreclosed. This is the pattern the protocol asks for (`file:line — old → new — why`, with proof), not the
pattern it forbids (a widened tolerance with no accounting).

## 2 — `test:ci` suites, re-run in the scratch tree and the real (git-backed) worktree, foreground

| suite | MERGE-impl-r3.md claim | my re-run | match |
|---|---|---|---|
| unit | 5630 passed + 44 skipped (5674), 0 failed | **5630 passed + 44 skipped (5674 total), 0 failed, 476 files passed / 1 skipped (477)** — reproduced on BOTH the first pass (847.13s) and its RPC-timeout retry (834.42s), byte-identical both times, final exit code 0 | **exact** |
| integration | 1998 passed, 0 failed | **236 files passed (236), 1998 passed (1998), 0 failed** — reproduced on BOTH the first pass and its RPC-timeout retry, byte-identical both times, final exit code 0 | **exact** |
| e2e | 62 passed + 7 skipped, 0 failed | **49 passed + 7 skipped** (`smoke.spec.js`, `--workers=1`) **+ 13 passed** (`stroke-options`, `tool-drawer`, `import-3d`, `iphone-mini`) **= 62 passed + 7 skipped, 0 failed** | **exact** |
| visual | 99 passed + 13 skipped, 0 failed | **99 passed + 13 skipped (112), 0 failed** | **exact** |
| perf | 10 passed, 0 failed | **10 passed (10), 0 failed** | **exact** |

Method note, disclosed per the protocol's "scratch-export artifact" precedent: the initial full run in
the **pure `git archive` scratch tree** (no `.git`) produced 3 false test failures — all `execFileSync('git',
['show', SHA, …])` calls throwing `fatal: not a git repository`, in `scene3d-mkdashramp-low-end.test.js`,
`scene3d-ribbon-flat-field-placement.test.js` and `scene3d-shadow-receive-lighttypes.test.js`. These are
sha-pinned tests reading their OWN pre-fix baseline via `git show <fixed-sha>:<path>` — a correct pattern
per `AGENT-PROTOCOL.md` and this file's own condition-1 method, but one that requires a real `.git`. Re-ran
the full `test:unit`/`test:integration` suites directly against the **real, git-backed** integration
worktree (read-only `npx vitest run`, never editing it) and all three passed cleanly there, producing the
table above. This exactly mirrors `MERGE-review-r2.md` §5's documented handling of the same class of
artifact — not a merge defect.

Both `test:unit` and `test:integration` hit the documented benign `[run-vitest] … birpc "Timeout calling
onTaskUpdate" … Retrying once` pattern (never a real failure — `run-vitest.js`'s own retry logic confirmed
"no test failed"); `tests/unit/scene3d-tone-law-collapse.test.js` (Tier 1) again took ~845s alone, matching
the documented 390–1045s range. `[FillBoolean] polygon union failed on degenerate geometry` stderr noise
observed repeatedly — documented, benign. No `.only`/`.skip`/`.todo` introduced anywhere in
`06c46203..52fdbca3 -- tests` (swept). **No red anywhere outside the three disclosed, proven re-pins above.
Every number in the report's table reproduced exactly; every count rose over the round-2 baseline as
required (unit +475, integration +25); no drop anywhere.**

## 3 — Checklist items 23 and 30

**Item 23 — `git show HEAD:` sweep, re-run on the merged tree.** `git grep -n -E "git show HEAD:|git show
HEAD "` and a `exec(File)?Sync` sweep across `tests/` on the patched scratch tree found: the previously
BROKEN `scene3d-mktick-wedge.test.js:278` self-test is **gone** — replaced by T2-3b/T2-3c with pinned
`pathSignature` goldens plus a `loadHeadSource()` mechanism assertion (confirmed by reading the file: no
live `execFileSync('git', ['show','HEAD:…'])` remains, only a comment documenting the history); re-ran the
file directly: **58/58 GREEN**, resolving the plan's only named merge blocker exactly as §9a anticipated.
`scene3d-slice-end-overlap.test.js:131` still carries its **live, structurally-vacuous** `execFileSync('git',
['show', 'HEAD:'+SCENE3D_REL])` call, exactly as the plan predicted (comparing `HEAD` to itself on a clean
tree can never fail) — this is **disclosed**, not hidden: `plans.md`'s new "Now" queue item 3 names it by
file, explains why (`HEAD` ≡ loaded source), and states the needed fix (absent-key/equality oracle or a
fixed historical pin). It has **not** been assigned a numbered W-id — a minor incompleteness relative to
the plan's literal "open a W-id" instruction, honestly disclosed by the implementer as deferred numbering
rather than silently dropped. `tests/unit/text-fill-watertight.test.js` reclassified from "EXPECTED TO
FAIL" (stale comment) to live: independently re-ran it on **both** unmodified `main` and the merged tree —
**68/68 GREEN on both**, confirming the report's own reclassification. Every other hit in the sweep is a
correct, fixed-sha historical pin (`T3_BASE_SHA`, `F1P_BASELINE_SHA`, `pre-wip-surface-fill.js`'s pins,
etc.) — none live against `HEAD`. **Verdict: every hit has a disposition; one item (the slice-end-overlap
W-id number) is a minor open follow-up, not a hidden gap.**

**Item 30 — ground-plane ink audit, spot-checked three reports from three different lanes/authors.**
`F1-width-bar-reshoot.md` explicitly states ground-plane inclusion in its own text (self-classifying, no
action needed). `T4-impl.md` (§"Evidence — real capture pipeline") names `scripts/audit/scene3d-capture.js`
as its ink source — confirmed this is Rule A (excludes ground, per the script's own `groundChild.visible =
false` / `q.ground.enabled = false`), matching the report's classification table exactly.
`F1-erode-impl.md` likewise names `scene3d-capture.js` for its 14-cell capture and its own
byte-identity finding — Rule A, matches. `W-31b-plan.md`'s ink numbers come from direct
`SurfaceFill.buildObject`/unit-test harnesses (`scene3d-crosshatch-parity.test.js` etc.), never touching a
ground child — correctly bucketed "object-only / ground N/A" in the report's table. **All three spot-checks
agree with MERGE-impl-r3.md's classification table.**

## 4 — Cross-lane behaviours no single lane could test

Reproduced at least five of the six named checks on the merged tree (a, b, c, d, e, f):

- **(a) `facetMinRulings` × T3/T4 density response.** `scene3d-mkdashramp-dark-end.test.js` 4/4,
  `scene3d-mkdashramp-low-end.test.js` 13/13 (includes its own byte-identity sweep across sphere/torus/cone
  × hatch × d={1,50,220}), `scene3d-facet-min-rulings.test.js` 79/79 post-re-pin (covers box/pyramid ×
  density directly). No monotonicity break, no G4 regression.
- **(b) W-38's "Min rulings" panel row × U9b-2/U5b-4's caveat, LIVE in the running app.** Started the
  scratch tree's dev server (port 8500, killed after), added a Scene 3D layer, selected the sphere object,
  set Type = Hatch: confirmed the **Min Rulings slider is present** on the docked Style panel (label,
  tooltip text, numeric field). Selected Fill Style = "Duty Cycle · Constant" (the caveat-bearing law) and
  the docked panel rendered the caveat verbatim: *"The open paper you see in highlight areas is
  intentional — marks shrink down to dots there, so the gaps between them are the shading effect working
  as designed, not a defect."* — confirming U9b-2/U5b-4's fix live. Independently confirmed the report's
  disclosed gap by source read: `grep -n "MAPPER_CONTROLS" src/ui/shell/context-bar.js
  src/config/context-bar.js` returns **zero matches** in either file — the ctxbar Style flyout structurally
  cannot reach `D_FACETFLOOR`/Min Rulings (which lives only in `scene3d-panel.js`'s `MAPPER_CONTROLS`), so
  the disclosed "Min Rulings is docked-panel-only" finding is real and not fixed at merge, exactly as
  reported. (I did not additionally re-open the ctxbar flyout live to re-confirm its absence there — the
  static proof is unambiguous and the docked-panel presence + caveat rendering were confirmed live.)
- **(c) U5b-5's CSS ellipsis × the merged flyout.** Re-ran the specificity grep on the merged
  `components.css`: `.ctxbar-fly-ctl .ctrl-sel { overflow:hidden; text-overflow:ellipsis;
  white-space:nowrap }` present at (0,2,0) specificity; the only other multi-class `.ctrl-sel` rules
  (`.ctrl-sel-wrap .ctrl-sel`, `.fcs-divisions-select .ctrl-sel`, `.ctxbar-fly-ctl.ctxbar-fly-mixed
  .ctrl-sel`) set `width`/`color`/`font-style` only — no collision. Embedded in
  `scene3d-fill-style-picker.test.js`, which is 177/177 green on the merged tree.
- **(d) `persistentStyleKeys()` union × `STYLE_PARAMS`.** Source-read confirms the union is correct:
  `const base = ['fillDensity', 'fillAngle', 'toneLaw', 'facetMinRulings'];` at `scene3d-panel.js:499`, with
  `STYLE_PARAMS`-derived extras appended after. `scene3d-fill-style-effective-law.test.js` 7/7 green.
- **(e) F1 placement/erosion × W-38's facet floor.** `scene3d-ribbon-width-bar.test.js` 10/10,
  `scene3d-ribbon-width-create-rig.test.js` 12/12 — per-law width floors hold on the merged tree.
- **(f) U9b-2 write-back × T4 band-pass marks.** `scene3d-shadow-tone-law-uniqueness.test.js` 7/7,
  `tests/integration/scene3d-shadow-writeback.test.js` 10/10.

**Verdict: all six checked, all green, matching the report's own findings including its one disclosed
completeness gap (b).**

## 5 — Version and docs

`package.json` **1.4.2**; `src/config/version.js` `Vectura.APP_VERSION = '1.4.2'`; `index.html`
**222** `v=1.4.2` cache-busters, **0** `v=1.4.1` remaining (grepped independently). Ran `npm run
version:sync` in the scratch tree: `package.json`/`version.js`/`index.html` **byte-identical (md5)
before and after** — confirmed no-op, i.e. genuinely synced already. `CHANGELOG.md`'s "Known
limitations" block states decision 11 (crosshatch cap onset) and the wave-ribbon-weight trade (decision
10) both as **open, not settled by this release** — no "accepted"/"will be retuned" language found.
Forbidden-number sweep (`426/426`, `550`, `328`, `level-6 ring only`) — **zero matches** in
CHANGELOG/README/plans.md. `plans.md`'s "Blocked on Jay" section states round-3's four decisions in full,
distinct from round 2's frozen nine, and does not pre-empt any of them. **No `git push` anywhere** — I
never ran a git command that writes, and none of the reports claim one.

One minor accuracy note (not a defect in the merge itself): `MERGE-impl-r3.md` §10 states README's release
notes are "now 3 inline: 1.4.2/1.4.1/1.4.0" — the actual file has **five** headings before the
`<details>` cutoff (`1.4.2, 1.4.1, 1.4.0, 1.3.99, 1.3.85`). This is a **pre-existing** condition
(confirmed: `main`@`6ffaf9c6` already had four inline before round 3 added the fifth) and not something
round 3 worsened structurally beyond adding its own one entry on top — but the report's characterization of
the current state is inaccurate. Flagged as a follow-up, not a blocker.

`docs/3d-audit/fill-audit-handoff.md` was **not** updated by this merge (confirmed: last touched at
`6ffaf9c6`, before round 3) — per the plan this is explicitly an orchestrator-only post-merge step (§7.5,
§10 step 6), correctly deferred rather than skipped silently.

## 6 — Live verification

Dev server started on a free scratch port (**8500**, ≥8500 as required, killed after all checks) serving
the **patched scratch tree** (the merge's actual final code, including all three re-pins). Loaded the app
in Playwright (not chrome-devtools, to avoid any lock-fight with other live sessions), added a **Scene 3D**
algorithm layer (default sphere object + sun + ground), and drove:

- **Sphere, Hatch mapper, Fill Style = Mark · Tick, Density 50 → 220.** Screenshotted and cropped both at
  native resolution. At d=220 the tick fill covers the sphere densely and evenly, no bare wedge visible
  (the one dark patch is the deliberately-selected "Highlight: Blank" treatment, not a defect) — visually
  consistent with T2-3/T2-3b/T2-3c's "tick fills cover the bare wedge" claim.
- **Buckyball** (Shape = Polyhedron, Family = Buckyball, the app's own default family for that shape),
  same Hatch + Mark · Tick sweep at d=50 and d=220 — renders cleanly, "Mark · Tick — no effect here" label
  appears at d=220 on this fixture (pre-existing UI copy for a law that saturates at high density on a
  faceted low-vertex-count-per-face solid; not a regression, not part of round 3's scope).
- **Sphere, Crosshatch mapper, Fill Style = Ladder (default), Density 220.** Dense but visibly
  **not solid-black** fill with a real light-to-shadow gradient — confirms W-36c/W-36d's anti-saturation
  cap is live and working (Density 220 does not fill solid), matching the CHANGELOG's "Changed" entry.
- **Sphere, Crosshatch, Fill Style = Duty Cycle · Constant** (the U9b-2/U5b-4 caveat-bearing law): caveat
  text rendered live, verbatim, on the docked panel (quoted in §4(b) above).

**Console:** exactly two messages for the entire session, both pre-existing/benign and unrelated to round
3 — a `cdn.tailwindcss.com should not be used in production` dev warning and one `favicon.ico 404`. **Zero
new console errors** were introduced by any interaction (layer add, mapper switch, density change,
fill-style change, primitive change). `window.Vectura.APP_VERSION` reads **`"1.4.2"`**, matching
`package.json`.

Cleaned up: killed both dev servers I started (8500, 4173) and deleted every screenshot PNG this review
wrote into the repo working directory before finishing (`git status` confirms clean of them; `.playwright-mcp/`
is pre-existing and gitignored). No probe file left behind.

## Overall verdict: **ACCEPT-WITH-FOLLOWUPS**

Every claim in `MERGE-impl-r3.md` that I set out to independently re-derive — the three re-pins' RED
reproduction and lane attribution by bisection, all five `test:ci` suite counts, the item 23/30 sweeps, all
six cross-lane checks, version/docs consistency, and the live app behaviour — reproduced exactly, with
independently-measured numbers matching the report's numbers digit-for-digit (most strikingly
`1.3792435077154686` for the self-crossing-tone ratio, and `273`/`244`/`98` for the reachability path
counts, all re-derived from scratch by bisection rather than trusted). No vacuous pass, no widened
tolerance without proof, no unproven re-pin, no single-pipeline/single-zoom evidence, no hidden regression.

Two small, non-blocking follow-ups, neither of which touches `src/` or test correctness:
1. `docs/3d-audit/fill-audit/after/…`'s slice-end-overlap vacuous-test follow-up in `plans.md` lacks a
   formally numbered W-id (content and disposition are correct and disclosed; only the ticket number is
   missing).
2. `MERGE-impl-r3.md` §10 mischaracterizes README's release-notes inline count (says 3, file has 5) — a
   pre-existing condition from before round 3, not worsened in kind, but the report's own claim about it is
   inaccurate.

**The orchestrator MAY commit the staged reconciliation and fast-forward `main` onto
`3d-scene/integrate-r3`.** Local `main` stays 44+ ahead of `origin/main` and unpushed, per standing
instruction — nothing in this review changes that. No `git push`, merge-to-remote, tag, or PR was run or
should be run without Jay's explicit word.
