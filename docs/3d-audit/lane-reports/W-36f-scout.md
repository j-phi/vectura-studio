STATUS: SCOUTED — no setting

# W-36f — scout: retune the crosshatch anti-saturation cap's onset (Jay's decision 11 = B)

Read-only scout, round 4. Jay (2026-09-17, Decision Desk, item 11 → **B**): *"Retune the cap's onset
so some tone authority survives at d=220"* — the mutation number already on record from W-31b's
naive-parity measurement: **cylinder d=220 uncapped = 9136.8 mm, +93.5 % over shipped, cov 0.9867**
(reproduced again independently in W-36c-impl.md's own M2 mutation: 9136.777 mm, cov 0.9867). The
question this scout answers: can the cap's onset be loosened *at all* without walking back toward
that number?

- Base: **`b43fa4e3`** (main HEAD, round 3 closed, v1.4.2) — main was not touched.
- Scratch export: `/private/tmp/claude-501/scratch-W36f` (`git archive b43fa4e3`, `node_modules`
  symlinked from MAIN). **Nothing was written to any worktree or MAIN except this report.**
- Method: patched `src/core/scene3d/surface-fill.js`'s `crossMinPitch()` (the cap constant,
  `docs/3d-audit/lane-reports/W-36c-plan.md` §2.3, shipped as `crossMinPitch() = inkWidth() * 2`) in
  the **scratch export only** with a runtime scale knob (`window.__W36F_SCALE`, default 1 = shipped,
  exactly the shipped behaviour), so the sweep needed no rebuild. Confirmed inert at `scale = 1`:
  every d=220 ink number reproduces the shipped W-36c/main values **to the digit** (sphere 4328.51,
  cylinder 5828.44, torus 4146.25, ellipsoid 4859.18 — see `docs/3d-audit/lane-reports/W-36c-impl.md`
  "GREEN — every number matches the plan's own prototype to the digit").
- ⚠ **Harness gotcha, disclosed for the next scout that reaches for a runtime knob in this test
  helper**: `tests/helpers/load-vectura-runtime.js` runs every module inside a `vm` context where
  `context.globalThis = context` — a **separate object from Node's own `global`/`globalThis`**. A
  knob set via `global.__X` in the calling Node script is invisible inside `surface-fill.js`. The
  fix is to read/write on `window` instead (`context.window = window`, and `window` is the same
  object `loadVecturaRuntime()` returns) — confirmed by instrumenting `ladderPairWantedPitch` itself
  and watching `window.__W36F_SCALE` actually reach it, `global.__W36F_SCALE` not.
- All measurement runs were foreground, `timeout: 600000`, one scale per `node` invocation (not
  vitest — the same rig/instruments reused verbatim, see below). Each scale took ~23–25 s once
  `process.exit(0)` was added after `runtime.cleanup()` (jsdom leaves the event loop open otherwise,
  which is a second, unrelated harness gotcha worth flagging: a bare `node` script using this helper
  hangs after finishing its own console output unless it force-exits).
