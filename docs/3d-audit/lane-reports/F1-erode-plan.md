STATUS: PLAN-READY

# F1-erode — planner report (lane fill-audit-a3, cross-lane file grant)

**Planner:** Opus, read-only. **Nothing in any worktree or in MAIN's `src/`/`tests/` was written.**
**Scratch exports (read-only, `node_modules` symlinked from MAIN):**

| export | tree | purpose |
|---|---|---|
| `/private/tmp/claude-501/scratch-F1E` | `cd541f87` (a3 HEAD, F1-placement / Prototype B) | root cause, RED oracle, Rank-1 prototype |
| `/private/tmp/claude-501/scratch-F1E-pre` | `8adfd5af` (W-36c, pre-placement) | pre-fix control |

Every vitest file was run in the FOREGROUND with `timeout: 600000`, one file per command.
Two runs were moved to the background by the tool's own 600 s ceiling (the `probe-erode.js`
first pass); per ROUND3-RESUME-BRIEFS §0's amendment that is a tool constraint, not a protocol
deviation — no `run_in_background`, no Monitor, no turn ended waiting.

---

## 0. One-paragraph summary

Under Prototype B one `CLS_RIBBON` stretch of `interlockWeave` on the default torus makes
`polygon-clipping`'s sweep line throw inside `strokeRingsToBand`'s per-contour union.
`FillBoolean.safeOp` catches the throw, warns, and returns `null`, so `FB.union` hands back `[]`
and **no exception ever reaches `insetMultiPolygon`'s `catch`**. Its escalating retry ladder
therefore `break`s on attempt 0 with `region = []`, and `erode()` cannot tell "the boolean failed"
from "the erosion genuinely consumed the region". `ribbonize` then fires `erodeEmpty` and
substitutes a bare centreline for a **51.77 mm², 1.11 mm-wide** ribbon — 3.7 pen widths, i.e.
nowhere near the 0.30 mm collapse depth. This is A3-plan §7E's "swallowed-failure ladder",
exposed (not introduced) by the placement change. **Rank 1 is prototyped and works: make the
ladder treat a swallowed failure as a failure. The very next rung it already owns
(`inset × 1.0037`, `diskPhase 0.29`, no simplification) recovers the region**, eroded boundary
moved by 0.000555 mm ≈ 1/540 of a pen. Seven of the nine reds go green; the two `trochoidLoop`
reds are provably a different, sub-millimetre defect that F1-erode does not touch and must not
re-pin.

---

## 1. Root cause, with file:line and the stretch's real numbers

### The call chain (measured, not read)

```
surface-fill.js:7211   const outlineMP = erode(clippedMP, penWidth / 2);       // inset = 0.15 mm
surface-fill.js:6834   const erode = (mp, d) => … GU.insetMultiPolygon(mp, |d|, { minArea: 0 })
geometry-utils.js:1312   const cut = strokeRingsToBand(rings, ins * 2, …)
geometry-utils.js:1034   const band = FB.union(...geoms);                      // ← THROWS here
fill-boolean.js:75-83    safeOp catches, records lastOpError, console.warn, returns null
fill-boolean.js:90-95    union() sees null → returns []
geometry-utils.js:1034   band falsy → not pushed → bands empty → strokeRingsToBand returns []
geometry-utils.js:1313   cut empty  → region = []
geometry-utils.js:1314   break;                    ← the ladder's other four rungs never run
geometry-utils.js:1317   if (!region || !region.length) return [];
surface-fill.js:7233     fillMP = outlineMP.length ? … : []                    // outlineMP = []
surface-fill.js:7259     if (!any) { ribbonRefuse('erodeEmpty'); outp.push(centrePass(…)); return; }
surface-fill.js:6811     ribbonRefuse also increments `degenerate`
```

The swallowed error, captured verbatim in the scratch export:

```
[FillBoolean] polygon union failed on degenerate geometry: Error: Unable to complete output ring
starting at [130.00326666903993, 71.24728773095754]. Last matching segment found ends at
[149.07770364394608, 76.54293880299473].
    at strokeRingsToBand (src/core/geometry-utils.js:1034:23)
    at Object.insetMultiPolygon (src/core/geometry-utils.js:1312:21)
    at erode (src/core/scene3d/surface-fill.js:6838:24)
    at src/core/scene3d/surface-fill.js:7211:27
```

This is the **second** failure coordinate F1-placement-plan §9 predicted
(`"Unable to complete output ring starting at [130.003, 71.247]"`), now traced end to end.

### The stretch's actual geometry (instrumented in the scratch export)

Instrumentation: `Vectura.GeometryUtils.insetMultiPolygon` wrapped on the loaded runtime;
for every call, the input multipolygon's signed area / perimeter / ring count / bbox, the output
length, and `FillBoolean.consumeLastOpError()` cleared before and read after the call.

**`interlockWeave`, torus, hatch, density 50, pen 0.30 — 79 `insetMultiPolygon` calls per render:**

