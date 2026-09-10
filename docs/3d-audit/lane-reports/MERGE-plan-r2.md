STATUS: PLAN-READY

# MERGE PLAN — round 2 (five `3d-scene/*` lanes → `main` @ v1.4.0)

Planner: read-only. **No state in the real repo was changed.** Every merge below was executed for
real in a throwaway clone at `/private/tmp/claude-501/scratch-merge-plan` (created with
`git clone --no-hardlinks`, `node_modules` symlinked from main, `-c core.hooksPath=/dev/null` on
every git write), the two textual conflicts were resolved there, the touched test files were RUN,
and **one semantic (non-textual) conflict was found and fixed**. The scratch clone has been deleted.

Base: `main` **`a7d39601`** (docs checkpoint) on `88041036` (v1.4.0 + the three CI commits).
`origin/main` = `88041036`; main is AHEAD 1 and that is expected — the docs checkpoint stays local.

| lane | branch | HEAD trialled | commits | contents |
|---|---|---|---|---|
| handoff-c2 | `3d-scene/handoff-c2` | `ed778940` | 2 | U9, U9-2 |
| fill-collapse-2 | `3d-scene/fill-collapse-2` | `9aad87b8` | 13 | U5b, U5b-2/3, W-30b, U7, W-30c, U8, W-30d |
| fill-audit-2 | `3d-scene/fill-audit-2` | `79b626d2` | 4 | W-28b, W-10d-3, W-10d-2 |
| fill-audit-d2 | `3d-scene/fill-audit-d2` | `392696ac` | 7 | W-27c-0a-4/-4b/-5/-6, W-34, W-34b, W-35 |
| fill-audit-a2 | `3d-scene/fill-audit-a2` | `48ff98dc` **+ T2** | 6 (+T2) | T1b, W-36, W-33, W-36b, W-31 (ceiling only) |

All five confirmed `merge-base main <lane> == 47a5a755`. Trial result: **38 commits ahead of main,
2 textual conflicts, 1 semantic conflict, everything else auto-merged clean.**

---

## 1. Trial integration

### 1.1 Rebase or merge? — **MERGE. Do not rebase.**

The checklist's item 1 says "rebase every lane onto main". **Recommendation: overrule it and use
plain `git merge` per lane, exactly as round 1 did.** Reasons, in order of weight:

1. **A rebase replays 32 commits and re-asks each conflict per commit.** The two real conflicts
   (§1.3) sit in files that several lane commits touch in sequence; a rebase makes the integrator
   resolve the same collision three or four times, each time against a partially-replayed tree,
   with no way to run a test between them. A merge asks once, against the finished lane, and the
   answer can be tested immediately.
2. **The graphify hook problem is real and CLAUDE.md is explicit** — the post-checkout/pre-commit
   graphify hooks regenerate `graphify-out` mid-checkout and abort a rebase (`feedback_graphify_hook_rebase`).
   A rebase means running with hooks disabled across dozens of checkouts; a merge needs
   `-c core.hooksPath=/dev/null` on five commands.
3. **Merge preserves each lane's `## Bars changed` commit bodies verbatim**, which the audit's
   protocol treats as evidence. A rebase rewrites shas and invites squashing, which is precisely
   how checklist item 12's `910` → `5851` typo correction was supposed to happen — do that as a
   note in the merge commit body instead (§4, item 12).
4. Round 1 did seven `git merge`s and the method held; the only defect it missed (X-ray back
   density) was a semantic one a rebase would have missed identically.

**Method, verbatim:**
```
git worktree add /Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/integrate-r2 -b 3d-scene/integrate-r2 main
ln -s /Users/jayphi/Documents/github/vectura-studio/node_modules <worktree>/node_modules
# then, one at a time, in the order below:
git -C <worktree> -c core.hooksPath=/dev/null merge --no-ff --no-commit 3d-scene/<lane>
#   ...resolve...
git -C <worktree> -c core.hooksPath=/dev/null commit -m "merge: <lane> (<units>)"
```
Do **not** integrate in main's own working tree — main is dirty (§6) and CLAUDE.md's checkpoint
discipline forbids layering a second effort on top.

### 1.2 Merge order, and why

**`handoff-c2` → `fill-collapse-2` → `fill-audit-2` → `fill-audit-d2` → `fill-audit-a2`.**

- **handoff-c2 first (2 commits).** It is the smallest stake in the three-author collapse test and
  the three-author `params.js`. Landing it first means the big collapse-file merge (fill-collapse-2's
  +483) resolves against `main + U9` — the pairing the ledger says nobody had ever diffed — with
  nothing else moving.
- **fill-collapse-2 second.** It owns the roster (`scene3d-tone-laws.js`, `laws.json`,
  `build-tone-laws.js`) and `shadows.js`/`regions.js`. Landing the roster before the two lanes that
  *consume* it (fill-audit-2's `displayParams`, fill-audit-d2's panel) is what surfaced the semantic
  conflict in §1.4 at a point where it was cheap to fix.
- **fill-audit-2 third.** Its `context-bar.js` conflict is against fill-collapse-2's, and its
  `params.js` hunks against handoff-c2's — both already in the tree.
- **fill-audit-d2 fourth.** Its `scene3d.js` slices region merges against fill-collapse-2's collapse
  chain; its `params.js` and `scene3d-panel.js` touches are one-liners that land on top of the other
  three authors.
- **fill-audit-a2 LAST, deliberately.** It is the only lane whose HEAD will still move (T2 in
  flight) and it is the most nearly disjoint (`surface-fill.js` is its sole property). Merging it
  last means a late T2 costs one re-merge of one lane, not a re-run of the whole chain. **Plan for
  HEAD+1: nothing in §1.3/§1.4 changes** — T2 edits `surface-fill.js` + `scene3d-mark-laws-draw.test.js`,
  both single-author — but see §5.3 for the two files to re-run after it lands.

