STATUS: PLAN-READY

# W-36 — plan: crosshatch's crossing family must carry the same number of lines as the hatch family

Planner, read-only in the repo. All numbers below were measured by this planner in scratch `git archive`
exports (`47a5a755` = v1.3.99, `d5af9e30` = v1.3.98) with a symlinked `node_modules`, foreground, one file
at a time. **The Rank-1 fix was prototyped and measured in a third export** — it is not an argument, it is a
measurement. Every scratch export used is deleted at the end of this unit (see §9).

- Lane: `fill-audit-a2` · worktree `.claude/worktrees/fill-audit-a2` · port 8475 · branch `3d-scene/fill-audit-a2`.
- Base for the implementer: **whatever T1b lands** (the lane HEAD is the unverified T1b WIP `0b7d8fda`,
  `surface-fill.js` +103). This plan's RED table is measured at `47a5a755`; T1b edits the same file, so the
  implementer **must re-derive the RED table on its own base** before writing the fix. The mechanism does not
  change — T1b merges near-duplicate stubs, which cannot restore a ruling that was never placed.
- USER rule (Jay, verbatim): *"make crosshatch have the same number of crosshatch lines as it has hatch lines
  unless there's a special algorithm that mandates this is not the case or variation is needed for
  highlight/shadow. This seems off."*

---

## 1. Root cause, with file:line and measured proof

### 1.1 The mechanism

`src/core/scene3d/surface-fill.js`:

| line | code | effect |
|---|---|---|
| `:4652` | `const CROSS_SHARE_BASE = 0.1;` | the crossing family's coverage is **one tenth** of family A's at the shipped default |
| `:4657-4660` | `crossShareOf = (r) => CROSS_SHARE_BASE / (r * r)` | share at `crossDensityRatio = 1` is `0.1` |
| `:4661-4665` | `ladderCrossWantedPitch(I, r) = masterPitch / clamp(ladderCov(I) * crossShareOf(r), LADDER_COV_MIN, 1)` | family B's **wanted pitch is ~10× family A's** by construction |
| `:9741-9746` | `want = isEvenLadder() ? (crossShare != null ? ladderCrossWantedPitch(...) : ladderWantedPitch(...)) : cfWantedPitch(...)` | the walk's step target; the only place the share is spent |
| `:10768-10770` | family B's three `emitContFamily(..., crossRatio)` call sites | the only callers that pass a non-null `crossShare` |
| `:4597` | `const LADDER_COV_MIN = 0.02;` | floors `cB`; on a torus it lets family B place **one** ruling |
| `:9718-9721` | `CROSS_DFMAX_BOOST_CAP = 20`, `dfMaxMul` | **not** the binding constraint at ratio 1 (`1/0.1 = 10 < 20`); it binds only at `crossDensityRatio ≥ 1.42` |

The secretary's hypothesis is **confirmed in full**: the defect is W-26b-1's cross-share change, it is not the
Fine-rungs cascade, and it is not a picker/param mismatch. Two corrections to the hypothesis, both measured:

1. **`LADDER_COV_MIN` does not bottom out on the sphere and `CROSS_DFMAX_BOOST_CAP` never binds at the shipped
   default.** Jay's sphere is not literally zero rulings — family B places **3 rulings at a median gap of
   18.0 mm** on a ~50 mm silhouette against family A's 1.65 mm. Three arcs at 11× the primary pitch read, in
   the app, as part of the form rather than as a family. The one-ruling case is real but is the **torus**
   (`A#1: n=1` at d=1 and d=50 — no second family exists at all).
2. **The defect is scoped to the ladder family.** `want` reads `crossShare` only under `isEvenLadder()`
   (`:9741`). Every `contField*` law ignores it and gives **both** families the full `cfWantedPitch` — i.e.
   crosshatch is already at parity for those ~30 laws. That is why the bug shows on **Ladder, the committed
   default**, and why the fix must stay inside the `isEvenLadder()` arm.

### 1.2 Which unit starved family B, and by how much

