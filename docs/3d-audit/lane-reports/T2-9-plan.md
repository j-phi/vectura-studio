# T2-9: plan. mkTick bends, seam gaps, overlaps and the test-rig W_L (Jay's markup, 2026-10-04: "Fix these" + "Also the testrig inconsistencies")

Planner (Opus), read-only. The orchestrator writes this to MAIN `docs/3d-audit/lane-reports/T2-9-plan.md` verbatim.

- **Base:** `.claude/worktrees/fill-audit-a10` @ `84ec6ff2` (v1.4.7). Every "ship" number below is this tree.
- **Scope (Jay, binding): "Leave other code alone."** Every mechanism lives in `src/core/scene3d/surface-fill.js`. All of them are tick-only and run after the site records are taken.
- **`scene3d.js` is NOT touched.** Trimmed stubs reuse the existing `r.apex` / `apexMin` path.
- **Isolation:** non-mkTick output must stay byte-identical (864 cells).
- **Jay's markup:** `docs/3d-audit/fill-audit/after/T2-9/JAY_markup_sphere.png`.

## §0 BINDING CHECKLIST

The orchestrator pastes `ROUND3-RESUME-BRIEFS.md` lines 34–67 (§0) and §0b here verbatim, and again in §7. The §0b sentence, verbatim:

> Run every vitest file in the FOREGROUND with the Bash tool parameter `timeout: 600000` (ten minutes). Never use run_in_background, never arm a Monitor and end your turn. If a file still exceeds ten minutes, kill it and rerun alone with `--pool=forks --poolOptions.forks.singleFork=true`, again with `timeout: 600000`.

## §1 Fixture (rule 3). It applies to every number in this plan.

**Render.** `algo.generate(params, null, null, BOUNDS)` in node JSDOM (`tests/helpers/load-vectura-runtime`).
- Source is patched in memory only (scriptOverrides). Nothing was written to disk.
- BOUNDS 1200×1000, m=20, pen 0.3. The ink width is `w = inkWidth() = 0.336 mm` (INK_SPREAD 0.12), so PMINT = 1.6w = **0.5376 mm**.
- `toneLaw 'mkTick'`, `fillAngle 45`, `fillDensity 50` (220 where stated).
- `Params.DEFAULT_CAMERA`. One SUN, az135/el45, tone enabled.
- **Ground and backdrop are DISABLED.** All ink is object ink only (sceneFill + sceneEdge).

**Rigs.**
- `create` = PRIMITIVE_PARAM_DEFAULTS ⊕ PRIMITIVE_CREATE_DEFAULTS. This is Jay's picture.
- `test` = PRIMITIVE_PARAM_DEFAULTS only.

**Cells.** 12 = {create, test} × {sphere, torus, cone} × {hatch, contour} at d=50. The 8 d=220 cells are test × 6 plus create sphere hatch/contour.

**Instruments** (planner scripts, all pure math over emitted paths and REC records):
- **bend:** max internal vertex angle of a `sceneFill` path.
- **spread:** max angle of any segment against the end-to-end chord.
- **x<w:** distinct cross-row run pairs whose centrelines come within 0.3 mm (visible ink merge). **s<w:** the same, within one row.
- **seam tip-line width:** for each regular main tick end, the distance along the tick to the line through the two nearest facing tips of another row (centreline).
- **rim>.9:** length (mm) of drawn outline next to a dark tick (I < 2/3) whose nearest ink is more than 0.9 mm away.
- **bare / W_L:** `H.buildBareRaster` / `bareArea(0.5)`. W_L window = [588,519,599,528].
- **tip / mk:** `H.contact`.
- **O1:** median sagitta of the longest third of all paths (as `mark-laws-draw` computes it).
- **bandC:** `scene3d-mktick-band.measure`.
- **sites:** md5 of `lastMarkStats.tickSites`.

**Where Jay's marks are, in mm.** The sphere is 575–625 × 475–525 mm. The markup is about 28.3 px/mm, so x = 575 + (px−35)/28.3 and y = 475 + (py−72)/28.4.

| mark | mm window |
|---|---|
| BENDS (a), pole + upper right | [584,474,606,481] |
| BENDS (b), lower-right rim | [604,508,622,524] |
| GAPS (a), seams | all bands |
| GAPS (b), bottom rim | [594,520,612,526] |
| OVERLAPS | [582,514,592,524] |
| Test-rig W_L | [588,519,599,528] |

## §2 Root cause per class (measured, ship, create sphere/hatch unless stated)

### 2.1 BENDS (a): the ruling frame goes singular near the chart pole

**Where.** All 39 hooked paths (bend over 30°) sit at y 475.5–480, x 586–604, within 1–5 mm of the top limb. That is the chart pole.

**What they look like.** Every one is a **3-point tick**: hub plus one step per arm, 0.6–1.2 mm long. Worst example: li9 site `reg:M:37.1643:78`, points (600.145,476.812) → hub (599.528,476.608) → (599.818,476.458). The bend at the hub is 134.5°.

**Why.**
1. `walkPoly` walks each arm from the hub with a linearised `toParam` step.
2. Near the pole, `det(dA,dB)` → 0, so one step lands in an arbitrary screen direction.
3. The 12×MK_ARC_MM jump cap (4.3 mm) does not trip.
4. `MK_TICK_BEND_CUT` (30°) compares each arm only with **its own** first step. The first step itself, and the join at the hub, are never checked.

**What it is not.**
- Not the walk following curvature: the bend sits at the hub vertex itself.
- Not the extension: the 5c report found the same 39 at e609338c.

