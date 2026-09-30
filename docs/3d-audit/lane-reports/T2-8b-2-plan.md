# T2-8b-2 — plan: continue the band, taper its ends, stay off the outline (redo of T2-8b after Jay's REJECT)

Planner (Opus), read-only. Written to disk by the orchestrator verbatim from the planner's hand-back.

- **Base for this unit:** branch `3d-scene/fill-audit-a6` @ `9d217ed0`. That is T2-8b's SEC; its src/tests diff against `8b8f275e` is the rejected unit, **unmerged**.
- **Binding inputs:**
  - Jay 2026-09-28: *"It must continue the band but truncate the top/bottom gradually as they approach another band or a side."* He answered YES to all three: continue the direction and spacing (no seam); shorten gradually toward the rim; stay off the outline.
  - Include the contour mapper (drop the contour gate).
  - Re-pin `bandC` to accommodate it.
- **Kept binding:**
  - A2: master grid / `tickSites` byte-identical.
  - B5 and every T2-7 bar.
  - Tip contact ≤ base+0.005.
  - Isolation: non-mkTick byte-identical.
  - Jay's eye is the acceptance test.
  - Sphere G5 stays out of scope.

## §0 THE BINDING CHECKLIST

The orchestrator pastes `ROUND3-RESUME-BRIEFS.md` lines 34–67 (§0) and §0b verbatim here and in §7. The §0b sentence, verbatim:

> Run every vitest file in the FOREGROUND with the Bash tool parameter `timeout: 600000` (ten minutes). Never use run_in_background, never arm a Monitor and end your turn. If a file still exceeds ten minutes, kill it and rerun alone with `--pool=forks --poolOptions.forks.singleFork=true`, again with `timeout: 600000`.

Tier-1 exception: `tests/unit/scene3d-tone-law-collapse.test.js`. Start it with singleFork and `timeout: 600000`, let the tool background it at the ceiling, and read the completion notification. Do not pass `run_in_background`; do not arm a Monitor.

## §1 Fixture for every number in this plan (rule 3)

**Render call.** `algo.generate(params, null, null, BOUNDS)` in node JSDOM (`tests/helpers/load-vectura-runtime`).
- The `surface-fill.js` source is read from worktree `fill-audit-a6` @ `9d217ed0` and patched **in memory only** (scriptOverrides).
- **BOUNDS:** 1200×1000, m=20, pen 0.3.
- **Params:** `buildSceneParams` exactly as in `scene3d-mktick-spacing-tone.test.js`:
  - `toneLaw: 'mkTick'`, `fillAngle: 45`, `fillDensity: 50` (d=220 where stated).
  - Camera `Params.DEFAULT_CAMERA` (gallery angle a).
  - One SUN, az 135 / el 45.
  - `tone.enabled: true`.
- **Ground and backdrop are DISABLED. No ground-plane ink is in any number.** "Ink" means object ink = `sceneFill` + `sceneEdge` path length in mm.
- **Rigs:**
  - `create` = `PRIMITIVE_PARAM_DEFAULTS ⊕ PRIMITIVE_CREATE_DEFAULTS`. This is the gallery/Jay rig.
  - `test` = `PRIMITIVE_PARAM_DEFAULTS` only. This is the RGR/addLayer-equivalent rig.

**Variants.**
- `off` = the flush line `for (let qi = 0; qi < mkEndQ.length; qi += 1) mkEndQ[qi]();` removed. Its `pathSignature(paths,4)` equals `PRE_T28B_SIGNATURE` (the `8b8f275e` output) on 12/12 cells, measured. **`off` is "base".**
- `sec` = the shipped T2-8b tree.
- `bc` = the §3 mechanism, **without** the 10° chain-stop cut unless the cut is stated.

**Cells.** 6 cells × 2 rigs = sphere/torus/cone × hatch/contour. Wedge windows (mm): W_L [588,519,599,528], W_R [603,518,614,528]. Strips: [588,510,599,519] and [603,509,614,518].

**Instruments.**
- Bare area: `buildBareRaster`/`bareArea` from `tests/helpers/scene3d-mktick-spacing-tone.js` (0.05 mm raster, stamp r 0.15, interior = not flood-reachable across `sceneEdge`).
- Contact: `contact()` in the same helper.
- `bandC`: `measure()` in `tests/helpers/scene3d-mktick-band.js`.
- Chain metrics: §4.2. These are planner scripts; the port specification is in §7.

## §2 Root cause of each blemish, measured (create cone/hatch d=50 unless stated)

Base spans that matter:
- li16: s0 (606.95, 526.31), phase 0.889, P(s0) 0.631.
- li19: s0 (589.94, 525.79), phase 0.243, P(s0) 0.538.
- `rowPitch` 4.54 mm.

Each tick is measured by its midpoint's along-band position (projection onto the ruling polyline extended past s0; 0 = s0; negative = past the end) and by its cross extent (signed distance from the ruling).

### 2.1 (a) G2a — the ~1 mm dark channel (li16, under W_R)