- Instruments reused **verbatim** from the shipped test files (never reimplemented): `rawRuns` /
  `rulingStats` / `crosshatchStats` / `hatchRulingCount` / `inkCoverage` (P5a's own W-26b instrument)
  from `scene3d-crosshatch-parity.test.js`; `localGaps` / `cellShapeStats`'s interior-cell-AREA
  construction (C7's own quantity, az315/az135 ratio) from `scene3d-crosshatch-cell-shape-b.test.js`.
  Rig: `PRIMITIVE_PARAM_DEFAULTS` + `DEFAULT_CAMERA`, ground+backdrop off, `fillAngle 45`,
  `toneLaw 'ladder'`, `BOUNDS 320×220`, pen 0.3 — the same rig every W-36/W-36c/W-31b report used.

---

## 1. The cap's current onset (shipped, `scale = 1.0`) — per primitive

**Onset table** — family A / family B ruling count as a fraction of the matching single-family hatch
count (the quantity W-36c-plan §2.4 tabulated; 1.000 = cap fully dormant):

| d | sphere A/B | cylinder A/B | cone A/B | ellipsoid A/B | torus A/B |
|---|---|---|---|---|---|
| 1 | 1.000/1.500 | 1.000/1.000 | 1.000/1.667 | 1.000/1.200 | 1.000/1.000 |
| 50 | 1.000/1.313 | 1.000/1.000 | 1.000/1.000 | 1.000/1.313 | 1.000/1.000 |
| 80 | 1.000/1.265 | 1.000/1.043 | **1.000/0.971** | 1.000/1.273 | 1.000/1.045 |
| 100 | 1.000/1.314 | 1.020/1.082 | 1.000/0.947 | **0.971/1.286** | 1.000/1.000 |
| 110 | 0.974/1.289 | 1.000/1.038 | 1.000/0.975 | 0.973/1.270 | 1.000/1.040 |
| 140 | 0.953/1.256 | **0.934/1.000** | 0.957/0.915 | 0.952/1.262 | **0.933/0.933** |
| 150 | 0.913/1.174 | 0.906/0.953 | 0.918/0.878 | 0.889/1.178 | 0.935/0.935 |
| 170 | 0.827/1.038 | 0.808/0.849 | 0.821/0.804 | 0.824/1.039 | 0.806/0.861 |
| 220 | 0.667/0.783 | 0.660/0.691 | 0.667/0.667 | 0.657/0.806 | 0.761/0.761 |
| 300 | 0.610/0.701 | 0.585/0.604 | 0.605/0.593 | 0.613/0.720 | 0.686/0.706 |

Reproduces `W-36c-plan.md` §2.4's table to the digit everywhere it overlaps (sphere/cylinder/torus/
ellipsoid), and independently derives **cone** (not in that table): 220 A=48/72=0.667, matching the
plan's own prose mention ("cone d=220 A 48 vs 72") exactly.

**First touch / binds, per primitive** (first touch = first density either family drops under 1.000;
binds = first density either family drops under 0.90):

| primitive | dormant through | first touch | binds by |
|---|---|---|---|
| sphere | d=100 | d=110 (A 0.974) | d=170 (0.827) |
| cylinder | d=110 | d=140 (A 0.934) | d=150–170 (0.906→0.808) |
| **cone** | d=50 | **d=80 (B 0.971 — earliest of the five, via the CROSSING family, not the primary)** | d=150–170 (0.918→0.821) |
| ellipsoid | d=80 | d=100 (A 0.971) | d=150 (0.889) |
| torus | d=110 | d=140 (A/B 0.933, both simultaneously) | d=170 (0.806, **most resistant of the five** — never drops below 0.76 even at d=300) |

Cone is the outlier: its crossing family (B) touches the cap **30 density units before any other
primitive**, and via the *crossing* family rather than the *primary* one every other primitive touches
through first.

## 1b. Tone-authority curve — shipped (`scale = 1.0`), all five primitives, d = 50/100/150/220

C7's own quantity (`docs/3d-audit/lane-reports/W-31b-plan.md` §1.4 / §3.1; W-31b-impl.md's own
re-derivation): median interior cell AREA under sun azimuth 315° ÷ the same under 135° (elevation 45
both times, nothing else changes — the "0.25 → 1.0" phrasing in this unit's brief is this ratio's two
end-states, sun-away vs sun-toward; there is no separate numeric "tone dial" in this codebase — C7's
own az135/az315 construction **is** the quantity, reused verbatim here and generalised to all five
primitives and to d=100/150 in addition to C7's own pinned d=50):

| primitive | d=50 | d=100 | d=150 | d=220 |
|---|---|---|---|---|
| sphere | 2.120 | 1.756 | 1.570 | **1.055** |
| cylinder | 1.092 | 1.094 | 1.134 | **1.037** |
| cone | 1.802 | 1.515 | 1.372 | **1.060** |
| ellipsoid | 2.647 | 2.647 | 1.579 | **1.089** |
| torus | 1.385 | 1.164 | 1.018 | **1.054** |

Matches W-31b's own pinned d=50 numbers exactly (sphere 2.1196, cone 1.8020) and its az135/az315
d=220 area-ratio finding exactly (sphere 1.055, cylinder 1.038, cone 1.059, ellipsoid 1.087). By
d=220 every primitive sits in the **1.04–1.09** band — "almost no authority," confirmed for all five,
not only the two C7 pins. Torus and cylinder are already the flattest at d=220 even before any
retune (1.054/1.037) — foreshadowing §2's finding that these two respond least to a scale retune.

---

## 2. SWEEP of cap-onset candidates — `crossMinPitch()` × {1.0 (shipped), 0.9, 0.8, 0.7}

### 2.1 Tone authority at d=220 (the target of decision 11 = B)

| primitive | 1.0 (shipped) | 0.9 | 0.8 | 0.7 |
|---|---|---|---|---|
| sphere | 1.055 | 1.176 | 1.324 | 1.516 |
| cylinder | 1.037 | **1.100** | **1.178** | **1.157 (non-monotonic — worse than 0.8)** |
| cone | 1.060 | 1.178 | 1.293 | 1.494 |
| ellipsoid | 1.089 | 1.206 | 1.348 | 1.521 |
| torus | 1.054 | 1.116 | 1.169 | 1.227 |

**Cylinder never reaches 1.2× tone authority at d=220 at any tested scale — not even at 0.7, the most
aggressive candidate swept**, and its response is non-monotonic (peaks at 0.8, drops slightly at
0.7). Torus is the next most resistant (1.227 only at the most aggressive scale). Sphere/cone/
ellipsoid respond much more readily (≥1.2× already at 0.8, ≥1.5× at 0.7).

### 2.2 Ink at d=220 vs shipped and vs the naive-saturation number

Shipped d=220 ink (main, `scale=1.0`): sphere 4328.5, cylinder 5828.4, cone 3238.1, torus 4146.2,
ellipsoid 4859.2 mm — matches W-36c's own shipped numbers to the digit. Naive-uncapped reference
(cylinder, the number already on record for decision 11): **9136.8 mm**.

*(MERGE r4 item 30/R4-2 annotation, reinforcing §1's rig line above: harness rule C/D — ground+backdrop
explicitly off (`PRIMITIVE_PARAM_DEFAULTS` + `DEFAULT_CAMERA` rig, no ground child), so every ink
number in this section and table EXCLUDES ground-plane ink. Fixture: addLayer rig, density d=220
throughout this subsection, camera default, fillAngle 45.)*

| primitive | 0.9 ink (Δ vs shipped) | 0.8 ink (Δ vs shipped) | 0.7 ink (Δ vs shipped) |
|---|---|---|---|
| sphere | 4767.3 (**+10.1 %**) | 5262.0 (+21.6 %) | 6001.2 (+38.6 %) |
| cylinder | 6366.2 (**+9.2 %**, 69.7 % of 9136.8) | 7122.7 (+22.2 %, 78.0 % of 9136.8) | 8058.1 (+38.3 %, **88.2 % of the naive-saturation number**) |
| cone | 3543.8 (**+9.5 %**) | 3867.6 (+19.4 %) | 4366.5 (+34.9 %) |
| torus | 4394.4 (**+6.0 %**) | 4773.7 (+15.1 %) | 5177.9 (+24.9 %) |
| ellipsoid | 5330.9 (**+9.7 %**) | 5897.9 (+21.4 %) | 6676.4 (+37.4 %) |

Only `scale = 0.9` keeps ink within +15 % on **every** primitive. `0.8` already breaches on 4 of 5
(torus is borderline at +15.1 %); `0.7` breaches badly everywhere, and cylinder alone is within 12
points of the fully-uncapped saturation number.

### 2.3 P5a — the calibrator (W-26b `inkCoverage < 0.85`, `scene3d-fill-span-verdict.test.js`'s own
un-widened bar, reused verbatim). This is the bar the cap exists to keep green.