| quantity | value |
|---|---|
| calls returning `[]` at the OUTLINE depth (inset 0.15 mm) | **1** (call #44) |
| calls with a swallowed `FillBoolean` error | **1** (the same call #44) |
| input area | **51.7714 mm²** |
| input perimeter | **93.206 mm** |
| input rings | **1** (a single shell — no hole, no self-nesting) |
| mean width `2·A/P` | **1.1109 mm = 3.70 pen widths** |
| bbox | `130.156, 71.033 → 155.890, 82.841` (25.73 × 11.81 mm) |
| `2 × inset` (the depth at which a genuine collapse happens) | **0.30 mm** |

**The region is 3.7× wider than the collapse depth.** It is not a degenerate polygon, it is not a
thin neck, and the erosion is not "correctly consuming" anything. `insetMultiPolygon` returned `[]`
*only* because a swallowed boolean failure is indistinguishable from an empty answer.

At the pre-placement tree `8adfd5af` the same law makes **70** `insetMultiPolygon` calls with
**zero** swallowed failures and **zero** empty results at the outline depth. So Prototype B's
changed ribbon geometry newly reaches a `polygon-clipping` degeneracy the robustness gap then
converts into a visible hole — exactly the "gap it exposes, not a regression it introduces"
reading, with the caveat that the *consequence* is a real, user-visible regression and must be
fixed, not priced in (see §6).

### What the fallback costs (this is not a cosmetic refusal)

`interlockWeave`, torus, d=50, measured on the three trees:

| | `8adfd5af` (pre-placement) | `cd541f87` (as shipped) | `cd541f87` + Rank 1 |
|---|---|---|---|
| `stats.wide` / `ribbons` | 35 / 35 | 40 / **39** | 40 / **40** |
| `stats.erodeEmpty` | 0 | **1** | **0** |
| `stats.degenerate` | 0 | **1** | **0** |
| `stats.outlines` / `fills` | 37 / 38 | 41 / 39 | 42 / 40 |
| `ringFillRate` | 0.9968844 | **0.9363205** | **0.9966431** |
| `ringNotInkMm2` | 2.05875 | **38.9475** | **2.053125** |
| whole-object ink | 6381.64 mm | 6105.72 mm | 6325.02 mm (−0.9 % vs pre-placement) |

---

## 2. Which file owns the fix — and therefore which lane

**The honest fix is in `src/core/geometry-utils.js` → `insetMultiPolygon` (`:1252`, ladder
`:1298-1318`).** That file is on lane a3's FORBIDDEN list today (`F1-placement-plan.md` §12) and is
not assigned to any lane by AGENT-PROTOCOL's serialization map — it is an app-wide primitive also
read by `text.js`, `mappers.js`, `ribbon-geometry.js` and `surface-fill.js`. The boolean stack it
fails through (`fill-boolean.js`) **is** handoff-c3's.

**Disposition, under the orchestrator's ruling (1):** **F1-erode is a CROSS-LANE unit and should
still run on `fill-audit-a3`, with a merge note.** Reasons:

- the RED oracle, every guard, the fixture, and all the evidence are a3's ribbon files;
- `handoff-c3` is `426cc5e4` (clean, pre-placement) and cannot even reproduce the RED — the defect
  only exists on top of `cd541f87`;
- the change touches **no** `fill-boolean.js` line; it only *reads* `FillBoolean.consumeLastOpError`,
  an API `ribbon-geometry.js:300-310` already consumes with the identical idiom.

**Scope grant requested (exactly one file beyond a3's list):**
`src/core/geometry-utils.js`, and within it **only** the `insetMultiPolygon` retry ladder
(`:1306-1317`). Nothing else in that file, and no `fill-boolean.js` change.
**Merge note for the round-3 merge planner:** `geometry-utils.js` is a shared primitive; if any
other lane edits `insetMultiPolygon` before the merge, this hunk conflicts — resolve by keeping
both (the change is 6 lines and self-contained).

The measured blast radius for that grant is §8.

---

## 3. RED oracle on the CURRENT tree (`cd541f87`), no re-pin

All numbers below were re-derived by this planner on `cd541f87`; none is copied from
`F1-placement-impl.md`.

### 3a. The nine standing reds, verbatim, with the numbers they fail on

`npx vitest run tests/unit/scene3d-ribbon-f1b-streaks.test.js` → **36 passed / 8 failed (44)**

| # | test | assertion number |
|---|---|---|
| 1 | `interlockWeave — the existing ring-fill-rate contract still holds (>= 0.995)` | `expected 0.9363204944266638 to be >= 0.995` |
| 2 | `interlockWeave — raw ringNotInkMm2 stays inside a sane anti-explosion guard (< 3 mm²)` | `raw ringNotInkMm2=38.9475: expected 38.9475 < 3` |
| 3 | `interlockWeave — pen-unreachable-corrected residue is a recorded diagnostic, not the pass bar` | `ringNotInkReachableMm2=36.6412 ringUnreachableMm2=2.3062: expected 36.64125 < 1` |
| 4 | `interlockWeave — lattice sensitivity … <= 1 cell` | `reachable @divisor12=6514 @divisor24=6527: expected 13 <= 1` |
| 5 | **`trochoidLoop` — lattice sensitivity … <= 1 cell** | `reachable @divisor12=76 @divisor24=80: expected 4 <= 1` |
| 6 | `interlockWeave — no uncovered cluster reads as a lengthwise streak` | `cluster 3137 cells, 17.6456 mm², 25.125 x 9.600 mm: expected 25.125 <= 1.2` |
| 7 | **`trochoidLoop` — no uncovered cluster reads as a lengthwise streak** | `cluster 34 cells, 0.1912 mm², 1.050 x 0.450 mm: expected true to be false` |
| 8 | `interlockWeave — anti-vacuity: no coverage bought with centrelines` | `expected 1 to be <= 0` (this is `stats.degenerate`) |

`npx vitest run tests/unit/scene3d-ribbon-wall-coverage.test.js` → **35 passed / 1 failed (36)**

| # | test | assertion number |
|---|---|---|
| 9 | `interlockWeave — near-pen ribbons are coverage-clean (ring-fill-rate >= 0.995)` | `expected 0.9363204944266638 to be >= 0.995` |

**Pre-placement control, re-derived in `scratch-F1E-pre` at `8adfd5af`:**
`scene3d-ribbon-f1b-streaks` **44/44 PASS**, `scene3d-ribbon-wall-coverage` **36/36 PASS**.
Both files were green before F1-placement. **No bar in either file is re-pinned by this unit.**

### 3b. The new targeted RED test (the one this unit must add)

New file (a3-owned, new): `tests/unit/scene3d-ribbon-erode-refusal.test.js`.
Fixture identical to `scene3d-ribbon-f1b-streaks.test.js`'s `beforeAll` (default `scene3d` layer,
`primitive: 'torus'`, `style.mapper: 'hatch'`, default camera, density 50, pen 0.30) so the three
files stay comparable.

It must gate **three** quantities, each shown RED on `cd541f87` and GREEN with the fix:

1. **`stats.erodeEmpty === 0` for all five bucket-B laws.**
   RED on `cd541f87`: `interlockWeave = 1`. GREEN: 0. Controls measured 0 on both trees
   (`onePenDown`, `trochoidLoop`, `ampSpacing`, `weaveDepth`).
2. **No swallowed boolean failure survives the ladder.** Wrap
   `GeometryUtils.insetMultiPolygon`; for every call, clear `FillBoolean.consumeLastOpError()`
   before and read it after; assert `count(result.length === 0 && swallowedError) === 0` over a
   whole `interlockWeave` render. RED on `cd541f87`: **1**. GREEN: **0**.
   *This is the assertion that isolates the erodeEmpty event as asked — it fails on the mechanism,
   not on a downstream area number, so it cannot be met by re-tuning anything else.*
3. **Anti-vacuity, mandatory:** assert in the same file that `stats.wide` does **not fall**
   (35 → 40 → 40) and `stats.ribbons === stats.wide` after the fix (39 → 40 against `wide` 40),
   so "erodeEmpty = 0" cannot be bought by reclassifying the stretch out of `CLS_RIBBON`.

**Do NOT gate the new file on `ringFillRate` or `ringNotInkMm2`** — those bars already exist in
`scene3d-ribbon-f1b-streaks.test.js` and `scene3d-ribbon-wall-coverage.test.js` and are the
integration-level oracle; duplicating them in a third file buys nothing and creates a third place
to creep.

### 3c. What the RED oracle explicitly does NOT claim

Reds **5** and **7** (`trochoidLoop`) are **not** this unit's. Measured:

| | `8adfd5af` | `cd541f87` | `cd541f87` + Rank 1 |
|---|---|---|---|
| `trochoidLoop` erosion refusals (`erodeEmpty`/`degenerate`/`clipEmpty`/`noRing`/`noRegion`) | all 0 | **all 0** | all 0 |
| swallowed boolean failures | 0 | **0** | 0 |
| `ringNotInkMm2` | 1.7100 | 2.4694 | 2.4694 (byte-identical) |
| uncovered clusters | 147 | 164 | 164 |
| largest cluster | 0.1237 mm², **0.900 × 0.300 mm** (passes) | 0.2194 mm², 0.600 × 0.675 mm | identical |
| offending cluster (the one that fails) | — | 0.1912 mm², **1.050 × 0.450 mm** @ bbox `115.293,78.153 → 116.343,78.603` | identical |

`trochoidLoop`'s torus geometry is **md5 byte-identical with and without the Rank-1 fix** (§8).
The failure is a 0.19 mm² corner pocket that is 0.15 mm too wide over 1.05 mm — a *placement*
side-effect of F1-placement, not an erosion event. **F1-erode must not touch, widen or re-pin
those two bars.** Escalate them as their own decision (options in §5, "Stop conditions", item 4).

---

## 4. Ranked fixes — Rank 1 PROTOTYPED (spike-gate satisfied)

### RANK 1 — make a swallowed boolean failure keep the ladder running (PROTOTYPED, RECOMMENDED)

`src/core/geometry-utils.js`, `insetMultiPolygon`, 6 added lines. The ladder at `:1298-1305`
already exists and is already correct; it has simply never executed past rung 0 for this class of
failure. `ribbon-geometry.js:296-313` already carries the identical idiom **and its own header
comment saying so** ("FillBoolean swallows polygon-clipping crashes and returns [] (AUD-05) …
`consumeLastOpError` is the only reliable signal — always read it"), so this is not a new pattern,
it is the pattern this file was missing.

```js
    const consumeErr = (typeof FB.consumeLastOpError === 'function')
      ? () => FB.consumeLastOpError()
      : () => null;
    let region = null;
    for (const [ins, phase, tol] of attempts) {
      try {
        consumeErr();                                   // clear anything a prior caller left
        const rings = tol > 0
          ? boundaryRings.map((r) => { const s = simplifyPath(r, tol); return (s && s.length >= 4) ? s : r; })
          : boundaryRings;
        const cut = strokeRingsToBand(rings, ins * 2, { boolean: FB, joinSides, diskPhase: phase, joinSkipAngle });
        if (consumeErr()) { region = null; continue; }   // swallowed failure → next rung
        region = (cut && cut.length) ? (FB.difference(snappedMp, cut) || []) : [];
        if (consumeErr()) { region = null; continue; }
        break;
      } catch (_) { region = null; }
    }
    consumeErr();                                        // do not leak an error to the next caller
```

The implementer should prefer reusing `ribbon-geometry.js`'s `runBooleanOp` shape if it can be
shared cleanly; if not, the six lines above are the minimum. **A genuinely empty erosion still
returns `[]` from the first rung that raises no error and is never retried** — the documented
behaviour at `:1294-1297` is preserved verbatim.

**Which rung recovers (instrumented):**

```
LADDER-RETRY     attempt 0  cut-union swallowed
LADDER-RECOVERED attempt 1  regionPolys 1  inset 0.150555  tol 0
```

Attempt 1 is the existing `[inset * 1.0037, 0.29, 0]` rung: inset moves from 0.150000 to
0.150555 mm (**+0.000555 mm, 0.37 % of the inset, ≈ 1/540 of a pen**) and `tol = 0`, so **no RDP
simplification and no geometric approximation is introduced.** The recovery is exact.

#### Rank-1 prototype report (all re-measured in `scratch-F1E`, foreground, `timeout: 600000`)

**The nine guards' pass counts**

| file | `8adfd5af` | `cd541f87` | `cd541f87` + Rank 1 |
|---|---|---|---|
| `scene3d-ribbon-f1b-streaks.test.js` | **44/44** | 36/44 | **42/44** |
| `scene3d-ribbon-wall-coverage.test.js` | **36/36** | 35/36 | **36/36** |

**7 of the 9 reds go green.** The two survivors are `trochoidLoop` reds **5** and **7** (§3c) —
byte-identical geometry, provably untouched by this fix.

**Deep-blank (condition 1's primary gate, bar ≤ 0.55 mm² on all three laws)** — 0.1 mm raster,
`captureRegionRings` dominant region, `dist > 2.0 mm`:

| law | `cd541f87` | `cd541f87` + Rank 1 | bar |
|---|---|---|---|
| `interlockWeave` | 0.0300 | **0.0000** | ≤ 0.55 ✓ |
| `onePenDown` | 0.0000 | **0.0000** | ≤ 0.55 ✓ |
| `trochoidLoop` | 0.0000 | **0.0000** | ≤ 0.55 ✓ |

Condition 2's restated bars also improve (they are not re-pinned, they simply gain margin):

| law | largest `>0.8 mm` cluster, `cd541f87` | + Rank 1 | bars |
|---|---|---|---|
| `interlockWeave` | 39.810 mm², 27.40 × 6.90 mm | **28.390 mm², 26.30 × 6.20 mm** | ≤ 45 mm² / ≤ 30 mm ✓ |
| `onePenDown` | 21.270 mm², 23.30 × 3.00 mm | 21.270 (identical) | ✓ |
| `trochoidLoop` | 14.030 mm², 19.20 × 2.70 mm | 14.030 (identical) | ✓ |

`tests/unit/scene3d-ribbon-flat-field-placement.test.js` (F1-placement's own oracle, including its
condition-4 byte-identity block): **22/22 PASS** under the prototype.
*(In a bare `git archive` export this file first errors with `git show 8adfd5af:… fatal: not a git
repository` — a scratch-export artefact, not a failure. Fixed by `git init` + `git fetch <a3
worktree> refs/heads/3d-scene/fill-audit-a3` inside the scratch dir; then 22/22.)*

**md5 byte-identity of `ampSpacing` / the WV6 laws / the other mark laws** — full detail in §8.
Headline: **174 of 185 measured (primitive × mapper × law) cells are byte-identical**; the 11 that
move are listed by name with their ink deltas, all inside the ±8 % stop-condition-2 bar.
On the torus/hatch fixture that F1-placement's condition 4 governs, `ampSpacing`, `weaveDepth`,
`taperedEnds`, `weightSmoothstep`, `trochoidLoop` and `onePenDown` are **all byte-identical**;
only `interlockWeave` changes.

**Other suites run under the prototype** (foreground, one file per command):
`geometry-band-fill` 7/7 · `fill-boolean-safe-op` 6/6 · `text-fill-watertight` 68/68 ·
`text-outline-ops` 12/12 · `scene3d-mesh-self-occlusion` 5/5 ·
`scene3d-ribbon-wall-region-clip` 1/1 · `scene3d-ribbon-outline-fill-seam` 4/4 ·
`scene3d-ribbon-c3-rule5` 6/6 · `scene3d-ribbon-primitives` 14/14 ·
`scene3d-ribbon-weightscale-invariant` 18/18. All green.
(`scene3d-ribbon-primitives` and `scene3d-ribbon-flat-field-placement` exit 1 on the documented
benign `[vitest-worker]: Timeout calling "onTaskUpdate"` RPC warning with every test passing —
pre-existing shared-machine noise per §0 of the resume briefs.)

**Cost:** the retry runs only when a failure is swallowed — 1 call in 79 on the worst cell, 11
cells in 185. Each `consumeErr()` is a property read on a closure variable. No measurable cost.

### RANK 2 — retry inside `erode()` in `surface-fill.js` (lane-clean, inferior)

a3 owns `surface-fill.js:6834`. `erode()` could read `consumeLastOpError()` itself and, on a
swallowed failure with an empty result, re-call `insetMultiPolygon` with a nudged inset.
**Why it ranks below Rank 1:** it re-implements a ladder that already exists one level down; it
fixes exactly one of the five call sites (`text.js`, `mappers.js`, `ribbon-geometry.js` and
`surface-fill.js`'s other `erode` call keep the silent hole); and it cannot reach the *internal*
rungs (`diskPhase`, RDP `tol`) that make the existing ladder work. Take it **only** if the
orchestrator refuses the `geometry-utils.js` grant. Not prototyped.

### RANK 3 — make `strokeRingsToBand` resilient per contour (`geometry-utils.js:1034`)

On a failed per-contour `FB.union`, bisect `geoms` and union the halves, then union the halves'
results. Strictly more invasive, in the same file, and unnecessary once Rank 1 lands — Rank 1
already recovers this case at the ladder level with an exact result. Keep as the fallback if a
future failure survives all five rungs. Not prototyped.

### RANK 4 — REJECTED with reasoning: fall back to the UN-ERODED outline

Changing `surface-fill.js:7259`'s `if (!any)` fallback to emit `clippedMP`'s own boundary instead
of a centreline puts a stroked pen's **outer** edge one pen-radius **outside** the front test's
proven region. That is defect D2 restored, which `surface-fill.js:7178-7196`'s own comment block
exists to prevent ("NO REGION, NO RIBBON … the honest output is the CENTRELINE"). Do not take it.

### RANK 5 — REJECTED by measurement: re-pin the nine bars

Disproven by §6: the erodeEmpty event is **not** the same document-space event as condition 2's
39.81 mm² cluster, so the nine reds are not "old bars seeing a ruled trade-off". Re-pinning them
would pin a genuine regression. The orchestrator's ruling already forbids it; the measurement now
supports the ruling.

---

## 5. Guards, evidence, files, stop conditions, parallelism

### Guards that must stay green (run individually, FOREGROUND, `timeout: 600000`, one file per command)

**Must go from RED to GREEN (the unit's point):**
`scene3d-ribbon-f1b-streaks` (36/44 → **42/44**; the two `trochoidLoop` survivors must be named
individually in the impl report under `## Pre-existing red`) ·
`scene3d-ribbon-wall-coverage` (35/36 → **36/36**).

**Must stay green — ribbon/scene3d (all verified green under the prototype by this planner):**
`scene3d-ribbon-flat-field-placement` (22/22, incl. its condition-4 byte-identity block) ·
`scene3d-ribbon-wall-region-clip` (1/1) · `scene3d-ribbon-outline-fill-seam` (4/4) ·
`scene3d-ribbon-c3-rule5` (6/6) · `scene3d-ribbon-primitives` (14/14) ·
`scene3d-ribbon-weightscale-invariant` (18/18) · `scene3d-mesh-self-occlusion` (5/5).

**Must stay green — the shared-primitive blast radius (this is why the grant needs them):**
`geometry-band-fill` (7/7 — the file that already covers `insetMultiPolygon`) ·
`fill-boolean-safe-op` (6/6 — `consumeLastOpError`'s own contract) ·
`text-fill-watertight` (68/68) · `text-outline-ops` (12/12).

**Not yet run by this planner — the implementer must run them (Tier-2 slow, budget 600 s each):**
`scene3d-mark-laws-draw` (30/30 is T4/W-36c's number) · `scene3d-ladder-uniform-field-spacing`
(9/9) · `scene3d-style-fill-lines` (15/15) · `scene3d-curved-density-floor` ·
`scene3d-curved-density-sparse-end` · `scene3d-ribbon-f6-self-occlusion` ·
`scene3d-ribbon-f7-self-occlusion` · `scene3d-fill-even-spacing` · `scene3d-fill-span-verdict` ·
`scene3d-fill-ruling-continuity` · `scene3d-fill-seam-continuity` · `scene3d-fill-boundary-ends` ·
`scene3d-hlr-spatial-index-identity` · `scene3d-shadow-receive` (shadows.js also reads
`consumeLastOpError` at `:3096` — see §8's "clear-before-read" note).
Every guard must be shown **non-vacuous** — it asserts a real moved number, not "no throw".

### Evidence cells (checked against `docs/3d-audit/fill-audit/manifest.B.*.jsonl`)

**Verified present** (1 manifest line each, `appVersion` 1.4.1):

| cell | manifest file |
|---|---|
| `torus__hatch__interlockWeave__med__a` (**required minimum**) | `manifest.B.4-5.jsonl` |
| `torus__hatch__interlockWeave__max__a` (**required minimum**) | `manifest.B.1-5.jsonl` |
| `torus__hatch__onePenDown__med__a` | `manifest.B.2-5.jsonl` |
| `torus__hatch__trochoidLoop__med__a` | `manifest.B.5-5.jsonl` |
| `torus__hatch__ampSpacing__med__a` | `manifest.B.2-5.jsonl` |
| `torus__hatch__weaveDepth__med__a` | `manifest.B.3-5.jsonl` |
| `sphere__hatch__isophoteWidth__med__a` | `manifest.B.3-5.jsonl` |
| `sphere__hatch__whiteBand__med__a` | `manifest.B.4-5.jsonl` |
| `cone__hatch__taperedEnds__med__a` | `manifest.B.5-5.jsonl` |
| `cone__hatch__trochoidLoop__med__a` | `manifest.B.4-5.jsonl` |

**Verified ABSENT — do not name them as gallery cells:** `capsule__*` (the gallery holds only
`sphere`, `torus`, `box`, `cone`: 1167 / 1152 / 502 / 1167 manifest lines). The two capsule cells
that change (§8) must be captured **bespoke** or reported numerically only.

Re-shoot from MAIN so output lands in MAIN's gallery dir, `after/F1-erode/…`:

```
node scripts/audit/scene3d-capture.js --tier B --root <a3 worktree> --port <free ≥ 8510> \
  --only '^(torus__hatch__(interlockWeave|onePenDown|trochoidLoop|ampSpacing|weaveDepth)__(med|max)__a|sphere__hatch__(isophoteWidth|whiteBand)__med__a|cone__hatch__(taperedEnds|trochoidLoop)__med__a)$' \
  --out docs/3d-audit/fill-audit/after/F1-erode
```

`before` pointers go to the top-level `shots/B/…` gallery baseline. **`onePenDown`, `trochoidLoop`,
`ampSpacing` and `weaveDepth` on the torus are expected byte-identical — that identity IS the
correct-scoping proof and must appear in `identical_exceptions` with that reason.**
**LOOK at `torus__hatch__interlockWeave__med__a` before/after, cropped at NATIVE resolution over
the document band `x 130–156, y 71–83 mm`** (the stretch's own bbox) — the after must show a full
filled ribbon where the before shows a single thin centreline threading an otherwise bare band.

### Files ALLOWED / FORBIDDEN

**Allowed**
- `src/core/geometry-utils.js` — **only** `insetMultiPolygon`'s retry ladder (`:1306-1317`).
  **Granted by the orchestrator for this unit only; blast radius measured in §8.**
- `tests/unit/scene3d-ribbon-erode-refusal.test.js` (new).
- `docs/3d-audit/lane-reports/F1-erode-impl.md`,
  `docs/3d-audit/fill-audit/after/F1-erode/report.json`, `docs/3d-audit/STILL-OPEN.md`,
  `CHANGELOG.md`, `plans.md`.

**Forbidden**
- Any bar in `scene3d-ribbon-f1b-streaks.test.js` or `scene3d-ribbon-wall-coverage.test.js`
  — **no re-pin, in either direction**, including the two `trochoidLoop` bars.
- Any bar in `scene3d-ribbon-flat-field-placement.test.js` (F1-placement's; its cluster bars now
  have *more* margin — tightening them is a bar change and belongs to another unit).
- `src/core/fill-boolean.js` (handoff-c3) · `src/core/scene3d/surface-fill.js` (this unit needs
  none of it) · `surface-fill-mono.js` · `hlr.js` / `shadows.js` / `pen-fill.js` · `mappers.js` ·
  `ribbon-geometry.js` · the master grid · `emitContFamily` · `ladderStep`/`ladderKeeps`/`spanDrops`
  · `ribbonizeCore` and the stretch classifier · `HL_STAGE`.
- Any other worktree; any push, merge, tag or version bump.

### Stop conditions (ship the measurement, do not fudge)

1. **The ladder does not recover** on some cell — i.e. a swallowed failure survives all five rungs.
   Ship the count and the failing input's area/width/bbox; escalate Rank 3. Do **not** widen a bar.
2. **Scope leak.** Any *additional* cell beyond §8's enumerated 11 changes its md5, or any ink
   delta leaves ±8 % at density 50. Ship the new list.
3. **`ringFillRate` < 0.995 or `degenerate > 0` or `wide` falls** for any of the five bucket-B
   laws. (Prototype: 0.99664 / 0 / rises.)
4. **The two `trochoidLoop` reds.** They are out of scope and will still be red at the end of this
   unit. Report them by name under `## Pre-existing red`, with §3c's numbers, and **stop for a
   ruling** — do not re-pin, do not widen, do not "fix" them inside F1-erode.
5. **`consumeLastOpError` contract.** If `fill-boolean-safe-op.test.js` or any
   `consumeLastOpError` consumer (`pathfinder-ops.js:269`, `ribbon-geometry.js:302`,
   `shadows.js:3096`) changes behaviour, stop — see §8's "clear-before-read" note.
6. **You may report DONE or DONE/FU. You may NOT report "F1 CLOSED."** No F1 bench screenshot
   exists in the repo; `docs/stroke-fill-handoff.md` §A requires Jay to confirm by eye. F1-amp
   (F1-placement condition 5) is still unimplemented.

### Can F1-amp proceed in parallel?

**NO — F1-amp must stay serialized after F1-erode.** Reasons:

- F1-amp's brief (F1-placement-plan §9) puts it in `surface-fill.js`'s `wvAmpAsk`/`wvRamp`
  (`:3941-3958`) on lane a3 — a different file from F1-erode's, so file contention is not the
  issue;
- the issue is the **oracle**. F1-amp's acceptance runs through the same
  `scene3d-ribbon-f1b-streaks` / `scene3d-ribbon-wall-coverage` guards, which are **red on this
  tree**. An implementer starting F1-amp now inherits nine reds it did not cause and cannot
  distinguish its own regressions from them — exactly the failure mode that produced
  F1-placement's vacuous "pre-existing red" proof.
- F1-erode is small (6 source lines, one new test file, one guard battery). Serializing costs
  little.

**Sequence: F1-erode → (ruling on the two `trochoidLoop` reds) → F1-amp.**

---

## 6. GATING ANSWER — is the erodeEmpty stretch the same document-space event as condition 2's 39.81 mm² cluster?

### **NO.** Measured, both directions.

Method: the erodeEmpty call's input multipolygon was dumped to JSON from the instrumented
`insetMultiPolygon` (single shell, 51.77 mm², bbox `130.156, 71.033 → 155.890, 82.841`). Every
cluster cell centre from the two independent oracles was then point-in-polygon tested against it.

**Direction A — condition 2's cluster vs the stretch.**
`buildBlankMap(region, ink, 0.3, { cellSize: 0.1, thresholds: [0.8, 2.0] })` on `cd541f87`,
`interlockWeave`: largest `>0.8 mm` cluster = **39.8100 mm², 3981 cells, bbox
`121.740, 72.452 → 149.140, 79.352`, extent 27.400 × 6.900 mm** — the exact 39.81 the impl report
names.

> **Overlap with the erodeEmpty stretch: 2 of 3981 cells = 0.05 % = 0.0200 mm².**

**Direction B — the ring-coverage residue vs the stretch.**
`buildCoverageGrid` (cs 0.075) on the same render: 6924 uncovered cells = 38.9475 mm² in 154
clusters.

| cluster | area | bbox | inside the stretch |
|---|---|---|---|
| #0 | 18.7537 mm² | `130.272, 71.628 → 154.797, 82.878` | **3334 / 3334 = 100.0 %** |
| #1 | 17.6456 mm² | `130.272, 71.028 → 155.397, 80.628` | **3134 / 3137 = 99.9 %** |
| #2 | 0.7200 mm² | `153.747, 80.853 → 155.022, 82.203` | **128 / 128 = 100.0 %** |
| #3 | 0.0450 mm² | `146.847, 86.853 → 147.072, 87.078` | 0 / 8 = 0 % |

**37.12 mm² of the 38.95 mm² residue — 95.3 % — lies inside the erodeEmpty stretch.**
Cluster #1 is precisely the `25.125 × 9.600 mm` cluster that fails red #6.

### What that means

The two events are **disjoint sets of document space that share a boundary**:

- the erodeEmpty event is a hole **inside one ribbon** (the ribbon's own fill replaced by a
  centreline) — the ring-coverage oracle's denominator, and what the nine reds measure;
- condition 2's 39.81 mm² cluster is the blank **between ribbons** in the front region — the
  RED-2 oracle's denominator, which excludes ribbon interiors by construction.

They read as similar magnitudes (38.95 vs 39.81 mm²) and their bboxes partly overlap, but that is
a **coincidence of size, not identity** — the impl report's "very likely the same event" is
**disproven**.

They are, however, **causally coupled**: restoring the ribbon's fill puts ink along the stretch's
two edges, which pulls neighbouring between-ribbon cells inside the 0.8 mm threshold. Measured
under the Rank-1 prototype, condition 2's cluster falls **39.810 → 28.390 mm²** (−28.7 %) and its
extent 27.40 → 26.30 mm, with **zero** cells moved from the ribbon interior.

### Therefore — the answer the orchestrator asked this question to decide

**The nine reds are a SECOND DEFECT, not older bars seeing a ruled trade-off.** They must be
fixed, not re-pinned. Condition 2's ruled trade-off ("B measures more area but far less depth")
is a genuinely separate, separately-disclosed quantity that F1-erode *improves* as a side effect
without being gated on it.

---

## 7. onePenDown ribbon WIDTH — placement effect or sub-threshold erosion fallback?

*(Added at the orchestrator's request after looking at
`docs/3d-audit/fill-audit/after/F1-placement/orchestrator-onePenDown-med-before-after.png`:
onePenDown's inner and lower-front bands read as thin wireframe zigzags after F1-placement.)*

Method: `RibbonGeometry.buildRibbonMultiPolygon` wrapped on the loaded runtime — one call per
`CLS_RIBBON` stretch — recording the stretch's polyline length, centroid, and the full half-width
array (`width = 2 · half`, and `half[i] = penWidth · clamp(wPts[i]) / 2`, `surface-fill.js:6968`).
`PenFill.fillRegion` wrapped in the same run to attribute interior fill passes and fill ink to the
stretch that produced them. Torus, hatch, density 50, pen 0.30, default camera.

### ANSWER: **placement. Not the erosion-fallback class.** Three independent proofs.

1. **`onePenDown` fires no erosion refusal at all, on either tree.**
   `erodeEmpty = 0`, `degenerate = 0`, `clipEmpty = 0`, `noRing = 0`, `noRegion = 0` at
   `8adfd5af` **and** at `cd541f87`. There is nothing of the interlockWeave class to be
   sub-threshold about.
2. **The Rank-1 erosion fix leaves `torus/hatch/onePenDown` md5 byte-identical** (§8), and its ink
   is identical to the 0.01 mm (6326.84 mm both ways). The erosion path is provably not involved.
3. **The width distribution moves, but only modestly and without any collapse to centreline.**

| `torus/hatch/onePenDown`, d=50 | `8adfd5af` (pre) | `cd541f87` (post) | Δ |
|---|---|---|---|
| `CLS_RIBBON` stretches | 11 | 14 | +3 |
| total stretch length | 710.10 mm | 710.89 mm | **+0.1 %** |
| ribbon width, length-weighted mean | **1.0301 mm (3.43 pen)** | **0.9860 mm (3.29 pen)** | **−4.3 %** |
| width p25 / median / p75 / max | 0.7157 / 0.9685 / 1.1565 / 1.3089 | 0.7017 / 0.9910 / 1.0523 / 1.3009 | p75 **−9.0 %**, median **+2.3 %** |
| interior fill ink | 2756.39 mm | 2493.05 mm | **−9.6 %** |
| fill ink per mm of ribbon | 3.882 | 3.507 | **−9.7 %** |
| `wallCentres` (bare centreline stretches) | 1 | 2 | +1 |
| **whole-object ink** | **6558.84 mm** | **6326.84 mm** | **−3.5 %** (inside the ±8 % bar) |

**Why a 4 % width change reads as "bold → wireframe".** The ribbon pipeline removes a **fixed**
0.51 mm of width before PenFill ever sees the region: `penWidth` for the outline erosion
(`surface-fill.js:7211`) plus `2 × penWidth × (0.5 − RIBBON_OVERLAP) = 0.21 mm` for the fill
erosion (`:7233`). So the *filled* width is `w − 0.51`, and the amplification factor is
`w / (w − 0.51) ≈ 2.0` at these widths:

- length-weighted fill-region width `1.0301 − 0.51 = 0.5201` → `0.9860 − 0.51 = 0.4760` mm,
  **−8.5 %** — which predicts the measured **−9.6 %** fill-ink drop almost exactly.
- the two longest pre-fix stretches show it sharply:
  `s0 205.2 mm @ w 1.106, fill 4.68 /mm` and `s2 158.1 mm @ w 1.157, fill 4.91 /mm` are re-cut into
  `s0 179.1 mm @ w 0.994, 3.80 /mm`, `s1 171.0 mm @ w 1.028, 3.93 /mm`, `s2 97.1 mm @ w 1.202,
  5.11 /mm` — the long bold runs lose ~0.11 mm of width and ~20 % of their fill ink per mm.
- three new short stretches appear below one pen (`w` 0.126 / 0.174 / 0.264 mm) and emit **zero**
  fill passes — correct behaviour (C3 rule 5: at or below one pen, one pass already inks the full
  width), but three more thin zigzags in the picture.

**Mechanism, stated plainly.** `wvPlaceCov(localPitch)` (`surface-fill.js:4033-4038`) changes the
*coverage reserve*, hence which rulings the accumulator keeps — it does **not** set ribbon width.
Width comes from the weight field at each surviving sample. Under even screen placement the kept
rulings sit at more representative positions on the form instead of clumping where the old
index-even reserve happened to pile them, so the widest ribbons stop being quite so wide. Total
ruling length is unchanged (+0.1 %); the ink is redistributed, not removed — and the erosion's
fixed 0.51 mm bite doubles the visual consequence. **This is the mechanism working as designed,
at a strength Jay has not yet signed off on.**

**For Jay's decision.** The trade he is being offered on `onePenDown` is:
deep-blank (> 2 mm) **4.00 → 0.00 mm²** and largest blank cluster **39.04 → 21.27 mm²**, paid for
with **−3.5 % total ink**, **−9.6 % interior fill ink** and a **−4.3 % mean ribbon width** — i.e.
the form is evenly covered but the ribbons read lighter. Nothing here is broken; it is a
legibility/weight preference. If he wants the old boldness back **with** the new placement, the
lever is the weight field (or F1-amp's amplitude floor), not the erosion and not the placement
reserve — and that is a new unit, not a revert.

---

## 8. Blast radius of the `geometry-utils.js` grant (measured)

Method: for every cell, load the runtime, build a default `scene3d` torus/sphere/cone/capsule
object, set `style.mapper` and `style.params.toneLaw`, run `computeAllDisplayGeometry()`, and md5
every emitted `scenePaths` entry's `meta.kind` plus every point at 6 decimal places. Run twice —
`cd541f87` unpatched, and `cd541f87` + Rank 1 — and diff.

**Roster: `SCENE3D_TONE_LAWS.PRODUCTION` = 37 laws.**

| sweep | cells | byte-identical | changed |
|---|---|---|---|
| `hatch` × {torus, sphere, cone, capsule} × 37 laws | 148 | **141** | **7** |
| `contour` × torus × 37 laws | 37 | **33** | **4** |
| **total** | **185** | **174 (94.1 %)** | **11 (5.9 %)** |

**Every cell that changes, named, with what changed:**

| cell | `degenerate`/`erodeEmpty` | `fills` | ink (mm) | Δ ink |
|---|---|---|---|---|
| `torus / hatch / interlockWeave` | **1/1 → 0/0** | 39 → 40 | 6105.72 → 6325.02 | **+3.6 %** |
| `capsule / hatch / interlockWeave` | **1/1 → 0/0** | 19 → 20 | 5395.75 → 5710.49 | **+5.8 %** |
| `sphere / hatch / isophoteWidth` | 0/0 → 0/0 | 17 → 18 | 6644.54 → 6947.29 | **+4.6 %** |
| `sphere / hatch / whiteBand` | 0/0 → 0/0 | 17 → 18 | 6992.50 → 7295.25 | **+4.3 %** |
| `cone / hatch / taperedEnds` | 0/0 → 0/0 | 10 → 11 | 3670.40 → 3861.48 | **+5.2 %** |
| `capsule / hatch / ampSpacing` | 0/0 → 0/0 | 45 → 46 | 6501.96 → 6635.65 | **+2.1 %** |
| `cone / hatch / trochoidLoop` | 0/0 → 0/0 | 43 → 43 | 5097.49 → 5096.95 | **−0.01 %** |
| `torus / contour / weaveDepth` | 0/0 → 0/0 | 61 → 63 | 6302.46 → 6380.94 | **+1.25 %** |
| `torus / contour / trochoidLoop` | 0/0 → 0/0 | 68 → 69 | 6521.63 → 6525.40 | **+0.06 %** |
| `torus / contour / ampSpacing` | 0/0 → 0/0 | 69 → 69 | 6546.39 → 6548.46 | **+0.03 %** |
| `torus / contour / onePenDown` | 0/0 → 0/0 | 69 → **67** | 6845.89 → 6800.47 | **−0.66 %** |

Reading of the table:

- **Nine of eleven GAIN ink** — the swallowed-failure bug was silently costing fill regions on
  cells that have nothing to do with F1 (`isophoteWidth`, `whiteBand`, `taperedEnds`). The fix
  recovers geometry that was being dropped without any counter reporting it (only the two
  `interlockWeave` cells had `erodeEmpty` set at all — the other nine failures were swallowed at
  the *fill* depth, where an empty result still leaves `any === true` from the outline and so is
  never counted).
- **Two cells lose a trace of ink.** `cone/hatch/trochoidLoop` −0.54 mm (−0.01 %) and
  `torus/contour/onePenDown` −45.4 mm (−0.66 %, 2 fewer fill paths). A retry at
  `inset × 1.0037` yields a very slightly different — not strictly larger — region.
  **The fix is not purely additive, and this must be disclosed in the impl report.**
- **All eleven are inside stop-condition-2's ±8 % ink bar.** Range −0.66 % … +5.8 %.
- Every changed cell is a law that reaches the `CLS_RIBBON` erosion path. **No non-ribbon mark law
  moves anywhere.**
- On F1-placement's condition-4 fixture (`torus/hatch`), `ampSpacing`, `weaveDepth`,
  `taperedEnds`, `weightSmoothstep`, `trochoidLoop` and `onePenDown` are all **byte-identical**;
  only `interlockWeave` moves.

**Coverage gap the implementer must close:** this planner swept `hatch` on four primitives and
`contour` on the torus. The gallery carries 8 Types. **The implementer must extend the md5 sweep
to the remaining mappers on at least the torus** before claiming the blast radius, and list any
further changed cell by name.

**One behavioural note that is NOT byte-visible.** Rank 1 calls
`FillBoolean.consumeLastOpError()` at the top of each rung, which clears any error a *previous*
caller left pending. Audited: all four consumers already clear-before-read —
`pathfinder-ops.js:269-271`, `ribbon-geometry.js:302-310` (`runBooleanOp`, the same idiom),
`shadows.js:3096-3097` (reads immediately after its own op). `fill-boolean-safe-op.test.js` is
6/6 green under the prototype. Risk assessed as low, but it is a real coupling and belongs in the
impl report.

---

## 9. Bars changed

**None.** This plan changes no threshold, tolerance, count bar or pinned fingerprint anywhere. The
new file's three assertions (`erodeEmpty === 0`, `swallowed-and-empty count === 0`, `wide` does
not fall) are new gates on quantities with no prior bar, each shown RED on `cd541f87` and GREEN
with the fix, each on an integer count where the only passing value is the one the fix produces —
so none of them can be crept.

If the implementer finds it must move a bar, that is a stop-and-report under AGENT-PROTOCOL's
"Bars changed — mandatory disclosure", not a plan amendment.

---

## 10. Reproduction recipe (for the implementer and the reviewer)

```
mkdir -p /private/tmp/claude-501/scratch-<id>
git -C /Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a3 \
    archive cd541f87 | tar -x -C /private/tmp/claude-501/scratch-<id>
ln -sfn /Users/jayphi/Documents/github/vectura-studio/node_modules /private/tmp/claude-501/scratch-<id>/node_modules
# scene3d-ribbon-flat-field-placement.test.js shells out to `git show 8adfd5af:…`, so:
git -C /private/tmp/claude-501/scratch-<id> init -q
git -C /private/tmp/claude-501/scratch-<id> fetch -q --no-tags \
    /Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a3 \
    refs/heads/3d-scene/fill-audit-a3
```

Then, FOREGROUND, one file per command, `timeout: 600000`:
`npx vitest run tests/unit/scene3d-ribbon-f1b-streaks.test.js` (expect 36/44 before, 42/44 after)
and `npx vitest run tests/unit/scene3d-ribbon-wall-coverage.test.js` (35/36 before, 36/36 after).

The planner's probe scripts remain in `/private/tmp/claude-501/scratch-F1E/`:
`probe-erode.js` (swallowed-failure census), `probe-overlap.js` (§6 direction A),
`probe-ringcluster.js` (§6 direction B), `probe-width.js` (§7), `probe-md5.js` (§8),
`probe-blank.js` (deep-blank / cluster table), plus `geometry-utils.orig.js` — the unpatched
`cd541f87` file, so the prototype can be toggled with a single `cp`.