SEC's position loop is `x = j*P − off; if (x <= 0.25*P) continue;`.
- On li16, `off` = phase·P = 0.561, so x₁ = 0.070 ≤ 0.158 and **j=1 is skipped**.
- The first band tick is at along +0.59. The first SEC tick on the band's main side is at −0.95. That is a 1.54 mm gap, 2.44 P.
- By the perpendicular-spacing seam metric of §4.2: **2.49× the band's own spacing** (create) and 2.64× (test cone/hatch).
- The lone short tick at the channel's foot in `crop_G2a_after.png` is SEC's opposite-side tick (side +1, cross [−0.64, 1.37], 2.0 mm).

**Cause: a restarted lattice with a skipped first position.**

### 2.2 (b) W_L — the butt-joint seam (li19)

SEC does not continue the band's ticks; it builds new ones:
- It takes a fresh frame at a sideways sample (δ-ladder).
- It spans only the half-band from the ruling line to the band edge.
- It re-centres each tick on its dry walk.

Measured on li19:

| | band ticks near s0 | SEC ticks j=1..6 |
|---|---|---|
| cross extent | [−0.74, +4.17] | near ends +0.17, +0.21, +0.60, +1.05, +1.83, +2.70 (irregular steps 0.04…0.87) |
| along position | spacing P = 0.538 (last band tick at +0.24) | −0.55, −1.10, −1.63, −2.16, −3.13, −4.12 |

- **Extent restart.** The near ends jump 0.9 mm inward at s0 and then step irregularly.
- **Phase restart.** The first gap is 0.79 mm, 1.47 P.
- **Holes.** The last two intervals are 0.97 and 0.99 mm, about 2 P.

Direction is **not** the culprit. SEC's first tick is 132.0° against the band's 133.9°, a 1.9° step where the band itself turns ≈1.1° per tick. The new ticks read as a second family butted against the band. (The picture reading is the planner's; the numbers are measured.)

### 2.3 (c) G2b — rim ticks touching the outline

SEC has no outline clearance:
- Its only trim is 0.25·PMINT (0.12 mm) off a flat-frame half-band estimate.
- Its dry walk stops at the first off-front step, which puts tips on the surface boundary.

Minimum distance from a SEC tick point to any `sceneEdge` polyline: **0.001 mm** (create cone/hatch) and **0.006 mm** (test). Per chain: li16 0.00–0.09, li13 0.05.

### 2.4 Two further measured facts the mechanism relies on

1. **The lattice leaves a lead-in gap at s0.** The lattice starts `phase·P(s0)` past s0, and the first site's own P can be smaller. So `firstA − P` can still lie inside the span, which is the missing s0 counterpart of item 8. Example: li7 (right flank), firstA − s0 = 2.35 mm, P(s0) 2.84.
2. **The drawn silhouette sits inside the analytic limb.** The mesh silhouette `sceneEdge` sits 0.1–0.25 mm inside the analytic limb that `sampleAt().front` reads. The rim ("boundary" class) matches to about 0.03 mm. The band's own regular ticks already touch outlines on every cell (min 0.000–0.002 mm). Out of scope; disclosed only.

## §3 Mechanism BC — "band continuation" (replaces SEC entirely)

The **lattice loop itself is continued** past each span end. It uses:
- the boundary site's **own frame** (`frameAt(kB)`, the same frame the band's last tick used);
- its **own P** (the solve used at that site);
- its **own phase** (positions `aB ± j·P`);
- its **own segs** (main tick plus band-fill pieces, so tone continues by construction).

Only each tick's two ends ("top/bottom") move. They taper monotonically as the surface runs out, and they clip against neighbouring ink. The pass stays deferred (the queue is flushed once after `runMapper`, front and x-ray, exactly as now) and non-site: it never touches `mkStat.tickSites`.

### 3.1 Changes, all in `src/core/scene3d/surface-fill.js`

1. **Remove SEC completely.** Delete `secSide`, the `MK_TICK_SEC_*` constants, the 0.25P skip, the δ-ladder, fresh frames, the duty rule (measured inert anyway) and the `mapper !== 'contour'` gate.
   - Keep `mkEndQ`.
   - Keep the flush line **verbatim**: `for (let qi = 0; qi < mkEndQ.length; qi += 1) mkEndQ[qi]();`. The golden contrast mutation needles it.
2. **New constants** beside `MK_TICK_*`:

```js
const MK_TICK_BC_MAXJ = 16;        // continuation positions per span end (guard; chains end by taper)
const MK_TICK_BC_EDGE_PEN = 2.0;   // outline clearance probe radius, pens (0.60 mm at pen 0.3)
const MK_TICK_BC_ADMIT_PEN = 1.0;  // refuse (and END the chain) if any walked point is within this of ANY ink
const MK_TICK_BC_DIR_CUT = 10;     // degrees; END the chain if a tick's walked chord departs further from asked
const MK_TICK_BC_SCAN_MM = 0.05;   // envelope scan step
```

3. **Add `e: 0` to `mkClipArm`.** It is the edge-clearance radius in mm, set only by `bcSide`.
4. **Add an edge probe in `walkPoly`.** Define before `walkFrom`:

