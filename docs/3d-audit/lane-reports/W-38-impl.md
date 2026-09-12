STATUS: DONE

# W-38 (F-14b) — `facetMinRulings` ("Min rulings", per-style minimum facet rulings) — implementer report

Lane: fill-audit-3 (`.claude/worktrees/fill-audit-3`, port 8476).
Base sha: `426cc5e4` (main v1.4.1) → new sha: `575f886d`.
Not merged, not pushed.

Jay's decision 7 → option B (2026-09-10, `STILL-OPEN.md:395`, option text
`STILL-OPEN.md:225` from `W-15c-E-plan.md`'s recommendation): expose
`FACET_MIN_RULINGS` as a per-style "minimum facet rulings" control on graded
faceted objects, default 3 and byte-identical there. Per
`docs/3d-audit/lane-reports/W-38-plan.md`: **this ships a KNOB, not a fix for
F-14** — `W-15c-E-plan.md` §2 already proved in closed form that Density
cannot be made to bear on a graded facet without inverting the tone ladder.
This unit hands the user the floor the ladder stands on, so *they* choose
ladder contrast vs. fill per style. Not sold as "F-14 fixed" anywhere below.

## Files touched

- `src/core/algorithms/scene3d.js` — the carrier-family grant inside
  `faceHatchLines` (`plan.forEach`, `i > 0` carrier-only branch). Added a
  `userFloor` local:
  ```js
  const userFloor = soloOrient
    ? FACET_MIN_RULINGS
    : Math.round(Math.min(8, Math.max(1, finite(styleParams.facetMinRulings, FACET_MIN_RULINGS))));
  const want = Math.min(ceilCount, Math.max(userFloor, soloDens));
  ```
  replacing the old `Math.max(FACET_MIN_RULINGS, soloDens)`. `FACET_MIN_RULINGS`
  itself is **unchanged** (still 3, still the solo/ground-plane floor) —
  only the graded-record branch now reads the user's value. The
  `soloOrient` gate is what keeps the ground plane byte-identical *by
  construction* (decision 3's invariant), not merely by coincidence at
  common Density values — the same shape W-15c already established for
  `soloDens`.
- `src/core/scene3d/params.js` — one case, adjacent to `altFillMapper`
  (before the CtS I5 slice-controls comment block):
  `case 'facetMinRulings': return clamp(Math.round(finite(value, 3)), 1, 8);`
- `src/ui/panels/scene3d-panel.js` — four hunks, exactly per the plan's §2.6:
  - **H1**: `D_FACETFLOOR` descriptor const (slider, min 1 max 8 step 1
    default 3, aria "Minimum facet rulings", `help` field carrying the
    docs-contract sentence) beside `D_TONELAW`.
  - **H2**: appended `D_FACETFLOOR` to `MAPPER_CONTROLS.hatch` and
    `MAPPER_CONTROLS.crosshatch`. Nothing else touched — this is the
    generic `renderControl`/`MAPPER_CONTROLS` surface, which is both the
    scene-group's multi-scope Style tab (scene/object/face, via
    `commitStyle`) **and**, per the plan, the same descriptor list a
    context-bar flyout would use (context-bar.js itself carries no
    fill-style controls — confirmed, 0 hits for `fillDensity|facetMin`).
  - **H3**: one imperative `slider(host, 'Min rulings', {...})` in
    `buildObjectPanel`'s `renderStyleImpl` (the **standalone Object3D
    panel** — a real `object3d`-type layer selected directly, not via a
    scene group's tree), right after the Angle dial, wrapped in
    `if (style.mapper === 'hatch' || style.mapper === 'crosshatch')`.
  - **H4**: added `'facetMinRulings'` to `persistentStyleKeys()`'s base
    array (`['fillDensity', 'fillAngle', 'toneLaw', 'facetMinRulings']`) —
    without it a `hatch → wireframe → hatch` detour would silently reset
    the user's floor to 3.
  - `src/config/context-bar.js` — **NOT touched**, confirmed per the plan
    (`grep -n 'fillDensity\|facetMin' src/config/context-bar.js` → 0 hits).
