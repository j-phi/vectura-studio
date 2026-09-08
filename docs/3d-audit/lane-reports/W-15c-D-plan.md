STATUS: PLAN-READY

# W-15c design D — the graded case's Density-blind carrier floor (F-14 remainder)

**Lane** fill-audit-2 · branch `3d-scene/fill-audit-2` · port 8476 · base **main 47a5a755 (v1.3.99)**.
Planner read-only: every number was measured in a scratch export of 47a5a755; probes patched that copy only.

## 1. Root cause (file:line)
`src/core/algorithms/scene3d.js:2368-2381`, in `faceHatchLines`'s `plan.forEach` (carrier-only, `:2353`):
```js
const ceilCount = Math.floor(zoneCeil / f.covOne);   // :2368 geometry+zone, no Density term
const soloDens  = soloOrient ? round(f.ext/hatchSpacing(d) - 0.5) : 0;          // :2369 SOLO only
const want = Math.min(ceilCount, Math.max(FACET_MIN_RULINGS, soloDens));        // :2372
const target = f.ext / (want + 0.5); if (target < f.plane) f.plane = target;    // :2380 ABSOLUTE pitch
```
On a **graded** record (`isSoloOrientation` false, `:1608`) `soloDens` is 0, so `want = min(ceilCount, 3)`
and the granted pitch `ext/3.5` carries **no Density term**: every facet whose natural ask is coarser than
`ext/3.5` renders identically at every Density until its natural pitch overtakes the grant. The defect is
the floor being an **absolute pitch stated per facet** — not the constant 3.

## 2. Current numbers (scratch 47a5a755, app entry `engine.addLayer('scene3d')`, factory rig)
Fill-path count per face, default fillAngle:
| primitive | d=1 | d=25 | d=50 | d=100 | d=220 |
|---|---|---|---|---|---|
| **plane** (solo, W-15c fixed) | 6 | 7 | 9 | 19 | 65 |
| **box** `face:+X` lit | 3 | 3 | 3 | 20 | 68 |
| **box** `face:+Y` lit | 3 | 3 | 3 | 5 | 19 |
| **box** `face:+Z` dark (natural) | 5 | 8 | 11 | 92 | 152 |
| **solid** (buckyball) total | 35 | 35 | 35 | 167 | 308 |
| **pyramid** total | 9 | 16 | 34 | 75 | 142 |

Box lit facets are frozen d=1…70; `solid` is frozen **whole** (35 paths, identical per-face ink, d=1…50).
`pyramid` is chart-wrapped (`params.js:170`), emits no `faceId`, already responds — **not a target**. The
`[86,86,86]` pin is *ink mm* on `face:+X@78` at **fillAngle 20, d=5/50/70**; companion `face:+Y@3` = 106.5
at d=5/50/90 — the brief's "d=25/50/100" wording is wrong.

## 3. RED oracle
`tests/unit/scene3d-box-density-bearing.test.js` → **"ACCEPTED: Density is inert on the lit facets over
most of its range"**; the file says *"INVERT THIS TEST when the carrier floor is made proportional"*.
Replace its two `toEqual` pins with strict monotonicity:
```js
const x = [5,50,70].map((d) => ink(d,'face:+X@78'));  // prints [86,86,86] today
const y = [5,50,90].map((d) => ink(d,'face:+Y@3'));   // prints [106,106,106] today
expect(x[1]).toBeGreaterThan(x[0]); expect(x[2]).toBeGreaterThan(x[1]);  // RED: 86 > 86 false
expect(y[1]).toBeGreaterThan(y[0]); expect(y[2]).toBeGreaterThan(y[1]);  // RED: 106 > 106 false
```
Second RED, `scene3d-faceted-density-calibration.test.js`: `fillLineCount(d,'solid')` prints `[35,35,35]` at
d=1/25/50 — assert strictly increasing.

## 4. Ranked fixes
**Fix 1 — RECOMMENDED: per-object carrier normalisation (a relative floor, not an absolute pitch).**
Unlocking measurement: multiplying **every** facet's carrier pitch on graded records by a uniform λ
(`f.plane *= λ` injected before `plan.forEach` at `:2312`) leaves **44/44** of `scene3d-facet-tone` +
`scene3d-projected-pitch` + `scene3d-faceted-highlight-dispatch` **green at λ = 0.7 and λ = 0.5**.
O20/O21/O9/O14 are *ratio* bars (`projected-pitch:239` `|cov0−cov1| >= 0.015`; `facet-tone:247-248`
`density[i+1] > density[i]*1.25`; `highlight-dispatch:135-136` `ink(3)>ink(1)`, `ink(6)>ink(3)`) and are
therefore **scale-invariant**. §2.4's impossibility bans a per-*facet* floor, not a per-*object* scale.
Edits, all in the faceted path:
1. Memoised `recordCarrierNorm(record, styleParams)` beside `recordBands` (`:1579`)/`isSoloOrientation`
   (`:1607`): walk the record's **front** faces once, rebuilding the loop's quantities (`faceUVScaffold` →
   `spacingBand` → carrier ask → `k = uvPitchFactor`, `ext = perpExtentUV`) for `naturalPlane_i`/`ext_i`/`covOne_i`.
2. Binding facet w = argmin `ext_i / naturalPlane_i` (fewest natural rulings), targeted with the *solo* law
   W-15c ships: `Nw = max(FACET_MIN_RULINGS, round(ext_w/hatchSpacing(fillDensity) − 0.5))`, capped by
   `floor(zoneCeil_w / covOne_w)`.
