STATUS: MEASURED — SRC-UNIT

# W-07b scout — is `deepFillTSP`'s round-1 finding still true, and is it a unit?

Role: Sonnet, READ-ONLY scout. Base sha: `6ebc76e8` (v1.4.3), exported to a scratch tree —
`/private/tmp/claude-501/scratch-W-07b` (deleted at hand-back). No worktree, no MAIN `src/`/`tests/`
touched. One local instrumentation hook was added **only in the scratch copy** of
`src/core/scene3d/surface-fill.js` (a `W07B_LOG` array + `__w07bLogStart`/`__w07bLogStop` on the
`SurfaceFill` export, logging `{ri, s, I, x, y}` at the one `addPt(...)` call inside `emitLineOnce`'s
per-sample tone loop) so the measurement below can bucket real emitted ink by the sample's own radiance
`I`, exactly the way this file's own `mkTick` test already buckets by `byThird` (`Math.floor(clamp(I,0,1)*3)`,
third 0 = darkest). It changes no drawn geometry (no-op unless a log is armed) and does not exist in MAIN
or any worktree.

## The row, as filed in round 1

*"W-07 deepFillTSP (912f8471): low≠med now, but the visual effect at med is ~2% ink change. The promised
half-pitch zig-zag traverse is not delivered. The test does not implement the worklist oracle (shadow-third
coverage ≥ Ladder; no segment > 3×masterPitch). REOPEN as W-07b with that oracle."* Since round 1 the law
was rewritten (`surface-fill.js` comment block at :4075–4127, "the previous round's `deepFillTSP` displaced
points ON SCREEN…"). **This scout's finding: the rewrite is real (a genuine triangle-wave traverse now
exists) but the oracle still fails, on both of its clauses, on every cell measured.**

## S1 — Q1 table: shadow-third coverage and segment/pitch, both rigs, sphere/torus/cone, med & max

**Fixture (every row):** mapper `hatch`, `fillAngle: 45`, camera `DEFAULT_CAMERA` (angle "a"), sun
`{azimuth:135, elevation:45, intensity:1, castShadows:false}`, ground/backdrop off, `BOUNDS = {width:1200,
height:1000, m:20, dW:1160, dH:960, penWidth:0.3}` — identical to `scene3d-mark-laws-draw.test.js`'s own
fixture. **"Shadow third" = samples with radiance `I ∈ [0, 1/3)`** (third 0 of the file's own
`Math.floor(clamp(I,0,1)*3)` convention at surface-fill.js:6953). **"Coverage" is measured empirically as
drawn ink length (mm) whose owning sample falls in that third** — not the internal `algoCoverage()` scalar,
which for `ladder` is a context-free flat `1` (isEvenLadder, surface-fill.js:5259) and would make the
comparison vacuous; this is the same operational choice the file's existing F-05/F-07 findings already use
("coverage in the shadow third ≥ 3× the lit third", measured by mark count/length, not the internal function).
**No ground-plane ink is included anywhere in this report — ground was disabled on every fixture.**

| primitive | density | rig | ladder shadow ink (mm) | deepFillTSP shadow ink (mm) | **ratio (tsp/ladder)** | ladder paths | tsp paths | masterPitch (mm) |
|---|---|---|---|---|---|---|---|---|
| sphere | med(50) | addLayer | 512.3 | 190.9 | **0.373** | 92 | 79 | 1.501 |
| sphere | med(50) | create | 835.9 | 331.1 | **0.396** | 146 | 131 | 0.997* |
| sphere | max(220) | addLayer | 2205.3 | 648.3 | **0.294** | 166 | 102 | 0.350 |
| sphere | max(220) | create | 3432.5 | 1013.2 | **0.295** | 237 | 157 | 0.500* |
| torus | med(50) | addLayer | 424.8 | 214.7 | **0.506** | 78 | 73 | 1.501 |
| torus | med(50) | create | 203.7 | 80.8 | **0.397** | 120 | 117 | 0.997* |
| torus | max(220) | addLayer | 1788.8 | 565.8 | **0.316** | 122 | 85 | 0.256 |
| torus | max(220) | create | 847.0 | 297.7 | **0.352** | 140 | 124 | 0.379* |
| cone | med(50) | addLayer | 383.1 | 178.8 | **0.467** | 94 | 83 | 1.501 |
| cone | med(50) | create | 429.7 | 201.4 | **0.469** | 133 | 120 | 0.997* |
| cone | max(220) | addLayer | 1642.0 | 556.2 | **0.339** | 160 | 101 | 0.263 |
| cone | max(220) | create | 1818.2 | 631.2 | **0.347** | 200 | 141 | 0.379* |

