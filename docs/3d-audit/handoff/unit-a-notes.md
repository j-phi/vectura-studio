# Unit A — F1B residual streaks — NOT FIXED, stopped and reported

**Root cause (2 sentences).** The streaks are not a fill gap: raw `SurfaceFill.buildObject`
output is fully inked at every measured streak location (nearest raw ink ~0.01-0.04mm), but
`hlr.js`'s self-occlusion clip (F7) then removes it as a **false positive** — confirmed against
`scene3d-torus-hole-oracle.js`'s independent ground truth, which finds no genuine near/far overlap
there at all. One real contributor was found and fixed in-scope (`zAlongRun`'s nearest-centreline-
segment search picking the wrong pass of a self-crossing loop; a windowed/coherent search cut
false-positive clip events 11→1 at the two locations checked) but it only reaches WITHIN-run
self-crossings; most of these five laws' "wide" stretches are separate runs crossing each other in
screen space (CROSS-run), which `zAlongRun` cannot reach and which needs `hlr.js`/`scene3d.js`
changes — out of this unit's scope, so it was reverted (see stop condition below).

**Before/after mm² (uncovered ring interior, torus, all measured on untouched `d5af9e30` — no
code change landed, so before = after):**
| law | measured |
|---|---|
| interlockWeave | 2.01 |
| onePenDown | 2.00 |
| trochoidLoop | 1.49 |
| ampSpacing | 1.24 |
| weaveDepth | 0.87 |

**What was tried and failed:** (1) hole-boundary companion stroke — <1% change; (2) fill-erosion
depth fallback ladder (verified it prevents the measured 1→7/1→11 polygon fragmentation) — <1%
change; (3) `PenFill.MAX_REPAIR_ROUNDS` 4→16 — zero change. All reverted; only the zAlongRun fix
was proven correct but is insufficient alone and was also reverted (no half-fix).

**Stop condition triggered:** "cannot get all five laws under the 0.18mm² band" and "the fix would
need to touch hlr.js, scene.js or algorithms/scene3d.js" (cross-run occlusion decision).
