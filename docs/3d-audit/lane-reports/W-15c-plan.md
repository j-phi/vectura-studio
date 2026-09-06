STATUS: PLAN-READY

# W-15c plan — the faceted carrier grant and the plane's ruling count (F-14)

**Lane:** fill-audit · **Worktree:** `.claude/worktrees/fill-audit` (branch `3d-scene/fill-audit`, HEAD `6d6b1b78`,
effective code state `5ebccf7c`) · **Port:** 8476 · **Role:** planner (read-only; no worktree edits, no commits).

All measurements below were taken in a **scratch export** of `6d6b1b78`
(`/private/tmp/claude-501/.../scratchpad/w15c`, `node_modules` symlinked back), with a temporary dump hook in
the carrier grant. A pristine second export (`.../w15c-base`) supplied the before column. The worktree was
never edited. `git status --short -- . ':!graphify-out'` was empty at start and at finish.

---

## 0. Executive summary

Three prior designs failed because they attacked the wrong term. This plan does three things:

1. **Traces the plane's 3 rulings to an exact, Density-independent constant** (§1) and proves the plateau's
   boundary arithmetically (`d < 65.3`).
2. **Proves why A, B and C invert O20/O9** — including an *analytic impossibility result* (§2.4) that rules
   out the shape the W-15b lead recommended, so a fourth attempt does not have to discover it by failing.
3. **Ships a verified design** (§3): gate the Density term on an object that has **no cross-facet ordering to
   protect**. Every graded object is byte-identical *by construction*, and that was measured, not assumed:
   **1929/1929 integration, 1350/1398 scene3d unit, 97 visual passing**, with all 5 remaining failures being
   pins that must move (§5).

Result: the app-default plane goes **3 → 9 rulings at Density 50**, on-paper gap **8.549 → 3.149 mm**, with
coverage 0.0950 against `formCeiling('L')` 0.0987 — ceiling-bound and plot-safe.

> **OWNER DECISION (read before implementing).** Two facts pull in opposite directions and the owner must
> pick a reading. See §4. The recommendation is N = 9, but N = 3 is defensible and the evidence for it is
> strong enough that shipping N = 9 without saying so would be dishonest.

---

## 1. Where the plane's 3 rulings come from

### 1.1 The call chain

| step | file:line | expression |
|---|---|---|
| Density → mm | `scene3d.js:372` | `hatchSpacing(d) = max(1, 14 − 0.13·d)` for `d ≤ 100` |
| tone widens it | `scene3d.js:1062, 1134` | `spacing = max(penWidth, s0 / gain)`, `gain = coverageGain(bandIdx)` (`:802`) |
| ask → face plane | `scene3d.js:1520, 1525` | `screen = max(q.screenPitch, PLOT_FLOOR_MULT_OBJ·pen)`; `f.plane = screen / k` |
| the floor | `scene3d.js:1531–1580` | `want = min(floor(zoneCeil / f.covOne), FACET_MIN_RULINGS)`; `target = f.ext / (want + 0.5)`; applied iff `target < f.plane` |
| the constant | `scene3d.js:74` | `FACET_MIN_RULINGS = 3` |
| the ceiling | `regions.js:721` | `formCeiling('L') = max(ceil, 1/12) = 0.0987` |

`k = uvPitchFactor(scaf, deg)` is the foreshortening factor: how much of one mm of face-plane pitch survives
to paper, measured perpendicular to the ruling.

### 1.2 The plane fixture, measured (app default, engine entry, mapper `hatch`, fillAngle 45, Density 50)

One visible face, normal `(0,1,0)`, zone **L**, `penWidth` 0.2992 mm.

```
f.ext      = 84.853 mm      (60 mm plane, perpendicular extent across a 45° ruling = 60·√2)
k          = 0.35261        (default camera pitch 20°)
ext · k    = 29.92 mm       ← the plane's extent ACROSS THE RULINGS, ON PAPER
s0         = hatchSpacing(50) = 7.500 mm
gain       = 0.6448         → spacing = 7.500 / 0.6448 = 11.631 mm (paper)
f.plane    = 11.631 / 0.35261 = 32.985 mm  → natural count = floor(84.853 / 32.985) = 2
covOne     = pen / (ext·k) = 0.2992 / 29.92 = 0.010027
zoneCeil   = formCeiling('L') = 0.0987
ceilCount  = floor(0.0987 / 0.010027) = 9
want       = min(9, 3) = 3                          ← FACET_MIN_RULINGS binds
target     = 84.853 / 3.5 = 24.2437 mm  < 32.985    ← grant fires
rendered   = 3 rulings, on-paper gap 8.549 mm
```