### 1.3 Conflicts — file, hunk, resolution, reasoning

**CONFLICT 1 — `src/config/context-bar.js`, one hunk, merge 3 (fill-audit-2).**

- Lines 259–323 of the merged file: an **add/add at the same insertion point**, immediately after
  `SCENE_FILL_STYLES.styleParams`. HEAD (U5b, fill-collapse-2) adds
  `SCENE_FILL_STYLES.effectiveLaw(survivorId, paramsBag)`; theirs (W-10d-3, fill-audit-2) adds
  `SCENE_FILL_STYLES.displayParams(rawValue, paramsBag)`. Git could not tell that both sides append
  a whole new function and both end on the same `};`.
- **Resolution: TAKE BOTH, in order — `effectiveLaw` then `displayParams`** — keeping each side's
  full comment block and closing each function with its own `};` (the post-marker `  };` in the
  conflict belongs to whichever function is written last).
- **Reasoning:** they are two different lookups on two different mechanisms and the ledger already
  says so (checklist item 6): `effectiveLaw` answers *"which law do the collapse sub-controls
  actually select, so which caveat do I show"* (config-tier, reads only `STYLE_PARAMS`);
  `displayParams` answers *"what should the picker DISPLAY for a bag whose `toneLaw` is still a raw
  folded id"* (seeds from `ALIASES`, returns the same object reference otherwise). Neither reads the
  other. Dropping either ships half a fix — U5b's caveat would vanish, or W-10d-3's UI lie would
  return. Verified after resolution: `node --check` clean; both symbols present exactly once; both
  consumer surfaces (`src/ui/panels/scene3d-panel.js:705,735`, `src/ui/shell/context-bar.js:1604,1620,1631`)
  call the merged file with no further edit.

**CONFLICT 2 — `tests/unit/scene3d-curved-density-sparse-end.test.js`, one hunk, merge 5 (fill-audit-a2).**

- The `torus + hatch + ladder` → no: the **`torus + contour + ladder at d=50` md5 row** only.
  HEAD carries `c049412aaed515dd6c82c91c53d0bd9f` (main's `1193cbe1`, which rewrote the file's
  `runMd5` helper to hash `normalizePaths(...)` — 4dp rounding, to kill arm64/x86_64 CI drift);
  theirs carries W-33's re-pin `5d5e4e87f98447a282188c182b243cf5`, measured with the OLD raw
  `JSON.stringify` helper because fill-audit-a2 branched before `1193cbe1`.
- **This is checklist item 10, and NEITHER SIDE IS CORRECT.** Taking HEAD's value drops W-33's
  contour turn-refinement coverage; taking W-33's value drops the CI-drift fix.
- **Resolution: keep main's `runMd5` mechanism (it auto-merged — W-33 never touched the helper),
  keep W-33's explanatory comment, and RE-MEASURE the value against the truly-merged source.**
  Measured in the trial by blanking the pin and reading the thrown value:
  **`bc212164fdc8e72486dcef4e200eaa8d`.** This **matches the W-33 reviewer's own reference figure
  exactly** — but it is now independently confirmed on the merged tree rather than taken on faith,
  which is what the reviewer asked for. The other **19 rows in the file pass UNEDITED**, which is
  the proof that W-33 is scoped to `mapper === 'contour'` and does not disturb the sphere/cone rows
  or main's rounding.
- Add a `MERGE NOTE (integration r2)` block above the pin recording all three values and the reason,
  following the file's own existing MERGE NOTE convention.

**Everything else auto-merged clean**, including the four files the ledger ranked as the highest
risks:

| file | authors | trial result |
|---|---|---|
| `tests/unit/scene3d-tone-law-collapse.test.js` | 3 (`e429cfc5` on main, U9, U5b-2/3 + U7 + U8) | **auto-merged, 93/93 GREEN** |
| `src/ui/panels/scene3d-panel.js` | 4 (U5b, W-28b, W-10d-3, W-35) | auto-merged; all four contributions verified present |
| `src/core/scene3d/params.js` | 3 (U9 shadow bag, W-10d-2, W-35) | auto-merged; all three verified present |
| `src/core/scene3d/shadows.js` | 1 in practice (W-30d only) | clean — checklist item 9's "third stake" never materialised |
| `src/core/algorithms/scene3d.js` | 2 (fill-collapse-2 shadow/footprint, fill-audit-d2 slices) | auto-merged clean |
| `src/ui/shell/context-bar.js` | 2 (U5b, W-10d-3) | auto-merged clean |
| `tests/integration/scene3d-fill-style-picker.test.js` | 2 | auto-merged, 164/164 GREEN |

**The collapse-file result retires checklist item 3.** The remaining undiffed piece — U5b-2/3's +69
against `e429cfc5` and against U9's four sites — resolves mechanically and the merged file passes
whole (93 tests, including the chunked U0 48-law sweeps, U9's four rewritten sites, U5b-2's
jargon/sentence tests, and U7's and U8's clusters). **No hand-merge is required. Run the file whole
anyway** (it takes ~11 minutes; it is the single slowest file in the repo).

### 1.4 SEMANTIC conflict found — `tests/unit/scene3d-fill-style-display-params.test.js`

This is the round-2 equivalent of round 1's X-ray regression: **no textual conflict, clean merge,
and a test that fails only because two lanes were never in one tree.**

```
FAIL tests/unit/scene3d-fill-style-display-params.test.js
  > G1 — every one of the 13 ALIASES entries: the seeded display value round-trips …
  AssertionError: expected 15 to be 13
```

- **Cause.** W-10d-3 (fill-audit-2) pinned `expect(Object.keys(R.ALIASES).length).toBe(13)` against
  the roster it could see. **U7 added a 14th alias** (`nesting`, `ampSpacing` ← `weaveDepth`) and
  **U8 a 15th** (`penDown`, `interlockWeave` ← `onePenDown`) on fill-collapse-2. Neither lane could
  observe the other.