Both trees measured on ONE rig (the audit-capture rig: `PRIMITIVE_PARAM_DEFAULTS` + `DEFAULT_CAMERA`, sun
135°/45°, ground+backdrop off, `fillAngle 45`, `toneLaw ladder`, `BOUNDS 320×220 pen 0.3`). Families are read
off the raw runs `SurfaceFill.buildObject` returns (`run.fam` = `A#0` primary / `A#1` crossing, `run.lineIndex`
= the ruling ordinal, `run.back` excluded). `n` = distinct drawn rulings, `gap` = median centre-to-centre gap
in mm between adjacent rulings of that family.

**W-26b (`7bc2b1a0`) is the unit that starved family B. W-26 is not.**

| cell | v1.3.98 `d5af9e30` A n/gap · B n/gap · B:A | 47a5a755 A n/gap · B n/gap · B:A |
|---|---|---|
| sphere d=1 | 15 / 2.903 · 11 / 3.297 · **0.73** | 4 / 7.905 · **1 / —** · **0.25** |
| sphere d=50 | 15 / 2.903 · 11 / 3.297 · **0.73** | 16 / 1.466 · 3 / 18.614 · **0.19** |
| sphere d=220 | 61 / 0.727 · 46 / 0.748 · **0.75** | 69 / 0.492 · 9 / 3.343 · **0.13** |
| cylinder d=50 | 17 / 1.736 · 12 / 3.121 · **0.71** | 22 / 1.188 · 3 / 12.726 · **0.14** |
| cylinder d=220 | 70 / 0.484 · 38 / 0.709 · **0.54** | 94 / 0.383 · 10 / 2.662 · **0.11** |
| torus d=50 | 10 / 3.807 · 11 / 6.274 · **1.10** | 12 / 2.091 · **1 / —** · **0.08** |
| torus d=220 | 40 / 1.013 · 44 / 0.925 · **1.10** | 46 / 0.777 · 4 / 24.234 · **0.09** |
| ellipsoid d=50 | 14 / 2.786 · 11 / 3.739 · **0.79** | 16 / 1.572 · 3 / 19.500 · **0.19** |
| ellipsoid d=220 | 60 / 0.704 · 44 / 0.742 · **0.73** | 67 / 0.525 · 9 / 3.615 · **0.13** |
| **JAY's cell** — sphere, Fine rungs, d=50 | 15 / 2.903 · 11 / 3.297 · **0.73** | 17 / 1.648 · 3 / 18.044 · **0.18** |

Pitch ratio B:A — v1.3.98 **1.03–1.80**; 47a5a755 **6.8–31.2×** (torus/sphere at d=1 and d=50 have fewer than
two crossing rulings, so no pitch exists at all). The orchestrator's eye-counts (cylinder ≈30 vs ≈5, ellipsoid
≈25 vs ≈4, T1 sphere ≈24 vs ≈8) are reproduced to within counting error.

**Two things the v1.3.98 column also proves, and the unit must not fight them:**

- **d=1 and d=50 are byte-identical at v1.3.98** (1037.3 mm both, on every primitive). That is the F-01 dead
  zone W-01/W-26 deliberately removed. "Restore the pre-audit picture" is therefore not available as a target
  and must not be used as one.
- **The pre-audit picture Jay accepts as correct is itself NOT within ±10% on counts** — B:A runs 0.54–1.10,
  i.e. up to −46%. See §3.1: this is why the ±10% count bar in the brief cannot be the oracle as written.

### 1.3 Fine rungs is not a cascade bug — no cascade/param file is needed

`rungMode:'fine'` resolves through `Params.resolveToneLaw` to `fineLadder`
(`src/config/scene3d-tone-laws.js:910-915`), `isEvenLadder()` (`:4559`) routes it down the same continuous
walk, and it starves identically: family B = 3 rulings with rungMode `fine`, `coarse`, **and** with
`toneLaw:'fineLadder'` set directly. Fine rungs changes tone (rung count), not placement. **Ruled out.**

### 1.4 `1193cbe1` (on main) does not change this oracle

`git show --name-only 1193cbe1` touches **0 files under `src/`**. It rounds golden comparisons in four test
files (`scene3d-charts-parity`, `scene3d-curved-density-sparse-end`, `scene3d-hlr-spatial-index-identity`,
`scene3d-mesh-invariants`) and regenerates two hash constants. None of those files pins a crosshatch count and
none is this unit's oracle. `scene3d-curved-density-sparse-end` runs **20/20 green on the Rank-1 prototype** at
the `47a5a755` version of the file; after the rebase onto ≥`88041036` it must simply be re-run, not re-pinned.

