STATUS: DONE

# MERGE — 3D fill audit integration (7 lanes → `3d-scene/integrate`)

Worktree: `.claude/worktrees/integrate` (new, created off `main` @ `236e25810932034354edf3704edd2d3940b3fb01`).
Branch: `3d-scene/integrate`. Final HEAD: `ecaf1e17acc566e6695278a8e27b31e3d7604689`.
83 commits ahead of `main` (`git log --oneline main..HEAD | wc -l`). **Not pushed. Main not
fast-forwarded** — both are the orchestrator's/Jay's to do after committing main's own docs.

Every merge/commit in the worktree used `git -c core.hooksPath=/dev/null` (graphify hooks break
mid-merge, per the AGENT-PROTOCOL). `node_modules` symlinked from main.

## Merge order and results

| # | Branch | HEAD merged | Conflicts | Result |
|---|---|---|---|---|
| 1 | `3d-scene/handoff-c` | `0d405577` | none | clean |
| 2 | `3d-scene/handoff-b` | `9b2a33bb` | 2 files | resolved |
| 3 | `3d-scene/fill-audit` | `142afe58` | 1 file | resolved (re-measured) |
| 4 | `3d-scene/fill-audit-a` | `0930cb2d` | 2 files | resolved (re-measured) |
| 5 | `3d-scene/fill-audit-c` | `e6b85de4` | none | clean |
| 6 | `3d-scene/fill-audit-d` | `ec79e2b9` | 1 file (add/add) | resolved |
| 7 | `3d-scene/fill-collapse` | `8610fd66` | none | clean (branched from fill-audit, an ancestor) |

Each merge landed as its own commit on `3d-scene/integrate` before the next branch was merged, per
instruction. Merge commits, in order:
`70349c15` (handoff-c) → `9e4bdd9e` (handoff-b) → `7f7d1c5f` (fill-audit) → `95b3a7c1`
(fill-audit-a) → `e3f6d1ec` (fill-audit-c) → `4134e714` (fill-audit-d) → `856ccf99`
(fill-collapse) → `ecaf1e17` (this final commit: version bump, real regression fix, docs).

## Conflicts and resolutions

### 1. `3d-scene/handoff-b` merge

**`tests/unit/scene3d-ribbon-f1b-streaks.test.js`** (both branches modified) — took handoff-c's
(HEAD's) version verbatim, per explicit orchestrator instruction: A3's oracle split (landed on
handoff-c, `d86cbf8d`) retires the five intentionally-red assertions handoff-b's own investigation
pinned; handoff-b's copy is stale relative to that retirement.

**`docs/stroke-fill-handoff.md`** (both branches modified the same "F1" section) — kept BOTH
sides' write-ups (handoff-c's Unit A/A2 analysis, handoff-b's Unit A session update), added an
"Integration note" pointing at the ribbon-f1b-streaks resolution above so a reader isn't left
wondering which test file's assertions the doc is describing. Nothing dropped.

### 2. `3d-scene/fill-audit` merge

**`tests/unit/scene3d-hlr-spatial-index-identity.test.js`** — both branches moved the SAME two
scenario rows (`curvedOverlap-perspective-mixed-xray`, `denseMixed-8obj-shadows`) for different,
independent reasons: HEAD (handoff-c) for A2's torus self-occlusion field rewrite, fill-audit for
W-15c's solo-orientation carrier gate (ground-plane density tracking). Neither branch's pin is
correct for the merged tree. Resolved by keeping BOTH doc comments, then **re-measuring the actual
merged source** via the file's own capture-mode error path (delete the disputed EXPECTED entries,
run the test, paste the thrown values back in). Verified the merged hash for `curvedOverlap`
settled carries W-15c's pathCount/pointCount (404/1225) with a DIFFERENT hash (A2 also active);
`denseMixed` settled matches W-15c's pin exactly (A2 doesn't move that row); `denseMixed` draft
matches A2's pin exactly (W-15c doesn't move draft rows) — the union of both effects, nothing
dropped from either side.

### 3. `3d-scene/fill-audit-a` merge

**`tests/unit/scene3d-hlr-spatial-index-identity.test.js` (again)** — fill-audit-a's W-26
(continuous ladder placement) ALSO moves the same two rows. Now three independent effects stack
on one fixture (A2 + W-15c + W-26). Same resolution method: kept all three doc comments, blanked
the disputed EXPECTED rows, re-measured against the actual triple-merged source. Confirmed
`curvedOverlap|settled` landed at 431/1559 (1 point off a pure arithmetic sum of the pairwise
deltas — real interaction, not a copy error) and `denseMixed|settled` landed at 662/2712, the
EXACT sum of the A2+W-15c figure plus W-26's own delta.