```js
const mkEdgeOK = (sm, pr, r) => {
  const f = frameFrom(sm, fr0.ld, fr0.st, pr); if (!f) return false;
  for (let q = 0; q < 8; q += 1) {
    const pp = f.toParam(Math.cos(q * Math.PI / 4) * r, Math.sin(q * Math.PI / 4) * r);
    if (!(pp.a >= 0 && pp.a <= 1)) return false;
    let bb = pp.b; if (bb < 0 || bb > 1) { if (bb < -0.25 || bb > 1.25) return false; bb = ((bb % 1) + 1) % 1; }
    const z = sampleAt(pp.a, bb); if (!z || z.front !== wantFront) return false;
  }
  return true;
};
```

   In `walkFrom`, directly after the `mkInkHit` truncation line:

```js
if (clipOn && mkClipArm.e && !mkEdgeOK(hit.sm, hit.pr, mkClipArm.e)) { truncated = true; break; }
```

   Extend the `walkPoly` return with:

```js
hub: w0.pts.length, hubTrunc: toHub.truncated,
hubClear: mkClipArm.e ? mkEdgeOK(hubFr.smp, hubFr.pr, mkClipArm.e) : true
```

   Every existing caller leaves `e = 0`, so the probe is dead code for them. Measured: `off` reproduces base signatures on 12/12. The extra return fields are unused by existing callers.

5. **Stash the boundary tick's drawn length.**
   - Declare `let mkMainDrawn = 0;` next to `const isWalkedShape`.
   - In `layMark`'s tick block, after `const pieceLen = place(...)`, add `if (si === mainIdx) mkMainDrawn = pieceLen || 0;`.
   - **Do not edit the `tickSites.push` line.** It is `HOOK_NEEDLE` in `spacing-tone`.
6. **Lattice-loop bookkeeping** (assignments only):
   - When `ao < firstA`, record `firstA, firstK = idxAt(ao), firstSv = sv, firstD = mkMainDrawn`.
   - Each site records `lastK, lastSv, lastD`.
   - The item-8 end tick records `endK = s1, endSv = svEnd, endD = mkMainDrawn`.
7. **Queue**, gated `law.shape === 'tick' && !mkWedgeActive && s1 > s0 && Number.isFinite(firstA) && Number.isFinite(endA)`, with **no mapper gate**:

```js
if (firstSv) mkEndQ.push(() => bcSide(firstK, -1, firstA, firstSv.P, firstSv, firstD));
if (endSv) mkEndQ.push(() => bcSide(endK, 1, endA, endSv.P, endSv, endD));
else if (lastSv) mkEndQ.push(() => bcSide(lastK, 1, lastA, lastSv.P, lastSv, lastD));
```

8. **`bcSide` reference implementation.** This is the measured code; port it, do not re-invent it. It is defined beside the old SEC site, inside `emitMarks`:

```js
const bcSide = (kB, dir, aB, Pc, svB, Lb) => {
  if (!svB || !svB.segs || !svB.segs.length || !(Pc > 0) || !Number.isFinite(aB)) return;
  const fr0 = frameAt(kB); if (!fr0) return;                 // the band's OWN frame at its boundary site
  const LPF = MK_TICK_PLOT_FLOOR * MIN_MARK_MM;
  const cOut = MK_TICK_BC_EDGE_PEN * w; const admitR = MK_TICK_BC_ADMIT_PEN * w;
  let lo = Infinity; let hi = -Infinity;                      // the band's OWN extent at its end
  svB.segs.forEach((q) => { lo = Math.min(lo, q[0]); hi = Math.max(hi, q[1]); });
  let Lprev = Lb > 0 ? Lb : Infinity;                         // never longer than the band's last drawn tick
  const onF = (u, v) => { /* fr0.toParam(u,v) -> a in [0,1], b wrap (±0.25), sampleAt(...).front === wantFront */ };
  const arcOf = (pts, i0, i1) => { let L = 0; for (let i = i0 + 1; i <= i1; i += 1) L += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y); return L; };
  const admit = (pts) => { /* SEC's admit(): false if any mkInk point (ANY lineIndex) within admitR of any pts[i] */ };
  for (let j = 1; j <= MK_TICK_BC_MAXJ; j += 1) {
    const uOff = aB + dir * j * Pc - arcMM[kB];               // the band's own lattice, same P, same phase
    // (i) on-front run of the envelope at this along-offset (longest run of the MK_TICK_BC_SCAN_MM scan of [lo,hi])
    // ... bLo/bHi = longest on-front run; if none or bHi-bLo < LPF -> break;  lo = bLo; hi = bHi;
    // (ii) measured dry walk: full ink clip + edge probe
    mkClipArm.m = true; mkClipArm.p = true; mkClipArm.rm = 0; mkClipArm.rp = 0; mkClipArm.e = cOut;
    const dry = walkPoly(fr0, uOff, 0, [[0, lo], [0, hi]], MK_TICK_STEP_CAP_MM);
    mkClipArm.m = false; mkClipArm.p = false; mkClipArm.e = 0;
    if (!dry.pts || dry.hubTrunc || !dry.hubClear) break;
    const hubV = 0.5 * (lo + hi);
    lo = Math.max(lo, hubV - arcOf(dry.pts, 0, dry.hub));     // each END shrinks to where its arm actually stopped
    hi = Math.min(hi, hubV + arcOf(dry.pts, dry.hub, dry.pts.length - 1));
    if (hi - lo > Lprev) { const f = Lprev / (hi - lo); const m = 0.5 * (lo + hi); lo = m - (m - lo) * f; hi = m + (hi - m) * f; }
    if (!(hi - lo >= LPF)) break;                             // chain ends by tapering below the plot floor
    Lprev = hi - lo;
    const segs = svB.segs.length === 1 ? [[lo, hi]]
      : svB.segs.map((q) => [Math.max(q[0], lo), Math.min(q[1], hi)]).filter((q) => q[1] - q[0] >= 2 * w);
    let stop = false;
    segs.forEach((q) => {
      if (stop) return;
      const poly = [[0, q[0]], [0, q[1]]];
      mkClipArm.m = true; mkClipArm.p = true; mkClipArm.rm = 0; mkClipArm.rp = 0; mkClipArm.e = cOut;
      const wk = walkPoly(fr0, uOff, 0, poly, MK_TICK_STEP_CAP_MM);
      if (wk.pts && admit(wk.pts) && dirOK(wk, poly, uOff)) place(fr0, [poly], uOff, 0); else stop = true;
      mkClipArm.m = false; mkClipArm.p = false; mkClipArm.rm = 0; mkClipArm.rp = 0; mkClipArm.e = 0;
    });
    if (stop) break;                                          // END the chain — never a hole mid-chain
  }
};
// dirOK: requestedDir(fr0, uOff, 0, poly) vs the walked chord (pts[0]→pts[last]); false if > MK_TICK_BC_DIR_CUT degrees.
```

