STATUS: ACCEPT-WITH-FOLLOWUPS

# W-38 review — facetMinRulings ("Min rulings", per-style minimum facet rulings)

Reviewer: adversarial reviewer, read-only. Worktree `.claude/worktrees/fill-audit-3`, pinned range
`426cc5e4..575f886d` (single commit `575f886d`, `git status` clean throughout — no edits/stashes made
in the worktree). All numbers below were independently reproduced in scratch clones/exports, not
copied from `W-38-impl.md`. Scratch dirs removed at the end of this review.

**Verdict up front:** the shipped mechanism, its inertness roster, its docs contract, and its evidence
are all correct and independently confirmed. The one real defect found is methodological, not
behavioral: **T1's third comparison leg ("vs. the pre-fix tree via `git show HEAD`") is permanently
vacuous as shipped** — see Secretary flags below and Follow-up 1. This does not change my confidence
that the feature itself is byte-identical at the default; it means the shipped test suite offers less
standing regression protection for that claim than its own comment says it does, forever, not just
today. Recommend accepting with a required follow-up to fix or remove that leg.

---

## Secretary flags (addressed explicitly)

**(1) The four-origin default cannot be proven from inside a unit test — verify via `engine.addLayer` + panel, not `generate(params)`.**

Confirmed on all four origins, each checked by inspection AND driven live, not merely asserted:

- **Algorithm fallback**: `finite(styleParams.facetMinRulings, FACET_MIN_RULINGS)` at
  `scene3d.js:2674-2676` (as diffed) — read directly, confirmed unconditional and reached only on
  graded (non-solo) records.
- **`ALGO_DEFAULTS`**: `src/config/defaults.js:2232` — `object3d.style: { penId: null, mapper: 'hatch',
  params: {} }`. Empty params bag, no `facetMinRulings` entry — confirmed by reading the file directly
  (not grepped-and-trusted; the surrounding `object3d` block was read in full).
- **Factory preset**: `user-presets/object3d/` is an **empty directory** (no `.vectura` files at all —
  confirmed via `ls`), and the only `hatch`-mapper `user-presets/scene3d/*.vectura`
  (`studio-shadows.vectura`) sets `"mapper": "hatch", "params": { "fillDensity": 52 }` — no
  `facetMinRulings` key (`grep` + direct read of the JSON). `ALGO_DEFAULTS.object3d.preset:
  'object3d-default'` is a synthesized marker with no override file, matching CLAUDE.md's "four
  origins" warning exactly — checked, not assumed.
- **Live panel descriptor default**: `D_FACETFLOOR.default = 3` (`scene3d-panel.js`), and confirmed
  **live**, not just documentation, by independently re-running
  `tests/integration/scene3d-panel.test.js` in the worktree: **42/42 green**, including the new
  "mapper hatch seeds `facetMinRulings: 3`" test, which drives a real `change` event on the mapper
  `<select>` through `mapperDefaults`/`MAPPER_CONTROLS` — not a supplied param.

All four independently confirmed to resolve to 3 (or, for the two with no entry at all, confirmed to
inject nothing) — driven through `engine.addLayer`/the panel DOM, not `generate(params)` alone, per
CLAUDE.md's own warning about this exact repo's stale-Occlusion-Bias trap.

**(2) T7 re-expresses O20's 1.25× bar in a NEW file — confirm it is not weaker than the original.**

Confirmed **not weaker**, with one immaterial nitpick:

- The new T7 uses `toBeGreaterThanOrEqual(1.25)` where the original O20 assertions in
  `scene3d-facet-tone.test.js:247-248` use strict `toBeGreaterThan(rows[i-1].density * 1.25)`. This is
  a `>=` vs `>` difference at the exact threshold value (still 1.25×, not lowered) — a one-ULP-class
  nitpick, not a widened tolerance. At the measured value (F/L = 1.29× at the default, matching the
  plan's own §1.3 table), there is no near-miss risk either way.
- More importantly, T7 measures a **different, independently-derived metric** (`D = ink / projectedArea`
  via `Scene3D.Scene.assembleScene` + shoelace on `face.polygon`, penWidth deliberately cancelled out of
  the ratio — disclosed in the test's own comment) rather than reusing or editing O20's own
  quantizer-based `density` metric. This is the plan's explicit instruction (§3 T7: "Do **not** move,
  widen or re-pin `scene3d-facet-tone.test.js` or `scene3d-projected-pitch.test.js`") and I independently
  re-ran both of those files unmodified in the worktree: **`scene3d-facet-tone.test.js` 15/15**,
  **`scene3d-projected-pitch.test.js` 17/17** — original bars, untouched, still passing at their
  original counts. F-14's whole history is that bar inverting under a design that touches the shared
  metric; this design does not touch it.
- I additionally reproduced T7 failing (RED) at genuine `426cc5e4` (see condition 2 below) — at the
  default, `stepAt(d1) > stepAt(d3)` fails because pre-fix the floor doesn't respond to the control at
  all (flat), confirming T7 is a real, non-vacuous assertion about the new mechanism, not a tautology.

**(3) Verify the geodesic fixture really exceeds 12 front faces on your own build.**

Independently confirmed, not taken on the test's comment alone. Built the exact fixture
(`solidType: 'geodesic', frequency: 2`, `engine.addLayer('scene3d')` + `computeAllDisplayGeometry()`)
in a scratch vitest run and read `object.faces` off `Scene3D.Scene.assembleScene(...)` directly:

```
TOTAL_FACES 80
FRONT_BY_.front 40
```

`.front` is exactly the field `faceMonoLines`'s own boundary check counts
(`scene3d.js:3053-3056`: `for (...) if (record.faces[i] && record.faces[i].front) front += 1; if (front
> MONO_MAX_FRONT_FACES) return null;`, `MONO_MAX_FRONT_FACES = 12` at `:3018`). 40 > 12 — the
mono-law-boundary "RESPONDS" test is measuring a genuinely-over-threshold fixture, not a vacuous
boundary. The test's own comment claim ("front=40 ... independently confirmed") checks out exactly.

---

## Numbered conditions

**(1) Default is a no-op, `engine.addLayer` + UI path** — CONFIRMED at three independent levels, plus
the four-origins static check above (secretary flag 1):
- Unit level: `tests/unit/scene3d-facet-min-rulings.test.js`, run directly in the worktree: **79/79
  green** (reproduced by me).
- Gallery/full-app level: independently diffed `after/W-38/manifest.A.1-1.jsonl` (48 rows) against
  `fill-audit/manifest.A.1-1.jsonl` (576-row r2 baseline) with a keyed Python comparison
  (`primitive, mapper, style, density, angle`): **48/48 matched, 0 diffs** on `pathCount`/
  `totalPoints`/`inkMm`, 0 rows missing. Confirms the no-op through the real gallery-capture pipeline,
  independent of the test harness.
- Live app: `docs/3d-audit/fill-audit/after/W-38/live/live-verify-report.json` and the three
  `style-tab-min-rulings-{1,3,8}.png` / `object-tab-min-rulings.png` screenshots — I opened and looked
  at all four PNGs directly (not just the JSON). "Min rulings" renders exactly where claimed (directly
  after "Link fill", before "Line" on the Style tab; directly after the Angle dial on the Object tab),
  value 3, slider min/max/step correct.

**(2) RED at 426cc5e4 / GREEN 79/79 + 42/42 reproduced; mutation** — CONFIRMED, both independently
reproduced from scratch (not by reading the impl report's numbers):
- **GREEN**: ran `tests/unit/scene3d-facet-min-rulings.test.js` directly in a `git clone` of the
  worktree at its pinned HEAD: **79/79 pass**. Ran `tests/integration/scene3d-panel.test.js` in the
  worktree itself: **42/42 pass**.
- **RED**: built a separate scratch clone (`git clone --no-hardlinks`, then `git reset --hard
  426cc5e4`, confirmed via `diff <(git show HEAD:scene3d.js) scene3d.js` that HEAD genuinely equals the
  pre-fix tree there), copied in the unmodified new test file, and ran it: **8 failed | 71 passed
  (79)**. The 8 failures are exactly the mechanism-dependent assertions: both T2 cases (control 1 does
  not lower the floor pre-fix), both T3 cases (box/solid ink is flat, not monotone), T5's high-poly
  mono-law "RESPONDS" case (byte-identical pre-fix, since the constant floor is uniform regardless of
  `record`), T6 (no `params.js` clamp case exists), T7 (the ladder-trade step ordering assertion), and
  T10 (the mutation-guard's own marker-text assertion, since the `userFloor` ternary doesn't exist
  pre-fix). All 71 passes are exactly the GREEN-side "must-not-break" guards the plan says should be
  vacuously true before the change (T1's 60 cases, T4's 2 cases, T5's other 6 inertness cases, T8's 2
  cases) — this matches the plan's own oracle table (§3) case-for-case.
- **Mutation**: T10 is built into the shipped suite (forces the `userFloor` ternary back to the bare
  `FACET_MIN_RULINGS` literal via `scriptOverrides` on the live disk source, not `git show`) and passes
  in the GREEN run — confirmed it genuinely breaks T2/T3 under the mutation (ink goes flat, control 1
  no longer lowers the floor). This is the strongest non-vacuity proof in the suite; see the flag below
  on why it matters more than T1's third leg does.

⚠ **A real, disclosed-nowhere defect found in T1 itself — the "pre-fix tree" comparison is
permanently vacuous once the work is a single commit.** `T1`'s `beforeAll` builds `preFixV` via
`execFileSync('git', ['show', 'HEAD:src/core/algorithms/scene3d.js'])`, with a comment claiming "HEAD
is the base commit this unit started from ... so `git show HEAD:...` is exactly the tree BEFORE this
unit's edit." That was true only while the work was uncommitted. Now that it is committed as
`575f886d`, **`HEAD` IS the post-fix commit** — I confirmed `diff <(git show HEAD:scene3d.js)
scene3d.js` is empty (byte-identical) in the pinned worktree. So `preFixV` is built from the exact same
source as the ordinary runtime `V`, on every run, forever: this is not a one-time staleness that will
resolve itself, it is now structurally incapable of ever disagreeing with `V`, because both always read
whatever is currently HEAD. **The comparison `md5(absent) === md5(pre)` in T1 can never fail**,
regardless of any future regression to the default — it is not testing "does this match the historical
pre-W-38 mechanism," it is testing "does this file agree with itself," which is tautological. This
does **not** mean the shipped default is wrong (I independently proved byte-identity through three
*other*, non-vacuous channels above: the real `426cc5e4` RED reproduction, the gallery-manifest diff
against the real historical baseline, and T10's mutation guard). But the specific claim "T1 proves
byte-identical to the pre-fix tree, and will keep proving it" is false for the "and will keep proving
it" half. Filed as a required follow-up, not a rejection — see Follow-ups §1.

**(3) Semantics** — CONFIRMED, reproduced independently in the GREEN run and cross-checked against the
bespoke-sweep images:
- Control 1 on the app-default box: `face:+X`/`face:+Y` draw <3 rulings (T2, green). Bespoke sweep
  (`bespoke/box__control1.png`, looked at directly): top/right facets carry 2 and 1 strokes
  respectively against the densely-ruled left facet — matches `report.json`'s
  `box_rulingsByFace.control1` numbers exactly.
- Monotone 1→2→3→5→8: T3 green (box AND solid); bespoke sweep ink strictly increasing
  559.8→589.0→632.1→720.7→797.5mm (box) and 289.0→354.7→447.8→604.7→780.9mm (solid) — both matched
  against the images (`box__control1.png` through `box__control8.png`, `solid__control1.png`/
  `control8.png`), which visibly show the claimed progression with no rendering artifacts, no overshoot
  past any silhouette.
- O20/O21 re-expressed at the default, not weakened: see secretary flag 2 above — T7 uses an
  independently-derived metric, the two original O20/O21/O22-owning files are unmodified and still pass
  at their original counts (15/15, 17/17), and T7 itself is non-vacuous (fails at true `426cc5e4`).

**(4) INERTNESS enumerated** — CONFIRMED, every row, reproduced in the GREEN run (T5, part of the
independently-reproduced 79/79) and cross-checked structurally:
- Smooth primitives (`sphere`): md5-identical at control 1 vs 8 — confirmed in T5, and structurally
  correct (sphere never enters `faceHatchLines`).
- Solo-orientation records including the ground plane: md5-identical, confirmed in T5 AND independently
  via the live-verify JSON (`groundInk: {1: 2650.16, 3: 2650.16, 8: 2650.16}` through a real
  `engine.addLayer` scene) — decision 3 is not reopened, by construction (`soloOrient ? FACET_MIN_RULINGS
  : userFloor` gate, read directly in the diff).
- Contour law (a `REGION_MAPPER`) inert: confirmed, `box+contour` md5-identical at 1 vs 8 — matches the
  plan's §2.2 correction of the original brief (contour/spiral/stipple never reach the grant).
- Mono law: **both sides measured, not asserted blanket**, matching the secretary's flag. `box+etfKang`
  (6 faces, ≤12 front) INERT. `solid` geodesic freq-2 + `etfKang` (**independently confirmed 40 front
  faces, secretary flag 3 above**) RESPONDS — ink strictly higher at control 8 than 1, matching the
  `faceMonoLines` → `null` → falls through to `faceHatchLines` mechanism read directly at
  `scene3d.js:3053-3056`.
- Pyramid inert at every control/density measured: confirmed in T5 and in the plan's own §2.2 table
  ("every chart-wrapped facet always out-asks the floor" — i.e. `ceilCount` never exceeds what Density
  alone would already grant, so `Math.max(userFloor, soloDens)` never changes `want` once clamped by
  `Math.min(ceilCount, ...)`). This is a real structural reason, not an unexplained coincidence.

**(5) `.vectura` round-trip / undo-redo / preset bundler dry-run / clamp range** — CONFIRMED:
- Round-trip: `params.js:727` — `clamp(Math.round(finite(value, 3)), 1, 8)`, read directly, confirmed
  clamps 0→1 and 99→8 (both integer-rounds and range-clamps) and passes `4.6→5` (T6, reproduced green in
  the worktree; reproduced RED — `expected +0 to be 1` — at genuine `426cc5e4`, confirming the case is
  load-bearing, not a decorative addition). A saved `facetMinRulings: 5` JSON round-trip renders
  byte-identically after reload (T8, reproduced green).
- Undo/redo: architectural claim, accepted on the strength of direct inspection rather than an
  independently-driven live drag: `scene3d-panel.js`'s H3 slider call uses the identical
  `...liveSlider((v) => {...})` spread pattern every other transform/slice slider in the file uses
  (`grep -n liveSlider` shows it reused at `:1002, :1008, :1246, :1285, :1293, :1300` and the new H3
  call) — the same shared-helper argument W-35's review accepted for its own slider. The live-verify
  JSON (`historyCallsAfter3Drags: 3`) independently corroborates one-`pushHistory()`-per-gesture through
  a real Playwright drag, though I did not re-drive that drag myself this review (chrome-devtools MCP
  was failing to connect this session too, matching the documented fallback).
- Preset bundler: **not independently re-run this review** (time-boxed after the RED/GREEN
  reproduction and the geodesic fixture check); accepted on the strength of `git status --short --
  src/config/user-presets.js` being empty per the impl report and the static confirmation that no
  shipped preset names the key (`grep -rn facetMinRulings user-presets/` — 0 hits, confirmed by me
  directly). Low risk: the plan's own §2.5 states no shipped preset uses the key, which I verified.
- `Params.normalizeStyle` clamp range: confirmed `[1,8]`, integer, `finite()`-guards non-numeric input
  to 3 — read directly and exercised by T6 (RED at base, GREEN post-fix, both reproduced).

**(6) Files** — CONFIRMED clean and disjoint:
- `git diff --stat 426cc5e4..575f886d`: exactly the 5 files the impl report claims (`scene3d.js`,
  `params.js`, `scene3d-panel.js`, `tests/integration/scene3d-panel.test.js`, the new unit test file).
  Nothing in `surface-fill*.js`, `mappers.js`, `context-bar.js`, `defaults.js` — confirmed via `grep -rn
  facetMinRulings` across those files, 0 hits.
- `scene3d.js`: the carrier grant only, `:2673-2688` in the diff — 4 lines of logic + a comment block,
  `FACET_MIN_RULINGS`'s own definition and value untouched (confirmed by reading the diff — no hunk
  touches the constant's own line).
- `params.js`: one `case 'facetMinRulings'` at line 727 in the current tree, inserted immediately after
  `case 'altFillMapper':` (line 722) and immediately before the pre-existing `case 'sliceCount':` (CtS
  I5 block). **Confirmed disjoint from W-35's `case 'sliceEndOverlap'`**: that case already existed at
  `426cc5e4` (base sha for this lane) at line 735, and now sits unmodified at line 740 (shifted only by
  the 5 lines W-38 inserted above it, in a different `case` — no textual overlap, no shared lines
  touched). W-10d-2's own hunks are not in this pinned range to check (that lane's changes are not
  present in this diff at all — a non-issue since `params.js`'s only change here is the single case).
- `scene3d-panel.js`: the four hunks H1-H4 exactly as the plan specifies — read directly: `D_FACETFLOOR`
  const beside `D_TONELAW`; appended to `MAPPER_CONTROLS.hatch` and `.crosshatch` only (not `contour`,
  `spiral`, `stipple`, `wireframe`, `contourSlice` — confirmed by reading the full `MAPPER_CONTROLS`
  object, those arrays are untouched); one slider call in `buildObjectPanel`'s per-leaf block right
  after the Angle dial, gated on `hatch`/`crosshatch`; one token added to `persistentStyleKeys()`'s base
  array. Nothing else in this 4931-line file is touched.

**(7) `## Bars changed` — confirmed none.** Independently re-ran, in the worktree, every one of the 11
named guard files plus the two O20/O21/O22-owning files plus the integration file, all at their claimed
original counts:

| file | result |
|---|---|
| `scene3d-facet-tone.test.js` | 15/15 |
| `scene3d-projected-pitch.test.js` | 17/17 |
| `scene3d-box-density-bearing.test.js` | 4/4 |
| `scene3d-appdefault-facet-fill.test.js` | 7/7 (part of the 9-file/76+3-skip batch below) |
| `scene3d-subwindow-density.test.js` | 3 pass + 2 skipped |
| `scene3d-hatch-density-500.test.js` | 14/14 |
| `scene3d-faceted-highlight-dispatch.test.js` | 12/12 |
| `scene3d-faceted-tone-law.test.js` | 19/19 |
| `scene3d-faceted-density-calibration.test.js` | 7/7 |
| `scene3d-hlr-spatial-index-identity.test.js` | 6/6 |
| `scene3d-appdefault-lit-floor.test.js` | 4 pass + 1 skipped |
| `tests/integration/scene3d-panel.test.js` | 42/42 (was 38, +4 new) |

(The 9-file guard batch — everything except the facet-tone/projected-pitch pair, run separately — came
back as **76 passed + 3 skipped across 79 tests total**, matching the sum of the per-file counts above
exactly.) No numeric threshold, tolerance, or fingerprint was touched in any existing file — confirmed
by `git diff` showing zero changes to any file in this list, and by the counts matching pre-existing
values.

**(8) PNG review, all of them.** Looked directly at: `bespoke/box__control{1,3,8}.png` (full frames),
`bespoke/crop_right_c{1,8}.png` (native-resolution 395×300 crops), `bespoke/solid__control{1,8}.png`,
and all four `live/*.png` screenshots.
- `box__control1.png`: left/`+Z` facet densely ruled (11 lines), top/`+X` facet carries 2 short diagonal
  strokes, right/`+Y` facet carries 1 — matches `report.json`'s `box_rulingsByFace.control1` exactly.
- `box__control8.png`: top and right facets now carry dense parallel rulings approaching the density of
  the left facet — visibly "the box reading flat," matching the plan's own description. No stroke
  crosses a silhouette edge, no visible overshoot/hook artifact anywhere in either image.
- `crop_right_c1.png` vs `crop_right_c8.png`: c1 shows one long diagonal stroke on bare paper; c8 shows
  5+ clean parallel rulings, correctly inset from the facet boundary, clean intersection at the shared
  ridge with the top facet. No artifacts at either extreme.
- `solid__control1.png`: almost every visible facet carries exactly one short stroke — "a single stripe
  per lit facet," matching the plan's verbatim description.
- `live/style-tab-min-rulings-3.png`: "Min rulings" row directly under "Link fill" and above "Line," a
  slider at value 3 — matches the H2 placement claim exactly (row order in `MAPPER_CONTROLS.hatch` is
  `[D_ANGLE, D_DENSITY, D_TONELAW, D_ANGLEREF, D_LINKFILL, D_FACETFLOOR]`, i.e. last, which is exactly
  "right after Link fill").
- `live/object-tab-min-rulings.png`: row directly after the Angle dial, before the Border section —
  matches H3's placement claim.

**(9) Docs-contract list in the report is accurate.** Cross-checked the impl report's docs-contract
table against the plan's §7 table: all six required rows present (CHANGELOG, README, in-app help,
plans.md, STILL-OPEN+LEDGER, version), and the in-app help row correctly carries BOTH the shipped
descriptor's `help` string (verified verbatim against the actual diff text at `scene3d-panel.js`'s
`D_FACETFLOOR.help`) AND, separately, decision 7A's release-note sentence ("On graded objects Density
sets the object's ink range while tone allocates within it; this control lowers the floor") carried
**verbatim** from the plan's §7 — confirmed by direct string comparison, not paraphrased. `grep -n
"facetMinRulings\|W-38\|Min rulings" CHANGELOG.md README.md plans.md` in the worktree returns nothing —
confirming, as claimed, that none of these are edited in this worktree (left for the orchestrator's
landing commit, per protocol).

**(10) Merge note.** `docs/3d-audit/STILL-OPEN.md:414` and `LEDGER.md:126` (orchestrator-maintained,
outside this worktree) already record `575f886d`, the 79/79 + 42/42 counts, "NO bars changed," and the
mono-law-boundary finding accurately and consistently with what I independently reproduced above — no
discrepancy found between the ledger's summary and the actual measured behavior.

---

## Follow-ups

1. **REQUIRED before this test file is trusted as a standing regression guard**: fix or remove T1's
   third comparison leg (`preFixV`, built via `git show HEAD:...`). As shipped, this leg can never fail
   — `HEAD` always equals the currently-loaded source on a clean tree, at any point in time, so
   `preFixV` and the ordinary runtime always read byte-identical code. This is not a one-time
   post-commit staleness; it is structurally incapable of ever catching a regression, forever. Two
   reasonable fixes: (a) delete the third leg and its `preFixRuntime`/`execFileSync` plumbing entirely,
   relying on T10's mutation guard (which is genuinely non-vacuous — it mutates the *live disk source*,
   not a git ref) for non-vacuity proof, and on `absent === 3` for the origin-consistency proof; or
   (b) pin a fixed reference the way `scene3d-hlr-spatial-index-identity.test.js` does — hardcode the
   measured pre-fix md5 hashes for the 60 T1 cells as literal expected values, so a future change is
   checked against a truly fixed historical baseline rather than a moving `HEAD`. Either removes the
   test's own now-false comment claim ("HEAD is the base commit ... so `git show HEAD:...` is exactly
   the tree BEFORE this unit's edit").
2. **Same latent pattern likely exists in `scene3d-slice-end-overlap.test.js` (W-35)**, which uses the
   identical `git show HEAD:...` technique for its own pre-fix comparison and was already merged as a
   single commit. Not re-verified this review (out of scope — W-38 only), but worth a follow-up sweep
   across this audit's test files for the same `git show HEAD` idiom, since it degrades identically
   wherever it is used and this audit has now shipped it in at least two units.
3. **Non-blocking**: T7's `toBeGreaterThanOrEqual(1.25)` vs. O20's original strict `toBeGreaterThan(...
   * 1.25)` is a `>=`/`>` nitpick at the same threshold value, not a widened tolerance — no action
   needed given the measured headroom (1.29× at the default), but worth using strict `>` for consistency
   with the convention O20 itself uses, if this file is touched again.
4. **Preset bundler dry-run was not independently re-executed this review** (accepted on the strength of
   the impl report's `git status --short` claim plus my own independent `grep` confirming no shipped
   preset names the key). Low risk given the static confirmation, but a future reviewer with more time
   budget should re-run `node scripts/build-user-presets.js` directly and confirm `git status` stays
   clean, as the W-35 review did.

No regression, no widened numeric tolerance, no re-pinned fingerprint, and no incorrect inertness or
semantics claim was found anywhere in this unit's actual shipped behavior. The one defect found is in
the shipped test suite's own self-verification machinery (T1's third leg), not in the product code —
recommend landing W-38 with follow-up 1 tracked as a required cleanup.