**`tests/unit/scene3d-box-density-bearing.test.js`** — W-15c re-pinned the `plane` fingerprint,
W-26 re-pinned the `sphere` fingerprints (both branches touch this ONE guard test, but on
disjoint primitive rows — plane is faceted, sphere is curved). Kept both re-pin comments plus a
merge note; ran the file — passed unedited, confirming no interaction between the two primitives'
rows.

### 4. `3d-scene/fill-audit-d` merge

**`tests/unit/scene3d-mesh-self-occlusion.test.js`** (add/add — both handoff-b and fill-audit-d
created this file independently for Unit F). fill-audit-d's version is a strict superset: it
preserves handoff-b's original spiral-survivor investigation verbatim as historical text (labeled
"ORIGINAL, PRE-W-25 TEXT") and adds a "W-25 CORRECTION" section + an `else if (mapper ===
'spiral')` branch implementing W-25's fix (the original 1-survivor gap is retired; a smaller,
independent HLR-precision residual is asserted `<= 2`, not asserted away). Took fill-audit-d's
version whole. Ran the file post-merge: 5/5 tests pass.

## Bars changed (mandatory disclosure)

Every value below moved because of a REAL, disclosed effect (a genuine merge-interaction or a
real regression fix), never a widened tolerance to force a pass. Old → new values, with cause:

- `tests/unit/scene3d-hlr-spatial-index-identity.test.js:323` —
  `curvedOverlap-perspective-mixed-xray|settled` hash `bfb2b907...` → `d5628693...`, pathCount
  431 → 424, pointCount 1559 → 1500. Cause: the real X-ray back-density regression fix (below) —
  this scenario carries an `xray`-visibility object, so it's the one fixture in the file the fix
  actually touches. This is the ONE re-pin in this file that moves DOWN (every other re-pin in
  this merge moved up), which is the expected signature of "back density now genuinely thins the
  far family" rather than another merge-interaction artifact.
- `tests/unit/scene3d-hlr-spatial-index-identity.test.js` — `curvedOverlap-perspective-mixed-xray
  |settled` (first pass) 341/1099 (pre-A2) → 404/1225 (A2+W-15c) → 431/1559 (+W-26) → 424/1500
  (+X-ray fix); `denseMixed-8obj-shadows|settled` 560/2303 → 651/2485 → 662/2712 (unaffected by the
  X-ray fix — no xray object in this scenario); `denseMixed-8obj-shadows|draft` 463/926 → 466/932
  (A2 only). All from re-measuring the actual merged source at each merge step, disclosed inline
  in the file's own comments (see "MERGE NOTE" blocks).
- `tests/unit/scene3d-box-density-bearing.test.js` — `plane` fingerprint `44270f5b:3738` →
  `10a710a6:3909` (W-15c); `sphere` fingerprints `2f4dae00:15919`/`bd627a15:35285` →
  `6c237f90:23012`/`3dc1b467:55668` (W-26). Disjoint primitives, both pre-existing branch re-pins,
  confirmed non-interacting by running the file unedited post-merge.
- `tests/unit/scene3d-curved-density-sparse-end.test.js` — `torus + hatch + ladder` ink
  `[419.1, 474.98, 645.22, 1255.48]` → `[420.39, 474.98, 646.51, 1257.41]`; `torus + hatch +
  fineLadder` ink `[470.87, 547.36, 772.68, 1253.08]` → `[471.15, 547.36, 773.24, 1254.94]`
  (d=10 unchanged in both — A2 doesn't touch that checkpoint); `torus + hatch + bundleCount@d=50`
  md5 `dabbb9ea...` → `d0a5adb8...`; `torus + contour + ladder@d=50` md5 `f818c08a...` →
  `c4af8b99...`. Cause: A2's torus self-occlusion rewrite (handoff-c) never combined with this
  file's own W-01/W-26 pins on any single source branch — first combination happens in this merge.
  Sphere/cone rows (no self-occlusion) are untouched, confirming the shift is scoped to the torus.
  All deltas are under 0.3% of the pinned value.
- `tests/unit/scene3d-shadow-tone-law-uniqueness.test.js` — sanity bar `toBeGreaterThan(30)` →
  `toBeGreaterThan(20)` (measured count 27). Cause: NOT a merge-interaction — this file predates
  the merge (from `fs-n2`, already on `main`) and its own premise went stale against
  fill-collapse's roster split (`IDS`, the 48-id engine vocabulary that never shrinks, vs.
  `PICKER_IDS`, the 35-id collapsed list a real picker actually offers). The test built its
  "offered" set from raw `IDS`, which now includes folded alias ids (e.g. `fineLadder`) that
  collide with their own canonical survivor when driven directly by name — a real, disclosed gap
  (SESSION-SUMMARY's "U5b: a folded id driven directly loses its distinguishing sub-param") but
  NOT reachable through either real UI surface, both of which build from `PICKER_IDS`
  (`context-bar.js:286`, `SCENE_FILL_STYLES.groups`). Fixed the test's `offeredLawIds()` helper to
  match the real UI's own source-of-truth (`roster.PICKER_IDS || roster.IDS`, the exact fallback
  `context-bar.js` uses) rather than widening the HEADLINE assertion itself (which now passes
  honestly, no collisions among the 27 ids a real picker offers).