---

## 2. Which laws legitimately mandate asymmetry, and how highlight/shadow is meant to enter

### 2.1 Documented, legitimate asymmetries (the oracle must exempt these, not paper over them)

| # | case | why it is legitimate |
|---|---|---|
| 1 | **`crossDensityRatio ≠ 1`** (`:10516`, clamped 0.25–2) | the user's own dial. Its documented sense is "family B's SPACING is `ratio` × family A's" — so B:A count is `1/ratio` **by request**. Parity is required at the shipped default `ratio = 1` only. |
| 2 | **`crossAngleDelta ≠ 90`** (`:10515`, clamped 10–170) | two non-orthogonal families traverse different extents of the same silhouette; equal pitch then gives unequal counts. Geometry, not a law. |
| 3 | **`tripleHatch`** (`:10804`, darkest tone band only) | a third family, deliberately gated to the darkest band. It is not reachable on the continuous path at all today (the `contMapper` branch never reads `crossTriple`). |
| 4 | **X-ray back pass** (`back === true`, `want /= backDensity` at `:9787`) | the far surface is deliberately sparser. It scales BOTH families equally, so parity holds *within* the back pass; the oracle must measure front-face rulings only (`run.back` excluded). |
| 5 | **`emitTerminatorCross` / `emitShadowInfill` / `layeredCross` / the flow mappers' `emitScreenCross`** (`gate*`, `over`, `curv2`, `iso/grad` families) | these are tone devices that add zone-confined families, not the crosshatch pair. They are emitted only on the non-continuous dispatch (`:10794-10806`) and carry their own `fam` prefixes. The oracle compares `A#0` vs `A#1` and must assert there are exactly two such families. |
| 6 | **Every non-`isEvenLadder()` law** (`contField*`, mono, ribbon, flow) | already at parity or placed by a different engine. Out of scope; must stay byte-identical. |

**Nothing in the roster mandates a 10:1 count asymmetry at the shipped default. W-36 is a defect, not a law.**

### 2.2 How highlight/shadow variation is meant to enter

Per W-26's own contract (`:4545-4559`): *"the spacing IS the tone … nothing downstream ever drops a ruling
again — only WHERE the next one lands moves."* Tone enters as **per-family gap modulation** — the walk's
`want` is a continuous function of the local intensity `pb.I`, so a highlight opens the gap and a shadow closes
it, within each family. Tone must **not** enter by dropping whole rulings of one family: that is precisely the
discrete-ladder defect (F-23/R1) W-26 exists to remove, and W-36 is the same defect committed against the
crossing family instead of against the grid.

The correct shape, therefore, is: **one tone target per sample, shared by the pair, spent as equal gap
modulation in both families.** A highlight then opens *both* families' gaps together and the crosshatch cell
stays square as it lightens — which is also the property W-31 is going to measure.

### 2.3 The tension, resolved

W-26b-1 set the base far under 50/50 to stop two independently-full-coverage crossed families compounding to
`1-(1-c)²` saturation (judge C1: cylinder D220 4912.6 → 9326.7 mm, silhouette ink coverage 0.906). **That
constraint is about the pair's TOTAL coverage; it says nothing about how the total is DIVIDED.** W-26b divided
it 91% / 9%. The judge's own C1 wording asks for the other option first: *"derive the crossing family's
`ladderWantedPitch` from the **combined** two-family target coverage … so total crosshatch coverage matches
`ladderCov`, instead of each family independently hitting it."*

So: **keep W-26b-1's measured-safe total, split it evenly.** Ink is a linear function of the sum of the two
families' coverages, so holding the sum at `1.1 × ladderCov` (exactly what ships today: `1.0` for A + `0.1` for
B) keeps every ink and anti-blob bar where W-26b left it, while `0.55 / 0.55` puts the two families on the same
pitch. This is why the Rank-1 constant is **derived, not tuned** — and it supersedes W-26 hygiene item (c).

- W-26's gap-jump result (R1a ≤ 1.15, measured band 1.03–1.17) is preserved because **both families keep using
  the same continuous walk with a smooth pitch field** — the fix changes only the coverage each family asks
  for, never how a step is taken. Verified: `scene3d-ladder-uniform-field-spacing` **9/9** and
  `scene3d-fill-even-spacing` **12/12** green on the prototype.