Notes on the reference implementation:
- The scan (`onF`) positions the hub inside the on-surface part of the band.
- The dry walk measures where each end actually stops. The stop is caused by neighbour ink (full-radius clip, other rows) or by the 0.6 mm edge probe.
- The envelope only ever shrinks, which is the taper.
- **Positions between s0 and `firstA` are included** (§2.4.1): they are the band's own lattice lead-in.

### 3.2 Measured: `bc` (clearance 2.0w, no 10° cut) against base, 12 cells, d=50

"Chains/ticks" counts continuation chains and ticks. Seam, direction and taper use the exact span-keyed metric of §4.2.

| cell | tip base→bc | mark base→bc | sites | ink base→bc | chains/ticks | OUTLINE min mm | SEAM | DIR excess ° | TAPER viol. |
|---|---|---|---|---|---|---|---|---|---|
| create sphere/hatch | 0.0936→0.0931 | 0.1655→0.1645 | = | 2910→2918 | 2/4 | 0.377 | 1.04 | 2.1 | 0 |
| create sphere/contour | 0.0217→0.0215 | 0.0493→0.0487 | = | 2816→2845 | 5/8 | 0.370 | 1.45 | 4.5 | 0 |
| create torus/hatch | 0.0352→0.0352 | 0.0704→0.0704 | = | 686→686 | 0/0 | – | – | – | 0 |
| create torus/contour | 0.2532→0.2410 | 0.4937→0.4699 | = | 888→902 | 6/8 | 0.297 | 1.63 | 0.8 | 0 |
| **create cone/hatch** | 0.0698→0.0652 | 0.1266→0.1182 | = | 1495→1542 | 4/22 | **0.345** | **1.09** | **0.3** | **0** |
| create cone/contour | 0.0420→0.0414 | 0.0894→0.0882 | = | 1503→1517 | 5/5 | 0.436 | 0.68 | −0.5 | 0 |
| test sphere/hatch | 0.0625→0.0622 | 0.1134→0.1129 | = | 1874→1877 | 2/2 | 0.351 | 1.02 | 3.4 | 0 |
| test sphere/contour | 0.0430→0.0421 | 0.0814→0.0798 | = | 1793→1823 | 6/9 | 0.374 | 1.11 | 3.7 | 0 |
| test torus/hatch | 0.1320→0.1311 | 0.2515→0.2500 | = | 1694→1698 | 2/3 | 0.318 | 1.09 | 4.3 | 0 |
| test torus/contour | 0.0609→0.0587 | 0.1437→0.1386 | = | 1658→1683 | 6/12 | 0.215 | 6.49* | 28.2* | 0 |
| **test cone/hatch** | 0.0449→0.0423 | 0.0899→0.0845 | = | 1308→1354 | 4/17 | **0.466** | **1.13** | **6.0** | **0** |
| test cone/contour | 0.0386→0.0379 | 0.0833→0.0818 | = | 1346→1364 | 5/6 | 0.370 | 1.03 | 3.0 | 0 |

\* **test torus/contour, li13/li16 at the torus limb.** The seam metric's reference spacing is about 0 there because two main ticks share one arc position. The band's only on-surface part sits 4 mm off to one side, so a single 0.87–0.95 mm continuation tick lands there at a 29° angle. **Show this one to Jay in the pictures (§6).** The planner does not know how it reads.

**Wedges (A1):**

| fixture | bare ≥0.75 mm (W_L / W_R) |
|---|---|
| create base | 8.295 / 7.513 |
| create SEC | 0.115 / 0.100 |
| create bc | **0.000 / 0.000** |
| create bc + 10° cut | **0.063 / 0.000** |
| test W_R: base → SEC → bc | 4.683 → 0.888 → 0.443 |

The bare area at ≥0.5 mm is also measured (bc create W_R 0.40–0.97 depending on clearance, 1.6w vs 2.0w). A1 does not gate it.

**Tone (A4 raster ratio, wedge window over the adjacent strip):**