- **Verdict: STALE ASSERTION, not a regression.** The loop underneath is generative over
  `Object.keys(R.ALIASES)`, so it covers 15 without any other edit; the companion
  `expect(checked).toBeGreaterThanOrEqual(13)` is deliberately a floor and stays put.
- **Resolution applied and verified: `13` → `15`, plus the test title, plus a `MERGE NOTE …
  BAR CHANGE` comment naming U7 and U8 as the cause.** Re-run: **3/3 GREEN.**
- **This is a genuine gain, not just a repair.** It is the first time W-10d-3's display seed has
  been exercised against U7's and U8's folds at all — and all 15 aliases round-trip through
  `displayParams` → `normalizeStyle` → `resolveToneLaw` back to their own folded id. That closes
  the cross-lane half of checklist item 6 by test rather than by argument.
- **Disclose it under `## Bars changed` in the merge commit body**: `13 → 15`, cause U7 + U8.

### 1.5 Semantic verification actually performed on the merged tree

Every file below was run in the foreground on the merged trial tree, one at a time. **No test was
edited to make it pass except the one stale count in §1.4.**

| file | result | what it proves |
|---|---|---|
| `tests/unit/scene3d-tone-law-collapse.test.js` | **93/93** | the three-author hazard is a non-event |
| `tests/unit/scene3d-fill-style-effective-law.test.js` | 4/4 | U5b-3's cross-check survives the `context-bar.js` hand-merge |
| `tests/unit/scene3d-fill-style-display-params.test.js` | 3/3 (after §1.4) | W-10d-3 × U7 × U8 |
| `tests/integration/scene3d-fill-style-picker.test.js` | **164/164** | U5b + W-28b + W-10d-3 + W-10d-2 in one picker |
| `tests/integration/scene3d-panel.test.js` | 37/37 | the four-author panel file |
| `tests/unit/scene3d-shadow-tone-law-uniqueness.test.js` + `scene3d-shadow-tone-law.test.js` | 26/26 | **U9b's re-pin target still passes at PICKER_IDS 33 — U9b is an improvement, not a blocker** |
| `tests/unit/scene3d-hlr-spatial-index-identity.test.js` | **6/6 UNEDITED** | the file that needed three re-pins in round 1 needs none here; checklist item 22's HLR half is discharged |
| `tests/unit/scene3d-curved-density-sparse-end.test.js` | 20/20 after §1.3 | checklist item 10 discharged |
| `tests/unit/scene3d-contour-slice.test.js` | 67/67 | fill-audit-d2's whole slices chain on the merged `scene3d.js` |
| `tests/integration/scene-xray-needs-fill.test.js` | **17/17** | **checklist item 11's x-ray hunt: the specific spec that "never finished" now finishes, green** |
| `scene3d-crosshatch-parity` + `curved-density-floor` + `hatch-density-angle-stable` + `fill-ruling-corners` | 78/78 | W-36 / W-36b / W-33 / T1b guards |
| `scene3d-charts-parity` + `mesh-invariants` + `box-density-bearing` + `mesh-self-occlusion` + `plot-safety` | 150 passed, 1 skipped | main's `1193cbe1` goldens and the round-1 fingerprints all hold |

Also verified on the merged tree, read-only:
- **`IDS 48 · PICKER_IDS 33 · ALIASES 15`** (picker offers 34 = `PICKER_IDS` + `ladder`).
- `node scripts/build-tone-laws.js` reproduces `src/config/scene3d-tone-laws.js` **byte-identical**
  from `docs/tone-laws/laws.json` — U5b-2's claim re-confirmed after the merge.
- `node --check` clean on all eight touched `src/` files.
- **No lane adds a new `src/` file**, so `index.html` needs no new `<script>` tag — only the version
  bump's cache-busters.