- W-26b-1's d=220 anti-blob result is preserved because the pair's total coverage is unchanged, so the
  combined silhouette ink coverage does not rise. Verified: `scene3d-fill-span-verdict` **11/11** green on the
  prototype, including `crosshatch: drawn ink coverage never floods to a solid block` at D50 **and** D220.

---

## 3. The RED oracle

New file: **`tests/unit/scene3d-crosshatch-parity.test.js`**.

### 3.0 How the two families are distinguished in the output

`algo.generate`'s returned paths **do not carry `.fam`** (verified: the tag is stripped when `scene3d.js`
re-emits the fill runs). The runs `SurfaceFill.buildObject` returns **do**. Use the in-repo idiom already used
by `tests/unit/scene3d-curved-crosshatch-controls.test.js:177-180` — wrap `V.Scene3D.SurfaceFill.buildObject`,
collect the raw runs, restore in a `finally`:

- `run.fam === 'A#0'` → the primary family (at `fillAngle`); `run.fam === 'A#1'` → the crossing family (at
  `fillAngle + crossAngleDelta`). Under `contMapper` a crosshatch emits **exactly** these two.
- `run.lineIndex` is unique **within** a family — count *distinct* `lineIndex` values, not paths, so a ruling
  cut into two runs is one line.
- Skip `run.back` (X-ray far surface, §2.1 case 4).
- Median gap = median centre-to-centre distance between the centroids of adjacent rulings (sorted by
  `lineIndex`) of one family, in mm.
- **Assert `fams.length === 2`** so a future third family fails loudly instead of being silently merged into
  the pair.
- Family ordering is verifiable, not assumed: at `47a5a755` `A#0` on a crosshatch is byte-identical to the
  hatch mapper's single family (sphere d=50: 16 rulings, median gap 1.466 mm, 723.4 mm ink, in both).

### 3.1 The bars, and why the brief's literal ±10% count bar cannot be used

Measured on the Rank-1 prototype, **equal pitch does not give equal counts** — the two families traverse
different extents of the same silhouette. Example: ellipsoid d=50, median gaps 2.902 vs 2.893 mm (**0.3%
apart**) but counts 9 vs 11 (**22% apart**). The pre-audit v1.3.98 reference is worse still (B:A counts
0.54–1.10, §1.2). **A ±10% count bar fails on the picture Jay accepts as correct**, so as written it would
force the implementer either to widen it later (the pattern the round-1 lesson forbids) or to distort the
placement to hit a number the geometry does not support.

**Proposed oracle — needs the orchestrator's explicit sign-off as a deviation from the brief's "±10%".**
The physically meaningful statement of Jay's rule is *equal spacing*; count parity is its consequence up to the
silhouette's own aspect:

| # | bar | RED at 47a5a755 | GREEN on the Rank-1 prototype | margin |
|---|---|---|---|---|
| P1 | both families draw **≥ 2** rulings on every cell | **FAILS**: torus d=1/d=50 B=1; sphere/cylinder/ellipsoid d=1 B=1 | pass (min B = 2) | — |
| P2 | median-gap ratio B:A ∈ **[0.80, 1.25]**, d ∈ {50, 220} | **FAILS**: 6.80–31.2 (or undefined) | 0.859–1.106 | ≥ 7% |
| P3 | count ratio B:A ∈ **[0.72, 1.40]**, d ∈ {50, 220} | **FAILS**: 0.087–0.19 | 1.00–1.31 | ≥ 6% |
| P4 | at d=1 only: `abs(nB − nA) ≤ 3` (integers, not a percentage) | **FAILS**: B=1 vs A=3…6 | max diff 2 | 1 |
| P5 | **anti-saturation guard**: cylinder d=220 crosshatch ink ≤ **5431 mm** (= v1.3.98's 4722.7 + 15%) and ≥ 4200 mm (not flattened) | 4963.8 — passes today, must keep passing | **5019.6** | 8% under the cap |
| P6 | **byte-identity controls**: sphere hatch d=50 = 24 fills / 723.4 mm; cylinder hatch d=220 = 145 / 4495.5 mm; sphere contour d=50 = 18 / 656.4 mm | pass | pass, **identical to the digit** | — |

Cells: `{sphere, cylinder, torus, ellipsoid} × crosshatch × ladder × d ∈ {1, 50, 220}` **plus Jay's cell**
(sphere, crosshatch, `rungMode:'fine'`, `fillAngle 45`, d=50). Jay's cell today: A 17 / 1.648 mm, B 3 /
18.044 mm; on the prototype: A 9 / 3.078 mm, B 11 / 2.786 mm (pitch ratio 0.905, count ratio 1.22).

If the orchestrator insists on ±10% on counts, the honest answer is **PLAN-BLOCKED on that bar**: no placement
that keeps both families evenly spaced can hit it on a sphere or an ellipsoid, and the only way to force it
would be to make one family unevenly spaced — which is exactly what W-31 exists to forbid.

### 3.2 Mutation check (all three must be run and reported)

| mutation | expected result |
|---|---|
| revert `surface-fill.js` to the pre-fix blob, keep the new test | P1–P4 fail on every cell (the RED proof) |
| set `CROSS_PAIR_BUDGET = 2.0` (two independently-full families) | **P5 fails**: cylinder d=220 ink ≈ 9137 mm — measured, this is the C1 saturation restored |
| set the crossing family's role back to `'a'` (both families read family A's own target) | identical to the above — proves P5 is the anti-saturation guard, not a fingerprint |