| rig | L / R |
|---|---|
| create bc | 0.951 / 1.154 |
| test bc | 0.867 / **1.200** |
| create SEC (for comparison) | 0.910 / 1.133 |

**Sites and over-length:**
- `tickSites` + `[I,R,P,L,drawn]`: byte-identical on 12/12 at d=50 and 8/8 at d=220 (the 4 B7 cells × 2 rigs).
- over2RP 0 and subMin 0 on 12/12 at d=50.
- d=220 over2RP equals base on 8/8 (0/2/2/1 create, 0/4/1/0 test); subMin 0.

**`bandC` (gated contour cells):**

| cell | base → bc | pinned ceiling | mkDotScreen reading |
|---|---|---|---|
| create sphere/contour | 0.04066 → **0.06292** | 0.04676 (**exceeded**) | 0.06855 (passes) |
| create cone/contour | 0.02181 → 0.02181 | 0.02508 | – |
| test sphere/contour | 0.04782 → 0.04226 | 0.05500 | – |
| test cone/contour | 0.02676 → 0.02676 | 0.03078 | – |

**`mark-laws-draw` O2** (test rig, sphere/hatch d=1, bar ≤0.20): base 0.1849 (27/146) → bc 0.1959 (29/148) → **bc + 10° chain-stop cut 0.1849 (27/146)**. The cut is required for headroom. At d=50: 0.0602 → 0.0599.

**The seam/taper story on the two chains Jay photographed (create, bc):**
- **li19 (W_L).**
  - The last band tick is at +0.24 and the continuation starts at −0.28: a 0.52 mm step against P 0.538.
  - Angles run 133.9° (band) → 132.6° → 131.5° → … → 123.4°, the band's own ≈1.1° per tick.
  - Lengths run 4.92 (band) → 4.21, 3.86, 3.54, 3.19, 2.87, 2.51, 2.20, 1.92, 1.60, 1.07, 0.80, then the chain ends below the plot floor.
  - The rim is ≥0.47 mm away throughout.
- **li16 (W_R/G2a).**
  - The last band tick is at +0.59 and the continuation starts at −0.03: 0.62 mm against P 0.631.
  - Lengths run 4.51 → 3.87, 3.55, 3.19, 2.87, 2.51, 1.57, 1.05, then end.
  - The rim is ≥0.52 mm away.

### 3.3 Levers measured and rejected

| lever | why rejected |
|---|---|
| Flat-frame clearance only (pull the tick ends back by c along v, or trim c of arc off the walked tick) | Outline min stayed 0.002 / 0.188 mm. A tick running parallel to an outline gets no closer or further by being shortened along its own length. |
| c = 1.6w | Outline min 0.207–0.345 on the cone. |
| Ink clip filtered by `lineIndex` only (no all-ink admission) | Contour tip contact exploded: create sphere/contour 0.0217 → 0.1086, torus/contour 0.25 → 0.36. Continuations ran into the same ruling's other spans. |
| No 10° cut | O2 0.1959 (knife-edge). |

## §4 Bars (fixture §1 on every row). "Gates" names the clause; the mutation must trip.

### 4.1 Bar table

