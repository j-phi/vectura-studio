STATUS: PLAN-BLOCKED

# W-15c design E — F-14 remainder (graded case Density-blind): PROTOTYPED, MEASURED, BLOCKED

**Planner, read-only in the repo.** Every number below was measured in a scratch export of **47a5a755**
(`/private/tmp/claude-501/scratch-W15cE`, `node_modules` symlinked, deleted at the end of this unit). No file
in the repository was edited. Three designs were built and run against the real guard suites; all three
fail, on three *independent* and non-tunable grounds. **No patch is proposed.** F-14's graded remainder is a
product decision, not a formula that has not been found yet — the arithmetic below shows why, without
reference to any particular design.

> `1193cbe1` (main, post-`47a5a755`) rounds four byte-identity/golden comparisons via `pathSignature`.
> **It does not affect this oracle**: main's rounded
> `scene3d-hlr-spatial-index-identity.test.js` was copied into the export and run against the
> `47a5a755` source — **6/6 pass unchanged at λ=1**, and it still **fails 2/6 at λ=0.95**. The drift the
> rounding absorbs is ULP-scale; every movement measured here is geometric (path counts and mm).

---

## 1. Root cause recap (file:line, at `47a5a755`)

`src/core/algorithms/scene3d.js`, `faceHatchLines` → `plan.forEach` (carrier only, `:2353` `if (i > 0) return;`):

```js
:2368  const ceilCount = Math.floor(zoneCeil / f.covOne);
:2369  const soloDens  = soloOrient ? Math.round(f.ext / hatchSpacing(d) - 0.5) : 0;   // SOLO ONLY
:2372  const want      = Math.min(ceilCount, Math.max(FACET_MIN_RULINGS, soloDens));  // FACET_MIN_RULINGS = 3 (:66)
:2384  const target    = f.ext / (want + 0.5); if (target < f.plane) f.plane = target;
```

On a graded record (`isSoloOrientation` false, `:1608`; gate at `:2310`) `soloDens` is 0, so the carrier's
floor is the Density-blind pitch `ext/3.5`. W-15c closed this for **solo** records only; the graded
remainder is F-14's open half.

**Measured plan internals, app-default box, fillAngle 20 (instrumented at `:2312`):**

| d | face | zone | ext (mm, face-plane) | k | natural plane pitch | **natural count** | screen pitch (paper mm) | ceilCount |
|---|---|---|---|---|---|---|---|---|
| 50 | `face:+X` | M | 51.269 | 0.5872 | 29.083 | **1.763** | 17.076 | 14 |
| 50 | `face:+Y` | L | 51.269 | 0.3467 | 74.555 | **0.688** | 25.846 | 5 |
| 50 | `face:+Z` | F | 51.269 | 0.9811 | 5.329 | **9.621** | 5.228 | 40 |
| 5 | `face:+X` / `+Y` / `+Z` | M/L/F | 51.269 | — | — | 0.990 / 0.386 / 5.405 | 30.396 / 46.006 / 9.305 | 14/5/40 |
| 100 | `face:+X` / `+Y` / `+Z` | M/L/F | 51.269 | — | — | 13.221 / 5.157 / 72.159 | 2.277 / 3.446 / 0.697 | 14/5/40 |

The two lit facets **ask for 1.76 and 0.69 rulings at d=50**. They are frozen at 3 not because Density is
ignored but because Density's answer is *below the readability floor*, by 1.7x and 4.4x.

---

## 2. The bar is arithmetically incompatible with O20 — no design required

Foreshortening compensation (`:2318` `plane: screen / k`) makes a facet's **projected** coverage
`pen / screenPitch = pen / (hatchSpacing(d) · gain(zone))` — camera-free. That identity **is** the tone
ladder: O20 (`scene3d-facet-tone.test.js:234-249`, `scene3d-projected-pitch.test.js:206`) requires each
darker step to carry ≥1.25x the ink. Now put the RED bar (≥6 rulings on the lit facet at d=50) into paper mm
on the app-default box:

| lit-facet rulings | face-plane pitch `ext/(n+0.5)` | **on paper** (`x k = 0.5872`) | vs darkest facet `face:+Z` = **5.228 mm** |
|---|---|---|---|
| 3 (today) | 14.648 | 8.601 | 1.65x lighter — ordered, readable |
| 4 | 11.393 | 6.690 | **1.28x** — at O20's 1.25x bar |
| **6 (the RED bar)** | 7.888 | **4.632** | **0.89x — the LIT facet is DARKER than the DARKEST facet** |

