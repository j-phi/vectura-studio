# Round 9 submission — shadow anatomy

Branch `shadow-anatomy`, worktree `.claude/worktrees/agent-a71c6348dd322a40a`.
Base `75b97a5` (Round 8 HEAD, ACCEPTED at 35 / 4 / 4). **Not merged to `3d-scene/p4`.**

Commits, in order:

| sha | subject |
|---|---|
| `ad73640` | the shadow-anatomy fixture moves into the repo, and the cast-shadow test stops restating it |
| `33ac242` | a facet's pitch is measured perpendicular on paper, per family — the `+X` sliver stops flooding (C15, O20) |
| `033c540` | O6's proposed fix is disproved by measurement, and the four-fixture ladder is pinned on the shared fixture |
| `de9a14a` | the dihedral gate becomes one exported predicate, and the measurement harness moves into the repo |
| `2fbe105` | O20's ordering clause is pinned on both cube fixtures, and its lit-face clause is pinned unmet |

**Every number below is worst-of-four or all-of-set. Nothing is quoted from the
one fixture that flattered it.**

---

## 1. P0 #1 — the `+X` sliver flood. LANDED.

### The diagnosis is not the one the review gave, and the review's own is disproved

The review's diagnosis was *"the faceted fill has no projected-pitch cap on a
foreshortened facet"* and *"the composed budget is being bypassed 3.7×"*.
Intercepting `Regions.formZone` and `crossFamilies` on the live call path
(`scripts/shadow-anatomy/r9zone.js`, and a temporary probe inside
`crossFamilies`) shows something more specific:

```
[R9] face face:+X  zone F  spacing 1.9799  compress 0.8480  baseAngle 0.00
[R9]   famA angle  0.00  spacing  2.3346  crossW 0.2
[R9]   famB angle 65.00  spacing 11.6732  w 0.2
[R9] face face:+Z  zone F  spacing 1.9799  compress 0.8480  baseAngle 0.00
[R9]   famA angle  0.00  spacing  2.3346  crossW 0.2
[R9]   famB angle 65.00  spacing 11.6731  w 0.2
```

**`+X` and `+Z` receive an identical fill recipe to four decimal places**, and the
faceted fill *does* have a foreshortening compensation. The budget is not bypassed
— the budget never sees the problem, because two things downstream of it are wrong:

1. **`uvCompression` measured the wrong quantity.** It returned `|M·a|`, the
   length of one unit *across* the rulings under the uv→screen map. The pitch on
   paper is the *perpendicular* distance between adjacent rulings after the map,
   which is `|det M| / |M·d|`. The two agree only when the map has no shear.
2. **Family B was compensated with family A's factor**, then scaled in the plane.

Measured, on the two faces:

| | old measure `\|M·a\|` | TRUE perpendicular | error |
|---|---|---|---|
| `+X` family A | 0.8480 | **0.1650** | 5.1× under-spaced |
| `+X` family B | 0.1523 | **0.0893** | (A's factor used ⇒ 1.7× more) |
| `+Z` family A | 0.8480 | 0.8467 | — |
| `+Z` family B | 0.9896 | 0.9858 | — |

The model then predicts the observed coverage exactly: `+Z` = 0.153 + 0.026 =
**0.178** against 0.179 measured; `+X` = 0.779 + 0.288 = **1.067** against 1.046
measured. That is the confirmation, not the argument.

**It is the workstream's signature bug for the fourth time — a cap stated on a
proxy one transform away from the metric — and the plot floor rode on the same
proxy, which is why the floor never bound.**

### Before / after

Per-facet D, harness raster (`facets.js`), all three band counts:

| `R2-cube` | bands 2 | bands 3 | bands 4 |
|---|---|---|---|
| `+X` | 0.841 → **0.153** | 0.867 → **0.157** | 0.891 → **0.161** |
| `+Z` | 0.173 → 0.176 | 0.179 → 0.183 | 0.186 → 0.190 |
| `+Y` (the zone-M control) | 0.020 → 0.017 | 0.027 → 0.024 | 0.024 → 0.021 |
| **O20 ordering** | OUT OF ORDER → **in order** | OUT OF ORDER → **in order** | OUT OF ORDER → **in order** |

- **C15** — the ≥ 0.90 clause and the ≥ 0.80 clause are both clear at every band
  count. The breach is gone. The other 14 cast-shadow criteria were never touched.
- **O20 (ordering)** — `NO — OUT OF ORDER` → `YES` on `R2-cube` at bands 2, 3, 4.
- **the object ceiling** — the 3.7× bypass is gone; the face now sits at 0.161.
- **O21** — 1.48× / 1.43× / 1.57× → **1.66× / 1.65× / 1.66×** on
  `R-lp-bands4` / `W-lp-bands4` / `W-lp-sun45`.
- **O23** — `R-lp-bands4` 0.78× → **0.42×** (still `n=1`, still UNMEASURED by the
  instrument's own bar). `W-lp` 0.43× → **0.51×** — moved the wrong way, still
  inside 0.60, still `n=2`.

### RGR

`tests/unit/scene3d-projected-pitch.test.js`. Measures **projected coverage** —
ink inside a facet's projected polygon, widened by the pen, over that polygon's
area — which tracks the harness's rasterised D (`+Z` 0.179 / D 0.186; `+X` 1.046 /
D 0.891) and needs no rasteriser. RED-proved in a detached worktree at `75b97a5`:
**7 of 17 fail**, including all three `R2-cube` ordering tests and
`face:+X coverage 1.046` against the protected `max(object) ≤ 0.56`.

### Seen, not only measured

`r8all/CROP-cube-BEFORE-r8.png` vs `r9all/CROP-cube-AFTER-r9.png` (4×, both
faces). Before: the right edge is a solid black stripe that reads as a drawn
border. After: it carries a legible sparse hatch continuous with the form-shadow
face beside it. Also cropped at 8×: `CROP-plusX-BEFORE-r8.png` /
`CROP-plusX-AFTER-r9.png`.

---

## 2. P0 #2 — O6. NOT LANDED, AND THE RULING'S LEVER IS DISPROVED.

The review ruled: *"the spec keeps its 0.10 and the implementation moves — but NOT
by changing the ceiling law. The fix is a floor on the L zone only"*, and *"cannot
touch `max(object)`"*.

**The arithmetic in the ruling is right. The lever is not.** Measured one lever at
a time, four fixtures, boolean-grid D:

| | E-bands4 | V-E-sun45 | W-bigball | W-sun45 |
|---|---|---|---|---|
| baseline | 0.069 | **0.068** | 0.076 | 0.086 |
| L's composed ceiling **removed entirely** | 0.075 | **0.076** | 0.077 | 0.087 |
| `LIT_MAX_PITCH_PEN` 12 → 10 | 0.069 | 0.068 | 0.076 | 0.086 |
| `LIT_MAX_PITCH_PEN` 12 → 8 | 0.069 | 0.068 | 0.076 | 0.086 |
| L ceiling floored at 0.16 | 0.075 | 0.076 | 0.077 | 0.087 |
| … **and** L's specular damping removed | 0.100 | **0.095** | 0.099 | 0.106 |

- **Removing L's ceiling outright buys +0.007.** The ceiling is not the binder.
- **`LIT_MAX_PITCH_PEN` is dead at 12, at 10 and at 8.** Restating it as a pitch of
  any size changes nothing, because `raw × GLINT_KEEP` = 0.42 × 0.6 = 0.252
  dominates it at every value. (And the review's *"already yields a D floor of
  ~0.198"* does not hold: a family at 12 × pen has a dark fraction of 1/12 =
  **0.083**. §5.4 #1 and O6's 0.10 contradict each other by 20 % as written.)
- **The only lever that reaches 0.10 spends the step above it.** `L/M` goes
  0.52–0.72 → 0.73–0.92.

**And the ladder is fully constrained.** Reopening the step by raising M takes
`F/M` from 1.53–1.66 to ~1.20, through the protected `[1.45, 1.70]`. Raising F to
compensate walks `max(object)` at the T end toward the protected 0.56, whose
worst-of-four margin is 3.8 %. **O6 at 0.10 cannot be bought without breaking a
protected item. This needs a spec ruling — lower O6, widen `F/M`, or raise 0.56 —
not an implementation.**

So no tone moved. What landed is the measurement: `scene3d-form-ladder.test.js`
now reads all **four** harness fixtures (it restated a fifth), ratchets O6 at what
it measures, pins `L ≤ 0.75 × M` **before** anyone spends it, and asserts
`max(object) ≤ 0.56` **per fixture**.

### A defect the P0 fix exposes rather than causes

On the `scene3d-generate` cube (40 mm, density 55) the LIT face asks for a
**24.0 mm** surface pitch and draws nothing — before this change and after it.
That is O6 on the faceted path. Reported, not absorbed.

---

## 3. The regression I did not report last round

`max(object)` is **0.537 / 0.508 / 0.498 / 0.539**, **worst of four = 0.539**,
unmoved by this round (the curved path is untouched). Round 8 reported
`0.529 → 0.498` — one fixture of four, the only one that improved, while
worst-of-four went 0.531 → 0.539. **The ruling is accepted without qualification**
and the number is now asserted four times in the suite rather than quoted once in
a document.

---

## 4. Protected list — intact

Run at HEAD through `r8audit-protected.js`, which now carries a mutation check:

```
A-off  cast 16109.77mm/535p OK
A-2    cast  7840.20mm/428p OK   Z0 1318.44/211  Z2 6521.76/217
A-3    cast  8896.92mm/835p OK   Z0 1318.44/211  Z1 1776.09/355  Z2 5802.40/269
A-4    cast  7448.60mm/1199p OK  Z0 1318.44/211  Z1 1750.32/348  Z2 3735.33/239  Z3 644.51/401

[mutation check] wrong-field read finds 0.00 mm (must be 0);
                 correct-field read finds 1199 cast paths (must be > 0) — PASS
PROTECTED LIST: intact.
```

- `shadow-additive-default.json` `castShadow` = **191 paths / 4248.7242**,
  byte-identical.
- **Across all 120 views, zero views' cast-shadow ink moved** — not merely the
  four the protected list names.
- Curved ladder unchanged to the digit: T/F **1.713–1.867**, F/M **1.555–1.661**,
  R/F 0.280–0.401, D(L) 0.072–0.092.
- O17 unchanged: p10 65 · median 65 · p90 65 · max 70 · ≥ 80°: **0 (0 %)**.

---

## 5. The full 120-view render — the round's owed evidence

Rendered at **`75b97a5`** (in a temporary detached worktree, since removed) and at
**HEAD**, both through the shared fixture.

- **43 views BYTE-STABLE** — every curved-only view: all `E-*`, `W-bigball-*`,
  `V-E-*`, `Hp-ball-*`, `P-density*`, `Q-*`, `K-*`, `N-*`.
- **77 views moved, and EVERY ONE MOVED DOWN IN INK.** Not one view gained ink —
  the signature of a de-flooding correction, and not of an accidental darkening.
- **0 views whose cast-shadow ink moved.**

Largest movers are exactly the fixtures with a strongly foreshortened facet:
`R2-cube` −28…−29 %, the low-poly family −17…−18 %, `W-lp` −17 %, the cube-only
H/I/J/L views −5…−10 %, the trio views −2…−4 %, and the A/U/V views (a ball plus
an upright box) −0.2…−0.8 %, which is the box's three faces and nothing else.

Goldens: **14 move** — every `box-*` toned golden, `parity-box-and-sphere`,
`shadow-additive-default`, `shadow-inverse`. **Zero `sphere-*`, and
`box-tone-off` byte-identical.**

---

## 6. Instrument repairs — all four, plus the contract

| review item | state |
|---|---|
| `facets.js` must **read** `TERMINATOR_SMOOTH_DEG` / `smoothShadedFaces`, not mirror them | **done.** Moved to `Regions.smoothShadedFaces(faces, edges, deg)`; renderer and instrument both call it, on the renderer's own `record.edges`. Identical output verified. RGR: a test that widens the gate to 95° and requires a cube's six faces to become smooth-shaded — it only passes if the argument is live. |
| lift the A-view fixture into a module `render.js` and `tests/` both import | **done.** `tests/fixtures/scene3d-shadow-anatomy.js`, 120 views. `cmp`-identical SVGs, and the cast-shadow test passes on unchanged protected numbers. The ladder test was found restating a **fifth** fixture and moved too. |
| `r7audit-protected.js` prints `cast 0.00mm/0p` | **done.** The correct script now carries a **mutation check** and refuses to print unless a deliberately-wrong field read finds zero. |
| the reviewer's probes get a mutation check before quoting | **done**, as above, and written into `criteria.md` as a standing rule. |
| restore the contract documents | **done.** `docs/shadow-anatomy/criteria.md` reconstructs C1–C15 and O1–O28 with a provenance tag on every line. The harness itself is now in the repo at `scripts/shadow-anatomy/`. |

---

## 7. What did NOT land, and why

| item | why |
|---|---|
| **O6** | shown to require breaking a protected item; needs a spec ruling (§2). Ratcheted, not tuned. |
| **O20's lit-face clause** | not bought. `R-cube` projected coverage 0.034/0.017/0.035 → 0.027/0.019/0.036 (bands 2/3/4) against a 0.03 bar. Pinned unmet at 0.015. **And the two instruments disagree by more than the margin** — raster D reads 0.021/0.005/0.030 → 0.027/0.021/0.025, agreeing on bands 2 and 3 and disagreeing on bands 4. A 0.03 bar cannot be adjudicated by two instruments that differ by 0.01 on the same drawing. |
| **O5 / O8 and the missing area instrument** | not attempted. Declared, not smuggled. Third round owed. |
| **O23 by visibility** | not attempted. The diagnosis in the review is accepted — the ring is culled, so it needs a camera or object change, not a bigger fixture. The number improved anyway on `R-lp-bands4` (0.78× → 0.42×) as a side effect of §1. |
| **O26 instrument** | not built. |
| **O28 measured** | not measured. Fourth round owed; downgrade it. |
| **density stops** | gated on O6, which did not move. |
| **C1/C2 at pen ≥ 0.5** | not measured. |
| **live verification** | still blocked. **No object criterion in this round was seen in the running app** — only in rendered SVG crops. Fifth round. |
| `cast.js` confirmed gone | confirmed: not present anywhere in the tree. |

## 8. A latent defect found and left alone

`faceLightDrivenLines` (`scene3d.js`, the `highlightMode: 'lightDriven'` path)
generates its fill in the uv plane and applies **no foreshortening compensation at
all** — not the old wrong one, none. It is the same class of defect as §1 on a
different code path. It is not fixed here because no fixture in the harness scores
a criterion on it, and changing it blind is how a round acquires a silent
regression. Recorded so the next round can fixture it first.
