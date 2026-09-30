# T2-8b-3: plan. Endpoint envelope: continuation fills open non-highlight space; ends sit at a constant offset from the outline or the nearest band

Planner (Opus), read-only. The orchestrator writes this to disk verbatim from the planner's hand-back.

- **Base for this unit:** branch `3d-scene/fill-audit-a6` @ `b274d395` (T2-8b-2b), worktree `.claude/worktrees/fill-audit-a6`.
- **Jay's ruling (2026-09-29, binding, verbatim):** "The goal is that it should fill open spaces where highlight isn't needed and should form a consistent set of endpoints evenly offset from the perimeter or closest band."
- **Still binding (Jay, 2026-09-28):** "It must continue the band but truncate the top/bottom gradually as they approach another band or a side."
- **Kept binding:**
  - A2 `tickSites` byte-identical.
  - B5 and every T2-7 bar.
  - Contact ≤ base+0.005.
  - OUTLINE ≥ 0.30.
  - SEAM / DIR / TAPER.
  - O2 ≤ 0.20.
  - Isolation: 864/864 non-mkTick md5.
  - **`bandC` ceilings UNCHANGED.**
  - Sphere G5 is a separate prototype; the envelope rule reaching it is NOTED (§3.4), not claimed.

## §0 THE BINDING CHECKLIST

The orchestrator pastes `ROUND3-RESUME-BRIEFS.md` lines 34–67 (§0) and §0b verbatim here and again in §7. The §0b sentence, verbatim:

> Run every vitest file in the FOREGROUND with the Bash tool parameter `timeout: 600000` (ten minutes). Never use run_in_background, never arm a Monitor and end your turn. If a file still exceeds ten minutes, kill it and rerun alone with `--pool=forks --poolOptions.forks.singleFork=true`, again with `timeout: 600000`.

Tier-1 exception: `tests/unit/scene3d-tone-law-collapse.test.js`. Start it with singleFork and `timeout: 600000`, let the tool background it at the ceiling, and read the completion notification.

## §1 Fixture for every number (rule 3)

**Render.** `algo.generate(params, null, null, BOUNDS)` in node JSDOM (`tests/helpers/load-vectura-runtime`).
- The `surface-fill.js` source is read from `fill-audit-a6` @ `b274d395` and patched **in memory only** (scriptOverrides). Nothing was written to disk.
- **BOUNDS:** 1200×1000, m=20, pen 0.3.
- **Params:** `buildSceneParams` exactly as in `scene3d-mktick-spacing-tone.test.js`: `toneLaw: 'mkTick'`, `fillAngle: 45`, `fillDensity: 50` (d=220 and d=1 only where stated).
- **Camera:** `Params.DEFAULT_CAMERA` (gallery angle a).
- **Light:** one SUN, az 135 / el 45, `tone.enabled: true`.
- **Ground and backdrop are DISABLED. No ground-plane ink is in any number.** "Ink" = object ink = `sceneFill` + `sceneEdge` path length in mm.
- **Rigs:**
  - `create` = `PRIMITIVE_PARAM_DEFAULTS ⊕ PRIMITIVE_CREATE_DEFAULTS` (the gallery/Jay rig).
  - `test` = `PRIMITIVE_PARAM_DEFAULTS` only (the RGR/addLayer-equivalent rig).
- **O2** uses `mark-laws-draw`'s own builder: test rig, sphere/hatch.

**Variants.**

| variant | definition |
|---|---|
| `OFF` = base | the flush line `for (let qi = 0; qi < mkEndQ.length; qi += 1) mkEndQ[qi]();` removed; its output is the pre-T2-8b (`8b8f275e`) output |
| `BC1` | `git show 8d11044d:src/core/scene3d/surface-fill.js` |
| `SHIP` | disk `b274d395` |
| `NEW` | the §3 mechanism |

**Cells.** 12 = {create, test} × {sphere, torus, cone} × {hatch, contour}.

**Windows (mm).**
- W_L [588,519,599,528], W_R [603,518,614,528].
- Strips [588,510,599,519] and [603,509,614,518].
- G5 [606,510,625,525.5].
- G1-base [578,518,586,526].

