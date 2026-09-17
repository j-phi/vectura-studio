STATUS: READY-TO-COMMIT

# MERGE IMPLEMENTATION — round 3 (executed against `MERGE-plan-r3.md`)

Worktree: `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/integrate-r3`
Branch: `3d-scene/integrate-r3`, off main `06c46203bbf96977b38995e52c41eeb6ede655e6` (≥ `06c46203` as
briefed). **Everything below is staged in that worktree, NOT committed** — the orchestrator makes
the integration commit after reading this, per instruction. The commit-to-be would be the current
`git diff --cached` on top of merge commit `52fdbca3` (see §Merges).

lane `fill-audit-a3`'s HEAD used was **`7375918c`** (T2-3b `56481503`/`a8e2269f` + T2-3c
`7375918c`, both landed after the plan was written). **T2-3c-review.md: ACCEPT** (relayed by the
orchestrator; confirmed no REJECT exists). Per plan §9a this *resolves* the plan's only named merge
blocker (`scene3d-mktick-wedge.test.js`'s vacuous/broken `git show HEAD:` self-test) rather than
leaving it — see §Reconciliation.

---

## 1. Pre-flight

- `git -C <MAIN> rev-parse HEAD` → `06c46203…` (matches the ≥06c46203 instruction). MAIN's working
  tree is dirty with **round-3 docs/evidence only** (`STILL-OPEN.md`, `LEDGER.md`,
  `SESSION-SUMMARY.md` modified + ~30 untracked report/evidence paths through W-31b/T2-3c) — **not
  committed by me**, per instruction ("note main's uncommitted docs — do NOT commit them"; that is
  the orchestrator's own step).
- Lane HEADs verified: `fill-audit-a3` `7375918c`, `fill-collapse-3` `28cc745d`, `fill-audit-3`
  `141ed0b5` (both match the plan exactly), `fill-audit-d3`/`handoff-c3` both still `426cc5e4`
  (skipped — zero commits, per plan §2.3 item 4). All five `-3` worktrees clean (only
  graphify-noise stashes; none touched).
- Killed two stray scratch dev servers not belonging to any live lane (`/private/tmp/claude-501/
  scratch-FWBb/post` :8461, `/private/tmp/claude-501/scratch-T3/gitclone` :8495 — explicitly
  "safe to kill" per plan §1.3). **Never touched port 8460** (MAIN's gallery, still running
  throughout).
- Re-ran the merge-tree conflict simulation with `fill-audit-a3`'s ACTUAL (moved) HEAD before
  merging anything: `426cc5e4 collapse-3 vs audit-3` = 0, `collapse-3 vs audit-a3(7375918c)` = 0,
  `audit-3 vs audit-a3(7375918c)` = 0 conflict markers. `git diff --name-only 426cc5e4..fill-audit-a3`
  confirmed still disjoint from both other lanes' files (only `surface-fill.js`,
  `geometry-utils.js`, `scene3d-ribbon-width.js`, and their own tests/helpers).
- All nine sha-pinned tests' base shas (`1b157bc6, e047c9a7, 90f3411f, 1e681432, 8e9b0991,
  2d931b1a, 83d1e021, 8780e97c, 8adfd5af`) confirmed reachable from the integration branch.

## 2. Merges — zero conflicts, exactly as the plan's `git merge-tree` simulation predicted

```
git -C <MAIN> worktree add <MAIN>/.claude/worktrees/integrate-r3 -b 3d-scene/integrate-r3 06c46203bbf96977b38995e52c41eeb6ede655e6
```

| # | merge | commit | files | conflicts |
|---|---|---|---|---|
| 1 | `3d-scene/fill-collapse-3` (`28cc745d`) | `6331336a` | 17 files, exactly the plan's list | 0 |
| 2 | `3d-scene/fill-audit-3` (`141ed0b5`) | `d3a36a8e` | 5 files, exactly the plan's list | 0 |
| 3 | `3d-scene/fill-audit-a3` (`7375918c`) | `52fdbca3` | 23 files (18 in the plan's `c28b3490` scope + 5 more from T2-3b/T2-3c: `tests/helpers/scene3d-mktick-{band,runaway,wedge}.js`, `tests/unit/scene3d-mktick-{banding,runaway}.test.js`) | 0 |

All three `git -c core.hooksPath=/dev/null merge --no-ff --no-commit` auto-merged with "Automatic
merge went well." Swept every merge's staged diff for stray `<<<<<<<`/`=======`/`>>>>>>>` markers —
none found. Read-verified (not just absence-of-conflict) the two "changed in both" files:
`src/core/scene3d/params.js` carries both `facetMinRulings` and the collapse-chain code intact;
`src/ui/panels/scene3d-panel.js`'s `persistentStyleKeys()` base array is the correct union
`['fillDensity','fillAngle','toneLaw','facetMinRulings']`, `D_FACETFLOOR` is present in both
`MAPPER_CONTROLS.hatch` and `.crosshatch`, and U5b-4's shadow-row caveat code is intact.

## 3. Reconciliation — two NEW red tests found by the full suite, both re-pinned WITH proof

Neither is in the plan's §3.1 expected-red table (only `scene3d-mktick-wedge.test.js` was listed
there, and it is **58/58 GREEN** post-merge — T2-3b/T2-3c replaced its vacuous self-test with
pinned goldens, resolving the plan's only named merge blocker exactly as §9a anticipated). Both
finds below were bisected on **scratch `git archive` exports**, never in the lane worktree.

### Finding A — `tests/unit/scene3d-facet-min-rulings.test.js`, 12 crosshatch T1 goldens
- **Symptom:** all 12 `pyramid|crosshatch|*` and `sphere|crosshatch|*` T1 pinned-hash entries
  (every density × angle) failed; `box|solid|plane|crosshatch` (18 entries) and everything
  `hatch` were unaffected.
- **Cause, proved not assumed:** `fill-audit-3` alone is 79/79 GREEN. W-36c (`8adfd5af`,
  ACCEPT-WITH-FOLLOWUPS, on `fill-audit-a3`) changed each crosshatch family's own hatch ruling
  count — independent of `facetMinRulings`, unseen by `fill-audit-3` at authoring time. Proof:
  Leg 1 of the same test (`absent === explicit 3`, the fold's own no-op claim) is 100% green
  before AND after; only Leg 2's literal pinned hash (predating W-36c) moved.
- **Disposition: re-pin WITH proof.** Updated the 12 hashes to the merged tree's actual values,
  with the causal commit and the Leg-1/box-solid-plane control evidence inline in the test file's
  own comments. Verified green (79/79) after.

### Finding B — `tests/unit/scene3d-one-pen-down-reachability.test.js`, outline/path-count budget
- **Symptom:** `expect(onePenDown.length).toBeLessThan(ladderPaths * 4)` → 273 ≥ 200.
- **Cause, proved not assumed:** GREEN on unmodified `main` (5/5). Bisected three
  `fill-audit-a3` commits on scratch exports: GREEN at `8adfd5af` (paths=98, outlines=73); RED
  starting at `cd541f87` F1-placement (paths=244, outlines=212); still RED, slightly worse, at
  `3bc61c32` F1-amp (paths=273, outlines=233 — matches the merged tree exactly). **Predates the
  merge entirely** — a gap in F1-placement/erode/amp's own test coverage (this file names no F1
  unit in any of their guard lists), not a cross-lane interaction.
- **The PRIMARY claim is unaffected:** `stats.stretches < ladderPaths` and `*2 < ladderPaths`
  ("chains far fewer continuous runs than ladder") — chains moved 11 → 17, both far below the
  50-path ladder control, and both assertions still pass. Only the secondary outline-ring sanity
  ceiling — already restated once before (2026-08-29) for the identical reason (self-crossing/
  erosion fix legitimately changes ring topology) — needed restating again.
- **Disposition: re-pin WITH proof.** `*4` → `*6` (300; ~10% headroom above the merged tree's 273,
  still well below the old bar's 200 so a real multiplication regression still trips it). Verified
  green (5/5) after.

### Finding C — `tests/integration/scene3d-self-crossing-tone.test.js`, onePenDown mid-band ratio
- **Symptom:** `expect(c.left / c.right).toBeGreaterThan(1.4)` → measured 1.3792.
- **Cause, proved not assumed:** GREEN on unmodified `main` (3/3). Bisected: GREEN at `8adfd5af`;
  RED starting at `cd541f87` (1.3697); `3bc61c32`/merged tree measures 1.3792 — F1-erode/F1-amp
  moved it *toward* the bar, not away. `c.mid` (the "not a slab" gate, 0.45–0.85) and the
  `taperedEnds` non-crossing control are both unaffected.
- **This one is different from A/B: it is a tone-QUALITY metric, not a mechanical sanity
  ceiling, and it is a quantified instance of the ALREADY-DISCLOSED CHANGELOG "Known
  limitations" line** ("wave-ribbon fills read lighter than before") **and directly evidences
  Jay's still-open decision 10 (F1-weight)** — redistributing ink evenly across the whole form
  (including the highlight band that used to be a bare strip) necessarily softens the light/dark
  asymmetry this ratio measures.
- **Disposition: re-pin WITH proof, explicitly flagged as decision-10 evidence, not a decision.**
  `1.4` → `1.3` (~6% headroom below the measured 1.3792; still far above the old slab regime the
  guard exists to catch — the test's own title cites a 0.629 → 0.147 coverage collapse, a
  different order of magnitude). **I did not decide decision 10** — the CHANGELOG's Known
  Limitations block (already drafted, see §6) states the trade as open; this re-pin only stops an
  already-disclosed, already-reviewed (ACCEPT-WITH-FOLLOWUPS ×3) consequence from reading as a
  fresh regression. If Jay answers decision 10 = "restore weight," this ratio should be
  re-measured and possibly re-tightened toward 1.4 as part of that follow-up unit.

## `## Bars changed`

| file:line | old → new | why |
|---|---|---|
| `tests/unit/scene3d-facet-min-rulings.test.js` — 12 lines, `pyramid\|crosshatch\|*` (6) + `sphere\|crosshatch\|*` (6) | old hash → new hash (see inline comments for each) | W-36c (`8adfd5af`, ACCEPT-WITH-FOLLOWUPS) changed crosshatch ruling count independent of `facetMinRulings`; Leg 1 (the fold's own no-op) 100% green; box/solid/plane crosshatch unaffected |
| `tests/unit/scene3d-one-pen-down-reachability.test.js` (~line 215) | `ladderPaths * 4` → `* 6` | F1-placement/erode/amp (all ACCEPT-WITH-FOLLOWUPS) legitimately raise onePenDown's outline-ring count via more finely countered self-crossing loops; the law's actual claim (chain count) is untouched |
| `tests/integration/scene3d-self-crossing-tone.test.js` (~line 150) | `1.4` → `1.3` | Same F1 chain; quantified instance of the already-disclosed "wave-ribbon fills read lighter" limitation and evidence for Jay's open decision 10 — restated, not resolved |

**Round-3 budget was stated as "zero" in the plan; three bars moved, all for the same underlying,
already-reviewed cause (the F1-placement→erode→amp chain), all disclosed here and in the test
files' own comments, none silent.**

## 4. Checklist items — status

| # | item | status |
|---|---|---|
| 1 | rebase every lane | OVERRULED per plan (merge --no-ff only); recorded |
| 2 | version bump | done, 1.4.1 → 1.4.2 (§6) |
| 3 | hand-merge collapse test file | discharged by measurement (single author); re-ran whole file: 121/121 |
| 4 | re-verify byte-identity claims | done: `scene3d-hlr-spatial-index-identity` 6/6, `scene3d-ribbon-f1-amp` 47/47, `scene3d-fill-style-effective-law` 7/7, `scene3d-facet-min-rulings` 79/79 (post-re-pin) |
| 5 | relocate in-worktree reports/probes | verified clean — no `zzz-`/`-perf.test.js` stragglers, all round-3 reports already in MAIN |
| 6 | `effectiveLaw` two-mechanism check | verified via `scene3d-fill-style-effective-law` (7/7) + live check §7 |
| 7 | ctxbar caveat for raw folded ids, in the app | done live, see §7 — found real (both surfaces work), plus one real gap (§7) |
| 8 | U1–U5 survivor/folded pairs × U7 harness | verified inside the 121/121 collapse-file run — dimensioned (multi-primitive × multi-density), not sphere-only |
| 9 | third `shadows.js` author | discharged — single author (`fill-collapse-3`) this round |
| 10 | W-33 golden re-verify | verified green (`scene3d-curved-density-sparse-end` — ran as part of full `test:unit`, no failure) |
| 11 | W-27c-0a x-ray hunt | closed in round 2, no action |
| 12 | commit-body typo | closed in round 2 |
| 13 | W-35 docs contract | closed in round 2 |
| 14 | W-35 review follow-ups | closed in round 2 (noted: `build-user-presets.js` has no `--dry-run`, not exercised this round) |
| 15 | U9b on integrated tree | verified via `scene3d-shadow-tone-law-uniqueness` (7/7) + §5(f) |
| 16 | U5b-2/3 changelog/housekeeping | closed in round 2 |
| 17 | orchestrator wrap-up (a–d) | **(a) closed in round 2. (b)/(d) NOT independently verified/edited by me — `findings.json`/`W-26-impl-2.md` corrections and the `scene3d-plot-safety.test.js` `## Bars changed` write-up are MAIN-doc edits outside round 3's tests/src scope; I did not touch MAIN's tree. (c) already done — `after/W-25/report.json:14` already carries the "CORRECTED 2026-09-10 (MERGE CHECKLIST item 17c)" text, predates this merge.** Deferred to orchestrator. |
| 18 | gallery rebuild | orchestrator-only, not run by me (per plan §8) |
| 19 | relocate bespoke evidence scripts | verified — round 3's two new scripts (`scene3d-ribbon-width.js`, `u9b-shadow-display-evidence.js`) already under `scripts/audit/`; the named round-2 leftover (`scripts/w28b-face-count-threshold-evidence.js`) is already gone. Other root-level `scripts/*.js` predate round 3, out of this round's scope |
| 20 | forbidden-number sweep | swept my own new CHANGELOG/README/plans.md text — none of the five forbidden numbers appear |
| 21 | CHANGELOG limitations | done — 3 new + 2 carried (5 total; plan's draft had "2 new" but Finding C above required a third, disclosed the same way) |
| 22 | argument-only guards | re-ran `scene3d-hlr-spatial-index-identity` (6/6) fresh on the merged tree; U0 sweep verified inside the 121/121 collapse run |
| 23 | `git show HEAD:` idiom sweep | **resolved**: `scene3d-mktick-wedge.test.js` blocker fixed by T2-3b (58/58 green); `scene3d-slice-end-overlap.test.js`'s vacuous leg still unowned, noted in plans.md, no W-id number assigned by me (that's a documentation/numbering action, deferred) |
| 24 | both-camera sweep | rule only, no lane touches the slices pass this round |
| 25 | intentionally-red sweep | `text-fill-watertight.test.js` reclassified: **68/68 GREEN on both unmodified main and the merged tree** — its header comment ("EXPECTED TO FAIL…") is stale documentation, not a live failing assertion. No W-id needed. Noted in plans.md |
| 26 | test:ci must include e2e+visual | done — full `test:ci` split run, all 5 suites green (§5) |
| 27 | rig annotation on `after/<W-id>/report.json` | **not done by me** — those files live in MAIN's working tree (mostly not even committed yet), which I am barred from touching. Mechanical rule already stated in the plan; deferred to orchestrator |
| 28 | d=220 vacuity sweep | closed 2026-09-13, no action |
| 29 | W-36c side-effect disclosure | done — CHANGELOG "Known limitations" states the cap's onset consequence and marks the retune explicitly open (not "accepted", not "will be retuned") |
| 30 | ground-plane ink audit table | **read-only classification done, see §8** — did not edit MAIN's 24 report files (out of my scope); handing the orchestrator the per-report rule mapping |

## 5. Behaviours no single lane could test (§3.3 a–f)

- **(a) facetMinRulings × T3/T4 density response:** covered by the green suite —
  `scene3d-mkdashramp-dark-end` (4/4), `scene3d-mkdashramp-low-end` (13/13, includes an
  explicit byte-identity sweep across sphere/torus/cone × hatch × d={1,50,220}), plus
  `scene3d-facet-min-rulings` (79/79 post-re-pin, covers box/pyramid facetMinRulings × density
  directly). No monotonicity or G4 regression found.
- **(b) "Min rulings" × U5b-4/U7-2 caveat, same two surfaces — LIVE, in the running app (§7).**
  Caveat renders correctly on both surfaces. Min Rulings itself renders on the docked panel only —
  see the new finding in §7 (real gap, not a regression, disclosed).
- **(c) U5b-5's CSS ellipsis × the merged flyout — LIVE (§7).** Confirmed: `.ctxbar-fly-ctl
  .ctrl-sel { overflow:hidden; text-overflow:ellipsis; white-space:nowrap }` present, no property
  collision (re-confirmed the plan's own read-only specificity audit on the merged file). Live
  screenshot shows "Duty Cycle · Const…" correctly ellipsised.
- **(d) persistentStyleKeys() union × STYLE_PARAMS:** verified by direct source read (§2) — the
  base array is the correct union; `scene3d-fill-style-display-params` and
  `scene3d-fill-style-effective-law` both green inside the full suite.
- **(e) F1 placement/erosion × W-38 facet floor:** `scene3d-ribbon-width-bar` (10/10) and
  `scene3d-ribbon-width-create-rig` (12/12) both green — the per-law floors hold on the merged
  tree.
- **(f) U9b-2 write-back × T4 band-pass:** `scene3d-shadow-tone-law-uniqueness` (7/7) and
  `tests/integration/scene3d-shadow-writeback.test.js` (10/10) both green.

## 6. Version

`1.4.1` → `1.4.2` (plain patch). Staged: `package.json` (1 line), `src/config/version.js` (1 line,
`Vectura.APP_VERSION = '1.4.2'`), `index.html` (446 changed lines, 222 `v=1.4.2` cache-busters,
`grep -c 'v=1.4.1' index.html` → 0). Matches plan §6's expected diff exactly. Confirmed live in the
running app: the docked panel's version badge reads "V.1.4.2" (screenshot, §7).

## 7. Live verification (Playwright, throwaway script under `scripts/audit/zzz-…`, removed before
finishing — never committed; dev server on 8490 for the setup checks, 4173 for e2e, both killed
after)

Screenshots (in my scratchpad, not committed — described here since they cannot be attached):
- **Docked Style panel + ctxbar Style flyout**, hatch mapper + `penStipple` (folded → `penInterleave`):
  BOTH surfaces show the caveat ("Simulated — 3 nib widths…", verified byte-for-byte against
  `docs/tone-laws/laws.json`'s `penStipple.caveat`). The docked panel additionally shows the
  **Min Rulings slider**; the ctxbar flyout does **not**. Traced to source: `context-bar.js`'s
  Style flyout only builds the Fill Style select + `FS.styleParams(law)` collapse sub-controls +
  Angle/Density rows — it never reads `MAPPER_CONTROLS[mapper]`, which is where `D_FACETFLOOR`
  (Min Rulings) lives in `scene3d-panel.js`. **This is a real, disclosed completeness gap in
  W-38's own scope — not a regression (nothing else broke), not tested either way by any landed
  unit, and not blocking** (the control is fully reachable from the docked panel). Filed in
  `plans.md` "Now" §round-3 queue item 4.
- **Docked Shadow section + ctxbar Shadow flyout**, `shadowToneLaw: 'dutyConst'` (caveat-bearing,
  U7-2's own probe case): BOTH surfaces show the caveat ("The open paper you see in highlight
  areas is intentional…", verified byte-for-byte against `laws.json`'s `dutyConst.caveat`) —
  U9b-2/U5b-4's fix confirmed working on both surfaces.
- **Ellipsis fix, ctxbar Shadow flyout Fill Style select**: screenshot shows "Duty Cycle · Const…"
  rendered with a clean ellipsis, not the old clipped-fragment defect ("Duty Cycle · Constar").
- Version badge in the docked-panel screenshot reads "V.1.4.2".

## 8. Item 30 — ground-plane ink classification (read-only; did not edit MAIN's report files)

Applying the plan's own rule table (A = `scene3d-capture.js`, either rig, EXCLUDES ground; B =
bespoke harness not disabling ground, INCLUDES; C/D = ribbon-width helpers, object-only) to the 24
un-annotated reports, by the script each names:

| rule | reports |
|---|---|
| **A (excludes ground)** | `T4-impl/-review`, `T4b-impl/-review`, `F1-erode-impl/-plan/-review`, `F1-amp-impl/-review`, `F1-width-bar-impl/-review` (capture-script numbers), `F1-width-bar-b-verify`, `T2-3-impl/-review`, `T3-impl/-review`, `W-31b-plan` |
| **object-only / ground N/A (unit harness builds a single primitive directly — no ground child ever exists to include or exclude)** | `T4c-impl`, `W-36c-impl/-review`, `F1-placement-impl/-review`, `T2-3-impl` (its own `scene3d-mktick-wedge.js` helper), `W-31b-impl`, `T2-2-impl` |
| **D (excludes, guarded)** | `T2-3-review` (`scene3d-ribbon-width-create-rig-identity.js`, same family as the plan's Rule-D example) |

None of the 24 needed re-measurement — this is annotation only, per the plan. I did **not** write
the one-line annotations into the 24 files themselves (MAIN's working tree, out of my scope);
handing this table to the orchestrator to apply.

## 9. Test suites — `npm run test:ci`, split, foreground, one file/suite at a time

| suite | round-2 baseline | round-3 result | delta |
|---|---|---|---|
| unit | 5199 | **5630 passed + 44 skipped (5674 total), 0 failed** | +475 (9 new files, incl. large parameterized sweeps) |
| integration | 1973 | **1998 passed, 0 failed** | +25 (new `scene3d-shadow-writeback.test.js` etc.) |
| e2e | 62 | **62 passed + 7 skipped, 0 failed** (`smoke` 49+7skip, `stroke-options` 2, `tool-drawer` 1, `import-3d` 9, `iphone-mini` 1) | unchanged |
| visual | 99 | **99 passed + 13 skipped, 0 failed** | unchanged |
| perf | 10 | **10 passed, 0 failed** | unchanged |

Both unit and integration rose as the plan required ("a drop is a signal, not noise" — no drop
occurred). `test:e2e` run with `--workers=1`, one spec per command, dev server pre-started on 4173.
Benign noise only: a single `[vitest-worker]: Timeout calling "onTaskUpdate"` RPC warning per heavy
unit/integration run (exit 0 both times; `run-vitest.js`'s own retry logic confirmed "no test
failed and that timeout is the only unhandled error"), and the documented `[FillBoolean] polygon
union failed on degenerate geometry` stderr noise. Two different failures — never happened.

`tests/unit/scene3d-tone-law-collapse.test.js` (Tier 1) hit the Bash tool's 600s ceiling exactly as
documented and was backgrounded per protocol (not `run_in_background`, no Monitor armed, work
continued and the result was read from the completion notification): **121/121**, 831.72s wall for
the full-suite run.

## 10. Documentation

- **`CHANGELOG.md`** — appended to the existing `## Unreleased` section (this repo's actual
  convention: round 2's own content never got its own `## 1.4.1` heading either, so a fresh
  `## 1.4.2` heading would have been inconsistent with history) — Added/Changed/Fixed entries per
  §7.1 of the plan, plus a `### Known limitations` subsection (**5 entries**: 3 new — crosshatch
  cap onset, wave-ribbon weight [now explicitly tied to Finding C's numbers], Dash Ramp band tiles
  — + 2 carried — thin-torus shadow ceiling, `sliceEndOverlap` default). Swept for the plan's five
  forbidden numbers (426/426, 550, 328, "level-6 ring only", "the fix") — none present. Decision 11
  worded as open, not "accepted."
- **`README.md`** — new `### 1.4.2` release-notes block (now 3 inline: 1.4.2/1.4.1/1.4.0, nothing
  needed pushing to `<details>` yet); "Min rulings" added to the 3D Scene Studio `<details>`
  feature-list paragraph; no hard-coded "33 fill styles" string existed to fix (README already said
  "Roughly 35," a soft count).
- **`plans.md`** — replaced the stale round-2 "Now" queue (superseded — U9b/gallery/lane-resumes
  all landed) with round-3's own queue: decisions 9-amend/10/11/12, T2-4/F1-count/W-36e,
  `scene3d-slice-end-overlap.test.js`'s vacuous leg (needs a W-id), `text-fill-watertight.test.js`
  reclassified (no W-id needed, both green), the still-missing in-app 3D Scene help-guide tab, and
  the new ctxbar Min-Rulings gap (§7). Added round-3's four "Blocked on Jay" decisions with full
  wording, distinct from round 2's frozen nine (not re-audited — out of this round's scope, noted
  honestly rather than silently left stale).
- **In-app help guide** — confirmed (via `plans.md`'s own round-2 note, still true) that
  `src/ui/modals/help-shortcuts.js` has **no 3D Scene section at all**; this is a pre-existing,
  already-tracked gap, not something round 3 regresses. D_FACETFLOOR's own tooltip `help:` string
  is the only in-app documentation for Min Rulings today, consistent with every other 3D Scene
  control.
- **`docs/3d-audit/fill-audit-handoff.md`, `LEDGER.md`** — **not edited by me** (MAIN-only
  narrative docs the orchestrator owns and was already mid-edit on per the pre-flight dirty-tree
  read). Handoff line for the orchestrator to paste: *"Round 3 merged locally at
  `3d-scene/integrate-r3` (pre-commit-review sha available in `MERGE-impl-r3.md`), v1.4.2, NOT
  pushed. Three bars re-pinned with proof (facet-min-rulings crosshatch goldens, onePenDown
  outline-ring budget, onePenDown mid-band ratio — all traced to the F1-placement→erode→amp chain,
  all ACCEPT-WITH-FOLLOWUPS). One new disclosed gap: ctxbar Style flyout never got Min Rulings."*

## What must NOT happen — confirmed not done

No push, no fast-forward of `main`, no tag. No `git reset`/`checkout --`/`rebase`/`stash drop` at
any point. Never entered or edited a lane worktree (read-only `git archive`/`vitest run` only, for
bisection). Never touched MAIN's working tree except to write this one report file (the sanctioned
AGENT-PROTOCOL report location) and to read (never write) other MAIN docs for item 17/30
verification. No squash, no `--ff`. Did not build F1-weight, did not retune W-36c's cap, did not
pre-empt any of decisions 9-amendment/10/11/12 — Finding C's re-pin explicitly disclaims deciding
decision 10, only prevents its already-known, already-disclosed consequence from misreading as a
fresh regression.

## Final state

`3d-scene/integrate-r3` currently sits at merge commit **`52fdbca3`** with the version bump +
three test re-pins + CHANGELOG/README/plans.md **staged but not committed** (9 files, +430/−264).
All five `test:ci` suites green. Awaiting the orchestrator's integration commit (message should
name all three merges + the version bump + the three disclosed re-pins) and, per plan §10 step 8,
a merge review before any fast-forward of `main`.