**Six rulings on the lit facet is an inverted drawing on this fixture, in closed form, for any
implementation.** The only escape is to move the darkest facet too — which is §3's attempt 1, and the ink
budget refuses it.

---

## 3. Three prototypes, built and run (all in the export; all reverted)

### Attempt 1 — camera-invariant uniform carrier λ on graded records (the D successor)

`plan[0].plane *= λ` for `!soloOrient` records, λ a **constant** (a constant is the strongest possible
camera-invariance; a λ derived from world-space quantities — `record.faces` front *and* back, `ext` and
`spacing`, never `scaf.toScreen` — reduces to a constant per (record, density) and cannot do better than the
best constant, which is what is swept here). Ratios are preserved, so O20 is scale-invariant, exactly as the
D plan argued.

| λ | box `+X` rulings @d50 (ink) | `+Y` | `+Z` | `scene3d-subwindow-density` R2-cube-bands4 (**bar < 0.40**) |
|---|---|---|---|---|
| 1.00 (base) | 3 (86.4) | 3 (106.5) | 10 (285.8) | **0.3817** |
| 0.95 | 3 | 3 | — | 0.3817–0.3819 (pass) |
| 0.90 | 3 (86.4) | 3 (106.5) | 11 (313.6) | 0.3819 (pass) |
| 0.80 | 3 (86.4) | 3 (106.5) | 12 (346.6) | **0.4241 FAIL** |
| 0.70 | 3 (86.4) | 3 (106.5) | 14 (392.4) | **0.4661 FAIL** |
| 0.60 | 3 (86.4) | 3 (106.5) | 16 (450.5) | **0.4981 FAIL** (reproduces D's 0.498 exactly) |
| 0.45 | 3 (96.5) | 3 (106.5) | 22 (590.0) | **0.5550 FAIL** |
| 0.35 | 5 (120.7) | 3 (106.5) | 28 (748.5) | **0.6573 FAIL** |
| **0.25** | **7 (174.3)** | 3 (106.5) | 39 (1033.2) | **0.8159 FAIL (2.04x the bar)** |
| 0.15 | 11 (292.6) | 4 (138.4) | 64 (1697.3) | **1.2274 FAIL (past solid ink)** |

**λ required by the RED bar:** `1.763/6.5` = **0.271** for `face:+X`, `0.688/6.5` = **0.106** for `face:+Y`.
**λ admitted by the guards: 0.95.** The gap is **3.5x**, and it is bounded by three independent guards, not one:

| λ | projected-pitch | facet-tone | subwindow | box-density-bearing | appdefault | hatch-density-500 | highlight-dispatch | faceted-tone-law | hlr-identity |
|---|---|---|---|---|---|---|---|---|---|
| **1.00 (base, hook inert)** | 17/17 | 15/15 | 3 pass + 2 skip | 4/4 | 7/7 | 14/14 | 12/12 | 19/19 | 6/6 |
| 0.95 | 17/17 | 15/15 | pass | **1 fail** (box fingerprints `4db89b89` → `5c4eda3a`) | 7/7 | **1 fail** | 12/12 | 19/19 | **2 fail** |
| 0.90 | 17/17 | **1 fail (O21)** | pass | 1 fail | — | 1 fail | — | — | 2 fail |
| 0.85 | 17/17 | **1 fail (O21)** | pass | 1 fail | 7/7 | 1 fail | 12/12 | 19/19 | 2 fail |
| **0.25** (meets the bar) | **4 fail** | **1 fail (O21)** | **1 fail (0.8159)** | **2 fail** | 7/7 | **1 fail** | 12/12 | **1 fail** | **2 fail** |

- **O21** (`scene3d-facet-tone.test.js:345`, "a T facet carries a SECOND FAMILY at its own pitch") breaks at
  **λ ≤ 0.90** — a 10 % carrier tightening. Confirms D's finding: tightening only the carrier still moves the
  composed coverage budget the crossed family draws on. **O21 is not a tuning miss and not camera-related.**
- **`scene3d-subwindow-density`'s control** ("the probe can say NO — a drawing with no caustic reads clean")
  sits at **0.3817 against a 0.40 bar today: 4.6 % of ink headroom on a graded cube, before anything is
  added.** This is a plot-safety budget, not taste.
- `scene3d-hatch-density-500`'s **behaviour** test `RED (fixed by this change) — path count strictly increases
  200/300/400/500 > faceted box` fails at **every** λ < 1 (not a pin — a monotonicity regression at the top of
  the Density range), and the two `hlr-spatial-index-identity` byte-identity goldens move with it (those
  scenes contain graded objects; the ground is solo and never sees the change). So even the "harmless" λ=0.95
  costs a monotonicity guard plus two golden re-pins for **zero** change on the lit facets.

### Attempt 2 — Density-driven grant on the granted (light) facet, hard-capped (D-plan Fix 3, camera-free)

`soloDens = min(round(ext/hatchSpacing(d) − 0.5), C)` for graded records (built from `ext` and `hatchSpacing`
only — **no projected quantity anywhere**, so it is camera-invariant by construction):

| C | `scene3d-projected-pitch` | `scene3d-facet-tone` | `scene3d-subwindow-density` |
|---|---|---|---|
| 3 (= today) | 17/17 | 15/15 | pass |
| **4** (the FIRST extra ruling) | **1 fail** — `R-cube-bands3 — the two LIT faces differ (bar 0.015)` | **1 fail** — `bands 3: three distinct densities, strictly decreasing in N.L` | pass |
| 5 | **3 fail** | — | — |
| **6** (the RED bar) | **7 fail** — e.g. `R2-cube-bands2`: `face:+X 0.176` vs `face:+Z 0.17**0**` (the lit face out-inks the darker one) | — | — |

**Headroom on the lit facet is exactly zero rulings.** Independently reproduces the D plan's Fix-3 result on
the current tree, and matches §2's closed form (4 rulings = 1.28x margin, at O20's 1.25x bar).

### Attempt 3 — the world-space proxy (face-plane / uncompensated carrier pitch on graded records)

The orchestrator's own alternative: derive the carrier pitch from a quantity that never routes through
`scaf.toScreen` — i.e. use the **screen pitch as a face-plane pitch** (drop `/k`), which is the "face-plane
reading" the owner already ruled for solo objects (STILL-OPEN 2026-09-05).

- **It does not move the lit facets at all**: box `+X` 3 rulings / ink **86.4** and `+Y` 3 / **106.5** at
  d=50 — byte-identical to base — because the face-plane count is `ext/spacing` = 51.269/17.076 = **3.00**
  (`+X`) and **1.98** (`+Y`), still under the 3.5 the floor grants. Predicted from the §1 table, then measured.
- **And it costs the whole tone law**: `projected-pitch` **7 fail**, `facet-tone` 1, `subwindow`
  **0.9172 (2.29x the bar)**, `box-density-bearing` 2, `appdefault-facet-fill` 1, `hatch-density-500` 1,
  `hlr-identity` 2 — **15 failures in 7 files**, the design-C signature (§2.3 of `W-15c-plan.md`).

---

## 4. RED oracle — file and numbers (unmet, and measured)

Oracle as briefed: *the graded case draws ≥ 6 rulings at d=50 and is monotone in Density.* Its home is
`tests/unit/scene3d-box-density-bearing.test.js` → `ACCEPTED: Density is inert on the lit facets over most of
its range` (the file's own note says "INVERT THIS TEST when the carrier floor is made proportional"), with
`tests/unit/scene3d-faceted-density-calibration.test.js`'s `solid` counts as the second oracle.

| quantity | at `47a5a755` (RED) | needed | best design that keeps every guard green |
|---|---|---|---|
| box `face:+X@78` ink at d=5/50/70 | **86 / 86 / 86** | strictly increasing | 86 / 86 / 86 (unchanged) |
| box `face:+Y@3` ink at d=5/50/90 | **106 / 106 / 106** | strictly increasing | 106 / 106 / 106 (unchanged) |
| box `face:+X` rulings at d=50 | **3** | **≥ 6** | **3** |
| `solid` fill-path count at d=1/25/50 | **35 / 35 / 35** | strictly increasing | 35 / 35 / 35 |

For the record, λ=0.25 *does* meet the ink half — `+X` ink 97/174/269, `solid` 42/51/73 — at the cost of
9 failing tests in 6 files and a local ink coverage of 0.8159 against a 0.40 bar. That is the trade, priced.

---

## 5. Byte-identity / ground-plane proof (the FROZEN decision)

- **No source change ships.** The repository was never edited; the export is deleted. The ground plane is
  therefore byte-identical **by construction**.
- **Measured anyway, under the most aggressive prototype (λ=0.25):** `fingerprint(50,'plane')` =
  **`10a710a6:3909`** — *identical to base and to the pin* in `scene3d-box-density-bearing.test.js:209`.
  Every prototype is gated on `!soloOrient`, and the ground plane is a single-orientation record, so the
  solo path (plane, ground) never sees any of these changes. The `hlr-spatial-index-identity` rows that
  move at λ<1 move because those scenes contain **graded** objects, not because of the ground.
- Main's post-`1193cbe1` rounded identity guard behaves the same (see the note at the top).

---

## 6. Evidence cells (verified against `docs/3d-audit/fill-audit/manifest*.jsonl`)

F-14's graded remainder is already visible in the shipped gallery, so no re-shoot is needed to see it:

| cell | manifest row | reads |
|---|---|---|
| `shots/A/box__hatch__ladder__low__a.webp` | A, box, hatch, ladder, low, a | 17 paths / 476.8 mm |
| `shots/A/box__hatch__ladder__med__a.webp` | A, box, hatch, ladder, med, a | 23 paths / 632.1 mm — only the dark facet moved |
| `shots/A/box__hatch__ladder__max__a.webp` | A, box, hatch, ladder, max, a | 245 paths / 5626.8 mm |
| `shots/A/solid__hatch__ladder__low__a.webp` | A, solid, hatch, ladder, low, a | **55 paths / 447.8 mm** |
| `shots/A/solid__hatch__ladder__med__a.webp` | A, solid, hatch, ladder, med, a | **55 paths / 447.8 mm — byte-identical to `low`: F-14, in the gallery** |
| `shots/A/plane__hatch__ladder__{low,med}__a.webp` | A, plane, hatch, ladder, low/med, a | 7 → 9 paths — the SOLO half, already fixed by W-15c |
| `shots/A/pyramid__hatch__ladder__{low,med,max}__a.webp` | A, pyramid, … | chart-wrapped, already Density-responsive — **not a target** |

(`plane`/`box`/`pyramid` x hatch x ladder x low/med/max all exist in `manifest.A.1-1.jsonl`; `box` also in
tier B. There is no `solid` tier-B row.)

## 7. Files — if a future attempt is authorised

**ALLOWED:** `src/core/algorithms/scene3d.js` (faceted path only),
`tests/unit/scene3d-box-density-bearing.test.js`, `tests/unit/scene3d-faceted-density-calibration.test.js`,
and — only for the recommendation below — `src/config/context-bar.js` + `src/config/defaults.js` for a new
style param. **FORBIDDEN:** `surface-fill*.js`, `mappers.js`, `buildSliceSegments`/`contourSlice`, `hlr.js`,
`shadows.js`, `regions.js`, and every baseline JSON.

## 8. Stop conditions (already reached)

Any of these blocks the unit, and all four are now measured: the subwindow control exceeds 0.40; O21's
`ratio(T) > 0.75` fails; a lit facet gains a ruling on `R-cube-bands3`/`R2-cube-bands*`; or
`hatch-density-500`'s pinned faceted-box series moves. **Do not re-attempt any design in the λ family, the
capped-grant family, or the face-plane-proxy family** — the three are now measured dead on the current tree,
and §2 shows the bar itself is inconsistent with O20 independently of the design.

---

## Recommendation (one paragraph, for Jay)

**Park F-14's graded remainder and put the trade on a dial rather than in a formula.** On a graded object
"Density" and "the tone ladder" are the same knob: a facet's paper coverage is exactly
`pen / (hatchSpacing(Density) x gain(zone))`, so the only way to give a *lit* facet more rulings is to spend
either the ladder's contrast (O20/O21 — the lit facet passes the dark one at 6 rulings, and is at the 1.25x
readability bar at 4) or the drawing's ink budget (the subwindow control sits at 0.3817 of a 0.40 bar with
4.6 % headroom, and a global tightening large enough to matter reads 0.82–1.23, i.e. past solid). The
3-ruling floor is not a Density bug; it is the readability floor doing its job on facets whose honest ask is
0.7–1.8 rulings. My recommendation is therefore: (1) close F-14's graded half as **by-design**, with §2's
table as the proof, and record in the release notes that on graded objects Density sets the object's ink
*range* while tone allocates within it; and (2) if the "3 stripes read as bare paper" complaint still stands
on the picture, expose `FACET_MIN_RULINGS` (or an equivalent "minimum facet rulings" / "tone contrast"
control) as a per-style parameter defaulted to 3 — that hands the user the ladder-versus-fill trade
explicitly, which is what it is, instead of hiding a product decision inside a floor constant. Either way
this needs Jay, not another design.
