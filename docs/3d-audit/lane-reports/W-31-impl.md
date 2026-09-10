STATUS: MEASURED

# W-31 — impl report: crosshatch CELL SHAPE (Rank 3 shipped; Rank 1 spiked and rejected at the gate)

Lane: fill-audit-a2 · worktree `.claude/worktrees/fill-audit-a2` · port 8475 · branch `3d-scene/fill-audit-a2`.
Base -> new sha: `716b435b` -> `716b435b` (source unchanged; only a new test file + docs/evidence added).

## Process followed

`git status --short -- . ':!graphify-out'` and `git stash list` were clean at start (no other lane's WIP).
Read `AGENT-PROTOCOL.md`, `W-31-plan.md` in full, and the LEDGER.md W-31 rulings (standing ruling on the
§4.1a spike gate, Rank 2 forbidden, "never take Rank 2", W-33/W-36b ordering) before touching anything.

## §4.1a SPIKE — run first, per the binding condition (Rank 1 was NOT prototyped by the plan)

Implemented the minimal spike exactly as scoped (wrapped-angle branch only, gated to
`crossShare != null && isEvenLadder()`):

1. `probe()` gained per-sample `mmArr`/`wantArr` (local pitch and per-sample ladder-pair tone target),
   additive to its existing scalar `I`/`mmPerFrac` returns — every other caller unaffected.
2. `angleFamily`'s wrapped branch (`Math.abs(da) >= WRAP_MIN_DA`, the branch `fillAngle 45` takes on all
   five primitives) gained `lineAtWarped(baseFrac, warpArr)`: the same ruling, displaced along the family
   normal by `(warpArr[k] - mean(warpArr)) * period` per sample.
3. `emitContFamily`'s `walk()` carried a cumulative `Float64Array warpArr`, updated one step per sample
   (`warpArr[k] += clamp(wantArr[k]/mmArr[k], dfMin, dfMax)`, falling back to the scalar `df` where a
   sample was culled), with the scalar bookkeeping `f` advanced by the MEAN of the per-sample steps (so
   `maxN`/`guard`/`creep` and the family's count/ink are unchanged by construction). Each placed ruling's
   `warpArr` snapshot was stored and used at emission time (`fam.lineAtWarped(p.frac, p.warp)`), not the
   final (fully-accumulated) array.

**Measured on cylinder d=220 camera a, this unit's own base (`716b435b`, NOT the plan's `e31d8591` — the
plan explicitly requires re-deriving on our own base):**

| | col 0-.2 | col .2-.4 | col .4-.6 | col .6-.8 | col .8-1 |
|---|---|---|---|---|---|
| flat-tone BEFORE | 0.7256 | 0.8699 | 1.0033 | 1.1756 | 1.3400 |
| flat-tone AFTER SPIKE | **0.6357** | 1.0237 | 0.9919 | 1.1448 | 0.9396 |
| lit-rig AFTER SPIKE | **0.7749** | **0.8366** | 1.0593 | 0.9884 | **0.6575** |

