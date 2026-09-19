STATUS: ACCEPT-WITH-FOLLOWUPS

# MERGE REVIEW — round 4 (`3d-scene/integrate-r4`, `13ad4780..49af44d9` + staged docs remainder)

Reviewer: read-only in `.claude/worktrees/integrate-r4` throughout — never edited, stashed, checked
out, reset, committed or unstashed there; `git status`/`git diff --cached` re-verified unchanged
(HEAD `49af44d9`, 4 staged files: `CHANGELOG.md`/`README.md`/`docs/3d-audit/fill-audit-handoff.md`/
`plans.md`) at the end of this review, matching the state at the start.

Verification method: `mkdir -p /private/tmp/claude-501/scratch-merge-r4 && git -C <worktree> archive
HEAD | tar -x -C …` + `git -C <worktree> diff --cached | patch -p1 -d …` (clean apply confirmed),
`node_modules` symlinked from MAIN, Node v20.20.2. All five `test:ci` suites, the mktick-wedge/
xray-fold golden re-derivation, and the R4-1 curved-primitive golden-grep set were reproduced in
this scratch tree; the small number of tests that shell out to `git show <sha>:…` for a pre-fix
baseline fail in a bare `git archive` export (no `.git`) — resolved, without editing the scratch
tree, by exporting `GIT_DIR=<MAIN>/.git/worktrees/integrate-r4` for those runs (HEAD resolves to
`49af44d9`, all pinned base shas reachable) — the same class of scratch-export artifact
`MERGE-review-r3.md` documented, not a merge defect. For the two bisections requiring a lane's own
history (the `xray-fold-golden` re-pin and the six `## Pre-existing red` items), I ran the real test
files directly, read-only, against the actual git-backed `border-4` and `fill-audit-a4` lane
worktrees (never editing them) — the same method `MERGE-review-r3.md` §2 used for the identical
class of artifact. All scratch directories are deleted at the end of this review; no probe file was
left in MAIN, the integration worktree, or either lane worktree.

An earlier draft of this review over-delegated the suite runs to a subagent working in the same
scratch tree; a second, unrelated concurrent `test:integration` launch from that subagent collided
with mine and both crashed with `ERR_IPC_CHANNEL_CLOSED`. Corrected: I am the sole reviewer of
record. The subagent's unit-suite reconciliation is cited below as corroboration only, never as a
substitute for my own measurement — every number in this report was independently reproduced by me,
directly, in the sections below.

---

## 1 — The re-derived goldens (12 `mktick-wedge` + 1 `xray-fold-golden` `xraySphere`)

**`tests/unit/scene3d-mktick-wedge.test.js`.** Ran it on the merged tree: **58/58 GREEN**, including
`MUTATION-KILL 2` (the T2-3 stagger disabled via `room = 0`, both rigs, all six cells) and the O5
length-ratio/monotonicity bars (`O5_BAR = 2.30`) — both still trip, confirmed by the file's own
in-suite assertions passing (a broken mutation-kill would show as a red test, not a silent pass).

Extracted `EXPECTED_SIGNATURE` from `b43fa4e3` (base), `3d-scene/border-4` (`5d8574da`) and
`3d-scene/fill-audit-a4` (`0f420747`) via `git show <ref>:<path>`, and compared against the merged
tree's twelve values:

