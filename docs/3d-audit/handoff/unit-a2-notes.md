# Unit A2 — F1 residual streaks — self-occlusion REWRITTEN, streaks NOT FIXED (stop + report)

**What landed.** `Scene3D.TorusOcclusion` (`src/core/scene3d/torus-occlusion.js`) was rewritten from a
per-sample dilated-ray test to a dense analytic near/far FIELD (same method as the F7 oracle:
`tests/helpers/scene3d-torus-hole-oracle.js`), and `hlr.js`'s `hiddenAt` now treats that field as
AUTHORITATIVE for same-object occlusion — the coarse mesh-chording fallback (`SELF_OCCLUDE_BIAS`) is
skipped wherever the analytic field exists, closing the class of false positive the field's own
header describes (a dilated ray landing on an unrelated, much-nearer patch near the foreshortened
inner-hole cusp). F7 stays 0/0 survivors (`taperedEnds`/`weightSmoothstep`); `isConvexObject`/convex
primitives untouched; imported meshes untouched (no `analyticOccluder` ⇒ old mesh test, byte-identical).
`scene3d-hlr-spatial-index-identity` moved on 2 torus rows (re-pinned, justified in the test file).

**Root-cause redirect (measured, not guessed).** Built a control test reverting to pre-F7
(`57e86f48`, self-occlusion absent entirely, `selfOccludedSegs=0`) and compared `ringNotInkMm2` against
the current tree for all five laws:

| law | pre-F7 (no self-occlusion) | current (A2 field fix) | F1B baseline (`d5af9e30`) |
|---|---|---|---|
| interlockWeave | 2.086875 | 2.05875 | 2.01 |
| onePenDown | 2.126250 | 1.996875 | 2.00 |
| trochoidLoop | 1.586250 | 1.71 | 1.49 |
| ampSpacing | 1.231875 | 1.231875 | 1.24 |
| weaveDepth | 0.860625 | 0.888750 | 0.87 |

All three columns are statistically the same (well within the run-to-run FillBoolean-fragmentation
noise — see the recurring `[FillBoolean] polygon union failed on degenerate geometry` error at the
identical coordinates on every run, from `erode()` in `surface-fill.js`). **Self-occlusion — mesh-based
or the new analytic field — is not the cause of these five numbers.** This matches Unit A's own finding
that the verified `zAlongRun` false-positive fix (11→1 clip events) "did NOT move the five mm² totals
measurably," and that two targeted erosion/fill-fragmentation fixes each moved <1%. The residual area's
real source is most likely the `PenFill`/boolean erosion ladder fragmenting `outlineMP` near the same
self-crossing loop holes (Unit A's item 2), not yet isolated to a fix. Two genuine approaches now closed
(zAlongRun windowed search; this field-based self-occlusion rewrite) without moving the metric — stop
condition met. `docs/3d-audit/handoff/unit-a2/*-after.png` + `stats.json`: all five render with
`wallRings > 0`, `degenerate: 0` (no vacuous pass), app-verified live on :8470.