3. `λ = clamp((ext_w/(Nw + 0.5)) / naturalPlane_w, LAM_MIN, 1)`, memoised per `(record, fillDensity,
   fillAngle)`. At `:2372`, graded records only, replace the absolute grant with `f.plane =
   Math.min(f.plane, f.plane * λ)`; keep the per-facet `ceilCount` clamp and the `DRAW_NOTHING` fallback
   (`:2411`) unchanged. `λ = 1` ⇒ byte-identical to today. `LAM_MIN = 0.6` (§6); solo records untouched.

Why it responds where today's floor is flat: `naturalPlane_i ∝ hatchSpacing(d)` and `ext_w/(Nw+0.5) ≈
hatchSpacing(d)` in face-plane mm, so λ is `k_w/gain_w`-shaped, not d-shaped, and `f.plane = naturalPlane_i ·
λ ∝ hatchSpacing(d)` on **every** facet with its tone ratio intact.

**Fix 2 — FALLBACK if λ runs away at the low end.** Same machinery, applied only where `λ >= LAM_MIN`; below
that, fall back to today's absolute grant byte-for-byte — mid-range responsiveness, plateau kept at the
extreme low end, bounded blast radius.

**Fix 3 — REJECTED, measured dead (record it, do not retry).** Letting only the *granted* facet track
Density under a hard cap (`want = min(ceilCount, max(3, min(densCount, C)))`) inverts O20 at **C = 4**, the
first extra ruling: `projected-pitch` "R-cube-bands3 — the two LIT faces differ (spec bar 0.03)" and
`facet-tone` "bands 3 … strictly decreasing" both fail. C=5 → 6 failures, C=6 → 10, C=8 → 15 (adds O9, O14).
**Zero per-facet headroom** — which also closes the "give those fixtures their own low-density expectation"
alternative.

## 5. What must not move
- **GROUND PLANE — FROZEN ON JAY (SESSION-SUMMARY §4 item 3).** The ground is a *single-orientation* record,
  so it takes the `soloOrient` branch at `:2369`, which Fix 1 **does not touch** — the normalisation is gated
  on `!isSoloOrientation(record)`, so ground behaviour at defaults is unchanged **by construction**. Prove
  it: `tests/baselines/scene3d/tone/shadow-additive-default.json` (284 paths) + `shadow-inverse.json` (126)
  byte-identical, and all three `scene3d-hlr-spatial-index-identity` SETTLED rows (208/416, 404/1225,
  651/2485) unmoved.
- **Byte-identical:** solo records (plane, ground), untoned paths (`toneOn` false), Stage 0 (keep `zone &&`
  at `:2310`), the `plane__*` gallery cells, and `scene3d-hatch-density-500`'s box series
  **`[178,181,185,190]`** at d=200…500 — λ must be 1 there (blunt λ=0.7 moves it to `[255,259,264,272]`,
  λ=0.5 to `[301,336,371,382]`; neither is an acceptable re-pin).
- **Green:** `scene3d-facet-tone`, `scene3d-projected-pitch`, `scene3d-faceted-highlight-dispatch`,
  `scene3d-appdefault-facet-fill`, `scene3d-plot-safety`, `scene3d-subwindow-density`,
  `scene3d-faceted-tone-law`, `scene3d-fixture-single-source` (all 44 ordering tests pass under a uniform λ).
- **Expected re-pins (disclose under `## Bars changed`, old → new → why):** the two inverted
  `box-density-bearing` pins (§3) and that file's `fingerprint(10|24|50|100|150)` box +
  `fingerprint(50|150,'solid')`. **`fingerprint(50,'plane')` = `10a710a6:3909` must NOT move.**

## 6. Ink, evidence, files, stop conditions
- **Predicted ink.** Box total fill paths d=1/25/50 are 11/14/17 today; blunt λ=0.7 gives 15/17/23. Bar:
  **≤ 2.0× object ink at d=50**, `solid` monotone off its 35-path floor. The real ceiling is
  `scene3d-subwindow-density`'s clean-drawing probe — **0.523 vs a 0.4 bar at λ=0.5 (FAIL)**, green at
  λ=0.7 — hence `LAM_MIN = 0.6`.
- **Evidence cells** (all verified in `manifest.A.1-1.jsonl`), into `after/W-15c-D/`: movers
  `box__hatch__ladder__{low,med}__a`, `solid__hatch__ladder__{low,med}__a`; byte-identical controls
  `plane__hatch__ladder__med__a`, `plane__contour__ladder__med__a`, `box__hatch__ladder__max__a`. Crop the
  lit box faces at native resolution before judging.
- **Files ALLOWED:** `scene3d.js` (faceted path only), `src/config/context-bar.js` (only if a picker gate
  proves necessary — not expected), `tests/unit/scene3d-box-density-bearing.test.js`,
  `tests/unit/scene3d-faceted-density-calibration.test.js`. **FORBIDDEN:** `surface-fill*.js`, `mappers.js`,
  `buildSliceSegments`/`contourSlice`, `hlr.js`, `shadows.js`, `regions.js`, any other baseline JSON.
- **STOP and report (never widen a bar) if:** any O20/O9/O14 assertion fails at any λ (Fix 1's premise is
  then wrong); the subwindow probe exceeds 0.4; `hatch-density-500`'s box series moves; any ground/solo
  fingerprint or golden moves; or `recordCarrierNorm` costs >~15% on `denseMixed-8obj-shadows`. Fall back to
  Fix 2 before re-pinning any ordering test — ship the measurement rather than trade an invariant for F-14.