## Real regression found and fixed (not present on any single source branch)

**Symptom** (found by running the merged `test:ci`, not by any of the seven branches individually):
`tests/integration/scene-xray-needs-fill.test.js` → "Back density changes how much far-surface ink
is drawn" failed — a capsule under Type=Hatch, Fill Style=Ladder (the shipped default) drew the
identical 32 back-face paths whether X-ray's Back Density was set to 0.2 or 1.0. Confirmed absent
on unmodified `main` (17/17 green in a scratch `git archive` export).

**Root cause**, isolated via targeted `global.__XRAY_DEBUG__`-gated console.log instrumentation
(added, used, then fully removed — `git diff` against pre-instrumentation confirms zero net diff
in `scene3d.js`): W-26 (`3d-scene/fill-audit-a`) moved `ladder`/`fineLadder`/`phaseFineLadder` onto
a continuous-placement walk (`surface-fill.js`'s `emitContFamily`) whose actual ruling density
comes from `ladderWantedPitch` (a density-driven wanted PITCH), not from the `count` parameter the
function receives — `count` now only shapes the walk's own step-size bounds (`dfMin`/`dfMax`/
`creep`), never how many rulings get placed. X-ray's back-face pass (`scene3d.js`'s
`xray: { backFaces, backDensity }` → `SurfaceFill.buildObject`'s `runMapper(Math.max(2,
Math.round(N * backDensity)), true)`) has always worked by asking for a REDUCED `count` to
simulate a sparser far surface — a mechanism W-26 silently broke for the shipped default tone law,
because a capsule (a chart-eligible curved primitive) routes X-ray entirely through
`SurfaceFill.buildObject`, never through the faceted per-face fallback in `scene3d.js` (confirmed:
that fallback is gated `if (faceted && xrayOn && ...)`, and `faceted` is false for a capsule).

**Fix**, in `src/core/scene3d/surface-fill.js`'s `emitContFamily` walk, immediately after `want`
(the wanted pitch) is computed and before it feeds the placement step:
```js
if (back) want /= backDensity;
```
`back` is `false` on every front-face call (the only call sites: the front pass in `buildObject`,
and every OTHER caller of `emitContFamily` elsewhere in the file, none of which pass `back: true`
except the X-ray back pass) — so front-face rendering, and every existing byte-identity fixture
that doesn't use X-ray, is provably untouched. Verified: `tests/integration/scene-xray-needs-fill
.test.js` 17/17 green; the one HLR byte-identity fixture that includes an `xray`-visibility object
(`curvedOverlap-perspective-mixed-xray`) legitimately re-pinned (see Bars changed); every other
X-ray-touching unit/integration test (23 files swept, `scene3d-xray*.test.js`,
`scene3d-mesh-self-occlusion.test.js`, `scene3d-ribbon-f7-self-occlusion.test.js`,
`scene3d-contour-slice.test.js`, `context-bar-scene-flyouts.test.js`,
`scene3d-geometry-controls.test.js`, `scene3d-panel.test.js`, etc.) still green, unedited.

This is genuinely a Red→Green→Refactor fix on the integration branch: RED was the merged tree's
own test failure (a real assertion this repo already owned, not a new one authored for this
merge); GREEN is the one-line fix; REFACTOR was removing the debug instrumentation cleanly
(confirmed zero net diff in `scene3d.js`).

## Test suite results (`npm run test:ci`, run to completion across two runs)

**First full run**: `npm run test:ci` failed at `test:integration` (the merge's own scene-xray
regression above, plus the two re-pin-needed unit files, all found and fixed in that order —
unit's benign RPC-timeout retry passed clean both times before the real integration failure
surfaced). All three flagged issues were fixed and individually re-verified green before the
second full run.

**Second full run, clean, after all fixes**:

| Suite | Files | Tests | Result |
|---|---|---|---|
| unit | 450/451 (1 skipped file) | 4947 passed, 44 skipped (4991) | 0 failed — confirmed twice (original run + automatic RPC-timeout retry, per `scripts/run-vitest.js`'s own documented benign-retry contract) |
| integration | 235/235 | 1945 passed (1945) | 0 failed — confirmed twice (same RPC-timeout retry pattern) |
| e2e | 5/5 spec files | 62 passed, 7 skipped, 0 failed | see note below |
| visual | 6/6 | 99 passed, 13 skipped (112) | 0 failed |
| perf | 5/5 | 10 passed (10) | 0 failed |

**e2e note (infrastructure issue, unrelated to this merge's diff):** `npm run test:e2e`'s default
`workers: 2` hung reproducibly, 4 out of 4 attempts, at the identical point every time — both
Playwright workers finish all 56 `smoke.spec.js` tests, then the process stalls indefinitely (zero
CPU movement across 90+ second windows, confirmed via `ps` on the actual worker PIDs; no new files
written under `test-results/` for 4+ minutes) before printing the final summary. This machine was
running `uptime` load averages of 3.9–5.8 with ~103 node processes and ~95 chrome-family processes
alive from other concurrent sessions at the time (multiple `dev-server.js` instances across other
worktrees, several `playwright-mcp`/`chrome-devtools-mcp` processes, a live Brave Browser session).
One of the four attempts also hit a separate, one-off `ERR_CONNECTION_REFUSED` on the
Playwright-managed `webServer` (fixed by manually pre-starting `node scripts/dev-server.js 4173`
in the background so `reuseExistingServer: true` found it already up). Running the exact same
spec files with `--workers=1` (serializing the two browser projects instead of running them in
parallel) completed cleanly in under 3 minutes with zero hangs and zero failures. Given (a) the
hang is 100% reproducible on the parallel path and 0% reproducible serialized, (b) it manifests
identically regardless of which test happens to be last, (c) the machine's own process census
independently corroborates heavy concurrent load, and (d) nothing in this merge's diff touches
anything a Playwright worker/report-writer would exercise (theme toggling, task bar visibility,
shape tools — all unrelated to the 3D-scene X-ray fix), this is judged an environment/resource
contention issue on a shared, heavily-loaded machine, not a product or merge regression. Recorded
here rather than hidden.

## Version

`package.json` `1.3.98` → `1.3.99`; `npm run version:sync` run, updating `src/config/version.js`
and every `?v=1.3.98` cache-buster query string in `index.html` (`git diff --stat` showed 446
changed lines in `index.html` — confirmed this is exactly the expected `sed`-style version-string
substitution across every `<script>`/`<link>` tag, not unrelated churn).

## Docs

- **CHANGELOG.md** — new `### Fixed` block under `## Unreleased`, leading with the W-26 entry
  using the judge's canonical wording VERBATIM from `docs/3d-audit/lane-reports/W-26-judge.md`'s
  "Wording" section (the "CHANGELOG (`## Unreleased` → `### Fixed`)" block — NOT the superseded "a
  LITTLE more ink" draft, which was never present on this branch to begin with, since it was an
  UNCOMMITTED edit to main's working tree that this fresh worktree never inherited). One line each
  for: W-01, W-26b, W-10/W-10b/W-10c, W-10d, W-15c, W-25/W-25b, W-27/W-27b/W-27c/item-0(b)/W-29 +
  W-27c-0a "improved not fixed" numbers, Unit C/Unit D/Unit D phase-align/W-30 "unreached", A3
  oracle split, U0–U5 roster collapse. Closed with a "Known open" line: U5b (caveat visibility),
  W-30b (wiring), F1 (streak defect), T2/T3 (mkDashRamp/mkTick open items), W-27c-0a residual.
- **README.md** — new `### 1.3.99` entry at the top of Release Notes (three-most-recent-inline
  convention), covering the ladder-gap fix, the curved/contourSlice fix cluster, the W-10d
  greyout note, the shadow-receive-on-objects feature, the roster-collapse note (folded ids
  resolve to survivor + parameter on load, drawing unchanged), and a Known-open line.
- **plans.md** — new entry under `## Done` summarizing the whole merge (landed units, conflict
  resolutions, "not pushed" caveat); new entry at the top of `## Now` listing the full per-lane
  resume queue verbatim from SESSION-SUMMARY.md §3 (fill-audit-a: T1b→W-31→W-32→W-33→
  F1-placement→T2→T3→T4; fill-collapse: U5b→W-30b→U6→U7→U8→U9; fill-audit-d: W-27c-0a iter-4→
  W-34→W-35→W-27c-0a-2; fill-audit: W-15c design D; handoff-c: U9→W-30-adjacent; unscheduled
  items); five new entries under `## Blocked on Jay` (W-06 max density, U6 penStipple mark class,
  ground-plane density after W-15c, F1 screenshot, W-27c-0a "improved not fixed" sign-off).

## Worktree state

Clean — `git status --short -- . ':!graphify-out'` shows nothing after the final commit;
`graphify-out` untouched (hooks were disabled throughout, per protocol). Final integration HEAD:
`ecaf1e17acc566e6695278a8e27b31e3d7604689`, 83 commits ahead of `main`.

Do NOT fast-forward `main` — that is the orchestrator's/Jay's step, after committing main's own
docs.
