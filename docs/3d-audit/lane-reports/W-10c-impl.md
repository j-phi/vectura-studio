STATUS: DONE

# W-10c impl report — originSpiral tone-by-omission below the plot floor

**Lane:** fill-audit-c
**Worktree:** `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-c`
**Branch:** `3d-scene/fill-audit-c`
**Base sha:** `78bbf3e8` (W-10b, 0.8x-pen floor, DONE/FU)
**Commit under triage:** `441af81f` "wip(scene3d): W-10c originSpiral tone-by-omission below the plot floor (unverified)" — WIP checkpoint left by a prior agent that died at the session limit. Tree was clean on pickup (`git status --short` empty, no foreign stash entries touching this lane).

## Task

Verify/finish or revert the WIP checkpoint 441af81f, which was supposed to fix the still-open W-10/W-10b residual: 10-12% of torus/cone originSpiral ring-to-ring gaps still under 1.0x pen, and the orchestrator's eye reading the torus lower-left radial fan as solid white wedges.

## What the checkpoint actually contains

`src/core/scene3d/surface-fill-mono.js` `lawSpiral` (originSpiral toneLaw): the floor is raised from 0.8x pen to the full **1.0x pen** (drawn rings never sit closer than one full pen width — plot-safe by definition). Tone that this floor would otherwise flatten is bought back per-angle: `localDuty = clamp(round(PLOT_MIN_PEN / wanted), 1, 4)` is computed at every angle from the tone-driven pitch `wanted` vs the floor; any angular arc whose duty is `>= L` gets `L-1` *additional* real emitScr passes retraced at the same floor-safe ring, restricted to just that arc (not folded into the shared seam-joined polyline, so the "no meta.weightScale" per-path-constant-width invariant holds). Net effect: no two drawn turns are ever closer than 1 pen (plot-safety), and lost density is restored by inking the same safe ring more than once in the flagged arcs, rather than by moving turns closer together (which the new floor forbids) or literally skipping turns (the brief's literal "tone-by-omission" framing — the shipped mechanism achieves the same safety+tone-preservation outcome via retrace-in-place instead).

`tests/unit/scene3d-origin-spiral-tonal-range.test.js`: the F-10 torus/cone gap assertions were tightened from "≤1% of gaps under 0.8x pen" to "≤1% of gaps under 1.0x pen" (a strictly harder bar than W-10b shipped), with header/comment updates recording the pre-fix (0.8x-floor, no retrace) measurements of 10.0%/10.4%.

## Tests — targeted, all passing

Ran (from the worktree, `vitest run`):

```
tests/unit/scene3d-origin-spiral-tonal-range.test.js   6/6
tests/unit/scene3d-mono-substrate.test.js             13/13
tests/unit/scene3d-mono-tone-gradient.test.js          5/5
tests/unit/scene3d-mono-wrap-foreshorten.test.js       3/3
tests/unit/scene3d-plot-floor-obj.test.js             12/12
tests/unit/scene3d-plot-safety.test.js                 6/6 (1 pre-existing skip)
tests/unit/scene3d-tone-algo-default.test.js           6/6
```
Total: 50 passed, 1 skipped, 0 failed.

## RGR proof (independently reproduced, not just read off the commit)

Exported `78bbf3e8` (pre-441af81f) to a scratch dir (`git archive 78bbf3e8 | tar -x`, `node_modules` symlinked to the worktree's), copied the *current* (441af81f) test file onto it unmodified, and ran it there against the OLD source:

- **RED at 78bbf3e8** (new 1.0x-pen bar, old 0.8x-floor code): torus 400/3991 = **10.0%** of gaps under 1.0x pen (bar ≤1%) — FAILS; cone 639/6136 = **10.4%** — FAILS. Numbers match the commit's own header comment exactly.
- **GREEN at 441af81f** (current worktree, unmodified): torus 0/n = 0%, cone 0/n = 0% — PASSES both.

**Tone-not-flattened check** (the brief's own oracle: sphere drawn-turn/ink count within ±15%): wrote a scratch measurement (`algo.generate` on the sphere fixture, fillDensity=50, hatch/originSpiral) against both trees:

| primitive | segCount pre→post | inkLen pre→post | Δ ink |
|---|---|---|---|
| sphere | 25581 → 26169 | 16583.9 → 16947.5 mm | **+2.2%** |
| torus  | 2310 → 2505   | 1475.3 → 1551.7 mm   | +5.2% |
| cone   | 3089 → 3119   | 2273.7 → 2289.3 mm   | +0.7% |

Sphere is well inside the ±15% bar — tone is not flattened by the new floor. Torus shows the largest real ink increase (the retrace passes doing actual work exactly where the floor previously engaged); cone barely moves (less floor-violation headroom there to begin with).

## Evidence

Re-shot `^(torus|cone|sphere)__(hatch|contour)__originSpiral__(med|max)__a$` (12 cells) from the worktree at port 8477 into `docs/3d-audit/fill-audit/after/W-10c/` (run from MAIN). Also shot the identical 12 cells against a scratch export of `78bbf3e8` (port 8478) for a true before/after diff (the existing top-level `shots/B/*` and `after/W-10/*` predate this specific 0.8x→1.0x change and only cover 5 of the 12 cells / the hatch mapper).

**Looked at the PNGs.** `torus__hatch__originSpiral__med__a` (byte-identical to `__max__a` and to the `contour`-mapper cells both before and after — pre-existing, this toneLaw owns its own geometry independent of mapper/density, unrelated to this fix): the previously-reported solid-white-wedge band in the lower-left/lower-right radiating fan is visibly thinner with more distinct tick separation after the fix. Pixel diff vs the true pre-any-W-10 baseline: 45115/320000 px changed (14%), concentrated at x:80–480, y:240–320 — exactly the fan band. This is a real but modest improvement (the fix targets specifically the ~10% of gaps that were under the new floor, not the whole fan) — matches the quantitative torus +5.2% ink number. Cone and sphere cells are visually near-identical pre/post at normal viewing size, consistent with their much smaller measured deltas (cone +0.7%, sphere +2.2%): neither primitive had as much floor-violation headroom to buy back. Sphere in particular still reads as a clean, evenly-spaced spiral with no visible defect, before and after.

No before→after pair is byte-identical (confirmed via md5 on all three primitives' hatch/med cell) — every primitive shows a real change.

Full detail, before/after image paths, and the byte-identical-pair explanation are in `docs/3d-audit/fill-audit/after/W-10c/report.json`.

## Decision

FINISH, not revert. All targeted tests green, RGR proof independently reproduced (RED 10.0%/10.4% at 78bbf3e8, GREEN 0%/0% at 441af81f), tone-not-flattened oracle met (sphere +2.2%, well under the ±15% bar), and the evidence photo shows a real (if modest) improvement in the flagged torus fan band with no regression on sphere/cone. No further src change was needed — `441af81f` already contains a complete, working fix; the worktree tree is clean (nothing left to commit there). Only the evidence directory and this report (both under `docs/3d-audit/`, in the MAIN checkout, per protocol) were added.

## Open follow-ups

- The mechanism is retrace-in-place ("tone-by-repetition" at a fixed safe radius), not literal turn-skipping ("tone-by-omission") as the brief's first framing suggested — functionally equivalent for the plot-safety guarantee (no two drawn turns closer than 1 pen), but a reviewer should confirm this reframing is acceptable rather than a scope drift.
- `originSpiral` remains density- and mapper-independent (med≡max, hatch≡contour, byte-identical) — pre-existing, not introduced or fixed by this pass; flagged for whoever eventually wires W-13 (spiral width/density).
- The torus fan-band improvement is real but modest (14% of pixels in that region changed); if the orchestrator's eye still reads residual white banding at full-size viewing, the next lever is raising DUTY_CAP (currently 4, measured max wanted duty ~3.6) or narrowing NANG further — not revisited here since the RGR bar and the tone-not-flattened oracle are both honestly met.