The middle mutation is not hypothetical: this planner built it (`CROSS_SHARE_BASE = 1.0`, family A untouched —
"naive parity") and measured **cylinder d=220 = 9136.8 mm, +93.5% over v1.3.98's 4722.7**. That is the proof
that Jay's rule cannot be satisfied by raising the crossing family's share alone.

---

## 4. Ranked fixes

All three were measured. Rank 1 is the recommendation and is prototype-verified end to end.

### Rank 1 — RECOMMENDED. One pair budget, split by the dial (prototype-verified)

**Exact edits, `src/core/scene3d/surface-fill.js` (line numbers at `47a5a755`; re-locate after T1b):**

1. **`:4661-4665`** — after `ladderCrossWantedPitch`, add the pair law:
   ```js
   // W-36 — the crossed PAIR spends ONE coverage budget. W-26b-1 proved the
   // SUM `1.0*cA + 0.1*cA` is plot-safe (cylinder D220 4912.6 -> 5153.7 mm,
   // ink coverage 0.971 -> 0.805); it never justified spending 91% of it on
   // one family. `CROSS_PAIR_BUDGET` IS that measured-safe sum, so this unit
   // redistributes ink rather than adding it. At the shipped ratio 1 both
   // families ask for exactly half, i.e. the SAME pitch -> the user's rule.
   const CROSS_PAIR_BUDGET = 1.1;
   const crossPairShare = (crossRatio, role) => {
     const r = clamp(finite(crossRatio, 1), 0.25, 2);
     const half = CROSS_PAIR_BUDGET / 2;
     return (role === 'b') ? half / r : half;   // pitchB = r x pitchA, the dial's documented sense
   };
   const ladderPairWantedPitch = (I, crossRatio, role) => {
     const c = clamp(ladderCov(I) * crossPairShare(crossRatio, role), LADDER_COV_MIN, 1);
     return masterPitch / c;
   };
   ```
2. **`:9719-9721`** — `dfMaxMul` reads the pair share when `crossShare` is the new `{ratio, role}` object,
   falling through to `crossShareOf` otherwise (delete that fallback once step 5 lands).
3. **`:9741-9746`** — `want` dispatches to `ladderPairWantedPitch(pb.I, crossShare.ratio, crossShare.role)`.
4. **`:10752-10758`** — family A's three `emitContFamily` call sites pass
   `(mapper === 'crosshatch') ? { ratio: crossRatio, role: 'a' } : undefined`. Contour/hatch keep `undefined`.
5. **`:10768-10770`** — family B's three call sites pass `{ ratio: crossRatio, role: 'b' }` instead of the bare
   `crossRatio`. Then **delete `CROSS_SHARE_BASE` (:4652), `crossShareOf` (:4657-4660) and
   `ladderCrossWantedPitch` (:4661-4665)** — they become unreachable, and leaving two coverage laws in the file
   is how the next unit picks the wrong one. This discharges **W-26 hygiene item (c)**.

**Guards / fingerprints that move — the mandatory `## Bars changed` list:**