**Counts, test rig:** 19 of 432 paths over 30°, worst 153.3°. Same mechanism.

### 2.2 BENDS (b): the walk follows the surface curling into the silhouette

**Where.** Lower right, li21 ticks at (613–615, 519–521).

**Shape.** Vertex bends grow toward the limb end: 0.0 0.0 0.1 0.2 0.3 4.8 1.6 2.5 4.2 7.3 **13.5°**. Total turn is 27–35°, sagitta 0.25–0.27 mm.

**Not the extension.** With `runExtensions();` removed, the path is identical (13.5° at the same vertex).

**Why.** Any surface curve that crosses toward the contour projects onto the screen tangent to the outline, so the chart-walked tick hooks into the rim.

**Population.** Of 494 ticks longer than 2 mm on the create sphere, spread has median 1.9°, p90 16.3°, max 59°.

**Live bar affected.** O1 (`mark-laws-draw`, test torus/contour, ≥ 0.09 mm) *requires* the walk to follow curvature, so "no curve at all" conflicts with it. See D1.

### 2.3 GAPS (a): the inter-band seam is the deliberate contact-free PMINT gap

**Seam width, ship** (tip-line centreline, mm; median / p90 / fraction over 0.6):

| cell | median | p90 | > 0.6 |
|---|---|---|---|
| create sphere | 0.540 | 0.691 | 0.24 |
| test sphere | 0.551 | 0.704 | 0.29 |
| create cone | 0.484 | 0.702 | 0.20 |
| test cone | 0.490 | 0.717 | 0.22 |

**In-row hub spacing** (create sphere): median 0.542 mm.

**What this means.**
- The median seam equals PMINT (0.5376). Visible, that is 0.24 mm, **identical to the in-row gap at the dark end**.
- The seam reads as a long dark line because the tips align along the whole band edge. A 0.24 mm channel running 30 mm reads as a line; the same gap 1–4 mm long between ticks does not.

**The wide tail (24–29%).** About a quarter of seam samples are wider than 0.6, from two causes.
- **Mid-tone length-channel gutter.** The `gutter = Lmain − f·Lmain` in `solveAt` centres the tick, so each tip retreats gutter/2. Seam median is 0.615 (p90 0.86) where gutter > 0, against 0.520 (p90 0.61) where gutter = 0. 25% of main ticks carry a gutter.
- **Per-row flat estimates.** `half()` takes each row's flat-frame neighbour distance independently, so the two sides do not agree.

**The narrow tail (28%).** About 28% are narrower than PMINT. That is the overlap class (§2.4).

**Conflict with Jay's rulings.**
- **Closing** the seam needs tip contact. That contradicts eye_t26 ("Minimize tick contact") and eye_mktick ("don't increase overlap at the seams"), and the T2-7 contact-free PMINT seam.
- **Making it uniform at PMINT** is consistent with the T2-8b-3 ruling ("endpoints evenly offset from … closest band").
- **Making it narrower than PMINT** is a new ruling.

**→ D2. The planner does not choose.**

### 2.4 OVERLAPS: cross-row contact where rows converge toward the limb

