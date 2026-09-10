STATUS: ACCEPT-WITH-FOLLOWUPS

# W-10d-3 review — Style tab / ctxbar sub-control DISPLAY value for a raw folded toneLaw

**Reviewer scope:** adversarial review of unit W-10d-3, lane `fill-audit-2`
(`.claude/worktrees/fill-audit-2`, branch `3d-scene/fill-audit-2`), pinned range
`a5812496..66d9092d` (includes the orchestrator's unverified WIP checkpoint `4ca6a507`,
reviewed as part of the range). Read-only in the worktree throughout — never edited,
stashed, or deleted anything there. All reproduction/mutation/stacking work done in scratch
exports (`/private/tmp/claude-501/scratch-W10d3-pre`, `-post`, `-stacked`), all deleted at
the end of this review, along with three throw-away probe test files I wrote into the
scratch trees only (never the worktree).

Read first, per the brief: `AGENT-PROTOCOL.md` §Reviewers, `W-10d-3-impl.md`,
`W-10d-3-plan.md`, the secretary's LEDGER.md conditions on this unit (row 21d, the
"RECORD CORRECTION"/"COMPLETES U5b" standing rulings, the W-10d-3b filing), `U5b-review.md`,
`U5b-2-review.md`.

## Verdict summary

The unit's own contract — the picker sub-control showing the wrong value for a raw folded
`toneLaw` — is fixed correctly, minimally, and RGR-proven exactly as reported: RED is real
value-mismatch RED (not a TypeError trap) at `a5812496`, GREEN is 152/152, the mutation
check reproduces the exact 5-test failure set the report claims, `params.js` and the shadow
bag are untouched, byte-identity holds, and every PNG I looked at matches the report's
narration. That part is a clean ACCEPT.

Two real findings keep this at ACCEPT-WITH-FOLLOWUPS:

