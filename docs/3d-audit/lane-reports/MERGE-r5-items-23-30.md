# MERGE r5 — items 23 & 30 scout report (items 23-30, plus Task C)

**Scope.** Read-only scout on `.claude/worktrees/integrate-r5` (branch `3d-scene/integrate-r5` =
main `e8781bcc9` + `fill-audit-a5` + `fill-audit-b5` merged, HEAD `68511bde`). No edits, no commits, no
full suite run. §0 (ROUND3-RESUME-BRIEFS.md lines 34-67) applied throughout — rig/camera/density stated
for every number below; ground-plane inclusion is the entire subject of Task B.

---

## Task A — item 23, the `git show`/history-reading idiom sweep

**Sweep commands** (`git -C <integrate-r5>`), whole `tests/` tree:
```
git grep -n -E "git show HEAD:|git show HEAD "     -- tests/ scripts/
git grep -n -E "exec(File)?Sync"                    -- tests/
git grep -n -E "git archive|git cat-file"           -- tests/ scripts/
git grep -n -E "/private/tmp|/tmp/"                 -- tests/
```
All 15 distinct pinned SHAs found below were verified reachable in this tree with
`git cat-file -e <sha>^{commit}` (all 15 → `ok`, none MISSING) — the merge did **not** squash or rebase
any lane, so §2.2's "no rebase / no squash" invariant holds.