| cell | border-4 (pre-merge) | fill-audit-a4 (pre-merge) | merged tree | verdict |
|---|---|---|---|---|
| `test\|sphere/hatch` | `fec6f83a…` | `e1d6e011…` | `5b90b967…` | differs from both ✓ |
| `test\|sphere/contour` | `b1b3def0…` | `4e4524ab…` | `9cb13371…` | differs from both ✓ |
| `test\|torus/hatch` | `7c12b6b4…` (unchanged from base) | `cd2c062e…` | `cd2c062e…` | **byte-identical to a4** ✓ |
| `test\|torus/contour` | `aa9ea62c…` (unchanged) | `e1312b97…` | `e1312b97…` | **byte-identical to a4** ✓ |
| `test\|cone/hatch` | `dacfc575…` | `eb8ce546…` | `db708574…` | differs from both ✓ |
| `test\|cone/contour` | `3760b050…` | `9703754b…` | `b0985d95…` | differs from both ✓ |
| `create\|sphere/hatch` | `1ea20309…` | `58b1b7f1…` | `ea0c70a0…` | differs from both ✓ |
| `create\|sphere/contour` | `6b6edd1e…` | `239b2fbc…` | `99ccc200…` | differs from both ✓ |
| `create\|torus/hatch` | `46725241…` (unchanged) | `41d0659d…` | `41d0659d…` | **byte-identical to a4** ✓ |
| `create\|torus/contour` | `558ff66b…` (unchanged) | `8a752bfb…` | `8a752bfb…` | **byte-identical to a4** ✓ |
| `create\|cone/hatch` | `14097362…` | `d1c3048a…` | `3f863784…` | differs from both ✓ |
| `create\|cone/contour` | `d9a36e63…` | `2b1234f1…` | `84846132…` | differs from both ✓ |

Both falsifiable predictions in `MERGE-plan-r4.md` §2.5 hold, independently confirmed: the four
`torus/*` cells are byte-identical to `fill-audit-a4`'s pre-merge values (the convexity gate holds,
no leak), and all eight `sphere/*`/`cone/*` cells differ from BOTH prior sides (each carries a fill
delta and an edge delta). Neither lane's pins survived; the goldens were genuinely re-derived on the
merged tree, not copied from either side.