- **`tests/unit/zzz-t1b-perf.test.js` is already gone** (T1b's implementer folded and deleted it) —
  half of checklist item 5 is pre-discharged.
- **U5b's and U9's in-worktree reports/evidence relocate THEMSELVES.** They were committed at the
  correct repo-relative paths inside their worktrees, so the merge lands
  `docs/3d-audit/lane-reports/U5b-impl.md`, `docs/3d-audit/fill-audit/after/U5b/` and
  `docs/3d-audit/fill-audit/after/U9/` in main automatically. **No `git mv` needed** — the other
  half of item 5 is pre-discharged. Confirm with `ls -d` after the merge; do not re-copy them.

---

## 2. Version

**1.4.0 → 1.4.1** (plain semver patch; never reset the patch digit).

Lanes all still read `1.3.99` in `package.json`; main's `1.4.0` wins the merge with no conflict
(verified). The hook cannot fire in a worktree, so bump **once, by hand, on the integration branch,
after the last lane merges**:

```
node -e "const p=require('./package.json');p.version='1.4.1';require('fs').writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')"
npm run version:sync
```

**Expected diff, verified in the trial — accept nothing else:** exactly 3 files —
`package.json` (1 line), `src/config/version.js` (`Vectura.APP_VERSION = '1.4.1'`), and
`index.html` **446 changed lines / 222 `?v=` cache-busters**, zero `v=1.4.0` left. That 446 is the
same sed-style substitution round 1 saw at 1.3.99; it is not unrelated churn.

---

## 3. Docs contract

### 3.1 CHANGELOG.md — draft block, VERBATIM

`CHANGELOG.md`'s `## Unreleased` section is currently **empty**. Insert the following under it,
above `## 1.4.0 - 2026-09-06`. House style is `- **Bold lead sentence.** prose`, wrapped ~95 cols,
backticked identifiers, `(src/path.js)` citations inline.

```markdown
## Unreleased

### Added
- **3D Scene · Slices gains an End overlap control.** How far each depth-slice ring is carried
  past (or pulled back from) the object's silhouette, in pen widths (−2…+8, step 0.25). **The
  default is 0 and is byte-identical to previous builds** — nothing about an existing scene
  changes until you move the slider. Increase it for a continuous outer edge; decrease it to keep
  wet ink off the outline. Inert on faceted primitives (box, plane, pyramid), where slice ends are
  not smoothed. (W-35)

### Changed
- **3D Scene · Fill Style picker: two more near-duplicate options folded away (35 → 33).**
  `weaveDepth` now lives behind a **Nesting** control on Amplitude Spacing (`single` / `nested`),
  and `onePenDown` behind a **Pen down** control on Interlock Weave (one stroke per ruling / one
  pen-down per family — a real 198-vs-106-path plotting economy, not a picture difference). Both
  render exactly as before; ink is within 0.2% on the `ampSpacing` pair. Saved documents resolve to
  the surviving option automatically at load. `trochoidLoop` is deliberately NOT folded — it draws
  12% more ink with visibly different polygon shards, so it keeps its own row. **No forward
  compatibility: a file saved here opens as plain Ladder in an older build.** (U7, U8)
- **3D Scene · Fill Style caveats are written in plain language.** The picker's warnings for
  Dithered bundle mode and the Ink-width field floor now say what you will see and what to do
  about it, instead of quoting raw audit measurements. (U5b, U5b-2)
- **3D Scene · crosshatch draws a real crossing grid again.** The two crosshatch line families now
  split one shared coverage budget evenly instead of the second family receiving roughly a tenth of
  the first's. Measured gap ratio between the families falls from 5.4–31.2× to 0.81–1.06 across
  every primitive and density tested; total ink is essentially preserved (cylinder at Density 220:
  106 lines vs 108 before the audit, now split 52/54 instead of 94/10). (W-36)
- **3D Scene · a small imported mesh is no longer cap-limited in the Fill Style picker.** An import
  whose TOTAL face count is 12 or fewer can never present more than 12 camera-facing faces from any
  angle, so it now gets the full fill-style roster instead of the two options every import used to
  be restricted to. (W-28b)

### Fixed
- **3D Scene · shadows landing on other objects now follow the light.** A point, spot, or area
  light's shadow-receive footprint on another object's flat face used to be built from a fixed
  default direction; it now uses the light's real position. Directional lights are unaffected.
  (W-30b)
- **3D Scene · area lights keep their soft edge when partially occluded**, instead of losing all
  softening the instant the centre ray is blocked (`src/core/scene3d/regions.js`). (W-30c)
- **3D Scene · an ambient light listed before a point, spot, or area light no longer deletes that
  light's cast shadow** (`src/core/algorithms/scene3d.js`). (W-30c)
- **3D Scene · a torus now casts a visible, correctly-holed shadow onto other objects.** It
  previously cast no receive-shadow at all (the footprint's tone was sampled at the hull centroid,
  which for a torus lands in the ring's real hole), and the first fix for that filled the hole in
  solid. Both are fixed: the shadow renders, and the caster's own hole re-opens as unshadowed.
  A razor-thin torus — a large ring with a very thin tube — also no longer casts a blank shadow.
  **Documented limitation:** the blank-shadow case returns at a major:minor tube ratio of roughly
  465:1, which the UI cannot reach (the torus `sx` slider caps at 200) but a hand-edited or
  imported `.vectura`, or a compounded `transform.scale`, can. (W-30c, W-30d)
- **3D Scene · a saved scene whose cast shadow used a pre-collapse fill style renders that style
  again**, instead of silently falling back to plain hatch. (U9)
- **3D Scene · curved fill rulings and slice rings no longer show invented sharp corners.** The
  ring-refinement stop condition is now measured in device space — millimetres on paper, where the
  eye sees it — rather than in world space, and the capsule gains its own true cross-section
  instead of a chord approximation. Worst per-vertex turn on contour fill rulings falls from
  18.5–38.4° to at or under 8° everywhere; the capsule's slice rings from 297% over their analytic
  truth to 2.6%. A cone's apex chevron is unchanged, because that corner is exact geometry rather
  than an artefact. (W-33, W-34)
- **3D Scene · Slices keeps its evenly-spaced rings.** The crowding cull that merges ink at poles
  and saddles is now scoped to genuine multi-level pileups, so flat, evenly-spaced regions keep
  their rings: ink retention on a torus rises from 70.8% to 96.2%, and cone and cylinder are left
  untouched entirely. A degenerate near-zero-length ring also no longer burns the whole refinement
  budget subdividing itself into 513 invisible points. (W-27c-0a-4, W-27c-0a-6)
- **3D Scene · the Style tab and the context-bar Style flyout show the right sub-control value**
  for a fill law saved before the roster collapse. The canvas was always correct; only the picker's
  own display was stale. (W-10d-3)
- **3D Scene · a saved torus using the Origin Spiral fill style now opens as Ladder**, the
  picker's own default. Origin Spiral cannot be plotted cleanly on a torus — 87.8% of interior
  pixels are covered by solid ink wedges longer than two pen widths — so that one combination is
  migrated once, at load. Every other fill-style/primitive pair is untouched. (W-10d-2)
- **3D Scene · walked mark fills no longer stack near-duplicate stub marks.** Minimum spacing
  between adjacent marks rises from 0.03 to at least 0.50 pen widths, removing redundant ink a
  plotter would otherwise re-draw. (T1b)
```

**Numbers that must NOT be copied forward** (checklist item 20 — none of these appear above, keep it
that way): U8's report prints **426/426**, which is wrong twice over — the row is **51/51** and the
total is **447**. W-27c-0a-6's report says its gate "only ever fires on the torus's level-6 ring" —
**it fires on three rings** (`ellipsoid` L15 and `capsule` L4, camera-b only, both harmless).
W-30d's report calls its commit "the fix" for the thin-torus void — it raises the ceiling ~3.5–4×,
it does not remove it, which is why the block above says "documented limitation" instead.

**Units that get NO CHANGELOG line at all** (tests-only or measurement-only — state this in the
merge commit body so a reader does not think they were forgotten): **W-34b** (analytic-truth helper
correction, `src/` untouched), **W-36b** (guard re-expressed per family, tolerance unchanged at 3°),
**W-27c-0a-4b** and **W-27c-0a-5** (measurement + guards, `scene3d.js` untouched), **U9-2**
(guard + script relocation), **W-31** (MEASURED — the Rank-1 spike failed its own gate and was
rejected; **zero source diff**, a non-regression ceiling only).

### 3.2 README.md

1. **`### 1.4.1` release-note entry** at the top of `## Release Notes` (line 598; three-most-recent
   inline convention — 1.4.1, 1.4.0, and the next one down stay inline). Cover, in this order:
   crosshatch parity (W-36), the curved-corner fidelity cluster (W-33/W-34), the shadow-receive
   cluster (W-30b/c/d) with its documented limitation, the roster collapse to 33, End overlap
   (W-35), and a "Known open" line naming T2/T3, W-31b, W-32 Rank 3/4, F-14 and the nine frozen
   decisions.
2. **Correct the existing 1.4.0 sentence at lines 611–617** — it reads *"collapsed 13 near-duplicate
   options into 5 canonical entries (48 → 35 total)"*. Post-merge the roster is **48 → 33**, with
   **15 aliases across 7 collapse clusters**. Do not silently rewrite the 1.4.0 entry's history;
   append the update in the 1.4.1 entry and leave 1.4.0's own numbers as shipped, or footnote it.
   **Pick one convention and state it** — `PICKER_IDS` is 33; the picker *offers* 34 (`PICKER_IDS`
   plus `ladder`); `IDS` stays 48 forever. U8's own draft said "49 → 34", which is the offered
   convention; the block in §3.1 uses the `PICKER_IDS` series (35 → 33). Mixing them is how the
   README ended up disagreeing with itself.
3. **W-35's feature line** in the 3D Scene feature panel (~line 145), verbatim from its contract:
   *"Slices gains **End overlap** — how far each depth-slice ring is carried past (or pulled back
   from) the silhouette, in pen widths; default 0 = unchanged."*