| file:line | ref read | classification | evidence |
|---|---|---|---|
| `tests/unit/scene3d-slice-end-overlap.test.js:44,131` | `execFileSync('git',['show','HEAD:'+SCENE3D_REL])` — **LIVE, HEAD** | **VACUOUS FOREVER (known, W-35/W-39)** | On a clean tree `HEAD` ≡ loaded source, so the "byte-identical default" leg can never fail. Already has a numbered W-id — **`plans.md:44`, item "W-39"** — so item R4-4a is closed; this is carried-forward, not new. Ran foreground: `npx vitest run tests/unit/scene3d-slice-end-overlap.test.js` → **30/30 pass**, 3.58s (jsdom, no browser). No merge action beyond leaving W-39 open in `plans.md`. |
| `tests/helpers/pre-wip-surface-fill.js:16,24,60,89` | `PRE_WIP_SHA='1b157bc6'` default + per-call shas | **SOUND** | Fixed historical pins, all reachable. Consumed by 17 test files (below). |
| `tests/unit/scene3d-area-light-shadow-softening.test.js:181,184` | `BASE_SHA='90f3411f'` | **SOUND** | reachable |
| `tests/unit/scene3d-shadow-receive-lighttypes.test.js:43,55` | `BASE_SHA='90f3411f'` | **SOUND** | reachable |
| `tests/unit/scene3d-shadow-footprint-torus-visibility.test.js` | `BASE_SHA='90f3411f'` | **SOUND** | reachable |
| `tests/unit/scene3d-shadow-footprint-wiring.test.js:56,73` | `BASE_SHA='1e681432'` | **SOUND** | reachable |
| `tests/unit/scene3d-shadow-footprint-direction.test.js:42` | `BASE_SHA='8e9b0991'` | **SOUND** | reachable |
| `tests/unit/scene3d-shadow-footprint-torus-hole-accuracy.test.js:58` | `BASE_SHA='2d931b1a'` | **SOUND** | reachable |
| `tests/unit/scene3d-shadow-footprint-torus-thin-blank.test.js:55` | `BASE_SHA='83d1e021'` | **SOUND** | reachable |
| `tests/unit/scene3d-mkdashramp-low-end.test.js:41,57` | `T3_BASE_SHA='8780e97c'` | **SOUND** | reachable |
| `tests/unit/scene3d-mkdashramp-single-pass.test.js:94,110` | `T3B_BASE_SHA='b43fa4e3'` (main's own sha) | **SOUND** | reachable, matches MERGE-plan-r4's finding verbatim |
| `tests/unit/scene3d-mkdashramp-discrete.test.js:89,103` | `T3C_BASE_SHA='75777240'` | **SOUND, lane-only** | reachable in this merged tree; §2.2 (no rebase/squash) is what keeps it alive — flagged again per MERGE-plan-r4's own warning |
| `tests/unit/scene3d-ribbon-flat-field-placement.test.js:56,74` | `F1P_BASELINE_SHA='8adfd5af'` | **SOUND** | reachable; ran foreground: `npx vitest run tests/unit/scene3d-ribbon-flat-field-placement.test.js` → **22/22 pass**, 182.9s (jsdom) |
| `tests/unit/scene3d-ribbon-f1b-streaks.test.js:159` | `F1B_BASELINE_SHA='d5af9e30'` | **SOUND** | reachable |
| `tests/unit/scene3d-ribbon-f6-self-occlusion.test.js:71` | `F6_BASELINE_SHA='ecc50c16'` | **SOUND** | reachable |
| `tests/unit/scene3d-ribbon-f7-self-occlusion.test.js:57` | `F7_BASELINE_SHA='57e86f48'` | **SOUND** | reachable |
| `tests/unit/scene3d-shadow-receive.test.js:38,691,706` | `'d5af9e30'`, `'2893d842'`, `'d86cbf8d'` | **SOUND, 2 legs env-gated** | reachable; the `2893d842`/`d86cbf8d` legs only run under `VECTURA_PRE_FACETGRADE=1`/`VECTURA_PRE_UNITD_PHASE=1` — not set by any workflow, so those two branches are dormant in CI (neither BROKEN nor exercised; noted for completeness) |
| `tests/unit/scene3d-ribbon-outline-fill-seam.test.js`, `-weightscale-invariant.test.js`, `-c3-rule5.test.js`, `-wall-region-clip.test.js`, `-wall-coverage.test.js` | default `PRE_WIP_SHA='1b157bc6'` | **SOUND** | reachable, no per-file override |
| `tests/unit/scene3d-mkdashramp-onset.test.js` (a5, T3c-onset-2) | **no git call** — `fs.readFileSync` of current on-disk source + reverts only T3c's own gate (needle match) | **DEPENDENCY DROPPED (as claimed)** | Confirmed: file contains zero `execFileSync`/`git show`/sha constants (only historical prose at :36 explaining the swap). Matches the brief's statement that a5's T3c-onset-2 explicitly dropped its git-history dependency. Ran foreground: `npx vitest run tests/unit/scene3d-mkdashramp-onset.test.js` → **27/27 pass**, 8.83s |
| `tests/unit/scene3d-mktick-band-purity.test.js` (b5, rewritten) | **no git call** | **CLEAN** | grep for `BASE_SHA`/`execFileSync`/`git show` in the file: zero matches — b5's rewrite is confirmed history-free |
| `tests/unit/scene3d-mktick-gap-fill.test.js` | — | **DELETED** | file absent from tree; `git log -- tests/unit/scene3d-mktick-gap-fill.test.js` shows it existed pre-b5 and is gone at `94fb314f`/current HEAD — matches the brief's statement it was deleted |
| `tests/unit/scene3d-mktick-wedge.test.js:280`, `scene3d-facet-min-rulings.test.js:35`, `scene3d-shadow-tone-gradient.test.js:177` | comment-only prose mentioning `git show HEAD:` | **✅ no action** | no live call in any of the three files |
| `tests/unit/scene3d-contour-slice.test.js`, `scene3d-mktick-runaway.test.js`, `scene3d-mktick-banding.test.js`, `scene3d-mkdashramp-dark-end.test.js`, `scene3d-curved-density-floor.test.js`, `scene3d-fill-boundary-ends.test.js`, `scene3d-mesh-self-occlusion.test.js`, `scene3d-one-pen-down-reachability.test.js`, `scene3d-ribbon-fill-depth-count.test.js`, `tests/integration/scene3d-self-crossing-tone.test.js` | comment-only prose mentioning `git archive <sha>` | **✅ no action** | grepped each for `execFileSync`/`require('child_process')`: zero live calls — all are historical-methodology prose about scratch exports used during the ORIGINAL RGR cycle, not code the committed test executes |
| `tests/unit/scene3d-tone-laws-config.test.js:179`, `tests/unit/skin/skin-sdk.test.js` | `execFileSync(process.execPath\|'node', …)` | **✅ irrelevant** | spawns node on a generated/helper script, no `git` argument |

**CI fetch-depth cross-check** (`.github/workflows/test.yml`, `.github/workflows/release.yml`): only the
**`unit`** job (`test.yml:25`) and **`coverage`** job (`test.yml:110`) set `fetch-depth: 0`; `integration`,
`e2e-smoke`, `visual`, `perf` (test.yml) do **not**. `release.yml:25` also sets `fetch-depth: 0` and then
runs `test:unit && test:integration`. Every live history-reading file identified above lives under
`tests/unit/` and is exercised only by `npm run test:unit` (`package.json`: `test:unit` → `vitest run
tests/unit`) — **no live git-history read executes in a job without `fetch-depth: 0`.** CI-safe.

**Net for the merge:** no BROKEN instances, no new ALWAYS-PASSING instances beyond the one already tracked
(W-39, `plans.md:44`). No merge action required for item 23 beyond what's already in `plans.md`.

---

## Task B — item 30, ground-plane inclusion in ink numbers

Rules (from `MERGE-plan-r4.md`, re-applied, script re-verified on this tree — `scripts/audit/
scene3d-capture.js:270-272,291,329-351` unchanged, still hides `groundChild`/sets `ground.enabled=false`
before summing `inkMm`):

- **A** — any number from `scripts/audit/scene3d-capture.js` (either rig) → **EXCLUDES**
- **B** — a bespoke harness that does not explicitly disable ground → **INCLUDES**
- **C** — a unit/object harness (`SurfaceFill.buildObject`, single-object `generate()`, or a per-region
  metric like `ringNotInkMm2`/`ringFillRate` computed off ribbon stats, never a scene) → **object-only, N/A**
- **D** — explicit `ground:{enabled:false}` / ground-child deletion in a bespoke harness → **EXCLUDES, guarded**

| report | ink number(s) | rig / harness (fixture) | ground | evidence |
|---|---|---|---|---|
| `T4-impl.md` | e.g. 234.0→826.4mm (sphere/hatch/low, d=1) | `scripts/audit/scene3d-capture.js`, `create` rig, camera a, PRIMITIVE_CREATE_DEFAULTS | **EXCLUDES (Rule A)**, undisclosed | `:92-99` cites the script directly; no "ground" line in the report — **add one line** |
| `T4b-impl.md` | 1501.0636578167772mm (sphere/hatch/mkDashRamp, d=220, create-equivalent) | `engine.addLayer('scene3d')` fixture, camera `DEFAULT_CAMERA` ('a'), ground child **deleted** (`scene3d-mkdashramp-dark-end.test.js:113-118`, matching `scene3d-capture.js`'s own isolation) | **EXCLUDES (Rule D)**, undisclosed in prose (only a code comment states it) | `T4b-impl.md:30-45`; test file line numbers above — **add one line** |
| `T4b-review.md` | 1479.74–1517.52mm envelope, 1528.997147273961mm (camera 'b') | same fixture as T4b-impl (inherited) | **EXCLUDES (Rule D)**, undisclosed | `T4b-review.md:70-79` — **add one line** |
| `W-36c-impl.md` | "ink today"/"ink today→after" table (sphere/cylinder/torus/ellipsoid, d=50/220), e.g. cylinder d=220 ink 9136.777mm | Re-run of the plan's §3.1 measurement harness — **not** `scene3d-capture.js`; report doesn't name the harness explicitly | **UNDETERMINABLE from the report alone** | `W-36c-impl.md:80-113` names no script/ground state; the report cross-refs `F1-placement-plan.md` which DOES disclose ground exclusion for its raw rig (`F1-placement-plan.md:112`: "ground and backdrop off, so no ground-plane ink in any total") but `W-36c-impl.md` itself never restates it — **add rig + ground line** |
| `F1-placement-plan.md` / `-impl.md` | `ringNotInkMm2`, `ringFillRate`, ink ratios (2.00–2.22×) | raw unit rig (own §1), ground/backdrop explicitly off | **EXCLUDES stated (Rule D) for the raw-rig numbers; object-only (Rule C) for `ringNotInkMm2`** | `F1-placement-plan.md:112` states it plainly. The **gallery/whole-scene numbers** cited for cross-check (`F1-placement-impl.md:212-214`) use `scripts/audit/scene3d-capture.js` (Rule A, EXCLUDES) — both pipelines exclude ground, but the report itself flags they are **different pipelines with different magnitudes**, already disclosed as a known gap, not a merge action |
| `F1-erode-impl.md` / `-plan.md` / `-review.md` | `ringNotInkMm2`/`inkMm=2006.6` (unit-harness cell, gallery-rig cross-check) | `:185-191` explicitly cross-checks against `scripts/audit/scene3d-capture.js:buildAndMeasure`'s own rig-seeding, confirms "the gallery's rig geometry never [changes]" | **Rule C (unit metric) / Rule A (gallery cross-check) — both effectively ground-N/A or EXCLUDES** | `F1-erode-impl.md:185-191` — compliant in substance, but no literal "ground" sentence — **add one line for completeness** |
| `F1-amp-impl.md` / `-review.md` | `ringNotInkMm2` 2.4694→2.6606; `pathCount=302, inkMm=2275.6` cross-check | unit harness (Rule C) + gallery cross-check citing `scripts/audit/scene3d-capture.js` addLayer rig (Rule A) | **N/A / EXCLUDES**, undisclosed as a sentence | `F1-amp-impl.md:158,187-208` — **add one line** |
| `F1-width-bar-impl.md` / `-review.md` | drift-envelope numbers, `scene3d-ribbon-width-bar.test.js` | `scripts/audit/scene3d-capture.js`, both `create` and `--rig addLayer` branches (`F1-width-bar-review.md:73`) | **EXCLUDES (Rule A)** | Explicitly named script, but no ground sentence in either file — **add one line to both** |
| `F1-width-bar-b-impl.md` | 12/12 create-rig measurements | `tests/helpers/scene3d-ribbon-width-create-rig.js` — reproduces `scene3d-capture.js`'s `create` branch verbatim inside jsdom | **EXCLUDES, guarded (Rule D)** | `:20-22`; this is the same helper MERGE-plan-r4 classified "EXCLUDES, guarded" — **compliant, already has ground text at 3 lines**, no action |
| `F1-width-bar-reshoot.md` | re-measured widths, two variants (ground untouched vs `groundChild.visible=false`) | bespoke script reusing `scene3d-capture.js`'s `ensureServer`/`openPage`, explicitly built BOTH ways to isolate the effect | **EXCLICITLY BOTH STATED — compliant** | `:44-46,79-80` states plainly which variant includes/excludes ground — **no action, this is the model report** |
| `W-07b-2-plan.md` / `-impl.md` | whole-object fill ink ratios (clause A, 1.0208–1.1725×) | bespoke `deepFillTSP`/Ladder harness, `q.ground`/backdrop **off** stated explicitly | **EXCLUDES (Rule D), disclosed** | `W-07b-2-plan.md:112` ("ground and backdrop off, so no ground-plane ink in any total"); `W-07b-2-impl.md:45` restates it — **compliant, no action** |
| `T2-3b-impl.md` | per-cell ink table | `scripts/audit/scene3d-capture.js` cited directly, "ground-plane-ink disclosure" phrase present | **EXCLUDES, disclosed** | `:346,354` — **compliant** |
| `T2-3c-impl.md` | full-diameter stray-stroke lengths (mm), not strictly "ink" totals but geometric mm | `ground:{enabled:false}` stated for the vitest fixture; capture-harness `--rig addLayer` also ground/backdrop off | **EXCLUDES, disclosed** | `:44,228` — **compliant** |
| `T2-6-impl.md` | per-cell table, d=50 | re-derived on this tree, `--rig` named | **EXCLUDES, disclosed explicitly in the section heading** | `:67` — "ground-plane ink EXCLUDED" verbatim — **compliant, model report** |
| `T2-7-impl.md`, `T2-7-impl-2.md`, `T2-8-impl.md`, `T2-2-impl.md`, `T2-3-impl.md` | — | — | **N/A — no ink totals in these reports** (tick/band/wedge geometry metrics only) | grepped for `inkMm`/`ink change`/`% ink`: zero matches in all five |
| `W-32r4-impl.md` | 10 gallery captures | `scripts/audit/scene3d-capture.js --root <worktree> --port 8470` named directly | **EXCLUDES (Rule A), disclosed** | `:239` — **compliant** |
| `W-32r4b-impl.md` | — | — | **N/A — no ink numbers** | grep empty |
| Round-4 carryover (already actioned per `MERGE-impl-r4.md:265`) | `T3b-review.md`, `W-36e-impl.md`, `W-36e-verify.md`, `F1-count-impl.md`, `T3c-review.md`, `W-32r4-review.md`, `W-36f-scout.md` | (per r4 table) | **now carry a ground-plane line each** (re-grepped: 1 match apiece) | `T3b-impl.md` is the **one exception — still 0 matches**, i.e. round 4's "add one line" action was done for 7 of 8 named files but **not** `T3b-impl.md` itself — **still owed, carried into r5** |

**Mismatched-inclusion check** (the actual risk rule 3 warns about — comparing two numbers with different
ground treatment): no pair of numbers compared *against each other* in these reports mixes INCLUDES vs
EXCLUDES — every ink number found this round traces to either `scene3d-capture.js` (Rule A) or an
explicitly-ground-off bespoke harness (Rule D) or an object-only metric (Rule C). The one live risk is
**W-36c-impl.md**, whose harness/ground state is UNDETERMINABLE from its own text — it must be resolved
(name the harness, state ground) before any of its numbers are used as a baseline for a future comparison.

**Merge action list (item 30):**
1. Add a one-line ground/rig/camera/density disclosure to: `T4-impl.md`, `T4b-impl.md`, `T4b-review.md`,
   `W-36c-impl.md` (**also name the harness — currently undeterminable**), `F1-erode-impl.md`,
   `F1-amp-impl.md`, `F1-width-bar-impl.md`, `F1-width-bar-review.md`.
2. Close the round-4 carryover gap: **`T3b-impl.md`** still lacks the line R4-2/item-30 already required —
   this predates round 5 but is still open.
3. No number found this round mixes ground-included vs ground-excluded in a single comparison — item 30 is
   an annotation debt, not a correctness bug, for every report above except the `W-36c` harness-identity gap.

---

## Task C — W-07b-2's full 1504-cell byte-identity sweep (locate only, not run)

**No committed script or test runs this sweep.** `W-07b-2-plan.md:157` (Clause C) states the 1504-cell
figure (47/48 laws × 4 primitives × 8 mappers) came from **"a scratch sweep, md5 of `generate()` at the
implementer's base sha against the new sha... not committed because pinned hashes of 47 laws would collide
with T2-7's mkTick edit and every later unit."** No file path, script name, or exact CLI invocation is
given anywhere in `W-07b-2-plan.md` or `W-07b-2-impl.md` (grepped both for `1504`/`sweep C`/`md5` — the
term appears only in `-plan.md`, never in `-impl.md`). `W-07b-2-review.md:115-116` confirms the reviewer
used **"own script, not the impl's"** — a second, also-uncommitted script — and ran a reduced **72-cell**
sample instead (`:117-120`: 12 laws × sphere/torus/cone × hatch/contour), because **"the first two attempts
at a broader sweep (38 laws × 3 primitives × 8 mappers, then 12 laws × 4 mappers) were killed by heavy
machine contention... before completing"** (`:125-128`). Expected runtime for the full sweep is **not
stated anywhere** — only that two broader (but still sub-1504) attempts didn't finish under shared-machine
load, and the successful 72-cell retry's own runtime isn't given either (only the `ladder`/`deepFillTSP`
hash-equality counts are reported). `W-07b-2-review.md:185-187` (its "why not a bare ACCEPT" item 4) flags
this explicitly as an open follow-up: **"Clause C's full 1504-cell sweep was not independently reproduced
in full... a future reviewer with a quieter machine should complete the full sweep."**

**Verdict:** neither script exists on disk in this tree (checked `scripts/audit/`, `tests/`, and the
`W-07b-2` evidence dirs under `docs/3d-audit/fill-audit/after/W-07b-2/` — no `.js`/`.mjs` sweep file
present). Any future run of the full 1504-cell sweep will have to be **rewritten from the plan's Clause C
description**, not resumed from an existing file. Do not run it, per instructions.

---

## Summary verdicts

- **Item 23:** no BROKEN, no new VACUOUS instances beyond the already-tracked `W-39`. All 15 pinned SHAs
  reachable in the merged tree. No live history read escapes the `fetch-depth:0` CI jobs. **No merge
  blocker.**
- **Item 30:** 8 reports need a one-line ground/rig/camera/density disclosure added (list above); one
  report (`W-36c-impl.md`) additionally needs its harness identity resolved before any of its numbers are
  trusted as a comparison baseline; one round-4 carryover (`T3b-impl.md`) is still open. **No number found
  mismatches ground-inclusion against a number it's compared to — annotation debt, not a correctness bug.**
- **Task C:** the 1504-cell sweep has no runnable artifact in the tree; its exact command and runtime are
  undocumented even in the reports that cite its result. Flagged, not run.
