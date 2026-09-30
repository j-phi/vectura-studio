# T2-8b adversarial review (lane fill-audit-a6, HEAD 9d2d3f54, diff b8dc93fe..HEAD)

Reviewer: Sonnet. Read-only on src and tests. Nothing committed.

## Verdict: ACCEPT-WITH-FOLLOWUPS. No finding blocks the merge.

## Checks

1. **Bars changed vs code.** `git diff b8dc93fe HEAD -- tests` removes only 5 lines: the `law='mkTick'` parameter plumbing in `buildSceneParams`/`renderCellHooked`, and a null-guard on `stat.tickField.rowPitch`. No threshold in a pre-existing test changed. The rest of the diff is additions: new BC-E block (135 tests), the helper functions, 7 re-pinned `EXPECTED_SIGNATURE` entries (plus the old hashes kept as `PRE_T28B_SIGNATURE`), and a `console.log` in the banding test. Every entry in "Bars changed" matches the code. No unlisted bar change. (The T2-8b-3 impl "old to new" wording refers to intermediate commits; against main the block is all additive.)
2. **bandC ceilings.** `PRE_RANK1_BANDC` is untouched. The banding test only gained a `console.log`. Banding 22/22 pass.
3. **Mutations, run by me** (12 cells, mkTick, create and test rigs, d=50, ground off, object ink only):
   - Flush removed: 7 of 12 signatures return to the pre-T2-8b hashes (test sphere/contour, test torus/contour, test cone/hatch, create sphere/hatch, create sphere/contour, create torus/contour, create cone/hatch). The other 5 stay identical. It trips.
   - Apex flag check removed from `scene3d.js` (every run may go to 0.3 mm): sub-0.6 mm fills appear on test torus/hatch (8) and test torus/contour (4). Shipped has 0 there. CRUMBS trips.
   - nobisect: `vitest -t nobisect` passes. That test asserts `E.range > 0.10 || B.range > 0.10` on both rigs, so the mutant trips. I did not read the printed ranges: vitest swallows the console output. The impl reports 0.127/0.239 and 0.316/0.141.
   - Shipped hashes I measured match the pinned `EXPECTED_SIGNATURE` prefixes on all 12 cells.
4. **MIN_RUN_MM exemption** (`scene3d.js:3400-3405`, `4849-4850`).
   - Only `bcSide` sets `mkApexRun` (`surface-fill.js:6809`, `7521`). The flag is set only when `apexTick` is true, and it is cleared straight after `place()`.
   - Only mkTick has `shape: 'tick'`, and the queue is gated on it. Other algorithms, back-face lines, highlight lines and the hidden/x-ray loop never pass `apexMin`.
   - Isolation: 112 cells (8 non-mkTick laws sampled from PRODUCTION including `none`, x 8 mappers x cone and torus, create rig) produced identical signatures between HEAD and base `surface-fill.js` + `scene3d.js`. 0 diffs.
   - Downstream, tested on the real create cone/hatch output (333 fills, 3 apex ticks: 0.574, 0.326, 0.504 mm). The GeometryUtils simplify (Visvalingam and RDP, tol 0.2) keeps all 3. `hardClipExportPaths` keeps all 3. The default export pipeline does not drop them.
   - **Follow-up F1, non-blocking.** The optional engine `filter` step (default off) with `removeTiny` uses a 0.5 mm floor. It would drop the 0.326 mm tick. The export-modal Min Length option does the same. So the apex fix is invisible when a user turns those on. This is by design, but it is not documented.
   - **Limitation.** I could not get the full engine or SVG path to generate apex ticks: the engine scene I built gave 213 fills and 0 sub-0.6 mm fills, so it did not reproduce the fixture. The impl also said this stage was "Not verified". I verified the individual downstream functions only, not a full SVG export.
5. **Test runs, final tree, foreground.** spacing-tone 135/135, mktick-wedge 57/57, mktick-banding 22/22: 214/214 passed (213 s). Second batch, foreground: band-purity, mark-laws-draw, runaway, one-pen-down-reachability, silhouette-contiguity, fill-ruling-continuity, integration scene-xray-needs-fill = 7 files, 121 passed, 1 skipped (the pre-existing skip in fill-ruling-continuity). **Not re-run by me:** tone-law-collapse (121) and integration fill-style-picker (177): they ran past the 10 min tool limit twice. I rely on the impl's report for those two.
6. **Code quality.**
   - Dead code removed as claimed: `mkClipArm.e`, `mkEdgeOK`, `MK_TICK_BC_REANCHOR_J`, `mkMainDrawn`, the SEC/BC names. `grep` finds none. Every `MK_TICK_BC_*` constant, `mkMainRun`, `mkLastRun`, `mkApexRun` and `mkMinOverride` is used at least once beyond its declaration.
   - **F2, cosmetic.** Some comments in the T2-8b-3 code carry the "T2-8b-2" label (`surface-fill.js:2849`, `7664`, `7716`, `13059`). They describe mechanisms that BC-E kept, so this is a naming carry-over only.
   - **F3, minor.** The exemption is per flagged line and applies to its clip pieces: an occluded piece of an apex run that is 0.3 to 0.6 mm long is emitted (`scene3d.js:3405`). It is bounded and harmless. The `apexMin` floor is 1 pen.
   - **F4.** The worktree has an uncommitted `package-lock.json` change (30 deletions). It was there before my first command. Do not stage it with this lane.

## Findings summary
- F1 export `filter`/`removeTiny` drops sub-0.5 mm apex ticks when enabled (default off). Non-blocking, document it.
- F2 stale "T2-8b-2" labels in comments. Non-blocking.
- F3 clip pieces of an apex run get the exemption. Non-blocking.
- F4 stray `package-lock.json` change. Do not commit it with the lane.
- Not verified: full engine and SVG export with real apex ticks.