| id | status | clause it gates (and what it does NOT gate) | bar | population | measured bc | mutation (must trip) |
|---|---|---|---|---|---|---|
| **A1** | kept, BLOCKING | "fill the cone base wedges". Not tone, not seam. | bare ≥0.75 mm ≤ 0.50 mm² in each of W_L and W_R | create cone/hatch | 0.000/0.000 (cut: 0.063/0.000) | `off` (flush removed) → 8.295/7.513 |
| A1t | kept, reported | same, RGR rig | W_R ≤ 1.5 | test cone/hatch | 0.443 | `off` → 4.683 |
| **A2** | kept, BLOCKING | "do not touch the master grid". Only sites, not ink. | `tickSites` + hook records md5 = `off` | 12 at d=50 + 8 at d=220 | 20/20 identical | `inline` (closures run at queue time) → differs on create cone/hatch, create cone/contour, test cone/hatch (d=50) and create/test torus/contour (d=220) |
| **A3** | kept, BLOCKING, **population widened to include contour** | "minimize tick contact". Only the continuation-added contact. | tip ≤ off+0.005, mark ≤ off+0.01 | 12 at d=50 | never above off; best improvement −0.0122 tip on create torus/contour | `noadmit` → create cone/contour tip 0.0420 → 0.1663; test cone/contour 0.0386 → 0.1011 |
| **A4** | CHANGED | "tone by spacing — the wedge is not over-inked". Only over-inking. | ≤1.20: **create BLOCKING; test demoted to REPORTED** | create + test cone/hatch | create 0.951/1.154; test 0.867/1.200 | `dense` (P×0.4, admission off) → create R 1.321 |
| **A5** | kept, BLOCKING | "a tick is not a line" + plot floor | over2RP = 0 and subMin = 0 at d=50; d=220 over2RP ≤ off, subMin = 0 | 12 + 8 | 0/0; d=220 = off | an `ask6`-style mutant (envelope seeded ±3·RPn, length cap off). **Implementer measures it.** If it is vacuous on all 12 cells, say so; do not invent a trip. |
| **SEAM** | NEW, BLOCKING | "continue the existing ticks' spacing so there is no seam / no bare channel". Not direction, not taper. | per chain, first continuation tick j₁ = 1, and s ≤ **1.35** (s defined in §4.2). On this fixture that is ≤0.85 mm centre-to-centre, ≤0.55 mm bare. | create + test cone/hatch | 1.09 / 1.13, j₁ = 1 on all chains | `skip1` (start at j=2) → 2.07 / 1.99. The shipped SEC reads 2.49 / 2.64. |
| **DIR** | NEW, BLOCKING, sub-clause of SEAM | "continue the existing ticks' direction". **SEC passes this** (0.8/1.2): direction was not SEC's failure; it guards the redo. | per chain, ∠(boundary, first)/j₁ − ∠(inner, boundary) ≤ **8°** | create + test cone/hatch | 0.3 / 6.0 | `rot` (tick asked at θ = 0.2 rad) → 10.8 / 10.9 |
| **TAPER** | NEW, BLOCKING | "shorten gradually toward the rim". Main-piece lengths only, not positions. | along each chain, starting at the boundary tick's drawn length, main-piece drawn length is non-increasing (tolerance 0.05 mm) | **all 12 cells** | 0 violations on 12/12 | `wide` (envelope seeded 1.0 mm past the band's extent, length cap and carry off) → trips on 11/11 cells with chains; create cone/hatch +0.13, test cone/hatch +0.12. (`nocarry` alone is **vacuous**: identical to bc on 12/12, because the rim cut is geometrically monotone. The length cap and carry are kept as guards; say so.) |
| **OUTLINE** | NEW, BLOCKING | "stay off the outline". Continuation ticks only; the band's own ticks reach 0.000 on every cell and are disclosed, not gated. | min centreline distance from any continuation-tick point to any `sceneEdge` polyline ≥ **0.30 mm** (= w: the two strokes cannot touch) | create + test cone/hatch | 0.345 / 0.466 | `noprobe` (e = 0) → 0.001 / 0.000. The shipped SEC reads 0.001 / 0.006. |
| I1 | kept, BLOCKING | isolation | md5 = `off` for non-mkTick laws × 8 mappers × 3 primitives, create d=50 (864 cells) | 288/296 per primitive | **re-measure** (the probe is gated on `mkClipArm.e`, which only `bcSide` sets) | `nogate` (drop `law.shape === 'tick'` from the queue gate) changes an mkDashRamp cell. Re-prove it. |
| I2 | kept, reported | mkTick on the other 6 mappers | tip/mark ≤ off+0.005, over2RP ≤ off, subMin 0 | 18 cells, create d=50 | **not measured by the planner** | – |
| O2 (`mark-laws-draw`) | existing, unchanged | tick tracks the frame | ≤0.20 | test sphere/hatch d=1 and d=50 | 0.1849 with the cut (0.1959 without) | the cut removed → 0.1959 (headroom evidence, not a trip) |

**Reported, not gated, with this rationale** (rule 2): on the other 10 cells, SEAM and DIR are unstable. At limbs and on contour, two main ticks can share an arc position, so the reference spacing collapses (test torus/contour s = 6.49, 28.2°).
- **Gating coverage:** SEAM/DIR/OUTLINE gate 2/12 cells (create + test cone/hatch, where the blemishes are). TAPER gates 12/12. A2/A3/A5 gate 12/12 plus the d=220 set.
- **Reported OUTLINE minima on the other cells:** 0.215–0.436 mm. All silhouette-class. All are ≥ the band's own 0.000–0.002.

### 4.2 Chain metric (port it; it replaces SEC's reconstruct-from-paths grouping, which the planner found conflates spans)

Group chains by **exact span identity**, not by `(lineIndex, dir)`. On contour, one ruling has up to 4 span ends: the path-reconstructed grouping produced false taper "violations" of +2.56 mm and wrong boundary ticks. Implementation:

- **Test-side needle 1**, at `pushRun(r, back, lineIndex);` inside `place()`: record `{pts, li, tag: globalThis.__TAG}`.
- **Test-side needle 2**, around the regular tick placement `const pieceLen = place(fr, [poly], a - arcMM[k], thetaAt(k, fr));`: set the tag to `'reg:' + (si === mainIdx ? 'M' : 's') + ':' + a.toFixed(4)`.
- **Test-side needle 3**, in `bcSide` around `place(fr0, [poly], uOff, 0)`: set the tag to `'cont|' + dir + '|' + kB + '|' + aB.toFixed(4) + '|' + j + '|' + pieceIdx`.
- Each needle asserts count === 1.

Definitions:
- The **boundary tick** is the `reg:M` record whose `a` equals `aB`.
- The **inner neighbour** is the nearest `reg:M` of the same `li` with `(a − aB)·dir < 0`.
- `perp(h₁, h₂)` = |(mid₂ − mid₁) · n₁|, where n₁ is the normal to h₁'s chord.
- **s** = perp(boundary, first) / (j₁ · perp(boundary, inner)).
- **Direction excess** = ∠(boundary, first)/j₁ − ∠(inner, boundary), using unsigned chord angles mod 180.
- **Taper** uses the longest piece per j.
- **OUTLINE** = point-to-segment distance against every `sceneEdge` path.

### 4.3 `## Bars changed` entries this unit must carry (rule 6)

