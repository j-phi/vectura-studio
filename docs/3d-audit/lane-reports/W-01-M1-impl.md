STATUS: DONE

# W-01 M1 — implementer report

Lane: fill-audit-a
Worktree: `.claude/worktrees/fill-audit-a` (branch `3d-scene/fill-audit-a`)
Base sha (start of this unit): `c861bf97d4d87ca07259cf3a2785ceae9674fd67` (WIP checkpoint, "unverified")
New sha (end of this unit): `9fa159f0` (docs-only finalize commit on top of c861bf97; no source change needed)

## Files touched

- `src/core/algorithms/scene3d.js` — already changed by c861bf97 before I started (not touched further by me): `CURVED_SPARSE_PITCH_BOOST` constant 6 → 4.1, comment rewritten to explain the M1 re-tune.
- `tests/unit/scene3d-curved-density-floor.test.js` — already changed by c861bf97 (not touched further): 2 pins re-updated for the new boost (sphere hatch d=10 4→7; crosshatch d=10 23,8→31,14).
- `tests/unit/scene3d-curved-density-sparse-end.test.js` — already changed by c861bf97 (not touched further): new "literal checkpoints (M1/M2)" describe block, 6 new tests sweeping sphere/torus/cone × hatch × {ladder, fineLadder} at Density 1/10/25/50.
- `docs/3d-audit/fill-audit-fixes/W-01.json` — **updated by me** this unit: root-cause writeup, test counts, byte-identity md5s for the M1 follow-up (previous content described only the original W-01 fix, not the M1 re-tune).
- `docs/3d-audit/fill-audit/after/W-01-M1/` (main checkout, not the worktree) — **new** this unit: 5 re-shot PNGs + `report.json`.
- `docs/3d-audit/fill-audit/index.html` (main checkout) — regenerated via `scripts/audit/scene3d-before-after.js` to pick up the new report.

I never touched `surface-fill-mono.js`, `mappers.js`, `scene3d.js`'s slice pass, or `hlr.js`. Note: the WIP commit c861bf97 (made by the prior agent, before my session started) DID touch `src/core/algorithms/scene3d.js` — this is consistent with the base W-01 commit (16c197d7), also in this lane, which established the same narrow `curvedSparseTonePitch`/`CURVED_SPARSE_PITCH_BOOST` code in that file as fill-audit-a's own scope. I made no new touches to that file myself; I verified what was already there.

## Decision: FINISH (not revert)

The WIP checkpoint was already a complete, correct fix. I verified it thoroughly rather than re-deriving it, then finalized the paper trail (`W-01.json`, evidence capture) since the checkpoint's own commit message says "unverified."

## RED proof (reproduced from the checkpoint's own new test file)

On the `CURVED_SPARSE_PITCH_BOOST = 6` tree (git-stashed), at Density 1/10/25/50:
- `torus + hatch + ladder`: `[4, 3, 4, 10]` — d=10 dips below d=1, **d=25 ties d=1 (the named M1 defect)**.
- `sphere + hatch + ladder`: `[5, 4, 9, 23]` — d=10 dips below d=1.

## GREEN (boost = 4.1, the checkpoint's fix)

`SF.buildObject` master-grid path counts at Density 1/10/25/50:

| combo | counts | ink (mm) |
|---|---|---|
| sphere + hatch + ladder | [4, 7, 13, 23] | [135.47, 192.84, 306.26, 626.36] |
| torus + hatch + ladder (**M1-named**) | [3, 5, 7, 10] | [258.87, 488.75, 699.49, 1052.68] |
| cone + hatch + ladder | [8, 12, 17, 37] | [431.95, 549, 851.77, 1748.73] |
| sphere + hatch + fineLadder | [6, 9, 13, 23] | [139.94, 213.73, 364.75, 620.11] |
| torus + hatch + fineLadder | [4, 6, 6, 9] | [430.8, 523.85, 648.2, 1033.21] |
| cone + hatch + fineLadder | [11, 14, 21, 37] | [527.4, 670.66, 1025.79, 1821.11] |

torus+hatch+ladder d=1(3) ≠ d=25(7): **the M1 tie is resolved**, and the sequence is strictly increasing. All six combos: count non-decreasing, ink strictly increasing.
One count tie survives (torus+hatch+fineLadder d=10/25 both 6, different ruling counts 7 vs 10 coincidentally banding to the same segment count) — ink differs (523.85 vs 648.2), documented as an open follow-up, not a defect in the M1-named combo.

## Tests run

Targeted brief list (8 files): `scene3d-curved-density-floor`, `scene3d-curved-density-sparse-end`, `scene3d-tone-algo-default`, `scene3d-form-ladder`, `scene3d-fill-even-spacing`, `scene3d-hlr-spatial-index-identity`, `scene3d-appdefault-lit-floor`, `scene3d-plot-floor-obj` — **77 passed, 25 skipped (pre-existing), 0 failed**.

