# T2-8b-4 — test-rig W_L remnant: MEASURED, STOPPED (trade reported; no code change)

Worktree `.claude/worktrees/fill-audit-a8`, branch `3d-scene/fill-audit-a8`, base `efcf62f1` (v1.4.5 + comment relabel). **No source or test file was changed; nothing committed.** `npm install` rewrote `package-lock.json` (libc fields only); left uncommitted.

Fixture: `algo.generate(params,null,null,BOUNDS)` 1200x1000 m=20 pen 0.3, mkTick, hatch, fillAngle 45, d=50, `DEFAULT_CAMERA`, one SUN az135/el45, **ground and backdrop DISABLED**, object ink only. Rig named per number: test = PRIMITIVE_PARAM_DEFAULTS only; create = + PRIMITIVE_CREATE_DEFAULTS.

## 1. Measurement
Test-rig cone/hatch spans x 582-618, y 479.3-526.8 mm (36 x 47.5 mm; the image is 566 x 740 px, ~15.6 px/mm). The W_L window [588,519,599,528] holds one bare component at >= 0.5 mm: **2.64 mm^2, bbox x 588-595.8, y 523.5-526, centroid (590.0, 524.7)** — a strip ~8 mm long and ~1-1.4 mm wide between the LOWER ENDS of a band of regular ticks and the base rim.

All chains that reach bcSide on the test rig (10 calls), with stop reasons:
| chain (boundary x,y; kB; dir) | I | result |
|---|---|---|
| (598.6, 525.4) kB14 -1 | 0.046 | ran 14 ticks to j=15, then the apex rule refused a 0.28 mm tick (< 1 pen, 0.3 mm; both ends stopped, LB 5.66). It lies at x 598-607, **right of** the remnant |
| (613.8, 523.1) kB14 -1 (the W_R chain) | **0.662** | `noSeed` at j=5 (no open seed in line with the band); I is 0.005 under the 2/3 highlight gate but the gate is NOT the stop |
| (582.8,520.5) kB14 -1; (583.1,518.3) kB15 +1 | 0 | `noSeed` at j=1 (far left, not the remnant) |
| (588.2,506.9) kB24 +1 | 0 | apex refused, j=1, len 0.35 vs LB 0.68 (ratio 0.51 > 0.5) |
| 5 chains at the top/right | 0-0.54 or 0.89-0.93 | `noSeed` j=1 or excluded as highlight (I 0.885-0.931) |
**No chain has a span end adjacent to the remnant.** Not highlight (the ticks there have I ~0), not the continuity guard, not the seed search, not admission. A labelled picture of the chain (`c1..c14`, green) sits beside the strip but the strip lies along the LOWER ENDS of ~35 regular ticks of neighbouring rulings.

**Cause.** Those regular ticks end 0.9-1.4 mm short of the rim: a dark-side tick's outer reach is capped at half a row pitch (`half()`: `min(0.5R - 0.5*PMINT, edgeDist...)`), and past the last real ruling the T2-8 wedge row only reaches a sliver (`MK_TICK_WEDGE_V = -0.92`). The open strip is ACROSS the band (between tick ends and the outline), not ALONG a ruling, so no continuation-chain (BC-E) can reach it. Tuning the wedge row does not help: `MK_TICK_WEDGE_V` -0.8/-0.6/-0.4/-0.2 give test W_L 2.88/4.89/4.89/4.89 mm^2 (worse) and B5 nonMono 1 at -0.8 to -0.4.

## 2. Why I stopped (the trade)
The only mechanism that reaches the strip is moving the regular ticks' outer ends to the envelope c_E = 0.6 mm from the outline ("ends evenly offset from the perimeter"). Simulated on the emitted paths (ends extended along their own direction until 0.6 mm from the drawn outline, ignoring neighbour ink):
- test rig W_L 2.66 -> **0.61 mm^2** (still above a 0.30 bar), whole-image bare >= 0.5 mm 27.15 -> 18.82; 84 of 285 ticks extended;
- **create rig** bare >= 0.5 mm 27.67 -> 21.12; 88 of 333 ticks extended — the create rig would NOT stay pixel-identical, and every object's master-grid ticks near every outline would change.
Doing it as a post-hoc extension (after the `tickSites` push) could keep the site records byte-identical, but it changes the drawn master ticks everywhere (tip contact, over2RP, B5-adjacent looks, all 12 goldens, the create rig). That is a policy decision for Jay, not a localized fix, so per the brief I am reporting the trade instead of forcing it. A narrower alternative (extending only ticks that end > 0.9 mm from the rim and lie beside a chain) was not built or measured.

## Bars changed
None. No bar, test, tolerance, population or golden was touched. (A test-rig W_L bar that fails on `efcf62f1` was not added: there is no fix for it to gate, and FILL on test cone/hatch (3.56) is unchanged, so it is not promoted.)

## Pre-existing red
None observed (no test was run: the tree is unchanged from `efcf62f1`, which merged green at v1.4.5).

## Pictures (looked at) — `docs/3d-audit/fill-audit/after/T2-8b-4/`
- `crop_testrig_WL.png` (BASE 8b8f275e | v1.4.5): the strip is a dark wedge along the rim under the lower ends of the regular band; the ticks stop ~1 mm above the outline; v1.4.5 differs from BASE only by the left chain, not in the strip. NEW = v1.4.5 (no change).
- `JAY_T28b4_testrig_cone.png`: whole test-rig cone, BASE | v1.4.5, same read; the create-rig cone is unchanged because nothing changed (identical to the T2-8b-3c pictures).

## Open for Jay
Extend regular tick outer ends to 0.6 mm from the outline (changes the master ticks on both rigs, create included)? If yes, it needs its own unit, bar set and re-pins.