| file:line | old → new | why |
|---|---|---|
| `tests/unit/scene3d-curved-density-floor.test.js:264` | `22` → **`18`** | crosshatch d=10, ratio 0.25: family A is now half the pair, not the whole of it |
| `:265` | `10` → **`11`** | d=10, ratio 1: family B goes 1 → 4 rulings, family A 6 → 3 |
| `:266` | `138` → **`114`** | d=100, ratio 0.25 |
| `:267` | `60` → **`64`** | d=100, ratio 1: family B 5 → 26, family A 37 → 20 |
| `:275-282` `crossDensityRatio spread restored to >=2.0x` (TOTAL fill count, ratio 0.25 ÷ ratio 1) | **REPLACED** — measured 1.636 (d=10) / 1.781 (d=100) | **This bar is arithmetically incompatible with Jay's rule.** The old spread was large only because ratio 1 produced a near-invisible family B, so the denominator was ~family A alone. Parity necessarily doubles that denominator and roughly halves any total-count spread. |
| replacement bar | **family-B ruling count across the DIAL ENDS: `nB(0.25) / nB(2) ≥ 2.5`** — measured **3.00** (d=10, 9 vs 3) and **4.69** (d=100, 61 vs 13); plus `nB(0.25) ≥ 2.0 × nB(1)` at d=100 (2.35) | strictly more direct: it measures the control the dial actually owns, on the family the dial actually moves, across its whole range. Family A is now dial-independent by construction, so a total-count instrument can only dilute the signal. |

Nothing else is re-pinned. **No tolerance is widened**: P2/P3's bands are new bars on a previously unguarded
property, and the one bar that is removed is replaced by a stronger measurement of the same control, with the
old and new numbers in the commit body.

**What stays byte-identical (verified, not asserted):** every non-crosshatch caller passes
`crossShare === undefined` and reaches identical code. Measured identical to the digit between the pre-fix and
prototype trees — `sphere hatch d=50` 24 fills / 723.4 mm / gap 1.466; `cylinder hatch d=220` 145 / 4495.5 /
0.383; `sphere contour d=50` 18 / 656.4 / 2.161; `floor-rig d=100 hatch` 53 / 1688.8 / 0.691. Also untouched by
construction: every `contField*` law (they never read `crossShare`), the mono substrate, the ribbon laws, the
flow/screen-cross mappers, the faceted path, the W-01 master grid (`:5084-5157`), Stage 0 / `!toneOn`
crosshatch (which takes the old discrete dispatch, so all 18 `scene3d-curved-crosshatch-controls` fixtures are
structurally out of scope), and the X-ray back pass for every non-crosshatch mapper.

**`CROSS_DFMAX_BOOST_CAP = 20` stops binding entirely.** The new boost is `1/crossPairShare` ∈ [1.00, 3.64]
across the full dial (vs 10 at ratio 1 and a clamped 40 at ratio 2 today). Keep the cap as a dormant safety
rail and say so in its comment.

**Predicted ink deltas (measured on the prototype, same rig for all three trees):**

| cell | v1.3.98 | 47a5a755 | Rank 1 | Δ vs 47a5a755 | Δ vs v1.3.98 |
|---|---|---|---|---|---|
| **cylinder d=220** (the C1 cell) | 4722.7 | 4963.8 | **5019.6** | **+1.1%** | **+6.3%** (cap +15% = 5431) |
| sphere d=220 | 4234.2 | 3518.0 | 3713.0 | +5.5% | −12.3% |
| ellipsoid d=220 | 4740.3 | 3980.1 | 4187.6 | +5.2% | −11.7% |
| torus d=220 | 4523.9 | 3194.8 | 3195.0 | +0.006% | −29.4% (unmoved by W-36; pre-existing) |
| sphere d=50 | 1037.3 | 819.9 | 877.3 | +7.0% | −15.4% |
| **Jay's cell** | 1037.3 | 860.0 | 862.2 | **+0.3%** | −16.9% |

**Guard files already run green on the prototype** (foreground, one at a time, in a scratch export):
`scene3d-fill-span-verdict` 11/11 · `scene3d-curved-crosshatch-controls` 18/18 ·
`scene3d-ladder-uniform-field-spacing` 9/9 · `scene3d-fill-even-spacing` 12/12 ·
`scene3d-curved-density-sparse-end` 20/20 · `scene3d-plot-safety` 5/5 (+1 skip) ·
`scene3d-curved-density-floor` **11/13** (the two failures are exactly the re-pins above, nothing else).