**`tests/fixtures/xray-fold-golden.json` — `xraySphere` (the 13th re-pin, found by the full suite,
not the plan's curated list).** Reproduced the bisection independently, not merely re-read it:

- `git -C <MAIN> archive b43fa4e3 | tar -x -C <scratch>` → `npx vitest run
  tests/unit/scene3d-xray-fold.test.js tests/unit/scene3d-curved-fill-angle-migration.test.js` →
  **18/18 + 39/39 GREEN** on unmodified main.
- `git -C <MAIN> archive 3d-scene/border-4 | tar -x -C <scratch>` → same two files → **2 failed | 55
  passed (57)**, symptom identical to the commit body: a `"straight": true` edge-path flag
  disappearing and a 2-point straight segment becoming a multi-point curved one on the sphere's
  x-ray silhouette (W-32 Rank 4's mesh-chord → analytic-silhouette change, exactly as claimed).
- On the merged tree: **18/18 + 39/39 GREEN** again.
- Diffed the fixture JSON programmatically (`before[k] === after[k]` per key, not a textual diff of
  the single-line minified file): only `xraySphere` changed; `xrayBox`, `xrayBoxHiddenOff`, `mixed`
  are byte-identical before/after. Path count 112 → 112, as claimed.

**Verdict, condition 1: CONFIRMED, independently, for all thirteen re-pins.** The mutation trips,
neither lane's original pins survive, the torus cells prove the convexity gate held, and the
`xraySphere` re-pin's single-lane causation (border-4 alone, not a cross-lane interaction) is proven
by bisection, not asserted.

---

## 2 — `test:ci`, all five suites, re-run in the scratch tree, foreground, one at a time

I ran every suite myself, directly (see the delegation note above for why a subagent's parallel run
is cited only as corroboration). `test:unit` needed `GIT_DIR=<MAIN>/.git/worktrees/integrate-r4` set
for the 8 files that shell out to `git show <sha>:…`; every other suite ran unmodified.

| suite | round-3/round-4-claimed baseline | my measurement | match |
|---|---|---|---|
| unit | 6167 passed + 6 failed + 44 skipped (6217) | **6167 passed + 6 failed + 44 skipped (6217)**, 478 files passed / 4 failed / 1 skipped (483), exit 1 (real failures exist so run-vitest's retry does not mask them) | **exact** |
| integration | 1998 passed, 0 failed | **236 files passed (236), 1998 passed (1998)**, 1 benign `[vitest-worker]: Timeout calling "onTaskUpdate"` RPC error (retried, no test failed, exit 0) | **exact** |
| e2e | 62 passed + 7 skipped | **49 passed + 7 skipped** (smoke, `--workers=1`) **+ 2** (stroke-options) **+ 1** (tool-drawer) **+ 9** (import-3d) **+ 1** (iphone-mini) **= 62 passed + 7 skipped, 0 failed** | **exact** |
| visual | 99 passed + 13 skipped | **99 passed + 13 skipped (112)**, 6 files, `scene3d-tone-baseline.test.js` (43 tests, 13 skipped, the curved-primitive pinned-golden file) fully green | **exact** |
| perf | 10 passed | **10 passed (5 files)** | **exact** |

**The six `test:unit` failures — reconciled against `MERGE-impl-r4.md` §5, each bisected myself
against the real git-backed lane worktrees (never an archive with no `.git`, never trusted from the
report):**

| # | test | claim | my independent reproduction |
|---|---|---|---|
| 1 | `scene3d-mark-laws-draw.test.js` — O1 torus/contour sagitta median `< 0.10` | pre-existing on `fill-audit-a4` alone | Ran directly against the `fill-audit-a4` worktree (`0f420747`, clean): **29 passed, 1 failed**, same value `0.09794838126911516` to full precision. **Confirmed pre-existing, not merge-caused.** |
| 2 | `scene3d-mkdashramp-discrete.test.js` — byte-identity sweep, mkTick unaffected | pre-existing on a4 alone | Ran against `fill-audit-a4` worktree: **2 failed, 40 passed (42)** across both dashramp files, same md5 pair (`40221c03…` / `f0395ad0…` on a4-alone vs `6fe8189b…`/`be35177d…` on the merged tree — the merged-tree hash differs because border-4's edge pass also changed the mutant fixture, but the ASSERTION fails identically on both trees). **Confirmed pre-existing.** |
| 3 | `scene3d-mkdashramp-discrete.test.js` — T4b fixture ink, `toBeCloseTo(1501.0636578167772, 3)` | genuine cross-lane, NOT pre-existing | Same a4-alone run: this specific assertion is **absent from the 2 failures** (i.e. it passes on a4 alone). On the merged tree (real worktree, not archive): **received `1501.2671242469714`, Δ 0.2034664301943394** — matches the claimed number to 13 decimal places. **Confirmed genuine cross-lane interaction, correctly left red and disclosed rather than re-pinned.** |
| 4 | `scene3d-mkdashramp-single-pass.test.js` — same byte-identity sweep | pre-existing on a4 alone | Same run as #2. **Confirmed.** |
| 5 | `scene3d-mkdashramp-single-pass.test.js` — same T4b ink assertion | genuine cross-lane | Same numbers as #3. **Confirmed.** |
| 6 | `scene3d-mktick-gap-fill.test.js` — "SEMANTIC PRE reconstruction proof … base sha 75777240 … byte-for-byte" | genuine cross-lane (scene3d.js's edge pass also differs between the compared trees) | Ran directly against the integration worktree: **1 failed, 43 passed (44)**, exact match. The failure diff is a small floating-point coordinate divergence in the reconstructed path set — consistent with the disclosed cause (border-4 also touches `scene3d.js` between the compared base sha and the current tree, which the self-test's reconstruction didn't anticipate). The file's real oracle (A1/A1b bars, O-C2 census) is unaffected, confirmed green in the same run. **Confirmed genuine, correctly disclosed, not silently fixed or re-pinned.** |

No red outside these six, no `.only`/`.skip`/`.todo` introduced by either merge (`git diff
b43fa4e3..49af44d9 -- tests/` grepped for `\.(only|skip|todo)\(` on added lines: zero hits). All six
are exactly the report's own disclosed, characterized reds — none silenced, none re-pinned without
proof, none hidden.

**`test:unit`, the full run, myself, once cleanly.** After an earlier attempt collided with a
subagent's concurrent `test:integration` launch (both crashed with `ERR_IPC_CHANNEL_CLOSED` — see
the delegation note above), I stood the subagent down and re-ran every suite myself, serialized,
with no other vitest/playwright process alive on the machine (verified via `pgrep` before each run).
`test:unit` with `GIT_DIR` set: **892.05s wall, exit 0** —
`Test Files 4 failed | 478 passed | 1 skipped (483)`,
`Tests 6 failed | 6167 passed | 44 skipped (6217)`, 8 benign RPC-timeout errors (the documented
`[vitest-worker]: Timeout calling "onTaskUpdate"` noise, no test affected). This is an exact,
independent, first-hand match to `MERGE-impl-r4.md`'s claimed total, and the six failing tests
printed in this same run are byte-for-byte the same six assertions/numbers tabulated above. (A
subagent's earlier, separately-run reconciliation had already produced the identical 6167/6/44/6217
total with the same six failures before I stood it down over the resource-contention incident; I
note it only as prior corroboration — the number the verdict rests on is my own run above.)

---

## 3 — Cross-lane behaviours no single lane could test

Reproduced three of the plan's four checks directly (the fourth partially, see below) — all three
by re-shooting fresh captures from a dev server I started against the scratch tree (never reused the
implementer's `after/MERGE-r4/` shots) and looking at them myself, cropped at native/zoomed
resolution.

**(a) T2-6's graded comb × W-32r4's refined silhouette, on the cone.** Re-shot
`cone__(hatch|contour)__mkTick__(med|max)__[ab]` fresh from the scratch tree (port 8501). Cropped the
right flank at 3–4× native resolution for `cone__hatch__mkTick__med__a` and
`cone__contour__mkTick__max__a`. **Looked at both:** the graded comb's sub-ticks shorten
progressively toward the boundary; every tick ends inside a visible margin of black space before the
refined silhouette curve — **none cross or touch the outline.** Matches the report's own finding.

**(b) T3c's dash-length bound × the refined border, on sphere ends.** Re-shot
`sphere__hatch__mkDashRamp__(low|med)__[ab]` fresh. Cropped the silhouette region at 4× native
resolution. **Looked at it:** dashes meet the refined outline tangentially — the mark blends smoothly
into the border curve rather than crossing it or stopping short with a visible gap. Matches the
report's finding of "dashes … meet the border tangentially … no barb crossing the outline, no gap
opening between the last dash and the border."

**(c) T2-5/T2-6's mkTick mechanism × `scene3d-facet-min-rulings`'s pins.** Ran both files fresh on
the scratch tree: **`scene3d-facet-min-rulings.test.js` 79/79**, **`scene3d-box-density-bearing.test.js`
4/4**, both green with `border-4`'s values unmodified (one benign RPC timeout noted, no test
affected). Matches the report exactly, no bisection needed since both are green as shipped.

**(d) W-36e's interior crosshatch bar × the border refinement, on the ellipsoid.** Ran
`scene3d-curved-density-floor.test.js` fresh: **15/15 GREEN** (its own fixture is the torus,
excluded by the convexity gate, so total immunity is expected and confirmed). For the ellipsoid
itself — no gallery cell exists for it (`TIER_B_PRIMITIVES = ['sphere','torus','box','cone']`,
confirmed by reading `scripts/audit/scene3d-capture.js` directly) — I built a live scene through the
**real running app** (Playwright driving the actual engine/UI render path, not a bespoke offline
rasterizer) with an ellipsoid set to Crosshatch/Ladder at Density 50, and looked at the result: a
clean two-family crossing-line lattice with no saturation, no broken cells, and a smooth outline at
the rim — no defect. This is weaker than a side-by-side before/after of the SAME cell (I did not
re-derive the report's own bespoke `raster.js` output to diff against it), so I count this check as
**verified but not independently cross-checked against the implementer's own evidence** — a minor
gap, not a red flag; the test-level immunity (15/15, torus-only fixture) is the part that actually
gates this behaviour, and that part is fully confirmed.

---

## 4 — Round-4 checklist

**R4-1, the curved-primitive golden grep, re-run on the merged tree.** Grepped
`toBe\('[0-9a-f]{32,64}'\)|EXPECTED_SIGNATURE|EXPECTED_T1|pathSignature|md5PathsAll|fingerprint\(`
across `tests/` — matches the plan's candidate-file list. Ran every named file individually on the
scratch tree (with `GIT_DIR` set where needed): `scene3d-mktick-wedge` 58/58,
`scene3d-facet-min-rulings` 79/79, `scene3d-box-density-bearing` 4/4, `scene3d-curves` 13/13,
`scene3d-hlr-spatial-index-identity` 6/6, `scene3d-curved-density-sparse-end` (green, W-33's golden
untouched), `scene3d-curved-density-floor` 15/15, `scene3d-contour-slice` 67/67,
`scene3d-slice-end-overlap` 30/30 (its vacuous `git show HEAD:` leg is a known, already-ticketed
issue — see below, not a new finding), `tests/visual/scene3d-tone-baseline` 43/43 (13 skipped),
`scene3d-mktick-band-purity` 35/35, `scene3d-mktick-gap-fill` 43/44 (the one disclosed cross-lane
red, §2 item 6), `scene3d-mkdashramp-discrete`/`-single-pass` (the disclosed reds, §2 items 2–5),
`scene3d-ribbon-fill-depth-count` 12/12, `scene3d-fill-silhouette-overshoot` 401/401. Every hit
either green or already accounted for in §2's six-item table — no new golden-file regression.

**Item 23, the `git show HEAD:` sweep.** `tests/unit/scene3d-slice-end-overlap.test.js` still
carries the known, structurally-vacuous live `execFileSync('git', ['show', 'HEAD:'+SCENE3D_REL])`
call (comparing `HEAD` to itself can never fail on a clean tree) — confirmed present, confirmed it
is the SAME pre-existing issue named across three prior rounds, confirmed `plans.md` now assigns it
**W-39** (grepped `plans.md` directly: "`W-39 — tests/unit/scene3d-slice-end-overlap.test.js`'s
vacuous `git show HEAD:` leg"). Not fixed inside the merge, correctly — it needs its own mutation
proof, not a merge-time patch. The two sha-pinned baseline reads (`T3C_BASE_SHA = '75777240'`,
`T3B_BASE_SHA = 'b43fa4e3'`) are the correct historical-pin pattern, confirmed reachable on the
integration branch (`git cat-file -e` on both plus the other ten pinned shas named in the plan — all
resolve).

**Item 25, the intentionally-red/skip sweep.** `grep -rniE
"intentionally[ -]red|expected to fail|\.fails\(|test\.skip\(|it\.skip\("` over `tests/` — every hit
is a pre-existing, environment-gated skip (mobile-layout, tablet-touch emulation,
`ENABLE_SCREENSHOT_VISUALS`, an unimplemented algorithm mode, a CSS-var-conditional skip). No new
hit from either lane, confirmed by diffing the two merge commits' test changes for `\.(only|skip|todo)\(`
on added lines — zero.

**Item 30 / R4-2, ground-plane and fixture disclosure.** Checked all 8 named reports directly:
`T3b-impl.md`, `T3b-review.md`, `W-36e-impl.md`, `W-36e-verify.md`, `F1-count-impl.md`,
`T3c-review.md`, `W-32r4-review.md`, `W-36f-scout.md` — every one now states its harness/rig and
ground-plane inclusion/exclusion explicitly. **Note (already disclosed by the implementer, verified
here, not a new finding):** these lines were edited directly in MAIN's working tree rather than in
any worktree, since the reports have no worktree counterpart — the implementer flagged this
deviation itself; the content is additive-only annotation, no verdict or number changed, confirmed
by reading each diff.

**R4-3, decision 11-amended not pre-empted.** Read the actual `CHANGELOG.md` "Known limitations"
block on the merged tree: states the measurement ("every onset setting … breaks the coverage
calibrator … the cylinder never reaches meaningful authority … under any setting") and explicitly
marks the choice open ("is an open product decision and is not settled by this release"). Grepped
for the forbidden phrasing (`accepted`, `will be retuned`, `there is no fix`) near that bullet —
none present. `plans.md`'s "11-amended" entry likewise states the measurement and leaves Jay's call
open. **Confirmed compliant.**

**Item 20, forbidden numbers/phrases.** `grep -n "426/426|550\b|328\b|level-6 ring only|MK_BAND_ONSET_D = 35"`
across `CHANGELOG.md`/`README.md`/`plans.md` on the merged tree: **zero hits.** `grep -i "T2-5"` near
"partial"/"the fix": zero hits. `MK_BAND_ONSET_D` appears twice in `plans.md`, both correctly worded
as "true cliff re-derived at d ≈ 32," never quoting 35 as the onset. **Confirmed compliant.**

---

## 5 — Version and documentation

**Version.** `package.json` → `1.4.3`; `src/config/version.js` → `Vectura.APP_VERSION = '1.4.3'`;
`index.html` → zero `v=1.4.2` cache-busters remaining, all rewritten to `v=1.4.3`. Confirmed on the
scratch tree directly. **Consistent, exact.**

**CHANGELOG.md.** The W-32 Rank 4 `### Fixed` bullet (0.72 → 0.02 pen, torus exclusion, 0.000% ink
delta) reads correctly and was not duplicated across the two merges. The T2-6 bullet keeps the
eye-gated framing verbatim ("an improvement rather than a completion … judged by eye, not by a
bar") — not upgraded to "fixed" or "closed." The crosshatch-cap "Known limitations" bullet is
correctly measurement-stated with the choice left open (§4, R4-3). No forbidden number/phrase found.

**plans.md.** Decision 11-amended, W-39, and both newly-discovered cross-lane findings from §2
(items 3/5 as the `L0`-adjacent T4b ink delta, item 6 as the reconstruction-premise break) are all
present and correctly characterized as open follow-ups, not silently closed. `border-4`'s own
decision-9-amendment and decision-12 text survived the merge unduplicated, confirmed by reading the
actual section.

**⚠ REAL DEFECT FOUND — `README.md`'s R4-4b edit did NOT do what `MERGE-impl-r4.md` claims.** The
report's checklist says: *"R4-4b done — moved 1.4.0/1.3.99/1.3.85 into the `<details>` panel,
1.4.3/1.4.2/1.4.1 now the three inline."* That is false as shipped. Verified independently:

- The merged tree's README has **five** inline release headings before the `<details>` tag
  (1.4.3, 1.4.2, 1.4.1, 1.4.0, 1.3.99), not three.
- The 1.4.0 and 1.3.99 blocks are then **also** copied into the new `<details><summary>Older
  releases (1.4.0 and earlier)</summary>` panel — I diffed the two occurrences of each
  (`diff` on the extracted line ranges): **byte-for-byte identical duplication**, not a rewrite.
- Confirmed this is genuinely introduced by round 4, not pre-existing: `git show b43fa4e3:README.md`
  has exactly one inline occurrence each of 1.4.2/1.4.1/1.4.0/1.3.99/1.3.85, followed immediately by
  `<details><summary>Older releases (1.3.84 and earlier)</summary>` — no duplication at the base.
  `1.3.85` itself is correctly not duplicated (it only appears once, inside the new panel) — only
  1.4.0 and 1.3.99 were left behind AND copied forward.

This is docs-only — it changes no code, no test, no shipped app behaviour, and the pre-existing old
nested `<details>` panel (0.6.78 and earlier) still closes correctly underneath it (two consecutive
`</details>` at the end, correctly nested). Following `MERGE-review-r3.md`'s own precedent for a
lesser README inaccuracy (there, a miscounted claim; here, an actual content duplication), I am
**not** treating this as a merge blocker, but it is a real, verified, previously-undisclosed defect
in a checklist item the implementer marked "done," and it should be fixed (delete the duplicate
inline 1.4.0/1.3.99 blocks, keep 1.4.3/1.4.2/1.4.1 inline only) before or promptly after this push.

**`docs/3d-audit/fill-audit-handoff.md`.** States the push status truthfully (not pushed, pending
merge review), local `main` sha, and version — confirmed accurate as of this review.

---

## 6 — Live verification

Started a dev server on the scratch tree at port 8501 (≥ 8500, killed after), and drove it with
Playwright (`chromium.launch()`) using the app's own real call sequence
(`app.pushHistory()` → `engine.addLayer('scene3d')` → `engine.setObjectPrimitive` /
`engine.addObjectToScene` → `ui.renderLayers()`/`ui.buildControls()` → `app.render()` — read
directly from `src/ui/shell/context-bar.js`'s own `doAddAlgoLayer`, not guessed) rather than driving
only the raw engine, so the layer list, canvas and gizmos all update exactly as they would for a
real user action.

Built: an **ellipsoid** (Hatch, mkTick, Density 50), a **cone** (Hatch, mkDashRamp, Density 1, then
mutated live to Density 50), then switched the ellipsoid to **Crosshatch/Ladder at Density 50**.
Screenshotted after each step, cropped and read every image myself:

- **mkTick / ellipsoid, Density 50:** fine even ruling coverage, no bare wedge, refined outline
  intact.
- **mkDashRamp / cone, Density 1:** a few short, discrete dash marks — sparse, as T3b/T3c intend.
- **mkDashRamp / cone, Density 50:** visibly denser dash coverage, same discrete-mark character,
  density response confirmed live.
- **Crosshatch/Ladder / ellipsoid, Density 50:** a clean two-family diagonal lattice, diamond cells,
  no solid-black saturation, smooth outline at the rim — no defect.

**Console:** exactly one message for the whole session — the pre-existing, benign
`cdn.tailwindcss.com should not be used in production` dev warning (the same one `MERGE-review-r3.md`
§6 recorded). **Zero errors, zero page errors**, across scene creation, two primitive swaps, three
style/mapper changes, and two density changes.

`window.Vectura.APP_VERSION` reads **`"1.4.3"`**, matching `package.json`; the left-panel "GENERATOR
V.1.4.3" badge shows the same in every screenshot.

Cleaned up: killed the port-8501 dev server; no screenshot, script, or probe file was left in the
repo (`/private/tmp/claude-501/scratch-merge-r4-evidence/` only, outside the repo).

---

## Overall verdict: **ACCEPT-WITH-FOLLOWUPS**

Every claim in `MERGE-impl-r4.md` that I set out to independently re-derive — the thirteen goldens'
re-derivation and mutation-kill proof, all five `test:ci` suite counts (unit reproduced in full,
including a from-scratch bisection of every one of the six disclosed failing tests against the real
git-backed lane worktrees, not just the report's numbers), three of the four cross-lane checks by
fresh capture, the R4-1 golden-grep sweep, items 20/23/25/30/R4-2/R4-3, version consistency, and live
app behaviour — reproduced exactly, digit-for-digit and hash-for-hash in every case I could check
independently (most strikingly the T4b ink delta `1501.2671242469714` vs `1501.0636578167772`,
reproduced to 13 decimal places from a from-scratch bisection). No vacuous pass, no widened
tolerance, no unproven re-pin, no hidden regression, no evidence from a single pipeline/zoom, no
undisclosed re-pin beyond the thirteen.

**One real, previously-undisclosed defect found and required as a follow-up (non-blocking, docs
only):** `README.md`'s R4-4b edit duplicates the 1.4.0 and 1.3.99 release-note blocks byte-for-byte
(once inline, once inside the new `<details>` panel) instead of moving them, leaving five inline
release headings instead of the required three. `MERGE-impl-r4.md`'s claim that this item is "done"
is inaccurate. Fix: delete the duplicate inline 1.4.0/1.3.99 blocks, keep only 1.4.3/1.4.2/1.4.1
inline.

**One minor, non-blocking gap:** cross-lane check (d) (W-36e's bar × the ellipsoid) was verified at
the test level (15/15, torus-only fixture, correctly immune) and I built a live ellipsoid crosshatch
render through the real app that shows no defect, but I did not re-derive and diff against the
implementer's own bespoke `raster.js` output for that exact cell — a weaker, but not absent, form of
verification for that one sub-check.

**The orchestrator MAY commit the staged docs remainder, fix the README duplication (or file it as
an immediate follow-up commit), and fast-forward `main` onto `3d-scene/integrate-r4`, then push per
the standing `push = A` rule** — no other blocker was found. No `git push`, fast-forward, merge, tag,
or destructive git operation was run or should be run by anyone other than the orchestrator, and not
before the README fix (or an explicit decision to defer it) is recorded.