Broader sweep — every file referencing `tonePitch`/`o6Pitch`/`hatchSpacing`/`masterGrid`/`curvedMasterFloorPen` I could find via grep, plus `scene3d-mark-laws-draw.test.js` (W-05/06/07 regression guard, same lane): `3d-shading-capability`, `geometry3d-enhancements`, `scene3d-appdefault-facet-fill`, `scene3d-faceted-hatch-density-angle-stable`, `scene3d-fill-span-verdict`, `scene3d-hatch-density-500`, `scene3d-hatch-density-angle-stable`, `scene3d-hatch-density-floor`, `scene3d-hatch-density-rescale`, `scene3d-hl-stage-roster`, `scene3d-shadow-tone-gradient`, `scene3d-tone-law-dispatch`, `topoform-scene-lighting-toggle`, `vectura-geometry-algorithms`, `scene3d-mark-laws-draw` (15 files) — **207 passed, 0 failed** (1 unrelated `vitest-worker: Timeout calling "onTaskUpdate"` RPC error under heavy concurrent-agent CPU load on the shared machine — infra noise, not an assertion failure; `[FillBoolean] polygon union failed on degenerate geometry` console lines in the same run are pre-existing `erode()`/A3 noise from `scene3d-tone-law-dispatch`'s 46-law sweep, unrelated to this fix).

**Total this session: 23 test files, 284 tests passed, 25 skipped, 0 failed.**

## Evidence — real app, not just unit counts

Captured from the worktree (port 8475) via `scene3d-capture.js --tier A --root .claude/worktrees/fill-audit-a --port 8475 --only '^(torus__hatch__ladder__(low|med|max)|sphere__hatch__ladder__(low|med))__a$' --out docs/3d-audit/fill-audit/after/W-01-M1` — 5 shots, all `status: ok`.

Full-render `pathCount`/`inkMm` (includes silhouette + pole lines the unit-test count above does not — a different, larger number, but the same monotone story):

| cell | pathCount | inkMm |
|---|---|---|
| sphere/hatch/ladder/low | 76 | 320.3 |
| sphere/hatch/ladder/med | 92 | 747.6 |
| torus/hatch/ladder/low | 67 | 383.9 |
| torus/hatch/ladder/med | 76 | 705.1 |
| torus/hatch/ladder/max | 114 | 2432.9 |

**md5 vs the pre-fix gallery (`docs/3d-audit/fill-audit/shots/A/…`):**
- `sphere__hatch__ladder__med__a.webp`: `14b9a50dfe7a4a50b682cc434fb06439` — **byte-identical** to before (as required: Density ≥ 50 untouched).
- `torus__hatch__ladder__med__a.webp`: `810585366d4a931ffcb01572b02a3cfc` — **byte-identical** to before.
- `torus__hatch__ladder__max__a.webp`: `29eb6995e24700d6a95659e04a5c4b72` — **byte-identical** to before.
- `sphere__hatch__ladder__low__a.webp`: `83ffdaf04d5214b528ec1d26c8e6f81f` — **differs** from before, where before-low's md5 (`14b9a50d…`) was previously identical to before-med — i.e. low and med were byte-identical pre-fix and are no longer, which is the F-01/M1 fix itself, confirmed at the real-app pixel level.
- `torus__hatch__ladder__low__a.webp`: `7c8a1297c31515d8baf98b0f7b157200` — **differs** from before (which tied med, `81058536…`), same story.

**What I saw (Read tool, all 5 PNGs):**
- `sphere/low`: 3 spiral rulings converging near a pole, clearly sparse.
- `sphere/med`: ~13-14 tightly-spaced rulings, a visibly denser, continuous spiral.
- `torus/low`: 2 sparse curves — one long open arc across the top, one small ellipse near the hole. Clearly the sparsest of the three.
- `torus/med`: ~7-8 concentric bands, a clean mid-density ladder.
- `torus/max`: ~30+ dense bands, correctly the densest.

The three form a real, visible low→med→max progression on both primitives — this is app-clean, not just harness-clean.

## Open follow-ups (unchanged from STILL-OPEN.md, not addressed here)

- **M2**: single-integer non-monotonicity off the four named checkpoints (e.g. d=8, d=10) is real and documented but out of scope for M1 — M1's bar is the four literal checkpoints only.
- torus+hatch+fineLadder's d=10/d=25 count tie (6==6, ink differs) — flagged in `W-01.json`'s `open_followups`, not fixed.
- W-26 (continuous ladder placement so gaps carry tone only) is queued next in this lane per the handoff, after this M1 finalize.

## Commits

- `9fa159f0` (worktree `fill-audit-a`) — docs-only: updated `docs/3d-audit/fill-audit-fixes/W-01.json` with the M1 root-cause writeup, test counts, and byte-identity md5s. No source/test change (c861bf97 already had the correct fix and tests).
- Evidence (`docs/3d-audit/fill-audit/after/W-01-M1/*`, `docs/3d-audit/fill-audit/index.html`) committed separately in **main** (not the worktree), per protocol's "run from MAIN so output lands in main's gallery dir."