### Rank 2 — the same mechanism at `CROSS_PAIR_BUDGET = 1.2` (fallback if the app reads too light)

Measured (this planner's `-sym` prototype, which is this law at ratio 1): sphere d=50 A 10 / B 12; cylinder
13 / 14; torus 7 / 7; ellipsoid 10 / 11; cylinder d=220 A 56 / B 60. Crosshatch:hatch ink ratio 1.34 (Rank 1:
1.21; v1.3.98: 1.67). **Cost: cylinder d=220 ink 5483.1 mm = +16.1% vs v1.3.98 — just outside the ±15% cap**,
so it needs either the W-26 conditional-acceptance ruling re-applied with a per-delta account, or Jay's call.
Take this only if the orchestrator looks at Rank 1's native-resolution crops and judges the crosshatch too
light against Jay's reference. Do not take it silently.

### Rank 3 — REJECTED BY MEASUREMENT, recorded so nobody re-tries it

`CROSS_SHARE_BASE = 0.1 → 1.0`, family A untouched ("naive parity", the obvious one-line fix). It **does**
deliver the best count parity (sphere d=50 16/21, cylinder 22/22, torus 12/12, ellipsoid 16/21) — and
**cylinder d=220 ink 9136.8 mm, +93.5% over v1.3.98 and +84% over today**: judge C1's saturation, restored
almost exactly (its own figure was 9326.7). Ship this and W-26b-1 is undone. Keep it only as the mutation in
§3.2.

---

## 5. Files

**ALLOWED**
- `src/core/scene3d/surface-fill.js`
- `tests/unit/scene3d-crosshatch-parity.test.js` (new)
- **`tests/unit/scene3d-curved-density-floor.test.js`** — **this must be added to the brief's allowed list.**
  The unit cannot land green without it: four pinned crosshatch counts and one spread bar in that file are
  direct, intended consequences of the fix (§4). It is the same lane's file (W-26b already edited it from
  `fill-audit-a`) and no other round-2 lane touches it.

**NOT NEEDED** — no cascade/param file. §1.3 proves the Fine-rungs zero is not a cascade bug.

**FORBIDDEN** — `surface-fill.js:5084-5157` (the W-01 master grid), `surface-fill-mono.js`, `mappers.js`,
`src/core/algorithms/scene3d.js`, `hlr.js`, `shadows.js`, `src/config/*`, `src/ui/*`, and every other lane's
test files (in particular `scene3d-tone-law-collapse.test.js`, which already carries a three-way merge hazard).

---

## 6. Evidence

**Cells verified present in `docs/3d-audit/fill-audit/manifest.A.*.jsonl`** (grepped by exact filename, all
present, tier A, angle `a`):

- `sphere__crosshatch__ladder__{low,med,max}__a` · `cylinder__crosshatch__ladder__{low,med,max}__a` ·
  `torus__crosshatch__ladder__{low,med,max}__a` · `ellipsoid__crosshatch__ladder__{low,med,max}__a` — **12
  cells**, all present. (`ellipsoid` rows appear in both manifest shards; that is duplication in the manifest,
  not a missing cell.)
- Must-not-move controls, both present: `sphere__hatch__ladder__med__a`, `sphere__contour__ladder__med__a`.
  Add `cylinder__hatch__ladder__max__a` (present) — it is the control for the C1 ink cell.
- The manifest also carries the v1.3.98 `inkMm` for every one of these, which is the honest before-number for
  the `report.json`: cylinder crosshatch max **4912.6**, ellipsoid **4875.7**, sphere **4359.3**, torus
  **4725.4**.

**Bespoke capture REQUIRED for Jay's own cell.** No manifest cell covers Fine rungs — the capture script writes
`toneLaw: item.style` and never a `rungMode` (`scripts/audit/scene3d-capture.js:219`). Capture a bespoke scene
(sphere, `mapper: 'crosshatch'`, `fillAngle: 45`, `fillDensity: 50`, `rungMode: 'fine'`, `DEFAULT_CAMERA`,
ground/backdrop off) before and after, into `after/W-36/`, and say so in `report.json`.