**Instruments** (the planner's scripts; the port specification is in §4.2):
- `buildBareRaster`/`bareArea`/`inkCoverage`/`contact`/`over2RP`/`subMinCount` from `tests/helpers/scene3d-mktick-spacing-tone.js`.
- `measure()` from `tests/helpers/scene3d-mktick-band.js` (bandC).
- Chain records via the existing REC needles, **extended** as in §4.2.

## §2 Root cause of the W_L remnant and the orphan (measured, create cone/hatch, SHIP `b274d395`)

**Geometry of W_L.**
- The remnant triangle is bounded by the base rim (drawn at y≈527.45 around x≈597) and by the lower-left ends of the li16 band. Those ends descend from (595.48,524.29) to (599.54,527.09) and reach the rim at x≈599.5.
- On its left, the triangle is bounded by the li19 continuation chain. That chain runs right along the rim.
- The chain's ticks are squeezed between two boundaries, the rim below and li16's end-line above. Their available length falls linearly to 0 at x≈599.5. It is a closing wedge.

**The orphan.**
- The tick is `c|-1|22|10|RA`: mid (596.79,526.43), 0.73 mm long.
- Chain mids: j8 595.27, j9 595.78, RA 596.79. The perpendicular spacing from j9 is **1.85 × P** (P_B 0.538), against 0.96–1.04 P for j1..j9.
- **Cause:** `reAnchor` builds its fresh frame at `fr0.toParam(uOff, hubV)`. That is a single **flat** jump of about 5.4 mm. The hubs for j1..j9 were **walked** (`walkPoly`'s `toHub`). The flat jump overshoots by about 1 P, so the j=10 slot stays empty.
- j=11 is then refused and the chain ends. The 0.73 mm tick sits alone with a 1 mm gap on its inner side: the orphan.

**Why the ends are ragged (not an evenly offset set).** The distance from each stopped end to the drawn rim (outline class) is **0.340–0.848 mm, range 0.508**, on both SHIP and BC1 (create). On test the range is 0.611–0.832, **0.221**. Four measured causes:
1. **The walk is quantised.** Each end stops at the first 0.36 mm walk step (`MK_ARC_MM`) that trips the ink clip or the 8-probe edge circle, never at the boundary itself.
2. **The envelope never widens.** `lo`/`hi` only ever shrink (`lo = max(lo, …)`). When the rim bends away in the flat `fr0` frame, the end cannot follow it back.
3. **The length cap trims symmetrically.** The Lprev cap trims both ends equally, pulling an end off a boundary it had reached.
4. **Chains end for reasons unrelated to the envelope.** The 10° cut is measured against `fr0`'s flat direction (2b's finding), plus admission. So chains end before the envelopes meet.

## §3 Mechanism BC-E, "band continuation with an endpoint envelope" (replaces `bcSide` wholesale)

**Principle.** The lattice is continued exactly as before: the boundary site's P, phase (`aB ± j·P`), `segs` and tone. The change is in how a continuation tick is walked and where its ends stop.
- **Walk.** The tick is walked in its own **local** frame. Its hub marches one P per step from the previous tick's hub, in that hub's local frame.
- **Ends.** Each end walks toward the band's own extent `[lo0, hi0]`. It stops **exactly** at clearance c from the first boundary it meets, found by bisection:
  - `c_E = MK_TICK_BC_EDGE_PEN·w = 0.60 mm` from the outline (16-probe circle on the analytic front surface);
  - `c_B = MK_TICK_BC_BAND_PEN·w = (1+MK_TICK_GAP_PEN)·w = PMINT = 0.48 mm` from any other row's ink. PMINT is the band's own contact-free row seam, so continuation ends line up with the seams the band already draws.
- **Apex.** A tick whose two envelopes leave less than the plot floor (`MK_TICK_PLOT_FLOOR·MIN_MARK_MM` = 0.69 mm) ends the chain. This is "dropped only where the two envelopes meet".
- **Guards.**
  - A tick must be contiguous with the previous **drawn** tick: perpendicular spacing ≤ 1.35 P and direction within 10°. For j=1 the reference is the boundary tick's own drawn run.
  - A tick is never longer than its predecessor (TAPER). Unstopped ends are trimmed first.
  - No chain starts from a site with `I ≥ 2/3` (highlight).

### 3.1 Why these constants (measured, create cone/hatch unless stated)

| choice | measured reason |
|---|---|
| c_E = 2.0w (0.60) | OUTLINE ≥ 0.30 must hold against the **drawn** silhouette, which sits 0.1–0.25 mm (up to about 0.38 on test torus) inside the analytic limb. Measured outline-class ends: 0.606–0.646 on the rim. |
| c_B = PMINT (0.48) | With c_B = 2w, W_L bare ≥0.5 = **0.355 (fails the 0.30 WL bar)** and W_R = 0.423. With PMINT: 0.098 / 0.188. |
| HI_I = 2/3 (SP5's light third: `thirdsSplit` boundary on I∈[0,1]) | At 0.8 or 0.9, **create sphere/contour bandC = 0.0501 > the UNCHANGED ceiling 0.04676**. At 2/3 it is 0.04066 (= base). It also removes BC's li7 right-flank chain (I 0.874) and the contour limb chains at 0.72–0.80, which are highlight. At 0.4 (`MK_TICK_EDGE_MIN_I`), test cone/hatch loses the I 0.662 chain (FILL 30.5 vs 3.56) and 5 fill-bearing contour chains, so 0.4 is too aggressive. **Margin disclosed: that test chain is at 0.662, 0.005 under the gate.** |
| 16 probes, 6 bisections | 8 probes are anisotropic up to 7.6%. `nobisect` (0 iterations) widens the outline-class range 0.040 → 0.127 (create) / 0.035 → 0.240 (test). |
| Seed inside the previous tick's v-span (`ovl`) | Without it, the seed search jumps up to 4 mm laterally (test sphere/hatch j1 sP 4.43, DIR 44.5°). |
| Continuity guard vs the previous **drawn** tick | Measured against `fr0.v`/the ruling point instead (`rulingref`), it refuses the G1 chain (li1, 11.5° from `fr0.v`): create cone/hatch FILL 0.27 → 1.56. Measured against a dry re-walk of the boundary, it misses the torus limb. The drawn run is the only reference that matches what the eye (and the bar) sees. |
| Taper cap (never longer than the predecessor; trim unstopped ends first) | Without it, test torus/contour li19 j1 = 0.82 against a boundary drawn at 0.71: 1 TAPER violation. With it: 0.72, 0 violations. On the cone chains it is inert (lengths are already monotone). |

### 3.2 Source changes (all in `src/core/scene3d/surface-fill.js`)

**1. Constants.** Replace the T2-8b-2 BC constant block (≈l.2707–2727) with the following. Keep the comment style and state each constant's measured reason from §3.1.

```js
const MK_TICK_BC_MAXJ = 16;                        // guard; chains end at the apex
const MK_TICK_BC_EDGE_PEN = 2.0;                   // c_E: end offset from the outline, pens (0.60 mm)
const MK_TICK_BC_BAND_PEN = 1 + MK_TICK_GAP_PEN;   // c_B = PMINT: end offset from another row's ink (0.48 mm)
const MK_TICK_BC_ADMIT_PEN = 1.0;                  // contact guard vs ANY ink (unchanged)
const MK_TICK_BC_DIR_CUT = 10;                     // continuity: max turn vs the PREVIOUS drawn tick (was: vs flat fr0)
const MK_TICK_BC_SEAM = 1.35;                      // continuity: max perp spacing vs the previous drawn tick, in P
const MK_TICK_BC_SCAN_MM = 0.05;                   // seed scan step
const MK_TICK_BC_PROBES = 16;                      // outline-clearance probe count
const MK_TICK_BC_BISECT = 6;                       // end bisection iterations (0.36/64 = 0.006 mm)
const MK_TICK_BC_HI_I = 2 / 3;                     // SP5's light third: highlight, never continued
```

Delete `MK_TICK_BC_REANCHOR_J`.

**2. Remove BC's walk-probe plumbing.** Delete the following; `walkPoly` returns to its pre-`8d11044d` text:
- `mkClipArm.e`;
- `mkEdgeOK` and the `walkFrom` line `if (clipOn && mkClipArm.e && !mkEdgeOK(...)) ...`;
- the `hub/hubTrunc/hubClear` return fields.

The new `bcSide` carries its own probe. Nothing else read these fields; this is dead code after the swap.

**3. Stash the boundary tick's DRAWN run** (assignments only; site records untouched).
- Beside `let mkMainDrawn = 0;` add `let mkMainRun = null; let mkLastRun = null;`.
- In `place()`, immediately before `        mkStat.marks += 1; mkStat.ink += tot;\n        if (isWalkedShape) {`, add `mkLastRun = runs[0];`.
- In `layMark`'s tick block, replace `if (si === mainIdx) mkMainDrawn = pieceLen || 0;` with `if (si === mainIdx) { mkMainDrawn = pieceLen || 0; mkMainRun = pieceLen ? mkLastRun : null; }`. **Do not touch the `tickSites.push` line (HOOK_NEEDLE).**
- At the two `mkMainDrawn = 0;` resets in the lattice loop, add `mkMainRun = null;`.
- In the bookkeeping, rename `firstD/lastD/endD` → `firstR/lastR/endR`, initialise them to `null`, and assign `mkMainRun`. Pass them as `bcSide`'s last argument in the three `mkEndQ.push` lines.
- `mkMainDrawn` stays (it is still assigned) or is removed if it becomes unread. State which in the report.

**4. Keep the flush line verbatim.** `for (let qi = 0; qi < mkEndQ.length; qi += 1) mkEndQ[qi]();`. Keep the queue gate `law.shape === 'tick' && !mkWedgeActive && s1 > s0 && Number.isFinite(firstA) && Number.isFinite(endA)`.

### 3.3 `bcSide` reference implementation

This is the measured code (the prototype with the constants inlined). Port it; do not re-invent it.

```js
const bcSide = (kB, dir, aB, Pc, svB, Rb) => {
  if (!svB || !svB.segs || !svB.segs.length || !(Pc > 0) || !Number.isFinite(aB)) return;
  if (!(svB.I < MK_TICK_BC_HI_I)) return;                  // highlight: the tone asks for no fill here
  const fr0 = frameAt(kB); if (!fr0) return;
  const LPF = MK_TICK_PLOT_FLOOR * MIN_MARK_MM;
  const cE = MK_TICK_BC_EDGE_PEN * w; const cB = MK_TICK_BC_BAND_PEN * w; const admitR = MK_TICK_BC_ADMIT_PEN * w;
  let lo0 = Infinity; let hi0 = -Infinity;                  // the band's OWN extent (the "continue the band" cap)
  svB.segs.forEach((q) => { lo0 = Math.min(lo0, q[0]); hi0 = Math.max(hi0, q[1]); });
  const at = (fr, du, dv) => {                             // one short linear step in a LOCAL frame -> {sm, fr} or null
    const pp = fr.toParam(du, dv);
    if (!(pp.a >= 0 && pp.a <= 1)) return null;
    let bb = pp.b;
    if (bb < 0 || bb > 1) { if (bb < -0.25 || bb > 1.25) return null; bb = ((bb % 1) + 1) % 1; }
    const sm = sampleAt(pp.a, bb);
    if (!sm || sm.front !== wantFront) return null;
    const f = frameFrom(sm, fr0.ld, fr0.st, { a: pp.a, b: bb });
    return f ? { sm, fr: f } : null;
  };
  const nb = Math.max(1, Math.ceil(Math.max(cB, admitR) / mkInkR));
  const inkWithin = (x, y, r, anyLi) => {                  // mkInk query at radius r (other rows only unless anyLi)
    const cx = Math.floor(x / mkInkR); const cy = Math.floor(y / mkInkR);
    for (let dx = -nb; dx <= nb; dx += 1) {
      for (let dy = -nb; dy <= nb; dy += 1) {
        const bucket = mkInk.get(`${wantFront ? 1 : 0}:${cx + dx},${cy + dy}`);
        if (!bucket) continue;
        for (let h = 0; h < bucket.length; h += 1) {
          if ((anyLi || bucket[h].li !== lineIndex) && Math.hypot(bucket[h].x - x, bucket[h].y - y) < r) return true;
        }
      }
    }
    return false;
  };
  const edgeClear = (fr) => {                              // all probes at radius cE on the front surface
    for (let q = 0; q < MK_TICK_BC_PROBES; q += 1) {
      const th = (2 * Math.PI * q) / MK_TICK_BC_PROBES;
      const pp = fr.toParam(Math.cos(th) * cE, Math.sin(th) * cE);
      if (!(pp.a >= 0 && pp.a <= 1)) return false;
      let bb = pp.b; if (bb < 0 || bb > 1) { if (bb < -0.25 || bb > 1.25) return false; bb = ((bb % 1) + 1) % 1; }
      const z = sampleAt(pp.a, bb); if (!z || z.front !== wantFront) return false;
    }
    return true;
  };
  let why = '';
  const clear = (h) => {
    if (!h) { why = 'S'; return false; }
    if (!edgeClear(h.fr)) { why = 'E'; return false; }
    if (inkWithin(h.sm.x, h.sm.y, cB, false)) { why = 'I'; return false; }
    return true;
  };
  // One END: walk from the hub along the local v, <= MK_ARC_MM per step (re-deriving the frame), up to maxLen.
  // The first step that is not clear is BISECTED, so the end lands exactly at clearance c (the envelope).
  const arm = (h0, sgn, maxLen) => {
    let h = h0; let len = 0; let d0 = null;
    while (len < maxLen - 1e-9) {
      const st = Math.min(MK_ARC_MM, maxLen - len);
      const nx = at(h.fr, 0, sgn * st);
      let ok = !!nx && Math.hypot(nx.sm.x - h.sm.x, nx.sm.y - h.sm.y) <= MK_TICK_STEP_CAP_MM;
      if (ok) {
        const sx = nx.sm.x - h.sm.x; const sy = nx.sm.y - h.sm.y; const sl = Math.hypot(sx, sy);
        if (sl > 1e-9) {
          if (!d0) d0 = { x: sx / sl, y: sy / sl };
          else if ((sx * d0.x + sy * d0.y) / sl < Math.cos((MK_TICK_BEND_CUT * Math.PI) / 180)) ok = false;
        }
      }
      if (ok && clear(nx)) { h = nx; len += st; continue; }
      const reason = ok ? why : 'S';
      let a = 0; let b = st;
      for (let it = 0; it < MK_TICK_BC_BISECT; it += 1) {
        const m = 0.5 * (a + b); const q = at(h.fr, 0, sgn * m); if (q && clear(q)) a = m; else b = m;
      }
      if (a > 1e-4 && at(h.fr, 0, sgn * a)) len += a;
      return { len, stopped: true, reason };
    }
    return { len, stopped: false, reason: 'C' };           // reached the band's own extent
  };
  let h = at(fr0, aB - arcMM[kB], 0); if (!h) return;      // the boundary site's own ruling point
  let vRel = 0; let pLo = lo0; let pHi = hi0;              // previous tick's v-span (ruling-relative)
  let pMid = { x: h.sm.x, y: h.sm.y }; let pDir = { x: fr0.v.x, y: fr0.v.y }; let Lprev = Infinity;
  if (Rb && Rb.length >= 2) {                              // j=1 continuity reference = the boundary tick AS DRAWN
    const e0 = Rb[0]; const e1 = Rb[Rb.length - 1]; const cl = Math.hypot(e1.x - e0.x, e1.y - e0.y) || 1;
    pMid = { x: 0.5 * (e0.x + e1.x), y: 0.5 * (e0.y + e1.y) }; pDir = { x: (e1.x - e0.x) / cl, y: (e1.y - e0.y) / cl };
    Lprev = 0; for (let i = 1; i < Rb.length; i += 1) Lprev += Math.hypot(Rb[i].x - Rb[i - 1].x, Rb[i].y - Rb[i - 1].y);
  }
  for (let j = 1; j <= MK_TICK_BC_MAXJ; j += 1) {
    // (i) one lattice period on, in the previous hub's LOCAL frame; the seed must lie inside the previous tick's v-span
    let n = at(h.fr, dir * Pc, 0); let dv = 0;
    if (!(n && clear(n))) {
      n = null;
      const lim = Math.max(vRel - pLo, pHi - vRel);
      for (let s = 1; !n && s * MK_TICK_BC_SCAN_MM <= lim; s += 1) {
        for (const sg of [1, -1]) {
          const v = sg * s * MK_TICK_BC_SCAN_MM;
          if (vRel + v < Math.max(lo0, pLo) || vRel + v > Math.min(hi0, pHi)) continue;
          const c = at(h.fr, dir * Pc, v); if (c && clear(c)) { n = c; dv = v; break; }
        }
      }
    }
    if (!n) break;                                         // no open space left in line with the band
    vRel += dv;
    // (ii) the two ENDS: to the band's own extent, or exactly c short of the outline / another row
    const up = arm(n, 1, hi0 - vRel); const dn = arm(n, -1, vRel - lo0);
    let a0 = -dn.len; let a1 = up.len;
    // (iii) TAPER guard: never longer than the previous tick; trim unstopped (band-extent) ends first
    if (a1 - a0 > Lprev) {
      let ex = a1 - a0 - Lprev;
      if (!up.stopped) { const t = Math.min(ex, a1); a1 -= t; ex -= t; }
      if (ex > 0 && !dn.stopped) { const t = Math.min(ex, -a0); a0 += t; ex -= t; }
      if (ex > 0) { a0 += ex / 2; a1 -= ex / 2; }
    }
    if (!(a1 - a0 >= LPF)) break;                          // APEX: the two envelopes have met
    const segs = svB.segs.length === 1 ? [[a0, a1]]
      : svB.segs.map((q) => [Math.max(q[0] - vRel, a0), Math.min(q[1] - vRel, a1)]).filter((q) => q[1] - q[0] >= 2 * w);
    let stop = false; let main = null;
    segs.forEach((q) => {
      if (stop) return;
      const poly = [[0, q[0]], [0, q[1]]];
      const wk = walkPoly(n.fr, 0, 0, poly, MK_TICK_STEP_CAP_MM);
      let ok = !!wk.pts;
      if (ok) for (let i = 0; i < wk.pts.length && ok; i += 1) if (inkWithin(wk.pts[i].x, wk.pts[i].y, admitR, true)) ok = false;
      if (ok) {                                            // (iv) CONTINUITY vs the previous DRAWN tick: no orphan, no jump
        const e0 = wk.pts[0]; const e1 = wk.pts[wk.pts.length - 1];
        const md = { x: 0.5 * (e0.x + e1.x), y: 0.5 * (e0.y + e1.y) };
        const cl = Math.hypot(e1.x - e0.x, e1.y - e0.y) || 1; const cd = { x: (e1.x - e0.x) / cl, y: (e1.y - e0.y) / cl };
        const perpD = Math.abs((md.x - pMid.x) * -pDir.y + (md.y - pMid.y) * pDir.x);
        if (perpD > MK_TICK_BC_SEAM * Pc
          || Math.abs(cd.x * pDir.x + cd.y * pDir.y) < Math.cos((MK_TICK_BC_DIR_CUT * Math.PI) / 180)) ok = false;
        else if (!main || cl > main.cl) main = { md, cd, cl };
      }
      if (ok) place(n.fr, [poly], 0, 0); else stop = true;   // a refusal ENDS the chain (never a hole mid-chain)
    });
    if (stop) break;
    if (main) { pMid = main.md; pDir = main.cd; }
    Lprev = Math.min(Lprev, a1 - a0); pLo = vRel + a0; pHi = vRel + a1;
    h = n;
  }
};
```

Notes on the reference implementation:
- `reason` exists for the test needle (§4.2) and costs nothing.
- `place(n.fr, [poly], 0, 0)` asks in the local frame. O2's `requestedDir` reference is therefore local: O2 = base, 0.1849 (27/146).

### 3.4 Measured: NEW against OFF / BC1 / SHIP (12 cells, fixture §1, ground DISABLED)

- "ENV-E" is the range of end distances to the drawn `sceneEdge` over ends the mechanism reports as outline-stopped (`E`).
- "ENV-B" is the same over band-stopped ends (`I`), measured to the nearest other-row ink.

| cell | tip OFF→NEW | Δmark | sites | ink OFF→NEW | chains/ticks | OUTLINE min | ENV-E | ENV-B | orphans | TAPER | FILL OFF/BC1/SHIP/NEW (mm²) | bandC NEW (ceiling) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| create sphere/hatch | .0936→.0929 | −.0012 | = | 2910→2917 | 3/5 | .317 | .317–.459 (silhouette) | .538–.539 | 0 | 0 | 1.79/1.79/1.79/**0.24** | – |
| create sphere/contour | .0217→.0217 | −.0001 | = | 2816→2818 | 2/2 | .441 | .441–.451 | .544 | 0 | 0 | 7.06/7.06/6.96/6.90 | **.04066** (.04676) |
| create torus/hatch | .0352→.0345 | −.0014 | = | 686→689 | 1/4 | .430 | – | – | 0 | 0 | 32.57/32.57/32.57/29.05 | – |
| create torus/contour | .2532→.2484 | −.0092 | = | 888→892 | 3/3 | .365 | .365–.453 | – | 0 | 0 | 28.35/26.85/26.85/28.14 | – |
| **create cone/hatch** | .0698→.0652 | −.0084 | = | 1495→1545 | 3/22 | **.606** | **.606–.646** | **.536–.550** | **0** | 0 | 24.81/2.20/1.57/**0.27** | – |
| create cone/contour | .0420→.0420 | 0 | = | 1503→1503 | 0/0 | – | – | – | 0 | 0 | .34/.34/.34/.34 | .02181 (.02508) |
| test sphere/hatch | .0625→.0625 | 0 | = | 1874→1874 | 0/0 | – | – | – | 0 | 0 | 2.45 all | – |
| test sphere/contour | .0430→.0429 | −.0002 | = | 1793→1797 | 1/1 | 1.423 | – | – | 0 | 0 | 5.66/3.99/3.85/4.61 | .04263 (.05500) |
| test torus/hatch | .1320→.1320 | 0 | = | 1694→1694 | 0/0 | – | – | – | 0 | 0 | 17.59/18.18/18.18/17.59 | – |
| test torus/contour | .0609→.0580 | −.0068 | = | 1658→1688 | 5/16 | .216 | .216–.428 (silhouette) | .570 | 0 | 0 (with cap) | 87.4/41.74/41.74/41.16 | – |
| **test cone/hatch** | .0449→.0424 | −.0051 | = | 1308→1356 | 2/16 | **.609** | **.609–.644** | **.539–.540** | **0** | 0 | 38.32/3.54/3.54/3.56 | – |
| test cone/contour | .0386→.0386 | 0 | = | 1346→1346 | 0/0 | – | – | – | 0 | 0 | .40 all | .02676 (.03078) |

Provenance and disclosures for the table:
- **Pre-cap tree.** All rows except TAPER come from the tree with the continuity guard (drawn-run reference), measured BEFORE the §3.3 taper cap was added.
- **What the cap changed.** The cap was measured on 3 cells: test torus/contour, create cone/hatch, test cone/hatch. It changed exactly one tick, test torus/contour li19 j1, from 0.82 to 0.72 mm, and was inert on both cone cells.
- **Re-derive on the final tree.** The cap trims at `> Lprev` with no tolerance, so ticks within 0.05 mm of their predecessor may shift slightly on the 9 unmeasured cells. **The implementer re-derives every number on the final tree.**
- **Orphans column.** Measured with the kB-disambiguated instrument (§4.2).
- **SHIP comparison.** SHIP's create cone/hatch has **1 orphan** (li19 j10, sP 1.85) and ENV-E **.340–.848**. BC1's ENV-E is **.340–.848** (create) and **.611–.832** (test).

**Windows (create cone/hatch).**

| metric | NEW | SHIP | bar |
|---|---|---|---|
| W_L / W_R bare ≥0.75 | **0 / 0** | – | A1 |
| W_L bare ≥0.5 | **0.098** | 0.105 | WL ≤0.30 |
| W_R bare ≥0.5 | 0.188 | 0.178 | – |
| A4 L / R | 0.962 / **1.172** | – | ≤1.20 |

**Windows (test cone/hatch).**
- W_R ≥0.75 = 0.443 (A1t ≤1.5).
- W_L ≥0.5 = 2.658 (the pre-existing test-rig remnant, unchanged from BC1/SHIP).
- A4 R = **1.22** (REPORTED; BC1 1.207).

**The li19 chain in pictures-to-be.**
- Lengths: 4.11, 3.76, 3.42, 3.08, 2.75, 2.42, 2.10, 1.78, 1.36, 1.06, 0.78, then the apex.
- Lower ends: outline-stopped at 0.61 throughout.
- Upper ends: at the band's own extent for j1–8, then band-stopped at 0.54 from li16's ends for j9–11.
- li16 (W_R): 3.97 … 0.80. The upper end switches to band-stopped at j6.
- A third chain, li1, now fills the G1-base hole (581.8,522.1, 1.45 mm² on SHIP): 1.39 / 1.09 / 0.93.

**Other kept bars.**
- **A2:** `tickSites` identical on 12/12 at d=50 and 8/8 at d=220. d=220 over2RP = OFF (test 0/4/1/0, create 0/2/2/1), subMin 0.
- **A5:** over2RP 0 and subMin 0 on 12/12 at d=50.
- **O2** (test sphere/hatch): d=1 **0.1849 (27/146, = base)**; d=50 0.0602.
- **I2:** 18 cells at create d=50, measured on the pre-guard variant: only create cone/crosshatch changes (tip .5399 → .5227, lower). Re-measure.

**G5 (NOTE, not claimed).** On create sphere/hatch the envelope rule reaches the G5 window: bare ≥0.5 **1.435 → 0.063**, ≥0.75 0.183 → 0.000 (3 chains at I 0 and 0.635). The test rig's G5 is unchanged (1.945). The sphere picture must be labelled accordingly.

**Chains removed as highlight (intended).** These are BC chains whose boundary I ≥ 2/3:
- the cone right-flank li7 (I 0.874);
- create cone/contour (0.746, 0.802);
- contour limb chains at 0.72–0.88;
- test sphere/hatch (0.893, 0.931).

Consequences:
- create cone/contour, test sphere/hatch, test torus/hatch and test cone/contour carry no continuation at all.
- FILL is worse than SHIP on test sphere/contour (3.85 → 4.61); disclosed.

**Instrument correction (disclose).** The T2-8b-2 plan's "test torus/contour s=6.49, 28.2°" limb anomaly, and this planner's first orphan counts on that cell, were **instrument artefacts**. On contour, one ruling has several spans whose ends share the same arc position `aB` (measured: li7 has `aB`=0.444 at both kB=0 and kB=27). `chainMetrics` matched the boundary by `(li, a)` and picked the wrong span. With `(li, a, k)` matching, test torus/contour reads maxSP 1.22, DIR 2.5° and 0 orphans.

## §4 Bars

"Gates" names the clause. Every mutation below was measured by the planner unless marked. Fixture §1.

### 4.1 Bar table

| id | status | clause (and NOT) | bar | population | NEW | RED / mutation (must trip) |
|---|---|---|---|---|---|---|
| **ENVELOPE-E** | NEW, BLOCKING | "a consistent set of endpoints evenly offset from the **perimeter**". Outline-class ends only; not band ends, not unstopped (band-extent) ends. | range (max−min) of end-to-`sceneEdge` distance over outline-class ends ≤ **0.10 mm**, and min ≥ 0.30 | create + test cone/hatch | 0.040 / 0.035 (0.606–0.646 / 0.609–0.644) | **RED:** SHIP 0.508 / 0.221, BC1 same (geometric class: ends with gE ≤ 1.0 and gE < gI; this definition gives identical NEW numbers and works on old trees). **Mutant `nobisect`** (`MK_TICK_BC_BISECT = 0`): 0.127 / 0.240 |
| **ENVELOPE-B** | NEW, BLOCKING | "evenly offset from the … **closest band**". Band-stopped ends only (reason `I`, via test needle). | range of end-to-other-row-ink distance ≤ **0.10 mm** and min ≥ 0.48 (c_B) | create + test cone/hatch | 0.014 / 0.001 (0.536–0.550 / 0.539–0.540) | **Mutant `nobisect`:** 0.316 / 0.141. RED on the old tree is not applicable: it has no stop reasons (the needle count fails, which is a structural RED); say so. |
| **NO-ORPHAN** | NEW, BLOCKING | "no isolated orphans / no mid-region holes". Chain contiguity only; not tone or ends. | every continuation tick: j contiguous from 1, and perpendicular spacing to its predecessor (the boundary tick for j=1) ≤ 1.35·P_B (P_B = the boundary site's `sv.P`), grouped by exact span `(li, dir, kB, aB)` with the boundary matched by `(li, a, k)` | all 12 cells | 0 on 12/12 | **RED:** SHIP create cone/hatch li19 j10 sP 1.85 (the 2b re-anchored tick). **Mutant `nocont`** (continuity guard removed): test sphere/hatch li15 j1 sP 1.73. **`gap+nocont`** (skip j=2, guard off): 16 on create cone/hatch. Disclose: `MK_TICK_BC_SEAM` equals the bar's 1.35, so the source guard enforces the bar; `nocont` proves the guard is load-bearing. |
| **FILL** | NEW, BLOCKING | "fill open spaces where highlight isn't needed". Under-fill only; not tone or over-ink. | Σ area of bare components (interior, distance ≥ 0.5 mm) whose nearest regular main tick has I < 2/3 **and** depth > (P_near − w)/2 + 0.1 mm (deeper than the band's own spacing can make), components < 100 mm² (excludes the torus hole) ≤ **0.50 mm²** | create cone/hatch (BLOCKING); the other 11 REPORTED | 0.27 | **RED:** SHIP 1.57, BC1 2.20, OFF 24.81. **Mutants:** `cfat` (c_E = c_B = 4w) 7.65; `rulingref` (j=1 continuity reference = `fr0.v`/ruling point) 1.56. Test cone/hatch 3.56 (reported; the pre-existing test W_L remnant). |
| **HIGHLIGHT** | NEW, BLOCKING | "…where highlight isn't needed": do not fill the lit highlight (G6). Not bandC. | 0 continuation chains whose boundary site has I ≥ 2/3 (read from the cont tag's I) | all 12 | 0 | **Mutant `nohi`** (`MK_TICK_BC_HI_I = 1.01`): create cone/hatch 5 chains, incl. li7 I 0.874. Corroboration: at HI_I 0.8 / 0.9, create sphere/contour bandC = 0.0501 > the unchanged ceiling. |
| A1 / A1t | kept | wedges filled | ≤0.50 / W_R ≤1.5 | create / test cone/hatch | 0/0; 0.443 | `off` |
| WL (2b) | kept, **mutants re-targeted** | W_L remnant | ≥0.5 mm ≤0.30 | create cone/hatch | 0.098 | `off` 12.158; `cfat` 3.608 (replaces `noclip`/`noreanchor`, whose code is gone) |
| A2 | kept | sites | identical | 12 + 8 | 20/20 | `inline` (re-target needles to the `firstR/lastR/endR` names) |
| A3 | kept | contact | tip ≤ off+.005, mark ≤ off+.01 | 12 | never above off | `noadmit` (re-target to `inkWithin(…, admitR, true)`) — **implementer measures** |
| A4 | kept | over-ink | create ≤1.20 blocking; test reported | cone/hatch | .962/1.172; test 1.22 | `dense` (re-target: `dir * Pc` → `dir * Pc * 0.4`, admission off) — **implementer measures** |
| A5 | kept | tick not line | over2RP 0, subMin 0; d=220 ≤ off | 12 + 8 | 0/0; = off | `ask6` (re-target: widen `lo0/hi0` by ±3 RPn, cap off) — report honestly if vacuous |
| SEAM | kept | spacing at j1 | j1 = 1, s ≤ 1.35 | create + test cone/hatch | 1.06 / 1.00 | `skip1` (loop starts at j=2) |
| DIR | kept | direction at j1 | ≤ 8° | create + test cone/hatch | 0.2 / 0.0 | `rot` (re-target: θ = 0.2 in `walkPoly(n.fr, 0, 0.2, …)` and `place(…, 0.2)`) — **implementer measures** |
| TAPER | kept | shorten gradually | 0 violations (tol 0.05) | 12 | 0 (cap) | `wide` (re-target: `lo0 -= 1; hi0 += 1` and cap off). Also `nocap`: test torus/contour 1 violation (measured) |
| OUTLINE | kept | off the outline | ≥ 0.30 | create + test cone/hatch | .606 / .609 | `noprobe` (re-target: `cE = 0`) |
| bandC | **UNCHANGED ceilings** | moiré | `PRE_RANK1_BANDC` | 4 gated | .04066 / .02181 / .04263 / .02676 | – |
| O2 | kept | tick tracks frame | ≤ 0.20 | test sphere/hatch d=1, 50 | .1849 / .0602 | – |
| I1 / I2 | kept | isolation | 864/864 md5; I2 reported | as before | – | `nogate` (queue gate plus the `svB.segs` backstop, as before) |

**Gating coverage (rule 2).**
- ENVELOPE, SEAM, DIR and OUTLINE gate 2/12 cells (cone/hatch, both rigs), where Jay looks and where ends are rim- or band-class.
- On the sphere and torus, outline-class ends are **silhouette** ends. The drawn silhouette sits 0.1–0.38 mm inside the analytic limb, so ENV-E there reads 0.317–0.459 (create sphere/hatch) and 0.216–0.428 (test torus/contour): reported, not gated.
- NO-ORPHAN, TAPER, HIGHLIGHT and A2/A3/A5 gate 12/12. FILL gates 1/12 and reports 11.

### 4.2 Instrument port (test side; `tests/helpers/scene3d-mktick-spacing-tone.js`; pure math, no fs/git)

**Record needles** (each asserts count === 1):
1. **Existing `pushRun` REC needle:** unchanged.
2. **Regular tag:** `'reg:' + (si === mainIdx ? 'M' : 's') + ':' + a.toFixed(4) + ':' + k + ':' + sv.I.toFixed(3) + ':' + sv.P.toFixed(4)`. This is a **fixture change: k, I and P added; disclose under Bars changed.**
3. **Continuation tag:** set at the top of the `for (let j = 1; j <= MK_TICK_BC_MAXJ; j += 1) {` body: `'cont|' + dir + '|' + kB + '|' + aB.toFixed(4) + '|' + j + '|' + svB.I.toFixed(3)`.
4. **Reason suffix:** after `const up = arm(n, 1, hi0 - vRel); const dn = arm(n, -1, vRel - lo0);` append `'|' + dn.reason + up.reason`. Record pts[0] = the `dn` end and pts[last] = the `up` end for single-seg ticks. For multi-seg ticks, only the first piece's pts[0] and the last piece's pts[last] carry reasons.
5. **Clear the tag** after the flush line.

**`chainMetrics(records, edgePaths)` changes:**
- Match the boundary by `(li, a.toFixed(4), k === kB)`. **This fixes the contour ambiguity; disclose as an instrument correction.**
- Add `sP[j] = perp(prev, cur) / P_B` and a contiguity flag.
- Add per-end `{reason, gE, gI}`:
  - gE = point-to-segment distance to `sceneEdge`;
  - gI = the same to records with `li !== own li`.
- Add `chainI` (from the cont tag).

**Add `holeComponents(raster, regRecords, {T: 0.5, hiI: 2/3, w})`:**
- Label components with 4-connectivity on the interior pixels at distance ≥ T.
- The nearest regular main tick is found by midpoint distance from the component's deepest pixel.
- Return the FILL sum under the §4.1 rule.

The planner's code for all of this is in the §3.4 scripts' form: port the math, not the scripts.

### 4.3 `## Bars changed` entries this unit must carry (rule 6)

1. **`scene3d-mktick-spacing-tone.test.js`, NEW:** ENVELOPE-E, ENVELOPE-B, NO-ORPHAN, FILL and HIGHLIGHT, as in §4.1, with their mutants.
2. **Same file, WL:** mutants `noclip`/`noreanchor` → `cfat` (the old code is deleted). The threshold is unchanged.
3. **Same file, A2/A3/A4/A5/SEAM/DIR/TAPER/OUTLINE/I1:** mutant needles re-targeted to BC-E text. **No threshold changes.** `BC_MUT` count changes: state old → new.
4. **Same file, the "BC-off differs from shipped" test:** changes from 11 of 12 to **8 of 12**. The 4 equal cells are create cone/contour, test sphere/hatch, test torus/hatch and test cone/contour. `create|torus/hatch` no longer equals off (it gains a chain at I 0.66). This is a population change and is disclosed.
5. **`tests/helpers/scene3d-mktick-spacing-tone.js`:**
   - `chainMetrics` boundary matching changes from `(li, a)` to `(li, a, k)`. **This is a population/fixture change: it corrects contour span conflation.** SEAM/DIR/TAPER values on contour cells may move; report old → new.
   - NEW `holeComponents` and per-end distances.
6. **`scene3d-mktick-wedge.test.js` `EXPECTED_SIGNATURE`:** §5.
7. **`scene3d-mktick-banding.test.js`:** **UNCHANGED** (Jay's ruling). A `console.log` of measured values is acceptable.

## §5 Golden re-pin list (rule 4: fixture checked)

The pin is `scene3d-mktick-wedge.test.js` `EXPECTED_SIGNATURE`, `pathSignature(paths, 4)`. Its fixture is the §1 12-cell d=50 fixture: same rigs, camera, fillAngle and law. **Every cell is at risk, and all 12 change relative to the current (b274d395) pins.**
- **4 revert to their `PRE_T28B_SIGNATURE` value** (no continuation at all):

| cell | hash |
|---|---|
| `test\|sphere/hatch` | `0f7b7d17ed70c91984b6d59f5915cb861962bc1ce1759f6282b8fabb4a234042` |
| `test\|torus/hatch` | `71328eb4d9e31e35a2a6de3b12042d7c6ca672636b1ca7eeaa15a2d9b9491374` |
| `test\|cone/contour` | `e75dac4c2988682631c120931ab9d17e2fe72c61ca58aec247ca81132bcc54b9` |
| `create\|cone/contour` | `d9fb1c7acc9a9461503f958100c085b375e7937d899c725711496754ef0e7958` |

  Assert these as `=== PRE_T28B_SIGNATURE[key]`, not as fresh hex.
- **8 get new hashes, derived on the final tree:** test sphere/contour, test torus/contour, test cone/hatch, create sphere/hatch, create sphere/contour, create torus/contour, create cone/hatch, and **create torus/hatch**. The last one leaves the base hash `5bbcd92a…` for the first time.
- **The contrast mutation stays:** flush removed → `PRE_T28B_SIGNATURE` on 12/12.

Other pins to grep and run (fixture-checked):
- **`scene3d-mktick-banding`:** 4 gated contour cells at d=50, measured §3.4, all ≤ the unchanged ceilings.
- **`scene3d-mark-laws-draw`:**
  - O2 is measured.
  - O3 (refusal fraction) and O4 (ask/drawn) on the cone/torus/sphere mkTick cells now see BC-E's `place()` calls. **Run them; not measured by the planner.**
- **`scene3d-mktick-band-purity`:** non-mkTick needles; expected unchanged.
- **`scene3d-mktick-runaway`:** its `FIX_NEEDLE` is the `place()` walk line, which is untouched. `mkLastRun = runs[0];` is added elsewhere in `place()`; confirm its needle count.
- **`scene3d-one-pen-down-reachability`**, **`tone-law-collapse`** (Tier 1), and the **integration `fill-style-picker`**: run them.

## §6 Pictures (Jay's eye is the acceptance test)

**Tool and trees.**
- Tool: `scripts/audit/scene3d-capture.js --tier B --rig create`, mkTick, med, angle a.
- **Three-way panels, BASE | BC `8d11044d` | NEW:**
  - **BASE** = `git archive 8b8f275e`;
  - **BC** = `git archive 8d11044d`, the direction Jay accepted;
  - **NEW** = the lane.
- **Evidence** goes to MAIN `docs/3d-audit/fill-audit/after/T2-8b-3/` with a `report.json` carrying the §1 fixture, rig per number and "ground DISABLED".

**Full-object panels.**
- `JAY_T28b3_cone.png`: create cone/hatch.
- `JAY_T28b3_{cone,sphere,torus}_contour.png`: create. On cone/contour, NEW = BASE: label it "BC's two lit-side chains (I 0.75/0.80) removed as highlight".
- `JAY_T28b3_sphere_hatch.png`: label "G5 now reached by the envelope rule (bare ≥0.5 1.44 → 0.06 mm²); G5 was not the target".
- `JAY_T28b3_torus_contour_testrig.png`: test rig; the li7/li13/li19 limb chains are gone or contiguous.

**3× native crops of the cone.** Use the same crop px as T2-8b-2/2b so the panels align with Jay's earlier pictures:
- **W_L (130,650,330,749):** the li19 chain's lower ends make a line parallel to the rim, the upper ends meet li16's end-line, and the apex is a closing sliver. No orphan.
- **G2a (330,600,480,745):** the li16 chain.
- **G2b (470,560,620,720):** BC's short rim ticks from the lit-side chains are gone (highlight). **Say so in the label.**
- **G1-base:** NEW crop. Map mm window [578,518,586,526] with the same mm→px transform the capture tool used for W_L. This is the li1 chain filling a 1.45 mm² hole that SHIP left.

**Before claiming anything:**
- Look at every picture.
- Write one line per picture of what you see.

## §7 Implementer brief (single unit). The orchestrator pastes §0 + §0b verbatim above this.

**Worktree and branch.** Continue on `3d-scene/fill-audit-a6` from `b274d395`.
- **RED** comes from a `git archive` export of `b274d395`, never a stash or an in-place revert. On that export:
  - ENVELOPE-E must FAIL (0.508 / 0.221);
  - NO-ORPHAN must FAIL (create cone/hatch li19 j10);
  - FILL must FAIL (1.57);
  - ENVELOPE-B and HIGHLIGHT: record what happens (structural needle failure / BC chains at I ≥ 2/3), without faking a number.
- Reproduce any pre-existing red at `b274d395` under `## Pre-existing red`. 2b reports none.

**Source** (`src/core/scene3d/surface-fill.js` only):
1. Constants: §3.2 item 1.
2. Remove `mkClipArm.e`, `mkEdgeOK`, the `walkFrom` probe line and the extra `walkPoly` return fields (§3.2 item 2).
3. Boundary drawn-run stash and the `firstR/lastR/endR` bookkeeping (§3.2 item 3). **Do not touch the `tickSites.push` line.**
4. Replace `bcSide` with §3.3 verbatim in behaviour, including the taper cap, the drawn-run continuity reference and the seed-overlap rule.
5. Keep the flush line and the queue gate verbatim.

**Tests:**
1. Port §4.2 into the helper, and re-target the REC needles.
2. In `scene3d-mktick-spacing-tone.test.js`, turn the "T2-8b-2 BC" block into "T2-8b-3 BC-E":
   - Carry every §4.1 bar. Each carries a comment naming the clause it gates and the clauses it does not.
   - Each bar gets a needle-patched mutant (count asserted === 1) that trips: `off`, `inline`, `noadmit`, `dense`, `skip1`, `rot`, `wide`, `noprobe`, `ask6`, `nogate`, `nobisect`, `nocont`, `gap` (+nocont), `cfat`, `rulingref`, `nohi`, `nocap`.
   - **If a mutant is vacuous, say so; do not fake a trip.**
3. Re-pin the wedge goldens per §5, and keep the contrast test.
4. **Do not touch `PRE_RANK1_BANDC`.**

**STOP and report instead of proceeding if any of these happens:**
- any `tickSites` record changes (20 runs);
- any tip contact > off+0.005 on the 12 cells;
- OUTLINE < 0.30 on either cone/hatch rig;
- **any gated bandC > its UNCHANGED ceiling**;
- O2 > 0.20;
- A1 > 0.50 or WL > 0.30;
- ENVELOPE range > 0.10 on either cone/hatch rig;
- any orphan on 12 cells;
- FILL > 0.50;
- any T2/T3/T4 named set would need to grow.

**Run** each file in the FOREGROUND with `timeout: 600000`:
- spacing-tone, mktick-wedge, band-purity, mark-laws-draw, mktick-runaway, mktick-banding, one-pen-down-reachability;
- integration `fill-style-picker`;
- `tone-law-collapse` (Tier 1, singleFork).

Also record the render time per cell for create cone/hatch, SHIP against NEW: the 16-probe bisection is more work, and the planner did not time it.

**Report** to MAIN `docs/3d-audit/lane-reports/T2-8b-3-impl.md` with:
- `## Bars changed` (file:line — old → new — why, in the report AND the commit body; §4.3);
- `## Pre-existing red`;
- sweep coverage as fractions:
  - 864/864 non-mkTick md5;
  - 8/8 mkTick mappers (12 d=50 cells gated, 18 I2 reported);
  - d=220 on the 8 B7 runs;
- the §1 fixture and the rig on every number, with "ground DISABLED" stated;
- the §6 pictures, looked at before claiming anything.

Never push, merge, tag or bump.

### Critical Files for Implementation
- /Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a6/src/core/scene3d/surface-fill.js
- /Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a6/tests/unit/scene3d-mktick-spacing-tone.test.js
- /Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a6/tests/helpers/scene3d-mktick-spacing-tone.js
- /Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a6/tests/unit/scene3d-mktick-wedge.test.js
- /Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a6/tests/unit/scene3d-mktick-banding.test.js (read-only: ceilings stay)