Flat-tone: 4 of 5 columns move inside `[0.85, 1.18]`, but the outermost interior column (col 0-.2, n=2, the
column nearest the interior box's own edge) moves FURTHER outside — 0.726 -> 0.636. Lit rig: 3 of 5 columns
are outside the band. Per-window scatter also got WORSE, not better: interior out-fraction 0.421 -> 0.667,
measurable windows 76 -> 39 (fewer windows, more of them bad).

**Gate verdict: FAIL.** The plan's own binding condition is explicit: "If the spike does not bring all five
column medians inside `[0.85, 1.18]`, STOP and fall back to Rank 3." Four flat-tone columns clearing is real
progress (the shape genuinely responds to the mechanism — the crossDensityRatio=2 check below proves the
per-sample step is doing real work, not nothing), but the gate is all-five, not four-of-five, and the lit
rig and per-window scatter are both worse than before, not better. Per the standing ruling this is a clean,
honest STOP: the mechanism was reverted (`git apply -R` against the recorded diff; `node -c` confirmed
syntax-clean before and after; `git status --short` confirmed a byte-identical, zero-diff working tree
afterward) and **zero source diff ships**. The full reverted diff is preserved at
`/private/tmp/claude-501/w31-spike.diff` (session-local, not committed) and reproduced in full below for
the W-31b follow-up implementer, so Rank 1 does not need to be re-derived from zero:

```diff
diff --git a/src/core/scene3d/surface-fill.js b/src/core/scene3d/surface-fill.js
index 2c161e40..c99091b8 100644
--- a/src/core/scene3d/surface-fill.js
+++ b/src/core/scene3d/surface-fill.js
@@ -9781,7 +9781,39 @@
           at.steps = steps * len;
           return at;
         };
-        return { span: period, lineAt: lineAtWrapped, na, nb, da, db };
+        // W-31 (§4.1a spike): the SAME ruling, displaced along the family
+        // NORMAL by a per-sample offset instead of drawn at one uniform
+        // parameter offset. `warpArr` is the WALK's cumulative per-sample
+        // step array (one entry per sample of THIS family, same length at
+        // every frac because `len` above never depends on `c`/frac); the
+        // mean is subtracted so the ruling's average position still matches
+        // `baseFrac` (the walk's own scalar bookkeeping) and only the
+        // ruling's SHAPE bulges in/out with the local excess/deficit gap.
+        // Gated by the caller to the crosshatch pair only (`useWarp` in
+        // `emitContFamily`) — every other caller keeps using `lineAtWrapped`
+        // above, byte-identical.
+        const lineAtWarped = (baseFrac, warpArr) => {
+          const c = baseFrac * period;
+          const a0 = c * na; const b0 = c * nb;
+          const ta = (0 - a0) / da; const tb = (1 - a0) / da;
+          const t0 = Math.min(ta, tb); const t1 = Math.max(ta, tb);
+          const len = t1 - t0;
+          const n = warpArr.length;
+          let sum = 0;
+          for (let i = 0; i < n; i++) sum += warpArr[i];
+          const mean = n ? sum / n : 0;
+          const at = (tt) => {
+            const t = t0 + len * tt;
+            const idx = n > 1 ? Math.min(n - 1, Math.max(0, Math.round(tt * (n - 1)))) : 0;
+            const dOff = (warpArr[idx] - mean) * period;
+            return { a: clamp(a0 + t * da + dOff * na, 0, 1), b: wrap01(b0 + t * db + dOff * nb) };
+          };
+          at.steps = steps * len;
+          return at;
+        };
+        return {
+          span: period, lineAt: lineAtWrapped, na, nb, da, db, lineAtWarped,
+        };
       }
       // Perpendicular extent of the unit square → the offsets to sweep through.
       const projs = [0, na, nb, na + nb];
@@ -9838,6 +9870,16 @@
       const fam = (kind === 'angle') ? angleFamily(angleDeg) : null;
       const span = fam ? fam.span : 1;
       const lineAt = fam ? fam.lineAt : ((frac) => axisLine(kind, frac));
+      // W-31 (§4.1a spike): per-sample "warped" offset placement, gated to
+      // the crosshatch pair on its wrapped-angle branch ONLY (`fam.lineAtWarped`
+      // exists only there — the axis-aligned / onMeridianAxis paths are
+      // untouched and stay on the scalar `lineAt` above). `warpSt` is constant
+      // across the whole walk because `lineAtWarped`'s own `len` (the
+      // ruling's parameter length) never depends on `frac`.
+      const useWarp = crossShare != null && isEvenLadder() && fam && typeof fam.lineAtWarped === 'function';
+      const warpSt = useWarp ? Math.max(8, Math.round((fam.lineAt(0) || {}).steps || baseSteps)) : 0;
+      const warpArr = useWarp ? new Float64Array(warpSt + 1) : null;
+      const lineAtEff = useWarp ? ((frac) => fam.lineAtWarped(frac, warpArr)) : lineAt;
       // The parameter offset one unit of `frac` moves ACROSS the family, and the
       // direction the ruling itself runs. Together these are what turns a
       // parameter step into millimetres of screen (see `perpPitch`).
@@ -9891,7 +9933,7 @@
       // what the eye integrates — a parameter-weighted mean would let a
       // foreshortened pole outvote the whole lit face.
       const probe = (frac) => {
-        const at = lineAt(clamp(frac, 0, 1));
+        const at = lineAtEff(clamp(frac, 0, 1));
         if (!at) return null;
         // W-26 FOLLOW-UP FIX (found by this unit's own guard sweep, not named in
         // the brief): the probe's OWN numerical resolution — how finely it
@@ -9925,13 +9967,22 @@
         // this fix does not touch that line.
         const st = Math.max(8, Math.round(at.steps || baseSteps));
         const pts = [];
+        // W-31 (§4.1a spike): per-sample local pitch (`mmArr`) and per-sample
+        // tone target (`wantArr`), same length as `pts`/`st+1`, null where the
+        // sample is culled — used ONLY by the crosshatch-pair warped walk
+        // (`useWarp` below); every other caller still reads the scalar
+        // `I`/`mmPerFrac` returned below, unchanged.
+        const mmArr = [];
+        const wantArr = [];
         let iSum = 0; let wSum = 0;
         let mmSum = 0; let mmW = 0;
         let prevW = null; let prevS = null;
         for (let s = 0; s <= st; s++) {
           const pr = at(s / st);
           const smp = sampleAt(pr.a, pr.b);
-          if (!smp || smp.front !== wantFront) { pts.push(null); prevW = null; prevS = null; continue; }
+          if (!smp || smp.front !== wantFront) {
+            pts.push(null); mmArr.push(null); wantArr.push(null); prevW = null; prevS = null; continue;
+          }
           const scr = { x: smp.x, y: smp.y, I: smp.I };
           pts.push(scr);
           // The ruling's own world tangent, from the step just taken.
@@ -9961,10 +10012,23 @@
           const area = Math.max(1e-4, segLen) * Math.max(1e-3, finite(mm, 1));
           iSum += clamp(finite(smp.I, 0), 0, 1) * area; wSum += area;
           if (mm > 1e-6) { mmSum += mm * area; mmW += area; }
+          mmArr.push(mm > 1e-6 ? mm : null);
+          // Per-sample tone target — the SAME rule the scalar `want` below
+          // applies to the ruling's area-weighted mean `I`, applied here to
+          // this one sample's `I` instead. This is what makes the walk's
+          // step direction-independent (discharges class (c-2)) once it is
+          // read per-sample instead of per-ruling.
+          wantArr.push(isEvenLadder()
+            ? (crossShare != null
+              ? ladderPairWantedPitch(smp.I, crossShare.ratio, crossShare.role)
+              : ladderWantedPitch(smp.I))
+            : cfWantedPitch(smp.I));
           prevW = smp.world; prevS = scr;
         }
         if (!(wSum > 0) || !(mmW > 0)) return { on: false, pts };
-        return { on: true, pts, I: iSum / wSum, mmPerFrac: mmSum / mmW };
+        return {
+          on: true, pts, I: iSum / wSum, mmPerFrac: mmSum / mmW, mmArr, wantArr,
+        };
       };
       // ── ACROSS-FLOW CLEARANCE, MEASURED (Zander §4) ─────────────────────────
       // The seeding offset is the clearance in the MIDDLE of a ruling and a lie
@@ -10121,7 +10185,33 @@
               if (b) cfAddRad(fld, b.x, b.y, b.I);
             }
           }
-          placed.push({ frac: f, df, I: pb.I, want });
+          // W-31 (§4.1a spike): snapshot `warpArr` BEFORE this iteration's own
+          // update — that snapshot (built by every PRIOR iteration) is what
+          // `probe(f)` above just read via `lineAtEff`, so it IS this ruling's
+          // placed shape; store it for the final emission pass, which runs
+          // long after `warpArr` has moved on to later rulings. Then take one
+          // per-sample step per sample of `pb.mmArr`/`pb.wantArr` (falling
+          // back to the scalar `df` where a sample was culled), clamped to the
+          // SAME `[dfMin, dfMax]` rails as the scalar step, and advance the
+          // scalar bookkeeping `f` by their MEAN — so `maxN`/`guard`/`creep`
+          // and the family's count/ink are unchanged from the scalar walk.
+          const warpSnap = useWarp ? warpArr.slice() : null;
+          if (useWarp && pb.mmArr && pb.wantArr) {
+            const n = warpArr.length;
+            let sum = 0;
+            for (let k = 0; k < n; k++) {
+              const mm = pb.mmArr[k]; const wt = pb.wantArr[k];
+              let step = (mm != null && mm > 1e-6 && wt != null) ? (wt / mm) : df;
+              if (back) step /= backDensity;
+              step = clamp(step, dfMin, dfMax);
+              warpArr[k] += step;
+              sum += step;
+            }
+            df = n ? sum / n : df;
+          }
+          placed.push({
+            frac: f, df, I: pb.I, want, warp: warpSnap,
+          });
           prevPts = pb.pts;
           f += df;
         }
@@ -10148,7 +10238,7 @@
       if (!placed || !placed.length) return;
       nextFam('A');
       placed.forEach((p, i) => {
-        const at = lineAt(p.frac);
+        const at = (useWarp && p.warp) ? fam.lineAtWarped(p.frac, p.warp) : lineAt(p.frac);
         if (!at) return;
         // `pitchStep` is the ruling's OWN gap, not a family constant — which is
         // the whole difference between this family and every other one here, and
```

**Lead for W-31b:** the outermost-interior-column residual and the per-window-scatter regression both
point the same direction — a single per-sample step per ruling does not fully converge where the local
clearance varies most (near the interior box's own edge), and/or the walk needs 2+ correction passes there
(mirroring `contFieldAniso`'s own 2-iteration fixed-point correction, which this spike did not attempt).
Rank 2 remains forbidden (prototyped and rejected by measurement in the plan).

## RANK 3 — shipped

`tests/unit/scene3d-crosshatch-cell-shape.test.js` (new file) lands as a **non-regression ceiling**: C1
(flat-tone column-median cell aspect), C2 (within-family local-gap p95/p05 spread) and C5 (interior-window
measurability floor), pinned at TODAY's (`716b435b`) own numbers across 11 configs — nothing tightened,
nothing widened, no source change. Configs: `{sphere, cylinder, torus, ellipsoid, cone} x d=220 cam=a`,
plus `{sphere, cylinder, torus, ellipsoid, cone} x d=50 cam=a`, plus `sphere x d=220 cam=b` (the control that
already passes). A twelfth test proves oracle validity (see below).

**RED proof (oracle is not vacuous):** the identical 23 assertions, run unmodified via a scratch
`git archive` export of the pre-W-36 tree (`0930cb2d`, symlinked `node_modules`, deleted after
measurement) — **22 of 23 FAIL** there (family B was starved to 3-10 rulings against family A's 69-94 on
that tree, per the plan's own §1.6). This confirms the ceiling is a real, meaningful floor, not a tautology.

**GREEN:** all 23 assertions pass on `716b435b` (this unit's base, zero source diff).

**Oracle-validity proof (plan §3.4 mutation 3, the only one applicable — mutations 1/2 assume a landed fix,
which Rank 3 does not ship):** `crossDensityRatio=2` on cylinder d=220 cam a re-centres the measured column
medians at 0.356/0.437/0.500/0.566 (near `1/ratio = 0.5`), not near 1.0 — proves the oracle reads the dial's
documented sense rather than assuming aspect must always equal 1.

Today's numbers per config (n = samples in that column's fifth of the interior box; `null` = fewer than 3
samples of one family fell there):

| cell | col 0-.2 | col .2-.4 | col .4-.6 | col .6-.8 | col .8-1 | windows | spread A/B |
|---|---|---|---|---|---|---|---|
| sphere d=220 a | 0.833(n7) | 0.947(n24) | 1.008(n26) | 1.074(n24) | 1.222(n9) | 90 | 15.74/15.87 |
| sphere d=50 a | -(n0) | 0.898(n3) | 1.001(n3) | 1.052(n3) | -(n0) | 9 | 14.87/13.39 |
| sphere d=220 b | 1.022(n9) | 0.979(n23) | 1.002(n27) | 1.025(n24) | 0.974(n8) | 91 | 15.11/15.19 |
| cylinder d=220 a | 0.726(n3) | 0.870(n25) | 1.003(n18) | 1.176(n28) | 1.340(n2) | 76 | 9.76/9.45 |
| cylinder d=50 a | -(n0) | 0.891(n3) | -(n0) | 1.109(n4) | -(n0) | 7 | 9.00/9.41 |
| torus d=220 a | 1.124(n6) | 1.067(n25) | 0.939(n20) | 0.872(n24) | 0.992(n6) | 81 | 5.83/5.90 |
| torus d=50 a | -(n0) | 1.357(n2) | 0.923(n2) | 0.850(n2) | 1.309(n2) | 8 | 4.09/4.50 |
| ellipsoid d=220 a | 0.923(n4) | 1.021(n18) | 0.984(n16) | 0.963(n20) | 1.030(n5) | 63 | 12.97/13.99 |
| ellipsoid d=50 a | -(n0) | 1.021(n3) | 0.987(n3) | 1.005(n3) | -(n0) | 9 | 11.68/11.41 |
| cone d=220 a | 0.600(n5) | 0.710(n28) | 1.026(n22) | 1.439(n30) | 1.773(n5) | 90 | 16.09/18.67 |
| cone d=50 a | 0.610(n2) | 0.190(n1) | 0.795(n4) | 1.323(n2) | -(n0) | 9 | 8.35/11.79 |

Note torus and ellipsoid at d=220 are already inside `[0.85, 1.18]` on every column today (a real, shipped
configuration already square) — only cylinder, cone, and sphere still ramp; cone is worst (0.60 -> 1.77).

## Guards

Run foreground, one vitest invocation, targeted files (per AGENT-PROTOCOL "targeted, not the full suite"):

- `scene3d-crosshatch-parity` **37/37**
- `scene3d-hatch-density-angle-stable` **9/9** (already fixed by W-36b landing on this base — the ledger's
  "7/9" note is stale as of `716b435b`)
- `scene3d-ladder-uniform-field-spacing` **9/9**
- `scene3d-fill-span-verdict` **11/11**
- `scene3d-plot-safety` **5/5**
- `scene3d-fill-even-spacing` **12/12**
- `scene3d-curved-density-sparse-end` **20/20**
- `scene3d-fill-boundary-ends`, `scene3d-fill-ruling-continuity`, `scene3d-curved-density-floor` — all pass
- `scene3d-crosshatch-cell-shape` (new) **23/23**

All ten files above, run together: **190/192 passed, 2 skipped** (the 2 skips are pre-existing/expected).

⚠ **Disclosed, NOT caused by W-31:** `scene3d-curved-crosshatch-controls.test.js` is **15/18** on this
unit's own base (`716b435b`), BEFORE any edit of mine — verified by running it alone against a clean,
zero-diff worktree. The 3 failures are `Object.is` string-equality mismatches on
`"the default crossing family at angle 0 IS the parallels family"` for cylinder and torus (a third failure
also reported by the aggregate run). Reproducible deterministically across reruns (not a flake). This file
is outside W-31's file list (forbidden — belongs to whichever unit owns `angleFamily`'s non-wrapped/parallels
identity, likely a W-33 side effect since it lands on strings built from device-space points). W-31 did not
touch this file, did not cause this, and — since the shipped diff is empty — cannot have caused it. Filing
for the orchestrator to route (candidate: a W-33 follow-up, since `refineFillRunTurns` is the only thing
that changed device-space point strings recently).

## Bars changed

None. This unit ships zero source diff. The new test file `tests/unit/scene3d-crosshatch-cell-shape.test.js`
introduces NEW bars (a non-regression ceiling) rather than changing an existing one — no existing numeric
threshold, tolerance, count bar, or pinned fingerprint in any other test file was touched.

## Evidence

Captured from MAIN (`node scripts/audit/scene3d-capture.js --tier A --root .claude/worktrees/fill-audit-a2
--port 8475 --only '^(sphere|cylinder|torus|ellipsoid|cone)__crosshatch__ladder__(med|max)__(a|b)$' --out
docs/3d-audit/fill-audit/after/W-31`), served version confirmed `1.3.99` (matches the worktree's
`package.json`). All 20 named cells captured `ok`. `after/W-31/report.json` written.

Because Rank 3 ships no source fix, BEFORE and AFTER are byte-identical by construction — the capture is
simply today's app, shot once. (This is disclosed explicitly, per AGENT-PROTOCOL's "byte-identical pairs
must be explained.")

**LOOKED at native-resolution crops (PIL crop -> Read), saved to `after/W-31/crops/`:**

- `cylinder_max_a_left.png` / `_centre.png` / `_right.png` — Jay's own named panel. The **centre** column
  reads as clean, even diamonds. The **left limb** column is visibly crushed/squashed horizontally into
  tighter, flatter diamonds. The **right limb** column is visibly stretched/elongated into taller,
  more-open parallelograms. This is Jay's own complaint, seen directly: the SAME crosshatch mesh reads as
  squarish in the middle and rectangular at both limbs, in the SAME image.
- `cone_max_a_band.png` — a horizontal band through the cone's mid-height, left edge to right edge in one
  crop. Shows the ramp directly: squashed near the left silhouette, square through the centre, stretched
  near the right silhouette — matching the measured 0.60 -> 1.03 -> 1.77 column progression.
- `sphere_med_a_pole.png` — the chart-pole knot at the top. Both families visibly converge to a
  singularity; cells degenerate into radial spokes. This is excluded from C1 by the INTERIOR definition
  (middle 70% of the ink bbox) and is NOT this unit's target — filed as **W-31c**, not chased here.
- `sphere_max_b_interior.png` — the control that already passes (camera b). Cells read uniformly square
  across the entire visible disc, confirming the "already-square" baseline the ceiling protects.

## Follow-ups filed

- **W-31b** — Rank 1 (per-sample warped placement), resuming from this unit's spike diff and its failure
  mode (outermost-interior-column residual + per-window-scatter regression), rather than re-deriving from
  zero. Rank 2 remains forbidden.
- **W-31c** — the chart-pole knot (sphere/ellipsoid camera a). Different fix (pole capping / chart
  reparameterisation), not a spacing law. Already named in the plan §7; reconfirmed visually here.

## Files touched

- `tests/unit/scene3d-crosshatch-cell-shape.test.js` (new)
- `docs/3d-audit/lane-reports/W-31-impl.md` (this file)
- `docs/3d-audit/fill-audit/after/W-31/report.json` (new)
- `docs/3d-audit/fill-audit/after/W-31/manifest.A.1-1.jsonl` (new, from the capture script)
- `docs/3d-audit/fill-audit/after/W-31/shots/A/*.webp` (20 new files)
- `docs/3d-audit/fill-audit/after/W-31/crops/*.png` (6 new files, evidence crops)
- `src/core/scene3d/surface-fill.js` — **untouched** (spike implemented, measured, and reverted; zero diff
  ships)

No version bump (worktree; also no `src/`/`tests/` behavior change ships, only a new test + docs/evidence).