**Where.** In the bottom-left window, rows li1 (outermost) and li27 converge. li1 tips are 0.253–0.36 mm from li27 ink (for example #24↔#651 0.253, #28↔#655 0.264). That is below the 0.3 mm pen, so the ink visibly merges.

**Mechanism.**
1. Each row's half-extent comes from `half()`: a FLAT-frame projection of the neighbouring ruling's sample, minus ½·PMINT.
2. On a foreshortened limb, the walked tick lands closer to the neighbour than the flat estimate assumed.
3. The only runtime guard is the main-arm clip at `MK_TICK_MAIN_CLIP_FRAC·mkInkR` = 0.6 × 0.437 = **0.262 mm**, which is smaller than the pen.
4. The second-placed row's tip can therefore stop 0.25–0.30 from the first row's ink.

**Counts, create sphere/hatch:**
- 67 cross-row pairs closer than 0.3; 188 closer than 0.45.
- tipContact 0.093.

**Also present.** 7 same-row near-coincident pairs, for example a triple at (602.3, 524.2), li27 sites a = 0.100/0.638/1.176, 0.01 mm apart.
- This is **not** the rim extension: a same-row guard on the extension leaves the count unchanged (7 → 7).
- It is a placement-time artefact at the row's span start on the limb. It is not closed by this plan; see §6, D4.

### 2.5 GAPS (b): the bottom rim is irregular (touching stubs next to short-stopped ticks)

In the bottom window, li1 plot-floor stubs (0.69 mm, `I = 0`) are jammed in a 1.1 mm strip.
- On one side they are 0.41–0.49 mm from li27 tips, which is below PMINT.
- On the other they are 0.02–0.24 mm from the drawn outline, so they **touch** it. 14 ends touch the outline in this window.

They alternate with li27 ticks that end 1.07–1.34 mm short of the rim. Those ticks' rim extension was stopped by li1's ink (reason `I`), not by the outline.

Along the rim this reads as stub, gap, stub, plus the coincident triple from §2.4.

### 2.6 Test rig

**The sphere shows the same three classes:**
- 19 hooks over 30° (worst 153.3°).
- 27 cross-row pairs closer than 0.3; tipContact 0.0625.
- Seam 0.551 / 0.704 / 0.29.

**W_L = 1.89 mm² on test cone/hatch.**
- The strip lies beyond the lower ends of li16, whose ticks are already 7.1–9.0 mm long, against RPn 4.43 and the 2.05·RPn cap of 9.08.
- `planTick` gives `room = min(2.0, 2.05·RPn − L)` = 0.83 mm. But the outline is 1.6–4.8 mm away.
- The prefilter (`reachLine = room + c_E + 0.2`) therefore marks these ends "not near". Any arm that is walked ends unstopped (reason `C`), which counts as zero gain.
- Result: no extension, and ragged ends. Extended neighbours stop at 0.61 mm, others at 1.6–4.8 mm.
- The rest of the strip is ends stopped by ink from the neighbouring band (reason `I`), as T2-8b-5 found.

## §3 Mechanisms (all tick-only, deferred, after the site records; prototype code = reference)

### 3.0 Final flush order

```
lattice → [env TRIM] → runExtensions() (with PARTIAL reach) → [env SEAM]
        → mkEndQ (BC-E) → [NO-HOOK pass] → flushDeferredRibbons
```

Everything runs after `mkStat.tickSites.push`, so **A2 tickSites stay byte-identical**: measured 12/12 at d=50 and 8/8 at d=220. B5 and SP5 read `[I,R,P,L,pieceLen]` taken at place time, so they are unchanged by construction.

### 3.1 U1 NO-HOOK pass (BENDS a + b)

**Constants:**
- `MK_TICK_HOOK_HUB_DEG = 30` (= MK_TICK_BEND_CUT): a hub join bending more than this is a hook.
- `MK_TICK_HOOK_DEG = 8` (= MK_TICK_RIM_JOIN_DEG, the existing NOHOOK 8.5 tolerance): the straightness limit.
- `MK_TICK_HOOK_PASSES = 3`.

**Plumbing:**
- In `place()`, record the true hub of each walked poly: `wkHubs.push(mkLastHub)` on its **own line** after the `walkPoly` line. Do not edit the needle line.
- After `mkLastRun = runs[0];`, for tick shape, push `{ r, hub, md, del, add }` into a render-scope `mkHookQ`.
- Helpers in the per-ruling scope:
  - `mkInkDel(run)`: exact-coordinate removal of a run's points and mids.
  - `mkInkMinDist(pts, ownRun, r)`: distance to ANY ink except the run's own points and mids. It **must ignore other-FAMILY ink**: add `fam` to the `mkInkAdd` entries and skip `fam !== own`. Crosshatch ticks cross by design (§4.4).

**Pass (after the mkEndQ flush):**

```js
for (let pass = 0; pass < MK_TICK_HOOK_PASSES; pass += 1) mkHookQ.forEach((q) => {
  const r = q.r; if (r.length < 3) return;
  const hi = r.indexOf(q.hub);
  if (pass === 0 && hi >= 1 && hi <= r.length - 2 && cosAt(r[hi-1], r[hi], r[hi+1]) < cos(HUB_DEG)) {
    q.del(r); if (arc(r,0,hi) >= arc(r,hi,r.length-1)) r.splice(hi + 1); else r.splice(0, hi); q.add(r);   // HOOK: drop the shorter arm
  }
  if (r.length < 3 || straightOK(r, HOOK_DEG)) return;            // straightOK: every vertex AND every segment-vs-chord <= 8 deg
  const need = Math.min(w, q.md(r, r)) - 0.02;                     // never closer to other ink than the walk already was (or w)
  const ch = chordOf(r[0], r[r.length - 1], MK_ARC_MM);            // same END points => rim/seam envelopes are preserved
  if (q.md(ch, r) >= need) { q.del(r); r.length = 0; ch.forEach((p) => r.push(p)); q.add(r); }  // live ink update
  // else: residual (policy D1)
});
```

`chordOf(a, b, step)` resamples the straight segment at ≤ MK_ARC_MM.

**D1 alternative (strict).** On the last pass, cut the residual chord to its longest stretch that is clear of ink.

**Perf:** run passes 2–3 only over the runs kept in pass 1.

### 3.2 U2 SEAM/OVERLAP envelope (OVERLAPS, GAPS a)

**Queue.** `mkEnvQ.push((mode) => envTick(fr, run, hub, isMain, singleSeg, I, mode))` on its own line after the `const pieceLen = place(...)` needle line (do not edit the needle). Push it for every placed piece.

**Skip HIDENS.** Return early when `RPn/w < MK_TICK_HIDENS_PEN`. That is the d=220 regime, where the plot floor is allowed contact by design.

**`bcTools(fr0, lite, cBo)`.** An optional `cB` override and a `famOnly` flag. The defaults are byte-identical for `bcSide` and `planTick`.

**TRIM (before `runExtensions`)** runs for each end:
1. If `T.inkWithin(end, c_S, other rows)`, walk `T.arm(hub, sgn, have)`.
2. If it stops with reason `I` at `len < have − 0.02`, cut the run at arc length `len` from the hub. This is bisected, so the end lands exactly `c_S` from the other row.
3. Then `mkInkDel` the old run and `mkInkAdd` the new one.
4. If the run is now under MIN_MARK, then per D3: keep it as `r.apex = true; r.apexMin = 1 pen` if ≥ 0.336 mm, otherwise `run.length = 0`.

Trimming **before** the rim extension lets ticks that were blocked by a removed stub extend to the rim.

**SEAM (after `runExtensions`).** Only main ticks with `segs.length === 1` and I < 2/3.
1. `room = min(MK_TICK_SEAM_EXT_MM = 0.5, 2.05·RPn − L)`.
2. If other-row ink lies within `c_S + room`, walk `T.arm(hub, sgn, have + room)`.
3. Accept only a stop with reason `I`.
4. Append the part beyond the present end under the 5b straightness rule (≤ 0.5w from the end direction) and the 8° join rule.
5. Refuse the append if `mkInkMinDist(add, run, w) < w`.

**`c_S`** = `MK_TICK_BC_BAND_PEN·w` = PMINT, unless D2 says otherwise.

Reference code: the planner's `envTick` (trim and seam branches), reproduced in §3.5.

### 3.3 U3 PARTIAL REACH (test-rig W_L)

In `planTick`:

```js
const lineClear = (sgn, have, extra) => { ... const full = have + (extra || reachLine); ... };
const farR = RPn / w >= MK_TICK_HIDENS_PEN ? room + MK_TICK_BC_EDGE_PEN * w + MK_TICK_RIM_PARTIAL_MM : 0;   // 2.0
const farUp = farR > 0 && !lineClear(1, lenUp, farR); const farDn = farR > 0 && !lineClear(-1, lenDn, farR);
const nearUp = !(ringClear(seg[1]) && lineClear(1, lenUp)) || farUp;  // same for Dn
const gainUp = (up.stopped && up.reason === 'E') ? up.len - lenUp : ((farUp && !up.stopped) ? up.len - lenUp : 0);  // same for Dn
```

When the outline lies beyond the length cap, the end grows by `room`. The cap stays at ≤ 2.05·RPn, and all 5b/5c rules apply (STRAIGHT, GROW, coherence, strip, ISO, taper, NO-HOOK).

**Gated to non-HIDENS.** The ungated version cost up to 2.0× at d=220 (§4.6).

### 3.4 U4 (conditional on D5) OUTLINE trim for GAPS (b)

Trim regular rim-facing ends that are closer than c_E (0.672 analytic) to the outline back to c_E. Ticks blocked by trimmed stubs then extend to c_E, giving one even rim margin.

Prototyped as a `trimE` option. Its end detection is too weak: create sphere ends within 0.3 of the drawn outline went 98 → 50 only. It also raised rim>.9.

It needs its own measure-first sub-unit. A start-of-run end frame (not the hub-linear `T.at`) is the fix to try.

### 3.5 Reference code: `envTick` (trim + seam)

From the prototype, with the constants named.

```js
const envTick = (fr, run, hub, isMain, single, I, mode) => {
  if (!run || !hub || !hub.sm || run.length < 2) return;
  const RPn = masterPitch / markRowCoverage(); if (RPn / w < MK_TICK_HIDENS_PEN) return;
  let iHub = run.indexOf(hub.sm); if (iHub < 0) return;
  const cS = MK_TICK_SEAM_PEN * w;                       // D2; default 1 + MK_TICK_GAP_PEN
  const T = bcTools(fr, true, cS, /*famOnly*/ true); const h0 = { fr: hub.fr, sm: hub.sm };
  for (const sgn of [1, -1]) {
    if (run.length < 2) return;
    const endI = sgn > 0 ? run.length - 1 : 0; if (endI === iHub) continue;
    const have = sgn > 0 ? arc(iHub, run.length - 1) : arc(0, iHub); const e = run[endI];
    if (mode === 'trim') {
      if (!T.inkWithin(e.x, e.y, cS, false)) continue;
      const res = T.arm(h0, sgn, have);
      if (!(res.stopped && res.reason === 'I' && res.len < have - 0.02)) continue;
      mkInkDel(run); cutRunAt(run, iHub, sgn, res.len);   // splice + interpolated end; iHub -= (i-1) on the minus side
      if (arc(0, run.length - 1) < MIN_MARK_MM) { if (D3_KEEP && arc(...) >= MK_TICK_BC_APEX_MIN * w) { run.apex = true; run.apexMin = MK_TICK_BC_APEX_MIN * w; } else { run.length = 0; return; } }
      mkInkAdd(run); continue;
    }
    if (mode === 'seam' && isMain && single && I < MK_TICK_BC_HI_I) {
      const room = Math.min(MK_TICK_SEAM_EXT_MM, 2.05 * RPn - arc(0, run.length - 1)); if (room < 0.03) continue;
      if (!T.inkWithin(e.x, e.y, cS + room, false)) continue;
      const res = T.arm(h0, sgn, have + room);
      if (!(res.stopped && res.reason === 'I' && res.len > have + 0.03)) continue;
      const keep = straightBeyond(res.pts, run, iHub, have, sgn);   // 5b STRAIGHT (0.5 w) + 8 deg join, as in planTick
      if (!keep.length || mkInkMinDist(keep, run, w) < w) continue;
      if (sgn > 0) keep.forEach((p) => run.push(p)); else { keep.forEach((p) => run.unshift(p)); iHub += keep.length; }
      mkInkAdd(keep);
    }
  }
};
```

## §4 Measured: ship vs composite G

G = U1 guarded + U2 at c_S = PMINT with stubs kept + U3 gated. Fixture §1.

### 4.1 Twelve cells, d=50

| cell | sites | paths | ink | vertex >8.5 / >30 | max vertex | spread >10 | x<w (cross-row) | tip | seam med / p90 / >.6 | rim>.9 | bare ≥0.5 | W_L | sub<0.6 | O1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| c sph/hatch ship | | 692 | 2930 | 112 / **39** | 134.5 | 115 | **67** | .0932 | .540/.691/.24 | 4.0 | 60.7 | 0 | 0 | .017 |
| c sph/hatch G | = | 659 | 2891 | 1 / **0** | 12.9 | 10 | **3** | .0144 | .530/**.563**/.05 | 16.1 | 68.0 | 0 | 28 | .018 |
| c sph/cont ship | | 691 | 2837 | 87 / 24 | 72.8 | 90 | 0 | .0232 | .544/.713/.26 | 6.2 | 75.2 | 0 | 0 | .006 |
| c sph/cont G | = | 668 | 2846 | 4 / 0 | 13.3 | 16 | 0 | .0247 | .530/.562/.07 | 8.8 | 78.7 | 0 | 13 | .007 |
| c tor/hatch ship | | 199 | 692 | 33 / 0 | 21.9 | 36 | 3 | .0352 | (sparse) | 56.8 | 484.3 | 0 | 0 | .066 |
| c tor/hatch G | = | 199 | 686 | 2 / 0 | 9.7 | 8 | 0 | .0201 | | 57.9 | 486.9 | 0 | 2 | .050 |
| c tor/cont ship | | 161 | 898 | 17 / 0 | 18.1 | 64 | 7 | .2484 | .616/1.09/.51 | 33.5 | 404.5 | 0 | 0 | .117 |
| c tor/cont G | = | 160 | 899 | 4 / 0 | 11.8 | 29 | 3 | .2406 | .552/1.03/.34 | 32.6 | 405.2 | 0 | 0 | .097 |
| c cone/hatch ship | | 328 | 1560 | 37 / 1 | 35.1 | 79 | 23 | .0655 | .484/.702/.20 | 2.7 | 26.4 | 0 | 1 | .057 |
| c cone/hatch G | = | 314 | 1540 | 0 / 0 | 6.6 | 14 | **0** | **.0000** | .524/.575/.07 | 7.8 | 26.4 | 0.02 | 11 | .051 |
| c cone/cont ship | | 369 | 1504 | 23 / 0 | 21.8 | 34 | 0 | .0420 | .540/.727/.22 | 1.0 | 26.1 | 0 | 0 | .001 |
| c cone/cont G | = | 369 | 1518 | 9 / 0 | 21.8 | 18 | 0 | .0447 | .531/.598/.10 | 1.0 | 26.4 | 0 | 0 | .001 |
| t sph/hatch ship | | 432 | 1887 | 67 / **19** | 153.3 | 82 | 27 | .0625 | .551/.704/.29 | 8.9 | 41.3 | 0 | 0 | .022 |
| t sph/hatch G | = | 410 | 1862 | 0 / **0** | 8.0 | 14 | 0 | .0098 | .525/.556/.05 | 16.8 | 46.8 | 0 | 14 | .019 |
| t sph/cont ship | | 443 | 1819 | 60 / 14 | 99.4 | 62 | 2 | .0429 | .549/.751/.30 | 10.0 | 51.2 | 0 | 0 | .009 |
| t sph/cont G | = | 430 | 1825 | 4 / 0 | 18.4 | 9 | 0 | .0326 | .528/.563/.07 | 10.9 | 53.2 | 0 | 14 | .008 |
| t tor/hatch ship | | 485 | 1717 | 25 / 2 | 36.8 | 40 | **80** | .1320 | .483/1.06/.40 | 24.1 | 86.2 | 0 | 0 | .042 |
| t tor/hatch G | = | 470 | 1642 | 0 / 0 | 7.9 | 7 | 2 | .0266 | .539/1.09/.23 | 30.0 | 93.8 | 0 | 8 | .031 |
| t tor/cont ship | | 334 | 1703 | 29 / 3 | 171.7 | 89 | 28 | .0584 | .579/1.48/.47 | 18.8 | 89.3 | 0 | 0 | **.184** |
| t tor/cont G | = | 331 | 1687 | 7 / 0 | 27.5 | 43 | 2 | .0166 | .544/1.49/.36 | 18.0 | 91.5 | 0 | 2 | **.167** |
| t cone/hatch ship | | 284 | 1375 | 31 / 1 | 30.9 | 77 | 13 | .0423 | .490/.717/.22 | 8.8 | 24.2 | **1.89** | 1 | .075 |
| t cone/hatch G | = | 274 | 1361 | 0 / 0 | 7.9 | 15 | 1 | .0018 | .528/.608/.11 | 12.8 | 23.2 | **0.53** | 6 | .062 |
| t cone/cont ship | | 324 | 1348 | 31 / 0 | 23.4 | 39 | 0 | .0386 | .538/.754/.21 | 0.6 | 19.1 | 0 | 0 | .001 |
| t cone/cont G | = | 324 | 1361 | 10 / 0 | 19.0 | 16 | 0 | .0401 | .529/.566/.08 | 0.5 | 19.7 | 0 | 0 | .001 |

How to read the table:
- **Hooks (vertex over 30°) are 0 on 12/12.**
- The residual between 8.5° and 30° is straightening the guard refused because it would have brought the tick closer to other ink. See D1.
- **Contact** improves, or stays inside the A3 slack, on 12/12. The tightest are create cone/contour, tip +0.0027 and mark +0.009 against slacks of 0.005 and 0.01 (thin).
- **Seam** p90 falls from 0.69–0.75 to 0.556–0.608 on the sphere and cone cells.
- **Costs:**
  - bare +7.3 mm² on create sphere/hatch and +5.5 on test sphere/hatch, mostly the pole region.
  - rim>.9 up on the sphere and cone cells. That is the pole thinning (D4) and the trims at converging seams.
  - sub-0.6 stubs appear (D3).

### 4.2 Component attribution (same fixture)

**Hook pass only** (guarded, single pass, no live ink, 10° straightness):
- create sphere/hatch: hooks 39 → 0, bare 60.7 → 60.8.
- test torus/contour: vertex >8.5 29 → 8.
- create cone/contour: 23 → 14.

**Trim only** (T5):
- create sphere/hatch x<w 67 → 8, test torus/hatch 80 → 2, create cone/hatch 23 → 0.
- bare +0.3 to +6.

**Partial reach only** (R2.0): test W_L 1.89 → 0.530, W_L ≥0.75 0.718 → 0.018. create cone W_L 0 → 0.015.

**Seam option c_S = 1.33w (0.447, visible 0.15 mm):**
- seam median 0.436 / p90 0.490.
- x<w 8 (create sphere/hatch).
- Below PMINT: 213–342 pairs closer than 0.45.

**Strict-cut variant (D1-b):**
- vertex >8.5 = 0 on all.
- But **create cone/hatch W_L 0 → 2.36** (breaks the WL ≤ 0.30 bar), bare 26.4 → 37.4.
- test torus/contour bare 89 → 116.

**Window metrics** (create sphere/hatch, bare ≥0.3 mm²; ship → trim+seam with stubs kept):
- bottom: 0.34 → 0.55.
- pole: 10.15 → 12.27; ink coverage 0.415 → 0.359.
- Ends touching the outline in the bottom window: 14 → 14.

GAPS (b) is therefore **not closed by U1–U3**. It is U4 (D5).

### 4.3 d=220, the 8 cells

**Sites identical 8/8.** Vertex >8.5: ship 30/64/36/41/11/0/32/66 → G 0 on all 8, with no residual (the guard kept everything).

**Contact equal or lower.** Example: test cone/hatch tip .1398 → .1417 (+0.002). The one sub-0.6 path is on test cone/hatch.

**HIDENS:** the env pass is skipped at d=220 by design.

### 4.4 Other mappers (I2 roster, create d=50)

Wireframe, spiral, stipple, contourSlice and none are **identical**: no tick runs reach the queues.

**Crosshatch: STOP item.** Without `famOnly`, the trim cuts ticks where they cross the other family.

| cell | ship ink | G ink (no famOnly) | change |
|---|---|---|---|
| sphere/crosshatch | 3459 | 2568 | −26% |
| cone/crosshatch | 1827 | 1413 | |
| torus/crosshatch | 980 | 777 | |

The hook pass alone costs −1.8% on sphere crosshatch (78 pole hooks). The `fam` tag on mkInk entries plus `famOnly` in the env and hook guards is **mandatory**. The implementer measures crosshatch ink within −3% of ship.

### 4.5 bandC (ceilings UNCHANGED)

| cell | ceiling | ship | G |
|---|---|---|---|
| test sphere/contour | .05500 | .04248 | .03110 |
| test cone/contour | .03078 | .02676 | .02337 |
| create sphere/contour | .04676 | .04066 | .03451 |
| create cone/contour | .02508 | .02181 | .01861 |

### 4.6 Perf, d=220, test rig

Medians of 5, interleaved in one process, load about 40–80. Treat these as ratios only.

| cell | hook only | G gated | G ungated |
|---|---|---|---|
| torus/hatch | 0.80 | 0.93 | 0.91 |
| sphere/hatch | 1.32 | 1.32 | 1.74 |
| cone/hatch | 1.16 | 1.35 | 2.04 |
| sphere/contour | 1.07 | 1.35 | 1.77 |

The ≤ 1.3× bar is **at risk**. Required:
1. Gate partial reach to non-HIDENS (done in G).
2. Hook passes 2–3 run only over pass-1 keepers.
3. `straightOK` short-circuits; build the own-key set once per run.

The implementer re-times this, interleaved.

## §5 Bars (clause, mutation, fixture, roster fraction)

Fixture §1. Gated cells are hatch + contour = 2 of 8 mappers × sphere/torus/cone = 3 of 12 primitives × 2 rigs.

**Exclusions.**
- **wireframe, spiral, stipple, contourSlice, none:** I2 measured them identical (§4.4), because no tick run reaches the new queues.
- **Crosshatch:** gated by the CROSSHATCH bar below, not by the NO-HOOK clauses.

| id | status | clause (and NOT) | bar | population | G | mutation (must trip) |
|---|---|---|---|---|---|---|
| **NO-HOOK (a)** | NEW, BLOCKING | "lines must not have angles/hooks": no hook. Not curvature. | max internal vertex bend of every mkTick tick path ≤ **30°** | 12 d=50 + 8 d=220 (20/20); tick runs via REC (excludes stipple/spiral mapper paths) | max 27.5 | `nohub` (hub drop off): create sphere/hatch ≥ 24 paths over 30° |
| **NO-HOOK (b)** | NEW, BLOCKING | "ticks that curve": straightness where contact-free. Not residual ticks refused for contact (REPORTED, D1). | paths with vertex >8.5° ≤ **4%** per cell; **0** at d=220 | 20 | max 3.1% (t cone/contour 10/324); d=220 0 | `nochord`: back to ship (create sphere/hatch 16%) |
| **NO-OVERLAP** | NEW, BLOCKING | "ticks overlap or merge" across rows. Not same-row (§2.4, REPORTED). | cross-row run pairs with centreline < 0.30 mm ≤ **3** per cell AND ≤ 15% of ship | 12 | 3/0/0/3/0/0, 0/0/2/2/1/0 | `notrim`: create sphere/hatch 67, test torus/hatch 80 |
| **SEAM-GAP** | NEW, BLOCKING (band per D2) | "seams are not wide gutters": uniform envelope at c_S. Not seam visibility (Jay's eye). | tip-line width median ∈ [c_S − 0.03, c_S + 0.03], p90 ≤ c_S + 0.075, fraction > c_S + 0.06 ≤ 0.12 | sphere + cone × hatch/contour × 2 rigs = 8; torus REPORTED (sparse rows) | c_S = .5376: med .524–.533, p90 .556–.608 | `noseam`: p90 .69–.75 |
| **W_L-TEST** | TIGHTENED (RIMSTRIP iv ≤ 1.90 → new) | "test-rig W_L strip" | test cone/hatch W_L ≥0.5 ≤ **0.60**, ≥0.75 ≤ **0.05** | test cone/hatch | 0.53 / 0.018 | `nopartial`: 1.89 / 0.72 |
| **CROSSHATCH** | NEW, BLOCKING | the passes must not cut crossing families | crosshatch ink ≥ 0.97 × ship | sphere/cone/torus create | (must measure with famOnly) | `nofam`: −26% |

**Kept bars (unchanged unless noted):**
- **A2:** tickSites + `[I,R,P,L,drawn]` deep-equal (20/20, measured).
- **B5 / SP5 / T2–T4:** site-based, so unchanged. T2/T3 contact: measured lower.
- **bandC:** ceilings UNCHANGED, all lower (§4.5).
- **O1 ≥ 0.09:** 0.167.
- **O2:** implementer measures, test sphere/hatch d=1/50.
- **OUTLINE, ENVELOPE-E/B, NO-ORPHAN, TAPER, SEAM/DIR (BC-E):** chain-tick ends are not moved by the chord. The trim can move the boundary tick's drawn length, so re-run TAPER.
- **RIMSTRIP / RIMEDGE / ISO / NOHOOK-ext:** re-run with partial reach.
- **APEX (a2):** whole-object bare on create cone ≤ 26.45. G = 26.4, thin.
- **FILL, A1/WL, A3/A4/A5, over2RP 0:** partial reach and seam extension respect 2.05·RPn.
- **CRUMBS:** per D3.
- **Perf:** ≤ 1.3× of v1.4.7 at torus/sphere/cone d=220, interleaved.
- **I1:** 864/864 non-mkTick md5. Isolation holds by construction; the sweep is still owed.

## §6 Decisions for Jay (before building)

**D1 — BENDS policy.**
- **(a) Guarded straightening (recommended).** Hooks are gone everywhere. Curved ticks are straightened to their chord unless the chord would come closer than the pen to other ink. The residual is ≤ 4% of ticks, curving 8.5–27.5°. Fill and W_L are unchanged. O1 is kept.
- **(b) Strict.** Every tick is straight; residuals are cut to their clear stretch. This breaks the create cone W_L (0 → 2.36 mm²) and costs bare +5 to +27 mm².
- **(c) Leave limb curvature.** Fix hub hooks only.

**D2 — SEAM width.** The seams are the deliberate contact-free gap (median = PMINT, visible 0.24 mm, equal to the in-row gap). This conflicts with eye_t26 and eye_mktick if closed.
- **(S1) Uniform PMINT (recommended, contact-free).** Removes the wide tail (p90 0.69 → 0.56). Seams stay visible as an even thin line.
- **(S2) c_S = 1.33w.** Visible 0.15 mm. Below the PMINT literal; still under the pen-contact threshold.
- **(S3) c_S ≈ 1.0w.** Visible about 0.04 mm. Seams nearly vanish; plotter bleed risk.
- **(S4) Staggered / interlocking tips across the seam.** Not prototyped, new mechanism. Contact-free only where P ≥ 2·PMINT.
- **(S0) Leave as shipped.**

**D3 — Stubs left by trimming.**
- (a) Keep 0.34–0.6 mm stubs as apex-flagged runs. CRUMBS is re-scoped to "apex or seam-trim runs". 6–28 per cell.
- (b) Drop them. More bare: create sphere/hatch pole window bare ≥0.5 1.9 → 4.6 mm².

**D4 — Pole thinning.** Removing hooked arms drops 25 (create) and 16 (test) pole ticks. The pole patch (I ≈ 0.6–0.75) gets lighter: bare +7 mm² on create sphere/hatch.
- Accept?
- Or add a measure-first unit to re-seed the pole region. Same-row coincident ticks at the limb span start (§2.4) go with this.

**D5 — GAPS (b).**
- Approve U4: trim touching ends to c_E so the rim margin is even. The rim reads slightly more open but even.
- Or leave the touching stubs. U1–U3 do not fix this class.

**D6 — Partial reach on the create rig.** It also changes create cone (W_L 0 → 0.015) and torus (bare +2.6) extension counts.
- Accept?
- Or scope it to ticks at the 2.05·RPn cap only.

## §7 Implementer brief (paste §0 + §0b above it)

**Lane.** New branch from `84ec6ff2` (v1.4.7) in its own worktree.

**RED.** From a `git archive` export of `84ec6ff2`. The new bars must FAIL there:
- NO-HOOK (a): 39 over 30°.
- NO-OVERLAP: 67.
- SEAM-GAP p90: 0.69.
- W_L-TEST: 1.89.

Reproduce any pre-existing red under `## Pre-existing red`.

**SHOW-ME-FIRST.** Build U1 → U2 → U3 as three commits, source only. Produce the pictures and STOP for Jay. Bars and re-pins come after he accepts. This is the T2-8b-5 pattern.

**Source** (`src/core/scene3d/surface-fill.js` only):
- **Never edit the test needle lines:** `const pieceLen = place(fr, [poly], a - arcMM[k], thetaAt(k, fr));`, `pushRun(r, back, lineIndex);`, the `walkPoly` call line, the `tickSites.push` line, the BC-E `const up = arm(...)` line. Add statements on separate lines.
- **U1** (§3.1): `fam` on mkInk entries; `mkInkDel` / `mkInkMinDist` (famOnly); `wkHubs` capture; `mkHookQ`; NO-HOOK pass after the mkEndQ flush; constants `MK_TICK_HOOK_HUB_DEG = 30`, `MK_TICK_HOOK_DEG = 8`, `MK_TICK_HOOK_PASSES = 3`.
- **U2** (§3.2, §3.5): `bcTools(fr0, lite, cBo, famOnly)` with defaults byte-identical; `mkEnvQ`; trim before `runExtensions()`, seam after; `MK_TICK_SEAM_PEN` (D2), `MK_TICK_SEAM_EXT_MM = 0.5`; D3 policy.
- **U3** (§3.3): `planTick` partial reach, gated non-HIDENS; `MK_TICK_RIM_PARTIAL_MM = 2.0`.
- **U4** only if D5 = yes, measure-first.
- **`scene3d.js` untouched** (apex path reused).

**STOP and report if:**
- any tickSites record changes;
- any gated bandC exceeds its UNCHANGED ceiling;
- create W_L > 0.30, or FILL > 0.50;
- A3 tip > off+0.005 or mark > off+0.01;
- O1 < 0.09, or O2 > 0.20;
- crosshatch ink < 0.97 × ship;
- d=220 perf over 1.3× (interleaved);
- any T2/T3/T4 named set would need to grow.

**Tests** (after Jay accepts):
- Add the §5 bars with `## Bars changed` entries, each with a needle-patched mutant (count === 1): `nohub`, `nochord`, `notrim`, `noseam`, `nopartial`, `nofam`. Report any mutant that is vacuous.
- Re-pin goldens per §8.
- Re-run every kept bar.

**Run** each of these in the FOREGROUND with `timeout: 600000`:
- spacing-tone, mktick-wedge, band-purity, mark-laws-draw (O1/O2/O3/O4/perf), mktick-runaway, mktick-banding, one-pen-down-reachability;
- integration fill-style-picker and stroke-fill-style-control;
- tone-law-collapse (Tier 1, `--pool=forks --maxWorkers=1 --no-file-parallelism`).

Also run the 864 isolation sweep, and I2 over 6 mappers × 3 primitives.

**Report** to MAIN `docs/3d-audit/lane-reports/T2-9-impl.md` with:
- the §1 fixture on every number and "ground DISABLED";
- the rig per number;
- roster fractions.

Never push, merge, tag or bump.

### Pictures (Jay's eye is the acceptance test)

Evidence goes to MAIN `docs/3d-audit/fill-audit/after/T2-9/`. Every panel is `v1.4.7 84ec6ff2 | NEW`, from `scripts/audit/scene3d-capture.js --tier B` (mkTick, med, angle a). mm windows use the capture tool's mm→px transform. Look at each picture and write one line on what you see before claiming anything.

**U1:**
- `JAY_T29_create_sphere_hatch.png` (whole).
- `crop_pole` [584,474,606,481] at 4×.
- `crop_lowerright` [604,508,622,524] at 3×.
- `JAY_T29_test_sphere_hatch.png`.
- `crop_create_torus_contour` (residual curves).

**U2:**
- `crop_seams` [590,490,615,510].
- `crop_overlap` [582,514,592,524].
- `crop_bottomrim` [594,520,612,526].
- `JAY_T29_create_sphere_contour.png`.
- `JAY_T29_create_sphere_crosshatch.png` (no crossing loss).

**U3:**
- `crop_testrig_WL` (same px as T2-8b-5b).
- `JAY_T29_testrig_cone.png`.
- `crop_create_torus_bottom` (same px as T2-8b-5c).

## §8 Golden re-pin list (rule 4, fixture checked)

**`scene3d-mktick-wedge.test.js` `EXPECTED_SIGNATURE`:**
- Fixture: the §1 12-cell d=50 fixture, `pathSignature(paths, 4)`.
- **All 12 change.** The hook pass straightens chords on every cell (G chord count > 0 on 12/12).
- **CONTRAST MUTATION:** must now remove the NO-HOOK flush, both env flushes and `runExtensions();` together with the mkEndQ flush. It still returns `PRE_T28B_SIGNATURE` on 12/12. Partial reach lives inside `runExtensions()`.

**Run, not expected to need a re-pin:**
- `scene3d-mark-laws-draw` (O1 0.167 measured; O2/O3/O4 measure; perf).
- `scene3d-mktick-runaway` (FIX_NEEDLE is the walk line; leave it verbatim).
- `scene3d-mktick-band-purity`; `scene3d-mktick-banding` (ceilings unchanged, values lower).
- `one-pen-down-reachability`; `tone-law-collapse`.
- Integration `fill-style-picker`, `stroke-fill-style-control`.

**No visual baseline uses mkTick** (grep). Shadows do not use SurfaceFill.

### Critical Files for Implementation
- src/core/scene3d/surface-fill.js
- tests/unit/scene3d-mktick-spacing-tone.test.js
- tests/helpers/scene3d-mktick-spacing-tone.js
- tests/unit/scene3d-mktick-wedge.test.js
- tests/unit/scene3d-mark-laws-draw.test.js

## §9 JAY'S DECISIONS (2026-10-04, binding)

- **D1 = (a) Guarded straightening.**
- **D2 = (S1) Uniform PMINT** (c_S = PMINT; seams stay as an even, thin, contact-free line).
- **D3 = (a) Keep the 0.34–0.6 mm stubs as apex-flagged runs** (re-scope CRUMBS to "apex or seam-trim runs"; disclose).
- **D4 = Accept the lighter pole** (no re-seed unit).
- **D5 = YES — build U4** (even rim margin at c_E), measure-first, shown to Jay.
- **D6 = Accept partial reach on both rigs** (non-HIDENS).
