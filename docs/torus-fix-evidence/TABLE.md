# F2 — all 12 variable-width laws collapsed on a torus

Judge A measured every bucket-B (ribbon) law refusing 40-58% of its wide stretches on a torus and
shipping bare centrelines, with sphere, capsule and cylinder clean. Every refusal was `clipEmpty` or
`erodeEmpty`; `noRing` was 0 everywhere, so the ribbon RING always built and the failure was the
CLIP against the traced visible region.

## Root cause, with the number that proves it

`SurfaceFill.sampleAt` oriented every surface normal on its own:

    if (dot(nLocal, p0) < 0) nLocal = mul(nLocal, -1);   // "outward, charts centre near origin"

That is a STAR-SHAPEDNESS test, not a handedness one. `cross(dPa, dPb)` already fixes the normal up
to a single sign, and that sign is a property of the chart's parameter handedness — one constant for
the whole surface, not a per-sample decision. A torus is the first chart in `chartFor` that is not
star-shaped about the origin:

    dot(n, p) = major·cos(2πv) + minor        ->  negative for cos(2πv) < -minor/major

**Measured, factory scene, `taperedEnds`, four primitives:**

| primitive | surface samples | normals INVERTED by the heuristic |
|---|---:|---:|
| sphere | 22825 | **0** |
| capsule | 22571 | **0** |
| cylinder | 22171 | **0** |
| torus | 24779 | **6837 (27.6%)** |

So `front` flipped discontinuously across the locus `cos(2πv) = -minor/major` — at v = 0.294 and
0.705 on this fixture — and `buildRegionRings` traced that locus as two more "silhouettes":

| torus region ring | signed area (mm²) | what it actually is |
|---|---:|---|
| ring 0 | -422.77 | the normal-flip locus (not a silhouette) |
| ring 1 | -464.05 | the normal-flip locus (not a silhouette) |
| ring 2 | +1282.37 | the real outer silhouette |

`FillBoolean.nonZeroUnionByContainment` classifies by containment depth, so both spurious rings
became HOLES inside the outer one and the clip region collapsed to **399.6 mm² of 1282.4** (31%).
Independent check: **12.6% of the fill vertices the front test had itself proved on-surface fell
outside their own clip region** (sphere / capsule / cylinder: 1.1-2.0%, which is boundary noise).

## The fix

1. **`chartOrientation()`** — the handedness is decided ONCE per chart, from the sign of `∮ p·n dA`
   (the divergence theorem: +6V outward, -6V inward). Correct for any closed chart, star-shaped or
   not, and provably a no-op for every chart where the old per-sample test was already right.
2. **`resolveFoldRings()`** — a ring nested inside another is a HOLE only if it winds the other way.
   The projection preserves orientation across the front-facing set (its Jacobian sign is `nz` > 0),
   so the traced winding number IS the sheet count: a genuine hole winds opposite (0 sheets), a FOLD
   across a doubly-covered sheet winds the same way (2 sheets). Measured across camera pitch, the
   inner ring's signed area is +381.3 / +303.8 / +181.5 at pitch 2/5/10 (hole shut, fold) and
   -42.9 / -333.2 / -768.1 at pitch 20/35/70 (hole open). Containment carved in BOTH cases.

## Result — ribbons built / wide stretches (degenerate)

| law | sphere | capsule | cylinder | torus BEFORE | torus AFTER |
|---|---|---|---|---|---|
| `taperedEnds` | 16/16 (0) | 16/16 (0) | 25/25 (0) | 16/32 (16) | **18/18 (0)** |
| `ampSpacing` | 32/32 (0) | 38/38 (0) | 43/43 (0) | 44/82 (38) | **56/59 (3)** |
| `whiteBand` | 16/16 (0) | 16/16 (0) | 25/25 (0) | 25/42 (17) | **19/20 (1)** |
| `amplitudeOnly` | 21/21 (0) | 31/31 (0) | 33/33 (0) | 24/57 (33) | **44/46 (2)** |

Torus region: 3 rings / 399.6 mm² net -> **2 rings / 1239.5 mm² net inside a 1282.4 mm² silhouette**
(the hole survives as a hole). Sphere / capsule / cylinder region metrics are unchanged.

The 6 residual torus refusals of 143 are all at the two CUSPS where this fixture's barely-open hole
(42.9 mm², 34 mm x 3.8 mm) pinches shut — subject bboxes inside x 123..158, y 82..87, areas
0.007-0.55 mm² against a 0.3 mm pen. They degenerate to one centreline pass, which is what contract
C3 rule 5 requires; the counters simply book that as `clipEmpty`/`erodeEmpty`. Raising the tracer
from 72 to 144 and to 216 cells per axis does not move any of those numbers.

## Screenshots (running app, Playwright)

`before` = `git archive` of 2c9f37d6 served on :8416; `after` = this worktree on :8517. Identical
framing, same script.

- `{before,after}-torus-taperedEnds-{full,crop-hole,crop-limb}.png`
- `{before,after}-torus-ampSpacing-{full,crop-hole,crop-limb}.png`
- `{before,after}-sphere-taperedEnds-*.png` — CONTROL, **byte-identical before and after**
  (`b4f4abc281295c28eee646f481da8b57`)
- `{before,after}-torus-open-hole-*.png` — camera pitch 45, bucket-A `ladder`. Not about ribbons:
  it shows WHICH SHEET of the torus is drawn. Before, rulings stop mid-form and leave stray
  fragments; after, they wrap the donut unbroken around a clean hole.

## Reproduction

```
python3 -m http.server 8517                      # in this worktree
node docs/torus-fix-evidence/shots.mjs 8517 after
npm run test:unit -- tests/unit/scene3d-ribbon-primitives.test.js
```