| scale | cells swept | cells failing (cov ≥ 0.85) | worst cell |
|---|---|---|---|
| 1.0 (shipped) | 18 (6 primitives × {170,220,300}) | **0** | capsule d=300 = 0.8298 (matches W-36c's own recorded worst cell exactly) |
| 0.9 | 18 | **8** | capsule d=300 = 0.8766 |
| 0.8 | 18 | **9** | capsule d=300 = 0.9213 |
| 0.7 | 18 | **9** | capsule d=220 = 0.9604 |

**Every tested candidate, including the mildest (0.9, a 10 % tightening), breaches the calibrator —
on sphere (d=220/300), cylinder (d=170/220/300) and capsule (d=170/220/300) simultaneously.** The
breach is not a coin-flip margin: at 0.9, sphere d=220 measures 0.851 (vs the 0.85 bar) and capsule
d=220 measures 0.876 — both with real headroom **past** the bar, not at it. Full per-cell numbers in
`docs/3d-audit/fill-audit/after/W-36f/report.json`.

### 2.4 W-36c P1–P6 battery (re-derived, not just P5a)

| bar | 1.0 | 0.9 | 0.8 | 0.7 |
|---|---|---|---|---|
| P1 (both families ≥2 rulings) | 12/12 pass | 12/12 pass | 12/12 pass | 12/12 pass |
| P2 (gap ratio B:A ∈[0.80,1.25]) | 8/8 pass | 8/8 pass | 8/8 pass | 8/8 pass |
| P3a (each family ≥0.85× hatch, d≤140) | 20/20 pass | 20/20 pass | 20/20 pass | 20/20 pass |
| P3b (count ratio B:A ∈[0.72,1.40]) | 8/8 pass | 8/8 pass | 8/8 pass | 8/8 pass |
| P4 (\|nB−nA\|≤3 at d=1) | 4/4 pass | 4/4 pass | 4/4 pass | 4/4 pass |
| **P5a (cov <0.85)** | **18/18 pass** | **10/18 pass (8 fail)** | **9/18 pass (9 fail)** | **9/18 pass (9 fail)** |
| P5b (d=220 ink ≥ shipped) | 4/4 pass | 4/4 pass (by construction — ink only rises) | 4/4 pass | 4/4 pass |
| P5c (gap sits AT the (new, lower) cap) | 4/4 pass | 4/4 pass | 4/4 pass | 4/4 pass |

**Only P5a moves, and it moves at every candidate.** P1–P4/P5b/P5c are self-referential to whatever
cap value is in force (P5c in particular re-derives its own floor from the same scale, so it cannot
detect the regression) — P5a, the *pre-existing, un-widened* bar this whole cap was built to satisfy,
is the only instrument in the battery that actually catches the retune's cost, exactly as the
original W-36c plan intended it to.

### 2.5 md5 byte-identity below the measured onset density

Confirmed byte-identical (raw ruling geometry, md5) at **d ∈ {1, 50, 80}** for all three candidates,
all five primitives — the retune is provably inert there. **Not** identical at **d=100**: every
primitive's raw geometry differs at every candidate scale, even where the coarse *count* stayed
unchanged (e.g. cylinder A stays 49 vs 50 — a real one-ruling difference — but torus's count is also
unchanged at 24/24→24/25 while its exact gap values shift in the 3rd decimal). ⚠ **This means the
retune is not inert as early as the aggregate A:hatch-ratio table in §1 suggests** — that table only
detects a RULING-COUNT change; `dfMaxMul` (the walk's per-step ceiling, which reads
`crossFloorPitch()` on every crosshatch ruling regardless of density, per `surface-fill.js`
`:10505-10510`) can perturb the exact walk position locally without flipping the aggregate count,
and does, at d=100, on primitives whose §1 table still reads 1.000. **The true inertness boundary is
d ≤ 80, not d ≤ 100–140 as the coarse onset table alone would suggest.**

---

## 3. The frontier

**Question:** is there a setting that gives ≥1.2× tone authority at d=220 with ink ≤ shipped+15% on
every primitive?

**No.** Trade-off table, decisive on two independent axes:

| scale | ink ≤ +15% on every primitive? | ≥1.2× tone authority on every primitive? | P5a (the calibrator) holds? |
|---|---|---|---|
| 0.9 | **yes** (max +10.1%) | **no** — cylinder 1.10, torus 1.12, sphere 1.18, cone 1.18 all under 1.2 | **no — 8 of 18 cells breach, by real margin** |
| 0.8 | no (4 of 5 over 15%) | no — cylinder 1.18, torus 1.17 still under 1.2 | no — 9 of 18 breach, worse |
| 0.7 | no (all 5 over 15%, up to +38.6%) | **no — cylinder never reaches 1.2× at any scale tested** (1.157, non-monotonic) | no — 9 of 18 breach, worst |

No candidate in the tested sweep clears even one of the two frontier conditions simultaneously with
the calibrator held, and **cylinder — the primitive whose naive-uncapped saturation number is the one
already on record for this decision — is also the primitive most resistant to gaining tone authority
from this mechanism at all**, at any scale tried. The calibrator (P5a, the pre-existing `< 0.85`
anti-blob bar) is not a close call anywhere in the sweep: the mildest candidate already breaches it on
3 of 6 primitives with 0.5–2.6 points of margin, not at the line.

**This is not evidence of a wrong step size.** A finer sweep (e.g. 0.95, 0.98) would only interpolate
between "shipped, calibrator holds, tone authority 1.04–1.09" and "0.9, calibrator already broken,
tone authority still under 1.2 on 4 of 5 primitives" — the region between those two points is where
any intermediate scale would land, and it does not contain a point satisfying both axes at once,
because the calibrator breaks (at ~0.95–0.97, by linear interpolation of the 1.0→0.9 P5a deltas)
**before** tone authority crosses 1.2× on the two most resistant primitives (cylinder, torus), which
under this same linear mechanism would need a scale closer to 0.6–0.65 (extrapolating cylinder's
1.037→1.100→1.178→1.157 curve, which is already flattening/reversing by 0.7).

**Recommendation: Jay decides again, or PARK.** A uniform scale of `crossMinPitch()` — the only
mechanism decision 11 = B's own framing describes ("retune the cap's onset") — cannot buy tone
authority without reopening the exact saturation the cap exists to prevent; the two are the same
knob, moved in opposite directions, and cylinder's resistance means even accepting that cost does not
reliably buy the thing being paid for. If Jay wants real tone authority to survive at d=220, the only
measured-safe path is the one W-31b's own plan already named for a structurally different problem: a
**non-uniform mechanism that is NOT a scale of the pitch floor** — e.g. a per-sample or per-primitive
cap shape, which is new machinery, not a retune, and has not been prototyped by this scout (out of a
read-only scout's scope; this finding is a MEASURE-AND-STOP, not a design). The alternative is
accepting decision 11 = A after all (the cap's own trade-off, ratified once already) — that remains
Jay's call, not this scout's.

---

## Evidence

- Scratch harness: `/private/tmp/claude-501/scratch-W36f/zzw36f-measure2.js` (the measurement script,
  reused instruments cited inline above) and `zzw36f-debug.js` (the `window`-vs-`globalThis` proof).
  Both scratch-only, deleted with the rest of the export at the end of this unit.
- Raw JSON dumps (`scale-1.0.json` / `-0.9.json` / `-0.8.json` / `-0.7.json`, each carrying the full
  per-density table, tone-authority curve, ink, P5a coverage, P1–P5c bar detail and md5 table) are
  copied to `docs/3d-audit/fill-audit/after/W-36f/report.json` (merged, one file, all four scales)
  for the next planner or Jay to re-derive without re-running the sweep.
- No pictures were captured — this is a numeric MEASURE-AND-STOP scout; the frontier verdict is
  negative before any picture would add information the coverage/ink numbers do not already settle.

## Stop conditions / scope notes

- Never touched any worktree or MAIN except this report and its evidence JSON.
- `crossMinPitch()` was patched **only in the scratch export**; `src/core/scene3d/surface-fill.js`
  in MAIN and every worktree is untouched.
- Did not attempt Rank-2-style non-uniform mechanisms (out of scope for a scout; flagged above as the
  only measured-safe forward path if Jay wants to keep chasing this).
- `scale = 1.0` reproduces shipped numbers to the digit throughout (§ Method, §2.2) — the sweep's
  zero-point is proven, not assumed.