1. **The "composes with U5b for free" claim is only HALF true, and I found the missing
   half by driving it live (condition 4 of my brief).** Stacking U5b's actual diff
   (`49475ccd`) onto this unit's fix restores the caveat on the **docked Style tab** — but
   **NOT on the ctxbar Style flyout** — for the exact same raw `bundleDither` document. This
   is a real, previously unstated gap in a claim that appears in the impl report, the plan,
   and a LEDGER standing ruling. Root cause and fix are below (§4). Not a fault of this
   implementer's own work — it is a genuine cross-lane wiring mismatch only visible by
   stacking both diffs and driving the real DOM, which is exactly what I was asked to do and
   what neither lane could do alone (U5b predates this unit; this unit's branch doesn't have
   U5b's file).
2. **The secretary's condition ("must be added to U5b-3's existing generative cross-check…
   rather than being given a private test") is not literally met**, for an unavoidable
   reason (that file does not exist on this lane's branch — U5b/U5b-3 are unmerged on
   `fill-collapse-2`), but the impl report's merge plan is a one-sentence intent statement,
   not a precise procedure, and — more importantly — **G1 alone does not close the drift
   risk the condition exists to prevent**: it pins `displayParams` against `resolveToneLaw`
   only (two-way), never against `effectiveLaw` directly. The transitive argument holds
   today (I verified it does, live), but the secretary explicitly asked for a direct
   three-way pin so a future change to any one of the three resolvers is caught without
   relying on the other two staying in lockstep. See §5.

Neither finding is a defect in the shipped display fix itself. Both are real, actionable,
and belong to the merge step, not a revert of this unit.

## Condition-by-condition, with exact numbers I measured

### 1. RED — real value mismatch, not a missing API

Scratch export of `a5812496` (`git archive`, `node_modules` symlinked from the worktree).
Copied the post-sha (`66d9092d`) test files in (the only way to run "new tests against old
code"). `npx vitest run tests/integration/scene3d-fill-style-picker.test.js`:

**4 failed / 145 passed (149)** — `R1` (`expected 'coarse' to be 'fine'`), `R2`
(`expected 'count' to be 'dither'`), `R3` (ctxbar, `expected 'plot' to be 'touch'`), `R4`
(`expected 'count' to be 'dither'`). All four are real value-mismatch assertions, never a
`TypeError`/`is not a function` — matches the report. `R1g`/`R3g`/`R5` pass at pre-fix as
expected (over-fix guard + canvas-already-right anchor).

`tests/unit/scene3d-fill-style-display-params.test.js` at pre-fix: **2 failed / 1 passed**
(G1 and G3 fail with `FS.displayParams is not a function`, G2 passes — pure config, no code
needed). This is the *expected* symbol-doesn't-exist-yet RED for a brand-new function, kept
distinct from the mutation-RED below, exactly as the report frames it.

### 2. GREEN 152/152 + mutation

Scratch export of `66d9092d`. Combined run:
**`tests/integration/scene3d-fill-style-picker.test.js` (149) +
`tests/unit/scene3d-fill-style-display-params.test.js` (3) = 152/152 passed.**

Mutation: stubbed `SCENE_FILL_STYLES.displayParams = (rawValue, paramsBag) => (paramsBag &&
typeof paramsBag === 'object') ? paramsBag : {}` (present-but-inert, identity-shaped) in the
scratch tree. Re-ran both files: **5 failed / 147 passed** — `R1`, `R2`, `R3`, `R4` (all real
value mismatches, e.g. `expected 'count' to be 'dither'`) and `G1` (`expected undefined to be
truthy` — the option-lookup fails since the seed never lands). **`R3g`, `R5`, `G2`, `G3`
correctly stayed green** — matches the report's own table exactly, including its honest
note that G3 passes trivially under this specific stub shape (an identity stub *is* the
identity function G3 checks for) and that this is exactly why G1's independent-oracle check
exists. Reverted the stub; `diff` back to the fix file is clean (0 lines).

### 3. The generative cross-check — shape, oracle, and the merge-precision gap

`tests/unit/scene3d-fill-style-display-params.test.js` G1 walks all 13 `ALIASES` entries and
checks, for each, that the seeded display value's descriptor `.law` agrees with
`Params.resolveToneLaw(Params.normalizeStyle({params:{toneLaw:id}}).params)` — the
independent oracle, computed via a completely separate code path (the compose-time
migration shim) that never sees `displayParams`'s output. `Params.resolveToneLaw`'s own
source (`params.js:810-831`) numbers its branches in comments: rule 1 (absent/non-string),
rule 2 (raw folded id, short-circuit), rule 3 (`activeCount === 1` → reconstruct), rule 4
(`activeCount !== 1` → pass through raw), rule 5 (bare test process). G1 exercises rule 3
specifically (the shim always produces exactly one active sub-param per alias, by
construction of `ALIASES`), confirming `displayParams`'s reconstruction agrees with the
shim's reconstruction on that branch. G2 confirms integrity (no `<select>` value without a
matching `<option>`). G3 confirms the no-op identity for every non-folded id plus
`undefined`/`''`/`'__garbage__'`. 13/13 agree, matching the report.

**On the secretary's condition** ("added to U5b-3's existing generative cross-check…
rather than given a private test"): I confirmed `tests/unit/scene3d-fill-style-effective-law.test.js`
(the U5b-3 file) does not exist anywhere on `3d-scene/fill-audit-2` — it lives only on
`3d-scene/fill-collapse-2` at `1e681432`, unmerged, and AGENT-PROTOCOL forbids touching
another lane's branch. A private test in this lane was therefore the only reachable option,
and the implementer's header comment (lines 18-28 of the new file) discloses this precisely
and correctly — this part is fine. What is *not* precise is the merge plan itself: the impl
report says only "written so it can be folded into fill-collapse-2's U5b-3 cross-check file…
at integration — same independent-oracle shape" and "noted, not merged, by this
implementer." That is an intent, not a procedure. More substantively: **folding G1's file
content into U5b-3's file, as currently written, still would not add the three-way pin the
condition asks for** — G1 checks `displayParams` vs. `resolveToneLaw`; U5b-3 checks
`effectiveLaw` vs. `resolveToneLaw`; neither checks `displayParams` vs. `effectiveLaw`
directly. The transitive argument (if both agree with the same third function on the same
inputs, they agree with each other) is logically sound and I verified by direct construction
that it holds today (§4) — but it is an inference, not the direct assertion the secretary's
condition calls for, and — as §4 shows — a resolver-level cross-check would not have caught
the wiring bug I found there anyway (it's a UI integration bug, not a resolver-agreement
bug). **Follow-up for the merge:** add one explicit assertion of the shape
`FS.effectiveLaw(alias.into, FS.displayParams(id, {toneLaw:id})) === id` for all 13 alias
ids into the merged file, alongside a live DOM regression test per §4.

### 4. The U5b hole — driven live, real finding

Per the brief, I drove this rather than reasoning about it from source. Built a stacked
scratch tree: `git archive 66d9092d` (this unit's final tree) with U5b's actual diff
(`git -C fill-collapse-2 diff 47a5a755 49475ccd -- src/config/context-bar.js
src/ui/panels/scene3d-panel.js src/ui/shell/context-bar.js`) applied on top via `patch -p1`
— all three hunks applied cleanly (one with a 2-line fuzz from the intervening W-28b
content, one with a 21-line offset, both textually clean, 0 rejects).

**Docked Style tab (real DOM, real app code, `UI.Scene3DPanel.build`) — WORKS.** Mounted an
`object3d` leaf with raw `{ toneLaw: 'bundleDither' }`, opened the Style tab: **the caveat
renders**, verbatim: *"A negative result, kept as one: waving the pass-count boundary made
long-wave moire worse, not better, than the plain bundleCount baseline (3.43 vs 2.90 RMS on
sphere·hatch), and R2 also dropped."* The Bundle mode sub-control independently re-confirmed
`'dither'` in the same stacked tree. Control case (raw `bundleCount`, the un-folded
survivor): no caveat, as expected.

Why this works: `scene3d-panel.js`'s `fillStyleControls` already had a local variable named
`styleParamBag` before either unit touched it (line 694 in `a5812496`,
`const styleParamBag = o.paramsBag || {}`). This unit's edit 2 *reassigns* that exact name
to the seeded value. U5b's own unmerged hunk (at `47a5a755..49475ccd`) computes
`const effectiveLaw = FS.effectiveLaw(law, styleParamBag)` — reusing that same
pre-existing name. So the two independently-authored hunks compose correctly here purely by
variable-name coincidence (which the plan calls "for free," and it is, on this one surface).

**ctxbar Style flyout (real DOM, real app code, `UI.ContextBar` + `pillByLabel('Style').click()`)
— DOES NOT WORK.** Same stacked tree, same raw `bundleDither` document, mounted through the
real context-bar shell and opened the flyout: `fly.querySelector('.ctxbar-fly-note.is-caveat')`
is **`null`**. `expect(caveat).toBeTruthy()` **fails**: `expected null to be truthy`.

Root cause, read directly from the stacked file (`src/ui/shell/context-bar.js`): U5b's
ctxbar hunk computes `const effectiveLaw = FS.effectiveLaw(law, params)` — using `params`,
the **raw write-source bag** (`{toneLaw:'bundleDither'}`, no sibling key) — **not** a
seeded bag. This unit's own edit 3 introduces `const dispParams = FS.displayParams(...)`
in the *same function*, but (a) under a different name than the panel's `styleParamBag`
coincidence, and (b) textually **after** U5b's caveat line, not before it. `effectiveLaw`
therefore never sees the seed on this surface: `bundleCount` (the survivor) has no caveat,
so nothing renders. This is a genuine, previously unstated gap in the "composes for free"
claim — the plan's own "Planner's own verification" section is honest that it only tested
"the panel caveat hunk" (singular), but the LEDGER's standing ruling ("Stacking the Rank-1
fix under a simulation of U5b's hunks makes the caveat render with zero extra code…") and
the impl report's "this fix composes with it for free once merged" both state it without
that scope, which reads as both surfaces.

**This is not a fault of W-10d-3's implementation as shipped** — U5b was never on this
branch, could not have been tested against, and the implementer's own hedge ("not
independently re-simulated in this run since U5b is not on this lane's branch") is honest
and correctly placed. It is a **required merge-time fix**: when U5b lands on top of (or
alongside) this unit, `src/ui/shell/context-bar.js`'s caveat computation must read the same
seeded bag the sub-control loop below it uses — e.g. hoist `dispParams` above the caveat
line and pass it to `effectiveLaw`, mirroring the panel's incidental-but-correct wiring —
and a live DOM regression test (mount the real ctxbar flyout, raw folded caveat-bearing law,
assert `.ctxbar-fly-note.is-caveat` present) should be added alongside the docked-panel
equivalent that already exists in U5b's own suite (`scene3d-fill-style-picker.test.js`
line ~1054, `'the caveat and mark-class note stay reachable without opening the (i)'`, which
today only exercises the **already-survivor** `bundleSubNib`, not a raw folded id — so even
U5b's own suite would not have caught this).

### 5. Shadow bag / params.js untouched

`git -C fill-audit-2 diff --stat a5812496..66d9092d`: **5 files** —
`src/config/context-bar.js` (+28), `src/ui/panels/scene3d-panel.js` (+7/-4),
`src/ui/shell/context-bar.js` (+13/-4), and the two test files. `src/core/scene3d/params.js`
does not appear. No shadow-surface file (`shadows.js`, the shadow tone-law rows in
`scene3d-panel.js`/`context-bar.js`) appears either. Read both UI diffs in full: the panel
edit is exactly the plan's edit 2 (one line, `styleParamBag` reassignment); the ctxbar edit
is exactly the plan's edit 3 (`dispParams` introduced, read-only, `params` untouched as the
write source in both the row loop and the `mixed:` closure). Both match the plan's proposed
diffs verbatim.

### 6. Render byte-identity

Bespoke §5 scene canvas crop: `md5(before-canvas.png) = md5(after-canvas.png) =
a1b3470e382f42b319440f14c154ba26` — reproduced directly, confirmed identical. Tier-A gallery
cell `box__hatch__ladder__low__a`: confirmed present in
`docs/3d-audit/fill-audit/manifest.A.1-1.jsonl` (`path: shots/A/box__hatch__ladder__low__a.webp`);
`md5(shots/A/box__hatch__ladder__low__a.webp) = 35369c77553170a1ee2969569ef63980`, matching
the report's claimed `main_gallery_md5` exactly. I did not independently re-run the capture
script from the lane worktree to reproduce `lane_reshoot_md5` (an expensive dev-server +
Playwright capture cycle) — given the diff in §5 proves zero render-path files were touched
and the claimed hash matches the file that exists today, this is adequately corroborated
without re-running the pipeline. Both pairs are correctly explained in `report.json` as the
*expected* result, not a false negative.

### 7. `## Bars changed` — honest

`git diff a5812496..66d9092d -- tests/` has exactly one `^-` line across both test files
(the diff header `--- a/...`), i.e. purely additive. No threshold, tolerance, count bar, or
pinned fingerprint touched anywhere in the range. "None" is accurate.

### 8. PNGs — looked at all of them

Read every PNG in `docs/3d-audit/fill-audit/after/W-10d-3/`:
- `before/after-docked-crop.png`: Fill Style unchanged ("Bundle · Count"); Bundle mode
  "Integer pass count" → "Dithered". Matches the report exactly.
- `before/after-ctxbar-crop.png`: identical transition and copy to the docked pair, same
  row layout. No caveat row in either (expected — U5b unmerged here; see §4 for what
  happens once it is).
- `before/after-contfield-crop.png`: Field metric stays "Screen metric" in both (over-fix
  guard holds); Field floor "Plot floor" → "Ink-width floor".
- `after-canvas.png`: real sphere, dithered-bundle hatch banding, selection gizmo overlay —
  consistent with a real running-app capture, not a synthetic fixture.
- `after-docked-full.png`: full real app screenshot (VECTURA.STUDIO chrome, Layers panel,
  v1.3.99 badge) showing Fill Style "Bundle · Count" / Bundle mode "Dithered" in situ —
  confirms this is the genuine running app, not a DOM-only harness capture.
No image contradicts its caption; no image is cropped in a way that hides a defect this
unit is responsible for (the caveat-row absence is a scope boundary, not a hidden defect,
and is correctly disclosed both in the report and reproduced independently by me in §4).

### 9. Merge notes — three-author file, hunk overlap

`src/ui/panels/scene3d-panel.js` is edited by three unmerged units this round: U5b
(`49475ccd`, fill-collapse-2), W-28b (`a5812496`, already merged into this lane's base), and
this unit. Read all three diffs directly:
- **W-28b vs. this unit:** W-28b's hunks sit at lines ~619-660, ~1310-1326, ~1687-1704,
  ~3945-3963, ~4117-4142 of the pre-W-28b file; this unit's single hunk sits inside
  `fillStyleControls` at the `styleParamBag` assignment (line 694 in the post-W-28b base,
  `a5812496`, ~38 lines past W-28b's nearest edit at line 656). Already merged into this
  lane's base — no live conflict.
- **U5b vs. this unit (the live hazard):** U5b's diff (against `47a5a755`) touches the same
  function at `@@ -695,10 +695,21 @@` (the `if (note.caveat)` block, ~12 lines after this
  unit's `styleParamBag` line). **Textually disjoint, git will still conflict** (adjacent
  context lines) — confirmed by `patch -p1 --dry-run`, which applied both this file's and
  `context-bar.js`'s U5b hunks cleanly with only line-offset fuzz, no rejects. Resolution is
  mechanical "take both, in order," exactly as the plan predicted — **but, per §4, the
  ctxbar hunk additionally needs a one-line content change at merge (read the seeded bag,
  not raw `params`), not just a positional splice.**
- **vs. main `e429cfc5`/`1193cbe1`:** both are test-only commits
  (`tests/unit/scene3d-tone-law-collapse.test.js`, CI-timeout/arm64-rounding fixes and three
  other golden-fixture files) — `git show <sha> --stat | grep -i "scene3d-panel\|context-bar"`
  returns nothing for either. **No hazard**: neither main commit touches any file this unit
  or U5b touches.

## Open follow-ups (for the merge owner, not this implementer)

1. **Fix the ctxbar caveat wiring when U5b merges** (§4): hoist a seeded-bag read above
   U5b's ctxbar caveat line in `src/ui/shell/context-bar.js` and use it in place of raw
   `params`; add a live DOM regression test mirroring the one I wrote (raw folded
   caveat-bearing law → real ctxbar flyout → `.ctxbar-fly-note.is-caveat` present).
2. **Add the direct three-way pin** the secretary's condition asked for
   (`FS.effectiveLaw(alias.into, FS.displayParams(id, {toneLaw:id})) === id`, all 13 ids)
   when `scene3d-fill-style-display-params.test.js` folds into
   `scene3d-fill-style-effective-law.test.js` at integration — not just the two independent
   two-way checks each currently has.
3. W-10d-3b (shadow picker cosmetic display) remains correctly out of scope here, queued on
   handoff-c2 per the standing ruling — confirmed not touched.

## Scratch cleanup

`/private/tmp/claude-501/scratch-W10d3-pre`, `-post`, `-stacked` and their probe test files
all removed at the end of this review; nothing left in any worktree.