`ext · k = 29.92 mm` was confirmed twice independently, from the rendered drawing rather than the model:
at d = 100 the plane draws 19 rulings at 1.551 mm; at d = 220 it draws 65 at 0.4528 mm.

### 1.3 The plateau, and its exact boundary

`target = 24.2437` contains **no Density term**. The grant therefore binds for every Density at which
`f.plane > 24.2437`:

```
spacing / k > 24.2437  ⟺  spacing > 8.549  ⟺  s0 > 5.512  ⟺  14 − 0.13·d > 5.512  ⟺  d < 65.3
```

Measured counts d = 1/10/25/50/100/220: **3, 3, 3, 3, 19, 65.** The plateau is d = 1…65, exactly as derived.

### 1.4 The fact that reframes F-14

`toneLaw: 'none'` is Stage 0 — the tone ladder off, the foreshortening compensation still on. On the same
plane at Density 50 it renders **3 rulings at a gap of exactly 7.500 mm = `hatchSpacing(50)`**.

`tone.enabled: false` renders **11 rulings at 2.645 mm**, because the compensation is deliberately gated on
`toneOn` (`scene3d.js:1425` region comment: *"An UNTONED fill makes no tonal claim — its spacing is the
user's Density, read in the face plane"*).

So the same slider means two different things:

| path | unit of Density | plane at d = 50 |
|---|---|---|
| `tone.enabled: false` | face-plane mm | **11 rulings**, 2.645 mm on paper |
| `toneLaw: 'none'` (Stage 0) | paper mm | **3 rulings**, 7.500 mm on paper |
| ladder (default) | paper mm, then floored | **3 rulings**, 8.549 mm on paper |

**F-14 is a unit-of-Density inconsistency, not a broken formula.** The worklist's implied target
(`extent / hatchSpacing(50)` ≈ 11) is the *untoned* number. The three prior designs were all trying to reach
the untoned number while keeping the paper-space law that makes the toned number 3. Those differ by
`1/k = 2.84×` and cannot both hold.

---

## 2. Why designs A, B and C invert O20 / O9

### 2.1 Which facets the grant actually governs (measured at the fixtures)

At Density 85 (`s0 = 2.95`), one facet per cube is grant-governed and it is always a **lit / glint** one:

| view | governed facet | zone | ext | k | ceilCount | natural count | density count |
|---|---|---|---|---|---|---|---|
| `R-cube-bands2` | `n=(1,0,0)` glint | L | 62.00 | 0.5000 | 10 | 3.27 | 10.51 |
| `R-cube-bands3` | `n=(1,0,0)` glint | M | 62.00 | 0.5000 | 15 | 3.04 | 10.51 |
| `R-cube-bands4` | `n=(1,0,0)` glint | M | 62.00 | 0.5000 | 15 | 2.81 | 10.51 |
| `R2-cube-bands2` | `n=(0,1,0)` glint | L | 81.86 | 0.5851 | 15 | 2.69 | 16.24 |
| `R2-cube-bands4` | `n=(0,1,0)` glint | M | 81.86 | 0.5851 | 23 | 3.27 | 16.24 |

Their siblings do **not** fire: `R-cube` `+Y` natural 6.99, `+Z` natural 23.52; `R2-cube` `+X` natural 5.17,
`+Z` natural 26.52. All are already Density-governed.

**That asymmetry is the whole defect.** The grant binds on exactly one face of the ordered pair, and it is
the lighter one. Its count is pinned at the constant 3. Replace the constant with any Density-driven number
(10.51 or 16.24 here) and the *lit* face gains ink while its darker sibling gains none — which is precisely
the inversion `scene3d-projected-pitch.test.js`'s
`… — the better-lit face carries the lighter ink, with no exception` and `scene3d-facet-tone.test.js`'s
`bands N: three visible faces, three distinct densities, strictly decreasing in N.L` detect.

- **Design A** (density target, ceiling unchanged) raises those counts directly. Inversion.
- **Design B** (preserve the gate, widen only where it already fires) widens *exactly* these facets, because
  they are the ones the gate already fires on. Same inversion, different arithmetic.

### 2.2 O9's monotonicity is carried by the constant 3

`scene3d-faceted-highlight-dispatch.test.js > O9: tightening the cone shrinks the highlight (ink rises) on
both faceted shapes` asserts `ink(3) > ink(1)` and `ink(6) > ink(3)`.

Measured grant-firing counts on `CUBE` at Density 50: **sensitivity 1 → 2 facets firing; 3 → 1; 6 → 0.**
A glint facet's gain is cut, its natural pitch widens, and the grant pins it at 3 rulings. At sensitivity 1
the most facets are glinting, so the most facets sit on that constant. Make the pinned count Density-driven
(`+X` density count 11.07, `+Y` 6.35) and sensitivity 1 gains the most ink of the three — `ink(1)` overtakes
`ink(3)` and O9 inverts. **O9 reads the constant, not the ladder.**

### 2.3 Design C's extra 4 files: a missing `k`

C computed `rawTarget = (f.ext / (want + 0.5)) · (spacing / s0)`. With `want ≈ f.ext / s0` that collapses to
`≈ spacing` — but expressed in **face-plane** units, while the quantity it is compared against, `f.plane`, is
`spacing / k`. Since `k < 1` on every foreshortened facet, `target < f.plane` is then satisfied *always*.
The grant fired on essentially every foreshortened facet and overrode the O20/C15 foreshortening
compensation wholesale. That is why C broke 6 files rather than the 2–3 A and B broke, and why it also took
out `scene3d-box-density-bearing`, `scene3d-hatch-density-500` and `scene3d-subwindow-density`.

### 2.4 An impossibility result — do not retry the W-15b lead's shape

The W-15b lead proposed "a uniform density term applied identically to every face, with tone modulating pitch
multiplicatively". Written out, that target is

```
target = ext / (ext / spacing + 0.5) ≈ spacing      (face-plane units, after the k conversion)
```

which is **identically the natural ask**. Such a target can never satisfy `target < f.plane`, so the grant
never fires: it is not a floor at all. Box `face:+Y` (natural count **0** at d = 50, `fits = false`) would go
back to drawing nothing, breaking
`scene3d-appdefault-facet-fill.test.js > RGR — every visible box face is RULED, not merely marked`.

Generalising: **a floor must be tone-blind in at least one term** (otherwise it is the ask, not a floor), and
a tone-blind count multiplied by a per-facet extent is **not monotone across facets of one object** (`ext·k`
varies independently of `gain`). Therefore *no per-facet formula can be both a floor and ordering-safe on a
graded object.* A, B and C are three instances of that one impossibility.

The escape is not a better formula. It is to notice that the impossibility only bites **when there is an
ordering to preserve**.

---

## 3. The design

### 3.1 Principle

The tone ladder is a *relative* statement: face A lighter than face B. On an object that presents a **single
orientation**, the ladder expresses nothing, there is no ordering to invert, and its absolute gain is a pure
unintended Density offset. On such an object — and only there — Density may set the grant's count.

### 3.2 The change (3 edits, all in the faceted path of `src/core/algorithms/scene3d.js`)

**(a) After `rankBandCache` (`:858`)** — a memoised predicate, mirroring `recordBands`:

```js
const soloOrientCache = new Map();
const isSoloOrientation = (record) => {
  if (!record) return false;
  if (soloOrientCache.has(record)) return soloOrientCache.get(record);
  const faces = (record && record.faces) || [];
  let n0 = null; let solo = true;
  for (let i = 0; i < faces.length; i++) {
    const f = faces[i];
    if (!f || !f.front || !f.normalWorld) continue;
    if (!n0) { n0 = f.normalWorld; continue; }
    if (dot(n0, f.normalWorld) < 0.999) { solo = false; break; }
  }
  if (!n0) solo = false;
  soloOrientCache.set(record, solo);
  return solo;
};
```

**(b) In `faceHatchLines`, immediately before `const plan = asks.map(…)` (`:1518`)**:

```js
const soloOrient = toneOn && zone && isSoloOrientation(record);
```

**(c) Replace `:1567`** (`const want = Math.min(Math.floor(zoneCeil / f.covOne), FACET_MIN_RULINGS);`):

```js
const ceilCount = Math.floor(zoneCeil / f.covOne);
const soloDens = soloOrient
  ? Math.round((f.ext / Math.max(1e-6, hatchSpacing(styleParams.fillDensity))) - 0.5) : 0;
const want = Math.min(ceilCount, Math.max(FACET_MIN_RULINGS, soloDens));
```

The `− 0.5` inverts the grant's own `ext / (n + 0.5)` placement convention, so the granted pitch **is** the
Density pitch whenever the zone ceiling is slack. `FACET_MIN_RULINGS` stays a floor; `ceilCount` stays the
cap, so the grant can still never lighten a zone past a darker one.

### 3.3 Ordering safety — by construction, then measured

`soloDens` is 0 unless the object presents one orientation. Every object with ≥ 2 visible orientations takes
the identical `min(ceilCount, FACET_MIN_RULINGS)` it takes today, so every cross-facet criterion is
byte-identical. Measured visible-orientation counts:

| fixture | orientations | gate |
|---|---|---|
| `R-cube-bands{2,3,4}` | 3 | closed |
| `R2-cube-bands{2,3,4}` | 3 | closed |
| `R-lp-bands4` / `LOWPOLY` | 40 | closed |
| highlight-dispatch `CUBE` | 3 | closed |
| app-default `box` | 3 | closed |
| app-default `solid` | 12 | closed |
| `hatch-density-500` box | 3 | closed |
| **app-default `plane`** | **1** | **open** |

### 3.4 The Stage-0 trap — found during verification, and why `zone &&` is load-bearing

`Regions.formCeiling(undefined)` returns **0.1457** — the same value as `formCeiling('M')`. Without the
`zone &&` term, on `scene3d-faceted-tone-law.test.js`'s 90 × 90 plane at Density 85 both the ladder (zone M)
and Stage 0 saturate at `ceilCount = 25` and render the **identical** 25 rulings at gap 2.065 mm. The test
`plane: toneLaw 'none' is Stage 0, not the default ladder` then fails with
`expected 'd843882405f4dc26e30c63a7baac3703' not to be 'd843882405f4dc26e30c63a7baac3703'`.

With `zone &&`: ladder 25 rulings, Stage 0 17 rulings at 2.950 mm. Distinct. `zone` is `undefined` for
exactly one configuration — Stage 0 — so this also keeps Stage 0 byte-identical everywhere.

**Do not drop the `zone &&` term. It is not defensive noise.**

---

## 4. What N should be, and the owner decision

The worklist bar is `planeExtentAcrossRulings / hatchSpacing(50) ± 1`. "Extent" is ambiguous and the two
readings differ by `1/k = 2.84×`:

| reading | extent | N | verdict |
|---|---|---|---|
| **paper** (compensated) | 29.92 mm | 29.92 / 7.5 = **3.99** | today's 3 already satisfies ±1 — **F-14 would not be a defect** |
| **face plane** (uncompensated) | 84.853 mm | 84.853 / 7.5 = **11.31**, capped by `formCeiling('L')/covOne` = **9** | matches the untoned path (11 measured) and the worklist's own text |

The evidence for the paper reading is strong and must be stated: **Stage 0 renders this plane at a gap of
exactly 7.500 mm — `hatchSpacing(50)` to the digit — and that is 3 rulings.**

**Recommendation: N = 9** (face-plane reading, ceiling-bounded). Reasons:

- It closes the user-visible complaint. 3 stripes on a 30 mm-wide diamond do not read as a fill; 9 rulings at
  3.149 mm do.
- It makes the toned solo facet agree with the untoned path, which already draws 11 there. The present state
  is the *inconsistency*, and this removes it for the solo case.
- It is bounded by a real law, not by a tuned constant: `want` saturates at `ceilCount = 9`, giving coverage
  0.0950 ≤ `formCeiling('L')` = 0.0987. Plot-safe by construction.

**Cost, stated plainly:** on a solo facet the ladder no longer sets the pitch wherever the grant fires
(the ceiling does), and Density there means face-plane mm rather than paper mm. If the owner rejects that,
the honest alternative is to close F-14 as **not-a-defect** with §1.4 as the proof, and file the
`toneOn`-gated compensation divergence as its own item.

---

## 5. Verification already performed (scratch export of `6d6b1b78`)

### 5.1 Rendered counts — before → after

| cell | before | after |
|---|---|---|
| plane hatch, d = 1/10/25/50/100/220 | `3, 3, 3, 3, 19, 65` | **`6, 6, 7, 9, 19, 65`** |
| plane hatch d = 50, on-paper gap | 8.549 mm | **3.149 mm** (coverage 0.0950 ≤ 0.0987) |
| plane contour, d = 1/50/220 | `3, 4, 60` | `3, 4, 60` (unchanged) |
| box hatch, d = 1/10/25/50/100/220 | `11, 12, 14, 17, 117, 239` | unchanged |
| box contour / solid hatch / solid contour | — | unchanged at every sampled density |
| plane Stage 0 (`toneLaw:'none'`), d = 1/25/50/100 | `3, 3, 3, 29` | unchanged |
| plane `tone.enabled:false`, d = 1/25/50/100 | `6, 7, 11, 84` | unchanged |

The after series is monotone non-decreasing and Density-responsive from d = 1.

### 5.2 Suites

| suite | result |
|---|---|
| `tests/integration` (234 files) | **1929 passed, 0 failed** |
| `tests/unit/scene3d*` (115 files) | **1350 passed**, 5 failed — all 5 are pins that must move |
| `tests/visual` (6 files) | **97 passed**, 2 golden drifts |

(One `[vitest-worker]: Timeout calling "onTaskUpdate"` infra warning under load, no test attributed —
the protocol's known non-regression.)

### 5.3 The complete re-pin list (7 numbers; nothing else moves)

| file | pin | before → after |
|---|---|---|
| `tests/unit/scene3d-faceted-density-calibration.test.js` | plateau oracle | `[3,3,3,3]` → `[6,6,7,9]` |
| `tests/unit/scene3d-box-density-bearing.test.js` | `fingerprint(50,'plane')` | `44270f5b:3738` → `10a710a6:3909` |
| `tests/unit/scene3d-hlr-spatial-index-identity.test.js` | `facetedOverlap-orthographic-hatch\|settled` | `edb852cb…`, 129/258 → `0517b318738d3fd4dc7d31be0698487d85f4e96e31d6e9e8d300b9d2fa2e6875`, 208/416 |
| " | `\|draft` + both `curvedOverlap-perspective-mixed-xray` rows + both `denseMixed-8obj-shadows` rows | regenerate and record each |
| `tests/visual/scene3d-tone-baseline.test.js` | `shadow-additive-default` | 219 → 284 paths |
| " | `shadow-inverse` | 58 → 126 paths |

**Why the HLR and visual pins move — state this in the commit body so it is not mistaken for collateral.**
Those three HLR scenarios and the two shadow goldens set `styleTable.scene.mapper = 'hatch'` with **no ground
override**, so the **ground plane** inherits the hatch. A ground is a single-orientation faceted object, so
the gate opens on it and it gains rulings. This is consistent (a ground *is* a plane) and it is the single
largest visible consequence of the change — the owner should be told. The **app-default scene is
unaffected**: its ground carries its own style, and its ground fill path count is 96/119/57 across
plane/box/solid, unchanged at every density.

Every other fingerprint row in `BYTE-IDENTITY GUARD` (box at d 10/24/50/100/150, solid at 50/150, sphere at
50/150) is unchanged. **No tolerance is widened and no ordering assertion is touched.**

---

## 6. RGR

### RED (fails at `6d6b1b78`, passes after)

In `tests/unit/scene3d-faceted-density-calibration.test.js`, replacing the MEASURED plateau test (whose own
header already states it will be replaced by a future attempt):

```js
test('RGR: the plane carrier tracks Density instead of plateauing (F-14)', () => {
  const counts = [1, 10, 25, 50].map((d) => fillLineCount(d, 'plane'));
  expect(counts).toEqual([6, 6, 7, 9]);
  expect(counts[3]).toBeGreaterThan(counts[0]);   // RED at base: 3 > 3
});
```

**Load-bearing red assertion:** `fillLineCount(50, 'plane') >= 9`. **Current value: 3.**

**Justification of N = 9** (§4): face-plane extent 84.853 mm ÷ `hatchSpacing(50)` 7.5 mm = 11.31, capped by
`formCeiling('L') / covOne` = 9. Add a companion assertion so N is anchored to the law, not to a magic number:

```js
test('the granted plane pitch stays inside the light zone ceiling', () => {
  // pen / on-paper gap must not exceed Regions.formCeiling('L')
  expect(0.2992 / 3.149).toBeLessThanOrEqual(V.Scene3D.Regions.formCeiling('L'));
});
```

Keep the existing `DONE_WHEN (partial): low Density still reads as a fill` (6 ≥ 3 after) and
`hatchSpacing(50) === 7.5` assertions untouched.

### GREEN / REFACTOR

Targeted run, then the three suites in §5.2. Do not run the full suite until pre-commit.

---

## 7. Guard tests — must stay green, by name

All verified green in the scratch export.

**`tests/unit/scene3d-facet-tone.test.js`** — `bands 2|3|4: three visible faces, three distinct densities,
strictly decreasing in N.L`; `the emitted ink stays a FUNCTION OF BAND COUNT (the protected contract)`;
`is VIEW-INDEPENDENT: orbiting the camera does not re-grade the facets (O28)`; `T facets exist on a faceted
sphere at all`; `D(terminator facets) >= 1.25 x D(facets below it)`; `a T facet carries a SECOND FAMILY at
its own pitch, an F facet a lighter one` (the `ratio(F) > 0.15` floor design C broke); `the dihedral gate is
one exported predicate: a cube has none, a geodesic is all of it (O22)`; `a CUBE still grows no core shadow —
an edge is not a terminator (O22)`; and the five `rank quantization…` unit tests.

**`tests/unit/scene3d-projected-pitch.test.js`** — all six `{R-cube,R2-cube}-bands{2,3,4} — the better-lit
face carries the lighter ink, with no exception`; all six `… — the two LIT faces differ from each other
(spec bar 0.03; ratcheted)`; `R2-cube-bands{2,3,4} — no visible facet floods past the object ceiling`;
`R2-cube-bands4 — the two form-shadow faces read alike, however they are turned`;
`R-cube-bands4 — the first cube fixture is not disturbed`.

**`tests/unit/scene3d-faceted-highlight-dispatch.test.js`** — `O9: tightening the cone shrinks the highlight
(ink rises) on both faceted shapes`; `O9: highlightSensitivity changes the perFace highlight on a cube`;
`… on a low-poly sphere`; `O14: the six treatments are all distinct on a faceted cube (perFace)`;
`… on a low-poly sphere (perFace)`; the O11 and O15 tests; `deterministic: same faceted highlight params →
byte-identical output`.

**`tests/unit/scene3d-box-density-bearing.test.js`** — `ACCEPTED: Density is inert on the lit facets over
most of its range` (`[86,86,86]`, `[106,106,106]`); `no rendered fill family ever rotates with Density`;
`ACCEPTED: the dark facet gains a second direction between Density 20 and 30`; every fingerprint row in
`BYTE-IDENTITY GUARD: box / solid / plane / sphere fingerprints across Density` **except**
`fingerprint(50,'plane')`.

**`tests/unit/scene3d-hatch-density-500.test.js`** — `faceted box (geometry3d.js hatchPolygon path)`
(`[178,181,185,190]`); `curved sphere (SurfaceFill masterGrid path)`; `curved torus …`; the
`__hatchSpacingForTest` / `__curvedMasterFloorPenForTest` rows; the perf guards.

**`tests/unit/scene3d-subwindow-density.test.js`** — `the probe can say NO — a drawing with no caustic reads
clean` (0.382 < 0.40; R2-cube gate closed, so unchanged); both calibration tests.

**`tests/unit/scene3d-appdefault-facet-fill.test.js`** — `RGR — every visible {box,plane,solid} face is
RULED, not merely marked`; `the fix did not flatten the shading: dark faces still out-ink lit ones`;
`RGR — the plane primitive is not classified as one big specular glint`; `a ruling still ends on its own face
boundary, never in open face`; `the fixture really is the factory default (no test rig has crept in)`.

**`tests/unit/scene3d-faceted-tone-law.test.js`** — `plane: toneLaw 'none' is Stage 0, not the default
ladder` (**the test the `zone &&` guard exists for — §3.4**); the box and solid rows; the mono-law rows.

**`tests/unit/scene3d-fixture-single-source.test.js`** — do not restate the rig (`pitch: 32`,
`elevation: 28`, camera/light/tone/bounds/primitive literals) inline in any new or edited test; import from
`tests/fixtures/scene3d-shadow-anatomy.js`.

---

## 8. Evidence cells

Run from **MAIN** so output lands in main's gallery dir:

```
node scripts/audit/scene3d-capture.js --tier A \
  --root .claude/worktrees/fill-audit --port 8476 \
  --only '<regex>' --out docs/3d-audit/fill-audit/after/W-15c
```

| cell regex | expectation |
|---|---|
| `^plane__hatch__ladder__(low\|med\|max)__a$` | **low and med change** (3→6, 3→9 rulings). **max is byte-identical** — at d = 220 the natural pitch has overtaken the grant (65 → 65). Explain the identical pair in `report.json`. |
| `^plane__hatch__none__(low\|med\|max)__a$` | **byte-identical** (Stage 0 untouched: 3/3/29). These cells are **not in `shots/A` today** — shoot a matching `before` from the base sha too, or the pair cannot be compared. |
| `^plane__contour__ladder__(low\|med\|max)__a$` | **byte-identical** — contour does not route through the carrier grant (measured 3/4/60 on both sides). |
| `^plane__contour__none__(low\|med\|max)__a$` | **byte-identical**, same reason. |
| `^box__hatch__ladder__med__a$` | **byte-identical** (17 object fills both sides; gate closed, 3 orientations). |
| `^solid__hatch__ladder__med__a$` | **byte-identical** (35 object fills both sides; gate closed, 12 orientations) — the required solid cell. |

Read the PNGs with the Read tool and describe them. The bar for
`plane__hatch__ladder__med__a`: today it reads as **three long stripes across an empty diamond** (I looked at
`shots/A/plane__hatch__ladder__med__a.webp`); after, it must read as a hatched surface, 9 rulings at ~3.1 mm.
Byte-identical pairs must be explained, not just listed — six of the ten cells above are expected identical
and that is the point of shooting them.

---

## 9. Files

**Allowed**
- `src/core/algorithms/scene3d.js` — faceted path only: the block after `:858`, and `:1518` / `:1567`.
- `src/ui/shell/context-bar.js` — in the lane's remit; **not expected to be needed** by this change.
- Tests: the eight unit files named in §7 plus `tests/visual/scene3d-tone-baseline.test.js`.

**Forbidden** — owned by other lanes, do not cross:
`src/core/scene3d/surface-fill.js` (fill-audit-a) · `surface-fill-mono.js` (fill-audit-c) ·
`mappers.js` (fill-audit-d) · `hlr.js` / `shadows.js` (handoff-c) · `src/core/scene3d/regions.js`
(the ceiling and the ladder are read, never edited by this unit).

---

## 10. Open follow-ups (do not fold into this unit)

1. **The graded case is still Density-blind on its lit facets.** `scene3d-box-density-bearing.test.js`'s
   `[86,86,86]` stands, and its own source comment says *"INVERT THIS TEST when the carrier floor is made
   proportional"*. §2.4 proves no per-facet formula can close it. Closing it needs **per-object ladder
   normalisation** — one multiplicative constant per object, chosen so the object's own darkest visible
   facet honours Density, applied to every facet so all ratios (and therefore every ordering criterion)
   survive. That is a separate unit and it will move many fingerprints.
2. **`toneOn`-gated foreshortening compensation.** Density means face-plane mm untoned and paper mm toned
   (§1.4). This unit makes the toned **solo** facet agree with the untoned path; the graded case stays
   divergent. Worth its own W-id.
3. **crosshatch and spiral mappers on the plane** were not sampled here (the brief's cells are hatch and
   contour). The implementer should spot-check `plane__crosshatch__ladder__med` before/after; the grant is
   carrier-only (`if (i > 0) return`), so family B should be unaffected, but confirm rather than assume.

---

## 11. Reproduction

```
SCR=/private/tmp/claude-501/-Users-jayphi-Documents-github-vectura-studio/<session>/scratchpad/w15c
git -C .claude/worktrees/fill-audit archive 6d6b1b78 | tar -x -C "$SCR"
ln -s <worktree>/node_modules "$SCR/node_modules"
# apply §3.2 (a)(b)(c) to "$SCR/src/core/algorithms/scene3d.js"
cd "$SCR" && npx vitest run tests/unit/scene3d --reporter=basic
cd "$SCR" && npx vitest run tests/integration --reporter=basic
cd "$SCR" && npx vitest run tests/visual --reporter=basic
```

The instrumented dump hook used for §1.2 and §2.1 was a temporary `window.__W15C_DUMP` call inside
`plan.forEach` in the scratch copy only. It is **not** part of the proposed change and must not be committed.