*(masterPitch differs per rig because `create` seeds a different object scale via
`PRIMITIVE_CREATE_DEFAULTS`, not because either render is wrong.)*

**Verdict on the coverage clause: FAIL on 12/12 measured cells, decisively and consistently** —
`deepFillTSP` delivers only **29%–51%** of Ladder's shadow-third ink, never within reach of "≥ Ladder's".
The ratio is worst at `max` density (0.29–0.35) and least-bad at `med` (0.37–0.51); it never crosses 1.

**Segment/pitch clause, same fixture** — measured two ways because the naive "longest segment in the final
emitted path" is contaminated by the sink's own gap-bridging (`BRIDGE_PEN = 12`, i.e. `3.6mm` at this
pen width — surface-fill.js:361/5798), which both `ladder` and `deepFillTSP` incur identically and which
is unrelated to the traverse. The clean measurement is the **longest same-ruling, contiguous-sample hop**
(from the instrumentation log, `b.s === a.s + 1`), which is the actual forward-marching step the traverse
rides on:

| primitive/density | ladder max hop ÷ pitch | deepFillTSP max hop ÷ pitch |
|---|---|---|
| sphere med | 2.08 | 2.06 |
| sphere max | 8.91 | 8.91 |
| torus med | 2.71 | 2.71 |
| torus max | 11.71 | 11.71 |
| cone med | 1.91 | 1.89 |
| cone max | 8.07 | 8.07 |

**These numbers are identical (to <0.5%) between `ladder` and `deepFillTSP` in every cell** — the
forward-sample step is dictated by `nSteps` (≈220, geometry-fixed) against a `masterPitch` that shrinks
with density, and it is the SAME for both laws because `tspAt`'s lateral amplitude (bounded to
`≤ 1.5×localPitch`, surface-fill.js:9601) is too small relative to the forward step to move this number.
**Reading it literally and context-free, "no segment > 3×masterPitch" also fails at `max` density — for
BOTH laws, identically** — so this is a pre-existing whole-family sampling/pitch-ratio property, not
something `deepFillTSP` uniquely introduces. **Read as "does the traverse add segments longer than
Ladder's own baseline" (the sense that matters for W-07b specifically), it passes — `deepFillTSP` never
measures worse than `ladder` here.**

## S2 — Q2: is the traverse delivered?

