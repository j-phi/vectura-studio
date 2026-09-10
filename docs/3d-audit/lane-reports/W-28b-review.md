STATUS: ACCEPT-WITH-FOLLOWUPS

## Unit under review
W-28b (fill-audit-2, `.claude/worktrees/fill-audit-2`), pinned range **47a5a755..a5812496**
(single commit `a5812496`). Reviewed read-only via `git archive` exports of both shas into
`/private/tmp/claude-501/scratch-W-28b-pre` and `…-post` (node_modules symlinked from the
worktree), taken immediately per instructions before the W-10d-3 implementer's live edits could
land. Never read the live worktree after the archives.

## ORCHESTRATOR FLAG — resolved: real, not a defect, evidence is thin
The two "expanded" screenshots ARE visually near-identical, and that is correct, not a bug.
I read both PNGs directly (`shots/A-small-12face-expanded.png`, `shots/B-large-80face-expanded.png`):
the fixed-height `<select size=...>` listbox shows ~15 of the roster's 36 options, and of the 9
rows that flip state between the two cases (`endShorten`, `mezzoRegion`, `etfKang`, `defectSplit`,
`dutyConst`, `originSpiral`, `turingStripe`, `voronoiWeb`, `mazeFill` — all enabled only in case
A), only **one**, `End Shorten`, falls inside the visible crop. I confirmed it flips exactly as
report.json claims: full white "End Shorten" (enabled) in A vs greyed "End Shorten — no effect
here" (disabled) in B, with every other visible row byte-for-byte the same wording in both crops.
This is the fast path demonstrably reaching the rendered picker (not failing to), just captured
with a crop too short to show most of the difference. The implementer's own report already
disclosed this exact limitation ("not re-verified row-by-row here … 'End Shorten' is the one row
visible in both crops that flips state") — the disclosure is honest, not a cover for a gap I
found independently. See Follow-up 1.

## Condition-by-condition

**(1) RED at 47a5a755, for the right reason.** Copied the two post-sha test files onto the
unmodified pre-sha source tree (`scratch-W-28b-pre`) and ran them: 2 failed, 150 passed.
Both failures are `AssertionError: expected true to be false` at the exact new
`isCapLimited('solid','importedMesh', totalFaces)` assertions (fill-style-picker.test.js:377,
solid-cap-reachability.test.js:237) — i.e. pre-fix `isCapLimited` returns unconditional `true`
regardless of `totalFaces`, exactly the W-28 defect this unit fixes. Matches the implementer's
own "stash the two source files" RED claim, reproduced independently via archive instead.

**(2) Mutation — threshold flips the test, both directions.** In `scratch-W-28b-post`:
- `<= 12` → `<= 11`: the `totalFaces<=12` fast-path test (its `12` case) now fails
  (`expected false to be true` at fill-style-picker.test.js:377 / solid-cap-reachability.test.js:237).
- `<= 12` → `<= 13`: the `totalFaces>12` cap-stays-on test (its `13` case) now fails
  (`expected true to be false` at fill-style-picker.test.js:388).
Restored the source to the original `<= 12` afterward; `git diff` in the post scratch confirms
clean (matches original). Not a vacuous guard.

**(3) Threshold vs `MONO_MAX_FRONT_FACES=12` — front faces vs total faces: NOT a hole.**
Traced the render path in `scratch-W-28b-post`: `scene3d.js:2669-2671` counts `front` by iterating
`record.faces` and counting only entries flagged `.front === true` — a subset count of that same
array, never larger than `record.faces.length`. `mesh.js:578-586`'s `buildSolidBaseMesh` for
`type === 'importedMesh'` builds the render-time mesh as
`faces: mesh.faces.map((f) => f.slice())` — a literal 1:1 copy of `params.importedMesh.faces`,
with no re-triangulation or subdivision at render time (per-face deformers in
`applyPolyhedronDeformers` also push exactly one output face per input face). So
`record.faces.length === totalFaces` exactly, for an imported mesh, and `front <= totalFaces` is a
structural guarantee, not a probabilistic one — a 12-total-face mesh cannot exceed 12 front-facing
faces from any camera angle. The implementer's comment claiming this is correct engineering
reasoning, independently verified in the source, not just asserted.

**(4) engine.js touch — the one-line read granted, nothing more.** `git diff --name-status
47a5a755 a5812496` touches exactly 5 files: `src/config/context-bar.js`,
`src/ui/panels/scene3d-panel.js`, 2 test files, and 1 new script
(`scripts/w28b-face-count-threshold-evidence.js`). `engine.js` has **zero** diff lines — more
conservative than the granted allowance, not less; the implementer correctly found the existing
stored value reachable from the UI layer and used the exception not at all.

**(5) No rendering change.** `git diff 47a5a755 a5812496 -- src/core/algorithms/scene3d.js
src/core/engine.js src/render/renderer.js` returns 0 lines — every render-path file is
byte-identical between the two shas. Separately confirmed `isCapLimited`/`isReachableOn`/
`groups`/`facetedNote` are referenced nowhere in `src/core/algorithms/scene3d.js` or
`src/render/renderer.js` (only from `src/config/context-bar.js` and UI panel/shell files) — this
is a picker-labeling-only change with the render path provably untouched, which is stronger proof
than a sampled md5 comparison would have been.

**(6) 278/278 reproduced.** Ran all 10 named guard/target files myself in `scratch-W-28b-post`,
foreground, split across 3 vitest invocations (grouped to stay well under the 15-min single-file
budget): `scene3d-fill-style-picker.test.js` 142, `scene3d-solid-cap-reachability.test.js` 10,
`stroke-fill-style-control.test.js` 30, `obj-import.test.js` 15, `stl-import.test.js` 14 (= 211);
`scene3d-shadow-tone-law-uniqueness.test.js` 3, `scene3d-hlr-spatial-index-identity.test.js` 6
(= 9); `import-mesh-scene.test.js` 16, `scene3d-panel.test.js` 36,
`scene3d-panel-style-live-sync.test.js` 6 (= 58). Total **278/278, 0 failed** — matches exactly.

**(7) `## Bars changed` is honest.** Full diff review of `context-bar.js` and
`scene3d-panel.js`: no existing numeric threshold, tolerance, count, or pinned fingerprint was
touched. The new `<=12` fast path reads the pre-existing `MONO_MAX_FRONT_FACES=12` constant
(scene3d.js:2634, unchanged) rather than restating it. `isCapLimited`'s new 4th arg is additive and
backward-compatible: `Number.isFinite(totalFaces) && totalFaces<=12` — any absent/non-finite value
still falls to the old unconditional `true`, confirmed by the explicit no-4th-arg assertion in the
test file and independently by my RED reproduction (the un-migrated call shape is unaffected).

**(8) CHANGELOG line accurate; merge note vs main's e429cfc5/1193cbe1.** `CHANGELOG.md` has zero
diff in this range (not edited, per the report's disclosed deferral to the orchestrator). The
proposed line — `fix(scene3d): imported meshes with <=12 total faces are no longer
unconditionally cap-limited in the Fill Style picker (W-28b)` — accurately describes the actual
diff. Checked `e429cfc5` (touches only `tests/unit/scene3d-tone-law-collapse.test.js`) and
`1193cbe1` (touches `scene3d-charts-parity.test.js`, `scene3d-curved-density-sparse-end.test.js`,
`scene3d-hlr-spatial-index-identity.test.js`, `scene3d-mesh-invariants.test.js`) against W-28b's
5 touched files: **disjoint, no textual merge conflict expected against either commit.** One
caveat worth carrying forward: this worktree is pinned to 47a5a755, predating `1193cbe1`'s
rounding fix, so the 6/6 I (and the implementer) measured for
`scene3d-hlr-spatial-index-identity.test.js` was against the OLD exact-equality assertions, not
the current main-tip rounded ones — expected under the lane-pinning protocol, not a defect, but
the merge step must re-run that suite against main tip rather than trust this count verbatim.
Separately, LEDGER.md:669 / STILL-OPEN.md:253 already independently flag (secretary, same date)
that `scene3d-panel.js` now has three unmerged authors — U5b (`49475ccd`), W-28b (`a5812496`),
W-10d-3 (in flight) — requiring a hand-merge "take both, in order." This is already tracked
outside this review and confirms the implementer's own scope-note disclosure was accurate; not a
new finding, just corroborated.

## Follow-ups (do not block ACCEPT)
1. **Evidence quality.** Re-shoot `after/W-28b/` with a taller (or scrolled) listbox capture so
   all 9 rows that flip between case A and case B are visible in the PNG, not just `End Shorten`
   — the programmatic 11-vs-2 count is correct and independently reproduced here, but a reader
   looking only at the images today has to trust JSON to see 8 of the 9 differences.
2. Carry forward the already-tracked `scene3d-panel.js` three-author hand-merge (U5b / W-28b /
   W-10d-3) at merge time — not this unit's defect, already logged by the secretary.
3. Re-run `scene3d-hlr-spatial-index-identity.test.js` (and any other guard suite touched by
   `1193cbe1`'s rounding fix) against current main tip before merge, not just against this lane's
   pinned base.
4. Disclosed-and-accepted open scope item, unchanged from the implementer's own report:
   `src/ui/shell/context-bar.js` (the floating multi-select fly-out) still calls
   `FS.groups`/`FS.facetedNote` with no `totalFaces`, so a multi-selection including an imported
   mesh still gets the unconditional W-28 answer there. Confirmed untouched by this diff
   (`git diff --stat` empty for that file) — a real, disclosed, non-blocking gap.

## Verdict
ACCEPT-WITH-FOLLOWUPS. The fix is correct, safely reasoned (front-face-count-is-a-subset-of-total
is a structural guarantee, not a heuristic), backward compatible, tested with real RED/mutation
proof, touches no rendering path, reproduces 278/278 exactly, and discloses its own scope
extension and residual gaps honestly. The only material weakness is evidence presentation (follow-up 1) — the underlying claim is correct and independently reproduced, but the screenshots alone
under-support it.
