STATUS: MEASURED

# HLR sub-pen precision unit — measure-and-park

- **Lane:** handoff-c3
- **Worktree:** `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/handoff-c3`
- **Branch:** `3d-scene/handoff-c3`
- **Base sha → new sha:** `426cc5e4` → `426cc5e4` (unchanged — nothing committed)
- **Files touched:** none. `git -C <worktree> status --short -- . ':!graphify-out'` is empty before and
  after this unit.
- **Dev server:** started `node scripts/dev-server.js 8470`, confirmed `http://localhost:8470/index.html`
  200s, and `src/config/version.js` → `Vectura.APP_VERSION = '1.4.1'` matches the worktree's
  `package.json` (`"version": "1.4.1"`). Killed at the end of this unit.

## Brief

Ledger round-3 queue row 14, lane handoff-c3, briefed MEASURE-AND-PARK. Fold together two residuals
explicitly routed to the `hlr.js` owner: the W-25 imported-torus occluder seam (<0.05 mm) and
W-27c-0a-4's bridged micro-gap pair (0.0038 mm). Both were already an order of magnitude under a pen
width when filed; the brief and STILL-OPEN.md both say a stop-report is the likely honest outcome.

## (a) W-25 — imported-torus occluder-precision seam

- **Fixture:** `tests/unit/scene3d-mesh-self-occlusion.test.js` — the file's own generated coarse torus
  OBJ import (`MAJOR=25.5`, `U_STEPS=24`, `V_STEPS=12`, half the built-in torus's 48×24 tessellation),
  per-face self-occlusion oracle, `mapper === 'spiral'` branch (lines 395–456). This is the exact test
  that measured the original sub-0.05 mm seam at W-25 time.
- **Ran on current tree (426cc5e4), foreground, `timeout: 600000`:**
  `npx vitest run tests/unit/scene3d-mesh-self-occlusion.test.js` → **5/5 passed, 1528 ms** (no
  singleFork needed — well under the default pool's ceiling). The `[FillBoolean] polygon union failed on
  degenerate geometry` stderr lines are the documented pre-existing shared-machine noise, not failures.
- **Number in mm:** the file's own comment block (lines 424–456) records that this residual was
  RE-MEASURED at the round-2 integration merge by blanking the bar and reading the thrown value —
  **0 survivors** on the integrated tree, and **0 survivors on an unmodified-`main` scratch archive at
  the same point** — i.e. the seam had already closed to **0 mm** before this unit started, not during
  it. My run today reproduces that: `expect(survivorKeys.size).toBe(0)` for the `spiral` mapper passes
  on `426cc5e4`, and the bar is already the tight `toBe(0)` (not the old `<=2` slack), so there is no
  looser bar hiding a nonzero residual.
- **Number in pen widths:** 0 mm / any pen width = **0w**. Nothing to park beyond confirming it stayed
  closed.

## (b) W-27c-0a-4 — bridged micro-gap pair

- **Fixture:** `tests/unit/scene3d-contour-slice.test.js`, torus, `sliceCount=26`, default camera/rig,
  `V.Scene3D.Params.PRIMITIVE_PARAM_DEFAULTS.torus`. Two related probes on the same fixture:
  1. `extended micro-gap oracle: the re-scoped cull creates at most the one KNOWN, pre-existing,
     unrelated pen-width/clipping artifact` (line 1782) — compares the active render
     (`BOUNDS.penWidth = 0.3`) against an inert ground truth (`penWidth: 1e-6`) via
     `hasBridgingInertPath`, counting cull-created gaps that are actually pre-existing HLR-clipping
     artifacts, not crowding-cull regressions.
  2. `W-27c-0a-5`'s `reconstructTorusRings5(26)` — the torus's level-6 raw ring (`rawCount:3`), whose two
     near-duplicate raw points sit inside the numerical-hazard band the bridged-pair artifact traces
     back to.
- **Ran on current tree (426cc5e4), foreground, `--pool=forks --poolOptions.forks.singleFork=true`,
  `timeout: 600000` (Tier-1 slow file per ROUND3-RESUME-BRIEFS.md §0):**
  `npx vitest run tests/unit/scene3d-contour-slice.test.js` → **67/67 passed, 23.3 s** (well inside the
  600 s ceiling; singleFork was not even strictly required at this load, but used per the brief since
  this file is on the Tier-1 slow list).
- **Live measured numbers today:**
  - `extended micro-gap oracle`: `torusGaps = 1` (console: `W-27c-0a cull-created gaps (bridging-path
    oracle): torus 1`), asserted `<=1` — the bridged pair is **still present** on `426cc5e4`, bounded at
    exactly the one known artifact, same as when filed.
  - `W-27c-0a-5` level-6 ring: `{"level":6,"rawCount":3,"closed":false,"finalCount":3,
    "finalLengthMm":0.004099155900223327,"deviceMaxTurn":180,"roundsUsed":0}` — i.e. **0.0041 mm** total
    drawn length for the near-degenerate ring that carries the raw 0.0038 mm point separation. (Note:
    W-27c-0a-6 already fixed this ring's Catmull-Rom *non-convergence* — `roundsUsed` is now a real 0,
    not the old 8-round/513-point balloon — but that fix is orthogonal to the bridged-pair pen-width
    artifact itself, which the file's own comments (lines 1767–1781) root-cause as a **pre-existing
    HLR-clipping-bias artifact** present even with `crowdGrid` forced to `null`, i.e. independent of any
    W-27c-0a crowding mechanism.)
  - Pen width used throughout this fixture: `BOUNDS.penWidth = 0.3` (`tests/unit/scene3d-contour-
    slice.test.js:17`), the same 0.3 mm printed in the engine-pipeline O2 sub-bar output
    (`"penWidth":0.3`).
- **Number in mm:** the raw gap is documented (and unchanged since W-27c-0a-4 filed it) at **0.0038 mm**;
  the ring's total drawn length is **0.0041 mm**.
- **Number in pen widths (pen = 0.3 mm):** 0.0038 / 0.3 = **0.0127 w** (raw gap); 0.0041 / 0.3 = **0.0137
  w** (drawn length). Both **~1.3% of one pen width** — an order of magnitude under the 0.1w park
  threshold, exactly as filed.

## Verdict

Both residuals measured **≥10× under the 0.1-pen-width park threshold** on the current tree
(`426cc5e4`):

| residual | mm | pen widths (0.3mm pen) |
|---|---|---|
| W-25 imported-torus occluder seam | 0 mm (fully closed) | 0w |
| W-27c-0a-4 bridged micro-gap pair | 0.0038 mm (raw gap) / 0.0041 mm (drawn) | 0.0127w / 0.0137w |

**PARKED.** No source change proposed. No RED oracle needed — no defect crossed the 0.1-pen bar that
would justify a hlr.js fix. This is the expected and honest outcome for a measure-and-park unit.

## Bars changed

None. No test file was edited; both oracles' existing bars (`toBe(0)` for W-25's spiral survivor count,
`<=1` for the extended micro-gap oracle) were read, not touched.

## Evidence

None re-shot. Per protocol, a re-shoot is only required when a defect ≥0.1 pen is found; neither residual
qualifies. No `after/HLR-subpen/` directory was created.

## Commit

None. `git -C <worktree> status --short -- . ':!graphify-out'` is clean at `426cc5e4` (same as base sha
— no commit was made).

## Follow-ups

None opened. Both residuals remain documented in `docs/3d-audit/STILL-OPEN.md` at their existing
sub-0.1-pen sizes; nothing new to file.