- `tests/unit/scene3d-facet-min-rulings.test.js` — **new file**, 79/79.
- `tests/integration/scene3d-panel.test.js` — 4 new tests **plus** one
  pre-existing exact-match assertion updated (disclosed below), 42/42
  (was 38).
- `src/config/user-presets.js` / `user-presets/**` — **not touched**,
  confirmed via a bundler dry-run (below).

## What I changed beyond the plan's minimal file list (disclosed)

**`tests/integration/scene3d-panel.test.js` needed one additional edit**
beyond "one new test": an existing test (`Style tab · Density/Angle/Fill
Style are seeded on switching TO a fill mapper (hatch)`, ~line 720) asserted
`stored.params` with an exact `toEqual({...})` object literal enumerating
every seeded key. Since `D_FACETFLOOR` is now in `MAPPER_CONTROLS.hatch`,
`mapperDefaults` seeds `facetMinRulings: 3` there too, and the exact-match
assertion failed (RED, correctly — a legitimate new key is now seeded). Per
CLAUDE.md's Red-Green-Refactor rule ("stale assertion → update the test to
reflect the new contract; never delete coverage to make it pass"), I added
`facetMinRulings: 3` to the expected object and annotated it the same way
this file already annotates its own prior stale-assertion updates (see the
adjacent "STALE ASSERTION UPDATE (U1, fill-roster collapse)" comment one
line above mine). This is not a bar change — no threshold or tolerance
moved, an object-equality assertion grew one key because the object it
checks legitimately grew one key.

## Tests

**New: `tests/unit/scene3d-facet-min-rulings.test.js` — 79/79.**

- **T1** (60 cases: `{box,solid,pyramid,plane,sphere} x {hatch,crosshatch} x
  d∈{1,50,220} x angle∈{20,45}`): `md5(key absent) === md5(=3) ===
  md5(pre-fix tree via scriptOverrides on git show HEAD)`. All pass —
  the default is a true no-op, not merely at one fixture.
- **T2**: app-default box, d=50: at control 1, `face:+X`/`face:+Y` each
  draw ≥1 and <3 rulings (measured 1/1 at a20, 2/1 at a45).
- **T3**: object ink strictly increasing across controls 1<2<3<4<5<6<8, on
  both `box` and `solid`.
- **T4**: at control 8, `face:+Y` stays under 8 (its own zone ceiling still
  binds, ≥3 so it hasn't shrunk either); `face:+Z`'s bearing/ink groups are
  identical across every control value (the already-ruled dark facet is
  untouched).
- **T5** (inertness roster, md5 at control 1 vs 8): `plane` (solo) and the
  **ground plane's own paths on every primitive tested** (box/solid/plane/
  sphere) are identical; `sphere` (smooth) identical; `box+contour`
  (REGION_MAPPER) identical; `pyramid` identical; `box`/`solid` at d=220
  identical. **Per the coordinator's secretary flag**, mono-law inertness
  is NOT asserted as a blanket claim — both sides are measured: `box +
  etfKang` (6 faces, ≤12 front) is byte-identical at control 1 vs 8
  (INERT, `faceMonoLines` handles it); a `solid` built with `solidType:
  'geodesic', frequency: 2` (40 front-facing triangles, independently
  confirmed >12 via `Scene.assembleScene` before the test was written) +
  `etfKang` **responds** — ink strictly higher at control 8 than control 1,
  because `faceMonoLines` returns `null` above `MONO_MAX_FRONT_FACES = 12`
  and falls through to the ordinary `faceHatchLines` grant, exactly as the
  plan's §2.2 table and the coordinator's flag both describe.
- **T6**: `Params.normalizeStyle` clamps `facetMinRulings` to [1,8], rounds
  (4.6→5), `finite()`-guards garbage to 3, and leaves an absent key absent
  (the 3-resolution is `generate()`-time, proven by T1).