### 3.3 In-app help — **W-35's help line has no home; decide, do not silently drop it**

The in-app Help Guide is `src/ui/modals/help-shortcuts.js` (F1, `openModal({ title: 'Help Guide' })`).
It contains **zero** occurrences of "3D", "scene", "slice" or "Fill Style" — there is no 3D section
to add a line to. Two honest options:

- **(a) Land it on the control itself.** `sliceEndOverlap`'s descriptor already exists at
  `src/ui/panels/scene3d-panel.js:448`; give it the trade-off sentence as help/tooltip copy:
  *"Increase for a continuous outer edge; decrease to keep wet ink off the outline."* This is where
  every other 3D param's help copy actually lives. **Recommended.**
- **(b) Open a new "3D Scene" tab in `help-shortcuts.js`** — correct per the documentation contract
  but it is a new UI surface, which is a unit, not a merge task.

**Do (a) at merge and file (b) as a follow-up.** No keyboard shortcut is added, so the shortcut list
is untouched. The related copy surfaces, for the record: `src/config/context-bar.js` (the picker's
`blurb`/`caveat`/`SIMULATED_NOTE`/`FACETED_NOTE` wording — where W-10d-2's help sentence belongs) and
`src/config/scene3d-tone-laws.js` (generated from `docs/tone-laws/laws.json`; **never hand-edit** —
edit the JSON and re-run `node scripts/build-tone-laws.js`).

### 3.4 plans.md

One entry under `## Done` summarising the merge (units landed, the two conflicts, the one semantic
conflict, "not pushed"). One entry at the top of `## Now` carrying the post-merge queue: **U9b +
W-10d-3b** (§4 item 15), the gallery rebuild, T2/T3 on fill-audit-a2, W-31b, W-35b, F1-placement.
Five/nine entries under `## Blocked on Jay` — the frozen decisions, listed in §7.

### 3.5 Also owed

- `docs/3d-audit/lane-reports/LEDGER.md`, `SESSION-SUMMARY.md`, `STILL-OPEN.md` — record the merge
  sha, v1.4.1, and move every closed unit's row.
- `docs/3d-audit/fill-audit/worklist.json` / `findings.json` — C-07 and C-08 resolved (survivors
  `ampSpacing`/`interlockWeave`, params `nesting`/`penDown`); `trochoidLoop` stays its own row;
  **plus the C-05 correction in §4 item 17b**.

---

## 4. The secretary's 23 merge-checklist items — disposition and command

Each item below is either **PRE-DISCHARGED** (the trial proved it), **DO** (with the command), or
**POST-MERGE UNIT**.

| # | item | disposition |
|---|---|---|
| 1 | rebase every lane onto main | **OVERRULED → merge instead.** §1.1. The intent (lanes must be integrated against v1.4.0, not 47a5a755) is fully met by the merge. |
| 2 | bump FROM 1.4.0 | **DO** — §2. `node -e "…'1.4.1'…" && npm run version:sync`. |
| 3 | hand-merge the collapse test FIRST | **PRE-DISCHARGED** — auto-merges, **93/93**. Still run it whole: `npx vitest run tests/unit/scene3d-tone-law-collapse.test.js` (~11 min, foreground). |
| 4 | re-verify every byte-identity/md5/fingerprint claim after the rebase | **PARTLY PRE-DISCHARGED** — §1.5's table re-ran the golden files and only ONE pin moved (§1.3 conflict 2). Complete it with `npm run test:ci`. |
| 5 | relocate in-worktree reports/evidence (U5b, U9); delete T1b's probe | **PRE-DISCHARGED, both halves.** Confirm only: `ls -d docs/3d-audit/fill-audit/after/U5b docs/3d-audit/fill-audit/after/U9 docs/3d-audit/lane-reports/U5b-impl.md && ! test -e tests/unit/zzz-t1b-perf.test.js && echo OK` |
| 6 | confirm `effectiveLaw` reads two distinct mechanisms | **PRE-DISCHARGED BY TEST** — §1.4: all 15 aliases round-trip through `displayParams` (shadow-bag raw pass-through) *and* `normalizeStyle`/`resolveToneLaw` (style-bag shim reconstruction), independently. `npx vitest run tests/unit/scene3d-fill-style-effective-law.test.js tests/unit/scene3d-fill-style-display-params.test.js` |
| 7 | ctxbar caveat for RAW folded ids | **DO — LIVE, IN THE APP.** The one behaviour no lane could test. `node scripts/dev-server.js 8460`; load a pre-collapse `.vectura` (or add an `object3d` leaf) whose style bag carries a raw folded `toneLaw` — e.g. `bundleDither`, `fineLadder`, `weaveDepth`, `onePenDown`; open the ctxbar Style flyout; **confirm the FOLDED law's caveat text is shown, not the survivor's silence**, and that the (i) popover blurb still shows the plain survivor. Screenshot it. Both halves now exist in one tree for the first time (`src/ui/shell/context-bar.js:1604`). |
| 8 | re-run U1–U5's five pairs through U7's multi-primitive × density harness | **DO — cheap, and it closes a real asymmetry.** The harness is the `describeSingleParamCluster` "multi-primitive × multi-density" block in `tests/unit/scene3d-tone-law-collapse.test.js` (sphere/torus/cone × low/med/max). Add the five U1–U5 survivor/folded pairs to it and re-run the file. Not a reject condition; a bar-strengthening. |
| 9 | `shadows.js` third stake | **PRE-DISCHARGED — never materialised.** Only W-30d (fill-collapse-2) edits it; handoff-c2's diff on that path is empty. Clean merge, `node --check` OK. |
| 10 | regenerate W-33's `torus + contour + ladder @ d=50` hash | **PRE-DISCHARGED — measured, not taken on faith:** `bc212164fdc8e72486dcef4e200eaa8d` on the truly-merged tree, matching the reviewer's reference. See §1.3 conflict 2. |
| 11 | W-27c item-1 contourSlice x-ray hunt, on an IDLE machine | **LARGELY PRE-DISCHARGED, finish it.** Both specs that "never finished" now finish green on the merged tree: `scene-xray-needs-fill` **17/17**, `scene3d-panel` **37/37**, `scene3d-contour-slice` **67/67**. **Still do one idle-machine confirmation run** of exactly those three plus `npx vitest run tests/unit/ --testNamePattern=xray`, and then **close the four-day-old unknown in the ledger** rather than carrying it again. |
| 12 | correct `910` → `5851` in `79b626d2`'s commit body | **DO, as a merge-commit note.** Because §1.1 recommends merge (not squash), the lane commit body cannot be edited without a rebase — so record the correction in the `merge: fill-audit-2 …` commit body: *"Correction to `79b626d2`'s body: the pre-fix originSpiral wedge render is 5851 points, not 910."* Also add to `docs/3d-audit/fill-audit/after/W-10d-2/README` (or the evidence dir's readme): *"`leaf-scene/*-exported-state.json` is not a single-key diff — session-random ids and seeds differ too."* |
| 13 | land W-35's docs contract | **DO** — §3.1 (Added block), §3.2 item 3, §3.3 option (a), §3.4. |
| 14 | W-35's four review follow-ups | (a) **record only** — no honest end-to-end monotonic oracle exists today (crowd-cull confound); the suggested tripwire shape is *"run count never drops by more than 1 between adjacent k steps on a non-self-occluding primitive"* — file it, do not write it at merge. (b) **DO** — one-line correction to `W-35-impl.md`: **`plane` is inert without the gate too; only box and pyramid demonstrate the claim.** (c) **PRE-DISCHARGED** — the four-author panel file auto-merged, 37/37. (d) **heed it**: `build-user-presets.js` has NO `--dry-run`; if you run it, check `git status` afterwards. |
| 15 | run U9b (+ W-10d-3b) on the integrated tree | **POST-MERGE UNIT — the first one to schedule.** Both halves now exist: `clampShadowToneLaw` present *and* `PICKER_IDS = 33`. Note the trial found `scene3d-shadow-tone-law-uniqueness.test.js` **26/26 green as-is**, so U9b is a bar-strengthening (offered set → offered × collapse options) rather than a repair — it does not block the merge commit. Scope unchanged: (a) the re-pin with old/new offered counts and collision count 0 under `## Bars changed`; (b) the shadow row excludes the `penDown` COMBINATION, not the bare id — pin `penDown:'perRuling'`, no sub-control, state it in the row note; (c) W-10d-3b, the `fineLadder`→`Ladder` label question at `shadows.js:2713`; (d) the survivor × sub-control live sweep. |
| 16 | apply U5b-2/3's CHANGELOG line + the ROUND2-BRIEFS housekeeping | **DO.** The line is folded into §3.1's `### Changed` block. Separately add `src/ui/shell/context-bar.js` to U5b's "Files ALLOWED" in `ROUND2-BRIEFS.md`. |
| 17 | the orchestrator's wrap-up set, on main | **DO, all four.** (a) `tests/unit/scene3d-mesh-self-occlusion.test.js:29` — the file passes 5/5 on the merged tree, so this is a **comment/bar reconciliation, not a failure**: the root cause it names (polygon-union) is the one W-25 disproved. Fix the text and the bar together. (b) `docs/3d-audit/fill-audit/findings.json:236` + `worklist.json` — replace "Byte-identical density-inert rows … visually identical" with **"near-duplicate; ink 1459–2202 mm on torus/hatch/med"**, and record **five distinct `SF.buildObject` outputs, `contFieldTouch` 3879.9 mm vs `contFieldSigmoid` 1459.0 mm (2.7×)**. (c) `docs/3d-audit/fill-audit/after/W-25/report.json:14` — replace "engaging only for small/thin regions" with **102/288 `trueSpiral` calls still floored at aspect 0.177**. (d) W-26 hygiene: `W-26-impl-2.md:424` still claims hatch's 1.2 bar "still measures higher" when the ramp fell **1.369 → 1.229 (−10.2%)**; and `tests/unit/scene3d-plot-safety.test.js:243,262`'s `q(0.98)` bar has no `## Bars changed` disclosure anywhere — write one. Hygiene item (c) of the original trio (`CROSS_SHARE_BASE` / `CROSS_DFMAX_BOOST_CAP` "empirically tuned") is **superseded by W-36**, which rewrote that constant — record it as part of W-36 instead. |
| 18 | rebuild the gallery **LAST** | **DO LAST, ORCHESTRATOR ONLY**, after every other item. `node scripts/audit/scene3d-assemble.js` → `scene3d-audit-findings.js` → `scene3d-before-after.js`. It was last built **2026-09-05 20:11** and predates every round-2 unit. Two re-shoots fold into this ONE rebuild, not separate runs: **W-32's re-shoot at CREATION defaults** (the "lines beyond the border" is the rig deserializing at `detail` 16; the app measures 0.50 pen against a 0.50-pen bar with zero endpoints over) and **W-28b's re-shoot with a taller or scrolled listbox** so all **9** flipping rows are visible, not just `End Shorten`. Expect the 47 unexplained byte-identical pairs to resolve. |
| 19 | relocate bespoke evidence scripts to `scripts/audit/` | **DO — and it is FOUR files, not one.** The ledger names only W-28b's; the trial found three more from fill-collapse-2. `git mv scripts/w28b-face-count-threshold-evidence.js scripts/w30b-footprint-wiring-evidence.js scripts/w30c-shadows-evidence.js scripts/w30d-shadows-evidence.js scripts/audit/` **then fix each one's root resolution**: all four compute the repo root as `path.resolve(__dirname, '..')` (w28b`:44`, w30b`:32`, w30c`:32`, w30d`:41`) and must become `path.resolve(__dirname, '..', '..')` — **exactly the one-`'..'` correction U9-2 made** (`scripts/audit/u9-shadow-resolve-evidence.js:42`). Re-run each and confirm byte-identical output, per that precedent. |
| 20 | numbers not to copy forward | **DONE in §3.1** — none of 426/426, "only the torus ring", or "the fix" appear in the drafted block. |
| 21 | CHANGELOG carries two documented limitations | **DONE in §3.1** — W-30d's ~465:1 thin-torus ceiling (UI-unreachable, `.vectura`/import-reachable) and W-35's byte-identical default of 0 are both stated. |
| 22 | guards resting on argument, not a re-run | **PARTLY PRE-DISCHARGED.** The HLR half is done: `scene3d-hlr-spatial-index-identity.test.js` **6/6 UNEDITED** post-merge. **Still owed: Unit D's own guard suite and the U0 48-law byte-identity sweep**, which W-30c's reviewer accepted on argument under machine contention. The U0 sweep is inside `scene3d-tone-law-collapse.test.js` and passed here (93/93) — say so explicitly in the ledger. Run Unit D's suite by name on an idle machine. |
| 23 | sweep BOTH cameras in the slices pass | **DO whenever re-verifying slices.** This audit paid twice for camera-a-only measurement (W-34's plan; W-27c-0a-6's safety-margin guard, which missed two of the three rings its own gate touches). Applies to item 11's x-ray hunt and to any re-pin in `scene3d-contour-slice.test.js`. |

---

## 5. Tests on the integrated tree

### 5.1 The run

`npm run test:ci` (unit + integration + e2e + visual + perf), **on an idle machine**, in the
foreground. Round 1's evidence says two things about this run and both still apply:

- **Run `test:e2e` with `--workers=1`.** Round 1 reproduced a 100%-deterministic hang on the
  default `workers: 2` under load (both workers finish all 56 `smoke.spec.js` tests, then the
  process stalls before printing the summary) and 0% serialized. Pre-start
  `node scripts/dev-server.js 4173` so `reuseExistingServer` finds it.
- **`scripts/run-vitest.js` has a documented benign RPC-timeout retry.** A single retry that then
  passes is not a failure; two different failures are.

Round-1 baseline to compare against (v1.3.99): unit 4947 passed / 44 skipped, integration 1945,
e2e 62 passed / 7 skipped, visual 99 passed / 13 skipped, perf 10. **Round 2 adds roughly 900 new
tests**, so expect unit and integration to rise substantially; a DROP in either is a signal.

### 5.2 Known intentionally-red / retired tests — reconciled

| test | expected state on the merged tree | action |
|---|---|---|
| Unit A's five intentionally-red ribbon-streak tests (`scene3d-ribbon-f1b-streaks.test.js:175`) | **retired in A3's favour, already on main.** No `intentionally RED` marker remains. | none |
| Unit F's one intentionally-red test (`scene3d-mesh-self-occlusion.test.js:29`) | **the file passes 5/5 on the merged tree.** It is a *comment/bar* debt, not a red test: the root cause it names (polygon-union) is the one W-25 disproved. | checklist item 17(a) — fix text and bar together |
| `scene3d-shadow-tone-law-uniqueness.test.js` | **26/26 green at PICKER_IDS 33** — the U9b re-pin is a strengthening, not a repair | U9b, post-merge |
| `scene3d-hatch-density-angle-stable.test.js` | **9/9 green** — W-36's 2/9 failure was fixed by W-36b, tolerance unchanged at 3° | none |
| `scene3d-curved-crosshatch-controls.test.js` | W-36b's report flags **3 pre-existing unrelated failures, ownership undecided** | **run it explicitly and decide.** If they are red on unmodified `main` too, they are pre-existing and get their own item; if the merge made them red, that is a STOP condition (§6). |
| `scene3d-fill-style-display-params.test.js` G1 | red without §1.4's `13 → 15`; green with it | apply §1.4 and disclose under `## Bars changed` |

**One test-file count is deliberately changed by this merge and nothing else is:** the alias-count
pin in §1.4. If `test:ci` demands any other re-pin, treat it as §6 stop condition 2 until proven
otherwise — the trial's targeted sweep found none.

### 5.3 After T2 lands on fill-audit-a2

Re-merge only that lane, then re-run these two files before anything else, because T2 edits the
same mark sink T1b did and the same `surface-fill.js` W-36/W-33 changed:
`npx vitest run tests/unit/scene3d-mark-laws-draw.test.js` and
`npx vitest run tests/unit/scene3d-curved-density-sparse-end.test.js` (the file carrying §1.3's
re-measured pin). Then the full `test:ci`. T2's brief already carries both secretary conditions
(re-derive every RED number on the current tree; re-measure byte-identity against the post-W-36
tree), so a T2 that lands honestly should not move either file — **if it moves the re-measured
`bc212164…` hash, that is a finding, not a re-pin.**

---

## 6. Stop conditions

Stop, do not "resolve creatively", and report:

1. **A conflict in a file this plan says merges clean.** The trial is a fact about these five HEADs.
   A new conflict means a lane HEAD moved (expected only for fill-audit-a2/T2) or the wrong branch
   was merged — re-verify `git merge-base` and the HEAD table in the preamble before proceeding.
2. **Any re-pin demanded beyond §1.3's one hash and §1.4's one count.** Round 1's lesson is that a
   fingerprint that moves in a merge is either a real interaction (disclose it, with the arithmetic)
   or a regression (find it). **Never widen a tolerance to pass a merge.** Blank the pin, re-measure
   against the merged source through the file's own helper, and write the reasoning inline as a
   `MERGE NOTE` — the round-1 convention.
3. **A `test:ci` failure that is absent on unmodified `main`.** That is the X-ray-class signature:
   a defect the merge created that no lane owned. Isolate it with instrumentation, remove the
   instrumentation, and confirm zero net diff — round 1's `MERGE-impl.md` is the worked example.
4. **The ctxbar caveat check (item 7) shows the survivor's silence instead of the folded law's
   caveat.** That is a live product regression against the standing ruling *"folding a law must not
   hide its measured caveat"*, and it is the one thing no lane could test. It blocks the commit.
5. **`npm run version:sync` produces anything other than the 3-file / 222-cache-buster diff in §2.**
6. **Any frozen decision (§7) starts looking like work.** Nine of them are Jay's. Do not implement.
7. **The e2e hang recurs with `--workers=1`.** Round 1's diagnosis (shared-machine contention) only
   holds if serializing fixes it; if it does not, it is a real regression.

## 6b. Rollback

The integration lives on a **new branch in a new worktree** and `main` is never moved until the very
end, so rollback is cheap and total:

- **Mid-merge, one lane wrong:** `git -C <worktree> merge --abort` (before commit) or
  `git -C <worktree> reset --hard HEAD~1` (after that lane's merge commit, and **only** with a clean
  tree — `git status --short -- . ':!graphify-out'` first, per CLAUDE.md).
- **Whole integration wrong:** delete the branch and the worktree. Nothing on `main` or on any lane
  branch has changed — every lane branch is untouched by a merge into another branch.
- **Before any destructive git op on a dirty tree:** `git tag recover-integrate-r2 $(git stash create)`
  first, and get Jay's explicit approval for the named operation. This is non-negotiable.
- **`main` is only fast-forwarded at the end, by Jay or the orchestrator** — the same discipline as
  round 1, which deliberately did NOT fast-forward. **Never `git push`** until Jay says so.
- **`graphify-out/` is generated**: in any conflict take either side and regenerate; keep the
  graphify hooks disabled for every merge command (`-c core.hooksPath=/dev/null`).
- Main's working tree is currently dirty with the secretary's own docs WIP (`STILL-OPEN.md`,
  `LEDGER.md`, `SESSION-SUMMARY.md`, `after/T1b/report.json` modified; sixteen untracked `after/*`
  evidence dirs). **Commit or stash that BEFORE the merge lands on main** — it is a second,
  unrelated concern in the same tree, which is exactly the collision CLAUDE.md forbids. Note the
  untracked set does **not** include `after/U5b/` or `after/U9/`, so the merge that creates them
  will not collide.

---

## 7. Frozen on Jay — do not implement at merge

§4 decision **1** (W-06 max density / T4) · **2** (`penStipple` / U6) · **3** (ground-plane density
after W-15c) · **4** (F1 "which white did you mean?") · **5** (W-27c-0a — which defect do you mean:
the thicker line, already inside one pen width at 0.783/0.849 mm, or the smear) · **6** (W-36's
budget convention — a three-way choice, not a yes/no) · **7** (F-14 graded: close as by-design, or
expose `FACET_MIN_RULINGS`) · **8** (W-34 Fix C, cone apex-band warping — a look change to exact
geometry) · **9** (W-32 Rank 3/4, refine the fill border to the true silhouette, which would satisfy
W-32 and W-35 together).

---

## 8. Post-merge order (recommended)

1. `test:ci` green, ctxbar caveat check (item 7) live-verified, version bumped → **commit, STOP.**
2. **U9b + W-10d-3b** as one unit on the integrated tree (item 15).
3. Item 8 (U1–U5 through U7's harness), item 19 (four script relocations), item 17 (the wrap-up
   corrections), item 11's idle confirmation run.
4. **The gallery rebuild, LAST and once** (item 18), with W-32's and W-28b's re-shoots folded in.
5. Then, and only then, resume lane work: T2 → T3 on fill-audit-a2, W-31b, W-35b, F1-placement.