**Yes, structurally.** `tspAt` (surface-fill.js:9578–9613) computes a genuine triangle wave
(`(2/Math.PI)*Math.asin(Math.sin(ph))`, not a sine — the file's own comment: "constant lateral speed is
what makes the traverse fill its gap evenly"), phase-offset per ruling by the golden ratio, amplitude
bounded by `endMM[s]/2` and `1.5×localPitch`. The existing test
(`scene3d-mark-laws-draw.test.js:640–661`, "the traverse displaces points off the ruling…") already proves
lateral deviation `> 0.15mm` exists at med density and passes on this tree.

**But it under-fills, visibly.** Native-resolution crops of the darkest quadrant, captured fresh this scout
(rig `addLayer`, `docs/3d-audit/fill-audit/after/W-07b/scout/shots/B/*__addlayer.webp`, crops at
`docs/3d-audit/fill-audit/after/W-07b/scout/crops/`):

- `sphere__hatch__ladder__med__a__addlayer__shadowcrop.png` — a dense fan of ~13–14 closely-spaced parallel
  arcs, near edge-to-edge coverage of the crop.
- `sphere__hatch__deepFillTSP__med__a__addlayer__shadowcrop.png` — the SAME region shows only ~6–7 rulings,
  each genuinely zig-zagging (confirming the traverse is real), but with wide dark gaps between rulings
  that the zig-zag's own amplitude visibly does not reach across. It reads distinctly LIGHTER than Ladder,
  not equal or darker.
- Same pattern, less pronounced, on `torus__hatch__{ladder,deepFillTSP}__med__a__addlayer__shadowcrop.png`.

This is the numeric S1 finding, confirmed by eye: **the traverse is a real mechanism that does not deliver
the ink parity its own mechanism text promises** ("achieving an effective pitch of half the ruled pitch
without adding a ruling" — measured effective density is nowhere close to half; it is 2–3.4× SPARSER).

## S3 — Q3: reachability

`deepFillTSP` **is selectable in the picker** — it is in `PICKER_IDS`
(`src/config/scene3d-tone-laws.js:878`) and in the engine's full `IDS` vocabulary (`:47`). Per
`SCENE_FILL_STYLES.isReachableOn` (`src/config/context-bar.js:585–623`):

- **Unreachable** on `none`/`wireframe`/`contourSlice` (any primitive) — those three mappers never
  dispatch the tone-law machinery at all (`context-bar.js:604–609`, fs-e2/W-02, applies to every law
  including the shipped default, not deepFillTSP-specific).
- **Unreachable** on faceted primitives (`box`, `plane`, `solid`) — `deepFillTSP` is not in
  `SurfaceFillMono`'s `LAW_SET` (`src/core/scene3d/surface-fill-mono.js:97–98`), so the faceted branch
  (`context-bar.js:610–619`, `if (!M.isMono(id)) return false;`) excludes it unconditionally.
- **Unreachable** on curved `spiral`/`stipple` — explicitly listed in `CURVED_SPIRAL_STIPPLE_INERT`
  (`context-bar.js:561`, C-13 cluster: "rung-skipping, indistinguishable from Ladder/Fine Ladder here"),
  gated at `context-bar.js:623`.
- **Reachable** on the 9 non-faceted (curved/chart-wrapped) primitives × `hatch`/`crosshatch`/`contour`.

So it is user-reachable, on a real (if narrow) slice of the roster: 3 of 8 mappers, all non-faceted
primitives. It is not "unreachable" in the DEPRIORITISE sense.

## S4 — Q4: guard gap

`tests/unit/scene3d-mark-laws-draw.test.js:622–671` (the `W-07` describe block) is the **only** test
touching `deepFillTSP`'s tone behaviour. It asserts three things, none of them the worklist oracle:

1. `:634–638` — `low` and `med` renders are not `toBeCloseTo` each other (byte/value inequality only).
2. `:640–661` — some point's max lateral chord-deviation exceeds `0.15mm` at med density (existence of
   *any* deviation, not a coverage or segment bound).
3. `:663–670` — a 2s perf ceiling on torus at d=220.

**Grepped the whole tree** (`grep -rln deepFillTSP tests/` → 8 files) for `masterPitch`/`shadowThird`/
`byThird` co-occurring with `deepFillTSP`: only `scene3d-mark-laws-draw.test.js` matches, and its
`masterPitch`/`byThird` uses belong to the **other** two laws in that shared file (`mkDashRamp`'s W-06 and
`mkTick`'s W-05 blocks), not to the W-07 block. **The gap is total: zero existing coverage of either half
of the worklist oracle** (`worklist.json:96`: "shadow-third coverage ≥ Ladder's, no segment > 3·masterPitch,
lit-third byte-identical to Ladder"). A third, previously-unstated clause is also unguarded and also fails:
**"lit-third byte-identical to Ladder" does not hold** — measured lit-third ink differs between the two laws
on every cell (e.g. sphere/med/addLayer: ladder 71.9mm vs deepFillTSP 56.9mm), because outside the TSP ramp
(`I ≥ TSP_I = 0.18`, `surface-fill.js:1897`) `deepFillTSP`'s coverage branch (`:5303–5310`) falls back to
`perceptualCov(I, localPitch)` — a per-sample dithered coverage — rather than the flat `1` that `ladder`
gets everywhere via `isEvenLadder` (`:5259`). This is a second, independent defect from the shadow-thinning
one, in the same function.

## S5 — sweep coverage stated

**Mappers:** of the 8 in `MAPPERS`, only 3 (`hatch`, `crosshatch`, `contour`) are reachable for this law at
all (S3); `none`/`wireframe`/`contourSlice` never reach tone-law dispatch and `spiral`/`stipple` are
pre-verified inert for this law specifically. **Measured empirically: `hatch` only (1 of 3 reachable, 1 of
8 total).** Justification for not also shooting `crosshatch`/`contour`: grepped both `algoCoverage`'s
`deepFillTSP` branch (`:5246–5311`) and `tspAt` (`:9578–9613`) for a `mapper` conditional — **none exists**;
the coverage-halving and the triangle-wave displacement are mapper-agnostic functions of `(I, localPitch,
smp)` only, so the defect is expected (not assumed) to reproduce identically on `crosshatch`/`contour`.
This is stated as an open exclusion, not verified — a follow-on unit should confirm before relying on it.
**Primitives:** `sphere`/`torus`/`cone`, all 3 named in the brief's evidence-cell list; `box`/`plane`/`solid`
excluded because unreachable (S3), not by convenience. **Densities:** `med`(50) and `max`(220), 2 of 3;
`low`(1) excluded because the existing W-07 test's own low/med inequality check is about ramp *engagement*,
not coverage, and at `d=1` the shadow region is too sparsely ruled for a shadow-third ink comparison to be
meaningful — not independently verified, logged as an exclusion. **Rigs:** both `create` and `addLayer`
measured (2 of 2). **Angles:** camera angle "a" (default) only, both for the numeric sweep and the shots;
angle "b" not captured — time-boxed exclusion, not verified.

## S6 — Verdict

**SRC UNIT — mechanism KNOWN.**

Two independent, co-located defects in `src/core/scene3d/surface-fill.js`, both inside the `deepFillTSP`
handling:

1. **Shadow under-fill (the headline defect).** `algoCoverage`'s `deepFillTSP` branch (`:5303–5310`) halves
   drawn coverage (`base / (1 + ramp)`) wherever the traverse engages, and `tspAt` (`:9578–9613`) spends
   that freed gap on a bounded lateral triangle wave — but the wave's own amplitude bound
   (`Math.min(amp, endMM[s]/2, 1.5*p)`, `:9601`) is far too small to visually or numerically compensate for
   the halved ruling COUNT (fewer rulings survive the coarser pitch — measured 79 vs 92 paths at
   sphere/med/addLayer, down to 102 vs 166 at sphere/max/addLayer). The mechanism text's own claim
   ("effective pitch of half the ruled pitch without adding a ruling") is not what the arithmetic delivers;
   measured effective density in the shadow is 2–3.4× SPARSER than Ladder's, not equal or darker.
2. **Lit-region drift (a second, smaller defect in the same branch).** Outside the ramp zone
   (`ramp <= 0`, i.e. `I ≥ 0.18`), the branch falls through to `perceptualCov(I, localPitch)` instead of
   the flat `1` every other ladder-family law gets via `isEvenLadder`. This measurably changes ink even
   where the law is supposed to be indistinguishable from Ladder (S4).

**RED proof for a follow-on unit, ready to hand off:** a new assertion
`shadowThirdInk('deepFillTSP') >= shadowThirdInk('ladder')` on sphere/hatch/med/addLayer (this scout's own
fixture) is RED today at **ratio 0.373** (want ≥ 1.0); GREEN once the halving is either removed or
compensated by a correspondingly larger amplitude/elongation. A second assertion,
`litThirdInk('deepFillTSP') ≈ litThirdInk('ladder')` (tolerance TBD by the implementer), is RED today at
**56.9mm vs 71.9mm** on the same fixture.

**Files ALLOWED for a follow-on unit:** `src/core/scene3d/surface-fill.js` (only the `deepFillTSP` branch
of `algoCoverage`, `:5303–5311`, and `tspAt`, `:9578–9613` — do not touch any other law's branch, and do
not touch `isEvenLadder`/`ladder`'s own coverage path) · `tests/unit/scene3d-mark-laws-draw.test.js` (only
the `W-07` describe block, `:622–671`, extended with the missing oracle clauses).
**Files FORBIDDEN:** every other law's coverage/placement code in the same file, `context-bar.js` (Q3's
reachability answer stands — this is not a reachability defect), any worktree, `scripts/`.

## Evidence

`docs/3d-audit/fill-audit/after/W-07b/scout/shots/B/*__addlayer.webp` (12 fresh shots: sphere/torus/cone ×
{ladder, deepFillTSP} × {med, max}, rig `addLayer`, port 8474 from the scratch export — captured with
`scripts/audit/scene3d-capture.js --tier B --root /private/tmp/claude-501/scratch-W-07b --port 8474 --rig
addLayer --only '^(sphere|torus|cone)__hatch__(ladder|deepFillTSP)__(med|max)__a$' --out
docs/3d-audit/fill-audit/after/W-07b/scout`) and native-resolution crops at
`docs/3d-audit/fill-audit/after/W-07b/scout/crops/*__shadowcrop.png` (bottom-left quadrant of each 775×776
shot). Numeric sweep raw output: 12-cell table above, generated by a scratch-only script
(`w07b-measure.js`, not published — reconstructable from this report's fixture description).

## Cleanup

Scratch tree and its instrumentation hook (`W07B_LOG`) deleted. Port 8474 dev-server process killed after
capture. Nothing written to any worktree; no `src/`/`tests/` in MAIN touched; no commit made.