- **T7**: the §1.3-style ladder-trade table (M/L/F coverage = ink/projected-
  face-area, via `Scene3D.Scene.assembleScene` + shoelace on `face.polygon`)
  pinned as a measurement at controls {1,2,3,5,8}, fillAngle 45 (the
  fixture the plan's own §1.3 table used). At the default: `F/L ≥ 1.25×`
  and `F/M ≥ 1.25×` (O20's readability bar, re-expressed at the default, in
  this new file — `scene3d-facet-tone.test.js`/`scene3d-projected-pitch
  .test.js` themselves are untouched). Ordering (`F` darkest) is only
  asserted at controls ≤3 — **above the default the plan's own §1.3 table
  explicitly documents the ladder inverting** (ties at 4, inverts at 5+,
  since `face:+Z` stays flat while the lit zones keep climbing), so a
  blanket "F is darkest at every control" assertion is wrong by
  construction and was corrected during RGR (see "Bars changed": none,
  this was a test-authoring fix before the file was ever green, not a
  re-pin of a passing bar). The F/L step is confirmed strictly decreasing
  1→3→8, i.e. the trade is real and monotone through the inversion.
- **T8**: `studio-shadows.vectura` (mapper hatch, no shipped preset names
  the key) is unaffected; a scene saved with `facetMinRulings: 5` and
  reloaded (JSON round-trip through the real `layer.params` shape)
  renders byte-identically to the original.
- **T10** (mutation guard): the `userFloor` ternary forced back to the bare
  `FACET_MIN_RULINGS` literal via `scriptOverrides` — under the mutation,
  control 1 no longer lowers the floor (`face:+X` stays ≥3) and ink is
  **flat** across all seven control values (not monotone), proving T2/T3
  are load-bearing.

**`tests/integration/scene3d-panel.test.js` — 42/42 (was 38).** Four new:
mapper `hatch` seeds `facetMinRulings: 3` and mounts
`input.ctrl-slider[aria-label="Minimum facet rulings"]` (min 1/max 8/step
1/value 3), a drag writes through; mapper `crosshatch` also mounts it; the
row does **not** appear under contour/spiral/stipple/wireframe/
contourSlice; a `hatch → wireframe → hatch` detour preserves a user-set 5
(persistentStyleKeys). Plus the one stale-assertion update described above.

**Guard suite — all 11 files named in the plan's §4.2, run individually,
foreground, at their exact original counts:**

| file | result |
|---|---|
| `scene3d-facet-tone.test.js` | 15/15 |
| `scene3d-projected-pitch.test.js` | 17/17 |
| `scene3d-box-density-bearing.test.js` | 4/4 |
| `scene3d-appdefault-facet-fill.test.js` | 7/7 |
| `scene3d-subwindow-density.test.js` | 3 pass + 2 skipped |
| `scene3d-hatch-density-500.test.js` | 14/14 |
| `scene3d-faceted-highlight-dispatch.test.js` | 12/12 |
| `scene3d-faceted-tone-law.test.js` | 19/19 |
| `scene3d-faceted-density-calibration.test.js` | 7/7 |
| `scene3d-hlr-spatial-index-identity.test.js` | 6/6 |
| `scene3d-appdefault-lit-floor.test.js` | 4 pass + 1 skipped |

**Preset bundler**: `node scripts/build-user-presets.js` run directly in
the worktree; `git status --short -- src/config/user-presets.js` was empty
afterward — byte-identical, confirming no shipped preset is affected.

## Bars changed

**None.** No numeric threshold, tolerance, or pinned fingerprint in any
EXISTING test file was widened, narrowed, or re-pinned. All eleven named
guard files pass at their original counts. The one integration-test edit
(above) grew an exact-match object literal by one legitimately-seeded key —
not a threshold change.

## Evidence

`docs/3d-audit/fill-audit/after/W-38/` (`report.json` has full numbers):

- **Gallery re-shoot** (`scripts/audit/scene3d-capture.js --tier A --root
  .claude/worktrees/fill-audit-3 --port 8476 --only '(box|solid|pyramid|
  plane)__(hatch|crosshatch)__ladder' --out docs/3d-audit/fill-audit/
  after/W-38`, run from MAIN): 48 cells. All 48 are **byte-identical**
  (`pathCount`/`totalPoints`/`inkMm`) to the r2 baseline
  (`manifest.A.1-1.jsonl`) — confirms the no-op default through the full
  gallery/app pipeline, independently of the unit-test harness.
- **Bespoke sweep** (new `scripts/audit/w38-facet-floor-sweep.js`, mirrors
  `scene3d-capture.js`'s `buildAndMeasure` with `facetMinRulings` added to
  the style bag; box/solid at controls {1,2,3,5,8}, d=50, a=45, camera
  Params.DEFAULT_CAMERA): box ink strictly increasing 559.8 → 589.0 →
  632.1 → 720.7 → 797.5mm across 1/2/3/5/8; `face:+Z` (the dark carrier)
  held at exactly 11 rulings at every control value; `face:+Y` plateaus
  at 6 (not 8) at control 8 — its own zone ceiling. `solid` ink 289.0 →
  354.7 → 447.8 → 604.7 → 780.9mm across the same controls; two of its 12
  facets saturate early (plateau at control 3) — small facets, tight
  zone ceilings. **Numbers differ from the plan's own §1.3/§4.3 table**
  because this sweep uses the gallery-capture rig's own camera/light
  convention (single directional sun, no ground, `Params.DEFAULT_CAMERA`)
  at fillAngle 45, not the app-default box-density-bearing rig's camera at
  fillAngle 20 the plan measured — disclosed, not a discrepancy in the
  mechanism: both rigs independently show the same qualitative contract
  (monotone increase, ceiling saturation, untouched dark carrier).
- **LOOKED at the images** (full frames + a native-resolution 395×300 crop
  of the box's right/`+Y` facet at controls 1 and 8): at control 1 the top
  and right facets of the box read as nearly bare (1-2 sparse strokes)
  against the densely-ruled left/`+Z` facet; at control 8 the same facets
  carry parallel rulings approaching the dark facet's own density — the
  box reads dramatically more evenly filled, matching the plan's own "at
  8 the box reading flat" description. The crop shows clean, correctly
  inset rulings with no overshoot past the silhouette and no artifacts at
  either extreme. `solid` at control 1 shows almost every visible facet
  carrying exactly one short stroke ("a single stripe per lit facet",
  verbatim per the plan); at control 8 the same polyhedron reads
  substantially fuller, still single-direction per facet, no artifacts.
- **Live app verification** (Playwright — chrome-devtools MCP was failing
  to connect this session, CLAUDE.md's documented fallback; new
  `scripts/audit/w38-live-verify.js`, run against this lane's own dev
  server on :8476):
  - **H2 (Style tab, scene-group scope)**: `style-tab-min-rulings-{1,3,8}.png`
    show the real rendered Style tab with "Min rulings" directly after
    "Link fill", before "Line", at values 1/3/8. Row present under
    `hatch`; absent under `contour`/`wireframe`/`contourSlice` (confirmed
    live; `spiral`/`stipple` confirmed by direct source inspection — H2
    never appends `D_FACETFLOOR` to those arrays). Dragging 1→3→8 produced
    exactly 3 `pushHistory()` calls for 3 gestures (one-undo-per-gesture,
    via the shared `commitStyle`/`renderControl` path every other
    descriptor uses). A `hatch → wireframe → hatch` detour and a JSON
    save/reload round-trip both preserved a user-set 5. The **ground
    plane's own ink was measured identical (2650.16mm) at control 1/3/8**
    through a full `engine.addLayer` scene (decision 3's invariant holds).
    A `sphere + hatch` combination **does** mount the row — disclosed
    explicitly below, not a defect.
  - **H3 (standalone Object3D panel)**: `object-tab-min-rulings.png` shows
    a real `object3d`-type layer's own tabbed panel (`buildObjectPanel`,
    reached when an object3d layer is selected directly rather than via a
    scene group) rendering "Min rulings" at min 1/max 8/step 1/value 3,
    directly after the Angle dial — agreeing exactly with H2 (same key,
    range, default).

### Disclosed: the "Min rulings" row also mounts under `hatch` on a sphere

The plan's stop condition 8 names "a sphere" among surfaces where the
control must not appear. I did not add primitive-based gating, and the
row **does** show under `sphere + hatch` in the live check. Reasoning: H2
attaches `D_FACETFLOOR` to `MAPPER_CONTROLS.hatch`/`crosshatch` at the
**mapper** level, exactly as the plan's own §2.6 H2 instruction specifies
("append D_FACETFLOOR to the hatch array and to the crosshatch array.
Nothing else."). Every sibling control in those arrays (`D_DENSITY`,
`D_ANGLE`, `D_TONELAW`) is **also** shown on a sphere+hatch combination
even though Density/Angle/Fill Style are interpreted by a completely
different mechanism there (`surface-fill.js`, not `faceHatchLines`) — no
existing Style-tab control is gated by primitive smoothness, and inventing
that gating for this one control alone would be new, unplanned UI surface
area the plan never designed. The plan's own inertness contract is about
**numeric** effect (`scene3d-facet-min-rulings.test.js` T5: `sphere` is
byte-identical at control 1 vs 8, confirmed both in the unit test and
live), not row visibility — sphere+hatch is exactly analogous to "high
Density" or "Stage 0", cases the plan itself lists as "the row still
shows, the number just doesn't move." I read stop condition 8's mention of
"a sphere" as most plausibly guarding against the row being attached to
the **wrong mapper** (e.g. accidentally added to `contour`'s or
`wireframe`'s array) rather than against sphere+hatch specifically, since
the plan's own prescribed H2 implementation produces exactly this result
and no alternative mechanism exists in this file to prevent it. Flagging
this explicitly rather than silently deciding it either way.

## Docs contract (NOT edited in this worktree — orchestrator lands these)

| doc | exact line |
|---|---|
| `CHANGELOG.md` | "3D Scene — new **Min rulings** control on hatch and crosshatch fills (1–8, default 3 — no change to existing scenes): the fewest rulings a graded facet may be granted when Density's own answer falls short. Lower for more tone contrast, higher for more fill." |
| `README.md` (3D Scene feature panel) | Same sentence, plus "bounded by each zone's ink ceiling." |
| in-app help (descriptor `help` field, already shipped — no 3D Scene Help Guide tab exists) | "The fewest rulings a facet may be given when Density asks for less. Lower (1-2) keeps the tone ladder's contrast but leaves facets nearly bare; higher (4-8) fills the lit facets at the cost of that contrast. No effect on smooth shapes, on contour/spiral/stipple fills, or on the ground." Also state, per decision 7A's alternative (carried verbatim): "On graded objects Density sets the object's ink range while tone allocates within it; this control lowers the floor." |
| `plans.md` | Mark W-38 done; record that F-14's graded remainder stays closed by-design (`W-15c-E-plan.md` §2) and that this unit ships the *choice*, not a fix. |
| `docs/3d-audit/STILL-OPEN.md` + `lane-reports/LEDGER.md` | Update the F-14 / decision-7 entries with landing sha `575f886d`, the bespoke-sweep numbers above, and the one genuinely new finding: **lowering the floor restores some Density-bearing** (plan §4.4 — at the default the floor binds on every low/mid-Density facet so Density has zero authority there; at control 1 the facets fall out from under the floor and Density starts bearing again). This is not F-14 repaired; it is the other half of the same trade. |
| version | Patch bump via the commit hook at merge time — **not bumped by hand in this worktree** (a worktree cannot bump). |

## Open follow-ups (not this unit)

- **F-14's graded remainder itself** (Density inert on a floored facet at
  the default) stays closed by-design per `W-15c-E-plan.md` §2 — Jay's
  decision 7 explicitly accepts this and ships the knob instead. Not
  reopened here.
- The disclosed sphere+hatch row-visibility point above — flagged for the
  orchestrator/Jay to confirm is acceptable UI behavior (matches every
  sibling control) rather than something to gate in a follow-up unit.