**Look at the pictures.** Crop the object body at NATIVE resolution (PIL crop → Read) on at least
`cylinder__crosshatch__ladder__max__a`, `sphere__crosshatch__ladder__med__a` and the bespoke Fine-rungs sphere,
and describe (a) that a crossed grid is actually visible, (b) that the cells are not blobbed together at
d=220, and (c) that the highlight still opens **both** families' gaps rather than deleting one of them.

---

## 7. Relationship to W-31 (W-36 lands FIRST, per the 2026-09-06 19:20 ruling)

W-31 is Jay's *"why do some sections have diamond/square gaps and some rectangular"* — **cell shape**, i.e. the
ratio of the two families' local spacings and its evenness within each family. That measurement is meaningless
today: with family B at 3 rulings and 11× the pitch there are no cells to shape. After W-36:

- W-31 re-measures **on `main` + W-36's landing sha** (the ruling already re-pointed it off `0930cb2d`).
- What W-36 hands it: both families on the same continuous walk, at the same pitch at `crossDensityRatio = 1`
  (median-gap ratio 0.86–1.11 measured across the four primitives × d=50/220), so a "square cell" is now the
  *default* and any residual rectangularity is either (a) the dial, (b) the angle delta, (c) a real tone
  gradient — the three legitimate causes W-31 must separate — or (d) a genuine evenness defect inside one
  family, which is W-31's actual target.
- What W-31 must NOT do: re-open the pair's coverage split. If W-31 finds cells too dark or too light, that is
  the `CROSS_PAIR_BUDGET` calibration (§4 Rank 2), a one-constant follow-up, not a re-design.

---

## 8. Stop conditions

Stop, write the numbers, and report rather than fudging, if any of these holds:

1. **P5 breaches.** Cylinder d=220 crosshatch ink exceeds 5431 mm (v1.3.98 + 15%) at the chosen budget. Do not
   raise the cap. Lower `CROSS_PAIR_BUDGET` (it is the one calibration knob) and re-measure, or stop.
2. **A control moves.** Any of the four byte-identity controls in §4 changes by a single digit. That means the
   change leaked out of the `crosshatch` + `isEvenLadder()` + `toneOn` scope — fix the scope, do not re-pin.
3. **A guard file needs a bar widened that is not in §4's `## Bars changed` table.** Two of these have already
   cost this audit a regression each. Report it, do not widen it.
4. **P2 and P3 cannot both be met** on some primitive at some density. Report which cell, with the extents, and
   let the orchestrator decide between the pitch bar and the count bar — do not loosen one to save the other.
5. **The orchestrator does not sign off on §3.1's oracle** (pitch-parity + a ±40%-ish count band in place of
   the brief's literal ±10% count bar). Then the unit is BLOCKED on a ruling, not on code — the ±10% bar is
   not reachable, and the v1.3.98 reference itself fails it.
6. **T1b's landed change moves the RED numbers materially** (more than ±1 ruling per family per cell). Re-derive
   the whole table on the real base and put both tables in the report before writing any fix.
7. **The native-resolution crops still do not read as a crosshatch** even with the metrics green. Harness-clean
   is not app-clean; on 2026-09-05 three independent metric checks passed over a defect that a crop caught.

---

## 9. Planner's housekeeping

- Scratch exports used: `/private/tmp/claude-501/scratch-W36` (47a5a755, restored pristine),
  `…-98` (d5af9e30), `…-b11` (Rank-1 prototype), plus `…-parity` and `…-sym` inherited from the killed
  previous planner. **All are deleted at the end of this unit**, together with the previous planner's
  `/private/tmp/claude-501/w36/` working directory. Nothing was written to any worktree.
- **Five orphaned `node` processes from the killed 2026-09-06 planner were still resident** (`measure.js`
  against four scratch roots, 1 day 23 h elapsed each) and have been killed. They were holding jsdom heaps on a
  machine the ledger already records as having lost a dev server to the OS memory killer; worth a line in the
  incident log. The cause of the hang is worth knowing for every lane: a jsdom runtime does not exit on its own
  — an evidence script must end with `process.exit(0)`, and its output must go to a **file**, never through a
  pipe, or the whole run blocks after the compute has already finished.
- The repo was not modified by this planner other than by writing this file.