1. `tests/unit/scene3d-mktick-banding.test.js` `PRE_RANK1_BANDC['create|sphere/contour']`: **0.04676 → 0.0661**.
   - Why: Jay's ruling includes the contour mapper. Measured 0.06292 = base 0.04066 + continuation ticks at 5 span ends.
   - The margin is **+5%**, not the file's usual +15%, because +15% (0.0724) would sit above the separately gated mkDotScreen reading (0.06855) and make the ceiling inert. The mkDotScreen bar stays gated and unchanged.
   - **Contrast mutation:** `gate` (restore `mapper !== 'contour'`) returns 0.04066 ≤ the OLD ceiling 0.04676. That proves the rise is the contour inclusion.
   - The other three `PRE_RANK1_BANDC` entries are unchanged, and their cells pass with margin (values in §3.2).
2. `tests/unit/scene3d-mktick-spacing-tone.test.js` A4, test rig: **BLOCKING → REPORTED** (population narrowed).
   - Why: measured 1.200 at the 1.20 bar. A4's raster numerator includes the rim stroke inside W_R and the strip has none.
   - BC's tone is continued by construction (same segs, same P, envelope only shrinks).
   - The create rig stays blocking at 1.20.
3. The same file: A3 population **widened** to the 6 contour cells (they were gated off in T2-8b).
4. The same file: **NEW** SEAM, DIR, TAPER and OUTLINE, as in §4.1. The T2-8b describe block's SEC needles (`T28B_NEEDLES`) are replaced by BC needles, and the old mutants (`ask6`, `dense`, `noadmit`, `inline`, `nogate`, `off`) are re-targeted to BC lines.
5. `tests/helpers/scene3d-mktick-spacing-tone.js`: add `chainMetrics(records, paths)` for §4.2 (pure math, no fs/git).
6. The goldens (§5).

## §5 Golden re-pin list (rule 4: every pin's fixture checked, not the law name)

`tests/unit/scene3d-mktick-wedge.test.js` `EXPECTED_SIGNATURE` uses `pathSignature(paths, 4)` on 12 cells: d=50, sphere/torus/cone × hatch/contour × test/create, the same fixture as §1. BC changes 11 of 12 relative to base. Only `create|torus/hatch` is byte-identical to base, because it has no chains.

Relative to the branch's current pins:
- **11 entries get new hashes**, including the 8 that SEC never moved (both sphere/hatch cells and all 6 contour cells).
- **`create|torus/hatch` reverts** from SEC's `a012f8bb…` to the base hash `5bbcd92a3428377208aadcaf7299fcd37ed694be36723f133d64f3702b3bb1a2`.

**Provisional BC hashes** (bc WITHOUT the 10° cut; **the implementer must re-derive them on the final tree**, because the cut may move sphere/hatch or cone cells):

- `test|sphere/hatch` c38503f0ed51e064a8df8b6012e27e9bef21da320d49e8f14ffc3b53eb7841d1
- `test|sphere/contour` 9fc7409939096d5f61ef4e82e9efda19bf4cf67dc9e56dc2a4553a10efd351f1
- `test|torus/hatch` b1cea7cee9c29070ef7f96cbee295b9f3bb96f45aa47076d51b7656c0affa063
- `test|torus/contour` b71efe16904838e829477bf5940ac7cb40c89923408ce2310373e98ca42e42f5
- `test|cone/hatch` cb4cea191e4927914ba7a118c2b210f993a18466198425cf205a5e6ededd57d8
- `test|cone/contour` d6d39abb90e7497c34bf4ec5c37e45119fbe1cc59226ad05d00c388aef884aea
- `create|sphere/hatch` b941d4e04357816079f312b3999564f632d7341a4f763db737264052082353ac
- `create|sphere/contour` 7de54e4535356954b9405b9eb2d38c3a391cb115f7a15a1d72d30927b9f62c14
- `create|torus/hatch` 5bbcd92a3428377208aadcaf7299fcd37ed694be36723f133d64f3702b3bb1a2 (= base)
- `create|torus/contour` 1dbf63b0dcf35314697e804e6cbcf9b7f77c10e12f7878f2c2bfe13af1dc7c35
- `create|cone/hatch` b9de9eeb8b0ea3d656beec668d4c5f12698b33dfae7b88f49226deae23c8b5b2
- `create|cone/contour` 28fbd55dd608d9dd57b066cce90c8f3a45f789fd4b79386d0589af40cd5f52d1

**Contrast mutation (keep as is):** removing the flush returns `PRE_T28B_SIGNATURE` on 12/12. Measured: the `off` signatures equal `PRE_T28B_SIGNATURE` on all 12.

**Other pins to grep; fixtures to check:**
- `scene3d-mktick-banding` (above).
- `scene3d-mktick-band-purity`: its tick-gate needle and roster md5 are non-mkTick; expected unchanged, run it.
- `scene3d-mark-laws-draw`: O2 plus the other O-bars on sphere/cone/torus mkTick, test rig, d=1/50. Run them; the sphere/hatch and cone cells now carry continuation ticks.
- `scene3d-mktick-runaway`: its `FIX_NEEDLE` is the `place()` walk call, which is untouched.
- `scene3d-one-pen-down-reachability`.
- `scene3d-tone-law-collapse` (Tier 1).
- `tests/integration/scene3d-fill-style-picker.test.js`: grep it for mkTick contour/hatch pins.

## §6 Pictures (Jay's eye is the acceptance test)

- **Tool:** `scripts/audit/scene3d-capture.js --tier B --rig create`, mkTick, med, angle a.
- **Three-way side-by-sides:** BASE (`git archive` of `8b8f275e`) | SEC (rejected, `git archive` of `9d217ed0`) | BC (the lane).
- **Cone/hatch:**
  - `JAY_T28b2_cone.png`.
  - Native 3× crops: G2a (330,600,480,745), G2b (470,560,620,720), W_L (130,650,330,749).
- **Because contour is now included:** cone/contour, sphere/contour, torus/contour side-by-sides (create). Also test-rig torus/contour with the li13/li16 limb ticks called out (§3.2 \*).
- **Sphere/hatch:** it now changes (2 chains, 4 ticks on create). Label it honestly: "G5 not addressed; 4 continuation ticks added at other span ends".
- **Evidence** goes to MAIN `docs/3d-audit/fill-audit/after/T2-8b-2/` with a `report.json` carrying the §1 fixture, rig per number and "ground DISABLED".

## §7 Implementer brief (single unit). The orchestrator pastes §0 + §0b verbatim above this.

**Worktree/branch.** Continue on `3d-scene/fill-audit-a6` from `9d217ed0`. The test scaffolding and bare-area helper are already there.
- RED comes from a `git archive` export of `9d217ed0`, never a stash or in-place revert.
- The new SEAM and OUTLINE bars must FAIL on that export (SEC: 2.49/2.64 and 0.001/0.006).
- Record in the report whether TAPER and DIR fail on the SEC tree (the planner measured TAPER on the test cone only with the old metric: 2 violations; DIR passes on SEC, as §4.1 says).
- Reproduce any pre-existing red at `9d217ed0` under `## Pre-existing red` (the T2-8b report says none).

**Source** (`src/core/scene3d/surface-fill.js` only):
1. Remove SEC (§3.1 item 1).
2. Add the constants (§3.1 item 2).
3. Add `mkClipArm.e`, `mkEdgeOK` and the `walkFrom` probe line, and extend the `walkPoly` return (§3.1 items 3–4).
4. Add the `mkMainDrawn` stash (item 5). **Do not touch the `tickSites.push` line.**
5. Add the loop bookkeeping and queue (items 6–7), with **no mapper gate**.
6. Port `bcSide` as in item 8, **including the 10° chain-stop cut** (`dirOK`).
7. Keep the flush line verbatim.

**Tests:**
1. Port `chainMetrics` (§4.2) into the helper.
2. In `scene3d-mktick-spacing-tone.test.js`, replace the SEC block with a "T2-8b-2 BC" block. It covers A1, A1t, A2, A3 (12 cells incl. contour), A4 (create blocking, test reported), A5, SEAM, DIR, TAPER, OUTLINE, I1 and I2.
   - Each bar states in a comment the clause it gates and the clauses it does not.
   - Each bar has a needle-patched mutant, count asserted === 1, that trips. The mutants are `off`, `inline`, `noadmit`, `dense`, `skip1`, `rot`, `wide`, `noprobe`, `nogate`, `gate`, and an `ask6`-style mutant.
   - **If a mutant is vacuous, say so; do not fake a trip.**
3. Re-pin the wedge goldens per §5, with the contrast test kept.
4. Re-pin `bandC` per §4.3 item 1, with the `gate` contrast mutation as a test in the banding file.

**STOP and report instead of proceeding if any of these happens:**
- any `tickSites` record changes on the 20 runs;
- any tip contact rises above off+0.005 on any of the 12 cells;
- OUTLINE < 0.30 on create or test cone/hatch;
- create|sphere/contour `bandC` exceeds the mkDotScreen reading, or any other gated `bandC` exceeds its unchanged ceiling;
- O2 exceeds 0.20;
- A1 exceeds 0.50;
- any T2/T3/T4 named set would need to grow.

**Run** each file in the foreground with `timeout: 600000`: spacing-tone, mktick-wedge, band-purity, mark-laws-draw, mktick-runaway, mktick-banding, one-pen-down-reachability, fill-style-picker (integration), and tone-law-collapse (Tier 1, singleFork).

**Report** to MAIN `docs/3d-audit/lane-reports/T2-8b-2-impl.md` with:
- `## Bars changed` (§4.3, file:line — old → new — why, in the report AND the commit body);
- `## Pre-existing red`;
- sweep coverage as fractions: 864/864 non-mkTick md5; 8/8 mkTick mappers (12 d=50 cells gated + 18 I2 cells reported); d=220 on the 8 B7 runs;
- the fixture and rig on every number, with "ground DISABLED" stated;
- the §6 pictures, looked at before claiming anything.

Never push, merge, tag or bump.

### Critical Files for Implementation
- /Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a6/src/core/scene3d/surface-fill.js
- /Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a6/tests/unit/scene3d-mktick-spacing-tone.test.js
- /Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a6/tests/unit/scene3d-mktick-wedge.test.js
- /Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a6/tests/unit/scene3d-mktick-banding.test.js
- /Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a6/tests/helpers/scene3d-mktick-spacing-tone.js
